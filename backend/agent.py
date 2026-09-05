import logging
import asyncio
import json
import uuid
import time
import os
from dotenv import load_dotenv

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    AgentSession,
    Agent,
    tts,
    llm,
)
from livekit.plugins import groq, silero
from kokoro_tts import KokoroTTS

load_dotenv()

log_dir = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(log_dir, exist_ok=True)
agent_log_file = os.path.join(log_dir, "agent.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(agent_log_file),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("voice-agent")


def prewarm(proc: JobProcess) -> None:
    """Pre-warm Silero VAD, Groq LLM and Kokoro TTS ONNX models."""
    logger.info("Pre-warming Silero VAD model…")
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.1,
        min_silence_duration=0.3,
        prefix_padding_duration=0.1,
        activation_threshold=0.5,
    )
    logger.info("Pre-warming Kokoro TTS ONNX model…")
    kokoro_tts = KokoroTTS(
        voice="af_bella",
        speed=1.0,
        lang="en-us",
    )
    kokoro_tts._get_kokoro()
    proc.userdata["tts"] = kokoro_tts
    logger.info("Pre-warming complete.")


async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)
    logger.info("Connected to room: %s", ctx.room.name)

    vad: silero.VAD = ctx.proc.userdata["vad"]
    raw_tts: KokoroTTS = ctx.proc.userdata["tts"]

    # Wrap TTS in StreamAdapter to synthesize sentence-by-sentence as LLM streams tokens
    tts_adapter = tts.StreamAdapter(tts=raw_tts)
    groq_llm = groq.LLM(model="openai/gpt-oss-20b")

    session = AgentSession(
        stt=groq.STT(model="whisper-large-v3-turbo"),
        vad=vad,
        llm=groq_llm,
        tts=tts_adapter,
    )

    agent = Agent(
        instructions=(
            "You are a helpful, friendly voice and text assistant named Velo AI. "
            "Keep responses short and conversational — 1 to 3 sentences max. "
            "Do not ask multiple questions in a single response. "
            "Never output vocal fillers, hesitations, or thinking sounds like 'mmm', 'hmm', 'uh', 'um', 'let me think', or 'well'. "
            "Never use markdown, bullet points, or complex formatting — give direct clear replies."
        )
    )

    # Handle text chat data messages from frontend sharing the unified session.history
    @ctx.room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        topic = data_packet.topic
        if topic == "lk-chat-topic" or not topic:
            asyncio.create_task(handle_text_chat(data_packet))

    async def handle_text_chat(data_packet: rtc.DataPacket):
        try:
            raw = data_packet.data.decode("utf-8")
            payload = json.loads(raw)
            user_text = payload.get("message")
            if not user_text:
                return

            logger.info("Received chat message from user: %s", user_text)

            # Append user message to shared session history so Voice & Chat share context
            session.history.add_message(role="user", content=user_text)

            # Generate reply using shared conversation history
            stream = groq_llm.chat(chat_ctx=session.history)
            reply_text = ""
            async for chunk in stream:
                if chunk.delta and chunk.delta.content:
                    reply_text += chunk.delta.content

            reply_text = reply_text.strip()
            if not reply_text:
                reply_text = "I'm here to help! Could you please repeat that?"

            # Append agent response to shared session history
            session.history.add_message(role="assistant", content=reply_text)

            logger.info("Sending chat reply: %s", reply_text)

            # Publish text response back to room on lk-chat-topic
            response_payload = json.dumps(
                {
                    "id": str(uuid.uuid4()),
                    "message": reply_text,
                    "timestamp": int(time.time() * 1000),
                }
            ).encode("utf-8")

            await ctx.room.local_participant.publish_data(
                response_payload,
                topic="lk-chat-topic",
                reliable=True,
            )
        except Exception as e:
            logger.error("Error processing chat message: %s", e)

    async def _send_voice_transcript(role: str, text: str):
        try:
            payload = json.dumps({"role": role, "text": text, "source": "voice"}).encode("utf-8")
            await ctx.room.local_participant.publish_data(
                payload,
                topic="lk-voice-transcript",
                reliable=True,
            )
            logger.info("Published voice transcript [%s]: %s", role, text[:60])
        except Exception as e:
            logger.warning("Could not publish voice transcript: %s", e)

    # ── Voice transcript → chat bubble bridge ────────────────────────────────
    # Attach event listeners BEFORE session.start() so no events are missed.
    @session.on("user_input_transcribed")
    def on_user_transcript(event):
        transcript = getattr(event, "transcript", "") or ""
        is_final = getattr(event, "is_final", True)
        if transcript.strip() and is_final:
            logger.info("Voice user transcript: %s", transcript)
            asyncio.create_task(_send_voice_transcript("user", transcript.strip()))

    @session.on("conversation_item_added")
    def on_conversation_item(event):
        item = getattr(event, "item", None)
        if item is None:
            return
        role = getattr(item, "role", None)
        if role != "assistant":
            return

        text = ""
        try:
            text = item.text_content or ""
        except Exception:
            pass

        if not text:
            try:
                text = item.raw_text_content or ""
            except Exception:
                pass

        if not text and hasattr(item, "content"):
            content = getattr(item, "content", [])
            if isinstance(content, list):
                parts = []
                for c in content:
                    if isinstance(c, str):
                        parts.append(c)
                    elif hasattr(c, "text"):
                        parts.append(getattr(c, "text", ""))
                text = " ".join(parts)

        if text.strip():
            logger.info("Voice agent reply captured: %s", text)
            asyncio.create_task(_send_voice_transcript("agent", text.strip()))

    logger.info("Starting agent session…")
    await session.start(room=ctx.room, agent=agent)
    logger.info("Agent session started — sending greeting.")

    session.say("Hello! How can I help you today?")

    # Keep entrypoint alive so the agent stays in the room
    await asyncio.Event().wait()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )

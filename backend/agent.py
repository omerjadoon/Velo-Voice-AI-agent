import logging
import asyncio
from dotenv import load_dotenv
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    AgentSession,
    Agent,
    tts,
)
from livekit.plugins import groq, silero
from kokoro_tts import KokoroTTS

import os

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
    """Pre-warm Silero VAD and Kokoro TTS ONNX models."""
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

    session = AgentSession(
        stt=groq.STT(model="whisper-large-v3-turbo"),
        vad=vad,
        llm=groq.LLM(model="groq/compound-mini"),
        tts=tts_adapter,
    )

    agent = Agent(
        instructions=(
            "You are a helpful, friendly voice assistant. "
            "Keep responses short and conversational — 1 to 3 sentences max. "
            "Do not ask multiple questions in a single response. "
            "Never output vocal fillers, hesitations, or thinking sounds like 'mmm', 'hmm', 'uh', 'um', 'let me think', or 'well'. "
            "Never use markdown, bullet points, or formatting — speak naturally and jump directly into your response."
        )
    )

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

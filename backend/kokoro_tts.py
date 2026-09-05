"""
Custom LiveKit TTS adapter for Kokoro-ONNX.

Kokoro is a 100% local, open-source TTS model (82M params, ONNX runtime).
No API key needed. Runs on CPU. High quality English voices.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
from dataclasses import dataclass
from typing import Any

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro as KokoroModel

from livekit.agents import tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN, NotGivenOr

logger = logging.getLogger("kokoro-tts")

SAMPLE_RATE = 24000  # Kokoro outputs 24kHz PCM
NUM_CHANNELS = 1

# Paths to the downloaded ONNX model and voices file
DEFAULT_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "kokoro_models", "onnx", "model.onnx"
)
DEFAULT_VOICES_PATH = os.path.join(
    os.path.dirname(__file__), "kokoro_models", "voices-v1.0.bin"
)


@dataclass
class _TTSOptions:
    voice: str
    speed: float
    lang: str


class KokoroTTS(tts.TTS):
    """
    LiveKit TTS adapter for Kokoro-ONNX.
    Synthesizes speech locally — no network calls, no API key.
    """

    def __init__(
        self,
        *,
        voice: str = "af_bella",
        speed: float = 1.0,
        lang: str = "en-us",
        model_path: str = DEFAULT_MODEL_PATH,
        voices_path: str = DEFAULT_VOICES_PATH,
    ) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )
        self._opts = _TTSOptions(voice=voice, speed=speed, lang=lang)
        self._model_path = model_path
        self._voices_path = voices_path
        self._kokoro: KokoroModel | None = None
        self._lock = asyncio.Lock()

    def _get_kokoro(self) -> KokoroModel:
        """Lazy-load the Kokoro model on first use (heavy, ~330MB)."""
        if self._kokoro is None:
            logger.info("Loading Kokoro ONNX model from %s", self._model_path)
            self._kokoro = KokoroModel(self._model_path, self._voices_path)
            logger.info(
                "Kokoro loaded. Available voices: %s",
                self._kokoro.get_voices()[:5],
            )
        return self._kokoro

    def synthesize(
        self,
        text: str,
        *,
        conn_options: Any = DEFAULT_API_CONNECT_OPTIONS,
    ) -> "KokoroStream":
        return KokoroStream(
            tts=self,
            input_text=text,
            conn_options=conn_options,
        )


class KokoroStream(tts.ChunkedStream):
    def __init__(self, *, tts: KokoroTTS, input_text: str, conn_options: Any) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts: KokoroTTS = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        kokoro = self._tts._get_kokoro()
        opts = self._tts._opts

        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
            mime_type="audio/pcm",
        )

        def _generate_pcm():
            audio, _ = kokoro.create(
                text=self._input_text,
                voice=opts.voice,
                speed=opts.speed,
                lang=opts.lang,
            )
            if audio is None or len(audio) == 0:
                return b""
            return (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes()

        try:
            pcm_bytes = await asyncio.to_thread(_generate_pcm)
            if pcm_bytes:
                # Push in 20ms audio frames (960 bytes at 24kHz 16-bit mono)
                frame_size = 960
                for i in range(0, len(pcm_bytes), frame_size):
                    output_emitter.push(pcm_bytes[i:i + frame_size])
        except Exception as e:
            logger.error("Error during Kokoro TTS synthesis: %s", e)

        output_emitter.end_input()

    def _synthesize_sync(self) -> tuple[np.ndarray, int]:
        kokoro = self._tts._get_kokoro()
        opts = self._tts._opts
        audio, sr = kokoro.create(
            text=self._input_text,
            voice=opts.voice,
            speed=opts.speed,
            lang=opts.lang,
        )
        return audio, sr

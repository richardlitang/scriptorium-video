from __future__ import annotations

import os
import subprocess
import tempfile
import inspect
import threading
from pathlib import Path
from typing import Any

import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel


class NoopWatermarker:
    def apply_watermark(self, wav: Any, sample_rate: int) -> Any:
        return wav


def patch_perth_if_needed() -> None:
    import perth

    if getattr(perth, "PerthImplicitWatermarker", None) is None:
        perth.PerthImplicitWatermarker = NoopWatermarker


class SpeechRequest(BaseModel):
    model: str = "chatterbox"
    voice: str = "default"
    input: str
    response_format: str = "wav"
    audio_prompt_path: str | None = None
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    temperature: float = 0.8
    seed: int | None = None


app = FastAPI(title="Local Video Studio Chatterbox TTS")
model: Any | None = None
sample_rate = 24000
model_status = "loading"
model_error: str | None = None


def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


@app.on_event("startup")
def start_model_load() -> None:
    # Load the model off the startup path so uvicorn binds immediately and
    # /health is reachable (returning status "loading") while the weights
    # download/load. Studio's UI polls /health and enables draft actions once
    # status becomes "ready"; a blocking load would refuse connections for
    # minutes and surface as "unreachable" instead of "loading".
    threading.Thread(target=load_model, name="chatterbox-model-load", daemon=True).start()


def load_model() -> None:
    global model, sample_rate, model_status, model_error
    device = os.environ.get("CHATTERBOX_DEVICE", pick_device())
    model_name = os.environ.get("CHATTERBOX_SERVER_MODEL", "chatterbox")
    model_cache = os.environ.get("CHATTERBOX_MODEL_CACHE")
    if model_cache:
        os.environ.setdefault("HF_HOME", model_cache)
    if os.environ.get("CHATTERBOX_OFFLINE", "").lower() in {"1", "true", "yes"}:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    patch_perth_if_needed()

    try:
        if model_name == "turbo":
            from chatterbox.tts_turbo import ChatterboxTurboTTS

            model = ChatterboxTurboTTS.from_pretrained(device=device)
        else:
            from chatterbox.tts import ChatterboxTTS

            model = ChatterboxTTS.from_pretrained(device=device)

        sample_rate = int(getattr(model, "sr", sample_rate))
        model_status = "ready"
        model_error = None
        print(f"Loaded {model_name} on {device} at {sample_rate}Hz", flush=True)
    except Exception as exc:
        model = None
        model_status = "failed"
        model_error = str(exc)
        print(f"Failed to load {model_name} on {device}: {model_error}", flush=True)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": model is not None,
        "status": model_status,
        "sampleRate": sample_rate,
        "error": model_error,
    }


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest) -> Response:
    if model is None:
        raise HTTPException(status_code=503, detail="Chatterbox model is not loaded.")
    if request.response_format not in {"wav", "mp3"}:
        raise HTTPException(status_code=400, detail="Only wav and mp3 response formats are supported.")

    audio_prompt_path = request.audio_prompt_path or os.environ.get("CHATTERBOX_AUDIO_PROMPT_PATH")
    generate_kwargs: dict[str, Any] = {
        "audio_prompt_path": audio_prompt_path,
        "exaggeration": request.exaggeration,
        "cfg_weight": request.cfg_weight,
        "temperature": request.temperature,
    }
    if request.seed is not None:
        signature = inspect.signature(model.generate)
        if "seed" in signature.parameters:
            generate_kwargs["seed"] = request.seed

    wav = model.generate(request.input, **generate_kwargs)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        temp_wav = Path(handle.name)
    temp_mp3: Path | None = None
    try:
        sf.write(temp_wav, wav.squeeze().detach().cpu().numpy(), sample_rate)
        if request.response_format == "wav":
            data = temp_wav.read_bytes()
        else:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as handle:
                temp_mp3 = Path(handle.name)
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", str(temp_wav), str(temp_mp3)],
                check=True,
            )
            data = temp_mp3.read_bytes()
    finally:
        temp_wav.unlink(missing_ok=True)
        if temp_mp3:
            temp_mp3.unlink(missing_ok=True)

    if request.response_format == "wav":
        return Response(content=data, media_type="audio/wav")

    return Response(content=data, media_type="audio/mpeg")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("CHATTERBOX_PORT", "8000")))

from __future__ import annotations

import io
import os
from typing import Any

import numpy as np
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from transformers import AutoTokenizer, VitsModel


class SpeechRequest(BaseModel):
    model: str = "facebook/mms-tts-tgl"
    language: str = "tgl"
    voice: str = "default"
    input: str
    response_format: str = "wav"


app = FastAPI(title="Local Video Studio MMS TTS")
tokenizer: Any | None = None
model: Any | None = None
sample_rate = 16000
loaded_model_name = ""
model_status = "loading"
model_error: str | None = None


def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_mms_model(model_name: str, device: str) -> tuple[Any, Any, int]:
    tok = AutoTokenizer.from_pretrained(model_name)
    mdl = VitsModel.from_pretrained(model_name).to(device)
    sr = int(getattr(mdl.config, "sampling_rate", 16000))
    return tok, mdl, sr


@app.on_event("startup")
def startup() -> None:
    global tokenizer, model, sample_rate, loaded_model_name, model_status, model_error
    model_name = os.environ.get("MMS_MODEL", "facebook/mms-tts-tgl")
    device = os.environ.get("MMS_DEVICE", pick_device())
    try:
        tokenizer, model, sample_rate = load_mms_model(model_name, device)
        loaded_model_name = model_name
        model_status = "ready"
        model_error = None
        print(f"Loaded {model_name} on {device} at {sample_rate}Hz", flush=True)
    except Exception as exc:
        tokenizer = None
        model = None
        model_status = "failed"
        model_error = str(exc)
        print(f"Failed to load {model_name} on {device}: {model_error}", flush=True)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": model is not None and tokenizer is not None,
        "status": model_status,
        "sampleRate": sample_rate,
        "model": loaded_model_name,
        "error": model_error,
    }


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest) -> Response:
    global tokenizer, model, sample_rate, loaded_model_name
    if request.response_format != "wav":
        raise HTTPException(status_code=400, detail="Only wav response format is supported.")
    if not request.input.strip():
        raise HTTPException(status_code=400, detail="Input text is required.")

    if request.model and request.model != loaded_model_name:
        # Lazy-switch model for experimentation without process restart.
        device = os.environ.get("MMS_DEVICE", pick_device())
        tokenizer, model, sample_rate = load_mms_model(request.model, device)
        loaded_model_name = request.model

    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="MMS model is not loaded.")

    inputs = tokenizer(request.input, return_tensors="pt")
    device = model.device
    for key, value in inputs.items():
        inputs[key] = value.to(device)

    with torch.no_grad():
        output = model(**inputs).waveform
    wav = output.squeeze().detach().cpu().numpy().astype(np.float32)

    with io.BytesIO() as buffer:
        sf.write(buffer, wav, sample_rate, format="WAV")
        data = buffer.getvalue()

    return Response(content=data, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("MMS_PORT", "8001")))

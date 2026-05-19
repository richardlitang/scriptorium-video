import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

const DEFAULT_CHATTERBOX_URL = "http://127.0.0.1:8000/v1/audio/speech";

const voices: TTSVoice[] = [
  {
    id: "default",
    label: "Chatterbox Default",
    language: "en",
    gender: "neutral",
    supportsEmotion: true
  },
  {
    id: "clone",
    label: "Chatterbox Voice Clone",
    language: "en",
    gender: "neutral",
    supportsEmotion: true
  }
];

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

function chatterboxUrl(): string {
  return process.env.CHATTERBOX_TTS_URL ?? DEFAULT_CHATTERBOX_URL;
}

function chatterboxStartupHint(url: string): string {
  return [
    `Chatterbox TTS server is unreachable at ${url}.`,
    "Start it before making a draft:",
    "HF_HOME=/private/tmp/lvstudio-hf /private/tmp/lvstudio-chatterbox-venv/bin/python scripts/chatterbox_tts_server.py",
    "Or set CHATTERBOX_TTS_URL to a reachable Chatterbox-compatible speech endpoint."
  ].join(" ");
}

function providerNumber(request: TTSRequest, key: string): number | undefined {
  const value = request.providerOptions?.[key];
  if (value === undefined || value === null) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid provider option ${key}: ${String(value)}`);
  }
  return numeric;
}

function providerString(request: TTSRequest, key: string): string | undefined {
  const value = request.providerOptions?.[key];
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function buildPayload(request: TTSRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: process.env.CHATTERBOX_TTS_MODEL ?? "chatterbox",
    voice: request.voiceId || process.env.CHATTERBOX_TTS_VOICE_ID || "default",
    input: request.text,
    response_format: request.format
  };

  if (request.options?.speed !== undefined) payload.speed = request.options.speed;
  if (request.options?.language) payload.language = request.options.language;

  const audioPromptPath = providerString(request, "audio_prompt_path") ?? process.env.CHATTERBOX_AUDIO_PROMPT_PATH;
  if (audioPromptPath) payload.audio_prompt_path = audioPromptPath;

  const exaggeration = providerNumber(request, "exaggeration") ?? envNumber("CHATTERBOX_EXAGGERATION");
  if (exaggeration !== undefined) payload.exaggeration = exaggeration;

  const cfgWeight = providerNumber(request, "cfg_weight") ?? envNumber("CHATTERBOX_CFG_WEIGHT");
  if (cfgWeight !== undefined) payload.cfg_weight = cfgWeight;

  const temperature = providerNumber(request, "temperature") ?? envNumber("CHATTERBOX_TEMPERATURE");
  if (temperature !== undefined) payload.temperature = temperature;

  const seed = providerNumber(request, "seed") ?? envNumber("CHATTERBOX_SEED");
  if (seed !== undefined) payload.seed = seed;

  return payload;
}

async function readAudioResponse(response: Response): Promise<Buffer> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Buffer.from(await response.arrayBuffer());
  }

  const body = (await response.json()) as {
    audio?: string;
    b64_json?: string;
    data?: Array<{ b64_json?: string; audio?: string }>;
  };
  const encoded = body.audio ?? body.b64_json ?? body.data?.[0]?.b64_json ?? body.data?.[0]?.audio;
  if (!encoded) {
    throw new Error("Chatterbox TTS JSON response did not include audio data.");
  }
  return Buffer.from(encoded, "base64");
}

export class ChatterboxTTSProvider implements TTSProvider {
  id = "chatterbox";

  async listVoices(): Promise<TTSVoice[]> {
    return voices;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    if (!["mp3", "wav"].includes(request.format)) {
      throw new Error(`Chatterbox TTS provider supports mp3 and wav output, got ${request.format}.`);
    }

    const url = chatterboxUrl();
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (process.env.CHATTERBOX_TTS_API_KEY) {
      headers.authorization = `Bearer ${process.env.CHATTERBOX_TTS_API_KEY}`;
    }

    const payload = buildPayload(request);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new Error(chatterboxStartupHint(url), { cause: error });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Chatterbox TTS request failed: ${response.status} ${body.slice(0, 300)}`);
    }

    await mkdir(path.dirname(request.outputPath), { recursive: true });
    const bytes = await readAudioResponse(response);
    await writeFile(request.outputPath, bytes);
    const probed = await probeMedia(request.outputPath);

    return {
      audioPath: request.outputPath,
      durationSeconds: probed.durationSeconds ?? 0,
      providerId: this.id,
      voiceId: String(payload.voice ?? request.voiceId),
      inputHash: "",
      metadata: {
        url,
        model: payload.model,
        requestedVoiceId: request.voiceId,
        audioPromptPath: payload.audio_prompt_path,
        exaggeration: payload.exaggeration,
        cfgWeight: payload.cfg_weight,
        temperature: payload.temperature,
        bytes: bytes.length
      }
    };
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

const DEFAULT_CHATTERBOX_URL = "http://127.0.0.1:8000/v1/audio/speech";

export type ChatterboxRuntimeConfig = {
  speechUrl?: string;
  apiKey?: string;
  model?: string;
  voiceId?: string;
  audioPromptPath?: string;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
  seed?: number;
};

type ChatterboxDependencies = {
  fetchImpl?: typeof fetch;
  probeMediaImpl?: typeof probeMedia;
};

const voices: TTSVoice[] = [
  {
    id: "default",
    label: "Chatterbox Default",
    language: "en",
    gender: "neutral",
    supportsEmotion: true,
  },
  {
    id: "clone",
    label: "Chatterbox Voice Clone",
    language: "en",
    gender: "neutral",
    supportsEmotion: true,
  },
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

function configuredNumber(config: ChatterboxRuntimeConfig, key: keyof ChatterboxRuntimeConfig) {
  const value = config[key];
  return typeof value === "number" ? value : undefined;
}

function configuredString(config: ChatterboxRuntimeConfig, key: keyof ChatterboxRuntimeConfig) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type ChatterboxCapability = {
  available: boolean;
  status: "ready" | "loading" | "failed" | "unreachable";
  speechUrl: string;
  healthUrl: string;
  message?: string;
};

function chatterboxHealthUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/health";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function chatterboxStartupHint(url: string): string {
  return [
    `Chatterbox TTS server is unreachable at ${url}.`,
    "Start it before making a draft:",
    "CHATTERBOX_MODEL_CACHE=/private/tmp/lvstudio-hf /private/tmp/lvstudio-chatterbox-venv/bin/python scripts/chatterbox_tts_server.py",
    "Or set CHATTERBOX_TTS_URL to a reachable Chatterbox-compatible speech endpoint.",
  ].join(" ");
}

export async function checkChatterboxCapability(
  configOrFetch: ChatterboxRuntimeConfig | typeof fetch = {},
  injectedFetch?: typeof fetch,
): Promise<ChatterboxCapability> {
  const config = typeof configOrFetch === "function" ? {} : configOrFetch;
  const fetchImpl = typeof configOrFetch === "function" ? configOrFetch : (injectedFetch ?? fetch);
  const speechUrl = config.speechUrl ?? chatterboxUrl();
  const healthUrl = chatterboxHealthUrl(speechUrl);
  try {
    const response = await fetchImpl(healthUrl);
    if (!response.ok) {
      return {
        available: false,
        status: "failed",
        speechUrl,
        healthUrl,
        message: `Chatterbox health check failed: ${response.status}`,
      };
    }
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: string;
      error?: string;
    };
    if (body.ok) {
      return { available: true, status: "ready", speechUrl, healthUrl };
    }
    const status = body.status === "loading" ? "loading" : "failed";
    return {
      available: false,
      status,
      speechUrl,
      healthUrl,
      message: body.error || `Chatterbox is ${status}.`,
    };
  } catch (error) {
    return {
      available: false,
      status: "unreachable",
      speechUrl,
      healthUrl,
      message: error instanceof Error ? error.message : String(error),
    };
  }
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

export function buildPayload(
  request: TTSRequest,
  config: ChatterboxRuntimeConfig = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: configuredString(config, "model") ?? process.env.CHATTERBOX_TTS_MODEL ?? "chatterbox",
    voice:
      request.voiceId ||
      configuredString(config, "voiceId") ||
      process.env.CHATTERBOX_TTS_VOICE_ID ||
      "default",
    input: request.text,
    response_format: request.format,
  };

  if (request.options?.speed !== undefined) payload.speed = request.options.speed;
  if (request.options?.language) payload.language = request.options.language;

  const audioPromptPath =
    providerString(request, "audio_prompt_path") ??
    configuredString(config, "audioPromptPath") ??
    process.env.CHATTERBOX_AUDIO_PROMPT_PATH;
  if (audioPromptPath) payload.audio_prompt_path = audioPromptPath;

  const exaggeration =
    providerNumber(request, "exaggeration") ??
    configuredNumber(config, "exaggeration") ??
    envNumber("CHATTERBOX_EXAGGERATION");
  if (exaggeration !== undefined) payload.exaggeration = exaggeration;

  const cfgWeight =
    providerNumber(request, "cfg_weight") ??
    configuredNumber(config, "cfgWeight") ??
    envNumber("CHATTERBOX_CFG_WEIGHT");
  if (cfgWeight !== undefined) payload.cfg_weight = cfgWeight;

  const temperature =
    providerNumber(request, "temperature") ??
    configuredNumber(config, "temperature") ??
    envNumber("CHATTERBOX_TEMPERATURE");
  if (temperature !== undefined) payload.temperature = temperature;

  const seed =
    providerNumber(request, "seed") ??
    configuredNumber(config, "seed") ??
    envNumber("CHATTERBOX_SEED");
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

function retryPayloadWithoutAudioPrompt(payload: Record<string, unknown>): Record<string, unknown> {
  const nextPayload = { ...payload };
  delete nextPayload.audio_prompt_path;
  return nextPayload;
}

export class ChatterboxTTSProvider implements TTSProvider {
  id = "chatterbox";

  constructor(
    private readonly config: ChatterboxRuntimeConfig = {},
    private readonly dependencies: ChatterboxDependencies = {},
  ) {}

  async listVoices(): Promise<TTSVoice[]> {
    return voices;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    if (!["mp3", "wav"].includes(request.format)) {
      throw new Error(
        `Chatterbox TTS provider supports mp3 and wav output, got ${request.format}.`,
      );
    }

    const url = this.config.speechUrl ?? chatterboxUrl();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const apiKey = this.config.apiKey ?? process.env.CHATTERBOX_TTS_API_KEY;
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    let payload = buildPayload(request, this.config);
    let response: Response;
    let audioPromptFallback: string | undefined;
    const postSpeech = (body: Record<string, unknown>) =>
      (this.dependencies.fetchImpl ?? fetch)(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

    try {
      response = await postSpeech(payload);
    } catch (error) {
      throw new Error(chatterboxStartupHint(url), { cause: error });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (payload.audio_prompt_path && response.status >= 500) {
        const fallbackPayload = retryPayloadWithoutAudioPrompt(payload);
        const fallbackResponse = await postSpeech(fallbackPayload);
        if (fallbackResponse.ok) {
          payload = fallbackPayload;
          response = fallbackResponse;
          audioPromptFallback = "server_error_without_prompt_retry";
        } else {
          const fallbackBody = await fallbackResponse.text().catch(() => "");
          throw new Error(
            `Chatterbox TTS request failed: ${response.status} ${body.slice(0, 300)}; retry without audio prompt failed: ${fallbackResponse.status} ${fallbackBody.slice(0, 300)}`,
          );
        }
      } else {
        throw new Error(`Chatterbox TTS request failed: ${response.status} ${body.slice(0, 300)}`);
      }
    }

    await mkdir(path.dirname(request.outputPath), { recursive: true });
    const bytes = await readAudioResponse(response);
    await writeFile(request.outputPath, bytes);
    const probed = await (this.dependencies.probeMediaImpl ?? probeMedia)(request.outputPath);

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
        ...(audioPromptFallback ? { audioPromptFallback } : {}),
        bytes: bytes.length,
      },
    };
  }
}

export function createChatterboxTTSProvider(
  config: ChatterboxRuntimeConfig = {},
  dependencies: ChatterboxDependencies = {},
): TTSProvider {
  return new ChatterboxTTSProvider(config, dependencies);
}

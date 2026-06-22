import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

const DEFAULT_MMS_URL = "http://127.0.0.1:8001/v1/audio/speech";
const DEFAULT_MMS_MODEL = "facebook/mms-tts-tgl";
const DEFAULT_MMS_LANGUAGE = "tgl";

export type MMSTTSRuntimeConfig = {
  speechUrl?: string;
  model?: string;
  language?: string;
};

export type MMSTTSDependencies = {
  fetchImpl?: typeof fetch;
  probeMediaImpl?: typeof probeMedia;
};

const voices: TTSVoice[] = [
  {
    id: "default",
    label: "MMS Default",
    language: "multi",
    gender: "neutral",
    supportsSpeed: false,
    supportsEmotion: false,
  },
];

function mmsUrl(): string {
  return process.env.MMS_TTS_URL ?? DEFAULT_MMS_URL;
}

function buildPayload(request: TTSRequest, config: MMSTTSRuntimeConfig): Record<string, unknown> {
  return {
    model: config.model ?? process.env.MMS_TTS_MODEL ?? DEFAULT_MMS_MODEL,
    language:
      request.options?.language ??
      config.language ??
      process.env.MMS_TTS_LANGUAGE ??
      DEFAULT_MMS_LANGUAGE,
    voice: request.voiceId || "default",
    input: request.text,
    response_format: request.format,
  };
}

function startupHint(url: string): string {
  return [
    `MMS TTS server is unreachable at ${url}.`,
    "Start it before making a draft:",
    "MMS_MODEL=facebook/mms-tts-tgl /private/tmp/lvstudio-chatterbox-venv/bin/python scripts/mms_tts_server.py",
    "Or set MMS_TTS_URL to a reachable MMS-compatible speech endpoint.",
  ].join(" ");
}

export class MMSTTSProvider implements TTSProvider {
  id = "mms";

  constructor(
    private readonly config: MMSTTSRuntimeConfig = {},
    private readonly dependencies: MMSTTSDependencies = {},
  ) {}

  async listVoices(): Promise<TTSVoice[]> {
    return voices;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    if (!["wav"].includes(request.format)) {
      throw new Error(`MMS TTS provider currently supports wav output, got ${request.format}.`);
    }
    const url = this.config.speechUrl ?? mmsUrl();
    const payload = buildPayload(request, this.config);
    let response: Response;
    try {
      response = await (this.dependencies.fetchImpl ?? fetch)(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(startupHint(url), { cause: error });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`MMS TTS request failed: ${response.status} ${body.slice(0, 300)}`);
    }

    await mkdir(path.dirname(request.outputPath), { recursive: true });
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(request.outputPath, bytes);
    const probed = await (this.dependencies.probeMediaImpl ?? probeMedia)(request.outputPath);
    return {
      audioPath: request.outputPath,
      durationSeconds: probed.durationSeconds ?? 0,
      providerId: this.id,
      voiceId: String(payload.voice ?? "default"),
      inputHash: "",
      metadata: {
        model: payload.model,
        language: payload.language,
        bytes: bytes.length,
      },
    };
  }
}

export function createMMSTTSProvider(
  config: MMSTTSRuntimeConfig = {},
  dependencies: MMSTTSDependencies = {},
): TTSProvider {
  return new MMSTTSProvider(config, dependencies);
}

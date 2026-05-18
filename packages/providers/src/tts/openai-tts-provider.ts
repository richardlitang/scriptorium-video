import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

const voices: TTSVoice[] = [
  { id: "alloy", label: "Alloy", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "ash", label: "Ash", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "ballad", label: "Ballad", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "coral", label: "Coral", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "cedar", label: "Cedar", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "echo", label: "Echo", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "fable", label: "Fable", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "marin", label: "Marin", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "nova", label: "Nova", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "onyx", label: "Onyx", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "sage", label: "Sage", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "shimmer", label: "Shimmer", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true },
  { id: "verse", label: "Verse", language: "en", gender: "neutral", supportsSpeed: true, supportsEmotion: true }
];

async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

async function getOpenAiApiKey(): Promise<string> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  const envPaths = [
    process.env.LVSTUDIO_OPENAI_ENV_FILE,
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", "support", ".env.local")
  ].filter((entry): entry is string => Boolean(entry));

  for (const envPath of envPaths) {
    const values = await readEnvFile(envPath);
    if (values.OPENAI_API_KEY) return values.OPENAI_API_KEY;
  }

  throw new Error(
    "Missing OPENAI_API_KEY. Set it in the environment, LVSTUDIO_OPENAI_ENV_FILE, or ../support/.env.local."
  );
}

export class OpenAITTSProvider implements TTSProvider {
  id = "openai";

  async listVoices(): Promise<TTSVoice[]> {
    return voices;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    if (!["mp3", "wav"].includes(request.format)) {
      throw new Error(`OpenAI TTS provider supports mp3 and wav output, got ${request.format}.`);
    }

    const apiKey = await getOpenAiApiKey();
    const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
    const voice = voices.some((entry) => entry.id === request.voiceId) ? request.voiceId : "marin";
    const instructions =
      request.options?.emotion ??
      "Narrate as an engaged suspense storyteller: intimate, alert, and controlled. Build intrigue from the first line, sharpen the turns, slow slightly on dread, and avoid sounding bored, detached, cheerful, or theatrical.";

    const response = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        voice,
        input: request.text,
        instructions,
        response_format: request.format,
        speed: request.options?.speed ?? 1
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI TTS request failed: ${response.status} ${body.slice(0, 300)}`);
    }

    await mkdir(path.dirname(request.outputPath), { recursive: true });
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(request.outputPath, bytes);
    const probed = await probeMedia(request.outputPath);

    return {
      audioPath: request.outputPath,
      durationSeconds: probed.durationSeconds ?? 0,
      providerId: this.id,
      voiceId: voice,
      inputHash: "",
      metadata: {
        model,
        requestedVoiceId: request.voiceId,
        bytes: bytes.length
      }
    };
  }
}

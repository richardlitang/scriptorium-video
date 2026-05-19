import {
  generateTTSForProject,
  type GenerateTTSOptions
} from "@lvstudio/core";
import { VideoPlanSchema, getProjectPaths, readJsonFile } from "@lvstudio/core";
import { checkChatterboxCapability, ttsProviders } from "@lvstudio/providers";

type CliGenerateTTSOptions = {
  provider?: string;
  force?: boolean;
  noCache?: boolean;
  onlySection?: string;
  onlyBeat?: string;
  concurrency?: string;
};

type TtsMode = "local" | "api" | "auto";

function ttsMode(): TtsMode {
  const raw = process.env.LVSTUDIO_TTS_MODE ?? "local";
  if (raw === "local" || raw === "api" || raw === "auto") return raw;
  throw new Error(`Invalid LVSTUDIO_TTS_MODE: ${raw}. Expected local, api, or auto.`);
}

function fallbackProviderId(): string | undefined {
  return process.env.LVSTUDIO_TTS_FALLBACK_PROVIDER || undefined;
}

async function resolveProviderId(requestedProviderId: string): Promise<string> {
  const mode = ttsMode();
  if (mode === "api") return fallbackProviderId() ?? "openai";
  if (requestedProviderId !== "chatterbox") return requestedProviderId;
  if (mode === "local") return requestedProviderId;

  const capability = await checkChatterboxCapability();
  if (capability.available) return requestedProviderId;

  const fallback = fallbackProviderId();
  if (fallback) {
    console.warn(
      `Chatterbox unavailable (${capability.status}: ${capability.message ?? capability.healthUrl}); using ${fallback}.`
    );
    return fallback;
  }

  throw new Error(
    [
      `Chatterbox unavailable (${capability.status}: ${capability.message ?? capability.healthUrl}).`,
      "Set LVSTUDIO_TTS_FALLBACK_PROVIDER=openai to allow API fallback, or run with LVSTUDIO_TTS_MODE=local after starting Chatterbox."
    ].join(" ")
  );
}

export async function generateTTS(projectId: string, options: CliGenerateTTSOptions): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const requestedProviderId = options.provider ?? plan.providers.tts;
  const providerId = await resolveProviderId(requestedProviderId);
  const provider = ttsProviders[providerId];
  if (!provider) throw new Error(`Unknown TTS provider: ${providerId}`);
  const concurrency = options.concurrency === undefined ? undefined : Number(options.concurrency);
  if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) {
    throw new Error(`Invalid --concurrency value: ${options.concurrency}`);
  }
  const result = await generateTTSForProject(projectId, provider, {
    ...(options as GenerateTTSOptions),
    concurrency
  });
  for (const beatId of result.generated) {
    console.log(`Generated ${beatId}`);
  }
  for (const skipped of result.skipped) {
    console.log(`Skip ${skipped}`);
  }
}

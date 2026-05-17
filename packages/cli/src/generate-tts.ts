import {
  generateTTSForProject,
  type GenerateTTSOptions
} from "@lvstudio/core";
import { VideoPlanSchema, getProjectPaths, readJsonFile } from "@lvstudio/core";
import { ttsProviders } from "@lvstudio/providers";

type CliGenerateTTSOptions = {
  provider?: string;
  force?: boolean;
  noCache?: boolean;
  onlySection?: string;
  onlyBeat?: string;
};

export async function generateTTS(projectId: string, options: CliGenerateTTSOptions): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const providerId = options.provider ?? plan.providers.tts;
  const provider = ttsProviders[providerId];
  if (!provider) throw new Error(`Unknown TTS provider: ${providerId}`);
  const result = await generateTTSForProject(projectId, provider, options as GenerateTTSOptions);
  for (const beatId of result.generated) {
    console.log(`Generated ${beatId}`);
  }
  for (const skipped of result.skipped) {
    console.log(`Skip ${skipped}`);
  }
}

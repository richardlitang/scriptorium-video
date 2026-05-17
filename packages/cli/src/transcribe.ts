import {
  getProjectPaths,
  readJsonFile,
  transcribeProject,
  VideoPlanSchema
} from "@lvstudio/core";
import { transcriptionProviders } from "@lvstudio/providers";

type TranscribeOptions = {
  provider?: string;
};

export async function transcribeProjectCli(projectId: string, options: TranscribeOptions): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const providerId = options.provider ?? plan.providers.transcription;
  const provider = transcriptionProviders[providerId];
  if (!provider) throw new Error(`Unknown transcription provider: ${providerId}`);
  const result = await transcribeProject(projectId, provider);
  console.log(`Wrote ${result.transcriptPath}`);
}

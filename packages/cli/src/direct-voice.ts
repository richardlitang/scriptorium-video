import { directVoiceProject, type DirectVoiceProjectOptions } from "@lvstudio/core";

type DirectVoiceOptions = Pick<DirectVoiceProjectOptions, "fromFile" | "provider" | "force">;

export async function directVoice(
  projectId: string,
  options: DirectVoiceOptions = {},
): Promise<void> {
  const result = await directVoiceProject(projectId, options);
  console.log(`Directed voice for ${projectId}: ${result.beatUpdates} beat updates.`);
}

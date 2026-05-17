import {
  generateCaptionsForProject
} from "@lvstudio/core";

export async function generateCaptions(projectId: string): Promise<void> {
  const result = await generateCaptionsForProject(projectId);
  console.log(`Wrote ${result.captionsPath}`);
}

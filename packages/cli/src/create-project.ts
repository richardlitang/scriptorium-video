import { createProjectScaffold } from "@lvstudio/core";
import type { TargetPlatformSchema, VideoModeSchema } from "@lvstudio/core";
import type { z } from "zod";

type Mode = z.infer<typeof VideoModeSchema>;
type Platform = z.infer<typeof TargetPlatformSchema>;

export async function createProject(
  projectId: string,
  mode: Mode,
  platform: Platform,
  rootDir = process.cwd()
): Promise<void> {
  await createProjectScaffold(projectId, mode, platform, rootDir);
}

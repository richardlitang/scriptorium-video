import { resolveConfig } from "../config-resolver.js";
import { hashFile } from "../hash.js";
import { getProjectPaths } from "../paths.js";
import { loadProject } from "../project-service.js";
import type { RenderBundle } from "../renderer-provider.js";

export async function buildRenderBundle(input: {
  projectId: string;
  rootDir?: string;
}): Promise<RenderBundle> {
  const rootDir = input.rootDir ?? process.cwd();
  const paths = getProjectPaths(input.projectId, rootDir);
  const loaded = await loadProject(input.projectId, rootDir);

  if (!loaded.timeline) {
    throw new Error("timeline.json is required. Run sync before building a render bundle.");
  }

  const currentPlanHash = await hashFile(paths.videoPlan);
  if (loaded.timeline.sourcePlanHash !== currentPlanHash) {
    throw new Error("timeline.json is stale. Run sync before rendering.");
  }

  return {
    project: loaded.project,
    videoPlan: loaded.videoPlan,
    assetManifest: loaded.assetManifest,
    timeline: loaded.timeline,
    captions: loaded.captions,
    resolvedConfig: await resolveConfig(loaded.videoPlan, rootDir)
  };
}

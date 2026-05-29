import { access } from "node:fs/promises";
import path from "node:path";
import { resolveConfig } from "../config-resolver.js";
import { hashFile } from "../hash.js";
import { getProjectPaths } from "../paths.js";
import { loadProject } from "../project-service.js";
import type { RenderBundle } from "../renderer-provider.js";
import type { Asset, AssetManifest } from "../schemas/asset-manifest.schema.js";
import type { Timeline } from "../schemas/timeline.schema.js";

function isVisualAsset(asset: Asset | undefined): asset is Asset {
  return Boolean(
    asset &&
    ["image", "video", "screen_recording"].includes(asset.type) &&
    asset.role !== "voiceover",
  );
}

async function assertRenderableVisuals(
  projectDir: string,
  manifest: AssetManifest,
  timeline: Timeline,
): Promise<void> {
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  for (const segment of timeline.segments) {
    const visualAssetId = segment.mediaAssetIds[0];
    if (!visualAssetId) {
      throw new Error(
        `Timeline segment ${segment.beatId} has no visual asset. Generate images and sync before rendering.`,
      );
    }
    const visualAsset = assetsById.get(visualAssetId);
    if (!isVisualAsset(visualAsset)) {
      throw new Error(
        `Timeline segment ${segment.beatId} references missing or non-visual asset ${visualAssetId}. Sync or regenerate images before rendering.`,
      );
    }
    const absolutePath = path.resolve(projectDir, visualAsset.path);
    if (!absolutePath.startsWith(projectDir + path.sep)) {
      throw new Error(
        `Timeline segment ${segment.beatId} references visual asset outside the project directory.`,
      );
    }
    try {
      await access(absolutePath);
    } catch {
      throw new Error(
        `Timeline segment ${segment.beatId} references missing visual file ${visualAsset.path}. Regenerate images before rendering.`,
      );
    }
  }
}

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
    throw new Error(
      `timeline.json is stale. Expected sourcePlanHash ${currentPlanHash} but found ${loaded.timeline.sourcePlanHash}. Run sync before rendering.`,
    );
  }

  await assertRenderableVisuals(paths.projectDir, loaded.assetManifest, loaded.timeline);

  return {
    project: loaded.project,
    videoPlan: loaded.videoPlan,
    assetManifest: loaded.assetManifest,
    timeline: loaded.timeline,
    captions: loaded.captions,
    resolvedConfig: await resolveConfig(loaded.videoPlan, rootDir),
  };
}

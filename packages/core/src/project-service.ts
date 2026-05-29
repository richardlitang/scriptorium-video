import { access } from "node:fs/promises";
import { AssetManifestSchema, type AssetManifest } from "./schemas/asset-manifest.schema.js";
import { CaptionsFileSchema, type CaptionsFile } from "./schemas/captions.schema.js";
import { ProjectSchema, type Project } from "./schemas/project.schema.js";
import { TimelineSchema, type Timeline } from "./schemas/timeline.schema.js";
import { VideoPlanSchema, type VideoPlan } from "./schemas/video-plan.schema.js";
import { readJsonFile } from "./json.js";
import { normalizeVideoPlan } from "./normalize-video-plan.js";
import { getProjectPaths } from "./paths.js";

export type LoadedProject = {
  project: Project;
  videoPlan: VideoPlan;
  assetManifest: AssetManifest;
  timeline?: Timeline;
  captions?: CaptionsFile;
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadProject(
  projectId: string,
  rootDir = process.cwd(),
): Promise<LoadedProject> {
  const paths = getProjectPaths(projectId, rootDir);
  const project = await readJsonFile(paths.projectJson, ProjectSchema);
  const videoPlan = normalizeVideoPlan(await readJsonFile(paths.videoPlan, VideoPlanSchema));
  const assetManifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const timeline = (await exists(paths.timeline))
    ? await readJsonFile(paths.timeline, TimelineSchema)
    : undefined;
  const captions = (await exists(paths.captions))
    ? await readJsonFile(paths.captions, CaptionsFileSchema)
    : undefined;

  return {
    project,
    videoPlan,
    assetManifest,
    timeline,
    captions,
  };
}

export async function validateProject(
  projectId: string,
  rootDir = process.cwd(),
): Promise<LoadedProject> {
  return loadProject(projectId, rootDir);
}

import path from "node:path";

export type ProjectPaths = {
  rootDir: string;
  projectDir: string;
  projectJson: string;
  videoPlan: string;
  assetManifest: string;
  timeline: string;
  captionsDir: string;
  captions: string;
  rendersDir: string;
};

const SAFE_PROJECT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSafeProjectId(projectId: string): string {
  const normalized = String(projectId || "").trim();
  if (!SAFE_PROJECT_ID_RE.test(normalized) || normalized.length > 48) {
    throw new Error(
      `Invalid project id "${projectId}". Use lowercase letters, numbers, and hyphens only.`,
    );
  }
  return normalized;
}

export function getProjectPaths(projectId: string, rootDir = process.cwd()): ProjectPaths {
  const safeProjectId = assertSafeProjectId(projectId);
  const projectDir = path.resolve(rootDir, "content", "projects", safeProjectId);
  return {
    rootDir,
    projectDir,
    projectJson: path.join(projectDir, "project.json"),
    videoPlan: path.join(projectDir, "video-plan.json"),
    assetManifest: path.join(projectDir, "asset-manifest.json"),
    timeline: path.join(projectDir, "timeline.json"),
    captionsDir: path.join(projectDir, "captions"),
    captions: path.join(projectDir, "captions", "captions.json"),
    rendersDir: path.join(projectDir, "renders"),
  };
}

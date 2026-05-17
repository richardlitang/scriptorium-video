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

export function getProjectPaths(projectId: string, rootDir = process.cwd()): ProjectPaths {
  const projectDir = path.resolve(rootDir, "content", "projects", projectId);
  return {
    rootDir,
    projectDir,
    projectJson: path.join(projectDir, "project.json"),
    videoPlan: path.join(projectDir, "video-plan.json"),
    assetManifest: path.join(projectDir, "asset-manifest.json"),
    timeline: path.join(projectDir, "timeline.json"),
    captionsDir: path.join(projectDir, "captions"),
    captions: path.join(projectDir, "captions", "captions.json"),
    rendersDir: path.join(projectDir, "renders")
  };
}

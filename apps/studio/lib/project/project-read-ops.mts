type PathApi = {
  join: (...parts: string[]) => string;
};

interface ProjectReadOpsDeps {
  path: PathApi;
  projectsDir: string;
  safeReadJson: <T>(filePath: string) => Promise<T>;
  readRunState: (projectId: string) => Promise<Record<string, unknown> & { jobs?: unknown[] }>;
  readFile: (filePath: string, encoding: string) => Promise<string>;
  sha256: (value: string) => string;
}

export function createProjectReadOps(deps: ProjectReadOpsDeps) {
  const { path, projectsDir, safeReadJson, readRunState, readFile, sha256 } = deps;

  async function getProjectDetails(projectId: string) {
    const base = path.join(projectsDir, projectId);
    const [project, plan, timeline, manifest, captions, runState] = await Promise.all([
      safeReadJson<Record<string, unknown>>(path.join(base, "project.json")),
      safeReadJson<Record<string, unknown>>(path.join(base, "video-plan.json")),
      safeReadJson<Record<string, unknown>>(path.join(base, "timeline.json")).catch(
        () => undefined,
      ),
      safeReadJson<{ assets?: unknown[] }>(path.join(base, "asset-manifest.json")).catch(() => ({
        assets: [],
      })),
      safeReadJson<{ captions?: unknown[] }>(path.join(base, "captions", "captions.json")).catch(
        () => ({ captions: [] }),
      ),
      readRunState(projectId),
    ]);
    return {
      project,
      plan,
      timeline,
      runState: {
        ...runState,
        currentPlanHash: sha256(await readFile(path.join(base, "video-plan.json"), "utf8")),
        currentTimelineHash: sha256(
          await readFile(path.join(base, "timeline.json"), "utf8").catch(() => ""),
        ),
      },
      assetCount: manifest.assets?.length ?? 0,
      captionCount: captions.captions?.length ?? 0,
    };
  }

  return { getProjectDetails };
}

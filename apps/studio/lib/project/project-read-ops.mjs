export function createProjectReadOps(deps) {
  const { path, projectsDir, safeReadJson, readRunState, readFile, sha256 } = deps;

  async function getProjectDetails(projectId) {
    const base = path.join(projectsDir, projectId);
    const [project, plan, timeline, manifest, captions, runState] = await Promise.all([
      safeReadJson(path.join(base, "project.json")),
      safeReadJson(path.join(base, "video-plan.json")),
      safeReadJson(path.join(base, "timeline.json")).catch(() => undefined),
      safeReadJson(path.join(base, "asset-manifest.json")).catch(() => ({ assets: [] })),
      safeReadJson(path.join(base, "captions", "captions.json")).catch(() => ({ captions: [] })),
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

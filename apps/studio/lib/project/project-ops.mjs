const lockableTransitions = new Set([
  "generated:locked_by_user",
  "edited:locked_by_user",
  "stale:locked_by_user",
  "locked_by_user:generated",
]);

function isJobHistory(entry) {
  return Boolean(entry?.kind && entry?.summary);
}

export function createProjectOps(deps) {
  const {
    path,
    readdir,
    stat,
    rm,
    readFile,
    writeFile,
    safeReadJson,
    projectsDir,
    qualityHistoryDir,
    imageHistoryDir,
    runStatePath,
    runLvstudio,
    appendQualityHistory,
    readRunState,
    activeDraftJobs,
    activeBeatJobs,
    jobProgress,
    beatJobProgress,
    sha256,
  } = deps;

  async function deleteProjectAsset(projectId, assetId) {
    const projectDir = path.join(projectsDir, projectId);
    const manifestPath = path.join(projectDir, "asset-manifest.json");
    const manifest = await safeReadJson(manifestPath);
    const before = manifest.assets.length;
    const nextAssets = manifest.assets.filter((asset) => asset.id !== assetId);
    if (nextAssets.length === before) {
      throw new Error(`Asset not found: ${assetId}`);
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, assets: nextAssets }, null, 2)}\n`,
      "utf8",
    );
    const syncResult = await runLvstudio(["sync", projectId]);
    await appendQualityHistory(projectId, {
      timestamp: new Date().toISOString(),
      kind: "asset_delete",
      summary: `Deleted asset ${assetId}.`,
      output: syncResult.stdout.trim(),
    });
    return { assetId, syncOutput: syncResult.stdout.trim() };
  }

  async function updateProjectAssetStatus(projectId, assetId, nextStatus) {
    const projectDir = path.join(projectsDir, projectId);
    const manifestPath = path.join(projectDir, "asset-manifest.json");
    const manifest = await safeReadJson(manifestPath);
    const asset = manifest.assets.find((entry) => entry.id === assetId);
    if (!asset) throw new Error(`Asset not found: ${assetId}`);
    const transition = `${asset.status}:${nextStatus}`;
    if (!lockableTransitions.has(transition)) {
      throw new Error(`Unsupported status transition ${transition}.`);
    }
    asset.status = nextStatus;
    asset.updatedAt = new Date().toISOString();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const syncResult = await runLvstudio(["sync", projectId]);
    return { asset, syncOutput: syncResult.stdout.trim() };
  }

  async function readQualityHistory(projectId) {
    const logPath = path.join(qualityHistoryDir, `${projectId}.ndjson`);
    const raw = await readFile(logPath, "utf8").catch(() => "");
    if (!raw.trim()) return [];
    return raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter(Boolean)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  async function listDraftJobs(projectId) {
    const runState = await readRunState(projectId);
    const active = activeDraftJobs.get(projectId);
    const activeBeat = activeBeatJobs.get(projectId);
    const history = (await readQualityHistory(projectId))
      .filter(isJobHistory)
      .filter((entry) => !["draft_job_failed", "draft_job_cancelled"].includes(entry.kind))
      .slice(0, 24)
      .map((entry) => ({
        id: `${entry.kind}-${sha256(`${entry.timestamp}-${entry.summary}`).slice(0, 8)}`,
        status: entry.kind.endsWith("_failed") ? "failed" : "completed",
        startedAt: entry.timestamp,
        finishedAt: entry.timestamp,
        label: entry.summary,
        output: entry.output ?? "",
        kind: entry.kind,
      }));

    const runStateJobs = (runState.jobs ?? []).slice(0, 24).map((job) => ({
      id: job.jobId,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      label: job.label || job.kind,
      output: job.output ?? "",
      kind: `${job.kind}_runstate`,
      error: job.error,
      completed: job.completed,
      total: job.total,
      currentSectionTitle: job.currentSectionTitle ?? job.beatId,
      tracePath: job.tracePath,
      updatedAt: job.updatedAt,
    }));
    const liveJobs = [];
    if (active) {
      const current = jobProgress(active);
      liveJobs.push({
        id: current.jobId,
        status: current.status,
        startedAt: current.startedAt,
        finishedAt: current.finishedAt,
        label: current.label,
        output: current.output ?? "",
        kind: "draft_job_live",
        error: current.error,
        completed: current.completed,
        total: current.total,
        currentSectionTitle: current.currentSectionTitle,
        tracePath: current.tracePath,
        updatedAt: current.updatedAt,
      });
    }
    if (activeBeat) {
      const current = beatJobProgress(activeBeat);
      liveJobs.push({
        id: current.jobId,
        status: current.status,
        startedAt: current.startedAt,
        finishedAt: current.finishedAt,
        label: current.label,
        output: current.output ?? "",
        kind: "beat_regenerate_job_live",
        error: current.error,
        completed: current.completed,
        total: current.total,
        currentSectionTitle: current.beatId,
        tracePath: current.tracePath,
        updatedAt: current.updatedAt,
      });
    }
    const jobs = [
      ...liveJobs,
      ...runStateJobs.filter((item) => !liveJobs.some((live) => live.id === item.id)),
      ...history.filter(
        (item) =>
          !liveJobs.some((live) => live.id === item.id) &&
          !runStateJobs.some((job) => job.id === item.id),
      ),
    ];
    return { jobs };
  }

  async function listProjects() {
    const entries = await readdir(projectsDir, { withFileTypes: true }).catch(() => []);
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      try {
        const project = await safeReadJson(path.join(projectsDir, id, "project.json"));
        const plan = await safeReadJson(path.join(projectsDir, id, "video-plan.json"));
        projects.push({
          id: project.id,
          title: project.title,
          status: project.status,
          mode: plan.mode,
          targetPlatform: plan.targetPlatform,
          updatedAt: project.updatedAt,
        });
      } catch {
        // Skip invalid project folders.
      }
    }
    return projects.sort((a, b) => a.id.localeCompare(b.id));
  }

  function projectDeleteBlocker(projectId) {
    const activeDraft = activeDraftJobs.get(projectId);
    if (activeDraft && ["queued", "running"].includes(activeDraft.status)) {
      return "Cannot delete project while a draft job is queued or running. Stop the job first.";
    }
    const activeBeat = activeBeatJobs.get(projectId);
    if (activeBeat && ["queued", "running"].includes(activeBeat.status)) {
      return "Cannot delete project while a beat regeneration job is queued or running. Stop the job first.";
    }
    return "";
  }

  async function deleteProject(projectId) {
    const projectDir = path.join(projectsDir, projectId);
    if (!projectDir.startsWith(projectsDir + path.sep)) throw new Error("Invalid project id.");
    await rm(projectDir, { recursive: true, force: true });
    activeDraftJobs.delete(projectId);
    activeBeatJobs.delete(projectId);
    await rm(runStatePath(projectId), { force: true }).catch(() => {});
    await rm(path.join(qualityHistoryDir, `${projectId}.ndjson`), { force: true }).catch(() => {});
    await rm(path.join(imageHistoryDir, `${projectId}.ndjson`), { force: true }).catch(() => {});
  }

  return {
    deleteProjectAsset,
    updateProjectAssetStatus,
    readQualityHistory,
    listDraftJobs,
    listProjects,
    projectDeleteBlocker,
    deleteProject,
  };
}

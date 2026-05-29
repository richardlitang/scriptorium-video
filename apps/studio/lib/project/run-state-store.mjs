import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function resolveJobStatus(terminal, phase) {
  if (!terminal) return "running";
  return phase === "failed" ? "failed" : "completed";
}

function parseRunTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function jobSortTime(job) {
  return Math.max(
    parseRunTime(job?.updatedAt),
    parseRunTime(job?.finishedAt),
    parseRunTime(job?.startedAt),
  );
}

export function normalizeRunState(raw = {}) {
  const jobs = Array.isArray(raw.jobs)
    ? raw.jobs.filter((job) => job && typeof job === "object" && job.jobId)
    : [];
  if (raw.progress?.jobId && !jobs.some((job) => job.jobId === raw.progress.jobId))
    jobs.push(raw.progress);
  jobs.sort((a, b) => jobSortTime(b) - jobSortTime(a));
  const trimmed = jobs.slice(0, 30);
  const active =
    trimmed.find((job) => ["queued", "running"].includes(job.status)) ??
    trimmed.find((job) => job.kind === "draft_job") ??
    trimmed[0] ??
    null;
  let status = "idle";
  if (active && ["queued", "running"].includes(active.status)) status = "queued";
  else if (active?.status === "failed") status = "failed";
  return {
    status,
    lastRenderPlanHash: raw.lastRenderPlanHash,
    lastRenderTimelineHash: raw.lastRenderTimelineHash,
    lastRenderQuality: raw.lastRenderQuality,
    lastRenderCompletedAt: raw.lastRenderCompletedAt,
    currentPlanHash: raw.currentPlanHash,
    currentTimelineHash: raw.currentTimelineHash,
    updatedAt: raw.updatedAt,
    jobs: trimmed,
    activeJobId: active?.jobId,
    progress: active,
  };
}

export function createRunStateStore(rootDir) {
  function runStatePath(projectId) {
    return path.join(rootDir, ".studio-data", "run-state", `${projectId}.json`);
  }

  async function readRunState(projectId) {
    try {
      const raw = await readFile(runStatePath(projectId), "utf8");
      return normalizeRunState(JSON.parse(raw));
    } catch {
      return normalizeRunState({});
    }
  }

  async function writeRunState(projectId, state) {
    const filePath = runStatePath(projectId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(normalizeRunState(state), null, 2)}\n`, "utf8");
  }

  async function upsertRunJob(projectId, job) {
    const state = await readRunState(projectId);
    const jobs = [...(state.jobs ?? []).filter((entry) => entry.jobId !== job.jobId), job];
    await writeRunState(projectId, {
      ...state,
      jobs,
      updatedAt: new Date().toISOString(),
    });
  }

  async function updateRunProgress(projectId, patch) {
    const state = await readRunState(projectId);
    if (patch?.progress?.kind) {
      const current = state.jobs?.find(
        (job) => job.jobId === patch.progress.jobId || job.kind === patch.progress.kind,
      );
      const startedAt = current?.startedAt || new Date().toISOString();
      const phase = patch.progress.phase || "running";
      const terminal = ["complete", "completed", "failed", "stopped"].includes(phase);
      const job = {
        ...current,
        ...patch.progress,
        jobId: patch.progress.jobId || current?.jobId || `run-${patch.progress.kind}`,
        status: resolveJobStatus(terminal, phase),
        startedAt,
        finishedAt: terminal ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      };
      await upsertRunJob(projectId, job);
      return;
    }
    await writeRunState(projectId, { ...state, ...patch, updatedAt: new Date().toISOString() });
  }

  return {
    runStatePath,
    readRunState,
    writeRunState,
    upsertRunJob,
    updateRunProgress,
  };
}

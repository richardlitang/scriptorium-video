import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RunJob = {
  jobId: string;
  kind?: string;
  status?: string;
  phase?: string;
  label?: string;
  completed?: number;
  total?: number;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
};

type RunState = {
  status?: string;
  lastRenderPlanHash?: string;
  lastRenderTimelineHash?: string;
  lastRenderQuality?: string;
  lastRenderCompletedAt?: string;
  currentPlanHash?: string;
  currentTimelineHash?: string;
  updatedAt?: string;
  jobs?: RunJob[];
  activeJobId?: string;
  progress?: RunJob | null;
};

type RunProgressPatch = Partial<RunState> & {
  progress?: Partial<RunJob> & { kind: string; jobId?: string; phase?: string };
};

function resolveJobStatus(terminal: boolean, phase: string) {
  if (!terminal) return "running";
  return phase === "failed" ? "failed" : "completed";
}

function parseRunTime(value: string | undefined) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function jobSortTime(job: RunJob | null | undefined) {
  return Math.max(
    parseRunTime(job?.updatedAt),
    parseRunTime(job?.finishedAt),
    parseRunTime(job?.startedAt),
  );
}

function normalizedJobs(raw: RunState): RunJob[] {
  const jobs = Array.isArray(raw.jobs)
    ? raw.jobs.filter((job) => job && typeof job === "object" && job.jobId)
    : [];
  const progressJobId = raw.progress?.jobId;
  if (progressJobId && raw.progress && !jobs.some((job) => job.jobId === progressJobId)) {
    jobs.push(raw.progress);
  }
  jobs.sort((a, b) => jobSortTime(b) - jobSortTime(a));
  return jobs.slice(0, 30);
}

function selectActiveJob(jobs: RunJob[]): RunJob | null {
  return (
    jobs.find((job) => ["queued", "running"].includes(job.status ?? "")) ??
    jobs.find((job) => job.kind === "draft_job") ??
    jobs[0] ??
    null
  );
}

export function normalizeRunState(raw: RunState = {}) {
  const trimmed = normalizedJobs(raw);
  const active = selectActiveJob(trimmed);
  let status = "idle";
  if (active && ["queued", "running"].includes(active.status ?? "")) status = "queued";
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

export function createRunStateStore(rootDir: string) {
  function runStatePath(projectId: string) {
    return path.join(rootDir, ".studio-data", "run-state", `${projectId}.json`);
  }

  async function readRunState(projectId: string) {
    try {
      const raw = await readFile(runStatePath(projectId), "utf8");
      return normalizeRunState(JSON.parse(raw) as RunState);
    } catch {
      return normalizeRunState({});
    }
  }

  async function writeRunState(projectId: string, state: RunState) {
    const filePath = runStatePath(projectId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(normalizeRunState(state), null, 2)}\n`, "utf8");
  }

  async function upsertRunJob(projectId: string, job: RunJob) {
    const state = await readRunState(projectId);
    const jobs = [...(state.jobs ?? []).filter((entry) => entry.jobId !== job.jobId), job];
    await writeRunState(projectId, {
      ...state,
      jobs,
      updatedAt: new Date().toISOString(),
    });
  }

  async function updateRunProgress(projectId: string, patch: RunProgressPatch) {
    const state = await readRunState(projectId);
    const progress = patch.progress;
    if (progress?.kind) {
      const current = state.jobs?.find(
        (job) => job.jobId === progress.jobId || job.kind === progress.kind,
      );
      const startedAt = current?.startedAt || new Date().toISOString();
      const phase = progress.phase || "running";
      const terminal = ["complete", "completed", "failed", "stopped"].includes(phase);
      const job = {
        ...current,
        ...progress,
        jobId: progress.jobId || current?.jobId || `run-${progress.kind}`,
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

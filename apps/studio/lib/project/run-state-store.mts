import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface RunJob {
  jobId: string;
  kind?: string;
  status?: string;
  phase?: string;
  updatedAt?: string;
  finishedAt?: string;
  startedAt?: string;
  [key: string]: unknown;
}

export interface RunState {
  status: string;
  lastRenderPlanHash?: string;
  lastRenderTimelineHash?: string;
  lastRenderQuality?: string;
  lastRenderCompletedAt?: string;
  currentPlanHash?: string;
  currentTimelineHash?: string;
  updatedAt?: string;
  jobs: RunJob[];
  activeJobId?: string;
  progress: RunJob | null;
}

export interface RunStatePatch extends Partial<Omit<RunState, "jobs" | "progress">> {
  jobs?: RunJob[];
  progress?: (Partial<RunJob> & { kind?: string; jobId?: string }) | null;
}

function resolveJobStatus(terminal: boolean, phase?: string): string {
  if (!terminal) return "running";
  return phase === "failed" ? "failed" : "completed";
}

function parseRunTime(value?: string): number {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function jobSortTime(job: RunJob): number {
  return Math.max(
    parseRunTime(job.updatedAt),
    parseRunTime(job.finishedAt),
    parseRunTime(job.startedAt),
  );
}

export function normalizeRunState(
  raw: Partial<RunState> & { progress?: Partial<RunJob> | null; jobs?: unknown[] } = {},
): RunState {
  const jobs = Array.isArray(raw.jobs)
    ? raw.jobs.filter((job): job is RunJob =>
        Boolean(job && typeof job === "object" && "jobId" in job),
      )
    : [];
  if (raw.progress?.jobId && !jobs.some((job) => job.jobId === raw.progress?.jobId)) {
    jobs.push(raw.progress as RunJob);
  }
  jobs.sort((a, b) => jobSortTime(b) - jobSortTime(a));
  const trimmed = jobs.slice(0, 30);
  const active =
    trimmed.find((job) => ["queued", "running"].includes(job.status ?? "")) ??
    trimmed.find((job) => job.kind === "draft_job") ??
    trimmed[0] ??
    null;
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

export interface RunStateStore {
  runStatePath: (projectId: string) => string;
  readRunState: (projectId: string) => Promise<RunState>;
  writeRunState: (projectId: string, state: Partial<RunState>) => Promise<void>;
  upsertRunJob: (projectId: string, job: RunJob) => Promise<void>;
  updateRunProgress: (projectId: string, patch: RunStatePatch) => Promise<void>;
}

export function createRunStateStore(rootDir: string): RunStateStore {
  function runStatePath(projectId: string): string {
    return path.join(rootDir, ".studio-data", "run-state", `${projectId}.json`);
  }

  async function readRunState(projectId: string): Promise<RunState> {
    try {
      const raw = await readFile(runStatePath(projectId), "utf8");
      return normalizeRunState(JSON.parse(raw) as Partial<RunState>);
    } catch {
      return normalizeRunState({});
    }
  }

  async function writeRunState(projectId: string, state: Partial<RunState>): Promise<void> {
    const filePath = runStatePath(projectId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(normalizeRunState(state), null, 2)}\n`, "utf8");
  }

  async function upsertRunJob(projectId: string, job: RunJob): Promise<void> {
    const state = await readRunState(projectId);
    const jobs = [...(state.jobs ?? []).filter((entry) => entry.jobId !== job.jobId), job];
    await writeRunState(projectId, {
      ...state,
      jobs,
      updatedAt: new Date().toISOString(),
    });
  }

  async function updateRunProgress(projectId: string, patch: RunStatePatch): Promise<void> {
    const state = await readRunState(projectId);
    if (patch.progress?.kind) {
      const progress = patch.progress;
      const current = state.jobs?.find(
        (job) => job.jobId === progress.jobId || job.kind === progress.kind,
      );
      const startedAt = current?.startedAt || new Date().toISOString();
      const phase = String(progress.phase || "running");
      const terminal = ["complete", "completed", "failed", "stopped"].includes(phase);
      const job: RunJob = {
        ...current,
        ...progress,
        jobId: String(progress.jobId || current?.jobId || `run-${progress.kind}`),
        status: resolveJobStatus(terminal, phase),
        startedAt,
        finishedAt: terminal ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      };
      await upsertRunJob(projectId, job);
      return;
    }
    const { progress: _progress, ...rest } = patch;
    await writeRunState(projectId, { ...state, ...rest, updatedAt: new Date().toISOString() });
  }

  return {
    runStatePath,
    readRunState,
    writeRunState,
    upsertRunJob,
    updateRunProgress,
  };
}

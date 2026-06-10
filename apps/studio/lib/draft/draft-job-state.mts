type DraftJob = {
  id: string;
  status?: string;
  phase?: string;
  label?: string;
  completed?: number;
  total?: number;
  currentBeatId?: string;
  currentBeatIndex?: number;
  currentBeatTotal?: number;
  attempt?: number;
  maxAttempts?: number;
  startedAt?: string;
  finishedAt?: string;
  currentSectionId?: string;
  currentSectionTitle?: string;
  error?: string;
  tracePath?: string;
  output: string[];
  updatedAt?: string;
};

type DraftJobPatch = Partial<DraftJob> & Record<string, unknown>;

type WriteDraftJobStateInput = {
  projectId: string;
  job: DraftJob;
  upsertRunJob: (projectId: string, job: Record<string, unknown>) => Promise<void>;
  patch?: DraftJobPatch;
};

export function jobProgress(job: DraftJob, patch: Record<string, unknown> = {}) {
  return {
    kind: "draft_job",
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    label: job.label,
    completed: job.completed,
    total: job.total,
    currentBeatId: job.currentBeatId,
    currentBeatIndex: job.currentBeatIndex,
    currentBeatTotal: job.currentBeatTotal,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    currentSectionId: job.currentSectionId,
    currentSectionTitle: job.currentSectionTitle,
    error: job.error,
    tracePath: job.tracePath,
    output: job.output.join("\n\n").trim(),
    updatedAt: job.updatedAt,
    ...patch,
  };
}

export async function writeDraftJobState({
  projectId,
  job,
  upsertRunJob,
  patch = {},
}: WriteDraftJobStateInput): Promise<void> {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  await upsertRunJob(projectId, {
    ...jobProgress(job),
    updatedAt: job.updatedAt,
  });
}

export function isDraftJobRunning(job: DraftJob | null | undefined): boolean {
  return Boolean(job && ["queued", "running", "cancelling"].includes(String(job.status)));
}

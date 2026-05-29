export function jobProgress(job, patch = {}) {
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

export async function writeDraftJobState({ projectId, job, upsertRunJob, patch = {} }) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  await upsertRunJob(projectId, {
    ...jobProgress(job),
    updatedAt: job.updatedAt,
  });
}

export function isDraftJobRunning(job) {
  return Boolean(job && ["queued", "running", "cancelling"].includes(job.status));
}

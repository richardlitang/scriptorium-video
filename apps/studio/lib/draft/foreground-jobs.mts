type ForegroundJob = {
  kind: string;
  jobId: string;
  status: string;
  phase: string;
  label: string;
  completed: number;
  total: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  output: string;
};

type ForegroundJobOptions = {
  kind: string;
  label: string;
  total?: number;
  completedLabel?: string;
};

type ForegroundJobStepResult = {
  stdout?: string;
};

type ForegroundJobDeps = {
  upsertRunJob: (projectId: string, job: Record<string, unknown>) => Promise<void>;
  writeAgentHandoff?: (
    projectId: string,
    job: ForegroundJob,
    handoff: { summary: string; nextAction: string },
  ) => Promise<void>;
};

export function createForegroundJobs(deps: ForegroundJobDeps) {
  const { upsertRunJob, writeAgentHandoff } = deps;

  function createForegroundJob({ kind, label, total = 1 }: ForegroundJobOptions): ForegroundJob {
    return {
      kind,
      jobId: `${kind}-${Date.now().toString(36)}`,
      status: "running",
      phase: "running",
      label,
      completed: 0,
      total: Math.max(1, Number(total) || 1),
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      error: undefined,
      output: "",
    };
  }

  async function runTrackedForegroundJob<T>(
    projectId: string,
    options: ForegroundJobOptions,
    runner: (context: {
      job: ForegroundJob;
      advance: (
        label: string,
        operation: () => Promise<ForegroundJobStepResult>,
      ) => Promise<ForegroundJobStepResult>;
      outputLines: string[];
    }) => Promise<T>,
  ): Promise<T> {
    const job = createForegroundJob(options);
    const outputLines: string[] = [];
    await upsertRunJob(projectId, { ...job, updatedAt: new Date().toISOString() });
    const advance = async (
      label: string,
      operation: () => Promise<ForegroundJobStepResult>,
    ): Promise<ForegroundJobStepResult> => {
      job.label = label;
      await upsertRunJob(projectId, { ...job, updatedAt: new Date().toISOString() });
      const result = await operation();
      if (result?.stdout?.trim()) outputLines.push(result.stdout.trim());
      job.completed = Math.min(job.total, job.completed + 1);
      await upsertRunJob(projectId, {
        ...job,
        output: outputLines.join("\n\n"),
        updatedAt: new Date().toISOString(),
      });
      return result;
    };
    try {
      const result = await runner({ job, advance, outputLines });
      job.status = "completed";
      job.phase = "done";
      job.finishedAt = new Date().toISOString();
      job.label = options.completedLabel || job.label;
      job.completed = job.total;
      job.output = outputLines.join("\n\n");
      await upsertRunJob(projectId, { ...job, updatedAt: new Date().toISOString() });
      await writeAgentHandoff?.(projectId, job, {
        summary: job.label,
        nextAction: "Review the job output and continue the project workflow.",
      });
      return result;
    } catch (error) {
      job.status = "failed";
      job.phase = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : String(error);
      job.output = [...outputLines, `Error:\n${job.error}`].join("\n\n");
      await upsertRunJob(projectId, { ...job, updatedAt: new Date().toISOString() });
      await writeAgentHandoff?.(projectId, job, {
        summary: `${options.label} failed.`,
        nextAction: "Inspect the error and rerun after fixing the underlying issue.",
      });
      throw error;
    }
  }

  return { runTrackedForegroundJob };
}

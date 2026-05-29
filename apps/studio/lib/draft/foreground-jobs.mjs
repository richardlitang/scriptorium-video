export function createForegroundJobs(deps) {
  const { upsertRunJob } = deps;

  function createForegroundJob({ kind, label, total = 1 }) {
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

  async function runTrackedForegroundJob(projectId, options, runner) {
    const job = createForegroundJob(options);
    const outputLines = [];
    await upsertRunJob(projectId, { ...job, updatedAt: new Date().toISOString() });
    const advance = async (label, operation) => {
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
      return result;
    } catch (error) {
      job.status = "failed";
      job.phase = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : String(error);
      job.output = [...outputLines, `Error:\n${job.error}`].join("\n\n");
      await upsertRunJob(projectId, { ...job, updatedAt: new Date().toISOString() });
      throw error;
    }
  }

  return { runTrackedForegroundJob };
}

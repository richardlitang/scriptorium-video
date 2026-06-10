type DraftJob = {
  id: string;
  output: string[];
  cancelRequested?: boolean;
  maxAttempts: number;
  completed: number;
};

type DraftStepResult = {
  stdout?: string;
  stderr?: string;
};

type DraftStepRetrierDeps = {
  ensureChatterboxReady: (
    reason: string,
  ) => Promise<{ ok: boolean; status?: string; error?: string | null }>;
  appendRunTrace: (
    projectId: string,
    jobId: string,
    event: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  writeDraftJobState: (
    projectId: string,
    job: DraftJob,
    patch?: Record<string, unknown>,
  ) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
};

export function createDraftStepRetrier(deps: DraftStepRetrierDeps) {
  const { ensureChatterboxReady, appendRunTrace, writeDraftJobState, sleep } = deps;

  return async function runRetriedDraftStep(
    projectId: string,
    job: DraftJob,
    label: string,
    operation: () => Promise<DraftStepResult>,
    options: { countCompletion?: boolean } = {},
  ): Promise<DraftStepResult> {
    const countCompletion = options.countCompletion !== false;
    if (job.cancelRequested) throw new Error("Draft job cancelled by user.");
    const isProviderUnreachableError = (message: string) =>
      /TTS server is unreachable/i.test(String(message || ""));
    const maybeRecoverFromUnreachable = async (message: string) => {
      if (!isProviderUnreachableError(message)) return false;
      if (!/chatterbox/i.test(label)) return false;
      const recovered = await ensureChatterboxReady("draft_step_retry");
      await appendRunTrace(projectId, job.id, "tts_recovery.chatterbox", {
        label,
        ok: recovered.ok,
        status: recovered.status,
        error: recovered.error || null,
      }).catch(() => {});
      return recovered.ok;
    };
    let lastError;
    for (let attempt = 1; attempt <= job.maxAttempts; attempt += 1) {
      if (job.cancelRequested) throw new Error("Draft job cancelled by user.");
      await writeDraftJobState(projectId, job, {
        status: "running",
        label,
        attempt,
      });
      await appendRunTrace(projectId, job.id, "step.start", {
        label,
        attempt,
        maxAttempts: job.maxAttempts,
      }).catch(() => {});
      try {
        const result = await operation();
        await appendRunTrace(projectId, job.id, "step.complete", {
          label,
          attempt,
          stdoutChars: String(result?.stdout ?? "").length,
          stderrChars: String(result?.stderr ?? "").length,
        }).catch(() => {});
        if (result?.stdout?.trim()) job.output.push(`${label}:\n${result.stdout.trim()}`);
        if (countCompletion) job.completed += 1;
        await writeDraftJobState(projectId, job);
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        await appendRunTrace(projectId, job.id, "step.failed", {
          label,
          attempt,
          message,
        }).catch(() => {});
        job.output.push(`${label} attempt ${attempt} failed:\n${message}`);
        await writeDraftJobState(projectId, job, {
          error: message,
        });
        const recovered = await maybeRecoverFromUnreachable(message);
        if (recovered && attempt < job.maxAttempts) {
          await sleep(500);
          continue;
        }
        if (isProviderUnreachableError(message)) break;
        if (attempt < job.maxAttempts) await sleep(1000 * attempt);
      }
    }
    throw lastError;
  };
}

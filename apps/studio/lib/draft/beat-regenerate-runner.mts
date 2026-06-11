function nowIso() {
  return new Date().toISOString();
}

type BeatRegenerateJob = {
  id: string;
  beatId: string;
  sectionId: string;
  status: string;
  phase: string;
  label: string;
  completed: number;
  total: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  tracePath?: string;
  updatedAt?: string;
  output: string[];
};

type BeatRegenerateOptions = {
  force?: boolean;
  audio?: boolean;
  image?: boolean;
  captions?: boolean;
  render?: boolean;
  prompt?: string;
  quality?: string;
};

type ProjectPlan = {
  providers: {
    tts: string;
    transcription: string;
  };
  sections?: Array<{
    id: string;
    beats?: Array<{ id: string }>;
  }>;
};

type BeatRegenerateDeps = {
  activeBeatJobs: Map<string, BeatRegenerateJob>;
  getProjectDetails: (projectId: string) => Promise<{ plan: ProjectPlan }>;
  upsertRunJob: (projectId: string, payload: Record<string, unknown>) => Promise<void>;
  runProjectMutation: (projectId: string, worker: () => Promise<void>) => Promise<void>;
  runLvstudio: (args: string[]) => Promise<{ stdout?: string }>;
  generateProjectImages: (
    projectId: string,
    options: Record<string, unknown>,
  ) => Promise<{ generated: unknown[]; failed: unknown[] }>;
  defaultImageSizeForPlan: (plan: ProjectPlan) => string;
  appendQualityHistory: (
    projectId: string,
    entry: { timestamp: string; kind: string; summary: string; output: string },
  ) => Promise<void>;
};

export function beatJobProgress(job: BeatRegenerateJob, patch: Record<string, unknown> = {}) {
  return {
    kind: "beat_regenerate_job",
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    label: job.label,
    beatId: job.beatId,
    sectionId: job.sectionId,
    completed: job.completed,
    total: job.total,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    tracePath: job.tracePath,
    output: job.output.join("\n\n").trim(),
    updatedAt: job.updatedAt,
    ...patch,
  };
}

export function createBeatRegenerateRunner({
  activeBeatJobs,
  getProjectDetails,
  upsertRunJob,
  runProjectMutation,
  runLvstudio,
  generateProjectImages,
  defaultImageSizeForPlan,
  appendQualityHistory,
}: BeatRegenerateDeps) {
  if (!(activeBeatJobs instanceof Map))
    throw new Error("createBeatRegenerateRunner requires activeBeatJobs Map.");

  return async function runBeatRegenerateJob(
    projectId: string,
    beatId: string,
    options: BeatRegenerateOptions = {},
  ): Promise<Record<string, unknown>> {
    const details = await getProjectDetails(projectId);
    const plan = details.plan;
    const section = (plan.sections ?? []).find((entry) =>
      (entry.beats ?? []).some((beat) => beat.id === beatId),
    );
    if (!section) throw new Error(`Beat not found: ${beatId}`);
    const force = options.force === true;
    const job: BeatRegenerateJob = {
      id: `beat-${Date.now().toString(36)}`,
      beatId,
      sectionId: section.id,
      status: "queued",
      phase: "queued",
      label: "Queued beat regeneration",
      completed: 0,
      total:
        (options.audio !== false ? 1 : 0) +
        (options.image !== false ? 1 : 0) +
        (options.captions !== false && options.audio !== false ? 2 : 0) +
        (options.render === true ? 1 : 0),
      startedAt: nowIso(),
      finishedAt: undefined,
      error: undefined,
      output: [],
    };
    if (job.total === 0) job.total = 1;

    activeBeatJobs.set(projectId, job);
    await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: nowIso() });

    void runProjectMutation(projectId, async () => {
      try {
        const runStep = async (
          phase: string,
          label: string,
          operation: () => Promise<{ stdout?: string }>,
        ): Promise<void> => {
          job.status = "running";
          job.phase = phase;
          job.label = label;
          await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: nowIso() });
          const result = await operation();
          if (result?.stdout?.trim()) job.output.push(`${label}:\n${result.stdout.trim()}`);
          job.completed += 1;
          await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: nowIso() });
        };

        if (options.audio !== false) {
          await runStep("audio", "Regenerate beat narration", () =>
            runLvstudio([
              "generate:tts",
              projectId,
              "--provider",
              plan.providers.tts,
              "--only-beat",
              beatId,
              ...(force ? ["--force"] : []),
            ]),
          );
        }
        if (options.audio !== false) {
          await runStep("sync", "Sync timeline", () => runLvstudio(["sync", projectId]));
        }
        if (options.image !== false) {
          await runStep("images", "Regenerate beat image", async () => {
            const result = await generateProjectImages(projectId, {
              mode: "selected",
              assetId: `image-${beatId}`,
              prompt: options.prompt,
              quality: options.quality ?? "low",
              size: defaultImageSizeForPlan(plan),
              force,
            });
            return {
              stdout: `Image regenerate: generated ${result.generated.length}, failed ${result.failed.length}.`,
            };
          });
        }
        if (options.captions !== false && options.audio !== false) {
          await runStep("transcribe", "Transcribe narration", () =>
            runLvstudio(["transcribe", projectId, "--provider", plan.providers.transcription]),
          );
          await runStep("captions", "Generate captions", () =>
            runLvstudio(["captions", projectId]),
          );
        }
        if (options.render === true) {
          await runStep("render", "Render draft", () =>
            runLvstudio(["render", projectId, "--quality", "draft", "--force"]),
          );
        }

        job.status = "completed";
        job.phase = "done";
        job.label = "Beat regeneration complete";
        job.finishedAt = nowIso();
        const output = job.output.join("\n\n").trim();
        await appendQualityHistory(projectId, {
          timestamp: job.finishedAt,
          kind: "beat_regenerate",
          summary: `Regenerated beat ${beatId}.`,
          output,
        });
        await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: nowIso() });
        activeBeatJobs.delete(projectId);
      } catch (error) {
        job.status = "failed";
        job.phase = "failed";
        job.label = "Beat regeneration failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.finishedAt = nowIso();
        job.output.push(`Beat regeneration failed:\n${job.error}`);
        await appendQualityHistory(projectId, {
          timestamp: job.finishedAt,
          kind: "beat_regenerate_failed",
          summary: `Beat regeneration failed for ${beatId}.`,
          output: job.output.join("\n\n").trim(),
        }).catch(() => {});
        await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: nowIso() });
        activeBeatJobs.delete(projectId);
      }
    }).catch(() => {});

    return beatJobProgress(job);
  };
}

function nowIso() {
  return new Date().toISOString();
}

export function beatJobProgress(job, patch = {}) {
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
  domainOps,
  runLvstudio,
  generateProjectImages,
  defaultImageSizeForPlan,
  appendQualityHistory,
}) {
  if (!(activeBeatJobs instanceof Map))
    throw new Error("createBeatRegenerateRunner requires activeBeatJobs Map.");

  return async function runBeatRegenerateJob(projectId, beatId, options = {}) {
    const details = await getProjectDetails(projectId);
    const plan = details.plan;
    const section = (plan.sections ?? []).find((entry) =>
      (entry.beats ?? []).some((beat) => beat.id === beatId),
    );
    if (!section) throw new Error(`Beat not found: ${beatId}`);
    const force = options.force === true;
    const job = {
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

    runProjectMutation(projectId, async () => {
      try {
        const runStep = async (phase, label, operation) => {
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
          await runStep("captions", "Generate captions", async () => ({
            stdout: JSON.stringify(await domainOps.captions(projectId), null, 2),
          }));
        }
        if (options.render === true) {
          await runStep("render", "Render draft", async () => ({
            stdout: JSON.stringify(
              await domainOps.render({ projectId, quality: "draft", force: true }),
              null,
              2,
            ),
          }));
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

import { preflightDraftTtsProviders } from "../tts/tts-preflight.mjs";
import { draftAudioStepCount } from "../tts/tts-draft-planning.mjs";

export function createDraftJobRunner(deps) {
  const {
    runTraceDisplayPath,
    activeDraftJobs,
    writeDraftJobState,
    appendRunTrace,
    normalizeImageCoverage,
    summarizeVoiceSettingsForTrace,
    readVoiceSettings,
    runProjectMutation,
    path,
    projectsDir,
    getProjectDetails,
    summarizeStoryInput,
    summarizePlanForTrace,
    parsePlanFromStoryInput,
    applyDraftDefaults,
    buildPlannerStoryInput,
    splitStoryIntoLockedUnits,
    plannerSplitDecision,
    splitPlannerConfig,
    generateSplitPlanDraftWithOpenAi,
    generatePlanDraftWithOpenAi,
    planNarrationHealth,
    plannerQualityWarnings,
    plannerQualityWarningSummary,
    plannerQualityIsUsable,
    plannerBlockingFailures,
    plannerBlockingFailureMessage,
    stricterPlannerUserPromptTemplate,
    plannerProgressTracer,
    canonicalizePlanForPersistence,
    writeFile,
    planNeedsTtsRouting,
    routePlanTtsWithOpenAi,
    ensureChatterboxReady,
    readMmsHealth,
    getOpenAiApiKey,
    runRetriedDraftStep,
    domainOps,
    readProjectTraceSnapshot,
    safeReadJson,
    selectImageTargets,
    defaultImageSizeForPlan,
    summarizeManifestForTrace,
    generateProjectImages,
    generateDraftAudioBySection,
    sha256,
    readFile,
    appendQualityHistory,
    upsertRunJob,
    jobProgress,
    writeRunState,
    readRunState,
    writeAgentHandoff,
  } = deps;

  return async function runDraftJob(projectId, body) {
    const job = {
      projectId,
      id: `draft-${Date.now().toString(36)}`,
      status: "queued",
      phase: "queued",
      label: "Waiting for project queue",
      completed: 0,
      total: 1,
      attempt: 0,
      maxAttempts: 2,
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      error: undefined,
      output: [],
    };
    job.tracePath = runTraceDisplayPath(projectId, job.id);
    job.output.push(`Operational trace:\n${job.tracePath}`);

    activeDraftJobs.set(projectId, job);
    await writeDraftJobState(projectId, job);
    await appendRunTrace(projectId, job.id, "draft_job.queued", {
      request: {
        hasStory: Boolean(String(body.story || "").trim()),
        imageEnabled: body.imageEnabled !== false,
        imageMode: body.imageMode ?? "missing",
        imageCoverage: normalizeImageCoverage(body.imageCoverage),
        imageQuality: body.imageQuality ?? "low",
        hasPlanPayload: Boolean(body.plan && typeof body.plan === "object"),
        feelChars: String(body.feel ?? "").length,
        pacingChars: String(body.pacing ?? "").length,
        visualStyleChars: String(body.visualStyle ?? "").length,
      },
      voiceSettings: summarizeVoiceSettingsForTrace(await readVoiceSettings()),
    }).catch(() => {});

    runProjectMutation(projectId, async () => {
      try {
        const projectDir = path.join(projectsDir, projectId);
        const planPath = path.join(projectDir, "video-plan.json");
        let details = await getProjectDetails(projectId);
        let plan = details.plan;
        const story = String(body.story || "").trim();
        const imageEnabledForJob = body.imageEnabled !== false;
        const imageSteps = imageEnabledForJob ? 1 : 0;
        let planningSteps = 0;
        let ttsRoutingSteps = 0;
        await appendRunTrace(projectId, job.id, "draft_job.start", {
          projectId,
          story: summarizeStoryInput(story),
          currentPlan: summarizePlanForTrace(plan, story),
        }).catch(() => {});

        if (story) {
          await writeDraftJobState(projectId, job, {
            phase: "planning",
            label: "Creating video plan from story",
          });
          const pastedPlan = parsePlanFromStoryInput(story);
          if (pastedPlan) {
            plan = applyDraftDefaults(pastedPlan);
            await appendRunTrace(projectId, job.id, "planning.parsed_json_plan", {
              plan: summarizePlanForTrace(plan, story),
            }).catch(() => {});
          } else {
            planningSteps = 1;
            const plannerStory = buildPlannerStoryInput(story);
            const sourceNarration = splitStoryIntoLockedUnits(story).join("\n");
            const plannerInput = {
              story: plannerStory,
              currentPlan: plan,
              feel: body.feel ?? "",
              pacing: body.pacing ?? "",
              visualStyle: body.visualStyle ?? "",
              format: body.format ?? "long_documentary",
              systemPrompt: body.systemPrompt,
              userPromptTemplate: body.userPromptTemplate,
              onProgress: plannerProgressTracer(
                projectId,
                job,
                "Creating video plan from story",
                "standard",
              ),
              projectId,
              job,
            };
            const splitDecision = plannerSplitDecision(body, story, splitPlannerConfig);
            await appendRunTrace(projectId, job.id, "planning.mode_selected", splitDecision).catch(
              () => {},
            );
            let draft = splitDecision.enabled
              ? await generateSplitPlanDraftWithOpenAi({ ...plannerInput, story })
              : await generatePlanDraftWithOpenAi(plannerInput);
            plan = draft.plan;
            let quality = planNarrationHealth(plan, sourceNarration, draft.quality);
            const warnings = plannerQualityWarnings(quality);
            if (warnings.length > 0) {
              await appendRunTrace(projectId, job.id, "planning.llm_plan_warnings", {
                model: draft.model,
                quality,
                warnings,
              }).catch(() => {});
              job.output.push(plannerQualityWarningSummary(quality));
            }
            if (!plannerQualityIsUsable(quality)) {
              const failures = plannerBlockingFailures(quality);
              await appendRunTrace(projectId, job.id, "planning.llm_plan_unusable", {
                model: draft.model,
                quality,
                failures,
              }).catch(() => {});
              job.output.push(`Planner unusable (${draft.model}):\n${failures.join("\n")}`);
              await writeDraftJobState(projectId, job, {
                phase: "planning",
                label: `Planner output unusable from ${draft.model}; retrying stricter plan`,
              });
              const retryPlannerInput = {
                story: plannerStory,
                currentPlan: details.plan,
                feel: body.feel ?? "",
                pacing: body.pacing ?? "",
                visualStyle: body.visualStyle ?? "",
                format: body.format ?? "long_documentary",
                systemPrompt: body.systemPrompt,
                userPromptTemplate: stricterPlannerUserPromptTemplate(),
                onProgress: plannerProgressTracer(
                  projectId,
                  job,
                  "Retrying stricter video plan",
                  "strict",
                ),
                projectId,
                job,
              };
              draft = splitDecision.enabled
                ? await generateSplitPlanDraftWithOpenAi({ ...retryPlannerInput, story })
                : await generatePlanDraftWithOpenAi(retryPlannerInput);
              plan = draft.plan;
              quality = planNarrationHealth(plan, sourceNarration, draft.quality);
              const retryWarnings = plannerQualityWarnings(quality);
              if (retryWarnings.length > 0) {
                await appendRunTrace(projectId, job.id, "planning.llm_plan_warnings_retry", {
                  model: draft.model,
                  quality,
                  warnings: retryWarnings,
                }).catch(() => {});
                job.output.push(plannerQualityWarningSummary(quality));
              }
              if (!plannerQualityIsUsable(quality)) {
                const finalFailures = plannerBlockingFailures(quality);
                await appendRunTrace(projectId, job.id, "planning.llm_plan_unusable_final", {
                  model: draft.model,
                  quality,
                  failures: finalFailures,
                }).catch(() => {});
                throw new Error(plannerBlockingFailureMessage(quality));
              }
            }
            await appendRunTrace(projectId, job.id, "planning.llm_plan", {
              model: draft.model,
              warnings: draft.warnings ?? [],
              plan: summarizePlanForTrace(plan, sourceNarration),
              quality,
            }).catch(() => {});
            job.output.push(
              `AI plan:\nGenerated ${plan.sections.length} section(s) using ${draft.model}.`,
            );
            job.completed += 1;
            await writeDraftJobState(projectId, job);
          }
          plan = canonicalizePlanForPersistence(plan);
          await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
        } else if (body.plan && typeof body.plan === "object") {
          plan = canonicalizePlanForPersistence(body.plan);
          await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
          await appendRunTrace(projectId, job.id, "planning.used_supplied_plan", {
            plan: summarizePlanForTrace(plan),
          }).catch(() => {});
        }

        details = await getProjectDetails(projectId);
        plan = details.plan;
        await appendRunTrace(projectId, job.id, "plan.persisted", {
          plan: summarizePlanForTrace(plan, story),
        }).catch(() => {});
        const needsTtsRouting = planNeedsTtsRouting(plan);
        if (needsTtsRouting) {
          ttsRoutingSteps = 1;
          await writeDraftJobState(projectId, job, {
            phase: "tts_routing",
            label: "Mapping narration language and TTS provider",
          });
          const routed = await routePlanTtsWithOpenAi(plan);
          plan = canonicalizePlanForPersistence(routed.plan);
          await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
          await appendRunTrace(projectId, job.id, "tts_routing.llm_plan", {
            model: routed.model,
            warnings: routed.warnings ?? [],
            plan: summarizePlanForTrace(plan, story),
          }).catch(() => {});
          job.output.push(
            `TTS routing:\nMapped ${plan.sections.flatMap((section) => section.beats ?? []).length} beat(s) using ${routed.model}.`,
          );
          if (routed.warnings?.length)
            job.output.push(`TTS routing warnings:\n${routed.warnings.join("\n")}`);
          job.completed += 1;
          await writeDraftJobState(projectId, job);
        }

        await writeDraftJobState(projectId, job, {
          phase: "tts_preflight",
          label: "Checking narration providers",
        });
        const ttsPreflight = await preflightDraftTtsProviders(plan, {
          ensureChatterboxReady,
          readMmsHealth,
          getOpenAiApiKey,
        });
        await appendRunTrace(projectId, job.id, "tts_preflight.complete", {
          providers: ttsPreflight,
        }).catch(() => {});

        const audioSteps = draftAudioStepCount(plan);
        job.total = planningSteps + ttsRoutingSteps + imageSteps + audioSteps + 6;
        if (job.total < 1) job.total = 1;

        await writeDraftJobState(projectId, job, {
          phase: "save",
          label: "Saving plan and syncing timeline",
        });
        await runRetriedDraftStep(projectId, job, "Initial sync", () => domainOps.sync(projectId));
        await appendRunTrace(
          projectId,
          job.id,
          "sync.initial.complete",
          await readProjectTraceSnapshot(projectId),
        ).catch(() => {});

        if (imageEnabledForJob) {
          await writeDraftJobState(projectId, job, { phase: "images", label: "Generating images" });
          const preImageManifest = await safeReadJson(
            path.join(projectDir, "asset-manifest.json"),
          ).catch(() => ({ schemaVersion: 1, assets: [] }));
          const imageCoverage = normalizeImageCoverage(body.imageCoverage);
          const imageTargets = selectImageTargets(
            plan,
            preImageManifest,
            body.imageMode ?? "missing",
            imageCoverage,
            {
              quality: body.imageQuality ?? "low",
              size: defaultImageSizeForPlan(plan),
            },
          );
          await appendRunTrace(projectId, job.id, "images.targets_selected", {
            mode: body.imageMode ?? "missing",
            coverage: imageCoverage,
            targetCount: imageTargets.length,
            targets: imageTargets.map((target) => ({
              assetId: target.assetId,
              beatId: target.beat.id,
              sectionId: target.section.id,
              beatOrder: target.beat.order,
            })),
            manifestBefore: summarizeManifestForTrace(preImageManifest),
          }).catch(() => {});
          const imageResult = await generateProjectImages(projectId, {
            mode: body.imageMode ?? "missing",
            coverage: imageCoverage,
            quality: body.imageQuality ?? "low",
            size: defaultImageSizeForPlan(plan),
          });
          await appendRunTrace(projectId, job.id, "images.complete", {
            generatedCount: imageResult.generated.length,
            failedCount: imageResult.failed?.length ?? 0,
            skipped: imageResult.skipped,
            generated: imageResult.generated.map((entry) => ({
              assetId: entry.assetId,
              beatId: entry.beatId,
              sectionId: entry.sectionId,
              path: entry.path,
              version: entry.version,
              reusedFrom: entry.reusedFrom,
            })),
            failed: imageResult.failed ?? [],
            snapshot: await readProjectTraceSnapshot(projectId),
          }).catch(() => {});
          job.completed += 1;
          job.output.push(
            `Images:\nGenerated ${imageResult.generated.length}; failed ${imageResult.failed?.length ?? 0}.`,
          );
          await writeDraftJobState(projectId, job);
        } else {
          await appendRunTrace(projectId, job.id, "images.skipped", {
            reason: "imageEnabled=false",
            snapshot: await readProjectTraceSnapshot(projectId),
          }).catch(() => {});
          job.output.push("Images:\nSkipped for this draft run.");
        }

        await generateDraftAudioBySection(projectId, job, plan, plan.providers.transcription);

        await writeDraftJobState(projectId, job, {
          phase: "check",
          label: "Running quality check",
        });
        const checkResult = await domainOps
          .check(projectId)
          .then((result) => ({
            ok: true,
            stdout: JSON.stringify(result, null, 2),
          }))
          .catch((error) => ({
            ok: false,
            stdout: error instanceof Error ? error.message : String(error),
          }));
        await appendRunTrace(projectId, job.id, "quality_check.complete", {
          ok: checkResult.ok,
          stdout: checkResult.stdout.trim().slice(0, 12000),
        }).catch(() => {});
        job.completed += 1;
        job.output.push(
          `${checkResult.ok ? "Quality check" : "Quality check warnings/errors"}:\n${checkResult.stdout.trim()}`,
        );

        await writeDraftJobState(projectId, job, {
          phase: "render",
          label: "Rendering draft video",
        });
        await appendRunTrace(
          projectId,
          job.id,
          "render.start",
          await readProjectTraceSnapshot(projectId),
        ).catch(() => {});
        await runRetriedDraftStep(projectId, job, "Render draft", () =>
          domainOps.render({ projectId, quality: "draft", force: true }),
        );
        await appendRunTrace(
          projectId,
          job.id,
          "render.complete",
          await readProjectTraceSnapshot(projectId),
        ).catch(() => {});

        const planHash = sha256(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
        const timelineHash = sha256(
          await readFile(path.join(projectDir, "timeline.json"), "utf8").catch(() => ""),
        );
        const output = job.output.join("\n\n").trim();
        await appendRunTrace(projectId, job.id, "draft_job.complete", {
          planHash,
          timelineHash,
          outputChars: output.length,
        }).catch(() => {});
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "draft_job",
          summary: "Background draft job completed.",
          output,
        });
        job.status = "completed";
        job.phase = "done";
        job.label = "Draft video is ready";
        job.completed = job.total;
        job.finishedAt = new Date().toISOString();
        await upsertRunJob(projectId, {
          ...jobProgress(job),
          updatedAt: new Date().toISOString(),
        });
        await writeRunState(projectId, {
          ...(await readRunState(projectId)),
          lastRenderPlanHash: planHash,
          lastRenderTimelineHash: timelineHash,
          lastRenderQuality: "draft",
          lastRenderCompletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await writeAgentHandoff?.(projectId, job, {
          summary: job.label,
          nextAction: "Review the draft render and quality output before finalizing.",
        });
        activeDraftJobs.delete(projectId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cancelled = job.cancelRequested === true || /cancelled by user/i.test(message);
        await appendRunTrace(projectId, job.id, "draft_job.failed", {
          message,
          output: job.output.join("\n\n").slice(0, 12000),
        }).catch(() => {});
        job.status = cancelled ? "failed" : "failed";
        job.phase = cancelled ? "stopped" : job.phase;
        job.error = cancelled ? "Draft job cancelled by user." : message;
        job.finishedAt = new Date().toISOString();
        job.output.push(
          cancelled ? "Draft job cancelled by user." : `Draft job failed:\n${message}`,
        );
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: cancelled ? "draft_job_cancelled" : "draft_job_failed",
          summary: cancelled ? "Background draft job cancelled." : "Background draft job failed.",
          output: job.output.join("\n\n").trim(),
        }).catch(() => {});
        await writeDraftJobState(projectId, job);
        await writeAgentHandoff?.(projectId, job, {
          summary: cancelled ? "Draft job cancelled." : "Draft job failed.",
          nextAction: cancelled
            ? "Restart Make Draft when ready."
            : "Inspect the error and rerun after fixing the underlying issue.",
        });
        activeDraftJobs.delete(projectId);
      }
    }).catch(() => {});

    return jobProgress(job);
  };
}

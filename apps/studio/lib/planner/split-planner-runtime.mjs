export function createSplitPlannerRuntime(deps) {
  const {
    plannerSplitDecision,
    splitPlannerConfig,
    defaultPlannerUserPromptTemplate,
    appendDraftTraceAndState,
    plannerProgressLabel,
    buildLockedPlanFromStory,
    appendRunTrace,
    splitPlannerSectionAttempts,
    generatePlanDraftWithOpenAi,
    isOpenAiInsufficientQuotaError,
    sleep,
    fallbackMetadataForLockedSection,
    mergeSectionMetadataPlan,
    planNarrationHealth,
    assertLockedNarrationPreserved,
  } = deps;

  function plannerProgressTracer(projectId, job, prefix, strictness) {
    let lastHeartbeatSecond = -1;
    return async (progress) => {
      const elapsedSecond = Math.round(Number(progress.elapsedMs ?? 0) / 1000);
      if (progress.event === "request.heartbeat" && elapsedSecond - lastHeartbeatSecond < 10)
        return;
      if (progress.event === "request.heartbeat") lastHeartbeatSecond = elapsedSecond;
      await appendDraftTraceAndState(
        projectId,
        job,
        `planning.${progress.event}`,
        {
          strictness,
          model: progress.model,
          attempt: progress.attempt,
          attempts: progress.attempts,
          modelIndex: progress.modelIndex,
          modelCount: progress.modelCount,
          elapsedMs: progress.elapsedMs,
          timeoutMs: progress.timeoutMs,
          message: progress.message,
        },
        {
          phase: "planning",
          label: plannerProgressLabel(prefix, progress),
        },
      );
    };
  }

  function stricterPlannerUserPromptTemplate() {
    return [
      defaultPlannerUserPromptTemplate,
      "",
      "Hard quality gates:",
      "- Source script wording is locked: no paraphrase, no additions, no deletions, no reordering.",
      "- Never output placeholders, templates, TODO text, or instructions in narration.",
      "- Keep narration semantically complete; do not aggressively summarize away key events.",
      "- Preserve the story events in order. Do not summarize away major turns, reveals, or consequences.",
      "- Mark imageChangeDecision=change on most major narrative turns and reveals; avoid long runs of hold unless intentionally static.",
      "- Do not inject channel CTA lines (like/subscribe/follow) unless they are explicitly present in source story.",
      "- Never place intro hook lines like 'now let's get into today's story' near the ending.",
      "- Set quality.containsInventedChannelCta=true if narration includes any channel CTA that was not in the source.",
      "- Set quality.introHookPlacement=late_or_ending if an intro hook appears after the opening.",
    ].join("\n");
  }

  function splitPlannerEnabled(body = {}, story = "") {
    return plannerSplitDecision(body, story, splitPlannerConfig).enabled;
  }

  async function generateSplitPlanDraftWithOpenAi({
    story,
    currentPlan,
    feel,
    pacing,
    visualStyle,
    format,
    systemPrompt,
    userPromptTemplate,
    onProgress,
    projectId,
    job,
  }) {
    const lockedPlan = buildLockedPlanFromStory(currentPlan, story, { feel, pacing, visualStyle });
    let mergedPlan = lockedPlan;
    const models = [];
    const warnings = [];
    let globalQuality = {
      estimatedSourceCoverageRatio: 1,
      containsInventedChannelCta: false,
      introHookPlacement: "opening",
      orderingConfidence: 1,
      coverageNotes:
        "Source script narration was locked locally; LLM calls added section metadata only.",
    };

    for (let sectionIndex = 0; sectionIndex < lockedPlan.sections.length; sectionIndex += 1) {
      const section = lockedPlan.sections[sectionIndex];
      if (projectId && job?.id)
        await appendRunTrace(projectId, job.id, "planning.split_section.start", {
          sectionIndex,
          sectionId: section.id,
          sectionTitle: section.title,
          beatCount: section.beats.length,
        }).catch(() => {});
      const sectionStory = section.beats.map((beat) => `[${beat.id}] ${beat.narration}`).join("\n");
      const sectionPromptTemplate = [
        userPromptTemplate || defaultPlannerUserPromptTemplate,
        "",
        "Split planner section mode:",
        "- The bracketed beat IDs and narration are locked source text.",
        "- Return metadata for these beats in the same order.",
        "- Do not add, remove, combine, split, rewrite, or reorder beat narration.",
        "- Use the existing global visual bible if present; do not rename existing character/location/object IDs.",
      ].join("\n");
      let draft;
      let lastError;
      for (let attempt = 1; attempt <= splitPlannerSectionAttempts; attempt += 1) {
        try {
          if (projectId && job?.id)
            await appendRunTrace(projectId, job.id, "planning.split_section.attempt", {
              sectionIndex,
              sectionId: section.id,
              attempt,
              attempts: splitPlannerSectionAttempts,
            }).catch(() => {});
          draft = await generatePlanDraftWithOpenAi({
            story: sectionStory,
            currentPlan: {
              ...mergedPlan,
              sections: [section],
            },
            feel,
            pacing,
            visualStyle,
            format,
            systemPrompt,
            userPromptTemplate: sectionPromptTemplate,
            onProgress,
          });
          break;
        } catch (error) {
          lastError = error;
          if (projectId && job?.id)
            await appendRunTrace(projectId, job.id, "planning.split_section.failed_attempt", {
              sectionIndex,
              sectionId: section.id,
              attempt,
              attempts: splitPlannerSectionAttempts,
              error: error instanceof Error ? error.message : String(error),
            }).catch(() => {});
          if (isOpenAiInsufficientQuotaError(error)) {
            if (projectId && job?.id)
              await appendRunTrace(projectId, job.id, "planning.split_section.terminal_error", {
                sectionIndex,
                sectionId: section.id,
                attempt,
                attempts: splitPlannerSectionAttempts,
                error: error instanceof Error ? error.message : String(error),
              }).catch(() => {});
            throw error;
          }
          if (attempt < splitPlannerSectionAttempts) await sleep(750 * attempt);
        }
      }
      if (!draft) {
        const message = `Section ${sectionIndex + 1} (${section.title}) metadata planner failed after ${splitPlannerSectionAttempts} attempt(s); using deterministic fallback metadata.`;
        warnings.push(message);
        if (job) job.output.push(message);
        mergedPlan = fallbackMetadataForLockedSection(mergedPlan, sectionIndex, lastError);
        if (projectId && job?.id)
          await appendRunTrace(projectId, job.id, "planning.split_section.recovered_fallback", {
            sectionIndex,
            sectionId: section.id,
            sectionTitle: section.title,
            attempts: splitPlannerSectionAttempts,
            error: lastError instanceof Error ? lastError.message : String(lastError),
          }).catch(() => {});
        continue;
      }
      models.push(draft.model);
      warnings.push(...(draft.warnings ?? []));
      if (sectionIndex === 0) {
        mergedPlan = {
          ...mergedPlan,
          title: draft.plan.title || mergedPlan.title,
          voice: draft.plan.voice || mergedPlan.voice,
          visualBible: draft.plan.visualBible || mergedPlan.visualBible,
          direction: draft.plan.direction || mergedPlan.direction,
          directionMeta: draft.plan.directionMeta || mergedPlan.directionMeta,
          overrides: draft.plan.overrides || mergedPlan.overrides,
        };
      }
      mergedPlan = mergeSectionMetadataPlan(mergedPlan, sectionIndex, draft.plan);
      if (projectId && job?.id)
        await appendRunTrace(projectId, job.id, "planning.split_section.complete", {
          sectionIndex,
          sectionId: section.id,
          sectionTitle: section.title,
          model: draft.model,
          warnings: draft.warnings ?? [],
        }).catch(() => {});
      const quality = planNarrationHealth(mergedPlan, story, draft.quality);
      globalQuality = {
        ...globalQuality,
        orderingConfidence: Math.min(
          globalQuality.orderingConfidence,
          quality.plannerSelfReview?.orderingConfidence ?? 1,
        ),
        coverageNotes: `${globalQuality.coverageNotes} Section ${sectionIndex + 1}: ${draft.quality?.coverageNotes || "metadata generated."}`,
      };
    }

    assertLockedNarrationPreserved(mergedPlan, lockedPlan);
    return {
      plan: mergedPlan,
      quality: globalQuality,
      warnings,
      model: [...new Set(models)].join("+") || "split-local",
    };
  }

  return {
    plannerProgressTracer,
    stricterPlannerUserPromptTemplate,
    splitPlannerEnabled,
    generateSplitPlanDraftWithOpenAi,
  };
}

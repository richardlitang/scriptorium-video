import { parseModelFallbacks, runStructuredOutput } from "./openai-structured-output.mjs";
import {
  DEFAULT_PLANNER_SYSTEM_PROMPT,
  DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
} from "./planner-defaults.mjs";
import { PlanDraftSchema as CORE_PLAN_DRAFT_SCHEMA } from "../../../packages/core/src/schemas/plan-draft.schema.mjs";

export const PLAN_DRAFT_SCHEMA = CORE_PLAN_DRAFT_SCHEMA;

function fillPlannerTemplate(template, values) {
  const source = String(template || DEFAULT_PLANNER_USER_PROMPT_TEMPLATE);
  return source.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
}

export function resolvePlannerRequestConfig(env = {}) {
  const model = env.OPENAI_PLANNER_MODEL ?? "gpt-5.4-mini";
  const fallbackModels = parseModelFallbacks(
    env.OPENAI_PLANNER_FALLBACK_MODELS ?? "gpt-5-mini,gpt-4.1-mini",
  );
  const timeoutMs = (() => {
    const plannerTimeout = Number(env.OPENAI_PLANNER_REQUEST_TIMEOUT_MS);
    if (Number.isFinite(plannerTimeout)) return plannerTimeout;
    const requestTimeout = Number(env.OPENAI_REQUEST_TIMEOUT_MS);
    return Number.isFinite(requestTimeout) ? requestTimeout : 300000;
  })();
  const maxAttempts = (() => {
    const value = Number(env.OPENAI_PLANNER_REQUEST_MAX_ATTEMPTS);
    return Number.isFinite(value) ? value : 1;
  })();
  return { model, fallbackModels, timeoutMs, maxAttempts };
}

export function createPlanDraftOrchestrator({
  fetchImpl = fetch,
  getOpenAiApiKey,
  buildPlanFromAiDraft,
  studioTestMode = false,
  openAiResponsesUrl,
  plannerRequestConfig = resolvePlannerRequestConfig({}),
}) {
  if (typeof getOpenAiApiKey !== "function")
    throw new Error("createPlanDraftOrchestrator requires getOpenAiApiKey function.");
  if (typeof buildPlanFromAiDraft !== "function")
    throw new Error("createPlanDraftOrchestrator requires buildPlanFromAiDraft function.");

  return async function generatePlanDraftWithOpenAi({
    story,
    currentPlan,
    feel,
    pacing,
    visualStyle,
    format,
    systemPrompt,
    userPromptTemplate,
    onProgress,
  }) {
    if (studioTestMode) {
      return {
        plan: buildPlanFromAiDraft(currentPlan, {
          title: currentPlan.title || "Test Plan",
          voice: { voiceId: "alloy", speed: 0.92, direction: "engaged", language: "en" },
          visualBible: {
            stylePreset: "cinematic_illustration",
            lookAndFeel: "grounded",
            palette: ["#111111", "#f1f1f1"],
            eraAndLocation: "present day",
            characterAnchors: ["same protagonist"],
            characters: [
              {
                id: "protagonist",
                name: "Protagonist",
                role: "lead",
                age: "adult",
                body: "average build",
                face: "consistent facial structure",
                hair: "consistent hairstyle",
                wardrobe: "consistent outfit",
                avoid: "identity drift",
              },
            ],
            locations: [
              {
                id: "main-setting",
                name: "Main setting",
                description: "single consistent location language",
                continuityNotes: "keep scene geometry stable",
                avoid: "unrelated location swaps",
              },
            ],
            objects: [
              {
                id: "primary-prop",
                name: "Primary prop",
                description: "story-critical prop",
                continuityNotes: "preserve material and shape",
                avoid: "shape/material drift",
              },
            ],
            continuityRules: ["keep wardrobe stable"],
            negativePrompt: "watermarks",
          },
          captionTuning: {
            targetMaxWords: 14,
            hardMaxWords: 20,
            targetMaxDurationSeconds: 5,
            hardMaxDurationSeconds: 6.5,
            minWordsBeforeSentenceBreak: 8,
          },
          sections: [
            {
              title: "Intro",
              summary: "test",
              purpose: "test",
              beats: [
                {
                  narration: story.split(/\s+/).slice(0, 20).join(" ") || "test narration",
                  visualPrompt: "test visual",
                  estimatedDurationSeconds: 3,
                  motion: "slow_zoom_in",
                  imageChangeDecision: "change",
                  emphasis: ["test"],
                  notes: "test",
                  voiceProfile: "neutral",
                  intensity: 0.5,
                  pauseBeforeMs: 0,
                  pauseAfterMs: 100,
                  deliveryNote: "clear",
                  speedMultiplier: 1,
                  pitchOffset: 0,
                  voiceConfidence: 0.8,
                  narrationLanguage: "en",
                  ttsProvider: "chatterbox",
                  visualConfidence: 0.8,
                  shotType: "close up",
                  cameraDistance: "medium",
                  lighting: "low key",
                  lens: "35mm",
                  composition: "centered",
                  subjectContinuity: "same subject",
                  negativePromptAdditions: "none",
                  referenceIds: ["protagonist", "main-setting", "primary-prop"],
                  referencePriority: "high",
                  captionStyle: "default",
                  sfxCues: [],
                },
              ],
            },
          ],
          quality: {
            estimatedSourceCoverageRatio: 1,
            containsInventedChannelCta: false,
            introHookPlacement: "none",
            orderingConfidence: 1,
            coverageNotes: "Studio test mode.",
          },
          warnings: [],
        }),
        quality: {
          estimatedSourceCoverageRatio: 1,
          containsInventedChannelCta: false,
          introHookPlacement: "none",
          orderingConfidence: 1,
          coverageNotes: "Studio test mode.",
        },
        warnings: [],
        model: "test-mode",
      };
    }

    const apiKey = await getOpenAiApiKey();
    const { model, fallbackModels, timeoutMs, maxAttempts } = plannerRequestConfig;
    const promptValues = {
      story,
      currentTitle: currentPlan.title,
      feel,
      pacing,
      visualStyle,
      format,
      target:
        "short horror/story video with per-beat narration and image-generation-ready visual prompts",
    };
    const resolvedSystemPrompt =
      String(systemPrompt || DEFAULT_PLANNER_SYSTEM_PROMPT).trim() || DEFAULT_PLANNER_SYSTEM_PROMPT;
    let resolvedUserPrompt = fillPlannerTemplate(userPromptTemplate, promptValues).trim();
    if (!resolvedUserPrompt.includes(promptValues.story)) {
      resolvedUserPrompt = `${resolvedUserPrompt}\n\nStory:\n${promptValues.story}`.trim();
    }

    const draft = await runStructuredOutput({
      fetchImpl,
      url: openAiResponsesUrl,
      apiKey,
      model,
      input: [
        { role: "system", content: resolvedSystemPrompt },
        { role: "user", content: resolvedUserPrompt },
      ],
      schemaName: "video_plan_draft",
      schema: PLAN_DRAFT_SCHEMA,
      errorLabel: "OpenAI planner request failed",
      timeoutMs,
      maxAttempts,
      fallbackModels,
      onProgress,
    });

    return {
      plan: buildPlanFromAiDraft(currentPlan, draft),
      quality: draft.quality,
      warnings: draft.warnings,
      model: draft.__model ?? model,
    };
  };
}

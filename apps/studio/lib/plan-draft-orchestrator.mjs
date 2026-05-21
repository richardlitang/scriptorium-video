import { parseModelFallbacks, runStructuredOutput } from "./openai-structured-output.mjs";

export const DEFAULT_PLANNER_SYSTEM_PROMPT =
  "Convert story prose into a concise video production plan with deliberate section and beat segmentation. Preserve wording except light segmentation. Treat sections as narrative arcs, setting/time shifts, or major topic turns. Treat beats as edit units: one visual moment plus one spoken thought. Keep visual continuity (character age/look, setting, style) across beats. Use concrete visual descriptions, avoid generic abstractions, fake text, and continuity drift. Treat user-provided Feel, Pacing, and Visual style as hard constraints. Do not introduce contradictory visual media, realism levels, or style directions. Keep voice direction engaged and language-appropriate. Return JSON only.";

export const DEFAULT_PLANNER_USER_PROMPT_TEMPLATE = [
  "Story:",
  "{{story}}",
  "",
  "Current title: {{currentTitle}}",
  "Feel: {{feel}}",
  "Pacing: {{pacing}}",
  "Visual style: {{visualStyle}}",
  "Format: {{format}}",
  "Target: {{target}}",
  "",
  "Output requirements:",
  "- Segment the story intentionally before writing beat details.",
  "- A section is a coherent narrative arc, setting/time shift, or major topic turn with a clear purpose.",
  "- A beat is an edit unit: one visual moment plus one spoken thought, not a mechanical line or sentence split.",
  "- For short/story videos, prefer beats around 2-6 seconds and roughly 6-20 spoken words; allow longer only for unusually dense context.",
  "- Split beats at hooks, reversals, quote turns, discoveries, punchlines, and reveals where the edit or delivery should breathe.",
  "- Use millisecond pause controls for delivery precision: pauseBeforeMs and pauseAfterMs per beat (0-1200).",
  "- Do not create one-word beats unless that single word is intentionally the reveal or punchline.",
  "- Build a reusable visual bible for consistency.",
  "- Set section-level creative direction (feel, pacing, visual style) so sections can vary while staying coherent.",
  "- Produce per-beat narration + image-generation-ready visual prompts.",
  "- Treat Feel, Pacing, and Visual style as creative direction for every beat.",
  "- If Feel, Pacing, or Visual style is blank, infer a concise story-appropriate value and keep it consistent.",
  "- Enforce Visual style literally; do not add a visual medium, realism level, or style direction that conflicts with it.",
  "- Decide image changes globally across the whole video, not per section quota. Mark each beat imageChangeDecision as change or hold.",
  "- For every beat set voiceProfile, intensity, pauseBeforeMs, pauseAfterMs, pauseBeforeSeconds, pauseAfterSeconds, deliveryNote, and caption emphasis.",
  "- Also set speedMultiplier and pitchOffset per beat for better delivery control.",
  "- For every beat set narrationLanguage as a BCP-47-ish code such as en, fil, tgl, en+fil, or mixed.",
  "- For every beat set ttsProvider for the majority spoken language of the whole beat: use chatterbox for mostly English narration, including English beats with short Tagalog quotes; use mms only when the beat narration itself is mostly Filipino/Tagalog; use openai only when neither local provider is appropriate.",
  "- Include voiceConfidence and visualConfidence (0-1). Use conservative defaults when uncertain.",
  "- Provide shot metadata (shotType, cameraDistance, lighting, lens, composition, subjectContinuity, negativePromptAdditions).",
  "- Decide sparse editorial timing: visualEditCues, silenceWindows, and endingPolicy for retention-focused switches/effects only where appropriate.",
  "- Do not let images spoil narration: do not reveal a visual clue, object, character, or ending image before the narration reaches that beat.",
  "- Use visualEditCues for effects on the current beat only: current_visual for push_in/slow_pan/hard_cut/smash_cut, and black only for cut_to_black/hold_black.",
  "- Keep visualEditCues sparse: normally 0-2 per beat, up to 4 only for a major reveal or ending.",
  "- Match narration tone to scene intent per beat. Use hushed restraint for dread, warmer delivery for setup, sharper emphasis for reveals, and avoid cheerful or generic narration on tense scenes.",
  "- Use pauses around hooks, reveals, and emotional turns. Keep them subtle unless needed.",
  "- Add optional sfxCues only when they improve clarity; keep cues sparse and practical.",
  "- Fill quality from your own audit of the plan against the provided story: estimate source coverage, flag invented channel CTAs, and classify intro hook placement.",
  "- Surface warnings when uncertain or under-specified."
].join("\n");

const PLAN_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "feel", "pacing", "visualStyle", "captionTuning", "voice", "visualBible", "quality", "sections", "warnings"],
  properties: {
    title: { type: "string" },
    feel: { type: "string" },
    pacing: { type: "string" },
    visualStyle: { type: "string" },
    captionTuning: {
      type: "object",
      additionalProperties: false,
      required: ["targetMaxWords", "hardMaxWords", "targetMaxDurationSeconds", "hardMaxDurationSeconds", "minWordsBeforeSentenceBreak"],
      properties: {
        targetMaxWords: { type: "number", minimum: 4, maximum: 30 },
        hardMaxWords: { type: "number", minimum: 6, maximum: 40 },
        targetMaxDurationSeconds: { type: "number", minimum: 1.5, maximum: 12 },
        hardMaxDurationSeconds: { type: "number", minimum: 2, maximum: 14 },
        minWordsBeforeSentenceBreak: { type: "number", minimum: 2, maximum: 20 }
      }
    },
    voice: {
      type: "object",
      additionalProperties: false,
      required: ["voiceId", "speed", "direction", "language"],
      properties: {
        voiceId: { type: "string", enum: ["alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse"] },
        speed: { type: "number" },
        direction: { type: "string" },
        language: { type: "string" }
      }
    },
    visualBible: {
      type: "object",
      additionalProperties: false,
      required: ["stylePreset", "lookAndFeel", "palette", "eraAndLocation", "characterAnchors", "continuityRules", "negativePrompt"],
      properties: {
        stylePreset: { type: "string" },
        lookAndFeel: { type: "string" },
        palette: { type: "array", items: { type: "string" } },
        eraAndLocation: { type: "string" },
        characterAnchors: { type: "array", items: { type: "string" } },
        continuityRules: { type: "array", items: { type: "string" } },
        negativePrompt: { type: "string" }
      }
    },
    quality: {
      type: "object",
      additionalProperties: false,
      required: ["estimatedSourceCoverageRatio", "containsInventedChannelCta", "introHookPlacement", "orderingConfidence", "coverageNotes"],
      properties: {
        estimatedSourceCoverageRatio: { type: "number", minimum: 0, maximum: 1 },
        containsInventedChannelCta: { type: "boolean" },
        introHookPlacement: { type: "string", enum: ["none", "opening", "middle", "late_or_ending"] },
        orderingConfidence: { type: "number", minimum: 0, maximum: 1 },
        coverageNotes: { type: "string" }
      }
    },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "purpose", "feel", "pacing", "visualStyle", "beats"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          purpose: { type: "string" },
          feel: { type: "string" },
          pacing: { type: "string" },
          visualStyle: { type: "string" },
          beats: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["narration", "visualPrompt", "estimatedDurationSeconds", "motion", "imageChangeDecision", "emphasis", "notes", "voiceProfile", "intensity", "pauseBeforeMs", "pauseAfterMs", "pauseBeforeSeconds", "pauseAfterSeconds", "deliveryNote", "speedMultiplier", "pitchOffset", "voiceConfidence", "narrationLanguage", "ttsProvider", "visualConfidence", "captionStyle", "shotType", "cameraDistance", "lighting", "lens", "composition", "subjectContinuity", "negativePromptAdditions", "sfxCues", "visualEditCues", "silenceWindows", "endingPolicy"],
              properties: {
                narration: { type: "string" },
                visualPrompt: { type: "string" },
                estimatedDurationSeconds: { type: "number" },
                motion: { type: "string", enum: ["none", "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right"] },
                imageChangeDecision: { type: "string", enum: ["change", "hold"] },
                emphasis: { type: "array", items: { type: "string" } },
                notes: { type: "string" },
                voiceProfile: { type: "string", enum: ["neutral", "warm_open", "clear_explainer", "authoritative", "energetic", "key_point", "reflective", "tense", "reveal", "urgent", "soft_close"] },
                intensity: { type: "number" },
                pauseBeforeMs: { type: "number" },
                pauseAfterMs: { type: "number" },
                pauseBeforeSeconds: { type: "number" },
                pauseAfterSeconds: { type: "number" },
                deliveryNote: { type: "string" },
                speedMultiplier: { type: "number" },
                pitchOffset: { type: "number" },
                voiceConfidence: { type: "number" },
                narrationLanguage: { type: "string" },
                ttsProvider: { type: "string", enum: ["chatterbox", "mms", "openai"] },
                visualConfidence: { type: "number" },
                captionStyle: { type: "string" },
                shotType: { type: "string" },
                cameraDistance: { type: "string" },
                lighting: { type: "string" },
                lens: { type: "string" },
                composition: { type: "string" },
                subjectContinuity: { type: "string" },
                negativePromptAdditions: { type: "string" },
                sfxCues: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "kind", "placement", "offsetSeconds", "levelDb", "pan", "proximity", "duckMusic"],
                    properties: {
                      id: { type: "string" },
                      kind: { type: "string" },
                      placement: { type: "string", enum: ["beat_start", "beat_end", "key_point", "manual"] },
                      offsetSeconds: { type: "number" },
                      levelDb: { type: "number" },
                      pan: { type: "number" },
                      proximity: { type: "string", enum: ["distant", "room", "close", "close_mic"] },
                      duckMusic: { type: "boolean" }
                    }
                  }
                },
                visualEditCues: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "type", "placement", "offsetSeconds", "durationSeconds", "target", "intensity"],
                    properties: {
                      id: { type: "string" },
                      type: { type: "string", enum: ["smash_cut", "cut_to_black", "hold_black", "j_cut", "l_cut", "slow_pan", "push_in", "hard_cut", "match_cut"] },
                      placement: { type: "string", enum: ["beat_start", "beat_end", "key_point", "manual"] },
                      offsetSeconds: { type: "number" },
                      durationSeconds: { type: "number" },
                      target: { type: "string", enum: ["black", "current_visual", "next_visual"] },
                      intensity: { type: "number" }
                    }
                  }
                },
                silenceWindows: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "placement", "offsetSeconds", "durationSeconds", "muteMusic", "muteSfx", "keepVoice"],
                    properties: {
                      id: { type: "string" },
                      placement: { type: "string", enum: ["beat_start", "beat_end", "before_reveal", "manual"] },
                      offsetSeconds: { type: "number" },
                      durationSeconds: { type: "number" },
                      muteMusic: { type: "boolean" },
                      muteSfx: { type: "boolean" },
                      keepVoice: { type: "boolean" }
                    }
                  }
                },
                endingPolicy: {
                  type: "object",
                  additionalProperties: false,
                  required: ["cutToBlack", "holdSeconds", "audioPolicy", "avoidOutro"],
                  properties: {
                    cutToBlack: { type: "boolean" },
                    holdSeconds: { type: "number" },
                    audioPolicy: { type: "string", enum: ["hard_silence", "fade_out", "none"] },
                    avoidOutro: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
};

function fillPlannerTemplate(template, values) {
  const source = String(template || DEFAULT_PLANNER_USER_PROMPT_TEMPLATE);
  return source.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function createPlanDraftOrchestrator({ fetchImpl = fetch, getOpenAiApiKey, buildPlanFromAiDraft, studioTestMode = false, openAiResponsesUrl }) {
  if (typeof getOpenAiApiKey !== "function") throw new Error("createPlanDraftOrchestrator requires getOpenAiApiKey function.");
  if (typeof buildPlanFromAiDraft !== "function") throw new Error("createPlanDraftOrchestrator requires buildPlanFromAiDraft function.");

  return async function generatePlanDraftWithOpenAi({ story, currentPlan, feel, pacing, visualStyle, format, systemPrompt, userPromptTemplate, onProgress }) {
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
            continuityRules: ["keep wardrobe stable"],
            negativePrompt: "watermarks"
          },
          captionTuning: {
            targetMaxWords: 14,
            hardMaxWords: 20,
            targetMaxDurationSeconds: 5,
            hardMaxDurationSeconds: 6.5,
            minWordsBeforeSentenceBreak: 8
          },
          sections: [{
            title: "Intro",
            summary: "test",
            purpose: "test",
            beats: [{
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
              pauseBeforeSeconds: 0,
              pauseAfterSeconds: 0.1,
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
              captionStyle: "default",
              sfxCues: []
            }]
          }],
          quality: {
            estimatedSourceCoverageRatio: 1,
            containsInventedChannelCta: false,
            introHookPlacement: "none",
            orderingConfidence: 1,
            coverageNotes: "Studio test mode."
          },
          warnings: []
        }),
        quality: {
          estimatedSourceCoverageRatio: 1,
          containsInventedChannelCta: false,
          introHookPlacement: "none",
          orderingConfidence: 1,
          coverageNotes: "Studio test mode."
        },
        warnings: [],
        model: "test-mode"
      };
    }

    const apiKey = await getOpenAiApiKey();
    const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-5.4-mini";
    const fallbackModels = parseModelFallbacks(process.env.OPENAI_PLANNER_FALLBACK_MODELS ?? "gpt-5.4-nano,gpt-5-mini,gpt-4.1-mini,gpt-4o-mini");
    const timeoutMs = envNumber("OPENAI_PLANNER_REQUEST_TIMEOUT_MS", envNumber("OPENAI_REQUEST_TIMEOUT_MS", 90000));
    const maxAttempts = envNumber("OPENAI_PLANNER_REQUEST_MAX_ATTEMPTS", 1);
    const promptValues = {
      story,
      currentTitle: currentPlan.title,
      feel,
      pacing,
      visualStyle,
      format,
      target: "short horror/story video with per-beat narration and image-generation-ready visual prompts"
    };
    const resolvedSystemPrompt = String(systemPrompt || DEFAULT_PLANNER_SYSTEM_PROMPT).trim() || DEFAULT_PLANNER_SYSTEM_PROMPT;
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
        { role: "user", content: resolvedUserPrompt }
      ],
      schemaName: "video_plan_draft",
      schema: PLAN_DRAFT_SCHEMA,
      errorLabel: "OpenAI planner request failed",
      timeoutMs,
      maxAttempts,
      fallbackModels,
      onProgress
    });

    return {
      plan: buildPlanFromAiDraft(currentPlan, draft),
      quality: draft.quality,
      warnings: draft.warnings,
      model: draft.__model ?? model
    };
  };
}

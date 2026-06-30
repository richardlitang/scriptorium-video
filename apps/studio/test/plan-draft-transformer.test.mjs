import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlanDraftTransformer } from "../lib/draft/plan-draft-transformer.mjs";

const deps = {
  slugify: (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  estimateDurationSeconds: () => 4,
  clampNumber: (v, fb, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.min(max, Math.max(min, n));
  },
};

function currentPlan() {
  return {
    schemaVersion: 1,
    title: "old",
    mode: "short_story",
    stylePackId: "default",
    providers: {
      tts: "mock",
      transcription: "mock",
      media: "manual-media",
      renderer: "remotion",
      llm: "manual",
    },
    voice: { provider: "mock", voiceId: "x", format: "mp3", options: {} },
    sections: [],
  };
}

function draft() {
  return {
    title: "New Title",
    feel: "tense",
    pacing: "brisk",
    visualStyle: "cinematic anime",
    captionTuning: {},
    voice: { voiceId: "sage", speed: 0.92, direction: "warm", language: "en" },
    visualBible: {
      stylePreset: "cinematic_illustration",
      lookAndFeel: "painterly",
      palette: ["amber"],
      eraAndLocation: "forest",
      characterAnchors: ["Mara"],
      characters: [
        {
          id: "c1",
          name: "Mara",
          role: "lead",
          age: "30s",
          body: "tall",
          face: "freckles",
          hair: "red braid",
          wardrobe: "green cloak",
          avoid: "",
        },
      ],
      locations: [
        {
          id: "l1",
          name: "Inn",
          description: "mossy roof",
          continuityNotes: "amber windows",
          avoid: "",
        },
      ],
      objects: [],
      continuityRules: ["keep braid"],
      negativePrompt: "no text",
    },
    quality: {},
    sections: [
      {
        title: "Open",
        summary: "",
        purpose: "",
        feel: "",
        pacing: "",
        visualStyle: "",
        beats: [
          {
            narration: "Mara enters the inn.",
            visualPrompt: "Mara at the inn door",
            estimatedDurationSeconds: 4,
            motion: "slow_zoom_in",
            imageChangeDecision: "change",
            emphasis: [],
            notes: "",
            voiceProfile: "neutral",
            intensity: 0.5,
            pauseBeforeMs: 0,
            pauseAfterMs: 0,
            deliveryNote: "",
            speedMultiplier: 1,
            pitchOffset: 0,
            voiceConfidence: 0.8,
            narrationLanguage: "en",
            ttsProvider: "chatterbox",
            visualConfidence: 0.8,
            captionStyle: "default",
            shotType: "wide",
            cameraDistance: "wide",
            lighting: "warm",
            lens: "35mm",
            composition: "centered",
            subjectContinuity: "Mara",
            negativePromptAdditions: "",
            scaleMode: "safe_cover",
            subjectPosition: "center",
            cropRisk: "medium",
            motionStrength: "subtle",
            referenceIds: ["c1", "l1"],
            referencePriority: "high",
            sfxCues: [],
            visualEditCues: [],
            silenceWindows: [],
            endingPolicy: {
              cutToBlack: false,
              holdSeconds: 0,
              audioPolicy: "none",
              avoidOutro: false,
            },
          },
        ],
      },
    ],
    warnings: [],
  };
}

test("transformer does not embed the visual bible prose into beats", () => {
  const { buildPlanFromAiDraft } = createPlanDraftTransformer(deps);
  const plan = buildPlanFromAiDraft(currentPlan(), draft());
  const beat = plan.sections[0].beats[0];
  const haystack = [beat.notes ?? "", beat.media?.[0]?.prompt ?? ""].join("\n");
  for (const banned of [
    "Character bible",
    "Location bible",
    "Object bible",
    "Style preset:",
    "Look and feel:",
  ]) {
    assert.equal(haystack.includes(banned), false, `beat text must not contain "${banned}"`);
  }
});

test("transformer carries structured bible and beat references onto the plan", () => {
  const { buildPlanFromAiDraft } = createPlanDraftTransformer(deps);
  const plan = buildPlanFromAiDraft(currentPlan(), draft());
  assert.equal(plan.visualBible.characters[0].id, "c1");
  assert.deepEqual(plan.sections[0].beats[0].visual.referenceIds, ["c1", "l1"]);
});

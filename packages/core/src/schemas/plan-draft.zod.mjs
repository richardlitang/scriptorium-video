import { z } from "zod";

// Canonical Zod source for the LLM plan-draft contract. The JSON Schema handed
// to OpenAI structured output is generated from this (see plan-draft.schema.mjs)
// so the shape has a single source of truth. Property order here is significant:
// it determines the `required` array order in the generated JSON Schema, which a
// fixture-equivalence test locks (test/plan-draft-schema-generation.test.mjs).

const captionTuning = z.object({
  targetMaxWords: z.number().min(4).max(30),
  hardMaxWords: z.number().min(6).max(40),
  targetMaxDurationSeconds: z.number().min(1.5).max(12),
  hardMaxDurationSeconds: z.number().min(2).max(14),
  minWordsBeforeSentenceBreak: z.number().min(2).max(20),
});

const voice = z.object({
  voiceId: z.enum([
    "alloy",
    "ash",
    "ballad",
    "cedar",
    "coral",
    "echo",
    "fable",
    "marin",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
  ]),
  speed: z.number(),
  direction: z.string(),
  language: z.string(),
});

const characterEntry = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  age: z.string(),
  body: z.string(),
  face: z.string(),
  hair: z.string(),
  wardrobe: z.string(),
  avoid: z.string(),
});

const placeEntry = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  continuityNotes: z.string(),
  avoid: z.string(),
});

const visualBible = z.object({
  stylePreset: z.string(),
  lookAndFeel: z.string(),
  palette: z.array(z.string()),
  eraAndLocation: z.string(),
  characterAnchors: z.array(z.string()),
  characters: z.array(characterEntry),
  locations: z.array(placeEntry),
  objects: z.array(placeEntry),
  continuityRules: z.array(z.string()),
  negativePrompt: z.string(),
});

const quality = z.object({
  estimatedSourceCoverageRatio: z.number().min(0).max(1),
  containsInventedChannelCta: z.boolean(),
  introHookPlacement: z.enum(["none", "opening", "middle", "late_or_ending"]),
  orderingConfidence: z.number().min(0).max(1),
  coverageNotes: z.string(),
});

const placement = z.enum(["beat_start", "beat_end", "key_point", "manual"]);

const sfxCue = z.object({
  id: z.string(),
  kind: z.string(),
  placement,
  offsetSeconds: z.number(),
  levelDb: z.number(),
  pan: z.number(),
  proximity: z.enum(["distant", "room", "close", "close_mic"]),
  duckMusic: z.boolean(),
});

const visualEditCue = z.object({
  id: z.string(),
  type: z.enum([
    "smash_cut",
    "cut_to_black",
    "hold_black",
    "j_cut",
    "l_cut",
    "slow_pan",
    "push_in",
    "hard_cut",
    "match_cut",
  ]),
  placement,
  offsetSeconds: z.number(),
  durationSeconds: z.number(),
  target: z.enum(["black", "current_visual", "next_visual"]),
  intensity: z.number(),
});

const silenceWindow = z.object({
  id: z.string(),
  placement: z.enum(["beat_start", "beat_end", "before_reveal", "manual"]),
  offsetSeconds: z.number(),
  durationSeconds: z.number(),
  muteMusic: z.boolean(),
  muteSfx: z.boolean(),
  keepVoice: z.boolean(),
});

const endingPolicy = z.object({
  cutToBlack: z.boolean(),
  holdSeconds: z.number(),
  audioPolicy: z.enum(["hard_silence", "fade_out", "none"]),
  avoidOutro: z.boolean(),
});

const beat = z.object({
  narration: z.string(),
  visualPrompt: z.string(),
  estimatedDurationSeconds: z.number(),
  motion: z.enum(["none", "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right"]),
  imageChangeDecision: z.enum(["change", "hold"]),
  emphasis: z.array(z.string()),
  notes: z.string(),
  voiceProfile: z.enum([
    "neutral",
    "warm_open",
    "clear_explainer",
    "authoritative",
    "energetic",
    "key_point",
    "reflective",
    "tense",
    "reveal",
    "urgent",
    "soft_close",
  ]),
  intensity: z.number(),
  pauseBeforeMs: z.number(),
  pauseAfterMs: z.number(),
  deliveryNote: z.string(),
  speedMultiplier: z.number(),
  pitchOffset: z.number(),
  voiceConfidence: z.number(),
  narrationLanguage: z.string(),
  ttsProvider: z.enum(["chatterbox", "mms", "openai"]),
  visualConfidence: z.number(),
  captionStyle: z.string(),
  shotType: z.string(),
  cameraDistance: z.string(),
  lighting: z.string(),
  lens: z.string(),
  composition: z.string(),
  subjectContinuity: z.string(),
  negativePromptAdditions: z.string(),
  scaleMode: z.enum(["safe_cover", "contain_blur", "cover", "contain", "stretch"]),
  subjectPosition: z.enum(["center", "upper_center", "lower_center", "left", "right"]),
  cropRisk: z.enum(["low", "medium", "high"]),
  motionStrength: z.enum(["subtle", "medium", "strong"]),
  referenceIds: z.array(z.string()),
  referencePriority: z.enum(["low", "medium", "high"]),
  sfxCues: z.array(sfxCue),
  visualEditCues: z.array(visualEditCue),
  silenceWindows: z.array(silenceWindow),
  endingPolicy,
});

const section = z.object({
  title: z.string(),
  summary: z.string(),
  purpose: z.string(),
  feel: z.string(),
  pacing: z.string(),
  visualStyle: z.string(),
  beats: z.array(beat).min(1),
});

export const PlanDraftZodSchema = z.object({
  title: z.string(),
  feel: z.string(),
  pacing: z.string(),
  visualStyle: z.string(),
  captionTuning,
  voice,
  visualBible,
  quality,
  sections: z.array(section).min(1),
  warnings: z.array(z.string()),
});

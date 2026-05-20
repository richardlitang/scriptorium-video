import { z } from "zod";

export const VideoModeSchema = z.enum([
  "short_story",
  "long_documentary",
  "tutorial_explainer",
  "product_demo",
  "podcast_clip"
]);

export const TargetPlatformSchema = z.enum([
  "youtube",
  "youtube_shorts",
  "tiktok",
  "instagram_reels",
  "linkedin",
  "portfolio_site",
  "local_only"
]);

export const ArtifactStatusSchema = z.enum([
  "missing",
  "generated",
  "edited",
  "locked_by_user",
  "stale",
  "failed"
]);

export const MotionSchema = z.object({
  type: z.enum([
    "none",
    "slow_zoom_in",
    "slow_zoom_out",
    "pan_left",
    "pan_right"
  ]).default("slow_zoom_in"),
  intensity: z.number().min(0).max(1).default(0.1)
}).strict();

export const SoundCueIntentSchema = z.object({
  id: z.string(),
  kind: z.string(),
  placement: z.enum(["beat_start", "beat_end", "key_point", "manual"]).default("manual"),
  offsetSeconds: z.number().min(-5).max(5).default(0),
  levelDb: z.number().min(-48).max(12).default(-16),
  pan: z.number().min(-1).max(1).default(0),
  proximity: z.enum(["distant", "room", "close", "close_mic"]).default("room"),
  duckMusic: z.boolean().default(false),
  assetId: z.string().optional()
}).strict();

export const EditorialCueSchema = z.object({
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
    "match_cut"
  ]),
  placement: z.enum(["beat_start", "beat_end", "key_point", "manual"]).default("manual"),
  offsetSeconds: z.number().min(-5).max(5).default(0),
  durationSeconds: z.number().min(0).max(8).default(0.4),
  target: z.enum(["black", "current_visual", "next_visual"]).default("current_visual"),
  intensity: z.number().min(0).max(1).default(0.5)
}).strict();

export const SilenceWindowSchema = z.object({
  id: z.string(),
  placement: z.enum(["beat_start", "beat_end", "before_reveal", "manual"]).default("manual"),
  offsetSeconds: z.number().min(-5).max(5).default(0),
  durationSeconds: z.number().min(0.1).max(5).default(0.8),
  muteMusic: z.boolean().default(true),
  muteSfx: z.boolean().default(true),
  keepVoice: z.boolean().default(false)
}).strict();

export const EndingPolicySchema = z.object({
  cutToBlack: z.boolean().default(false),
  holdSeconds: z.number().min(0).max(4).default(0),
  audioPolicy: z.enum(["hard_silence", "fade_out", "none"]).default("none"),
  avoidOutro: z.boolean().default(false)
}).strict();

export const BeatEditorialSchema = z.object({
  visualEditCues: z.array(EditorialCueSchema).default([]),
  silenceWindows: z.array(SilenceWindowSchema).default([]),
  endingPolicy: EndingPolicySchema.optional()
}).strict();

export const VisualIntentSchema = z.object({
  prompt: z.string().optional(),
  priority: z.number().int().min(1).max(5).default(3),
  needsUniqueImage: z.boolean().default(false),
  reusePolicy: z.union([
    z.literal("none"),
    z.literal("allow-reuse"),
    z.string().min(1)
  ]).default("allow-reuse"),
  coverageRole: z.enum(["anchor", "key_moment", "supporting", "none"]).default("supporting"),
  source: z.enum(["user", "llm", "default"]).default("default")
}).strict();

export const MediaIntentSchema = z.object({
  id: z.string(),
  type: z.enum([
    "image",
    "video",
    "screen_recording",
    "audio_visualizer",
    "solid_color",
    "title_card"
  ]),
  role: z.enum([
    "primary_visual",
    "background",
    "overlay",
    "broll",
    "screen"
  ]).default("primary_visual"),
  prompt: z.string().optional(),
  localPath: z.string().optional(),
  searchQuery: z.string().optional(),
  trimStartSeconds: z.number().nonnegative().optional(),
  trimEndSeconds: z.number().nonnegative().optional(),
  scaleMode: z.enum(["cover", "contain", "stretch"]).default("cover"),
  placement: z.enum(["background", "foreground", "overlay"]).default("background")
}).strict();

export const BeatTimingIntentSchema = z.object({
  estimatedDurationSeconds: z.number().positive().optional(),
  preferredMinSeconds: z.number().positive().optional(),
  preferredMaxSeconds: z.number().positive().optional(),
  locked: z.boolean().default(false),
  mediaPolicy: z.enum([
    "cut_to_audio",
    "loop_or_freeze",
    "fit_audio_to_media",
    "manual"
  ]).default("loop_or_freeze")
}).strict();

export const VoiceProfileSchema = z.enum([
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
  "soft_close"
]);

export const VoiceDirectionSchema = z.object({
  profile: VoiceProfileSchema.default("neutral"),
  deliveryNote: z.string().optional(),
  emphasis: z.array(z.string()).default([]),
  pauseBeforeSeconds: z.number().min(0).max(1.2).default(0),
  pauseAfterSeconds: z.number().min(0).max(1.2).default(0),
  intensity: z.number().min(0).max(1).default(0.5),
  speedMultiplier: z.number().min(0.6).max(1.5).default(1),
  pitchOffset: z.number().min(-6).max(6).default(0),
  language: z.string().optional(),
  ttsProvider: z.string().optional(),
  source: z.enum(["user", "llm", "default"]).default("default")
}).strict();

export const VoiceDirectionOverrideSchema = z.object({
  profile: VoiceProfileSchema.optional(),
  deliveryNote: z.string().optional(),
  emphasis: z.array(z.string()).optional(),
  pauseBeforeSeconds: z.number().min(0).max(1.2).optional(),
  pauseAfterSeconds: z.number().min(0).max(1.2).optional(),
  intensity: z.number().min(0).max(1).optional(),
  speedMultiplier: z.number().min(0.6).max(1.5).optional(),
  pitchOffset: z.number().min(-6).max(6).optional(),
  language: z.string().optional(),
  ttsProvider: z.string().optional(),
  source: z.enum(["user", "llm", "default"]).optional()
}).strict();

export const CaptionDirectionOverrideSchema = z.object({
  style: z.string().optional(),
  emphasis: z.array(z.string()).optional(),
  tuning: z.object({
    targetMaxWords: z.number().int().min(4).max(30).optional(),
    hardMaxWords: z.number().int().min(6).max(40).optional(),
    targetMaxDurationSeconds: z.number().min(1.5).max(12).optional(),
    hardMaxDurationSeconds: z.number().min(2).max(14).optional(),
    minWordsBeforeSentenceBreak: z.number().int().min(2).max(20).optional()
  }).strict().optional()
}).strict();

export const CreativeDirectionSchema = z.object({
  feel: z.string().optional(),
  pacing: z.string().optional(),
  visualStyle: z.string().optional(),
  tension: z.number().min(0).max(1).optional(),
  continuityStrictness: z.number().min(0).max(1).optional()
}).strict();

export const ProductionDirectionSchema = z.object({
  creative: CreativeDirectionSchema.optional(),
  voice: VoiceDirectionOverrideSchema.optional(),
  visual: VisualIntentSchema.optional(),
  caption: CaptionDirectionOverrideSchema.optional(),
  motion: MotionSchema.partial().strict().optional(),
  sfxCues: z.array(SoundCueIntentSchema).optional(),
  editorial: BeatEditorialSchema.optional()
}).strict();

export const DirectionMetaSchema = z.object({
  lockedPaths: z.array(z.string()).default([]),
  sources: z.record(z.string(), z.enum(["default", "llm", "inherited", "user"])).default({})
}).strict();

export const BeatSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  narration: z.string().min(1),
  timing: BeatTimingIntentSchema.default({
    locked: false,
    mediaPolicy: "loop_or_freeze"
  }),
  media: z.array(MediaIntentSchema).default([]),
  motion: MotionSchema.default({ type: "slow_zoom_in", intensity: 0.1 }),
  visual: VisualIntentSchema.optional(),
  caption: z.object({
    emphasis: z.array(z.string()).default([]),
    style: z.string().default("default")
  }).strict().default({ emphasis: [], style: "default" }),
  direction: ProductionDirectionSchema.optional(),
  directionMeta: DirectionMetaSchema.optional(),
  voiceDirection: VoiceDirectionSchema.optional(),
  sfxCues: z.array(SoundCueIntentSchema).default([]),
  editorial: BeatEditorialSchema.optional(),
  emotion: z.string().optional(),
  notes: z.string().optional()
}).strict();

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string().optional(),
  estimatedDurationSeconds: z.number().positive().optional(),
  direction: ProductionDirectionSchema.optional(),
  directionMeta: DirectionMetaSchema.optional(),
  beats: z.array(BeatSchema).min(1)
}).strict();

export const VoiceSchema = z.object({
  provider: z.string(),
  voiceId: z.string(),
  format: z.enum(["mp3", "wav", "m4a"]).default("mp3"),
  options: z.object({
    speed: z.number().optional(),
    pitch: z.number().optional(),
    emotion: z.string().optional(),
    stability: z.number().optional(),
    similarityBoost: z.number().optional(),
    language: z.string().optional()
  }).strict().default({})
}).strict();

export const VisualBibleSchema = z.object({
  stylePreset: z.string().default("cinematic_illustration"),
  lookAndFeel: z.string().optional(),
  palette: z.array(z.string()).default([]),
  eraAndLocation: z.string().optional(),
  characterAnchors: z.array(z.string()).default([]),
  continuityRules: z.array(z.string()).default([]),
  negativePrompt: z.string().optional()
}).strict();

export const VideoPlanSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  mode: VideoModeSchema,
  targetPlatform: TargetPlatformSchema.default("local_only"),
  stylePackId: z.string(),
  templateId: z.string().optional(),
  exportProfile: z.string().optional(),
  overrides: z.object({
    targetDurationSeconds: z.number().positive().optional(),
    fps: z.number().int().positive().optional(),
    aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
    resolution: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive()
    }).strict().optional(),
    captionTuning: z.object({
      targetMaxWords: z.number().int().min(4).max(30).optional(),
      hardMaxWords: z.number().int().min(6).max(40).optional(),
      targetMaxDurationSeconds: z.number().min(1.5).max(12).optional(),
      hardMaxDurationSeconds: z.number().min(2).max(14).optional(),
      minWordsBeforeSentenceBreak: z.number().int().min(2).max(20).optional()
    }).strict().optional()
  }).strict().default({}),
  providers: z.object({
    llm: z.string().default("manual"),
    tts: z.string(),
    transcription: z.string(),
    media: z.string().default("manual-media"),
    renderer: z.string().default("remotion")
  }).strict(),
  voice: VoiceSchema,
  visualBible: VisualBibleSchema.optional(),
  direction: ProductionDirectionSchema.optional(),
  directionMeta: DirectionMetaSchema.optional(),
  orchestration: z.object({
    version: z.literal(1).default(1),
    model: z.string().optional(),
    orchestratedAt: z.string().datetime().optional(),
    warnings: z.array(z.string()).default([])
  }).strict().optional(),
  sections: z.array(SectionSchema).min(1)
}).strict();

export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type SoundCueIntent = z.infer<typeof SoundCueIntentSchema>;
export type VisualIntent = z.infer<typeof VisualIntentSchema>;
export type VideoPlan = z.infer<typeof VideoPlanSchema>;

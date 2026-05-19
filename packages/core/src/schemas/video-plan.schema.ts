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
  assetId: z.string().optional()
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
  source: z.enum(["user", "llm", "default"]).default("default")
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
  caption: z.object({
    emphasis: z.array(z.string()).default([]),
    style: z.string().default("default")
  }).strict().default({ emphasis: [], style: "default" }),
  voiceDirection: VoiceDirectionSchema.optional(),
  sfxCues: z.array(SoundCueIntentSchema).default([]),
  emotion: z.string().optional(),
  notes: z.string().optional()
}).strict();

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string().optional(),
  estimatedDurationSeconds: z.number().positive().optional(),
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
  sections: z.array(SectionSchema).min(1)
}).strict();

export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type VideoPlan = z.infer<typeof VideoPlanSchema>;

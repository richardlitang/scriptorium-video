import { z } from "zod";

// ── Named enum schemas — import these to avoid redeclaring inline unions ──────
export const ScaleModeSchema = z.enum(["safe_cover", "contain_blur", "cover", "contain", "stretch"]);
export const SubjectPositionSchema = z.enum(["center", "upper_center", "lower_center", "left", "right"]);
export const CropRiskSchema = z.enum(["low", "medium", "high"]);
export const MotionTypeSchema = z.enum(["none", "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right"]);
export const MediaPolicySchema = z.enum(["cut_to_audio", "loop_or_freeze", "fit_audio_to_media", "manual"]);
export const VisualEditCueTypeSchema = z.enum([
  "smash_cut",
  "cut_to_black",
  "hold_black",
  "j_cut",
  "l_cut",
  "slow_pan",
  "push_in",
  "hard_cut",
  "match_cut",
]);
export const VisualEditCueTargetSchema = z.enum(["black", "current_visual", "next_visual"]);
export const AudioPolicySchema = z.enum(["hard_silence", "fade_out", "none"]);
export const AudioProximitySchema = z.enum(["distant", "room", "close", "close_mic"]);

// Inferred types — use these everywhere instead of inline string unions
export type ScaleMode = z.infer<typeof ScaleModeSchema>;
export type SubjectPosition = z.infer<typeof SubjectPositionSchema>;
export type CropRisk = z.infer<typeof CropRiskSchema>;
export type MotionType = z.infer<typeof MotionTypeSchema>;
export type MediaPolicy = z.infer<typeof MediaPolicySchema>;
export type VisualEditCueType = z.infer<typeof VisualEditCueTypeSchema>;
export type VisualEditCueTarget = z.infer<typeof VisualEditCueTargetSchema>;
export type AudioPolicy = z.infer<typeof AudioPolicySchema>;
export type AudioProximity = z.infer<typeof AudioProximitySchema>;

export const TimelineSegmentSchema = z
  .object({
    sectionId: z.string(),
    beatId: z.string(),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    durationSeconds: z.number().positive(),
    voiceAssetId: z.string().optional(),
    mediaAssetIds: z.array(z.string()).default([]),
    audioCues: z
      .array(
        z
          .object({
            assetId: z.string(),
            role: z.enum(["sfx", "music"]),
            startSeconds: z.number().nonnegative(),
            durationSeconds: z.number().nonnegative(),
            levelDb: z.number(),
            pan: z.number().min(-1).max(1).default(0),
            proximity: AudioProximitySchema.default("room"),
            duckMusic: z.boolean().default(false),
          })
          .strict(),
      )
      .default([]),
    visualEditCues: z
      .array(
        z
          .object({
            id: z.string(),
            type: VisualEditCueTypeSchema,
            startSeconds: z.number().nonnegative(),
            durationSeconds: z.number().nonnegative(),
            target: VisualEditCueTargetSchema,
            intensity: z.number().min(0).max(1),
          })
          .strict(),
      )
      .default([]),
    silenceWindows: z
      .array(
        z
          .object({
            id: z.string(),
            startSeconds: z.number().nonnegative(),
            endSeconds: z.number().positive(),
            muteMusic: z.boolean(),
            muteSfx: z.boolean(),
            keepVoice: z.boolean(),
          })
          .strict(),
      )
      .default([]),
    endingPolicy: z
      .object({
        cutToBlack: z.boolean().default(false),
        holdSeconds: z.number().min(0).default(0),
        audioPolicy: AudioPolicySchema.default("none"),
        avoidOutro: z.boolean().default(false),
      })
      .strict()
      .optional(),
    renderPolicy: z
      .object({
        mediaPolicy: MediaPolicySchema,
        scaleMode: ScaleModeSchema.default("safe_cover"),
        subjectPosition: SubjectPositionSchema.default("center"),
        cropRisk: CropRiskSchema.default("medium"),
      })
      .strict(),
  })
  .strict();

export const TimelineSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    sourcePlanHash: z.string(),
    fps: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationSeconds: z.number().positive(),
    segments: z.array(TimelineSegmentSchema).min(1),
    audioLayers: z
      .array(
        z
          .object({
            type: z.enum(["narration", "music", "sfx"]),
            assetId: z.string(),
            startSeconds: z.number().nonnegative(),
            durationSeconds: z.number().nonnegative(),
            gainDb: z.number(),
            duckUnderNarration: z.boolean().default(false),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type Timeline = z.infer<typeof TimelineSchema>;

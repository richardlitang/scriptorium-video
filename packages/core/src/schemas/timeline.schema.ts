import { z } from "zod";

export const TimelineSegmentSchema = z.object({
  sectionId: z.string(),
  beatId: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  voiceAssetId: z.string().optional(),
  mediaAssetIds: z.array(z.string()).default([]),
  audioCues: z.array(
    z.object({
      assetId: z.string(),
      role: z.enum(["sfx", "music"]),
      startSeconds: z.number().nonnegative(),
      durationSeconds: z.number().nonnegative(),
      levelDb: z.number()
    }).strict()
  ).default([]),
  renderPolicy: z.object({
    mediaPolicy: z.enum([
      "cut_to_audio",
      "loop_or_freeze",
      "fit_audio_to_media",
      "manual"
    ]),
    scaleMode: z.enum(["cover", "contain", "stretch"]).default("cover")
  }).strict()
}).strict();

export const TimelineSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  sourcePlanHash: z.string(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  segments: z.array(TimelineSegmentSchema).min(1)
}).strict();

export type Timeline = z.infer<typeof TimelineSchema>;

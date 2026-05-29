import { z } from "zod";

export const TranscriptWordSchema = z
  .object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    word: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const TranscriptSegmentSchema = z
  .object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    text: z.string().min(1),
  })
  .strict();

export const TranscriptFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z
      .object({
        provider: z.string(),
        audioAssetIds: z.array(z.string()).default([]),
      })
      .strict(),
    text: z.string(),
    segments: z.array(TranscriptSegmentSchema).default([]),
    words: z.array(TranscriptWordSchema).default([]),
  })
  .strict();

export type TranscriptFile = z.infer<typeof TranscriptFileSchema>;

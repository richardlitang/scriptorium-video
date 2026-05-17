import { z } from "zod";
import { ArtifactStatusSchema } from "./video-plan.schema.js";

export const CaptionWordSchema = z.object({
  word: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  emphasis: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional()
}).strict();

export const CaptionSchema = z.object({
  id: z.string(),
  beatId: z.string().optional(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  text: z.string().min(1),
  style: z.string().default("default"),
  words: z.array(CaptionWordSchema).default([])
}).strict();

export const CaptionsFileSchema = z.object({
  schemaVersion: z.literal(1),
  status: ArtifactStatusSchema.default("generated"),
  source: z.object({
    transcriptionProvider: z.string(),
    audioAssetIds: z.array(z.string()).default([]),
    sourceHash: z.string().optional()
  }).strict(),
  captions: z.array(CaptionSchema).default([])
}).strict();

export type CaptionsFile = z.infer<typeof CaptionsFileSchema>;

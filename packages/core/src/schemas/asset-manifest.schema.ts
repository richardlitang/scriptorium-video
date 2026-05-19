import { z } from "zod";
import { ArtifactStatusSchema } from "./video-plan.schema.js";

export const AssetSourceSchema = z.object({
  kind: z.enum(["manual", "generated", "imported", "cached"]),
  provider: z.string().optional(),
  inputHash: z.string().optional(),
  originalPath: z.string().optional(),
  prompt: z.string().optional(),
  audioProcessing: z.object({
    loudnessTargetLufs: z.number(),
    truePeakDb: z.number(),
    compression: z.string(),
    processedAt: z.string().datetime()
  }).optional()
}).strict();

export const AssetSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "video", "audio", "screen_recording", "sfx", "music"]),
  role: z.enum([
    "voiceover",
    "primary_visual",
    "broll",
    "screen",
    "music",
    "sfx",
    "overlay"
  ]),
  sectionId: z.string().optional(),
  beatId: z.string().optional(),
  path: z.string(),
  source: AssetSourceSchema,
  durationSeconds: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  hash: z.string().optional(),
  status: ArtifactStatusSchema.default("generated"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();

export const AssetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(AssetSchema).default([])
}).strict();

export type Asset = z.infer<typeof AssetSchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

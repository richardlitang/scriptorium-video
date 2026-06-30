import { z } from "zod";

export const ReferenceEntrySchema = z
  .object({
    anchorId: z.string(),
    kind: z.enum(["character", "location", "object"]),
    path: z.string(),
    sha256: z.string(),
    prompt: z.string(),
    generatedAt: z.string().datetime(),
    locked: z.boolean().default(true),
  })
  .strict();

export const ReferenceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    references: z.record(z.string(), ReferenceEntrySchema).default({}),
  })
  .strict();

export type ReferenceEntry = z.infer<typeof ReferenceEntrySchema>;
export type ReferenceManifest = z.infer<typeof ReferenceManifestSchema>;

import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "draft",
  "assets_pending",
  "ready_to_sync",
  "synced",
  "ready_to_render",
  "rendered",
  "failed",
]);

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: ProjectStatusSchema.default("draft"),
  })
  .strict();

export type Project = z.infer<typeof ProjectSchema>;

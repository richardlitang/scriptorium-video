import { z } from "zod";

export const QualityFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  path: z.string().optional(),
  beatId: z.string().optional(),
  sectionId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional()
}).strict();

export const QualityReportSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  checks: z.array(QualityFindingSchema)
}).strict();

export type QualityFinding = z.infer<typeof QualityFindingSchema>;
export type QualityReport = z.infer<typeof QualityReportSchema>;

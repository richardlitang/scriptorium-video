import { z } from "zod";
import { PlanDraftZodSchema } from "./plan-draft.zod.mjs";

// The OpenAI structured-output JSON Schema is GENERATED from the Zod source in
// plan-draft.zod.mjs — do not hand-edit this object. Zod 4 adds a root `$schema`
// key; we strip it so the emitted schema stays identical to the contract OpenAI
// has always received. An equivalence test (test/plan-draft-schema-generation.test.mjs)
// locks the generated output against a frozen fixture of the original schema.
const { $schema: _$schema, ...generated } = z.toJSONSchema(PlanDraftZodSchema);

export const PlanDraftSchema = generated;

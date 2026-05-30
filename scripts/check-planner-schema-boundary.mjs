import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const studioOrchestratorPath = path.join(
  rootDir,
  "apps/studio/lib/draft/plan-draft-orchestrator.mjs",
);
const coreSchemaPath = path.join(rootDir, "packages/core/src/schemas/plan-draft.schema.mjs");

const orchestratorSource = await readFile(studioOrchestratorPath, "utf8");
const coreSchemaSource = await readFile(coreSchemaPath, "utf8");

const violations = [];

if (!coreSchemaSource.includes("export const PlanDraftSchema")) {
  violations.push("packages/core/src/schemas/plan-draft.schema.mjs must export PlanDraftSchema.");
}

// The JSON Schema is generated from the Zod source — it must not be hand-edited
// back into an inline object literal. Enforce that it derives from plan-draft.zod.mjs.
if (
  coreSchemaSource.includes("export const PlanDraftSchema = {") ||
  !coreSchemaSource.includes("plan-draft.zod.mjs") ||
  !coreSchemaSource.includes("z.toJSONSchema")
) {
  violations.push(
    "PlanDraftSchema must be generated from plan-draft.zod.mjs via z.toJSONSchema(), not hand-written as an inline object literal.",
  );
}

if (orchestratorSource.includes("export const PLAN_DRAFT_SCHEMA = {")) {
  violations.push(
    "Studio planner orchestrator must not inline PLAN_DRAFT_SCHEMA. Import the schema from packages/core/src/schemas/plan-draft.schema.mjs.",
  );
}

if (
  !orchestratorSource.includes('from "../../../../packages/core/src/schemas/plan-draft.schema.mjs"')
) {
  violations.push(
    "Studio planner orchestrator must import PlanDraftSchema from packages/core/src/schemas/plan-draft.schema.mjs.",
  );
}

if (violations.length > 0) {
  console.error("check-planner-schema-boundary failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("check-planner-schema-boundary passed.");

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PlanDraftSchema } from "../src/schemas/plan-draft.schema.mjs";

// The OpenAI structured-output contract is generated from Zod. This locks the
// generated JSON Schema against a frozen snapshot of the original hand-written
// schema, so any drift in the Zod source (or zod's toJSONSchema output) is
// caught before it reaches the planner.
const expected = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/plan-draft.schema.expected.json", import.meta.url)),
    "utf8",
  ),
);

test("generated PlanDraftSchema matches the frozen contract fixture", () => {
  assert.deepEqual(PlanDraftSchema, expected);
});

test("PlanDraftSchema stays OpenAI strict-mode shaped", () => {
  assert.equal(PlanDraftSchema.type, "object");
  assert.equal(PlanDraftSchema.additionalProperties, false);
  // No leaked `$schema` key — OpenAI receives exactly the contract object.
  assert.equal("$schema" in PlanDraftSchema, false);
  // Strict mode requires every property to be listed as required.
  assert.deepEqual(
    new Set(PlanDraftSchema.required),
    new Set(Object.keys(PlanDraftSchema.properties)),
  );
});

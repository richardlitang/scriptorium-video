import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewProject } from "../dist/review-project.js";

test("reviewProject reports structured issues", async () => {
  const result = await reviewProject("the-delivery", process.cwd());
  assert.equal(result.projectId, "the-delivery");
  assert.ok(Array.isArray(result.issues));
  assert.ok(typeof result.summary.critical === "number");
  assert.ok(typeof result.summary.warning === "number");
  assert.ok(typeof result.summary.suggestion === "number");
});

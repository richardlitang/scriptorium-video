import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { hasProjectTail, mediaMimeForPath, parseProjectPath } from "../lib/routes/route-utils.mjs";

test("parseProjectPath extracts project id and tail", () => {
  const parsed = parseProjectPath("/api/projects/demo-1/jobs/job-1/trace");
  assert.deepEqual(parsed, { projectId: "demo-1", tail: "jobs/job-1/trace" });
});

test("parseProjectPath returns null for non-project routes", () => {
  assert.equal(parseProjectPath("/api/settings"), null);
});

test("hasProjectTail matches exact tails only", () => {
  assert.equal(hasProjectTail("/api/projects/demo/render", "render"), true);
  assert.equal(hasProjectTail("/api/projects/demo/render/final", "render"), false);
});

test("mediaMimeForPath maps known extensions", () => {
  assert.equal(mediaMimeForPath(path, "/tmp/demo.mp4"), "video/mp4");
  assert.equal(mediaMimeForPath(path, "/tmp/demo.jpeg"), "image/jpeg");
  assert.equal(mediaMimeForPath(path, "/tmp/demo.unknown"), "application/octet-stream");
});

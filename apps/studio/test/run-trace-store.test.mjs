import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRunTraceStore } from "../lib/project/run-trace-store.mjs";

test("run trace store appends and reads ndjson trace entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-run-trace-"));
  try {
    const store = createRunTraceStore(root);
    await store.appendRunTrace("demo", "job-1", "draft_job.start", { projectId: "demo" });
    await store.appendRunTrace("demo", "job-1", "draft_job.complete", { ok: true });
    const trace = await store.readRunTrace("demo", "job-1");
    assert.match(trace.path, /demo\/job-1\.ndjson$/);
    assert.equal(trace.entries.length, 2);
    assert.equal(trace.entries[0].event, "draft_job.start");
    assert.equal(trace.entries[1].event, "draft_job.complete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run trace display path is relative to repo root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-run-trace-display-"));
  try {
    const store = createRunTraceStore(root);
    const display = store.runTraceDisplayPath("project", "job-2");
    assert.equal(display, path.join(".studio-data", "run-traces", "project", "job-2.ndjson"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

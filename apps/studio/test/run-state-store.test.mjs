import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRunStateStore, normalizeRunState } from "../lib/project/run-state-store.mjs";

test("normalizeRunState keeps newest jobs and selects queued/running active job", () => {
  const jobs = Array.from({ length: 35 }, (_, index) => ({
    jobId: `job-${index + 1}`,
    kind: "draft_job",
    status: "completed",
    updatedAt: new Date(Date.now() + index * 1000).toISOString(),
  }));
  jobs[10] = {
    ...jobs[10],
    status: "queued",
    updatedAt: new Date(Date.now() + 999999).toISOString(),
  };

  const normalized = normalizeRunState({ jobs });
  assert.equal(normalized.jobs.length, 30);
  assert.equal(normalized.activeJobId, jobs[10].jobId);
  assert.equal(normalized.status, "queued");
});

test("updateRunProgress writes lifecycle status transitions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-run-state-"));
  try {
    const store = createRunStateStore(root);
    const projectId = "demo";

    await store.updateRunProgress(projectId, {
      progress: {
        kind: "draft_job",
        phase: "planning",
        label: "Planning",
        completed: 1,
        total: 4,
      },
    });

    let state = await store.readRunState(projectId);
    assert.equal(state.status, "queued");
    assert.equal(state.progress.kind, "draft_job");
    assert.equal(state.progress.status, "running");

    await store.updateRunProgress(projectId, {
      progress: {
        kind: "draft_job",
        phase: "completed",
        label: "Done",
        completed: 4,
        total: 4,
      },
    });

    state = await store.readRunState(projectId);
    assert.equal(state.progress.status, "completed");
    assert.ok(state.progress.finishedAt);
    const persisted = JSON.parse(await readFile(store.runStatePath(projectId), "utf8"));
    assert.equal(persisted.progress.status, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

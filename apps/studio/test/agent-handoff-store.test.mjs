import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildAgentHandoff, createAgentHandoffStore } from "../lib/project/agent-handoff-store.mjs";

test("buildAgentHandoff keeps terminal job context concise", () => {
  const handoff = buildAgentHandoff({
    projectId: "demo",
    summary: "Render complete.",
    nextAction: "Review output.",
    job: {
      kind: "render_job",
      jobId: "render-1",
      status: "completed",
      phase: "done",
      output: "ok",
    },
  });

  assert.equal(handoff.schemaVersion, 1);
  assert.equal(handoff.projectId, "demo");
  assert.equal(handoff.summary, "Render complete.");
  assert.equal(handoff.nextAction, "Review output.");
  assert.equal(handoff.job.kind, "render_job");
  assert.equal(handoff.job.output, "ok");
  assert.ok(handoff.generatedAt);
});

test("createAgentHandoffStore writes handoff JSON under studio data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-agent-handoff-"));
  try {
    const store = createAgentHandoffStore(root);
    const result = await store.writeAgentHandoff(
      "demo",
      { kind: "quality_check_job", jobId: "quality-1", status: "completed", label: "Checked" },
      { summary: "Quality checked." },
    );

    assert.equal(
      result.path,
      path.join(".studio-data", "agent-handoffs", "demo", "quality-1.json"),
    );
    const persisted = JSON.parse(await readFile(path.join(root, result.path), "utf8"));
    assert.equal(persisted.summary, "Quality checked.");
    assert.equal(persisted.job.jobId, "quality-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

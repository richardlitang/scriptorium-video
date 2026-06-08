import assert from "node:assert/strict";
import { test } from "node:test";
import { createForegroundJobs } from "../lib/draft/foreground-jobs.mjs";

test("runTrackedForegroundJob writes completion handoff for terminal jobs", async () => {
  const jobs = [];
  const handoffs = [];
  const { runTrackedForegroundJob } = createForegroundJobs({
    upsertRunJob: async (projectId, job) => jobs.push({ projectId, job }),
    writeAgentHandoff: async (projectId, job, context) =>
      handoffs.push({ projectId, job, context }),
  });

  const result = await runTrackedForegroundJob(
    "demo",
    { kind: "prepare_draft_job", label: "Preparing", total: 1, completedLabel: "Ready" },
    async ({ advance }) => {
      await advance("Syncing", async () => ({ stdout: "Synced project." }));
      return { ok: true };
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(jobs.at(-1).job.status, "completed");
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].projectId, "demo");
  assert.equal(handoffs[0].job.status, "completed");
  assert.equal(handoffs[0].context.summary, "Ready");
  assert.match(handoffs[0].job.output, /Synced project/);
});

test("runTrackedForegroundJob writes failure handoff before rethrowing", async () => {
  const handoffs = [];
  const { runTrackedForegroundJob } = createForegroundJobs({
    upsertRunJob: async () => {},
    writeAgentHandoff: async (projectId, job, context) =>
      handoffs.push({ projectId, job, context }),
  });

  await assert.rejects(
    () =>
      runTrackedForegroundJob("demo", { kind: "render_job", label: "Rendering" }, async () => {
        throw new Error("Renderer failed.");
      }),
    /Renderer failed/,
  );

  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].job.status, "failed");
  assert.equal(handoffs[0].job.error, "Renderer failed.");
  assert.equal(handoffs[0].context.summary, "Rendering failed.");
});

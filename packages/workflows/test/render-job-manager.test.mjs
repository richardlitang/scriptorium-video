import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createRenderJobManager } from "../dist/index.js";

test("render job manager runs a queued job to completion", async () => {
  const calls = [];
  const manager = createRenderJobManager({
    createJobId: () => "job-1",
    runRenderWorkflow: async (input) => {
      calls.push(["workflow", input.projectId, input.quality]);
      await input.onStageChange?.("validating");
      await input.onStageChange?.("rendering");
      input.onProgress?.({ percent: 50 });
      await input.onStageChange?.("completed");
      return {
        status: "rendered",
        bundle: { videoPlan: { providers: { renderer: "fake" } } },
        quality: { status: "warn", checks: [] },
        providerId: "fake",
        renderResult: { outputPath: "/tmp/demo.mp4" },
      };
    },
  });

  const started = manager.startRenderJob(
    { projectId: "demo", quality: "draft" },
    { rendererProviders: {} },
  );
  assert.equal(started.status, "queued");
  await delay(0);

  const finished = manager.getRenderJob("job-1");
  assert.equal(finished.status, "completed");
  assert.equal(finished.renderResult.outputPath, "/tmp/demo.mp4");
  assert.equal(finished.qualityResult.status, "warn");
  assert.deepEqual(calls, [["workflow", "demo", "draft"]]);
});

test("render job manager blocks duplicate active jobs per project", () => {
  const manager = createRenderJobManager({
    createJobId: () => "job-1",
    runRenderWorkflow: async () =>
      new Promise(() => {
        // never resolves in this test
      }),
  });

  manager.startRenderJob({ projectId: "demo" }, { rendererProviders: {} });
  assert.throws(
    () => manager.startRenderJob({ projectId: "demo" }, { rendererProviders: {} }),
    /already .* project demo/i,
  );
});

test("render job manager marks queued job cancelled immediately", () => {
  const manager = createRenderJobManager({
    createJobId: () => "job-1",
  });

  manager.startRenderJob({ projectId: "demo" }, { rendererProviders: {} });
  const cancelled = manager.cancelRenderJob("job-1");

  assert.equal(cancelled.status, "cancelled");
  assert.equal(manager.getRenderJob("job-1").status, "cancelled");
});

test("render job manager marks running job cancelling and finishes cancelled on abort", async () => {
  const manager = createRenderJobManager({
    createJobId: () => "job-1",
    runRenderWorkflow: async (input) => {
      await input.onStageChange?.("rendering");
      await delay(0);
      if (input.shouldCancel?.()) {
        throw new Error("Render job cancelled by user.");
      }
      return {
        status: "rendered",
        bundle: { videoPlan: { providers: { renderer: "fake" } } },
        quality: { status: "pass", checks: [] },
        providerId: "fake",
        renderResult: { outputPath: "/tmp/demo.mp4" },
      };
    },
  });

  manager.startRenderJob({ projectId: "demo" }, { rendererProviders: {} });
  await delay(0);
  const cancelling = manager.cancelRenderJob("job-1");
  assert.equal(cancelling.status, "cancelling");
  await delay(0);
  const finished = manager.getRenderJob("job-1");
  assert.equal(finished.status, "cancelled");
});

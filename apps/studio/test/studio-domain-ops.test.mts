import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioDomainOps } from "../lib/runtime/studio-domain-ops.mjs";
import type { ReviewResult, SyncResult } from "@lvstudio/core";
import type { QualityResult } from "@lvstudio/quality";
import type { RenderWorkflowResult } from "@lvstudio/workflows";

void test("studio domain ops forwards create, captions, render, sync, check, and review to typed package APIs", async () => {
  const calls: Array<[string, string, string]> = [];
  const syncResult = { timeline: {}, issues: [], staleAssetIds: [] } as unknown as SyncResult;
  const checkResult = { status: "pass", checks: [] } as QualityResult;
  const renderResult = {
    status: "rendered",
    providerId: "remotion",
    quality: { status: "pass", checks: [] },
    bundle: { timeline: { segments: [] } },
    renderResult: { outputPath: "/repo/content/projects/demo/renders/draft.mp4" },
  } as unknown as RenderWorkflowResult;
  const reviewResult = {
    projectId: "demo",
    generatedAt: "2026-06-21T00:00:00.000Z",
    summary: { critical: 0, warning: 0, suggestion: 0 },
    issues: [],
  } as ReviewResult;

  const domainOps = createStudioDomainOps({
    rootDir: "/repo",
    createProjectScaffoldImpl: async (projectId, mode, platform, rootDir) => {
      assert.equal(rootDir, "/repo");
      calls.push([`create:${mode}:${platform}`, projectId, rootDir]);
    },
    generateCaptionsForProjectImpl: async (projectId) => {
      calls.push(["captions", projectId, "/repo"]);
      return {
        captionsPath: `/repo/content/projects/${projectId}/captions/captions.json`,
        count: 2,
      };
    },
    runRenderWorkflowImpl: async (input, _deps) => {
      calls.push([
        `render:${input.quality}:${String(input.force)}`,
        input.projectId,
        input.rootDir ?? "",
      ]);
      return renderResult;
    },
    syncProjectImpl: async (projectId, rootDir) => {
      assert.equal(rootDir, "/repo");
      calls.push(["sync", projectId, rootDir]);
      return syncResult;
    },
    runQualityChecksImpl: async (projectId, rootDir) => {
      assert.equal(rootDir, "/repo");
      calls.push(["check", projectId, rootDir]);
      return checkResult;
    },
    reviewProjectImpl: async (projectId, rootDir) => {
      assert.equal(rootDir, "/repo");
      calls.push(["review", projectId, rootDir]);
      return reviewResult;
    },
  });

  await domainOps.createProject({
    projectId: "demo",
    mode: "long_documentary",
    platform: "local_only",
  });
  assert.deepEqual(await domainOps.captions("demo"), {
    captionsPath: "/repo/content/projects/demo/captions/captions.json",
    count: 2,
  });
  assert.equal(
    await domainOps.render({ projectId: "demo", quality: "draft", force: true }),
    renderResult,
  );
  assert.equal(await domainOps.sync("demo"), syncResult);
  assert.equal(await domainOps.check("demo"), checkResult);
  assert.equal(await domainOps.review("demo"), reviewResult);
  assert.deepEqual(calls, [
    ["create:long_documentary:local_only", "demo", "/repo"],
    ["captions", "demo", "/repo"],
    ["render:draft:true", "demo", "/repo"],
    ["sync", "demo", "/repo"],
    ["check", "demo", "/repo"],
    ["review", "demo", "/repo"],
  ]);
});

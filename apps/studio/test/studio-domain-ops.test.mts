import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioDomainOps } from "../lib/runtime/studio-domain-ops.mjs";
import type { ReviewResult, SyncResult } from "@lvstudio/core";
import type { QualityResult } from "@lvstudio/quality";

void test("studio domain ops forwards sync, check, and review to typed package APIs", async () => {
  const calls: Array<[string, string, string]> = [];
  const syncResult = { timeline: {}, issues: [], staleAssetIds: [] } as unknown as SyncResult;
  const checkResult = { status: "pass", checks: [] } as QualityResult;
  const reviewResult = {
    projectId: "demo",
    generatedAt: "2026-06-21T00:00:00.000Z",
    summary: { critical: 0, warning: 0, suggestion: 0 },
    issues: [],
  } as ReviewResult;

  const domainOps = createStudioDomainOps({
    rootDir: "/repo",
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

  assert.equal(await domainOps.sync("demo"), syncResult);
  assert.equal(await domainOps.check("demo"), checkResult);
  assert.equal(await domainOps.review("demo"), reviewResult);
  assert.deepEqual(calls, [
    ["sync", "demo", "/repo"],
    ["check", "demo", "/repo"],
    ["review", "demo", "/repo"],
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createDomainOps } from "../lib/runtime/domain-ops.mjs";
import type { SyncResult } from "@lvstudio/core";

void test("createDomainOps exposes the ported operations", () => {
  const ops = createDomainOps({
    rootDir: "/tmp/fake-root",
    log: async () => {},
  });
  assert.equal(typeof ops.syncProject, "function");
  assert.equal(typeof ops.runQualityChecks, "function");
  assert.equal(typeof ops.createProjectScaffold, "function");
});

void test("every op logs an entry with op name, ok flag, and duration", async () => {
  const entries: unknown[] = [];
  const syncResult: SyncResult = {
    timeline: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sourcePlanHash: "hash",
      fps: 30,
      width: 1920,
      height: 1080,
      durationSeconds: 0,
      segments: [],
      audioLayers: [],
    },
    issues: [],
    staleAssetIds: [],
  };
  const ops = createDomainOps({
    rootDir: "/tmp/fake-root",
    log: async (entry) => {
      entries.push(entry);
    },
    overrides: {
      syncProject: async () => syncResult,
    },
  });

  await ops.syncProject("demo");

  assert.equal(entries.length, 1);
  assert.match(JSON.stringify(entries[0]), /"op":"syncProject"/);
  assert.match(JSON.stringify(entries[0]), /"ok":true/);
  assert.match(JSON.stringify(entries[0]), /"durationMs":/);
});

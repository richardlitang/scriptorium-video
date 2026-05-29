import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioOpsRuntimeAdapter } from "../lib/runtime/studio-ops-runtime-adapter.mjs";

test("studio ops runtime adapter fails fast before runtime is set", async () => {
  const adapter = createStudioOpsRuntimeAdapter();
  await assert.rejects(
    () => adapter.runLvstudio(["check", "demo"]),
    /Studio ops runtime is not initialized/,
  );
});

test("studio ops runtime adapter forwards calls to configured runtime", async () => {
  const adapter = createStudioOpsRuntimeAdapter();
  const calls = [];
  adapter.setRuntime({
    appendQualityHistory: async (...args) => calls.push(["appendQualityHistory", args]),
    appendCommandLog: async (...args) => calls.push(["appendCommandLog", args]),
    runLvstudio: async (...args) => ({ args }),
    runLvstudioReport: async (...args) => ({ ok: true, args }),
  });

  await adapter.appendQualityHistory("proj-1", { score: 90 });
  await adapter.appendCommandLog({ command: "pnpm lvstudio check proj-1" });
  const runResult = await adapter.runLvstudio(["check", "proj-1"]);
  const reportResult = await adapter.runLvstudioReport(["review", "proj-1"]);

  assert.deepEqual(calls, [
    ["appendQualityHistory", ["proj-1", { score: 90 }]],
    ["appendCommandLog", [{ command: "pnpm lvstudio check proj-1" }]],
  ]);
  assert.deepEqual(runResult, { args: [["check", "proj-1"]] });
  assert.deepEqual(reportResult, { ok: true, args: [["review", "proj-1"]] });
});

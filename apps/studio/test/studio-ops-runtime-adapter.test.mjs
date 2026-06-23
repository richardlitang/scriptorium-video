import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioOpsRuntimeAdapter } from "../lib/runtime/studio-ops-runtime-adapter.mjs";

test("studio ops runtime adapter fails fast before runtime is set", async () => {
  const adapter = createStudioOpsRuntimeAdapter();
  await assert.rejects(
    () => adapter.appendQualityHistory("demo", {}),
    /Studio ops runtime is not initialized/,
  );
});

test("studio ops runtime adapter forwards calls to configured runtime", async () => {
  const adapter = createStudioOpsRuntimeAdapter();
  const calls = [];
  adapter.setRuntime({
    appendQualityHistory: async (...args) => calls.push(["appendQualityHistory", args]),
  });

  await adapter.appendQualityHistory("proj-1", { score: 90 });

  assert.deepEqual(calls, [["appendQualityHistory", ["proj-1", { score: 90 }]]]);
});

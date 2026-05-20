import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("planner merge includes lock-aware direction merge helper", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /const mergeDirectionWithLocks =/);
  assert.match(server, /isLocked\(previousMeta,\s*"voice"\)/);
  assert.match(server, /isLocked\(previousMeta,\s*"caption\.emphasis"\)/);
  assert.match(server, /mergeDirectionWithLocks\(\s*currentPlan\.direction/);
});

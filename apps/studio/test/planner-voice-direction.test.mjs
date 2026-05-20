import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("planner schema requests beat-level voice direction fields", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /voiceProfile/);
  assert.match(server, /pauseBeforeSeconds/);
  assert.match(server, /pauseAfterSeconds/);
  assert.match(server, /deliveryNote/);
  assert.match(server, /speedMultiplier/);
  assert.match(server, /pitchOffset/);
  assert.match(server, /voiceConfidence/);
  assert.match(server, /visualConfidence/);
  assert.match(server, /shotType/);
  assert.match(server, /sfxCues/);
});

test("beat inspector exposes editable voice tuning controls", async () => {
  const moduleSource = await readFile(path.resolve("apps/studio/public/modules/beat-workspace.js"), "utf8");
  assert.match(moduleSource, /Voice intensity/);
  assert.match(moduleSource, /Pause before \(seconds\)/);
  assert.match(moduleSource, /Pause after \(seconds\)/);
  assert.match(moduleSource, /Delivery note/);
  assert.match(moduleSource, /Speed multiplier/);
  assert.match(moduleSource, /Pitch offset/);
  assert.match(moduleSource, /Caption style/);
  assert.match(moduleSource, /Caption emphasis phrases/);
  assert.match(moduleSource, /Section feel/);
  assert.match(moduleSource, /Section pacing/);
  assert.match(moduleSource, /Section visual style/);
  assert.match(moduleSource, /Apply Voice Tuning to Section/);
  assert.match(moduleSource, /Apply Voice Tuning to Selected Beats/);
});

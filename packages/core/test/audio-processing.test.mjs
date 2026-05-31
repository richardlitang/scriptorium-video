import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { normalizeVoiceover, padVoiceover, tempAudioPath } from "../dist/audio-processing.js";

test("tempAudioPath appends normalized suffix using input extension", () => {
  const withExtension = tempAudioPath("/tmp/voice.wav");
  const withoutExtension = tempAudioPath("/tmp/voice");
  assert.equal(withExtension, "/tmp/voice.wav.normalized.wav");
  assert.equal(withoutExtension, "/tmp/voice.normalized.wav");
});

test("normalizeVoiceover keeps original file and removes temp file on processing failure", async () => {
  const workdir = await mkdtemp(path.join(tmpdir(), "lvstudio-audio-processing-"));
  const filePath = path.join(workdir, "voice.wav");
  const original = Buffer.from("not-valid-audio");
  await writeFile(filePath, original);

  await assert.rejects(() => normalizeVoiceover(filePath));

  const after = await readFile(filePath);
  assert.deepEqual(after, original);
  await assert.rejects(() => access(tempAudioPath(filePath)));

  await rm(workdir, { recursive: true, force: true });
});

test("padVoiceover is a no-op when both pause values are zero", async () => {
  await padVoiceover("/tmp/non-existent-audio.wav", 0, 0);
});

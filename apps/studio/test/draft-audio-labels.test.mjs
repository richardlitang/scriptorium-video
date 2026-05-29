import assert from "node:assert/strict";
import { test } from "node:test";
import {
  narrationBatchLabel,
  narrationBeatProgressLabel,
  narrationBeatRunLabel,
  ttsArgsForBeat,
} from "../lib/draft/draft-audio-labels.mjs";

test("draft audio label helpers format batch and beat labels", () => {
  const section = { title: "Intro", beats: [{}, {}] };
  const beat = { id: "intro-001", order: 1 };
  assert.equal(narrationBatchLabel(3, "chatterbox"), "Narration: 3 beat(s) · chatterbox");
  assert.equal(narrationBeatProgressLabel(section, beat), "Narration: Intro · 1/2 · intro-001");
  assert.equal(narrationBeatRunLabel(section, beat, "mms"), "Narration: Intro · intro-001 · mms");
});

test("ttsArgsForBeat builds deterministic generate:tts args", () => {
  assert.deepEqual(ttsArgsForBeat("demo", "chatterbox", "beat-1"), [
    "generate:tts",
    "demo",
    "--provider",
    "chatterbox",
    "--force",
    "--only-beat",
    "beat-1",
  ]);
});

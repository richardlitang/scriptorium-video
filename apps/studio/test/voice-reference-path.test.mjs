import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVoiceReferencePath } from "../lib/tts/voice-reference-path.mjs";

test("resolves a repo-relative preset reference against the studio root", () => {
  assert.equal(
    resolveVoiceReferencePath("apps/studio/assets/voices/campfire-sage.wav", "/repo"),
    "/repo/apps/studio/assets/voices/campfire-sage.wav",
  );
});

test("leaves absolute upload paths untouched", () => {
  assert.equal(
    resolveVoiceReferencePath("/abs/voice-references/clip.wav", "/repo"),
    "/abs/voice-references/clip.wav",
  );
});

test("treats blank or missing references as no reference", () => {
  assert.equal(resolveVoiceReferencePath("", "/repo"), undefined);
  assert.equal(resolveVoiceReferencePath("   ", "/repo"), undefined);
  assert.equal(resolveVoiceReferencePath(undefined, "/repo"), undefined);
});

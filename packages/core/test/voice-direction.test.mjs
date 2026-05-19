import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVoiceDirection } from "../dist/voice-direction.js";

function planWithTts(tts = "chatterbox") {
  return {
    schemaVersion: 1,
    title: "Test",
    mode: "short_story",
    targetPlatform: "local_only",
    stylePackId: "default",
    providers: {
      llm: "manual",
      tts,
      transcription: "mock",
      media: "manual-media",
      renderer: "remotion"
    },
    voice: {
      provider: tts,
      voiceId: "clone",
      format: "wav",
      options: {}
    },
    sections: []
  };
}

function beatWithDirection(voiceDirection) {
  return {
    id: "beat-001",
    order: 1,
    narration: "Hello world.",
    timing: { locked: false, mediaPolicy: "loop_or_freeze" },
    media: [],
    motion: { type: "slow_zoom_in", intensity: 0.1 },
    caption: { emphasis: [], style: "default" },
    voiceDirection
  };
}

test("resolveVoiceDirection returns neutral defaults when voiceDirection is missing", () => {
  const resolved = resolveVoiceDirection(beatWithDirection(undefined), planWithTts());
  assert.equal(resolved.delivery.profile, "neutral");
  assert.equal(resolved.delivery.intensity, 0.5);
  assert.deepEqual(resolved.delivery.emphasis, []);
  assert.deepEqual(resolved.pauses, { beforeSeconds: 0, afterSeconds: 0 });
  assert.deepEqual(resolved.providerOptions, {
    exaggeration: 0.45,
    cfg_weight: 0.45,
    temperature: 0.6
  });
});

test("resolveVoiceDirection maps key_point profile to stable chatterbox settings", () => {
  const resolved = resolveVoiceDirection(
    beatWithDirection({
      profile: "key_point",
      intensity: 0.7,
      emphasis: ["three hours every week"],
      pauseBeforeSeconds: 0.1,
      pauseAfterSeconds: 0.35,
      source: "llm"
    }),
    planWithTts()
  );

  assert.equal(resolved.delivery.profile, "key_point");
  assert.equal(resolved.delivery.intensity, 0.7);
  assert.deepEqual(resolved.providerOptions, {
    exaggeration: 0.56,
    cfg_weight: 0.4,
    temperature: 0.68
  });
  assert.deepEqual(resolved.pauses, { beforeSeconds: 0.1, afterSeconds: 0.35 });
});

test("resolveVoiceDirection does not inject chatterbox options for non-chatterbox providers", () => {
  const resolved = resolveVoiceDirection(
    beatWithDirection({
      profile: "authoritative",
      intensity: 0.6,
      emphasis: [],
      pauseBeforeSeconds: 0,
      pauseAfterSeconds: 0,
      source: "default"
    }),
    planWithTts("openai")
  );
  assert.deepEqual(resolved.providerOptions, {});
});

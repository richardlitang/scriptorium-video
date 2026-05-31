import assert from "node:assert/strict";
import { test } from "node:test";
import {
  directiveCandidateLines,
  summarizeManifestForTrace,
  summarizePlanForTrace,
  summarizeStoryInput,
  summarizeTimelineForTrace,
  summarizeVoiceSettingsForTrace,
} from "../lib/project/trace-summaries.mjs";

test("directiveCandidateLines finds bracketed stage cues", () => {
  const lines = directiveCandidateLines("[CUT TO BLACK]\nNarration line\n[SFX THUD]");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].index, 1);
});

test("summarizeStoryInput returns hash/shape metrics", () => {
  const summary = summarizeStoryInput("Hello world\n[FADE TO BLACK]");
  assert.equal(summary.lines, 2);
  assert.equal(summary.words, 5);
  assert.ok(summary.hash.length > 10);
  assert.equal(summary.directiveCandidateLines.length, 1);
});

test("summarizePlanForTrace computes beat and narration aggregates", () => {
  const summary = summarizePlanForTrace(
    {
      title: "Demo",
      providers: { tts: "chatterbox" },
      sections: [
        {
          id: "intro",
          title: "Intro",
          beats: [{ id: "b1", order: 1, narration: "A short beat", media: [] }],
        },
      ],
    },
    "A short beat from source",
  );
  assert.equal(summary.sectionCount, 1);
  assert.equal(summary.beatCount, 1);
  assert.equal(summary.narrationWords, 3);
});

test("summarizeManifestForTrace and summarizeTimelineForTrace keep key trace fields", () => {
  const manifest = {
    assets: [
      {
        id: "img-1",
        role: "primary_visual",
        beatId: "b1",
        sectionId: "intro",
        status: "generated",
        path: "a.png",
        source: { provider: "openai" },
      },
      {
        id: "vox-1",
        role: "voiceover",
        beatId: "b1",
        status: "generated",
        source: { provider: "chatterbox" },
        durationSeconds: 2.4,
      },
    ],
  };
  const timeline = {
    durationSeconds: 2.4,
    segments: [
      {
        beatId: "b1",
        startSeconds: 0,
        endSeconds: 2.4,
        durationSeconds: 2.4,
        voiceAssetId: "vox-1",
        mediaAssetIds: ["img-1"],
      },
    ],
  };
  const manifestSummary = summarizeManifestForTrace(manifest);
  const timelineSummary = summarizeTimelineForTrace(timeline, manifest);
  assert.equal(manifestSummary.imageCount, 1);
  assert.equal(manifestSummary.voiceCount, 1);
  assert.equal(timelineSummary.segments[0].visualSourceBeatId, "b1");
});

test("summarizeVoiceSettingsForTrace redacts path details", () => {
  const summary = summarizeVoiceSettingsForTrace({
    ttsModel: "chatterbox",
    deliveryProfile: "narrative",
    audioPromptPath: "/tmp/private/ref.wav",
  });
  assert.equal(summary.audioPromptFile, "ref.wav");
  assert.equal(summary.hasAudioPromptPath, true);
});

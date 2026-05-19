import assert from "node:assert/strict";
import { test } from "node:test";
import { groupCaptionWords } from "../dist/generate-captions.js";

function wordsFromText(text, startSeconds, endSeconds) {
  const parts = text.split(/\s+/).filter(Boolean);
  const perWord = (endSeconds - startSeconds) / parts.length;
  return parts.map((word, index) => ({
    word,
    startSeconds: Number((startSeconds + perWord * index).toFixed(3)),
    endSeconds: Number((startSeconds + perWord * (index + 1)).toFixed(3)),
    confidence: 1
  }));
}

const shortStoryRules = {
  targetMaxWords: 16,
  hardMaxWords: 22,
  targetMaxDurationSeconds: 5.5,
  hardMaxDurationSeconds: 7,
  minWordsBeforeSentenceBreak: 10
};

test("caption grouping keeps short suspense sentences together", () => {
  const words = wordsFromText(
    "Mia looked through the peephole. No driver. Just a paper bag on the floor.",
    0,
    4.8
  );
  const groups = groupCaptionWords(
    words,
    {
      schemaVersion: 1,
      durationSeconds: 4.8,
      fps: 30,
      width: 1080,
      height: 1920,
      sourcePlanHash: "test",
      segments: [
        {
          sectionId: "intro",
          beatId: "intro-001",
          startSeconds: 0,
          endSeconds: 4.8,
          durationSeconds: 4.8,
          voiceAssetId: "voice-intro-001",
          mediaAssetIds: [],
          transition: "cut_to_audio"
        }
      ]
    },
    shortStoryRules
  );

  assert.deepEqual(
    groups.map((group) => group.map((word) => word.word).join(" ")),
    ["Mia looked through the peephole. No driver. Just a paper bag on the floor."]
  );
});

test("caption grouping still splits long narration at natural boundaries", () => {
  const words = wordsFromText(
    "The hallway went quiet, and every door seemed to breathe with her. She reached for the handle, but the metal was already warm.",
    0,
    8.2
  );
  const groups = groupCaptionWords(
    words,
    {
      schemaVersion: 1,
      durationSeconds: 8.2,
      fps: 30,
      width: 1080,
      height: 1920,
      sourcePlanHash: "test",
      segments: [
        {
          sectionId: "intro",
          beatId: "intro-001",
          startSeconds: 0,
          endSeconds: 8.2,
          durationSeconds: 8.2,
          voiceAssetId: "voice-intro-001",
          mediaAssetIds: [],
          transition: "cut_to_audio"
        }
      ]
    },
    shortStoryRules
  );

  assert.deepEqual(
    groups.map((group) => group.map((word) => word.word).join(" ")),
    [
      "The hallway went quiet, and every door seemed to breathe with her.",
      "She reached for the handle, but the metal was already warm."
    ]
  );
});

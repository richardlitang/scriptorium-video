import assert from "node:assert/strict";
import { test } from "node:test";
import {
  imageDescriptionFromPrompt,
  imageTagsFromPrompt,
} from "../lib/image/image-library-metadata.mjs";

test("imageDescriptionFromPrompt extracts visual target text", () => {
  const prompt = [
    "Story mode: short_story",
    "",
    "Visual target:",
    "A dim hallway with a half-open door and deep shadows.",
    "",
    "Shot type: medium",
  ].join("\n");
  assert.equal(
    imageDescriptionFromPrompt(prompt),
    "A dim hallway with a half-open door and deep shadows.",
  );
});

test("imageTagsFromPrompt normalizes, deduplicates, and caps tags", () => {
  const prompt = [
    "Story mode: short_story",
    "Style preset: Noir",
    "Shot type: Medium",
    "Camera distance: Close",
  ].join("\n");
  const tags = imageTagsFromPrompt(prompt, {
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2",
  });
  assert.deepEqual(tags, [
    "short_story",
    "noir",
    "medium",
    "close",
    "1024x1536",
    "low",
    "gpt-image-2",
  ]);
});

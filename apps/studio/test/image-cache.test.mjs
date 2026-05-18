import assert from "node:assert/strict";
import { test } from "node:test";
import { imageReuseKey, narrationFromImagePrompt, selectCachedImage } from "../image-cache.mjs";

test("image reuse key ignores section metadata and follows narration", () => {
  const first = imageReuseKey({
    narration: "A college student named Mia started getting food deliveries she never ordered.",
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2"
  });
  const second = imageReuseKey({
    narration: "  A college student named Mia started getting food deliveries she never ordered.  ",
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2"
  });

  assert.equal(first, second);
});

test("narration can be recovered from existing image prompt history", () => {
  assert.equal(
    narrationFromImagePrompt("Previous beat narration: none\nCurrent beat narration: Mia opened the door.\nNext beat narration: none"),
    "Mia opened the door."
  );
});

test("cached image lookup prefers exact prompt hash before narration reuse", () => {
  const reuseKey = imageReuseKey({
    narration: "same story beat",
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2"
  });
  const exact = {
    rootPath: "content/projects/a/assets/images/generated/exact.png",
    inputHash: "exact-hash",
    reuseKey,
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2",
    generatedAt: "2026-05-18T10:00:00.000Z"
  };
  const narrationMatch = {
    rootPath: "content/projects/b/assets/images/generated/reuse.png",
    inputHash: "other-hash",
    reuseKey,
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2",
    generatedAt: "2026-05-18T11:00:00.000Z"
  };

  assert.equal(
    selectCachedImage([narrationMatch, exact], {
      inputHash: "exact-hash",
      reuseKey,
      size: "1024x1536",
      quality: "low",
      model: "gpt-image-2",
      allowNarrationReuse: true
    }),
    exact
  );
});

test("cached image lookup can disable loose narration reuse for edited prompts", () => {
  const reuseKey = imageReuseKey({
    narration: "same story beat",
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2"
  });
  const narrationMatch = {
    rootPath: "content/projects/b/assets/images/generated/reuse.png",
    inputHash: "other-hash",
    reuseKey,
    size: "1024x1536",
    quality: "low",
    model: "gpt-image-2",
    generatedAt: "2026-05-18T11:00:00.000Z"
  };

  assert.equal(
    selectCachedImage([narrationMatch], {
      inputHash: "edited-prompt-hash",
      reuseKey,
      size: "1024x1536",
      quality: "low",
      model: "gpt-image-2",
      allowNarrationReuse: false
    }),
    undefined
  );
});

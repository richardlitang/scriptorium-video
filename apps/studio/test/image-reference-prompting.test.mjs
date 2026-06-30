import { test } from "node:test";
import assert from "node:assert/strict";
import { referencePromptForAnchor } from "../lib/image/image-reference-prompting.mjs";

const plan = {
  mode: "short_story",
  visualBible: { stylePreset: "cinematic_illustration", lookAndFeel: "painterly anime" },
};

test("character anchor prompt includes structured identity fields and a neutral framing", () => {
  const anchor = {
    kind: "character",
    id: "c1",
    name: "Mara",
    role: "lead",
    age: "30s",
    body: "tall",
    face: "freckles",
    hair: "red braid",
    wardrobe: "green cloak",
    avoid: "no hats",
  };
  const prompt = referencePromptForAnchor(plan, anchor);
  assert.match(prompt, /Mara/);
  assert.match(prompt, /red braid/);
  assert.match(prompt, /green cloak/);
  assert.match(prompt, /cinematic_illustration/);
  assert.match(prompt, /character (sheet|reference)/i);
  assert.match(prompt, /no hats/);
});

test("location anchor prompt describes an establishing shot", () => {
  const anchor = {
    kind: "location",
    id: "l1",
    name: "Forest Inn",
    description: "mossy roof, amber windows",
    continuityNotes: "smoke from chimney",
    avoid: "no neon",
  };
  const prompt = referencePromptForAnchor(plan, anchor);
  assert.match(prompt, /Forest Inn/);
  assert.match(prompt, /establishing/i);
  assert.match(prompt, /mossy roof/);
});

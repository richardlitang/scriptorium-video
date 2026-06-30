import { test } from "node:test";
import assert from "node:assert/strict";
import { VideoPlanSchema } from "../dist/schemas/video-plan.schema.js";

function basePlan() {
  return {
    schemaVersion: 1,
    title: "T",
    mode: "short_story",
    stylePackId: "default",
    providers: { tts: "mock", transcription: "mock" },
    voice: { provider: "mock", voiceId: "x" },
    sections: [
      {
        id: "s1",
        title: "S",
        beats: [{ id: "b1", order: 1, narration: "n" }],
      },
    ],
  };
}

test("VisualBible accepts structured characters/locations/objects", () => {
  const plan = basePlan();
  plan.visualBible = {
    characters: [
      {
        id: "c1",
        name: "Mara",
        role: "lead",
        age: "30s",
        body: "tall",
        face: "freckles",
        hair: "red braid",
        wardrobe: "green cloak",
        avoid: "no hats",
      },
    ],
    locations: [
      {
        id: "l1",
        name: "Inn",
        description: "mossy roof",
        continuityNotes: "amber windows",
        avoid: "no neon",
      },
    ],
    objects: [
      {
        id: "o1",
        name: "Lantern",
        description: "brass",
        continuityNotes: "always lit",
        avoid: "",
      },
    ],
  };
  const parsed = VideoPlanSchema.parse(plan);
  assert.equal(parsed.visualBible.characters[0].name, "Mara");
  assert.equal(parsed.visualBible.locations[0].id, "l1");
  assert.equal(parsed.visualBible.objects[0].name, "Lantern");
});

test("beat.visual accepts referenceIds and referencePriority with defaults", () => {
  const plan = basePlan();
  plan.sections[0].beats[0].visual = {
    prompt: "p",
    referenceIds: ["c1", "l1"],
    referencePriority: "high",
  };
  const parsed = VideoPlanSchema.parse(plan);
  const v = parsed.sections[0].beats[0].visual;
  assert.deepEqual(v.referenceIds, ["c1", "l1"]);
  assert.equal(v.referencePriority, "high");

  const plan2 = basePlan();
  plan2.sections[0].beats[0].visual = { prompt: "p" };
  const v2 = VideoPlanSchema.parse(plan2).sections[0].beats[0].visual;
  assert.deepEqual(v2.referenceIds, []);
  assert.equal(v2.referencePriority, "medium");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDraftSfxCues } from "../lib/draft/draft-sfx-cues.mjs";

test("normalizeDraftSfxCues returns empty array when cues are missing", () => {
  assert.deepEqual(normalizeDraftSfxCues({}), []);
  assert.deepEqual(normalizeDraftSfxCues({ sfxCues: null }), []);
});

test("normalizeDraftSfxCues applies defaults and clamps cue fields", () => {
  const result = normalizeDraftSfxCues({
    sfxCues: [
      {
        id: "",
        kind: "",
        placement: "invalid",
        offsetSeconds: -99,
        levelDb: 99,
        pan: -9,
        proximity: "invalid",
        duckMusic: "yes",
      },
    ],
  });

  assert.deepEqual(result, [
    {
      id: "cue-1",
      kind: "ambience",
      placement: "manual",
      offsetSeconds: -5,
      levelDb: 12,
      pan: -1,
      proximity: "room",
      duckMusic: false,
    },
  ]);
});

test("normalizeDraftSfxCues keeps at most 6 cues", () => {
  const result = normalizeDraftSfxCues({
    sfxCues: Array.from({ length: 8 }).map((_, index) => ({
      id: `cue-${index + 1}`,
      kind: "hit",
      placement: "manual",
    })),
  });
  assert.equal(result.length, 6);
  assert.equal(result[0].id, "cue-1");
  assert.equal(result[5].id, "cue-6");
});

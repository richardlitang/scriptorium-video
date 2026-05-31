import assert from "node:assert/strict";
import { test } from "node:test";
import { findLegacyBeatFieldUsages } from "../dist/plan-legacy-fields.js";

test("findLegacyBeatFieldUsages detects legacy beat-level fields", () => {
  const summary = findLegacyBeatFieldUsages({
    sections: [
      {
        id: "s1",
        beats: [{ id: "b1", voiceDirection: {}, sfxCues: [], editorial: {} }, { id: "b2" }],
      },
    ],
  });

  assert.equal(summary.total, 3);
  assert.equal(summary.byField.voiceDirection, 1);
  assert.equal(summary.byField.sfxCues, 1);
  assert.equal(summary.byField.editorial, 1);
});

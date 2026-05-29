import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findLegacyBeatFieldUsages,
  findLegacyVoicePauseSecondsUsages,
} from "../dist/plan-legacy-fields.js";

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

test("findLegacyVoicePauseSecondsUsages detects seconds fields in both legacy and canonical voice paths", () => {
  const summary = findLegacyVoicePauseSecondsUsages({
    sections: [
      {
        id: "s1",
        beats: [
          {
            id: "b1",
            voiceDirection: { pauseBeforeSeconds: 0.2 },
            direction: { voice: { pauseAfterSeconds: 0.4 } },
          },
        ],
      },
    ],
  });

  assert.equal(summary.total, 2);
  assert.equal(summary.byField.pauseBeforeSeconds, 1);
  assert.equal(summary.byField.pauseAfterSeconds, 1);
  assert.deepEqual(summary.usages.map((entry) => `${entry.source}.${entry.field}`).sort(), [
    "beat.direction.voice.pauseAfterSeconds",
    "beat.voiceDirection.pauseBeforeSeconds",
  ]);
});

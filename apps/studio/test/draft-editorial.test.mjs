import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDraftEditorial } from "../lib/draft/draft-editorial.mjs";

test("normalizeDraftEditorial returns undefined when no editorial fields are present", () => {
  assert.equal(normalizeDraftEditorial({}), undefined);
});

test("normalizeDraftEditorial normalizes and clamps editorial payload", () => {
  const normalized = normalizeDraftEditorial({
    visualEditCues: [
      {
        id: "",
        type: "invalid",
        placement: "invalid",
        offsetSeconds: -99,
        durationSeconds: 99,
        target: "next_visual",
        intensity: 99,
      },
    ],
    silenceWindows: [
      {
        id: "",
        placement: "invalid",
        offsetSeconds: 99,
        durationSeconds: -5,
        muteMusic: false,
        muteSfx: false,
        keepVoice: true,
      },
    ],
    endingPolicy: {
      cutToBlack: true,
      holdSeconds: 99,
      audioPolicy: "invalid",
      avoidOutro: true,
    },
  });

  assert.deepEqual(normalized, {
    visualEditCues: [
      {
        id: "edit-1",
        type: "hard_cut",
        placement: "manual",
        offsetSeconds: -5,
        durationSeconds: 8,
        target: "current_visual",
        intensity: 1,
      },
    ],
    silenceWindows: [
      {
        id: "silence-1",
        placement: "manual",
        offsetSeconds: 5,
        durationSeconds: 0.1,
        muteMusic: false,
        muteSfx: false,
        keepVoice: true,
      },
    ],
    endingPolicy: {
      cutToBlack: true,
      holdSeconds: 4,
      audioPolicy: "none",
      avoidOutro: true,
    },
  });
});

test("normalizeDraftEditorial enforces cue/window limits", () => {
  const normalized = normalizeDraftEditorial({
    visualEditCues: Array.from({ length: 8 }).map((_, index) => ({
      id: `v${index + 1}`,
      type: "hard_cut",
      placement: "manual",
    })),
    silenceWindows: Array.from({ length: 5 }).map((_, index) => ({
      id: `s${index + 1}`,
      placement: "manual",
    })),
  });
  assert.equal(normalized.visualEditCues.length, 4);
  assert.equal(normalized.silenceWindows.length, 2);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { imageVisualDirection } from "../lib/image/image-visual-direction.mjs";

test("imageVisualDirection includes project, section, and visual-bible cues", () => {
  const text = imageVisualDirection(
    {
      direction: { creative: { feel: "tense", pacing: "measured", visualStyle: "noir realism" } },
      visualBible: {
        stylePreset: "cinematic",
        lookAndFeel: "moody",
        characterAnchors: ["protagonist silhouette"],
        continuityRules: ["keep same coat"],
      },
    },
    { direction: { creative: { feel: "claustrophobic", visualStyle: "close interiors" } } },
  );
  assert.match(text, /Project feel: tense/);
  assert.match(text, /Project visual style: noir realism/);
  assert.match(text, /Section feel: claustrophobic/);
  assert.match(text, /Style preset: cinematic/);
  assert.match(text, /Continuity rules: keep same coat/);
});

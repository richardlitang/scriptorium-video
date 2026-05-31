import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectImageTargetsFromCandidates,
  visualAssetMatchesSize,
} from "../lib/image/image-target-selection.mjs";

test("visualAssetMatchesSize accepts exact dimensions and rejects mismatched orientation", () => {
  assert.equal(visualAssetMatchesSize({ width: 1024, height: 1536 }, "1024x1536"), true);
  assert.equal(visualAssetMatchesSize({ width: 1536, height: 1024 }, "1024x1536"), false);
});

test("selectImageTargetsFromCandidates treats wrong-orientation visual as missing", () => {
  const allTargets = [
    {
      section: { id: "intro" },
      beat: { id: "intro-001", order: 1, narration: "A reveal." },
      assetId: "image-intro-001",
      referencePriority: "medium",
    },
  ];
  const assets = [
    {
      id: "image-intro-001",
      beatId: "intro-001",
      sectionId: "intro",
      role: "primary_visual",
      width: 1536,
      height: 1024,
      status: "generated",
    },
  ];

  const selected = selectImageTargetsFromCandidates({
    allTargets,
    assets,
    mode: "missing",
    coverage: "beat",
    options: { size: "1024x1536" },
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].beat.id, "intro-001");
});

test("selectImageTargetsFromCandidates skips locked_by_user unless forced", () => {
  const allTargets = [
    {
      section: { id: "intro" },
      beat: { id: "intro-001", order: 1, narration: "Locked beat." },
      assetId: "image-intro-001",
      referencePriority: "low",
    },
  ];
  const assets = [
    {
      id: "image-intro-001",
      beatId: "intro-001",
      sectionId: "intro",
      role: "primary_visual",
      width: 1024,
      height: 1536,
      status: "locked_by_user",
    },
  ];

  const unlocked = selectImageTargetsFromCandidates({
    allTargets,
    assets,
    mode: "all",
    coverage: "beat",
    options: { size: "1024x1536", force: false },
  });
  assert.equal(unlocked.length, 0);

  const forced = selectImageTargetsFromCandidates({
    allTargets,
    assets,
    mode: "all",
    coverage: "beat",
    options: { size: "1024x1536", force: true },
  });
  assert.equal(forced.length, 1);
});

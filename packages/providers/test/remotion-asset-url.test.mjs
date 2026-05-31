import assert from "node:assert/strict";
import { test } from "node:test";
import { remotionAssetUrl } from "../dist/renderer/remotion/remotion-renderer.js";

test("Remotion renderer passes local media as HTTP asset URLs instead of large data URLs", () => {
  const url = remotionAssetUrl("http://127.0.0.1:3102", "image-intro-001");

  assert.equal(url, "http://127.0.0.1:3102/assets/image-intro-001");
  assert.doesNotMatch(url, /^data:/);
});

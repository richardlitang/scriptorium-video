import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageGenerationRunner } from "../lib/image/image-generation-runner.mjs";

test("image generation runner returns skipped when no targets match", async () => {
  let mkdirCalls = 0;
  let syncCalls = 0;

  const runner = createImageGenerationRunner({
    path: { join: (...parts) => parts.join("/"), relative: () => "x.png" },
    projectsDir: "/projects",
    safeReadJson: async (file) =>
      file.endsWith("video-plan.json") ? { sections: [] } : { schemaVersion: 1, assets: [] },
    readImageHistory: async () => [],
    normalizeImageCoverage: () => "balanced",
    defaultImageSizeForPlan: () => "1536x1024",
    imageTargetsFromPlan: () => [],
    selectImageTargetsFromCandidates: () => [],
    mkdir: async () => {
      mkdirCalls += 1;
    },
    updateRunProgress: async () => {},
    mapWithConcurrency: async () => [],
    sha256: () => "hash",
    imageReuseKey: () => "key",
    findReusableImage: async () => undefined,
    readFile: async () => Buffer.from(""),
    writeFile: async () => {},
    generateImageWithOpenAi: async () => ({ bytes: Buffer.from(""), model: "m" }),
    storeImageInLibrary: async () => ({ rootPath: "p", description: "", tags: [], sha256: "s" }),
    dimensionsFromSize: () => ({ width: 1, height: 1 }),
    appendImageHistory: async () => {},
    appendImageCacheEntry: async () => {},
    runLvstudio: async () => {
      syncCalls += 1;
      return { stdout: "ok" };
    },
    appendQualityHistory: async () => {},
  });

  const result = await runner.generateProjectImages("demo", {});
  assert.equal(result.skipped, "No image targets matched the selected mode.");
  assert.equal(mkdirCalls, 0);
  assert.equal(syncCalls, 0);
});

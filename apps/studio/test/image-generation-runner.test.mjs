import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageGenerationRunner } from "../lib/image/image-generation-runner.mjs";

function makeRunnerDeps(overrides = {}) {
  const plan = overrides.planOverride ?? {
    mode: "short_story",
    title: "T",
    targetPlatform: "local_only",
    visualBible: {},
    sections: [],
  };
  const manifest = { schemaVersion: 1, assets: [] };
  const written = new Map();
  const targets = plan.sections.flatMap((section) =>
    section.beats.map((beat, beatIndex) => ({
      section,
      beat,
      beatIndex,
      assetId: `image-${beat.id}`,
      defaultPrompt: beat.visual?.prompt || beat.narration,
      referenceIds: beat.visual?.referenceIds || [],
      references: (beat.visual?.referenceIds || []).map((id) => ({ id, kind: "character" })),
    })),
  );
  const deps = {
    path: {
      join: (...parts) => parts.join("/"),
      relative: (_from, to) => to.replace("/projects/proj/", ""),
    },
    projectsDir: "/projects",
    safeReadJson: async (file) => (file.endsWith("video-plan.json") ? plan : manifest),
    readImageHistory: async () => [],
    normalizeImageCoverage: () => "beat",
    defaultImageSizeForPlan: () => "1024x1536",
    imageTargetsFromPlan: () => targets,
    selectImageTargetsFromCandidates: ({ allTargets }) => allTargets,
    mkdir: async () => {},
    updateRunProgress: async () => {},
    mapWithConcurrency: async (items, _concurrency, fn) => Promise.all(items.map(fn)),
    sha256: (value) => `hash-${String(value).length}`,
    imageReuseKey: ({ narration }) => `reuse-${narration}`,
    findReusableImage: async () => undefined,
    readFile: async () => Buffer.from("refbytes"),
    writeFile: async (file, bytes) => {
      written.set(file, bytes);
    },
    generateImageWithOpenAi: async () => ({
      bytes: Buffer.from("generated"),
      model: "gpt-image-2",
    }),
    storeImageInLibrary: async ({ bytes }) => ({
      rootPath: `/library/${bytes.toString()}.png`,
      description: "",
      tags: [],
      sha256: `sha-${bytes.toString()}`,
    }),
    dimensionsFromSize: () => ({ width: 1024, height: 1536 }),
    appendImageHistory: async () => {},
    appendImageCacheEntry: async () => {},
    domainOps: { sync: async () => ({ ok: true }) },
    appendQualityHistory: async () => {},
    ...overrides,
  };
  delete deps.planOverride;
  return deps;
}

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

test("beats with resolved references are generated via edits; others via text-to-image", async () => {
  const calls = { edit: 0, generate: 0 };
  const referenceMap = new Map([
    ["c1", { absolutePath: "/abs/c1.png", kind: "character", sha256: "sha-c1" }],
  ]);

  const deps = makeRunnerDeps({
    planOverride: {
      mode: "short_story",
      title: "T",
      targetPlatform: "local_only",
      visualBible: { characters: [{ id: "c1", name: "Mara" }], locations: [], objects: [] },
      sections: [
        {
          id: "s1",
          title: "S",
          beats: [
            {
              id: "b1",
              order: 1,
              narration: "Mara appears",
              visual: { prompt: "Mara", referenceIds: ["c1"] },
            },
            {
              id: "b2",
              order: 2,
              narration: "An empty road",
              visual: { prompt: "road", referenceIds: [] },
            },
          ],
        },
      ],
    },
    ensureReferenceImages: async () => ({
      references: referenceMap,
      generated: ["c1"],
      skipped: [],
    }),
    readFile: async () => Buffer.from("refbytes"),
    editImageWithOpenAi: async () => {
      calls.edit += 1;
      return { bytes: Buffer.from("edited"), model: "gpt-image-2" };
    },
    generateImageWithOpenAi: async () => {
      calls.generate += 1;
      return { bytes: Buffer.from("generated"), model: "gpt-image-2" };
    },
  });

  const runner = createImageGenerationRunner(deps);
  await runner.generateProjectImages("proj", { coverage: "beat", mode: "all" });
  assert.equal(calls.edit, 1, "b1 must use the edits endpoint");
  assert.equal(calls.generate, 1, "b2 must use text-to-image");
});

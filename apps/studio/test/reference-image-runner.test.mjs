import { test } from "node:test";
import assert from "node:assert/strict";
import { createReferenceImageRunner } from "../lib/image/reference-image-runner.mjs";

function makePlan() {
  return {
    mode: "short_story",
    visualBible: {
      stylePreset: "cinematic_illustration",
      characters: [{ id: "c1", name: "Mara", hair: "red braid" }],
      locations: [{ id: "l1", name: "Inn", description: "mossy roof" }],
      objects: [],
    },
  };
}

function makeDeps(overrides = {}) {
  const written = [];
  const manifest = { schemaVersion: 1, references: {} };
  return {
    written,
    manifest,
    deps: {
      generateImageWithOpenAi: async ({ prompt }) => ({
        bytes: Buffer.from(`img:${prompt.slice(0, 8)}`),
        model: "gpt-image-2",
      }),
      referencePromptForAnchor: (_plan, anchor) => `prompt-for-${anchor.id}`,
      sha256: (bytes) => `sha-${Buffer.from(bytes).toString("hex").slice(0, 6)}`,
      readReferenceManifest: async () => manifest,
      writeReferenceManifest: async (_projectId, next) => {
        manifest.references = next.references;
      },
      writeReferenceImage: async (_projectId, anchorId, bytes) => {
        const p = `assets/images/references/${anchorId}.png`;
        written.push({ anchorId, bytes, path: p });
        return { relativePath: p, absolutePath: `/abs/${p}` };
      },
      defaultImageSizeForPlan: () => "1024x1536",
      ...overrides,
    },
  };
}

test("generates one reference per character and location, skips objects when empty", async () => {
  const { deps, written } = makeDeps();
  const runner = createReferenceImageRunner(deps);
  const result = await runner.ensureReferenceImages(makePlan(), "proj", {});
  assert.deepEqual([...result.references.keys()].sort(), ["c1", "l1"]);
  assert.equal(written.length, 2);
  assert.equal(result.generated.length, 2);
});

test("is idempotent: existing manifest entries are reused, not regenerated", async () => {
  const { deps, written, manifest } = makeDeps();
  manifest.references = {
    c1: {
      anchorId: "c1",
      kind: "character",
      path: "assets/images/references/c1.png",
      sha256: "sha-x",
      prompt: "p",
      generatedAt: new Date().toISOString(),
      locked: true,
    },
  };
  let absResolved = false;
  deps.resolveExistingReference = async () => {
    absResolved = true;
    return "/abs/assets/images/references/c1.png";
  };
  const runner = createReferenceImageRunner(deps);
  const result = await runner.ensureReferenceImages(makePlan(), "proj", {});
  assert.equal(result.generated.includes("c1"), false, "c1 must not be regenerated");
  assert.equal(result.generated.includes("l1"), true, "l1 is new");
  assert.equal(written.filter((w) => w.anchorId === "c1").length, 0);
  assert.equal(absResolved, true);
});

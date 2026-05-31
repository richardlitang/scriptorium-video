import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config-resolver.js";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function planFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    title: "Fixture",
    mode: "wide_mode",
    targetPlatform: "local_only",
    stylePackId: "default",
    providers: {
      llm: "manual",
      tts: "chatterbox",
      transcription: "mock",
      media: "manual-media",
      renderer: "remotion",
    },
    voice: { provider: "chatterbox", voiceId: "clone", format: "wav", options: {} },
    sections: [],
    overrides,
  };
}

test("resolveConfig accepts 16:9 aspect ratio from layered config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-config-resolver-"));
  try {
    await writeJson(path.join(root, "modes", "wide-mode.json"), {
      id: "wide_mode",
      defaults: {
        aspectRatio: "16:9",
        resolution: { width: 1920, height: 1080 },
        templateId: "documentary-longform",
      },
    });

    const config = await resolveConfig(planFixture(), root);

    assert.equal(config.aspectRatio, "16:9");
    assert.deepEqual(config.resolution, { width: 1920, height: 1080 });
    assert.equal(config.templateId, "documentary-longform");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

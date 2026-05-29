import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createVoiceSettingsStore } from "../lib/tts/voice-settings-store.mjs";

test("voice settings store reads defaults when settings file is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-voice-store-"));
  try {
    const voiceSettingsPath = path.join(root, ".studio-data", "voice-settings.json");
    const defaultVoiceSettings = { ttsModel: "chatterbox" };
    const { readVoiceSettings } = createVoiceSettingsStore({
      safeReadJson: async () => {
        throw new Error("missing");
      },
      normalizeVoiceSettings: (settings) => settings,
      defaultVoiceSettings,
      voiceSettingsPath,
      pathImpl: path,
    });

    const loaded = await readVoiceSettings();
    assert.deepEqual(loaded, defaultVoiceSettings);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("voice settings store writes normalized settings to disk", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lvstudio-voice-store-"));
  try {
    const voiceSettingsPath = path.join(root, ".studio-data", "voice-settings.json");
    const normalized = { ttsModel: "chatterbox", exaggeration: 0.42 };
    const { writeVoiceSettings } = createVoiceSettingsStore({
      safeReadJson: async () => ({}),
      normalizeVoiceSettings: () => normalized,
      defaultVoiceSettings: { ttsModel: "chatterbox" },
      voiceSettingsPath,
      pathImpl: path,
    });

    const result = await writeVoiceSettings({ ttsModel: "other" });
    assert.deepEqual(result, normalized);
    const saved = JSON.parse(await readFile(voiceSettingsPath, "utf8"));
    assert.deepEqual(saved, normalized);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

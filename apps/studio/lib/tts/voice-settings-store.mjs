import { mkdir, writeFile } from "node:fs/promises";

export function createVoiceSettingsStore({
  safeReadJson,
  normalizeVoiceSettings,
  defaultVoiceSettings,
  voiceSettingsPath,
  pathImpl,
}) {
  if (typeof safeReadJson !== "function")
    throw new Error("createVoiceSettingsStore requires safeReadJson.");
  if (typeof normalizeVoiceSettings !== "function")
    throw new Error("createVoiceSettingsStore requires normalizeVoiceSettings.");
  if (!defaultVoiceSettings)
    throw new Error("createVoiceSettingsStore requires defaultVoiceSettings.");
  if (!voiceSettingsPath) throw new Error("createVoiceSettingsStore requires voiceSettingsPath.");
  if (!pathImpl) throw new Error("createVoiceSettingsStore requires pathImpl.");

  async function readVoiceSettings() {
    const saved = await safeReadJson(voiceSettingsPath).catch(() => defaultVoiceSettings);
    return normalizeVoiceSettings(saved);
  }

  async function writeVoiceSettings(settings) {
    const normalized = normalizeVoiceSettings(settings);
    await mkdir(pathImpl.dirname(voiceSettingsPath), { recursive: true });
    await writeFile(voiceSettingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  }

  return { readVoiceSettings, writeVoiceSettings };
}

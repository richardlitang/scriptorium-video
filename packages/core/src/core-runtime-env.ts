type CoreRuntimeEnv = Record<string, string | undefined>;

function finiteNumberOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function coreTtsConcurrency(env: CoreRuntimeEnv = process.env): number | undefined {
  const value = finiteNumberOrUndefined(env.LVSTUDIO_TTS_CONCURRENCY);
  if (value === undefined || value <= 0) return undefined;
  return Math.max(1, Math.floor(value));
}

export function coreSfxLibraryDir(env: CoreRuntimeEnv = process.env): string | undefined {
  const raw = env.LVSTUDIO_SFX_LIBRARY_DIR;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function coreDefaultMusicBed(env: CoreRuntimeEnv = process.env): string | undefined {
  const raw = env.LVSTUDIO_DEFAULT_MUSIC_BED;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function coreAutoMusicBedEnabled(env: CoreRuntimeEnv = process.env): boolean {
  return env.LVSTUDIO_ENABLE_AUTO_MUSIC_BED !== "0";
}

export function coreMusicBedLevelDb(env: CoreRuntimeEnv = process.env): number {
  const parsed = finiteNumberOrUndefined(env.LVSTUDIO_MUSIC_BED_LEVEL_DB);
  return parsed ?? -24;
}

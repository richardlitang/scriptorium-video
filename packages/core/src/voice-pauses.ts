type VoicePauseFields = {
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
};

/** Strips any legacy `*Seconds` keys that may linger in un-migrated data. */
export function canonicalizeVoicePauseFields<T extends VoicePauseFields>(direction: T): T {
  const out = { ...direction } as Record<string, unknown>;
  delete out["pauseBeforeSeconds"];
  delete out["pauseAfterSeconds"];
  return out as T;
}

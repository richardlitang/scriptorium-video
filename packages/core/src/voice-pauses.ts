type VoicePauseFields = {
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  pauseBeforeSeconds?: number;
  pauseAfterSeconds?: number;
};

export type VoicePauseConflict = {
  field: "pauseBefore" | "pauseAfter";
  msValue: number;
  secondsValue: number;
  secondsAsMs: number;
  deltaMs: number;
};

function msFromSeconds(value: number): number {
  return Math.round(value * 1000);
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function detectVoicePauseConflicts(
  direction: Partial<VoicePauseFields> | undefined,
  toleranceMs = 1,
): VoicePauseConflict[] {
  if (!direction) return [];
  const conflicts: VoicePauseConflict[] = [];
  const beforeMs = asFiniteNumber(direction.pauseBeforeMs);
  const beforeSeconds = asFiniteNumber(direction.pauseBeforeSeconds);
  if (beforeMs !== undefined && beforeSeconds !== undefined) {
    const secondsAsMs = msFromSeconds(beforeSeconds);
    const deltaMs = Math.abs(beforeMs - secondsAsMs);
    if (deltaMs > toleranceMs) {
      conflicts.push({
        field: "pauseBefore",
        msValue: beforeMs,
        secondsValue: beforeSeconds,
        secondsAsMs,
        deltaMs,
      });
    }
  }
  const afterMs = asFiniteNumber(direction.pauseAfterMs);
  const afterSeconds = asFiniteNumber(direction.pauseAfterSeconds);
  if (afterMs !== undefined && afterSeconds !== undefined) {
    const secondsAsMs = msFromSeconds(afterSeconds);
    const deltaMs = Math.abs(afterMs - secondsAsMs);
    if (deltaMs > toleranceMs) {
      conflicts.push({
        field: "pauseAfter",
        msValue: afterMs,
        secondsValue: afterSeconds,
        secondsAsMs,
        deltaMs,
      });
    }
  }
  return conflicts;
}

export function canonicalizeVoicePauseFields<T extends VoicePauseFields>(direction: T): T {
  const {
    pauseBeforeSeconds: _pauseBeforeSeconds,
    pauseAfterSeconds: _pauseAfterSeconds,
    ...rest
  } = direction;
  const pauseBeforeMs =
    direction.pauseBeforeMs ??
    (direction.pauseBeforeSeconds !== undefined
      ? msFromSeconds(direction.pauseBeforeSeconds)
      : undefined);
  const pauseAfterMs =
    direction.pauseAfterMs ??
    (direction.pauseAfterSeconds !== undefined
      ? msFromSeconds(direction.pauseAfterSeconds)
      : undefined);

  return {
    ...rest,
    ...(pauseBeforeMs !== undefined ? { pauseBeforeMs } : {}),
    ...(pauseAfterMs !== undefined ? { pauseAfterMs } : {}),
  } as T;
}

export type LegacyBeatField = "voiceDirection" | "sfxCues" | "editorial";
export type LegacyVoicePauseSecondsField = "pauseBeforeSeconds" | "pauseAfterSeconds";

export type LegacyBeatFieldUsage = {
  sectionId?: string;
  beatId?: string;
  field: LegacyBeatField;
};

export type LegacyBeatFieldSummary = {
  total: number;
  byField: Record<LegacyBeatField, number>;
  usages: LegacyBeatFieldUsage[];
};

export type LegacyVoicePauseSecondsUsage = {
  sectionId?: string;
  beatId?: string;
  field: LegacyVoicePauseSecondsField;
  source: "beat.voiceDirection" | "beat.direction.voice";
};

export type LegacyVoicePauseSecondsSummary = {
  total: number;
  byField: Record<LegacyVoicePauseSecondsField, number>;
  usages: LegacyVoicePauseSecondsUsage[];
};

export function findLegacyBeatFieldUsages(rawPlan: unknown): LegacyBeatFieldSummary {
  const usages: LegacyBeatFieldUsage[] = [];
  const byField: Record<LegacyBeatField, number> = {
    voiceDirection: 0,
    sfxCues: 0,
    editorial: 0,
  };
  const plan = rawPlan && typeof rawPlan === "object" ? rawPlan : {};
  const sections = Array.isArray((plan as { sections?: unknown }).sections)
    ? (plan as { sections: Array<{ id?: string; beats?: unknown[] }> }).sections
    : [];

  for (const section of sections) {
    const beats = Array.isArray(section?.beats) ? section.beats : [];
    for (const beat of beats) {
      if (!beat || typeof beat !== "object") continue;
      const beatObj = beat as Record<string, unknown>;
      for (const field of ["voiceDirection", "sfxCues", "editorial"] as LegacyBeatField[]) {
        if (!Object.hasOwn(beatObj, field)) continue;
        byField[field] += 1;
        usages.push({ sectionId: section?.id, beatId: beatObj.id as string | undefined, field });
      }
    }
  }

  return {
    total: usages.length,
    byField,
    usages,
  };
}

function collectLegacyPauseFieldUsages(
  voiceDirection: unknown,
  source: "beat.voiceDirection" | "beat.direction.voice",
  sectionId: string | undefined,
  beatId: string | undefined,
  usages: LegacyVoicePauseSecondsUsage[],
  byField: Record<LegacyVoicePauseSecondsField, number>,
) {
  if (!voiceDirection || typeof voiceDirection !== "object") return;
  const direction = voiceDirection as Record<string, unknown>;
  for (const field of [
    "pauseBeforeSeconds",
    "pauseAfterSeconds",
  ] as LegacyVoicePauseSecondsField[]) {
    if (!Object.hasOwn(direction, field)) continue;
    byField[field] += 1;
    usages.push({ sectionId, beatId, field, source });
  }
}

export function findLegacyVoicePauseSecondsUsages(
  rawPlan: unknown,
): LegacyVoicePauseSecondsSummary {
  const usages: LegacyVoicePauseSecondsUsage[] = [];
  const byField: Record<LegacyVoicePauseSecondsField, number> = {
    pauseBeforeSeconds: 0,
    pauseAfterSeconds: 0,
  };
  const plan = rawPlan && typeof rawPlan === "object" ? rawPlan : {};
  const sections = Array.isArray((plan as { sections?: unknown }).sections)
    ? (plan as { sections: Array<{ id?: string; beats?: unknown[] }> }).sections
    : [];

  for (const section of sections) {
    const beats = Array.isArray(section?.beats) ? section.beats : [];
    for (const beat of beats) {
      if (!beat || typeof beat !== "object") continue;
      const beatObj = beat as Record<string, unknown>;
      collectLegacyPauseFieldUsages(
        beatObj.voiceDirection,
        "beat.voiceDirection",
        section?.id,
        beatObj.id as string | undefined,
        usages,
        byField,
      );
      const directionVoice =
        beatObj.direction && typeof beatObj.direction === "object"
          ? (beatObj.direction as Record<string, unknown>).voice
          : undefined;
      collectLegacyPauseFieldUsages(
        directionVoice,
        "beat.direction.voice",
        section?.id,
        beatObj.id as string | undefined,
        usages,
        byField,
      );
    }
  }

  return {
    total: usages.length,
    byField,
    usages,
  };
}

export type LegacyBeatField = "voiceDirection" | "sfxCues" | "editorial";

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

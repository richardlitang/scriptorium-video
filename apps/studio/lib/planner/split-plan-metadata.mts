type BeatRecord = {
  id: string;
  order: number;
  narration: string;
  timing?: Record<string, unknown> & { estimatedDurationSeconds?: number };
  media?: Array<Record<string, unknown> & { prompt?: string; scaleMode?: string }>;
  motion?: Record<string, unknown>;
  visual?: Record<string, unknown> & { prompt?: string; source?: string };
  direction?: Record<string, unknown>;
  directionMeta?: Record<string, unknown>;
  caption?: Record<string, unknown>;
  voiceDirection?: Record<string, unknown> & { profile?: string; source?: string };
  sfxCues?: unknown[];
  editorial?: Record<string, unknown>;
  emotion?: unknown;
  notes?: string;
};

type SectionRecord = {
  direction?: Record<string, unknown>;
  directionMeta?: Record<string, unknown>;
  beats: BeatRecord[];
};

type PlanRecord = {
  sections: SectionRecord[];
};

function mergeBeatMetadataIntoLockedBeat(
  lockedBeat: BeatRecord,
  draftBeat?: BeatRecord,
): BeatRecord {
  if (!draftBeat) return lockedBeat;
  return {
    ...lockedBeat,
    timing: {
      ...lockedBeat.timing,
      estimatedDurationSeconds:
        lockedBeat.timing?.estimatedDurationSeconds ?? draftBeat.timing?.estimatedDurationSeconds,
    },
    media:
      Array.isArray(draftBeat.media) && draftBeat.media[0]
        ? [
            {
              ...lockedBeat.media?.[0],
              prompt: String(
                draftBeat.media[0].prompt || draftBeat.visual?.prompt || lockedBeat.narration,
              ),
              scaleMode: String(
                draftBeat.media[0].scaleMode ||
                  draftBeat.visual?.scaleMode ||
                  lockedBeat.media?.[0]?.scaleMode ||
                  "safe_cover",
              ),
            },
          ]
        : lockedBeat.media,
    motion: draftBeat.motion || lockedBeat.motion,
    visual: {
      ...(lockedBeat.visual || {}),
      ...(draftBeat.visual || {}),
      prompt: String(
        draftBeat.visual?.prompt ||
          draftBeat.media?.[0]?.prompt ||
          lockedBeat.visual?.prompt ||
          lockedBeat.narration,
      ),
      source: String(draftBeat.visual?.source || "llm"),
    },
    direction: draftBeat.direction || lockedBeat.direction,
    directionMeta: draftBeat.directionMeta || lockedBeat.directionMeta,
    caption: draftBeat.caption || lockedBeat.caption,
    voiceDirection: draftBeat.voiceDirection || lockedBeat.voiceDirection,
    sfxCues: draftBeat.sfxCues || lockedBeat.sfxCues,
    editorial: draftBeat.editorial || lockedBeat.editorial,
    emotion: draftBeat.emotion || lockedBeat.emotion,
    notes: draftBeat.notes || lockedBeat.notes,
  };
}

export function assertLockedNarrationPreserved(plan: PlanRecord, lockedPlan: PlanRecord): void {
  const source = lockedPlan.sections.flatMap((section) => section.beats ?? []);
  const next = plan.sections.flatMap((section) => section.beats ?? []);
  if (source.length !== next.length) {
    throw new Error(
      `Split planner produced ${next.length} beats for ${source.length} locked script beat(s).`,
    );
  }
  for (let index = 0; index < source.length; index += 1) {
    if (source[index].narration !== next[index].narration) {
      throw new Error(`Split planner changed locked narration at beat ${source[index].id}.`);
    }
  }
}

export function mergeSectionMetadataPlan(
  lockedPlan: PlanRecord,
  sectionIndex: number,
  draftPlan: PlanRecord,
): PlanRecord {
  const draftBeats = (draftPlan.sections ?? []).flatMap((section) => section.beats ?? []);
  const beatIdFromLockedNarration = (value: unknown): string => {
    const text = String(value || "").trim();
    const match = text.match(/^\[([a-z0-9-]+)\]\s*/i);
    return match?.[1] || "";
  };
  const draftBeatByLockedId = new Map<string, BeatRecord>();
  for (const draftBeat of draftBeats) {
    const id = beatIdFromLockedNarration(draftBeat?.narration);
    if (id && !draftBeatByLockedId.has(id)) draftBeatByLockedId.set(id, draftBeat);
  }
  const nextSections = lockedPlan.sections.map((section, index) => {
    if (index !== sectionIndex) return section;
    return {
      ...section,
      direction: draftPlan.sections?.[0]?.direction || section.direction,
      directionMeta: draftPlan.sections?.[0]?.directionMeta || section.directionMeta,
      beats: section.beats.map((beat, beatIndex) => {
        const draftBeat = draftBeatByLockedId.get(beat.id) || draftBeats[beatIndex];
        const merged = mergeBeatMetadataIntoLockedBeat(beat, draftBeat);
        return {
          ...merged,
          id: beat.id,
          order: beat.order,
          narration: beat.narration,
          timing: {
            ...(merged.timing || {}),
            locked: true,
          },
        };
      }),
    };
  });
  return {
    ...lockedPlan,
    sections: nextSections,
  };
}

export function fallbackMetadataForLockedSection(
  plan: PlanRecord,
  sectionIndex: number,
  error: unknown,
): PlanRecord {
  const section = plan.sections[sectionIndex];
  if (!section) return plan;
  const nextSections = plan.sections.map((entry, index) => {
    if (index !== sectionIndex) return entry;
    return {
      ...entry,
      beats: entry.beats.map((beat, beatIndex) => ({
        ...beat,
        visual: {
          ...(beat.visual || {}),
          prompt: String(beat.visual?.prompt || beat.narration),
          priority: beatIndex === 0 ? 4 : 3,
          needsUniqueImage: true,
          reusePolicy: "none",
          coverageRole: beatIndex === 0 ? "key_moment" : "supporting",
          source: "default",
        },
        motion: beat.motion || { type: "slow_zoom_in", intensity: 0.1 },
        caption: beat.caption || { emphasis: [], style: "default" },
        voiceDirection: {
          ...(beat.voiceDirection || {}),
          profile: String(beat.voiceDirection?.profile || "neutral"),
          source: String(beat.voiceDirection?.source || "default"),
        },
        notes: [
          beat.notes || beat.narration,
          `Split planner metadata fallback used for this beat: ${String(error instanceof Error ? error.message : error || "unknown error")}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      })),
    };
  });
  return { ...plan, sections: nextSections };
}

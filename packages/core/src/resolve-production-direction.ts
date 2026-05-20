import {
  BeatEditorialSchema,
  MotionSchema,
  VoiceDirectionSchema,
  type Beat,
  type Section,
  type SoundCueIntent,
  type VisualIntent,
  type VideoPlan
} from "./schemas/video-plan.schema.js";

type CaptionTuning = {
  targetMaxWords?: number;
  hardMaxWords?: number;
  targetMaxDurationSeconds?: number;
  hardMaxDurationSeconds?: number;
  minWordsBeforeSentenceBreak?: number;
};

type SourceLabel = "default" | "llm" | "inherited" | "user";

export type ResolvedBeatProductionDirection = {
  creative: {
    feel?: string;
    pacing?: string;
    visualStyle?: string;
    tension?: number;
    continuityStrictness?: number;
  };
  voiceDirection: ReturnType<typeof VoiceDirectionSchema.parse>;
  caption: {
    style: string;
    emphasis: string[];
    tuning: CaptionTuning;
  };
  visual?: VisualIntent;
  motion: ReturnType<typeof MotionSchema.parse>;
  sfxCues: SoundCueIntent[];
  editorial?: ReturnType<typeof BeatEditorialSchema.parse>;
  sources: {
    voice: SourceLabel;
    caption: SourceLabel;
    motion: SourceLabel;
    sfx: SourceLabel;
    editorial: SourceLabel;
  };
};

function firstDefined<T>(...values: (T | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function sourceByLayer(
  beatValue: unknown,
  sectionValue: unknown,
  projectValue: unknown,
  legacyValue: unknown,
  explicit?: SourceLabel
): SourceLabel {
  if (explicit) return explicit;
  if (hasValue(beatValue)) return "user";
  if (hasValue(sectionValue) || hasValue(projectValue)) return "inherited";
  if (hasValue(legacyValue)) return "llm";
  return "default";
}

function resolveCaptionTuning(plan: VideoPlan, section: Section, beat: Beat): CaptionTuning {
  const project = plan.direction?.caption?.tuning;
  const sectionLevel = section.direction?.caption?.tuning;
  const beatLevel = beat.direction?.caption?.tuning;
  const fallback = plan.overrides?.captionTuning;
  return {
    targetMaxWords: firstDefined(beatLevel?.targetMaxWords, sectionLevel?.targetMaxWords, project?.targetMaxWords, fallback?.targetMaxWords),
    hardMaxWords: firstDefined(beatLevel?.hardMaxWords, sectionLevel?.hardMaxWords, project?.hardMaxWords, fallback?.hardMaxWords),
    targetMaxDurationSeconds: firstDefined(
      beatLevel?.targetMaxDurationSeconds,
      sectionLevel?.targetMaxDurationSeconds,
      project?.targetMaxDurationSeconds,
      fallback?.targetMaxDurationSeconds
    ),
    hardMaxDurationSeconds: firstDefined(
      beatLevel?.hardMaxDurationSeconds,
      sectionLevel?.hardMaxDurationSeconds,
      project?.hardMaxDurationSeconds,
      fallback?.hardMaxDurationSeconds
    ),
    minWordsBeforeSentenceBreak: firstDefined(
      beatLevel?.minWordsBeforeSentenceBreak,
      sectionLevel?.minWordsBeforeSentenceBreak,
      project?.minWordsBeforeSentenceBreak,
      fallback?.minWordsBeforeSentenceBreak
    )
  };
}

export function resolveBeatProductionDirection(plan: VideoPlan, section: Section, beat: Beat): ResolvedBeatProductionDirection {
  const creative = {
    feel: firstDefined(beat.direction?.creative?.feel, section.direction?.creative?.feel, plan.direction?.creative?.feel),
    pacing: firstDefined(beat.direction?.creative?.pacing, section.direction?.creative?.pacing, plan.direction?.creative?.pacing),
    visualStyle: firstDefined(
      beat.direction?.creative?.visualStyle,
      section.direction?.creative?.visualStyle,
      plan.direction?.creative?.visualStyle
    ),
    tension: firstDefined(beat.direction?.creative?.tension, section.direction?.creative?.tension, plan.direction?.creative?.tension),
    continuityStrictness: firstDefined(
      beat.direction?.creative?.continuityStrictness,
      section.direction?.creative?.continuityStrictness,
      plan.direction?.creative?.continuityStrictness
    )
  };

  const voiceDirection = VoiceDirectionSchema.parse({
    ...plan.direction?.voice,
    ...section.direction?.voice,
    ...beat.direction?.voice,
    ...(beat.voiceDirection || {})
  });

  const captionStyle = firstDefined(
    beat.direction?.caption?.style,
    section.direction?.caption?.style,
    plan.direction?.caption?.style,
    beat.caption?.style,
    "default"
  ) ?? "default";

  const emphasis = firstDefined(
    beat.direction?.caption?.emphasis,
    section.direction?.caption?.emphasis,
    plan.direction?.caption?.emphasis,
    beat.caption?.emphasis
  ) ?? [];

  const motion = MotionSchema.parse({
    ...plan.direction?.motion,
    ...section.direction?.motion,
    ...beat.direction?.motion,
    ...(beat.motion || {})
  });

  const visual = firstDefined(
    beat.direction?.visual,
    beat.visual,
    section.direction?.visual,
    plan.direction?.visual,
  );

  const sfxCues = (
    firstDefined(
      beat.direction?.sfxCues,
      section.direction?.sfxCues,
      plan.direction?.sfxCues,
      beat.sfxCues
    ) ?? []
  ).slice(0, 12);

  const editorialSource = firstDefined(
    beat.direction?.editorial,
    section.direction?.editorial,
    plan.direction?.editorial,
    beat.editorial
  );

  return {
    creative,
    voiceDirection,
    caption: {
      style: captionStyle,
      emphasis,
      tuning: resolveCaptionTuning(plan, section, beat)
    },
    visual,
    motion,
    sfxCues,
    editorial: editorialSource ? BeatEditorialSchema.parse(editorialSource) : undefined,
    sources: {
      voice: sourceByLayer(
        beat.direction?.voice,
        section.direction?.voice,
        plan.direction?.voice,
        beat.voiceDirection,
        beat.directionMeta?.sources?.voice as SourceLabel | undefined
      ),
      caption: sourceByLayer(
        beat.direction?.caption,
        section.direction?.caption,
        plan.direction?.caption,
        beat.caption,
        beat.directionMeta?.sources?.caption as SourceLabel | undefined
      ),
      motion: sourceByLayer(
        beat.direction?.motion,
        section.direction?.motion,
        plan.direction?.motion,
        beat.motion,
        beat.directionMeta?.sources?.motion as SourceLabel | undefined
      ),
      sfx: sourceByLayer(
        beat.direction?.sfxCues,
        section.direction?.sfxCues,
        plan.direction?.sfxCues,
        beat.sfxCues,
        beat.directionMeta?.sources?.sfx as SourceLabel | undefined
      ),
      editorial: sourceByLayer(
        beat.direction?.editorial,
        section.direction?.editorial,
        plan.direction?.editorial,
        beat.editorial,
        beat.directionMeta?.sources?.editorial as SourceLabel | undefined
      )
    }
  };
}

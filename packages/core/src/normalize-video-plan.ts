import {
  VisualBibleSchema,
  VisualIntentSchema,
  type VideoPlanSchema,
} from "./schemas/video-plan.schema.js";
import { canonicalizeVoicePauseFields } from "./voice-pauses.js";

type VideoPlan = ReturnType<typeof VideoPlanSchema.parse>;

function hasKeys(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function copyKnownKeys(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

const VISUAL_BIBLE_KEYS = Object.keys(VisualBibleSchema.shape);
const VISUAL_INTENT_KEYS = Object.keys(VisualIntentSchema.shape);

function canonicalizeLegacyVoice(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const out = { ...value };
  if (typeof out.pauseBeforeMs !== "number" && typeof out.pauseBeforeSeconds === "number") {
    out.pauseBeforeMs = Math.round(out.pauseBeforeSeconds * 1000);
  }
  if (typeof out.pauseAfterMs !== "number" && typeof out.pauseAfterSeconds === "number") {
    out.pauseAfterMs = Math.round(out.pauseAfterSeconds * 1000);
  }
  delete out.pauseBeforeSeconds;
  delete out.pauseAfterSeconds;
  return out;
}

function prepareBeatForSchema(beat: unknown): unknown {
  if (!isRecord(beat)) return beat;
  const { voiceDirection, sfxCues, editorial, visual: rawVisual, ...rest } = beat;
  const direction = isRecord(beat.direction) ? { ...beat.direction } : {};
  const canonicalDirectionVoice = canonicalizeLegacyVoice(direction.voice);
  const canonicalLegacyVoice = canonicalizeLegacyVoice(voiceDirection);
  const nextDirection = {
    ...direction,
    ...(canonicalDirectionVoice ? { voice: canonicalDirectionVoice } : {}),
    ...(!hasKeys(direction.voice) && canonicalLegacyVoice ? { voice: canonicalLegacyVoice } : {}),
    ...(!Array.isArray(direction.sfxCues) && Array.isArray(sfxCues) && sfxCues.length > 0
      ? { sfxCues }
      : {}),
    ...(!hasKeys(direction.editorial) && hasKeys(editorial) ? { editorial } : {}),
  };
  const visual = isRecord(rawVisual) ? copyKnownKeys(rawVisual, VISUAL_INTENT_KEYS) : undefined;
  return {
    ...rest,
    visual: visual && hasKeys(visual) ? visual : undefined,
    direction: hasKeys(nextDirection) ? nextDirection : undefined,
  };
}

export function prepareVideoPlanForSchema(rawPlan: unknown): unknown {
  if (!isRecord(rawPlan)) return rawPlan;
  const { visualBible: rawVisualBible, ...rest } = rawPlan;
  const visualBible = isRecord(rawVisualBible)
    ? copyKnownKeys(rawVisualBible, VISUAL_BIBLE_KEYS)
    : undefined;
  return {
    ...rest,
    visualBible: visualBible && hasKeys(visualBible) ? visualBible : undefined,
    sections: Array.isArray(rawPlan.sections)
      ? rawPlan.sections.map((section) => {
          if (!isRecord(section)) return section;
          return {
            ...section,
            beats: Array.isArray(section.beats) ? section.beats.map(prepareBeatForSchema) : [],
          };
        })
      : rawPlan.sections,
  };
}

export function normalizeVideoPlan(plan: VideoPlan): VideoPlan {
  return {
    ...plan,
    sections: plan.sections.map((section) => ({
      ...section,
      beats: section.beats.map((beat) => {
        const direction = beat.direction || {};
        const canonicalDirectionVoice = hasKeys(direction.voice)
          ? canonicalizeVoicePauseFields({ ...direction.voice })
          : undefined;
        const nextDirection = {
          ...direction,
          ...(canonicalDirectionVoice ? { voice: canonicalDirectionVoice } : {}),
        };
        return {
          ...beat,
          direction: hasKeys(nextDirection) ? nextDirection : undefined,
        };
      }),
    })),
  };
}

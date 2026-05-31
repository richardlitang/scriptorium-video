import { type VideoPlanSchema } from "./schemas/video-plan.schema.js";
import { canonicalizeVoicePauseFields } from "./voice-pauses.js";

type VideoPlan = ReturnType<typeof VideoPlanSchema.parse>;

function hasKeys(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
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

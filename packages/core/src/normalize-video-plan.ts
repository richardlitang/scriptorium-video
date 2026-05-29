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
        const canonicalLegacyVoiceDirection = hasKeys(beat.voiceDirection)
          ? canonicalizeVoicePauseFields({ ...beat.voiceDirection })
          : undefined;
        const canonicalDirectionVoice = hasKeys(direction.voice)
          ? canonicalizeVoicePauseFields({ ...direction.voice })
          : undefined;
        const nextDirection = {
          ...direction,
          ...(canonicalDirectionVoice ? { voice: canonicalDirectionVoice } : {}),
          ...(hasKeys(beat.voiceDirection) && !hasKeys(direction.voice)
            ? { voice: canonicalLegacyVoiceDirection }
            : {}),
          ...(Array.isArray(beat.sfxCues) &&
          beat.sfxCues.length > 0 &&
          !Array.isArray(direction.sfxCues)
            ? { sfxCues: beat.sfxCues.map((cue) => ({ ...cue })) }
            : {}),
          ...(hasKeys(beat.editorial) && !hasKeys(direction.editorial)
            ? { editorial: { ...beat.editorial } }
            : {}),
        };
        return {
          ...beat,
          direction: hasKeys(nextDirection) ? nextDirection : undefined,
        };
      }),
    })),
  };
}

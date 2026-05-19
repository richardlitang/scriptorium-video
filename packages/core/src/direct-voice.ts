import type { VideoPlan } from "./schemas/video-plan.schema.js";
import { VoiceDirectorOutputSchema, type VoiceDirectorOutput } from "./schemas/voice-director.schema.js";

export type ApplyVoiceDirectionOptions = {
  force?: boolean;
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map((value) => value.trim()).filter(Boolean))];
}

export function applyVoiceDirectionPlan(
  videoPlan: VideoPlan,
  directionOutput: VoiceDirectorOutput,
  options: ApplyVoiceDirectionOptions = {}
): VideoPlan {
  const parsed = VoiceDirectorOutputSchema.parse(directionOutput);
  const byBeatId = new Map(parsed.beats.map((entry) => [entry.beatId, entry]));

  return {
    ...videoPlan,
    sections: videoPlan.sections.map((section) => ({
      ...section,
      beats: section.beats.map((beat) => {
        const next = byBeatId.get(beat.id);
        if (!next) return beat;

        const shouldPreserveUserDirection =
          !options.force && beat.voiceDirection?.source === "user";
        const voiceDirection = shouldPreserveUserDirection
          ? beat.voiceDirection
          : next.voiceDirection;

        return {
          ...beat,
          voiceDirection,
          caption: {
            ...beat.caption,
            emphasis: uniqueStrings([
              ...(beat.caption?.emphasis ?? []),
              ...(next.captionEmphasis ?? []),
              ...(next.voiceDirection.emphasis ?? [])
            ])
          },
          sfxCues: next.sfxCues.length > 0 ? next.sfxCues : beat.sfxCues
        };
      })
    }))
  };
}

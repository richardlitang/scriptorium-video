import type { VideoPlan } from "./schemas/video-plan.schema.js";
import {
  VoiceDirectorOutputSchema,
  type VoiceDirectorOutput,
} from "./schemas/voice-director.schema.js";

export type ApplyVoiceDirectionOptions = {
  force?: boolean;
};

function isLocked(lockedPaths: string[] | undefined, path: string): boolean {
  return Array.isArray(lockedPaths) && lockedPaths.includes(path);
}

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function applyVoiceDirectionPlan(
  videoPlan: VideoPlan,
  directionOutput: VoiceDirectorOutput,
  options: ApplyVoiceDirectionOptions = {},
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
        const beatLockedPaths = beat.directionMeta?.lockedPaths;
        const lockVoiceDirection = !options.force && isLocked(beatLockedPaths, "voice");
        const lockSfx = !options.force && isLocked(beatLockedPaths, "sfx");
        const lockCaptionEmphasis = !options.force && isLocked(beatLockedPaths, "caption.emphasis");
        const voiceDirection =
          shouldPreserveUserDirection || lockVoiceDirection ? beat.voiceDirection : next.voiceDirection;

        return {
          ...beat,
          voiceDirection,
          directionMeta: {
            ...(beat.directionMeta || {}),
            lockedPaths: beat.directionMeta?.lockedPaths ?? [],
            sources: {
              ...(beat.directionMeta?.sources || {}),
              voice: voiceDirection?.source === "user" ? "user" : "llm",
              sfx: lockSfx ? beat.directionMeta?.sources?.sfx || "user" : "llm",
              "caption.emphasis": lockCaptionEmphasis
                ? beat.directionMeta?.sources?.["caption.emphasis"] || "user"
                : "llm",
            },
          },
          caption: {
            ...beat.caption,
            emphasis: lockCaptionEmphasis
              ? (beat.caption?.emphasis ?? [])
              : uniqueStrings([
                  ...(beat.caption?.emphasis ?? []),
                  ...(next.captionEmphasis ?? []),
                  ...(next.voiceDirection.emphasis ?? []),
                ]),
          },
          sfxCues: (() => {
            if (lockSfx) return beat.sfxCues ?? [];
            return next.sfxCues.length > 0 ? next.sfxCues : beat.sfxCues;
          })(),
        };
      }),
    })),
  };
}

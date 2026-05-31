function hasKeys(value) {
  return Boolean(value) && typeof value === "object" && Object.keys(value).length > 0;
}

function canonicalizeVoicePauseFields(direction) {
  if (!direction || typeof direction !== "object") return direction;
  const out = { ...direction };
  delete out.pauseBeforeSeconds;
  delete out.pauseAfterSeconds;
  return out;
}

export function canonicalizePlanForPersistence(plan = {}) {
  return {
    ...plan,
    sections: Array.isArray(plan.sections)
      ? plan.sections.map((section) => ({
          ...section,
          beats: Array.isArray(section?.beats)
            ? section.beats.map((beat) => {
                const direction =
                  beat?.direction && typeof beat.direction === "object" ? beat.direction : {};
                const canonicalDirectionVoice = hasKeys(direction.voice)
                  ? canonicalizeVoicePauseFields({ ...direction.voice })
                  : undefined;
                const canonicalLegacyVoiceDirection = hasKeys(beat?.voiceDirection)
                  ? canonicalizeVoicePauseFields({ ...beat.voiceDirection })
                  : undefined;
                const nextDirection = {
                  ...direction,
                  ...(canonicalDirectionVoice ? { voice: canonicalDirectionVoice } : {}),
                  ...(hasKeys(beat?.voiceDirection) && !hasKeys(direction.voice)
                    ? { voice: canonicalLegacyVoiceDirection }
                    : {}),
                  ...(Array.isArray(beat?.sfxCues) &&
                  beat.sfxCues.length > 0 &&
                  !Array.isArray(direction.sfxCues)
                    ? { sfxCues: beat.sfxCues.map((cue) => ({ ...cue })) }
                    : {}),
                  ...(hasKeys(beat?.editorial) && !hasKeys(direction.editorial)
                    ? { editorial: { ...beat.editorial } }
                    : {}),
                };
                const { voiceDirection, sfxCues, editorial, ...restBeat } = beat || {};
                void voiceDirection;
                void sfxCues;
                void editorial;
                return {
                  ...restBeat,
                  direction: hasKeys(nextDirection) ? nextDirection : undefined,
                };
              })
            : [],
        }))
      : [],
  };
}

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
                const nextDirection = {
                  ...direction,
                  ...(canonicalDirectionVoice ? { voice: canonicalDirectionVoice } : {}),
                };
                return {
                  ...beat,
                  direction: hasKeys(nextDirection) ? nextDirection : undefined,
                };
              })
            : [],
        }))
      : [],
  };
}

type VoiceDirection = Record<string, unknown> & {
  pauseBeforeSeconds?: unknown;
  pauseAfterSeconds?: unknown;
};

type BeatDirection = Record<string, unknown> & {
  voice?: VoiceDirection;
};

type Beat = Record<string, unknown> & {
  direction?: BeatDirection;
};

type Section = Record<string, unknown> & {
  beats?: Beat[];
};

type Plan = Record<string, unknown> & {
  sections?: Section[];
};

function hasKeys(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).length > 0;
}

function canonicalizeVoicePauseFields(direction: VoiceDirection): VoiceDirection {
  const out = { ...direction };
  delete out.pauseBeforeSeconds;
  delete out.pauseAfterSeconds;
  return out;
}

export function canonicalizePlanForPersistence(plan: Plan = {}): Plan {
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

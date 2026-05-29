export function ttsProviderForBeat(defaultProvider, beat) {
  return (
    beat?.voiceDirection?.ttsProvider || beat?.direction?.voice?.ttsProvider || defaultProvider
  );
}

export function draftAudioStepCount(plan) {
  const providers = new Set();
  let beatCount = 0;
  for (const section of plan?.sections ?? []) {
    for (const beat of section?.beats ?? []) {
      beatCount += 1;
      providers.add(ttsProviderForBeat(plan?.providers?.tts, beat));
    }
  }
  if (beatCount === 0) return 0;
  return providers.size === 1 ? 1 : beatCount;
}

export function ttsProvidersForPlan(plan) {
  return [
    ...new Set(
      (plan?.sections ?? []).flatMap((section) =>
        (section?.beats ?? []).map((beat) => ttsProviderForBeat(plan?.providers?.tts, beat)),
      ),
    ),
  ]
    .filter(Boolean)
    .sort();
}

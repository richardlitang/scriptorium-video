export function narrationBatchLabel(beatCount, provider) {
  return `Narration: ${beatCount} beat(s) · ${provider}`;
}

export function narrationBeatProgressLabel(section, beat) {
  return `Narration: ${section.title} · ${beat.order}/${section.beats?.length ?? 1} · ${beat.id}`;
}

export function narrationBeatRunLabel(section, beat, provider) {
  return `Narration: ${section.title} · ${beat.id} · ${provider}`;
}

export function ttsArgsForBeat(projectId, provider, beatId) {
  return ["generate:tts", projectId, "--provider", provider, "--force", "--only-beat", beatId];
}

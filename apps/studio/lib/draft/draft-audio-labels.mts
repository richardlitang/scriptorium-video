type SectionLike = {
  title?: string;
  beats?: unknown[];
};

type BeatLike = {
  order?: number;
  id?: string;
};

export function narrationBatchLabel(beatCount: number, provider: string): string {
  return `Narration: ${beatCount} beat(s) · ${provider}`;
}

export function narrationBeatProgressLabel(section: SectionLike, beat: BeatLike): string {
  return `Narration: ${section.title} · ${beat.order}/${section.beats?.length ?? 1} · ${beat.id}`;
}

export function narrationBeatRunLabel(
  section: SectionLike,
  beat: BeatLike,
  provider: string,
): string {
  return `Narration: ${section.title} · ${beat.id} · ${provider}`;
}

export function ttsArgsForBeat(projectId: string, provider: string, beatId: string): string[] {
  return ["generate:tts", projectId, "--provider", provider, "--force", "--only-beat", beatId];
}

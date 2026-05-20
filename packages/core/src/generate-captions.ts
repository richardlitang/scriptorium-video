import path from "node:path";
import type { z } from "zod";
import { CaptionsFileSchema } from "./schemas/captions.schema.js";
import { TimelineSchema } from "./schemas/timeline.schema.js";
import { TranscriptFileSchema } from "./schemas/transcript.schema.js";
import { VideoPlanSchema } from "./schemas/video-plan.schema.js";
import { getProjectPaths } from "./paths.js";
import { hashFile } from "./hash.js";
import { readJsonFile, writeJsonFile } from "./json.js";

type CaptionRules = {
  targetMaxWords: number;
  hardMaxWords: number;
  targetMaxDurationSeconds: number;
  hardMaxDurationSeconds: number;
  minWordsBeforeSentenceBreak: number;
};

function rulesForMode(mode: string): CaptionRules {
  if (mode === "long_documentary") {
    return {
      targetMaxWords: 18,
      hardMaxWords: 26,
      targetMaxDurationSeconds: 6,
      hardMaxDurationSeconds: 8,
      minWordsBeforeSentenceBreak: 12
    };
  }
  return {
    targetMaxWords: 16,
    hardMaxWords: 22,
    targetMaxDurationSeconds: 5.5,
    hardMaxDurationSeconds: 7,
    minWordsBeforeSentenceBreak: 10
  };
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

type TranscriptWord = {
  word: string;
  startSeconds: number;
  endSeconds: number;
  confidence?: number;
};

type Timeline = z.infer<typeof TimelineSchema>;

function endsSentence(word: string): boolean {
  return /[.!?]["')\]]?$/.test(word);
}

function endsClause(word: string): boolean {
  return /[,;:]["')\]]?$/.test(word);
}

function wordBeatId(word: TranscriptWord, timeline: Timeline): string | undefined {
  return timeline.segments.find(
    (entry) => word.startSeconds >= entry.startSeconds && word.startSeconds < entry.endSeconds
  )?.beatId;
}

export function groupCaptionWords(
  words: TranscriptWord[],
  timeline: Timeline,
  rules: CaptionRules
): TranscriptWord[][] {
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    groups.push(current);
    current = [];
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = words[index + 1];
    current.push(word);

    const duration = current[current.length - 1].endSeconds - current[0].startSeconds;
    const nextChangesBeat = next ? wordBeatId(next, timeline) !== wordBeatId(word, timeline) : true;
    const sentenceEnd = endsSentence(word.word);
    const clauseEnd = endsClause(word.word);
    const shouldBreak =
      nextChangesBeat ||
      current.length >= rules.hardMaxWords ||
      duration >= rules.hardMaxDurationSeconds ||
      (sentenceEnd &&
        (current.length >= rules.minWordsBeforeSentenceBreak ||
          duration >= rules.targetMaxDurationSeconds ||
          (next && endsSentence(next.word)))) ||
      ((sentenceEnd || clauseEnd) &&
        (current.length >= rules.targetMaxWords || duration >= rules.targetMaxDurationSeconds));

    if (shouldBreak) flush();
  }
  flush();
  return groups;
}

export async function generateCaptionsForProject(
  projectId: string
): Promise<{ captionsPath: string; count: number }> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const timeline = await readJsonFile(paths.timeline, TimelineSchema);
  const transcriptPath = path.join(paths.captionsDir, "transcript.json");
  const transcript = await readJsonFile(transcriptPath, TranscriptFileSchema);
  const baseRules = rulesForMode(plan.mode);
  const tuning = plan.overrides?.captionTuning;
  const rules: CaptionRules = {
    targetMaxWords: Math.round(clampNumber(tuning?.targetMaxWords, baseRules.targetMaxWords, 4, 30)),
    hardMaxWords: Math.round(clampNumber(tuning?.hardMaxWords, baseRules.hardMaxWords, 6, 40)),
    targetMaxDurationSeconds: clampNumber(tuning?.targetMaxDurationSeconds, baseRules.targetMaxDurationSeconds, 1.5, 12),
    hardMaxDurationSeconds: clampNumber(tuning?.hardMaxDurationSeconds, baseRules.hardMaxDurationSeconds, 2, 14),
    minWordsBeforeSentenceBreak: Math.round(
      clampNumber(tuning?.minWordsBeforeSentenceBreak, baseRules.minWordsBeforeSentenceBreak, 2, 20)
    )
  };
  const emphasisWords = new Set(
    plan.sections
      .flatMap((section) => section.beats)
      .flatMap((beat) => beat.caption.emphasis.map((entry) => entry.toLowerCase()))
  );

  const captions: Array<{
    id: string;
    beatId?: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
    style: string;
    words: Array<{
      word: string;
      startSeconds: number;
      endSeconds: number;
      emphasis: boolean;
      confidence?: number;
    }>;
  }> = [];

  const flush = (current: typeof transcript.words) => {
    const start = current[0].startSeconds;
    const end = current[current.length - 1].endSeconds;
    const segment = timeline.segments.find((entry) => start >= entry.startSeconds && start < entry.endSeconds);
    const beat = plan.sections.flatMap((section) => section.beats).find((entry) => entry.id === segment?.beatId);
    captions.push({
      id: `caption-${String(captions.length + 1).padStart(3, "0")}`,
      beatId: segment?.beatId,
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number(end.toFixed(3)),
      text: current.map((word) => word.word).join(" "),
      style: beat?.caption.style ?? "default",
      words: current.map((word) => ({
        ...word,
        emphasis: emphasisWords.has(word.word.toLowerCase())
      }))
    });
  };

  for (const group of groupCaptionWords(transcript.words, timeline, rules)) {
    flush(group);
  }

  await writeJsonFile(
    paths.captions,
    CaptionsFileSchema.parse({
      schemaVersion: 1,
      status: "generated",
      source: {
        transcriptionProvider: transcript.source.provider,
        audioAssetIds: transcript.source.audioAssetIds,
        sourceHash: await hashFile(transcriptPath)
      },
      captions
    })
  );
  return { captionsPath: paths.captions, count: captions.length };
}

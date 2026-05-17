import path from "node:path";
import { CaptionsFileSchema } from "./schemas/captions.schema.js";
import { TimelineSchema } from "./schemas/timeline.schema.js";
import { TranscriptFileSchema } from "./schemas/transcript.schema.js";
import { VideoPlanSchema } from "./schemas/video-plan.schema.js";
import { getProjectPaths } from "./paths.js";
import { hashFile } from "./hash.js";
import { readJsonFile, writeJsonFile } from "./json.js";

type CaptionRules = {
  maxWords: number;
  maxDurationSeconds: number;
};

function rulesForMode(mode: string): CaptionRules {
  if (mode === "long_documentary") {
    return { maxWords: 12, maxDurationSeconds: 4 };
  }
  return { maxWords: 7, maxDurationSeconds: 2 };
}

export async function generateCaptionsForProject(
  projectId: string
): Promise<{ captionsPath: string; count: number }> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const timeline = await readJsonFile(paths.timeline, TimelineSchema);
  const transcriptPath = path.join(paths.captionsDir, "transcript.json");
  const transcript = await readJsonFile(transcriptPath, TranscriptFileSchema);
  const rules = rulesForMode(plan.mode);
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

  let current: typeof transcript.words = [];
  const flush = () => {
    if (current.length === 0) return;
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
    current = [];
  };

  for (const word of transcript.words) {
    current.push(word);
    const duration = current[current.length - 1].endSeconds - current[0].startSeconds;
    const breakNow =
      current.length >= rules.maxWords ||
      /[.!?]$/.test(word.word) ||
      duration >= rules.maxDurationSeconds;
    if (breakNow) flush();
  }
  flush();

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

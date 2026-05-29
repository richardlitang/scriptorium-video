import path from "node:path";
import { type z } from "zod";
import { AssetManifestSchema } from "./schemas/asset-manifest.schema.js";
import { TranscriptFileSchema, type TranscriptWordSchema } from "./schemas/transcript.schema.js";
import { VideoPlanSchema } from "./schemas/video-plan.schema.js";
import { getProjectPaths } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { normalizeVideoPlan } from "./normalize-video-plan.js";
import { probeMedia } from "./media-probe.js";
import type { TranscriptionProvider } from "./transcription-provider.js";

export type TranscribeOptions = {
  providerId?: string;
};

function buildWords(text: string, startSeconds: number, endSeconds: number): TranscriptWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const span = Math.max(0.01, endSeconds - startSeconds);
  const perWord = span / words.length;
  return words.map((word, index) => ({
    word,
    startSeconds: Number((startSeconds + perWord * index).toFixed(3)),
    endSeconds: Number((startSeconds + perWord * (index + 1)).toFixed(3)),
    confidence: 1,
  }));
}

type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export async function transcribeProject(
  projectId: string,
  provider: TranscriptionProvider,
): Promise<{ transcriptPath: string; segmentCount: number; wordCount: number }> {
  const paths = getProjectPaths(projectId);
  const plan = normalizeVideoPlan(await readJsonFile(paths.videoPlan, VideoPlanSchema));
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const providerId = provider.id;

  const transcriptPath = path.join(paths.captionsDir, "transcript.json");
  const voiceAssets = manifest.assets.filter((asset) => asset.role === "voiceover");

  if (providerId === "manual") {
    const result = await provider.transcribe({
      audioPath: transcriptPath,
      wordTimestamps: true,
      language: plan.voice.options.language,
    });
    await writeJsonFile(
      transcriptPath,
      TranscriptFileSchema.parse({
        schemaVersion: 1,
        source: {
          provider: providerId,
          audioAssetIds: voiceAssets.map((asset) => asset.id),
        },
        text: result.text,
        segments: result.segments,
        words: result.words ?? [],
      }),
    );
    return {
      transcriptPath,
      segmentCount: result.segments.length,
      wordCount: result.words?.length ?? 0,
    };
  }

  let text = "";
  const segments: Array<{ startSeconds: number; endSeconds: number; text: string }> = [];
  const words: TranscriptWord[] = [];
  let cursor = 0;

  for (const section of plan.sections) {
    for (const beat of section.beats.sort((a, b) => a.order - b.order)) {
      const voice = voiceAssets.find((asset) => asset.beatId === beat.id);
      if (!voice) continue;
      const duration =
        voice.durationSeconds ??
        (await probeMedia(path.resolve(paths.projectDir, voice.path))).durationSeconds ??
        2;
      const beatStart = cursor;
      const beatEnd = cursor + duration;
      const beatText = beat.narration.trim();
      segments.push({
        startSeconds: Number(beatStart.toFixed(3)),
        endSeconds: Number(beatEnd.toFixed(3)),
        text: beatText,
      });
      words.push(...buildWords(beatText, beatStart, beatEnd));
      text = `${text}${text ? " " : ""}${beatText}`;
      cursor = beatEnd;
    }
  }

  await writeJsonFile(
    transcriptPath,
    TranscriptFileSchema.parse({
      schemaVersion: 1,
      source: {
        provider: providerId,
        audioAssetIds: voiceAssets.map((asset) => asset.id),
      },
      text,
      segments,
      words,
    }),
  );
  return { transcriptPath, segmentCount: segments.length, wordCount: words.length };
}

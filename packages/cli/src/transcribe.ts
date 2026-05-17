import path from "node:path";
import {
  AssetManifestSchema,
  getProjectPaths,
  readJsonFile,
  TranscriptFileSchema,
  type TranscriptWord,
  VideoPlanSchema,
  writeJsonFile
} from "@lvstudio/core";
import { probeMedia } from "@lvstudio/core";
import { transcriptionProviders } from "@lvstudio/providers";

type TranscribeOptions = {
  provider?: string;
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
    confidence: 1
  }));
}

export async function transcribeProject(projectId: string, options: TranscribeOptions): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const providerId = options.provider ?? plan.providers.transcription;
  const provider = transcriptionProviders[providerId];
  if (!provider) throw new Error(`Unknown transcription provider: ${providerId}`);

  const transcriptPath = path.join(paths.captionsDir, "transcript.json");
  const voiceAssets = manifest.assets.filter((asset) => asset.role === "voiceover");

  let text = "";
  const segments: Array<{ startSeconds: number; endSeconds: number; text: string }> = [];
  const words: TranscriptWord[] = [];
  let cursor = 0;

  if (providerId === "manual") {
    const result = await provider.transcribe({
      audioPath: transcriptPath,
      wordTimestamps: true,
      language: plan.voice.options.language
    });
    await writeJsonFile(
      transcriptPath,
      TranscriptFileSchema.parse({
        schemaVersion: 1,
        source: {
          provider: providerId,
          audioAssetIds: voiceAssets.map((asset) => asset.id)
        },
        text: result.text,
        segments: result.segments,
        words: result.words ?? []
      })
    );
    console.log(`Wrote ${transcriptPath}`);
    return;
  }

  for (const section of plan.sections) {
    for (const beat of section.beats.sort((a, b) => a.order - b.order)) {
      const voice = voiceAssets.find((asset) => asset.beatId === beat.id);
      if (!voice) continue;
      const duration = voice.durationSeconds ?? (await probeMedia(path.resolve(paths.projectDir, voice.path))).durationSeconds ?? 2;
      const beatStart = cursor;
      const beatEnd = cursor + duration;
      const beatText = beat.narration.trim();
      segments.push({
        startSeconds: Number(beatStart.toFixed(3)),
        endSeconds: Number(beatEnd.toFixed(3)),
        text: beatText
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
        audioAssetIds: voiceAssets.map((asset) => asset.id)
      },
      text,
      segments,
      words
    })
  );
  console.log(`Wrote ${transcriptPath}`);
}

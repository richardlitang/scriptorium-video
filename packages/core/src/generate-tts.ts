import { access } from "node:fs/promises";
import path from "node:path";
import { AssetManifestSchema, type Asset, type AssetManifest } from "./schemas/asset-manifest.schema.js";
import { VideoPlanSchema, type VideoPlan } from "./schemas/video-plan.schema.js";
import { getProjectPaths } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { hashString } from "./hash.js";
import { probeMedia } from "./media-probe.js";
import type { TTSProvider } from "./tts-provider.js";
import { normalizeVoiceover, padVoiceover } from "./audio-processing.js";
import { resolveVoiceDirection } from "./voice-direction.js";
import type { Beat } from "./schemas/video-plan.schema.js";

export type GenerateTTSOptions = {
  force?: boolean;
  noCache?: boolean;
  onlySection?: string;
  onlyBeat?: string;
  concurrency?: number;
};

type BeatRef = {
  sectionId: string;
  beatId: string;
  narration: string;
  beat: Beat;
};

function pickBeats(plan: VideoPlan, onlySection?: string, onlyBeat?: string): BeatRef[] {
  return plan.sections
    .filter((section) => (onlySection ? section.id === onlySection : true))
    .flatMap((section) =>
      section.beats
        .filter((beat) => (onlyBeat ? beat.id === onlyBeat : true))
        .map((beat) => ({
          sectionId: section.id,
          beatId: beat.id,
          narration: beat.narration,
          beat
        }))
    );
}

function findVoiceAsset(manifest: AssetManifest, beatId: string): Asset | undefined {
  return manifest.assets.find((asset) => asset.role === "voiceover" && asset.beatId === beatId);
}

function cacheKey(
  plan: VideoPlan,
  providerId: string,
  beatId: string,
  narration: string,
  delivery: Record<string, unknown>,
  providerOptions: Record<string, unknown>
): string {
  return hashString(
    JSON.stringify({
      providerId,
      beatId,
      text: narration,
      voiceId: plan.voice.voiceId,
      format: plan.voice.format,
      options: plan.voice.options,
      delivery,
      providerOptions
    })
  ).slice(0, 10);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function ttsConcurrency(providerId: string, requested?: number): number {
  const raw = requested ?? Number(process.env.LVSTUDIO_TTS_CONCURRENCY ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.floor(raw));
  return providerId === "chatterbox" ? 1 : 3;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

export async function generateTTSForProject(
  projectId: string,
  provider: TTSProvider,
  options: GenerateTTSOptions = {}
): Promise<{ generated: string[]; skipped: string[] }> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const providerId = provider.id;

  const beats = pickBeats(plan, options.onlySection, options.onlyBeat);
  const now = new Date().toISOString();
  const generated: string[] = [];
  const skipped: string[] = [];
  const nextAssetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const concurrency = ttsConcurrency(providerId, options.concurrency);

  await runWithConcurrency(beats, concurrency, async (beat) => {
    const existing = findVoiceAsset(manifest, beat.beatId);
    if (existing?.status === "locked_by_user" && !options.force) {
      skipped.push(`${beat.beatId}: locked_by_user`);
      return;
    }
    if (existing?.status === "edited" && !options.force) {
      skipped.push(`${beat.beatId}: edited`);
      return;
    }

    const resolved = resolveVoiceDirection(beat.beat, plan);
    const inputHash = cacheKey(
      plan,
      providerId,
      beat.beatId,
      beat.narration,
      resolved.delivery,
      resolved.providerOptions
    );
    const ext = plan.voice.format;
    const fileBase = `${beat.beatId}.${inputHash}`;
    const fileName = options.noCache ? `${fileBase}.${Date.now()}.${ext}` : `${fileBase}.${ext}`;
    const relativePath =
      providerId === "manual" && existing ? existing.path : path.join("assets", "audio", "voice", fileName);
    const absolutePath = path.resolve(paths.projectDir, relativePath);
    const cachedPath = existing ? path.resolve(paths.projectDir, existing.path) : absolutePath;

    if (!options.noCache && providerId !== "manual" && existing?.source.inputHash === inputHash) {
      if (await fileExists(cachedPath)) {
        skipped.push(`${beat.beatId}: cache_hit`);
        return;
      }
    }

    if (!options.noCache && providerId !== "manual" && !existing && (await fileExists(absolutePath))) {
      const probed = await probeMedia(absolutePath);
      const recoveredAsset: Asset = {
        id: `voice-${beat.beatId}`,
        type: "audio",
        role: "voiceover",
        sectionId: beat.sectionId,
        beatId: beat.beatId,
        path: relativePath,
        source: {
          kind: "generated",
          provider: providerId,
          inputHash
        },
        durationSeconds: probed.durationSeconds ?? 0,
        status: "generated",
        createdAt: now,
        updatedAt: now
      };
      nextAssetsById.set(recoveredAsset.id, recoveredAsset);
      skipped.push(`${beat.beatId}: recovered_cache_hit`);
      return;
    }

    const result = await provider.synthesize({
      text: beat.narration,
      voiceId: plan.voice.voiceId,
      outputPath: absolutePath,
      format: plan.voice.format,
      options: plan.voice.options,
      delivery: resolved.delivery,
      providerOptions: resolved.providerOptions
    });

    const processedAt = new Date().toISOString();
    let durationSeconds = result.durationSeconds;
    let audioProcessing:
      | {
          loudnessTargetLufs: number;
          truePeakDb: number;
          compression: string;
          processedAt: string;
        }
      | undefined;

    if (providerId !== "manual") {
      await padVoiceover(absolutePath, resolved.pauses.beforeSeconds, resolved.pauses.afterSeconds);
      const processing = await normalizeVoiceover(absolutePath);
      const probed = await probeMedia(absolutePath);
      durationSeconds = probed.durationSeconds ?? result.durationSeconds;
      audioProcessing = {
        ...processing,
        processedAt
      };
    }

    const nextAsset: Asset = {
      id: existing?.id ?? `voice-${beat.beatId}`,
      type: "audio",
      role: "voiceover",
      sectionId: beat.sectionId,
      beatId: beat.beatId,
      path: relativePath,
      source: {
        kind: providerId === "manual" ? "manual" : "generated",
        provider: providerId,
        inputHash,
        ...(audioProcessing ? { audioProcessing } : {})
      },
      durationSeconds,
      status: providerId === "manual" ? "locked_by_user" : "generated",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    nextAssetsById.set(nextAsset.id, nextAsset);
    generated.push(beat.beatId);
  });

  manifest.assets = manifest.assets
    .filter((asset) => !nextAssetsById.has(asset.id))
    .concat([...nextAssetsById.values()]);
  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
  return { generated, skipped };
}

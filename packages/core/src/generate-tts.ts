import { access } from "node:fs/promises";
import path from "node:path";
import { AssetManifestSchema, type Asset, type AssetManifest } from "./schemas/asset-manifest.schema.js";
import { VideoPlanSchema, type VideoPlan } from "./schemas/video-plan.schema.js";
import { getProjectPaths } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json.js";
import { hashString } from "./hash.js";
import { probeMedia } from "./media-probe.js";
import type { TTSProvider } from "./tts-provider.js";

export type GenerateTTSOptions = {
  force?: boolean;
  noCache?: boolean;
  onlySection?: string;
  onlyBeat?: string;
};

type BeatRef = {
  sectionId: string;
  beatId: string;
  narration: string;
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
          narration: beat.narration
        }))
    );
}

function findVoiceAsset(manifest: AssetManifest, beatId: string): Asset | undefined {
  return manifest.assets.find((asset) => asset.role === "voiceover" && asset.beatId === beatId);
}

function upsertAsset(manifest: AssetManifest, asset: Asset): void {
  const index = manifest.assets.findIndex((candidate) => candidate.id === asset.id);
  if (index >= 0) manifest.assets[index] = asset;
  else manifest.assets.push(asset);
}

function cacheKey(plan: VideoPlan, providerId: string, beatId: string, narration: string): string {
  return hashString(
    JSON.stringify({
      providerId,
      beatId,
      text: narration,
      voiceId: plan.voice.voiceId,
      format: plan.voice.format,
      options: plan.voice.options
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

  for (const beat of beats) {
    const existing = findVoiceAsset(manifest, beat.beatId);
    if (existing?.status === "locked_by_user" && !options.force) {
      skipped.push(`${beat.beatId}: locked_by_user`);
      continue;
    }
    if (existing?.status === "edited" && !options.force) {
      skipped.push(`${beat.beatId}: edited`);
      continue;
    }

    const inputHash = cacheKey(plan, providerId, beat.beatId, beat.narration);
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
        continue;
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
      upsertAsset(manifest, recoveredAsset);
      await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
      skipped.push(`${beat.beatId}: recovered_cache_hit`);
      continue;
    }

    const result = await provider.synthesize({
      text: beat.narration,
      voiceId: plan.voice.voiceId,
      outputPath: absolutePath,
      format: plan.voice.format,
      options: plan.voice.options
    });

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
        inputHash
      },
      durationSeconds: result.durationSeconds,
      status: providerId === "manual" ? "locked_by_user" : "generated",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    upsertAsset(manifest, nextAsset);
    await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
    generated.push(beat.beatId);
  }

  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
  return { generated, skipped };
}

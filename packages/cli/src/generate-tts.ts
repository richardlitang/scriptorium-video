import { access } from "node:fs/promises";
import path from "node:path";
import {
  AssetManifestSchema,
  hashString,
  readJsonFile,
  type Asset,
  type AssetManifest,
  type VideoPlan,
  VideoPlanSchema,
  writeJsonFile
} from "@lvstudio/core";
import { getProjectPaths } from "@lvstudio/core";
import { ttsProviders } from "@lvstudio/providers";

type GenerateTTSOptions = {
  provider?: string;
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

export async function generateTTS(projectId: string, options: GenerateTTSOptions): Promise<void> {
  const paths = getProjectPaths(projectId);
  const plan = await readJsonFile(paths.videoPlan, VideoPlanSchema);
  const manifest = await readJsonFile(paths.assetManifest, AssetManifestSchema);
  const providerId = options.provider ?? plan.providers.tts;
  const provider = ttsProviders[providerId];
  if (!provider) throw new Error(`Unknown TTS provider: ${providerId}`);

  const beats = pickBeats(plan, options.onlySection, options.onlyBeat);
  if (beats.length === 0) {
    console.log("No beats matched the current filters.");
    return;
  }

  const now = new Date().toISOString();
  for (const beat of beats) {
    const existing = findVoiceAsset(manifest, beat.beatId);
    if (existing?.status === "locked_by_user" && !options.force) {
      console.log(`Skip ${beat.beatId}: voice asset locked_by_user (use --force to override).`);
      continue;
    }
    if (existing?.status === "edited" && !options.force) {
      console.log(`Skip ${beat.beatId}: voice asset edited (use --force to override).`);
      continue;
    }

    const inputHash = cacheKey(plan, providerId, beat.beatId, beat.narration);
    const ext = plan.voice.format;
    const fileBase = `${beat.beatId}.${inputHash}`;
    const fileName = options.noCache ? `${fileBase}.${Date.now()}.${ext}` : `${fileBase}.${ext}`;
    const relativePath =
      providerId === "manual" && existing ? existing.path : path.join("assets", "audio", "voice", fileName);
    const absolutePath = path.resolve(paths.projectDir, relativePath);

    if (!options.noCache && providerId !== "manual" && existing?.source.inputHash === inputHash) {
      if (await fileExists(path.resolve(paths.projectDir, existing.path))) {
        console.log(`Cache hit ${beat.beatId}: ${existing.path}`);
        continue;
      }
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

    const index = manifest.assets.findIndex((asset) => asset.id === nextAsset.id);
    if (index >= 0) manifest.assets[index] = nextAsset;
    else manifest.assets.push(nextAsset);
    console.log(`Generated ${beat.beatId}: ${nextAsset.path}`);
  }

  await writeJsonFile(paths.assetManifest, AssetManifestSchema.parse(manifest));
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { VideoPlan } from "./schemas/video-plan.schema.js";

const ConfigFileSchema = z
  .object({
    id: z.string(),
    defaults: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export type ResolvedConfig = {
  fps: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: {
    width: number;
    height: number;
  };
  templateId: string;
  targetDurationSeconds?: number;
  captionDensity?: unknown;
  musicBehavior?: unknown;
  visualChangeFrequencySeconds?: unknown;
  chaptersEnabled?: unknown;
};

const baseDefaults: ResolvedConfig = {
  fps: 30,
  aspectRatio: "9:16",
  resolution: {
    width: 1080,
    height: 1920,
  },
  templateId: "vertical-story",
};

async function readDefaults(rootDir: string, folder: string, id: string | undefined) {
  if (!id) return {};
  const fileName = `${id.replaceAll("_", "-")}.json`;
  const filePath = path.resolve(rootDir, folder, fileName);
  try {
    const raw = await readFile(filePath, "utf8");
    return ConfigFileSchema.parse(JSON.parse(raw)).defaults;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function resolveConfig(
  plan: VideoPlan,
  rootDir = process.cwd(),
): Promise<ResolvedConfig> {
  const modeDefaults = await readDefaults(rootDir, "modes", plan.mode);
  const platformDefaults = await readDefaults(rootDir, "platforms", plan.targetPlatform);
  const styleDefaults = await readDefaults(rootDir, "stylepacks", plan.stylePackId);
  const merged = {
    ...baseDefaults,
    ...modeDefaults,
    ...platformDefaults,
    ...styleDefaults,
    ...plan.overrides,
  } as ResolvedConfig;

  return {
    ...merged,
    templateId: plan.templateId ?? merged.templateId,
    fps: plan.overrides.fps ?? merged.fps,
    resolution: plan.overrides.resolution ?? merged.resolution,
    aspectRatio: plan.overrides.aspectRatio ?? merged.aspectRatio,
  };
}

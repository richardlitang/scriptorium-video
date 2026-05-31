import { readFile } from "node:fs/promises";
import { writeJsonFile } from "./json.js";
import { normalizeVideoPlan } from "./normalize-video-plan.js";
import { getProjectPaths } from "./paths.js";
import { VideoPlanSchema } from "./schemas/video-plan.schema.js";

type MigrateVideoPlanOptions = {
  rootDir?: string;
  write?: boolean;
};

export type MigrateVideoPlanResult = {
  projectId: string;
  changed: boolean;
  written: boolean;
  path: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasKeys(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function canonicalizeLegacyVoice(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const out = { ...value };
  if (typeof out.pauseBeforeMs !== "number" && typeof out.pauseBeforeSeconds === "number") {
    out.pauseBeforeMs = Math.round(out.pauseBeforeSeconds * 1000);
  }
  if (typeof out.pauseAfterMs !== "number" && typeof out.pauseAfterSeconds === "number") {
    out.pauseAfterMs = Math.round(out.pauseAfterSeconds * 1000);
  }
  delete out.pauseBeforeSeconds;
  delete out.pauseAfterSeconds;
  return out;
}

function migrateLegacyBeatFields(rawPlan: unknown): unknown {
  if (!isRecord(rawPlan) || !Array.isArray(rawPlan.sections)) return rawPlan;
  return {
    ...rawPlan,
    sections: rawPlan.sections.map((section) => {
      if (!isRecord(section) || !Array.isArray(section.beats)) return section;
      return {
        ...section,
        beats: section.beats.map((beat) => {
          if (!isRecord(beat)) return beat;
          const { voiceDirection, sfxCues, editorial, ...canonicalBeat } = beat;
          const direction = isRecord(beat.direction) ? { ...beat.direction } : {};
          const canonicalDirectionVoice = canonicalizeLegacyVoice(direction.voice);
          const canonicalLegacyVoice = canonicalizeLegacyVoice(voiceDirection);
          const nextDirection = {
            ...direction,
            ...(canonicalDirectionVoice ? { voice: canonicalDirectionVoice } : {}),
            ...(!hasKeys(direction.voice) && canonicalLegacyVoice
              ? { voice: canonicalLegacyVoice }
              : {}),
            ...(!Array.isArray(direction.sfxCues) && Array.isArray(sfxCues) && sfxCues.length > 0
              ? { sfxCues }
              : {}),
            ...(!hasKeys(direction.editorial) && hasKeys(editorial) ? { editorial } : {}),
          };
          return {
            ...canonicalBeat,
            direction: hasKeys(nextDirection) ? nextDirection : undefined,
          };
        }),
      };
    }),
  };
}

export async function migrateVideoPlan(
  projectId: string,
  options: MigrateVideoPlanOptions = {},
): Promise<MigrateVideoPlanResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const write = options.write ?? true;
  const paths = getProjectPaths(projectId, rootDir);
  const currentPlan = JSON.parse(await readFile(paths.videoPlan, "utf8")) as unknown;
  const preMigratedPlan = migrateLegacyBeatFields(currentPlan);
  const normalizedPlan = normalizeVideoPlan(VideoPlanSchema.parse(preMigratedPlan));
  const migratedPlan = normalizedPlan;
  const changed = JSON.stringify(currentPlan) !== JSON.stringify(migratedPlan);
  if (changed && write) {
    await writeJsonFile(paths.videoPlan, migratedPlan);
  }
  return {
    projectId,
    changed,
    written: changed && write,
    path: paths.videoPlan,
  };
}

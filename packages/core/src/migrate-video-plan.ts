import { readFile } from "node:fs/promises";
import { writeJsonFile } from "./json.js";
import { normalizeVideoPlan, prepareVideoPlanForSchema } from "./normalize-video-plan.js";
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

export async function migrateVideoPlan(
  projectId: string,
  options: MigrateVideoPlanOptions = {},
): Promise<MigrateVideoPlanResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const write = options.write ?? true;
  const paths = getProjectPaths(projectId, rootDir);
  const currentPlan = JSON.parse(await readFile(paths.videoPlan, "utf8")) as unknown;
  const preMigratedPlan = prepareVideoPlanForSchema(currentPlan);
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

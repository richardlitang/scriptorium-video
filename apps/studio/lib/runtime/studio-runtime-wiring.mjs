import {
  readMmsHealth as readMmsHealthBase,
  readOptionalFile as readOptionalFileBase,
  readProjectTraceSnapshot as readProjectTraceSnapshotBase,
  restoreOptionalFile as restoreOptionalFileBase,
  safeReadJson as safeReadJsonBase,
} from "./studio-runtime-helpers.mjs";
import { writeDraftJobState as persistDraftJobState } from "../draft/draft-job-state.mjs";

export function createStudioRuntimeWiring({
  fetchImpl = fetch,
  mmsHealthUrl,
  readFile,
  unlink,
  writeFile,
  pathImpl,
  projectsDir,
  summarizePlanForTrace,
  summarizeManifestForTrace,
  summarizeTimelineForTrace,
  appendRunTrace,
  upsertRunJob,
}) {
  const safeReadJson = (jsonPath) => safeReadJsonBase(readFile, jsonPath);
  const readMmsHealth = () => readMmsHealthBase({ fetchImpl, mmsHealthUrl });
  const readOptionalFile = (filePath) => readOptionalFileBase(readFile, filePath);
  const restoreOptionalFile = (filePath, content) =>
    restoreOptionalFileBase({ unlink, writeFile, filePath, content });
  const readProjectTraceSnapshot = (projectId) =>
    readProjectTraceSnapshotBase({
      pathImpl,
      projectsDir,
      projectId,
      safeReadJsonImpl: safeReadJson,
      summarizePlanForTrace,
      summarizeManifestForTrace,
      summarizeTimelineForTrace,
    });
  const writeDraftJobState = async (projectId, job, patch = {}) =>
    persistDraftJobState({ projectId, job, patch, upsertRunJob });
  const appendDraftTraceAndState = async (projectId, job, event, data = {}, patch = {}) => {
    await appendRunTrace(projectId, job.id, event, data).catch(() => {});
    await writeDraftJobState(projectId, job, patch).catch(() => {});
  };

  return {
    safeReadJson,
    readMmsHealth,
    readOptionalFile,
    restoreOptionalFile,
    readProjectTraceSnapshot,
    writeDraftJobState,
    appendDraftTraceAndState,
  };
}

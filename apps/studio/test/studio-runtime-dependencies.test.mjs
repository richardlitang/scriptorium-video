import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStudioRuntimeContextDependencies,
  buildStudioRuntimeHttpDependencies,
} from "../lib/runtime/studio-runtime-dependencies.mjs";

test("studio runtime dependency builders return scoped dependency objects", () => {
  const deps = {
    sendJson: () => {},
    parseJsonBody: async () => ({}),
    parseBinaryBody: async () => Buffer.alloc(0),
    readVoiceSettings: async () => ({}),
    writeVoiceSettings: async () => ({}),
    readTtsHealth: async () => ({}),
    previewVoice: async () => ({}),
    safeVoiceReferenceFileName: (value) => value,
    voiceReferencesDir: "/tmp/refs",
    mkdir: async () => {},
    path: {},
    writeFile: async () => {},
    DEFAULT_PLANNER_SYSTEM_PROMPT: "sys",
    DEFAULT_PLANNER_USER_PROMPT_TEMPLATE: "user",
    listProjects: async () => [],
    safeProjectId: (value) => value,
    projectsDir: "/tmp/projects",
    stat: async () => ({}),
    createProjectScaffold: async () => {},
    syncProject: async () => ({}),
    runQualityChecks: async () => ({}),
    runLvstudio: async () => ({}),
    safeReadJson: async () => ({}),
    projectDeleteBlocker: async () => null,
    deleteProject: async () => {},
    getProjectDetails: async () => ({}),
    readFile: async () => Buffer.alloc(0),
    readOptionalFile: async () => null,
    restoreOptionalFile: async () => {},
    runTrackedForegroundJob: async () => ({}),
    appendQualityHistory: async () => {},
    readRunState: async () => ({}),
    writeRunState: async () => {},
    sha256: async () => "hash",
    splitPlannerEnabled: false,
    generateSplitPlanDraftWithOpenAi: async () => ({}),
    generatePlanDraftWithOpenAi: async () => ({}),
    runProjectMutation: async (_projectId, fn) => fn(),
    deleteProjectAsset: async () => {},
    updateProjectAssetStatus: async () => {},
    readImageHistory: async () => [],
    generateProjectImages: async () => ({}),
    activeBeatJobs: new Map(),
    beatJobProgress: () => ({}),
    runBeatRegenerateJob: async () => ({}),
    getRenderDetails: async () => ({}),
    sendVideoFile: async () => {},
    safeProjectPath: () => "/tmp/projects/demo",
    readQualityHistory: async () => [],
    listDraftJobs: async () => [],
    readRunTrace: async () => [],
    activeDraftJobs: new Map(),
    jobProgress: () => ({}),
    isDraftJobRunning: () => false,
    appendRunTrace: async () => {},
    writeDraftJobState: async () => {},
    process,
    isScaffoldPlaceholderPlan: () => false,
    runDraftJob: async () => ({}),
    runLvstudioReport: async () => ({ ok: true }),
    port: 4173,
    publicDir: "/tmp/public",
    handleStudioApiRoute: async () => false,
    publicAssetForPath: () => null,
    isSafeProjectId: () => true,
  };

  const contextDeps = buildStudioRuntimeContextDependencies(deps);
  const httpDeps = buildStudioRuntimeHttpDependencies(deps);

  assert.equal(contextDeps.sendJson, deps.sendJson);
  assert.equal(contextDeps.runDraftJob, deps.runDraftJob);
  assert.equal(httpDeps.port, 4173);
  assert.equal(httpDeps.handleStudioApiRoute, deps.handleStudioApiRoute);
  assert.equal("handleStudioApiRoute" in contextDeps, false);
  assert.equal("runDraftJob" in httpDeps, false);
});

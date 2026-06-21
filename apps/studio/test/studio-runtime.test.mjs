import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioRuntime } from "../lib/runtime/studio-runtime.mjs";

test("studio runtime composes route context and exposes request handler", () => {
  const contextDependencies = {
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
  };

  const runtime = createStudioRuntime({
    contextDependencies,
    httpDependencies: {
      port: 4173,
      publicDir: "/tmp/public",
      readFile: async () => Buffer.from("static"),
      sendJson: () => {},
      handleStudioApiRoute: async () => true,
      publicAssetForPath: () => null,
      isSafeProjectId: () => true,
    },
  });

  assert.equal(typeof runtime.handleStudioHttpRequest, "function");
  assert.equal(typeof runtime.studioApiContext, "object");
  assert.equal(runtime.studioApiContext.http.sendJson, contextDependencies.sendJson);
  assert.equal(runtime.studioApiContext.jobs.runDraftJob, contextDependencies.runDraftJob);
});

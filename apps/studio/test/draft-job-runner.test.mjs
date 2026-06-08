import assert from "node:assert/strict";
import { test } from "node:test";
import { createDraftJobRunner } from "../lib/draft/draft-job-runner.mjs";

test("draft job runner queues and completes no-story flow", async () => {
  const activeDraftJobs = new Map();
  const runStates = [];
  const upserts = [];
  const qualityHistory = [];
  const lvstudioArgs = [];
  const handoffs = [];

  const runDraftJob = createDraftJobRunner({
    runTraceDisplayPath: () => "trace.ndjson",
    activeDraftJobs,
    writeDraftJobState: async () => {},
    appendRunTrace: async () => {},
    normalizeImageCoverage: () => "balanced",
    summarizeVoiceSettingsForTrace: () => ({}),
    readVoiceSettings: async () => ({}),
    runProjectMutation: async (_projectId, fn) => {
      await fn();
    },
    path: { join: (...parts) => parts.join("/") },
    projectsDir: "/projects",
    getProjectDetails: async () => ({
      plan: { providers: { tts: "chatterbox", transcription: "whisper" }, sections: [] },
    }),
    summarizeStoryInput: () => ({}),
    summarizePlanForTrace: () => ({}),
    parsePlanFromStoryInput: () => null,
    applyDraftDefaults: (value) => value,
    buildPlannerStoryInput: (value) => value,
    splitStoryIntoLockedUnits: () => [],
    plannerSplitDecision: () => ({ enabled: false }),
    generateSplitPlanDraftWithOpenAi: async () => ({ plan: { sections: [] }, model: "m" }),
    generatePlanDraftWithOpenAi: async () => ({ plan: { sections: [] }, model: "m" }),
    planNarrationHealth: () => ({}),
    plannerQualityWarnings: () => [],
    plannerQualityWarningSummary: () => "",
    plannerQualityIsUsable: () => true,
    plannerBlockingFailures: () => [],
    plannerBlockingFailureMessage: () => "bad",
    stricterPlannerUserPromptTemplate: () => "",
    plannerProgressTracer: () => () => {},
    canonicalizePlanForPersistence: (plan) => plan,
    writeFile: async () => {},
    planNeedsTtsRouting: () => false,
    routePlanTtsWithOpenAi: async (plan) => ({ plan, model: "m", warnings: [] }),
    ensureChatterboxReady: async () => ({ ok: true }),
    readMmsHealth: async () => ({ ok: true }),
    getOpenAiApiKey: async () => "k",
    runRetriedDraftStep: async (_projectId, _job, _label, operation) => operation(),
    runLvstudioForDraft: async (_job, args) => {
      lvstudioArgs.push(args);
      return { stdout: "ok" };
    },
    readProjectTraceSnapshot: async () => ({}),
    safeReadJson: async () => ({ schemaVersion: 1, assets: [] }),
    selectImageTargets: () => [],
    defaultImageSizeForPlan: () => "1536x1024",
    summarizeManifestForTrace: () => ({}),
    generateProjectImages: async () => ({ generated: [], failed: [], skipped: true }),
    generateDraftAudioBySection: async () => {},
    sha256: () => "hash",
    readFile: async () => "{}",
    appendQualityHistory: async (_projectId, entry) => {
      qualityHistory.push(entry);
    },
    upsertRunJob: async (_projectId, payload) => {
      upserts.push(payload);
    },
    jobProgress: (job) => ({ status: job.status, jobId: job.id }),
    writeRunState: async (_projectId, payload) => {
      runStates.push(payload);
    },
    readRunState: async () => ({}),
    writeAgentHandoff: async (projectId, job, context) => {
      handoffs.push({ projectId, job, context });
    },
  });

  const result = await runDraftJob("demo", { imageEnabled: false });
  assert.equal(result.status, "queued");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(activeDraftJobs.size, 0);
  assert.equal(qualityHistory[0].kind, "draft_job");
  assert.equal(runStates.length, 1);
  assert.equal(upserts.length > 0, true);
  assert.equal(
    lvstudioArgs.some((args) => args[0] === "render"),
    true,
  );
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].projectId, "demo");
  assert.equal(handoffs[0].job.status, "completed");
  assert.equal(handoffs[0].context.summary, "Draft video is ready");
});

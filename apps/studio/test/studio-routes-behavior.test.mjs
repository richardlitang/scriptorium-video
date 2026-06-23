import assert from "node:assert/strict";
import { test } from "node:test";
import { handleSettingsRoutes } from "../lib/routes/routes-settings.mjs";
import { handleJobRoutes } from "../lib/routes/routes-jobs.mjs";
import { handleProjectPlanRoutes } from "../lib/routes/routes-projects-plan.mjs";
import {
  makeJobContext,
  makeJsonResponder,
  makeProjectContext,
} from "./helpers/route-test-helpers.mjs";
import { createInMemoryProjectFs } from "./helpers/project-fs-helpers.mjs";

test("settings routes serve planner defaults payload", async () => {
  const { response, sendJson } = makeJsonResponder();
  const handled = await handleSettingsRoutes(
    {
      http: {
        sendJson,
        parseJsonBody: async () => ({}),
        parseBinaryBody: async () => Buffer.alloc(0),
      },
      voice: {
        readVoiceSettings: async () => ({}),
        writeVoiceSettings: async () => ({}),
        readTtsHealth: async () => ({}),
        previewVoice: async () => Buffer.alloc(0),
        safeVoiceReferenceFileName: (name) => name,
        voiceReferencesDir: "/tmp",
        mkdir: async () => {},
        path: await import("node:path"),
        writeFile: async () => {},
        DEFAULT_PLANNER_SYSTEM_PROMPT: "system prompt",
        DEFAULT_PLANNER_USER_PROMPT_TEMPLATE: "user prompt",
      },
    },
    { method: "GET", url: "/api/planner-defaults" },
    {},
    "/api/planner-defaults",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    data: {
      systemPrompt: "system prompt",
      userPromptTemplate: "user prompt",
    },
  });
});

test("job routes resolve encoded trace id from project path", async () => {
  const { response, sendJson } = makeJsonResponder();
  let captured = null;
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      readRunTrace: async (projectId, jobId) => {
        captured = { projectId, jobId };
        return { entries: [] };
      },
      sha256: () => "hash",
    }),
    { method: "GET" },
    {},
    "/api/projects/demo/jobs/job%2F1/trace",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.deepEqual(captured, { projectId: "demo", jobId: "job/1" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, data: { entries: [] } });
});

test("render route uses domain ops and preserves blocked result output", async () => {
  const { response, sendJson } = makeJsonResponder();
  let historyEntry = null;
  let runStateWrite = null;
  const renderCalls = [];
  const projectFs = createInMemoryProjectFs({
    "/tmp/projects/demo/video-plan.json": '{"title":"before"}\n',
    "/tmp/projects/demo/timeline.json": '{"segments":[]}\n',
  });
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      path: await import("node:path"),
      projectsDir: "/tmp/projects",
      readFile: projectFs.readFile,
      readRunState: async () => ({ status: "idle" }),
      writeRunState: async (_projectId, state) => {
        runStateWrite = state;
      },
      runProjectMutation: async (_projectId, fn) => fn(),
      runTrackedForegroundJob: async (_projectId, _job, worker) =>
        worker({
          advance: async (_label, fn) => fn(),
        }),
      domainOps: {
        captions: async () => ({}),
        check: async () => ({}),
        review: async () => ({}),
        render: async (input) => {
          renderCalls.push(input);
          return {
            status: "blocked",
            quality: { status: "fail", checks: [{ id: "q1", severity: "error", message: "bad" }] },
            bundle: { timeline: { segments: [] } },
          };
        },
      },
      appendQualityHistory: async (_projectId, entry) => {
        historyEntry = entry;
      },
      sha256: async () => "hash-value",
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/render",
    new URL("http://localhost:4173/?quality=final"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(renderCalls, [{ projectId: "demo", quality: "final", force: false }]);
  assert.equal(response.body?.ok, true);
  assert.match(response.body?.data?.output || "", /"status": "blocked"/);
  assert.equal(historyEntry?.kind, "render");
  assert.equal(runStateWrite?.lastRenderQuality, "final");
});

test("plan-from-story sends sanitized planner input to single planner", async () => {
  const { response, sendJson } = makeJsonResponder();
  let capturedStory = "";
  const handled = await handleProjectPlanRoutes(
    makeProjectContext({
      sendJson,
      parseJsonBody: async () => ({
        story: "[BACKGROUND VISUAL: rain]\nThe room went cold.",
      }),
      getProjectDetails: async () => ({ plan: { sections: [] } }),
      splitPlannerEnabled: () => false,
      generatePlanDraftWithOpenAi: async ({ story }) => {
        capturedStory = story;
        return { plan: { sections: [] } };
      },
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/plan-from-story",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.match(capturedStory, /SPOKEN NARRATION/);
  assert.match(capturedStory, /PRODUCTION DIRECTIVES/);
  assert.doesNotMatch(capturedStory.split("PRODUCTION DIRECTIVES")[0], /BACKGROUND VISUAL/);
});

test("plan-from-story keeps raw story for split planner locked-unit parsing", async () => {
  const { response, sendJson } = makeJsonResponder();
  let capturedStory = "";
  const handled = await handleProjectPlanRoutes(
    makeProjectContext({
      sendJson,
      parseJsonBody: async () => ({
        story: "[BACKGROUND VISUAL: rain]\nThe room went cold.",
      }),
      getProjectDetails: async () => ({ plan: { sections: [] } }),
      splitPlannerEnabled: () => true,
      generateSplitPlanDraftWithOpenAi: async ({ story }) => {
        capturedStory = story;
        return { plan: { sections: [] } };
      },
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/plan-from-story",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.match(capturedStory, /^\[BACKGROUND VISUAL: rain\]/);
});

test("job routes reject draft requests with empty story and scaffold placeholder plan", async () => {
  const { response, sendJson } = makeJsonResponder();
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      isScaffoldPlaceholderPlan: () => true,
      getProjectDetails: async () => ({ plan: { sections: [] } }),
      runDraftJob: async () => ({ id: "job-1" }),
      sha256: () => "hash",
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/draft-job",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 400);
  assert.match(response.body.message, /Make Draft needs story text/);
});

test("prepare-draft uses typed safe steps and preserves quality warning responses", async () => {
  const { response, sendJson } = makeJsonResponder();
  const narrationCalls = [];
  const captionCalls = [];
  const syncCalls = [];
  const transcribeCalls = [];
  const checkCalls = [];
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      getProjectDetails: async () => ({
        plan: { providers: { tts: "chatterbox", transcription: "whisper" } },
        runState: { status: "idle" },
      }),
      runProjectMutation: async (_projectId, fn) => fn(),
      writeRunState: async () => {},
      runTrackedForegroundJob: async (_projectId, _job, worker) =>
        worker({
          advance: async (_label, fn) => {
            const result = await fn();
            return typeof result === "string" ? { stdout: result } : result;
          },
        }),
      domainOps: {
        generateTts: async (input) => {
          narrationCalls.push(input);
          return { generated: ["beat-1"], skipped: [] };
        },
        sync: async (projectId) => {
          syncCalls.push(projectId);
          return { projectId };
        },
        captions: async (projectId) => {
          captionCalls.push(projectId);
          return { captionsPath: `/tmp/${projectId}/captions.json`, count: 2 };
        },
        transcribe: async (input) => {
          transcribeCalls.push(input);
          return { transcriptPath: `/tmp/${input.projectId}/transcript.json`, segmentCount: 1 };
        },
        check: async (projectId) => {
          checkCalls.push(projectId);
          throw new Error("quality warning");
        },
        review: async () => ({}),
      },
      appendQualityHistory: async () => {},
      sha256: () => "hash",
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/prepare-draft",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.qualityOk, false);
  assert.match(response.body.data.output, /quality warning/);
  assert.deepEqual(syncCalls, ["demo"]);
  assert.deepEqual(transcribeCalls, [{ projectId: "demo", providerId: "whisper" }]);
  assert.deepEqual(captionCalls, ["demo"]);
  assert.deepEqual(checkCalls, ["demo"]);
  assert.deepEqual(narrationCalls, [{ projectId: "demo", providerId: "chatterbox", force: true }]);
});

test("direct-voice route uses typed domain operation", async () => {
  const { response, sendJson } = makeJsonResponder();
  const directVoiceCalls = [];
  const qualityHistory = [];
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      runProjectMutation: async (_projectId, fn) => fn(),
      runTrackedForegroundJob: async (_projectId, _job, worker) =>
        worker({
          advance: async (_label, fn) => {
            const result = await fn();
            return typeof result === "string" ? { stdout: result } : result;
          },
        }),
      domainOps: {
        directVoice: async (input) => {
          directVoiceCalls.push(input);
          return { beatUpdates: 2, videoPlanPath: "/tmp/demo/video-plan.json" };
        },
      },
      appendQualityHistory: async (_projectId, entry) => {
        qualityHistory.push(entry);
      },
      sha256: () => "hash",
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/direct-voice",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(directVoiceCalls, [{ projectId: "demo", provider: "openai" }]);
  assert.match(response.body.data.output, /beatUpdates/);
  assert.equal(qualityHistory[0].kind, "direct_voice");
});

test("job routes prefer active draft job over persisted run-state job", async () => {
  const { response, sendJson } = makeJsonResponder();
  const activeJob = {
    id: "active-1",
    kind: "draft_job",
    status: "running",
    phase: "planning",
    label: "Planning",
  };
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      activeDraftJobs: new Map([["demo", activeJob]]),
      jobProgress: (job) => ({ id: job.id, status: job.status, phase: job.phase }),
      readRunState: async () => ({
        jobs: [
          {
            id: "stale-1",
            kind: "draft_job",
            status: "failed",
            phase: "stopped",
            label: "Old job",
          },
        ],
      }),
      sha256: () => "hash",
    }),
    { method: "GET" },
    {},
    "/api/projects/demo/draft-job",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    data: { id: "active-1", status: "running", phase: "planning" },
  });
});

test("job routes return no-op when stopping draft with no active run", async () => {
  const { response, sendJson } = makeJsonResponder();
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      sha256: () => "hash",
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/draft-job/stop",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.match(response.body.message, /No running draft job/);
});

test("job routes stop stale persisted draft state when no active worker exists", async () => {
  const { response, sendJson } = makeJsonResponder();
  let writtenState = null;
  const staleJob = {
    kind: "draft_job",
    jobId: "draft-1",
    status: "running",
    phase: "planning",
    label: "Creating video plan",
    startedAt: "2026-05-25T10:00:00.000Z",
    tracePath: ".studio-data/run-traces/demo/draft-1.ndjson",
  };
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      readRunState: async () => ({ jobs: [staleJob] }),
      writeRunState: async (_projectId, state) => {
        writtenState = state;
      },
      sha256: () => "hash",
    }),
    { method: "POST" },
    {},
    "/api/projects/demo/draft-job/stop",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.match(response.body.message, /Stopped stale draft job state/);
  assert.equal(response.body.data.status, "failed");
  assert.equal(response.body.data.phase, "stopped");
  assert.equal(writtenState.jobs[0].status, "failed");
  assert.equal(writtenState.jobs[0].phase, "stopped");
});

test("job routes persist stale running draft state as stopped on read", async () => {
  const { response, sendJson } = makeJsonResponder();
  let writtenState = null;
  const staleJob = {
    kind: "draft_job",
    jobId: "draft-1",
    status: "queued",
    phase: "planning",
    label: "Creating video plan",
    startedAt: "2026-05-25T10:00:00.000Z",
  };
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      readRunState: async () => ({ jobs: [staleJob] }),
      writeRunState: async (_projectId, state) => {
        writtenState = state;
      },
      sha256: () => "hash",
    }),
    { method: "GET" },
    {},
    "/api/projects/demo/draft-job",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, "failed");
  assert.equal(response.body.data.phase, "stopped");
  assert.equal(writtenState.jobs[0].status, "failed");
  assert.equal(writtenState.jobs[0].phase, "stopped");
});

test("job routes fall through for unmatched endpoint", async () => {
  const { sendJson } = makeJsonResponder();
  const handled = await handleJobRoutes(
    makeJobContext({
      sendJson,
      sha256: () => "hash",
    }),
    { method: "GET" },
    {},
    "/api/projects/demo/not-a-job-route",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, false);
});

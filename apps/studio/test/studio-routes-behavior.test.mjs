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

test("settings routes serve planner defaults payload", async () => {
  const { response, sendJson } = makeJsonResponder();
  const handled = await handleSettingsRoutes(
    {
      sendJson,
      parseJsonBody: async () => ({}),
      parseBinaryBody: async () => Buffer.alloc(0),
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

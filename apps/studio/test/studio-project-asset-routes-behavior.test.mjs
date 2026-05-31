import assert from "node:assert/strict";
import { test } from "node:test";
import { handleProjectRoutes } from "../lib/routes/routes-projects.mjs";
import { handleAssetRoutes } from "../lib/routes/routes-assets.mjs";
import {
  makeAssetContext,
  makeJsonResponder,
  makeProjectContext,
} from "./helpers/route-test-helpers.mjs";
import { createInMemoryProjectFs } from "./helpers/project-fs-helpers.mjs";

test("project routes reject invalid render quality", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const handled = await handleProjectRoutes(
    makeProjectContext({
      sendJson,
      sendVideoFile: async () => {},
    }),
    { method: "GET" },
    res,
    "/api/projects/demo/renders/ultra",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 400);
  assert.equal(response.body?.message, "Invalid render quality.");
});

test("project create canonicalizes legacy beat fields before writing plan", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const writes = new Map();
  const handled = await handleProjectRoutes(
    makeProjectContext({
      sendJson,
      parseJsonBody: async () => ({ id: "demo", title: "Demo" }),
      safeProjectId: (value) => String(value || ""),
      stat: async () => null,
      runLvstudio: async () => ({ ok: true, stdout: "ok" }),
      safeReadJson: async (targetPath) => {
        if (targetPath.endsWith("/project.json")) {
          return { id: "demo", title: "Demo", updatedAt: "2026-01-01T00:00:00.000Z" };
        }
        return {
          title: "Demo",
          providers: {
            llm: "manual",
            tts: "legacy",
            transcription: "legacy",
            media: "manual-media",
            renderer: "remotion",
          },
          voice: { provider: "legacy", voiceId: "legacy", format: "wav", options: {} },
          sections: [
            {
              id: "s1",
              title: "Section 1",
              beats: [
                {
                  id: "b1",
                  order: 1,
                  narration: "Hello",
                  voiceDirection: { profile: "urgent", intensity: 0.8, source: "user" },
                  sfxCues: [
                    {
                      id: "sfx-1",
                      kind: "thud",
                      placement: "manual",
                      offsetSeconds: 0,
                      levelDb: -16,
                      pan: 0,
                      proximity: "room",
                      duckMusic: false,
                    },
                  ],
                  editorial: { visualEditCues: [], silenceWindows: [] },
                },
              ],
            },
          ],
        };
      },
      writeFile: async (targetPath, contents) => {
        writes.set(targetPath, contents);
      },
    }),
    { method: "POST" },
    res,
    "/api/projects",
  );

  assert.equal(handled, true);
  assert.equal(response.status, 201);
  const planWrite = [...writes.entries()].find(([targetPath]) =>
    targetPath.endsWith("/video-plan.json"),
  )?.[1];
  assert.ok(planWrite);
  const writtenPlan = JSON.parse(planWrite);
  const beat = writtenPlan.sections[0].beats[0];
  assert.equal(Object.hasOwn(beat, "voiceDirection"), false);
  assert.equal(Object.hasOwn(beat, "sfxCues"), false);
  assert.equal(Object.hasOwn(beat, "editorial"), false);
  assert.equal(beat.direction?.voice?.profile, "urgent");
  assert.equal(Array.isArray(beat.direction?.sfxCues), true);
  assert.equal(Object.hasOwn(beat.direction || {}, "editorial"), true);
});

test("project routes reject unsafe media paths", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const handled = await handleProjectRoutes(
    makeProjectContext({
      sendJson,
      safeProjectPath: () => null,
    }),
    { method: "GET" },
    res,
    "/api/projects/demo/media/..%2Fsecret.txt",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 400);
  assert.equal(response.body?.message, "Invalid media path.");
});

test("project quality route writes quality history and returns output", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  let historyEntry = null;
  const handled = await handleProjectRoutes(
    makeProjectContext({
      sendJson,
      runTrackedForegroundJob: async (_projectId, _job, worker) =>
        worker({ advance: async (_label, fn) => fn() }),
      runLvstudio: async () => ({ stdout: "quality ok\n" }),
      appendQualityHistory: async (_projectId, entry) => {
        historyEntry = entry;
      },
    }),
    { method: "GET" },
    res,
    "/api/projects/demo/quality",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.output, "quality ok");
  assert.equal(historyEntry?.kind, "quality_check");
});

test("project review route returns warning when output is not json", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const handled = await handleProjectRoutes(
    makeProjectContext({
      sendJson,
      runLvstudioReport: async () => ({ ok: true, stdout: "not json" }),
    }),
    { method: "GET" },
    res,
    "/api/projects/demo/review",
    new URL("http://localhost:4173"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.match(response.body?.warning || "", /not valid JSON/i);
  assert.deepEqual(response.body?.data, { issues: [] });
});

test("asset routes decode beat id for regenerate and queue job", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  let received = null;
  const handled = await handleAssetRoutes(
    makeAssetContext({
      sendJson,
      parseJsonBody: async () => ({ mode: "narration_only" }),
      activeBeatJobs: new Map(),
      beatJobProgress: (job) => job,
      runBeatRegenerateJob: async (projectId, beatId, body) => {
        received = { projectId, beatId, body };
        return { id: "beat-job-1", status: "queued" };
      },
    }),
    { method: "POST" },
    res,
    "/api/projects/demo/beats/beat%2F001/regenerate",
  );

  assert.equal(handled, true);
  assert.deepEqual(received, {
    projectId: "demo",
    beatId: "beat/001",
    body: { mode: "narration_only" },
  });
  assert.equal(response.status, 202);
  assert.equal(response.body?.ok, true);
});

test("asset routes return in-progress beat job without enqueueing another", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const activeJob = { id: "beat-job-1", status: "running", phase: "editing" };
  let called = false;
  const handled = await handleAssetRoutes(
    makeAssetContext({
      sendJson,
      parseJsonBody: async () => ({}),
      activeBeatJobs: new Map([["demo", activeJob]]),
      beatJobProgress: (job) => ({ id: job.id, status: job.status }),
      runBeatRegenerateJob: async () => {
        called = true;
        return {};
      },
    }),
    { method: "POST" },
    res,
    "/api/projects/demo/beats/beat-001/regenerate",
  );

  assert.equal(handled, true);
  assert.equal(called, false);
  assert.equal(response.status, 202);
  assert.match(response.body?.message || "", /already running/i);
  assert.deepEqual(response.body?.data, { id: "beat-job-1", status: "running" });
});

test("asset routes fall through when path does not match", async () => {
  const { res, sendJson } = makeJsonResponder();
  const handled = await handleAssetRoutes(
    makeAssetContext({
      sendJson,
      parseJsonBody: async () => ({}),
    }),
    { method: "POST" },
    res,
    "/api/projects/demo/unknown-endpoint",
  );

  assert.equal(handled, false);
});

test("project plan save writes updated plan and run-state on success", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const projectFs = createInMemoryProjectFs({
    "/tmp/projects/demo/video-plan.json": '{"title":"before"}\n',
    "/tmp/projects/demo/timeline.json": '{"segments":[]}\n',
    "/tmp/projects/demo/asset-manifest.json": '{"assets":[]}\n',
  });
  let runStateWrite = null;
  const handled = await handleProjectRoutes(
    makeProjectContext({
      sendJson,
      parseJsonBody: async () => ({
        title: "after",
        sections: [
          {
            id: "s1",
            title: "Section 1",
            beats: [
              {
                id: "b1",
                order: 1,
                narration: "Hello",
                voiceDirection: {
                  profile: "urgent",
                  intensity: 0.8,
                  pauseBeforeMs: 200,
                  pauseAfterMs: 400,
                  source: "user",
                },
                sfxCues: [
                  {
                    id: "sfx-1",
                    kind: "thud",
                    placement: "manual",
                    offsetSeconds: 0,
                    levelDb: -16,
                    pan: 0,
                    proximity: "room",
                    duckMusic: false,
                  },
                ],
                editorial: { visualEditCues: [], silenceWindows: [] },
              },
            ],
          },
        ],
      }),
      readFile: projectFs.readFile,
      writeFile: projectFs.writeFile,
      readOptionalFile: projectFs.readOptionalFile,
      restoreOptionalFile: projectFs.restoreOptionalFile,
      runTrackedForegroundJob: async (_projectId, _job, worker) =>
        worker({
          advance: async (_label, fn) => fn(),
        }),
      runLvstudio: async (args) => ({ stdout: `ok ${args.join(" ")}` }),
      appendQualityHistory: async () => {},
      readRunState: async () => ({ status: "dirty" }),
      writeRunState: async (_projectId, state) => {
        runStateWrite = state;
      },
      sha256: async () => "hash-after",
    }),
    { method: "PUT" },
    res,
    "/api/projects/demo/plan",
    new URL("http://localhost:4173/?check=false"),
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  const persistedPlanRaw = projectFs.files.get("/tmp/projects/demo/video-plan.json");
  const persistedPlan = JSON.parse(persistedPlanRaw);
  assert.equal(persistedPlan.title, "after");
  const persistedBeat = persistedPlan.sections[0].beats[0];
  assert.equal(Object.hasOwn(persistedBeat, "voiceDirection"), false);
  assert.equal(Object.hasOwn(persistedBeat, "sfxCues"), false);
  assert.equal(Object.hasOwn(persistedBeat, "editorial"), false);
  assert.equal(persistedBeat.direction?.voice?.profile, "urgent");
  assert.equal(persistedBeat.direction?.voice?.pauseBeforeMs, 200);
  assert.equal(persistedBeat.direction?.voice?.pauseAfterMs, 400);
  assert.equal(Array.isArray(persistedBeat.direction?.sfxCues), true);
  assert.equal(Object.hasOwn(persistedBeat.direction || {}, "editorial"), true);
  assert.equal(runStateWrite?.currentPlanHash, "hash-after");
  assert.equal(runStateWrite?.status, "idle");
});

test("project plan save rolls back files when sync/check step fails", async () => {
  const { res, sendJson } = makeJsonResponder();
  const projectFs = createInMemoryProjectFs({
    "/tmp/projects/demo/video-plan.json": '{"title":"before"}\n',
    "/tmp/projects/demo/timeline.json": '{"segments":[1]}\n',
    "/tmp/projects/demo/asset-manifest.json": '{"assets":[1]}\n',
  });
  await assert.rejects(async () => {
    await handleProjectRoutes(
      {
        ...makeProjectContext(),
        sendJson,
        parseJsonBody: async () => ({ title: "after", sections: [] }),
        readFile: projectFs.readFile,
        writeFile: projectFs.writeFile,
        readOptionalFile: projectFs.readOptionalFile,
        restoreOptionalFile: projectFs.restoreOptionalFile,
        runTrackedForegroundJob: async () => {
          throw new Error("sync failed");
        },
        sha256: async () => "hash",
      },
      { method: "PUT" },
      res,
      "/api/projects/demo/plan",
      new URL("http://localhost:4173/"),
    );
  }, /sync failed/);

  assert.equal(projectFs.files.get("/tmp/projects/demo/video-plan.json"), '{"title":"before"}\n');
  assert.ok(projectFs.restored.some(([filePath]) => filePath.endsWith("/timeline.json")));
  assert.ok(projectFs.restored.some(([filePath]) => filePath.endsWith("/asset-manifest.json")));
});

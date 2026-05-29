import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createStudioApiContext } from "../lib/runtime/studio-api-context.mjs";
import { createStudioHttpHandler } from "../lib/routes/studio-http-handler.mjs";
import { handleStudioApiRoute } from "../lib/routes/studio-routes.mjs";
import { createInMemoryProjectFs } from "./helpers/project-fs-helpers.mjs";
import { makeJsonResponder, makeStudioBaseContext } from "./helpers/route-test-helpers.mjs";

test("studio http handler routes project create through to filesystem writes", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const projectFs = createInMemoryProjectFs();
  const writes = new Map();
  const context = makeStudioBaseContext({
    sendJson,
    path,
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
                voiceDirection: {
                  profile: "urgent",
                  intensity: 0.8,
                  pauseBeforeSeconds: 0.2,
                  pauseAfterSeconds: 0.4,
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
      };
    },
    writeFile: async (targetPath, contents) => {
      writes.set(targetPath, contents);
      return projectFs.writeFile(targetPath, contents);
    },
    readFile: projectFs.readFile,
  });

  const studioApiContext = createStudioApiContext(context);
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: projectFs.readFile,
    sendJson,
    handleStudioApiRoute,
    publicAssetForPath: () => null,
    isSafeProjectId: (value) => value !== "..",
    studioApiContext,
  });

  await handler({ method: "POST", url: "/api/projects" }, res);

  assert.equal(response.status, 201);
  assert.equal(response.body?.ok, true);
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
});

test("studio http handler routes plan save through sync/check and run-state update", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const projectFs = createInMemoryProjectFs({
    "/tmp/projects/demo/video-plan.json": '{"title":"before"}\n',
    "/tmp/projects/demo/timeline.json": '{"segments":[]}\n',
    "/tmp/projects/demo/asset-manifest.json": '{"assets":[]}\n',
  });
  let runStateWrite = null;
  const context = makeStudioBaseContext({
    sendJson,
    path,
    projectsDir: "/tmp/projects",
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
                pauseBeforeSeconds: 0.2,
                pauseAfterSeconds: 0.4,
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
      worker({ advance: async (_label, fn) => fn() }),
    runLvstudio: async (args) => ({ stdout: `ok ${args.join(" ")}` }),
    appendQualityHistory: async () => {},
    readRunState: async () => ({ status: "dirty" }),
    writeRunState: async (_projectId, state) => {
      runStateWrite = state;
    },
    sha256: async () => "hash-after",
  });

  const studioApiContext = createStudioApiContext(context);
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: projectFs.readFile,
    sendJson,
    handleStudioApiRoute,
    publicAssetForPath: () => null,
    isSafeProjectId: (value) => value !== "..",
    studioApiContext,
  });

  await handler({ method: "PUT", url: "/api/projects/demo/plan?check=false" }, res);

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  const persistedPlan = JSON.parse(projectFs.files.get("/tmp/projects/demo/video-plan.json"));
  const persistedBeat = persistedPlan.sections[0].beats[0];
  assert.equal(Object.hasOwn(persistedBeat, "voiceDirection"), false);
  assert.equal(Object.hasOwn(persistedBeat, "sfxCues"), false);
  assert.equal(Object.hasOwn(persistedBeat, "editorial"), false);
  assert.equal(persistedBeat.direction?.voice?.profile, "urgent");
  assert.equal(persistedBeat.direction?.voice?.pauseBeforeMs, 200);
  assert.equal(persistedBeat.direction?.voice?.pauseAfterMs, 400);
  assert.equal(Object.hasOwn(persistedBeat.direction?.voice || {}, "pauseBeforeSeconds"), false);
  assert.equal(Object.hasOwn(persistedBeat.direction?.voice || {}, "pauseAfterSeconds"), false);
  assert.equal(runStateWrite?.currentPlanHash, "hash-after");
  assert.equal(runStateWrite?.status, "idle");
});

test("studio http handler restores files when plan save sync step fails", async () => {
  const { res, response, sendJson } = makeJsonResponder();
  const originalPlan = '{"title":"before"}\n';
  const originalTimeline = '{"segments":[1]}\n';
  const originalManifest = '{"assets":[1]}\n';
  const projectFs = createInMemoryProjectFs({
    "/tmp/projects/demo/video-plan.json": originalPlan,
    "/tmp/projects/demo/timeline.json": originalTimeline,
    "/tmp/projects/demo/asset-manifest.json": originalManifest,
  });

  const context = makeStudioBaseContext({
    sendJson,
    path,
    projectsDir: "/tmp/projects",
    parseJsonBody: async () => ({ title: "after", sections: [] }),
    readFile: projectFs.readFile,
    writeFile: projectFs.writeFile,
    readOptionalFile: projectFs.readOptionalFile,
    restoreOptionalFile: projectFs.restoreOptionalFile,
    runTrackedForegroundJob: async () => {
      throw new Error("sync failed");
    },
    readRunState: async () => ({ status: "dirty" }),
    writeRunState: async () => {},
    sha256: async () => "hash-after",
  });

  const studioApiContext = createStudioApiContext(context);
  const handler = createStudioHttpHandler({
    port: 4173,
    publicDir: "/tmp/public",
    readFile: projectFs.readFile,
    sendJson,
    handleStudioApiRoute,
    publicAssetForPath: () => null,
    isSafeProjectId: (value) => value !== "..",
    studioApiContext,
  });

  await handler({ method: "PUT", url: "/api/projects/demo/plan" }, res);

  assert.equal(response.status, 500);
  assert.match(response.body?.message || "", /sync failed/);
  assert.equal(projectFs.files.get("/tmp/projects/demo/video-plan.json"), originalPlan);
  assert.equal(projectFs.files.get("/tmp/projects/demo/timeline.json"), originalTimeline);
  assert.equal(projectFs.files.get("/tmp/projects/demo/asset-manifest.json"), originalManifest);
  assert.ok(projectFs.restored.some(([targetPath]) => targetPath.endsWith("/timeline.json")));
  assert.ok(projectFs.restored.some(([targetPath]) => targetPath.endsWith("/asset-manifest.json")));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createBeatRegenerateRunner } from "../lib/draft/beat-regenerate-runner.mjs";

test("beat regenerate runner completes audio/image/caption flow and clears active job", async () => {
  const activeBeatJobs = new Map();
  const upserts = [];
  const lvstudioCalls = [];
  const narrationCalls = [];
  const captionCalls = [];
  const renderCalls = [];
  const syncCalls = [];
  const qualityHistory = [];

  const runBeatRegenerateJob = createBeatRegenerateRunner({
    activeBeatJobs,
    getProjectDetails: async () => ({
      plan: {
        providers: { tts: "chatterbox", transcription: "whisper" },
        sections: [{ id: "s1", beats: [{ id: "beat-1" }] }],
      },
    }),
    upsertRunJob: async (_projectId, payload) => {
      upserts.push(payload);
    },
    runProjectMutation: async (_projectId, fn) => {
      await fn();
    },
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
      render: async (input) => {
        renderCalls.push(input);
        return { status: "rendered", renderResult: { outputPath: "/tmp/demo/renders/draft.mp4" } };
      },
    },
    runLvstudio: async (args) => {
      lvstudioCalls.push(args);
      return { stdout: "ok" };
    },
    generateProjectImages: async () => ({ generated: [{ id: "img-1" }], failed: [] }),
    defaultImageSizeForPlan: () => "1024x1024",
    appendQualityHistory: async (_projectId, entry) => {
      qualityHistory.push(entry);
    },
  });

  const initial = await runBeatRegenerateJob("demo", "beat-1", {
    audio: true,
    image: true,
    captions: true,
    render: true,
  });
  assert.equal(initial.kind, "beat_regenerate_job");
  assert.ok(["queued", "running", "completed"].includes(initial.status));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(activeBeatJobs.size, 0);
  assert.deepEqual(captionCalls, ["demo"]);
  assert.deepEqual(syncCalls, ["demo"]);
  assert.deepEqual(renderCalls, [{ projectId: "demo", quality: "draft", force: true }]);
  assert.deepEqual(narrationCalls, [
    { projectId: "demo", providerId: "chatterbox", onlyBeat: "beat-1" },
  ]);
  assert.equal(
    lvstudioCalls.some((args) => args[0] === "generate:tts"),
    false,
  );
  assert.equal(
    lvstudioCalls.some((args) => args[0] === "render"),
    false,
  );
  assert.equal(
    lvstudioCalls.some((args) => args[0] === "captions"),
    false,
  );
  assert.equal(qualityHistory[0].kind, "beat_regenerate");
  assert.equal(upserts.length > 2, true);
});

test("beat regenerate runner throws when beat is missing", async () => {
  const runBeatRegenerateJob = createBeatRegenerateRunner({
    activeBeatJobs: new Map(),
    getProjectDetails: async () => ({
      plan: { providers: { tts: "chatterbox", transcription: "whisper" }, sections: [] },
    }),
    upsertRunJob: async () => {},
    runProjectMutation: async () => {},
    domainOps: {
      sync: async () => ({}),
      captions: async () => ({}),
      render: async () => ({}),
    },
    runLvstudio: async () => ({ stdout: "" }),
    generateProjectImages: async () => ({ generated: [], failed: [] }),
    defaultImageSizeForPlan: () => "1024x1024",
    appendQualityHistory: async () => {},
  });

  await assert.rejects(() => runBeatRegenerateJob("demo", "missing"), /Beat not found: missing/);
});

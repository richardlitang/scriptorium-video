import assert from "node:assert/strict";
import { test } from "node:test";
import { createDraftAudioRunner } from "../lib/draft/draft-audio-runner.mjs";

test("draft audio runner batches single-provider beats and runs sync/transcribe/captions", async () => {
  const traces = [];
  const labels = [];
  const lvstudioArgs = [];
  const job = { id: "draft-1", completed: 0 };
  const plan = {
    providers: { tts: "chatterbox", transcription: "whisper" },
    sections: [
      {
        id: "s1",
        title: "Intro",
        beats: [
          { id: "b2", order: 2, narration: "Second beat" },
          { id: "b1", order: 1, narration: "First beat" },
        ],
      },
    ],
  };

  const run = createDraftAudioRunner({
    readVoiceSettings: async () => ({}),
    appendRunTrace: async (_projectId, _jobId, event, payload) => {
      traces.push({ event, payload });
    },
    summarizeVoiceSettingsForTrace: () => ({}),
    ensureChatterboxReady: async () => ({ ok: true }),
    readMmsHealth: async () => ({ ok: true }),
    getOpenAiApiKey: async () => "k",
    writeDraftJobState: async (_projectId, _job, patch) => {
      if (patch?.label) labels.push(patch.label);
    },
    runRetriedDraftStep: async (_projectId, _job, label, operation) => {
      labels.push(label);
      await operation();
    },
    runLvstudioForDraft: async (_job, args) => {
      lvstudioArgs.push(args);
      return { stdout: "ok" };
    },
    readProjectTraceSnapshot: async () => ({}),
  });

  await run("demo", job, plan, "whisper");

  assert.equal(job.completed, 1);
  assert.equal(labels.includes("Sync timeline"), true);
  assert.equal(labels.includes("Transcribe narration"), true);
  assert.equal(labels.includes("Generate captions"), true);
  assert.equal(
    lvstudioArgs.some(
      (args) => args[0] === "generate:tts" && args.includes("--only-beat") && args.includes("b1"),
    ),
    true,
  );
  assert.equal(
    lvstudioArgs.some((args) => args[0] === "generate:tts" && args.includes("b2")),
    true,
  );
  assert.equal(
    traces.some((entry) => entry.event === "audio.batch.start"),
    true,
  );
});

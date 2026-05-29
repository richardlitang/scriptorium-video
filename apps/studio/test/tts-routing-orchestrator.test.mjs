import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTtsRoutingOrchestrator,
  planNeedsTtsRouting,
} from "../lib/tts/tts-routing-orchestrator.mjs";

function planWithBeat(beat) {
  return {
    title: "Fixture",
    providers: { tts: "chatterbox" },
    voice: { options: { language: "filipino" } },
    sections: [
      {
        id: "intro",
        title: "Intro",
        beats: [beat],
      },
    ],
  };
}

test("planNeedsTtsRouting audits llm-sourced routes even when provider fields exist", () => {
  const plan = planWithBeat({
    id: "intro-001",
    narration: "My Lola heard the floor creak.",
    voiceDirection: {
      language: "filipino",
      ttsProvider: "mms",
      source: "llm",
    },
  });

  assert.equal(planNeedsTtsRouting(plan), true);
});

test("TTS routing preserves user-authored provider overrides", async () => {
  const plan = planWithBeat({
    id: "intro-001",
    narration: "My Lola heard the floor creak.",
    voiceDirection: {
      language: "en",
      ttsProvider: "chatterbox",
      source: "user",
    },
    directionMeta: {
      sources: { ttsRouting: "user" },
    },
  });
  const routePlanTtsWithOpenAi = createTtsRoutingOrchestrator({
    getOpenAiApiKey: async () => "test-key",
    openAiResponsesUrl: "https://example.invalid/responses",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          routes: [
            {
              beatId: "intro-001",
              narrationLanguage: "filipino",
              ttsProvider: "mms",
              confidence: 0.9,
              reason: "bad mock route",
            },
          ],
          warnings: [],
        }),
      }),
    }),
  });

  const routed = await routePlanTtsWithOpenAi(plan);
  const [beat] = routed.plan.sections[0].beats;
  assert.equal(routed.model, "local-default");
  assert.equal(beat.voiceDirection.language, "en");
  assert.equal(beat.voiceDirection.ttsProvider, "chatterbox");
  assert.equal(beat.voiceDirection.source, "user");
});

test("TTS routing defaults to local configured provider without OpenAI", async () => {
  const plan = planWithBeat({
    id: "intro-001",
    narration: "My Lola heard the floor creak.",
    voiceDirection: {},
  });
  let fetchCalled = false;
  const routePlanTtsWithOpenAi = createTtsRoutingOrchestrator({
    getOpenAiApiKey: async () => {
      throw new Error("should not request api key");
    },
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("should not fetch");
    },
  });

  const routed = await routePlanTtsWithOpenAi(plan);
  const [beat] = routed.plan.sections[0].beats;
  assert.equal(fetchCalled, false);
  assert.equal(routed.model, "local-default");
  assert.equal(beat.voiceDirection.language, "en");
  assert.equal(beat.voiceDirection.ttsProvider, "chatterbox");
  assert.equal(beat.voiceDirection.source, "default");
  assert.equal(beat.direction.voice.ttsProvider, "chatterbox");
  assert.equal(beat.directionMeta.sources.ttsRouting, "default");
});

test("TTS routing uses injected OpenAI routing config when enabled", async () => {
  const plan = planWithBeat({
    id: "intro-001",
    narration: "This is mostly English narration.",
    voiceDirection: {},
  });
  let requestBody = null;
  const routePlanTtsWithOpenAi = createTtsRoutingOrchestrator({
    getOpenAiApiKey: async () => "test-key",
    openAiResponsesUrl: "https://example.invalid/responses",
    ttsRoutingConfig: { enabled: true, model: "gpt-routing-test" },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            routes: [
              {
                beatId: "intro-001",
                narrationLanguage: "en",
                ttsProvider: "chatterbox",
                confidence: 0.95,
                reason: "English narration",
              },
            ],
            warnings: [],
          }),
        }),
      };
    },
  });

  const routed = await routePlanTtsWithOpenAi(plan);
  const [beat] = routed.plan.sections[0].beats;
  assert.equal(requestBody.model, "gpt-routing-test");
  assert.equal(routed.model, "gpt-routing-test");
  assert.equal(beat.voiceDirection.source, "llm");
  assert.equal(beat.directionMeta.sources.ttsRouting, "llm");
});

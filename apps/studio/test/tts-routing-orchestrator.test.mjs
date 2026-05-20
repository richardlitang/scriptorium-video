import assert from "node:assert/strict";
import { test } from "node:test";
import { createTtsRoutingOrchestrator, planNeedsTtsRouting } from "../lib/tts-routing-orchestrator.mjs";

function planWithBeat(beat) {
  return {
    title: "Fixture",
    providers: { tts: "chatterbox" },
    voice: { options: { language: "filipino" } },
    sections: [
      {
        id: "intro",
        title: "Intro",
        beats: [beat]
      }
    ]
  };
}

test("planNeedsTtsRouting audits llm-sourced routes even when provider fields exist", () => {
  const plan = planWithBeat({
    id: "intro-001",
    narration: "My Lola heard the floor creak.",
    voiceDirection: {
      language: "filipino",
      ttsProvider: "mms",
      source: "llm"
    }
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
      source: "user"
    },
    directionMeta: {
      sources: { ttsRouting: "user" }
    }
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
              reason: "bad mock route"
            }
          ],
          warnings: []
        })
      })
    })
  });

  const routed = await routePlanTtsWithOpenAi(plan);
  const [beat] = routed.plan.sections[0].beats;
  assert.equal(beat.voiceDirection.language, "en");
  assert.equal(beat.voiceDirection.ttsProvider, "chatterbox");
  assert.equal(beat.voiceDirection.source, "user");
});

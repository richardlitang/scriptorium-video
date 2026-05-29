import assert from "node:assert/strict";
import { test } from "node:test";
import { preflightDraftTtsProviders } from "../lib/tts/tts-preflight.mjs";

test("preflightDraftTtsProviders passes when required providers are healthy", async () => {
  const checks = await preflightDraftTtsProviders(
    {
      providers: { tts: "chatterbox" },
      sections: [{ beats: [{}, { voiceDirection: { ttsProvider: "openai" } }] }],
    },
    {
      ensureChatterboxReady: async () => ({
        provider: "chatterbox",
        ok: true,
        status: "ready",
        error: null,
      }),
      readMmsHealth: async () => ({ provider: "mms", ok: true, status: "ready", error: null }),
      getOpenAiApiKey: async () => "test-key",
    },
  );
  assert.equal(checks.length, 2);
  assert.ok(checks.every((check) => check.ok));
});

test("preflightDraftTtsProviders surfaces aggregated provider failures", async () => {
  await assert.rejects(
    preflightDraftTtsProviders(
      {
        providers: { tts: "chatterbox" },
        sections: [
          {
            beats: [
              {},
              { voiceDirection: { ttsProvider: "openai" } },
              { voiceDirection: { ttsProvider: "mms" } },
            ],
          },
        ],
      },
      {
        ensureChatterboxReady: async () => ({
          provider: "chatterbox",
          ok: false,
          status: "unreachable",
          error: "down",
        }),
        readMmsHealth: async () => ({
          provider: "mms",
          ok: false,
          status: "failed",
          error: "health-check-failed",
        }),
        getOpenAiApiKey: async () => {
          throw new Error("missing OPENAI_API_KEY");
        },
      },
    ),
    /Draft requires unavailable TTS provider\(s\):/,
  );
});

test("preflightDraftTtsProviders requires explicit runtime dependencies", async () => {
  await assert.rejects(
    preflightDraftTtsProviders({
      providers: { tts: "chatterbox" },
      sections: [{ beats: [{}] }],
    }),
    /preflightDraftTtsProviders requires runtime dependencies/,
  );
});

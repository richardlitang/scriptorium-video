import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftAudioStepCount,
  ttsProviderForBeat,
  ttsProvidersForPlan,
} from "../lib/tts/tts-draft-planning.mjs";

test("ttsProviderForBeat prefers explicit beat routing over defaults", () => {
  assert.equal(
    ttsProviderForBeat("chatterbox", {
      voiceDirection: { ttsProvider: "mms" },
      direction: { voice: { ttsProvider: "openai" } },
    }),
    "mms",
  );
  assert.equal(
    ttsProviderForBeat("chatterbox", { direction: { voice: { ttsProvider: "openai" } } }),
    "openai",
  );
  assert.equal(ttsProviderForBeat("chatterbox", {}), "chatterbox");
});

test("ttsProvidersForPlan returns sorted unique providers", () => {
  const providers = ttsProvidersForPlan({
    providers: { tts: "chatterbox" },
    sections: [
      {
        beats: [
          { voiceDirection: { ttsProvider: "mms" } },
          { direction: { voice: { ttsProvider: "openai" } } },
          {},
        ],
      },
    ],
  });
  assert.deepEqual(providers, ["chatterbox", "mms", "openai"]);
});

test("draftAudioStepCount collapses to one step for single provider and fans out for multi-provider", () => {
  const single = draftAudioStepCount({
    providers: { tts: "chatterbox" },
    sections: [{ beats: [{}, {}] }],
  });
  assert.equal(single, 1);

  const multiple = draftAudioStepCount({
    providers: { tts: "chatterbox" },
    sections: [{ beats: [{ voiceDirection: { ttsProvider: "mms" } }, {}] }],
  });
  assert.equal(multiple, 2);

  assert.equal(draftAudioStepCount({ providers: { tts: "chatterbox" }, sections: [] }), 0);
});

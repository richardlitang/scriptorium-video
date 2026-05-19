import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLanguageRoutedProvider } from "../dist/generate-tts.js";

function planWithLanguage(language) {
  return {
    voice: {
      options: {
        language
      }
    }
  };
}

test("resolveLanguageRoutedProvider returns mapped provider for exact language", () => {
  const original = process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE;
  process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE = JSON.stringify({
    default: "chatterbox",
    fil: "mms",
    non_english: "openai"
  });
  try {
    assert.equal(resolveLanguageRoutedProvider(planWithLanguage("fil")), "mms");
  } finally {
    if (original === undefined) delete process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE;
    else process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE = original;
  }
});

test("resolveLanguageRoutedProvider falls back to non_english for unknown non-English base", () => {
  const original = process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE;
  process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE = JSON.stringify({
    default: "chatterbox",
    non_english: "openai"
  });
  try {
    assert.equal(resolveLanguageRoutedProvider(planWithLanguage("ja-JP")), "openai");
  } finally {
    if (original === undefined) delete process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE;
    else process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE = original;
  }
});

test("resolveLanguageRoutedProvider uses code_switch mapping", () => {
  const original = process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE;
  process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE = JSON.stringify({
    default: "chatterbox",
    code_switch: "openai"
  });
  try {
    assert.equal(resolveLanguageRoutedProvider(planWithLanguage("en+fil")), "openai");
  } finally {
    if (original === undefined) delete process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE;
    else process.env.LVSTUDIO_TTS_PROVIDER_BY_LANGUAGE = original;
  }
});

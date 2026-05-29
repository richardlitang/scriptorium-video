import assert from "node:assert/strict";
import { test } from "node:test";
import { isOpenAiInsufficientQuotaError, parseModelFallbacks, runStructuredOutput } from "../lib/openai-structured-output.mjs";

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(data),
    json: async () => data
  };
}

test("parseModelFallbacks trims empty entries", () => {
  assert.deepEqual(parseModelFallbacks(" gpt-5-mini, ,gpt-4.1-mini "), ["gpt-5-mini", "gpt-4.1-mini"]);
});

test("runStructuredOutput falls back to the next model after a timeout", async () => {
  const requestedModels = [];
  const progressEvents = [];
  const result = await runStructuredOutput({
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requestedModels.push(body.model);
      if (body.model === "gpt-5.1") {
        const error = new Error("timed out");
        error.name = "AbortError";
        throw error;
      }
      return jsonResponse({ output_text: JSON.stringify({ ok: true, model: body.model }) });
    },
    url: "https://api.openai.com/v1/responses",
    apiKey: "test-key",
    model: "gpt-5.1",
    fallbackModels: ["gpt-5-mini", "gpt-4o-mini"],
    input: [{ role: "user", content: "test" }],
    schemaName: "test_schema",
    schema: { type: "object", additionalProperties: false, required: ["ok", "model"], properties: { ok: { type: "boolean" }, model: { type: "string" } } },
    errorLabel: "OpenAI test failed",
    timeoutMs: 10,
    maxAttempts: 1,
    onProgress: (event) => progressEvents.push(event)
  });

  assert.deepEqual(requestedModels, ["gpt-5.1", "gpt-5-mini"]);
  assert.deepEqual(progressEvents.map((event) => event.event), [
    "request.start",
    "request.retryable_error",
    "request.start",
    "request.response"
  ]);
  assert.equal(progressEvents[0].inputChars, 8);
  assert.equal(progressEvents[0].approxInputTokens, 2);
  assert.equal(typeof progressEvents[0].payloadChars, "number");
  assert.ok(progressEvents[0].payloadChars > progressEvents[0].inputChars);
  assert.equal(typeof progressEvents[0].schemaChars, "number");
  assert.ok(progressEvents[0].schemaChars > 0);
  assert.deepEqual(result, { ok: true, model: "gpt-5-mini" });
});

test("runStructuredOutput does not fall back after a non-retriable schema error", async () => {
  const requestedModels = [];
  await assert.rejects(
    runStructuredOutput({
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        requestedModels.push(body.model);
        return jsonResponse({ error: "bad schema" }, false, 400);
      },
      url: "https://api.openai.com/v1/responses",
      apiKey: "test-key",
      model: "gpt-5.1",
      fallbackModels: ["gpt-5-mini"],
      input: [{ role: "user", content: "test" }],
      schemaName: "test_schema",
      schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
      errorLabel: "OpenAI test failed",
      timeoutMs: 10,
      maxAttempts: 1
    }),
    /OpenAI test failed: gpt-5\.1: OpenAI test failed: 400/
  );

  assert.deepEqual(requestedModels, ["gpt-5.1"]);
});

test("runStructuredOutput stops immediately on insufficient quota", async () => {
  const requestedModels = [];
  const progressEvents = [];
  await assert.rejects(
    runStructuredOutput({
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        requestedModels.push(body.model);
        return jsonResponse({
          error: {
            message: "You exceeded your current quota, please check your plan and billing details.",
            type: "insufficient_quota",
            code: "insufficient_quota"
          }
        }, false, 429);
      },
      url: "https://api.openai.com/v1/responses",
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      fallbackModels: ["gpt-5-mini", "gpt-4.1-mini"],
      input: [{ role: "user", content: "test" }],
      schemaName: "test_schema",
      schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
      errorLabel: "OpenAI test failed",
      timeoutMs: 10,
      maxAttempts: 3,
      onProgress: (event) => progressEvents.push(event)
    }),
    /insufficient_quota/
  );

  assert.deepEqual(requestedModels, ["gpt-5.4-mini"]);
  assert.deepEqual(progressEvents.map((event) => event.event), [
    "request.start",
    "request.error"
  ]);
});

test("isOpenAiInsufficientQuotaError detects quota exhaustion messages", () => {
  assert.equal(isOpenAiInsufficientQuotaError(new Error("429 insufficient_quota")), true);
  assert.equal(isOpenAiInsufficientQuotaError(new Error("429 rate_limit_exceeded")), false);
});

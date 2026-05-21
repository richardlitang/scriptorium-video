import assert from "node:assert/strict";
import { test } from "node:test";
import { parseModelFallbacks, runStructuredOutput } from "../lib/openai-structured-output.mjs";

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
    maxAttempts: 1
  });

  assert.deepEqual(requestedModels, ["gpt-5.1", "gpt-5-mini"]);
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

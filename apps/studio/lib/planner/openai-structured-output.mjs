export function extractResponseText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not include output text.");
}

export function parseModelFallbacks(value) {
  return String(value || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueModelSequence(model, fallbackModels = []) {
  const seen = new Set();
  return [model, ...fallbackModels].filter((entry) => {
    const value = String(entry || "").trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function errorCause(error, timeoutMs) {
  return error?.name === "AbortError"
    ? `request timed out after ${timeoutMs}ms`
    : String(error?.message || error);
}

export function isOpenAiInsufficientQuotaError(error) {
  const message = String(error?.message || error || "");
  return /insufficient_quota|exceeded your current quota|check your plan and billing details/i.test(
    message,
  );
}

function isRetriableOpenAiError(error, timeoutMs) {
  if (isOpenAiInsufficientQuotaError(error)) return false;
  const cause = errorCause(error, timeoutMs);
  return (
    error?.name === "AbortError" ||
    /fetch failed|network|timed out|econn|enotfound|eai_again|429|500|502|503|504/i.test(cause)
  );
}

function textLength(value) {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((total, entry) => total + textLength(entry), 0);
  if (value && typeof value === "object") return textLength(Object.values(value));
  return 0;
}

function approxTokens(chars) {
  return Math.ceil(Number(chars || 0) / 4);
}

export async function runStructuredOutput({
  fetchImpl = fetch,
  url,
  apiKey,
  model,
  input,
  schemaName,
  schema,
  errorLabel,
  timeoutMs = 90000,
  maxAttempts = 3,
  fallbackModels = [],
  onProgress,
}) {
  const buildPayload = (currentModel) =>
    JSON.stringify({
      model: currentModel,
      input,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    });
  const inputChars = textLength(input);
  const schemaChars = JSON.stringify(schema).length;
  const models = uniqueModelSequence(model, fallbackModels);
  const failures = [];
  const attempts = Math.max(1, Number.isFinite(maxAttempts) ? maxAttempts : 3);
  for (const currentModel of models) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
      let heartbeat = null;
      try {
        const payload = buildPayload(currentModel);
        const payloadChars = payload.length;
        await onProgress?.({
          event: "request.start",
          model: currentModel,
          attempt,
          attempts,
          modelIndex: models.indexOf(currentModel) + 1,
          modelCount: models.length,
          elapsedMs: 0,
          timeoutMs,
          payloadChars,
          approxPayloadTokens: approxTokens(payloadChars),
          inputChars,
          approxInputTokens: approxTokens(inputChars),
          schemaChars,
          approxSchemaTokens: approxTokens(schemaChars),
        });
        heartbeat = setInterval(() => {
          onProgress?.({
            event: "request.heartbeat",
            model: currentModel,
            attempt,
            attempts,
            modelIndex: models.indexOf(currentModel) + 1,
            modelCount: models.length,
            elapsedMs: Date.now() - startedAt,
            timeoutMs,
          });
        }, 10000);
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          signal: controller.signal,
          body: payload,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`${errorLabel}: ${response.status} ${body.slice(0, 300)}`);
        }
        const responseJson = await response.json();
        await onProgress?.({
          event: "request.response",
          model: currentModel,
          attempt,
          attempts,
          modelIndex: models.indexOf(currentModel) + 1,
          modelCount: models.length,
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
        });
        const parsed = JSON.parse(extractResponseText(responseJson));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.defineProperty(parsed, "__model", {
            value: currentModel,
            enumerable: false,
          });
        }
        return parsed;
      } catch (error) {
        lastError = error;
        const retriable = isRetriableOpenAiError(error, timeoutMs);
        await onProgress?.({
          event: retriable ? "request.retryable_error" : "request.error",
          model: currentModel,
          attempt,
          attempts,
          modelIndex: models.indexOf(currentModel) + 1,
          modelCount: models.length,
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
          message: errorCause(error, timeoutMs),
        });
        if (!retriable || attempt >= attempts) break;
        await sleep(300 * attempt);
      } finally {
        clearTimeout(timer);
        if (heartbeat) clearInterval(heartbeat);
      }
    }
    const cause = errorCause(lastError, timeoutMs);
    failures.push(`${currentModel}: ${cause}`);
    if (!isRetriableOpenAiError(lastError, timeoutMs)) break;
  }
  throw new Error(
    `${errorLabel}: ${failures.join(" | ")}. URL=${url}. ` +
      "Check internet connectivity, OPENAI_API_KEY validity, and endpoint reachability.",
  );
}

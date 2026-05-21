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

function isRetriableOpenAiError(error, timeoutMs) {
  const cause = errorCause(error, timeoutMs);
  return error?.name === "AbortError" ||
    /fetch failed|network|timed out|econn|enotfound|eai_again|429|500|502|503|504/i.test(cause);
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
  timeoutMs = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 90000),
  maxAttempts = Number(process.env.OPENAI_REQUEST_MAX_ATTEMPTS ?? 3),
  fallbackModels = parseModelFallbacks(process.env.OPENAI_STRUCTURED_OUTPUT_FALLBACK_MODELS)
}) {
  const buildPayload = (currentModel) => JSON.stringify({
    model: currentModel,
    input,
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    }
  });
  const models = uniqueModelSequence(model, fallbackModels);
  const failures = [];
  const attempts = Math.max(1, Number.isFinite(maxAttempts) ? maxAttempts : 3);
  for (const currentModel of models) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          signal: controller.signal,
          body: buildPayload(currentModel)
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`${errorLabel}: ${response.status} ${body.slice(0, 300)}`);
        }
        return JSON.parse(extractResponseText(await response.json()));
      } catch (error) {
        lastError = error;
        const retriable = isRetriableOpenAiError(error, timeoutMs);
        if (!retriable || attempt >= attempts) break;
        await sleep(300 * attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    const cause = errorCause(lastError, timeoutMs);
    failures.push(`${currentModel}: ${cause}`);
    if (!isRetriableOpenAiError(lastError, timeoutMs)) break;
  }
  throw new Error(
    `${errorLabel}: ${failures.join(" | ")}. URL=${url}. ` +
    "Check internet connectivity, OPENAI_API_KEY validity, and endpoint reachability."
  );
}

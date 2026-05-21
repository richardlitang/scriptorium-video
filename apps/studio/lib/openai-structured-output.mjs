export function extractResponseText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not include output text.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  maxAttempts = Number(process.env.OPENAI_REQUEST_MAX_ATTEMPTS ?? 3)
}) {
  const payload = JSON.stringify({
    model,
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
  let lastError = null;
  const attempts = Math.max(1, Number.isFinite(maxAttempts) ? maxAttempts : 3);
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
        body: payload
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`${errorLabel}: ${response.status} ${body.slice(0, 300)}`);
      }
      return JSON.parse(extractResponseText(await response.json()));
    } catch (error) {
      lastError = error;
      const retriable =
        error?.name === "AbortError" ||
        /fetch failed|network|timed out|econn|enotfound|eai_again/i.test(String(error?.message || error));
      if (!retriable || attempt >= attempts) {
        const cause = error?.name === "AbortError"
          ? `request timed out after ${timeoutMs}ms`
          : String(error?.message || error);
        throw new Error(
          `${errorLabel}: ${cause}. URL=${url}. ` +
          "Check internet connectivity, OPENAI_API_KEY validity, and endpoint reachability."
        );
      }
      await sleep(300 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${errorLabel}: ${String(lastError?.message || lastError || "unknown error")}`);
}

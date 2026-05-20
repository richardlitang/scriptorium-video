export function extractResponseText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not include output text.");
}

export async function runStructuredOutput({
  fetchImpl = fetch,
  url,
  apiKey,
  model,
  input,
  schemaName,
  schema,
  errorLabel
}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
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
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${errorLabel}: ${response.status} ${body.slice(0, 300)}`);
  }
  return JSON.parse(extractResponseText(await response.json()));
}

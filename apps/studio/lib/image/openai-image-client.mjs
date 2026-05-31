export function createOpenAiImageClient({
  fetchImpl = fetch,
  getOpenAiApiKey,
  openAiImagesUrl,
  openAiImageModel,
}) {
  if (typeof getOpenAiApiKey !== "function") {
    throw new Error("createOpenAiImageClient requires getOpenAiApiKey function.");
  }
  if (!openAiImagesUrl) {
    throw new Error("createOpenAiImageClient requires openAiImagesUrl.");
  }
  if (!openAiImageModel) {
    throw new Error("createOpenAiImageClient requires openAiImageModel.");
  }

  return async function generateImageWithOpenAi({ prompt, size, quality, timeoutMs = 90_000 }) {
    const apiKey = await getOpenAiApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(openAiImagesUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: openAiImageModel,
          prompt,
          size,
          quality,
          n: 1,
        }),
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`OpenAI image request timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI image request failed: ${response.status} ${body.slice(0, 500)}`);
    }
    const json = await response.json();
    const image = json.data?.[0];
    if (image?.b64_json) {
      return { bytes: Buffer.from(image.b64_json, "base64"), model: openAiImageModel };
    }
    if (image?.url) {
      const imageResponse = await fetchImpl(image.url);
      if (!imageResponse.ok)
        throw new Error(`OpenAI image URL fetch failed: ${imageResponse.status}`);
      return { bytes: Buffer.from(await imageResponse.arrayBuffer()), model: openAiImageModel };
    }
    throw new Error("OpenAI image response did not include image data.");
  };
}

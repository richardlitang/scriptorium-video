export function createOpenAiImageClient({
  fetchImpl = fetch,
  getOpenAiApiKey,
  openAiImagesUrl,
  openAiImageEditsUrl,
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

  function imageFromResponse(json) {
    const image = json.data?.[0];
    if (image?.b64_json) {
      return { b64: image.b64_json, url: undefined };
    }
    if (image?.url) {
      return { b64: undefined, url: image.url };
    }
    return { b64: undefined, url: undefined };
  }

  async function readImageBytes(image, headers) {
    if (image.b64) return Buffer.from(image.b64, "base64");
    if (image.url) {
      const imageResponse = await fetchImpl(image.url, { headers });
      if (!imageResponse.ok) {
        throw new Error(`OpenAI image URL fetch failed: ${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }
    throw new Error("OpenAI image response did not include image data.");
  }

  async function postWithTimeout(url, init, timeoutMs, label) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`OpenAI ${label} request failed: ${response.status} ${body.slice(0, 500)}`);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(
          `OpenAI ${label} request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function generateImageWithOpenAi({ prompt, size, quality, timeoutMs = 90_000 }) {
    const apiKey = await getOpenAiApiKey();
    const json = await postWithTimeout(
      openAiImagesUrl,
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: openAiImageModel, prompt, size, quality, n: 1 }),
      },
      timeoutMs,
      "image",
    );
    const bytes = await readImageBytes(imageFromResponse(json));
    return { bytes, model: openAiImageModel };
  }

  async function editImageWithOpenAi({ prompt, images, size, quality, timeoutMs = 120_000 }) {
    if (!openAiImageEditsUrl) {
      throw new Error("createOpenAiImageClient requires openAiImageEditsUrl for edits.");
    }
    const refs = Array.isArray(images) ? images.filter((i) => i?.bytes) : [];
    if (refs.length === 0) {
      throw new Error("editImageWithOpenAi requires at least one reference image.");
    }
    const apiKey = await getOpenAiApiKey();
    const form = new FormData();
    form.append("model", openAiImageModel);
    form.append("prompt", prompt);
    if (size) form.append("size", size);
    if (quality) form.append("quality", quality);
    form.append("n", "1");
    refs.forEach((ref, index) => {
      form.append(
        "image[]",
        new Blob([ref.bytes], { type: "image/png" }),
        ref.filename || `reference-${index}.png`,
      );
    });
    const json = await postWithTimeout(
      openAiImageEditsUrl,
      { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form },
      timeoutMs,
      "image edit",
    );
    const bytes = await readImageBytes(imageFromResponse(json), {
      authorization: `Bearer ${apiKey}`,
    });
    return { bytes, model: openAiImageModel };
  }

  return { generateImageWithOpenAi, editImageWithOpenAi };
}

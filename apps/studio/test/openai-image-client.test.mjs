import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAiImageClient } from "../lib/image/openai-image-client.mjs";

test("openai image client returns bytes from base64 payload", async () => {
  const { generateImageWithOpenAi } = createOpenAiImageClient({
    getOpenAiApiKey: async () => "test-key",
    openAiImagesUrl: "https://example.invalid/images",
    openAiImageModel: "gpt-image-2",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from("hello").toString("base64") }],
      }),
    }),
  });

  const result = await generateImageWithOpenAi({ prompt: "p", size: "1024x1024", quality: "low" });
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.bytes.toString("utf8"), "hello");
});

test("openai image client fetches image bytes from URL payload", async () => {
  let callCount = 0;
  const { generateImageWithOpenAi } = createOpenAiImageClient({
    getOpenAiApiKey: async () => "test-key",
    openAiImagesUrl: "https://example.invalid/images",
    openAiImageModel: "gpt-image-2",
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({ data: [{ url: "https://example.invalid/image.png" }] }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from("image-bytes"),
      };
    },
  });

  const result = await generateImageWithOpenAi({ prompt: "p", size: "1024x1024", quality: "low" });
  assert.equal(result.bytes.toString("utf8"), "image-bytes");
  assert.equal(callCount, 2);
});

test("openai image client surfaces timeout as actionable error", async () => {
  const { generateImageWithOpenAi } = createOpenAiImageClient({
    getOpenAiApiKey: async () => "test-key",
    openAiImagesUrl: "https://example.invalid/images",
    openAiImageModel: "gpt-image-2",
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });

  await assert.rejects(
    () =>
      generateImageWithOpenAi({ prompt: "p", size: "1024x1024", quality: "low", timeoutMs: 1000 }),
    /OpenAI image request timed out after 1s/,
  );
});

test("editImageWithOpenAi posts multipart to the edits URL with image parts", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from("editbytes").toString("base64") }] }),
    };
  };
  const { editImageWithOpenAi } = createOpenAiImageClient({
    fetchImpl,
    getOpenAiApiKey: async () => "key",
    openAiImagesUrl: "https://api.openai.com/v1/images/generations",
    openAiImageEditsUrl: "https://api.openai.com/v1/images/edits",
    openAiImageModel: "gpt-image-2",
  });
  const result = await editImageWithOpenAi({
    prompt: "Mara at the inn",
    images: [{ bytes: Buffer.from("ref1"), filename: "c1.png" }],
    size: "1024x1536",
    quality: "low",
  });
  assert.equal(captured.url, "https://api.openai.com/v1/images/edits");
  assert.equal(captured.init.method, "POST");
  assert.ok(captured.init.body instanceof FormData, "body must be FormData");
  assert.equal(captured.init.headers.authorization, "Bearer key");
  // content-type must NOT be hand-set (fetch sets the multipart boundary)
  assert.equal(captured.init.headers["content-type"], undefined);
  assert.equal(result.bytes.toString(), "editbytes");
  assert.equal(result.model, "gpt-image-2");
});

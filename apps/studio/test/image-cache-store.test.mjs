import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageCacheStore } from "../lib/image/image-cache-store.mjs";

test("image cache store reads and sorts image history newest-first", async () => {
  const store = createImageCacheStore({
    path: {
      join: (...parts) => parts.join("/"),
      basename: (name, suffix) => name.replace(suffix, ""),
      resolve: (...parts) => parts.join("/"),
      dirname: () => "/x",
    },
    rootDir: "/repo",
    imageHistoryDir: "/repo/.studio-data/image-history",
    imageCachePath: "/repo/.studio-data/image-cache.ndjson",
    imageLibraryDir: "/repo/.studio-data/image-library",
    imageReuseKey: () => "key",
    imageDescriptionFromPrompt: () => "desc",
    imageTagsFromPrompt: () => [],
    sha256: () => "hash",
    safeReadJson: async () => ({}),
    readFile: async (file) => {
      if (file.endsWith("demo.ndjson")) {
        return `${JSON.stringify({ generatedAt: "2026-01-01T00:00:00Z" })}\n${JSON.stringify({ generatedAt: "2026-01-02T00:00:00Z" })}\n`;
      }
      return "";
    },
    readdir: async () => [],
    stat: async () => null,
    appendFile: async () => {},
    mkdir: async () => {},
    writeFile: async () => {},
  });

  const entries = await store.readImageHistory("demo");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].generatedAt, "2026-01-02T00:00:00Z");
  assert.equal(entries[1].generatedAt, "2026-01-01T00:00:00Z");
});

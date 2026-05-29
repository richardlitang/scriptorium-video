import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const studioDir = path.resolve(testDir, "..");

// Stable contracts in the React SPA entry point (web/index.html).
// Renaming or removing an id here requires updating all consumers.
const REQUIRED_IDS = [
  "root", // React mount point — must match createRoot() call in web/src/main.tsx
];

test("studio web/index.html exposes the React mount point", async () => {
  const html = await readFile(path.join(studioDir, "web", "index.html"), "utf8");
  for (const id of REQUIRED_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

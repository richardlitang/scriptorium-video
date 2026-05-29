import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../../..");
const scannedDirs = ["apps", "packages"];
const ignoredPathParts = new Set(["dist", "node_modules", "test"]);
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredPathParts.has(entry.name)) continue;
      files.push(...(await sourceFiles(fullPath)));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function envKeysFromSource(source) {
  const keys = new Set();
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    keys.add(match[1]);
  }
  return keys;
}

function envKeysFromExample(source) {
  const keys = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

test(".env.example documents statically referenced environment variables", async () => {
  const files = (
    await Promise.all(scannedDirs.map((dir) => sourceFiles(path.join(rootDir, dir))))
  ).flat();
  const referenced = new Set();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const key of envKeysFromSource(source)) {
      referenced.add(key);
    }
  }

  const example = envKeysFromExample(await readFile(path.join(rootDir, ".env.example"), "utf8"));
  const missing = [...referenced].filter((key) => !example.has(key)).sort();

  assert.deepEqual(missing, []);
});

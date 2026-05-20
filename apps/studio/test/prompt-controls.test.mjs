import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("Studio input panel exposes separated planner prompt controls", async () => {
  const html = await readFile(path.resolve("apps/studio/public/index.html"), "utf8");
  assert.match(html, /id="story-system-prompt"/);
  assert.match(html, /id="story-user-prompt-template"/);
  assert.match(html, /id="reset-prompt-defaults-btn"/);
});

test("Studio app wires planner prompt controls into requests", async () => {
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  assert.match(appJs, /systemPrompt:\s*storySystemPrompt\.value/);
  assert.match(appJs, /userPromptTemplate:\s*storyUserPromptTemplate\.value/);
});


import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("Studio input panel exposes separated planner prompt controls", async () => {
  const html = await readFile(path.resolve("apps/studio/public/index.html"), "utf8");
  assert.match(html, /id="story-feel-custom"/);
  assert.match(html, /id="story-pacing-custom"/);
  assert.match(html, /id="story-visual-style-custom"/);
  assert.match(html, /id="story-system-prompt"/);
  assert.match(html, /id="story-user-prompt-template"/);
  assert.match(html, /id="reset-prompt-defaults-btn"/);
});

test("Studio app wires planner prompt controls into requests", async () => {
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  assert.match(appJs, /function currentStoryDirection\(\)/);
  assert.match(appJs, /resolvedStorySetting\(storyFeel, storyFeelCustom\)/);
  assert.match(appJs, /systemPrompt:\s*storySystemPrompt\.value/);
  assert.match(appJs, /userPromptTemplate:\s*storyUserPromptTemplate\.value/);
});

test("planner prompt tells the model creative controls govern every beat", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /Treat Feel, Pacing, and Visual style as creative direction for every beat/);
});

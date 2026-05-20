import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("Studio input panel exposes creative controls and hides planner prompts behind advanced override", async () => {
  const html = await readFile(path.resolve("apps/studio/public/index.html"), "utf8");
  assert.match(html, /id="story-feel"/);
  assert.match(html, /id="story-pacing"/);
  assert.match(html, /id="story-visual-style"/);
  assert.match(html, /AI planner prompt override/);
  assert.match(html, /id="story-system-prompt"/);
  assert.match(html, /id="story-user-prompt-template"/);
  assert.match(html, /id="reset-prompt-defaults-btn"/);
  assert.doesNotMatch(html, /System Prompt \(generic, highest priority\)/);
  assert.doesNotMatch(html, /User Prompt Template \(editable defaults/);
  assert.match(html, /Photo density/);
  assert.match(html, /value="balanced">Balanced key moments/);
});

test("Studio app wires planner prompt controls into requests", async () => {
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  assert.match(appJs, /function currentStoryDirection\(\)/);
  assert.match(appJs, /feel:\s*storyFeel\.value\.trim\(\)/);
  assert.match(appJs, /pacing:\s*storyPacing\.value\.trim\(\)/);
  assert.match(appJs, /visualStyle:\s*storyVisualStyle\.value\.trim\(\)/);
  assert.match(appJs, /systemPrompt:\s*storySystemPrompt\.value/);
  assert.match(appJs, /userPromptTemplate:\s*storyUserPromptTemplate\.value/);
  assert.match(appJs, /function imageCoverageLabel\(coverage\)/);
  assert.match(appJs, /imageCoverage:\s*normalizeImageCoverage\(imageBudget\.value\)/);
});

test("Make Draft preserves pasted story through implicit project creation", async () => {
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  assert.match(appJs, /const pendingStory = storyInput\.value;/);
  assert.match(appJs, /createProjectFromTitle\(projectTitleFromStory\(pendingStory\)\)/);
  assert.match(appJs, /applyPendingStoryState\(pendingStory, pendingUiState, projectId\)/);
  assert.match(appJs, /story:\s*pendingStory/);
  assert.match(appJs, /writeStored\(selectedProjectId, "lastDraftStory", pendingStory\)/);
});

test("New Project starts with blank project-scoped UI state", async () => {
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  assert.match(appJs, /const title = prompt\("Project title\?", "Untitled Story"\)/);
  assert.match(appJs, /function resetProjectScopedRuntimeState\(\)/);
  assert.match(appJs, /hideJobBanner\(\)/);
  assert.match(appJs, /storyInput\.value = readStored\(projectId, "story"\)/);
  assert.match(appJs, /storyFeel\.value = readStored\(projectId, "feel", ""\)/);
  assert.match(appJs, /storyPacing\.value = readStored\(projectId, "pacing", ""\)/);
  assert.match(appJs, /storyVisualStyle\.value = readStored\(projectId, "visualStyle", ""\)/);
  assert.doesNotMatch(appJs, /const pendingStory = storyInput\.value;\n\s*const pendingUiState = \{/);
});

test("Studio app does not redeclare visual asset helpers", async () => {
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  assert.equal((appJs.match(/function visualAssetForBeat\(/g) ?? []).length, 1);
  assert.equal((appJs.match(/function ownedVisualAssetForBeat\(/g) ?? []).length, 1);
});

test("planner prompt tells the model creative controls govern every beat", async () => {
  const draftOrchestrator = await readFile(path.resolve("apps/studio/lib/plan-draft-orchestrator.mjs"), "utf8");
  assert.match(draftOrchestrator, /Treat Feel, Pacing, and Visual style as creative direction for every beat/);
  assert.match(draftOrchestrator, /Do not introduce contradictory visual media, realism levels, or style directions/);
  assert.match(draftOrchestrator, /Decide sparse editorial timing: visualEditCues, silenceWindows, and endingPolicy/);
  assert.match(draftOrchestrator, /target next_visual for early visual changes/);
});

test("planner prompt defines section and beat segmentation rules", async () => {
  const draftOrchestrator = await readFile(path.resolve("apps/studio/lib/plan-draft-orchestrator.mjs"), "utf8");
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");

  for (const source of [draftOrchestrator, appJs]) {
    assert.match(source, /deliberate section and beat segmentation/);
    assert.match(source, /A section is a coherent narrative arc, setting\/time shift, or major topic turn/);
    assert.match(source, /A beat is an edit unit: one visual moment plus one spoken thought/);
    assert.match(source, /prefer beats around 2-6 seconds and roughly 6-20 spoken words/);
    assert.match(source, /pause is needed before a specific word or phrase inside a sentence/);
    assert.match(source, /split into adjacent beats at that anchor and put pauseBeforeSeconds on the second beat/);
    assert.match(source, /Do not create one-word beats unless that single word is intentionally the reveal or punchline/);
  }
});

test("code-owned visual prompts stay style-neutral and defer to UI direction", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  const draftOrchestrator = await readFile(path.resolve("apps/studio/lib/plan-draft-orchestrator.mjs"), "utf8");
  const appJs = await readFile(path.resolve("apps/studio/public/app.js"), "utf8");
  const codePrompts = [server, draftOrchestrator, appJs].join("\n");
  const realismToken = "photo" + "realistic";
  const styleSpecificTokens = [
    "stylized " + "animated",
    "eerie " + "animated",
    "slow" + "-burn",
    "real " + "camera",
    "atmospheric " + "indie thriller",
    "glossy " + "AI fantasy"
  ];

  assert.doesNotMatch(codePrompts, new RegExp(realismToken));
  for (const token of styleSpecificTokens) {
    assert.doesNotMatch(codePrompts, new RegExp(token));
  }
  assert.match(server, /function imageVisualDirection\(plan, section\)/);
  assert.match(server, /Project visual style: \$\{projectCreative\.visualStyle\}/);
  assert.match(server, /Follow the visual direction exactly/);
  assert.match(server, /visualStyle: body\.visualStyle \?\? ""/);
});

test("OpenAI planner schema satisfies strict required-property rules", async () => {
  const draftOrchestrator = await readFile(path.resolve("apps/studio/lib/plan-draft-orchestrator.mjs"), "utf8");
  assert.match(draftOrchestrator, /required: \["title", "feel", "pacing", "visualStyle", "captionTuning", "voice", "visualBible", "sections", "warnings"\]/);
  assert.match(draftOrchestrator, /required: \["targetMaxWords", "hardMaxWords", "targetMaxDurationSeconds", "hardMaxDurationSeconds", "minWordsBeforeSentenceBreak"\]/);
  assert.match(draftOrchestrator, /minWordsBeforeSentenceBreak: \{ type: "number", minimum: 2, maximum: 20 \}/);
  assert.match(draftOrchestrator, /required: \["title", "summary", "purpose", "feel", "pacing", "visualStyle", "beats"\]/);
  assert.match(draftOrchestrator, /required: \["narration", "visualPrompt", "estimatedDurationSeconds", "motion", "emphasis", "notes", "voiceProfile", "intensity", "pauseBeforeSeconds", "pauseAfterSeconds", "deliveryNote", "speedMultiplier", "pitchOffset", "voiceConfidence", "narrationLanguage", "ttsProvider", "visualConfidence", "captionStyle", "shotType", "cameraDistance", "lighting", "lens", "composition", "subjectContinuity", "negativePromptAdditions", "sfxCues", "visualEditCues", "silenceWindows", "endingPolicy"\]/);
  assert.match(draftOrchestrator, /required: \["id", "kind", "placement", "offsetSeconds", "levelDb", "pan", "proximity", "duckMusic"\]/);
  assert.match(draftOrchestrator, /ttsProvider: \{ type: "string", enum: \["chatterbox", "mms", "openai"\] \}/);
});

test("renderer applies planner visual edit cues to media selection and effects", async () => {
  const verticalTemplate = await readFile(path.resolve("apps/renderer/src/templates/VerticalStoryTemplate.tsx"), "utf8");
  const documentaryTemplate = await readFile(path.resolve("apps/renderer/src/templates/DocumentaryLongformTemplate.tsx"), "utf8");
  const runtime = await readFile(path.resolve("apps/renderer/src/templates/editorial-runtime.ts"), "utf8");

  for (const source of [verticalTemplate, documentaryTemplate]) {
    assert.match(source, /activeVisualCueAt\(timeSeconds, visualEditCues\)/);
    assert.match(source, /activeVisualCue\?\.target === "next_visual"/);
    assert.match(source, /visualCueStyle\(activeVisualCue, timeSeconds\)/);
  }
  assert.match(runtime, /export function activeVisualCueAt/);
  assert.match(runtime, /cue\.target !== "black"/);
  assert.match(runtime, /cue\.type === "push_in"/);
  assert.match(runtime, /cue\.type === "smash_cut" \|\| cue\.type === "hard_cut" \|\| cue\.type === "match_cut"/);
});

test("studio draft jobs expose beat-level narration status and use planner TTS routing", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /function ttsProviderForBeat\(defaultProvider, beat\)/);
  assert.match(server, /function draftAudioStepCount\(plan\)/);
  assert.match(server, /beat\.voiceDirection\?\.ttsProvider/);
  assert.doesNotMatch(server, /function tagalogScore/);
  assert.match(server, /Narration: \$\{section\.title\} · \$\{beat\.order\}\/\$\{section\.beats\?\.length \?\? 1\} · \$\{beat\.id\}/);
  assert.match(server, /Narration: \$\{beatRefs\.length\} beat\(s\) · \$\{provider\}/);
  assert.match(server, /"--only-beat", beat\.id/);
});

test("studio draft endpoint rejects empty story with scaffold placeholder plan", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /function isScaffoldPlaceholderPlan\(plan\)/);
  assert.match(server, /replace this narration with your first beat\./);
  assert.match(server, /Make Draft needs story text or a saved plan with real narration/);
});

test("studio clamps planner caption tuning to video-plan schema bounds", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /const normalizeCaptionTuning = \(tuning = \{\}\) => \(\{/);
  assert.match(server, /minWordsBeforeSentenceBreak: clampInteger\(tuning\.minWordsBeforeSentenceBreak, 3, 2, 20\)/);
  assert.match(server, /const captionTuning = normalizeCaptionTuning\(draft\.captionTuning \|\| \{\}\)/);
  assert.match(server, /tuning: captionTuning/);
});

test("studio uses an LLM orchestrator to map missing TTS routing metadata", async () => {
  const ttsOrchestrator = await readFile(path.resolve("apps/studio/lib/tts-routing-orchestrator.mjs"), "utf8");
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(ttsOrchestrator, /export function planNeedsTtsRouting\(plan\)/);
  assert.match(ttsOrchestrator, /return async function routePlanTtsWithOpenAi\(plan\)/);
  assert.match(ttsOrchestrator, /schemaName: "tts_routing_map"/);
  assert.match(ttsOrchestrator, /Do not infer from character names alone/);
  assert.match(server, /Mapping narration language and TTS provider/);
});

test("studio run state prefers latest draft progress over completed image progress", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  assert.match(server, /function jobSortTime\(job\)/);
  assert.match(server, /trimmed\.find\(\(job\) => job\.kind === "draft_job"\)/);
});

test("studio draft jobs write structured operational traces", async () => {
  const server = await readFile(path.resolve("apps/studio/server.mjs"), "utf8");
  const jobCenter = await readFile(path.resolve("apps/studio/public/modules/job-center.js"), "utf8");
  assert.match(server, /const runTracesDir = path\.join\(rootDir, "\.studio-data", "run-traces"\)/);
  assert.match(server, /function summarizeStoryInput\(story\)/);
  assert.match(server, /function directiveCandidateLines\(story\)/);
  assert.match(server, /function summarizePlanForTrace\(plan, story = ""\)/);
  assert.match(server, /function summarizeTimelineForTrace\(timeline, manifest\)/);
  assert.match(server, /function summarizeVoiceSettingsForTrace\(settings\)/);
  assert.match(server, /appendRunTrace\(projectId, job\.id, "images\.targets_selected"/);
  assert.match(server, /appendRunTrace\(projectId, job\.id, "render\.start"/);
  assert.match(server, /readRunTrace\(projectId, jobId\)/);
  assert.match(server, /pathname\.includes\("\/jobs\/"\) && pathname\.endsWith\("\/trace"\)/);
  assert.match(jobCenter, /View Trace/);
  assert.match(jobCenter, /fetchTrace\(job\)/);
});

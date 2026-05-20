import { createJobCenterController } from "./modules/job-center.js";
import { createBeatWorkspaceController } from "./modules/beat-workspace.js";
import { createVoiceSettingsController } from "./modules/voice-settings-ui.js";
import {
  createReviewController
} from "./modules/workspace.js";

const projectList = document.getElementById("project-list");
const newProjectBtn = document.getElementById("new-project-btn");
const projectTitle = document.getElementById("project-title");
const projectMeta = document.getElementById("project-meta");
const planEditor = document.getElementById("plan-editor");
const timelineOutput = document.getElementById("timeline-output");
const captionsOutput = document.getElementById("captions-output");
const qualityOutput = document.getElementById("quality-output");
const qualityHistoryOutput = document.getElementById("quality-history-output");
const renderBtn = document.getElementById("render-btn");
const stopRunBtn = document.getElementById("stop-run-btn");
const ttsHealthPill = document.getElementById("tts-health-pill");
const ttsHealthDetail = document.getElementById("tts-health-detail");
const jobBanner = document.getElementById("job-banner");
const jobBannerTitle = document.getElementById("job-banner-title");
const jobBannerDetail = document.getElementById("job-banner-detail");
const jobBannerDismiss = document.getElementById("job-banner-dismiss");
const jobCenterList = document.getElementById("job-center-list");
const voiceSettingsBtn = document.getElementById("voice-settings-btn");
const directVoiceBtn = document.getElementById("direct-voice-btn");
const regenerateAudioBtn = document.getElementById("regenerate-audio-btn");
const voiceSettingsDialog = document.getElementById("voice-settings-dialog");
const voiceSettingsForm = document.getElementById("voice-settings-form");
const voiceSettingsClose = document.getElementById("voice-settings-close");
const voiceTtsModel = document.getElementById("voice-tts-model");
const voiceAudioPromptPath = document.getElementById("voice-audio-prompt-path");
const voiceDeliveryProfile = document.getElementById("voice-delivery-profile");
const voiceIntensity = document.getElementById("voice-intensity");
const voiceStability = document.getElementById("voice-stability");
const voiceVariation = document.getElementById("voice-variation");
const voicePacing = document.getElementById("voice-pacing");
const voiceIntensityValue = document.getElementById("voice-intensity-value");
const voiceStabilityValue = document.getElementById("voice-stability-value");
const voiceVariationValue = document.getElementById("voice-variation-value");
const voicePacingValue = document.getElementById("voice-pacing-value");
const voicePickReferenceBtn = document.getElementById("voice-pick-reference");
const voiceClearReferenceBtn = document.getElementById("voice-clear-reference");
const voiceReferenceFile = document.getElementById("voice-reference-file");
const voiceExaggeration = document.getElementById("voice-exaggeration");
const voiceCfgWeight = document.getElementById("voice-cfg-weight");
const voiceTemperature = document.getElementById("voice-temperature");
const voiceSeed = document.getElementById("voice-seed");
const voiceExaggerationValue = document.getElementById("voice-exaggeration-value");
const voiceCfgWeightValue = document.getElementById("voice-cfg-weight-value");
const voiceTemperatureValue = document.getElementById("voice-temperature-value");
const voiceSettingsStatus = document.getElementById("voice-settings-status");
const voicePreviewABtn = document.getElementById("voice-preview-a");
const voicePreviewBBtn = document.getElementById("voice-preview-b");
const voicePreviewLineAInput = document.getElementById("voice-preview-line-a");
const voicePreviewLineBInput = document.getElementById("voice-preview-line-b");
const voicePreviewAudio = document.getElementById("voice-preview-audio");
const savePlanBtn = document.getElementById("save-plan-btn");
const prepareDraftBtn = document.getElementById("prepare-draft-btn");
const renderDraftBtn = document.getElementById("render-draft-btn");
const generateImagesBtn = document.getElementById("generate-images-btn");
const mediaPreview = document.getElementById("media-preview");
const renderOutput = document.getElementById("render-output");
const storyInput = document.getElementById("story-input");
const convertStoryBtn = document.getElementById("convert-story-btn");
const clearStoryBtn = document.getElementById("clear-story-btn");
const storyFeedback = document.getElementById("story-feedback");
const aiPlanBtn = document.getElementById("ai-plan-btn");
const storyFeel = document.getElementById("story-feel");
const storyPacing = document.getElementById("story-pacing");
const storyVisualStyle = document.getElementById("story-visual-style");
const storySystemPrompt = document.getElementById("story-system-prompt");
const storyUserPromptTemplate = document.getElementById("story-user-prompt-template");
const resetPromptDefaultsBtn = document.getElementById("reset-prompt-defaults-btn");
const imageMode = document.getElementById("image-mode");
const imageBudget = document.getElementById("image-budget");
const imageQuality = document.getElementById("image-quality");
const imageEnabled = document.getElementById("image-enabled");
const beatTimeline = document.getElementById("beat-timeline");
const beatInspector = document.getElementById("beat-inspector");
const reviewList = document.getElementById("review-list");
const reviewFilter = document.getElementById("review-filter");
const reviewRefreshBtn = document.getElementById("review-refresh-btn");

let selectedProjectId = null;
let selectedProjectElement = null;
let hasUnsavedPlan = false;
let needsPrepareDraft = false;
let needsRender = false;
let imageHistory = [];
let currentProjectDetails = null;
let activeRunController = null;
let progressPollTimer = null;
let draftJobPollTimer = null;
let lastSeenDraftJobId = null;
let currentDraftJob = null;
let selectedBeatId = null;
let selectedInspectorTab = "script";
let ttsHealthState = {
  provider: "chatterbox",
  ok: false,
  status: "checking",
  sampleRate: null,
  error: null
};

const DEFAULT_PLANNER_SYSTEM_PROMPT =
  "Convert story prose into a concise video production plan. Preserve wording except light segmentation. Keep visual continuity (character age/look, setting, style) across beats. Use concrete cinematic visuals, avoid generic abstractions, fake text, and continuity drift. Keep voice direction engaged and language-appropriate. Return JSON only.";

const DEFAULT_PLANNER_USER_PROMPT_TEMPLATE = [
  "Story:",
  "{{story}}",
  "",
  "Current title: {{currentTitle}}",
  "Feel: {{feel}}",
  "Pacing: {{pacing}}",
  "Visual style: {{visualStyle}}",
  "Format: {{format}}",
  "Target: {{target}}",
  "",
  "Output requirements:",
  "- Build a reusable visual bible for consistency.",
  "- Produce per-beat narration + image-generation-ready visual prompts.",
  "- For every beat set voiceProfile, intensity, pauseBeforeSeconds, pauseAfterSeconds, deliveryNote, and caption emphasis.",
  "- Also set speedMultiplier and pitchOffset per beat for better delivery control.",
  "- Include voiceConfidence and visualConfidence (0-1). Use conservative defaults when uncertain.",
  "- Provide shot metadata (shotType, cameraDistance, lighting, lens, composition, subjectContinuity, negativePromptAdditions).",
  "- Use pauses around hooks, reveals, and emotional turns. Keep them subtle unless needed.",
  "- Add optional sfxCues only when they improve clarity; keep cues sparse and practical.",
  "- Surface warnings when uncertain or under-specified."
].join("\n");

storySystemPrompt.value = DEFAULT_PLANNER_SYSTEM_PROMPT;
storyUserPromptTemplate.value = DEFAULT_PLANNER_USER_PROMPT_TEMPLATE;

const storageKey = (projectId, key) => `lvstudio:${projectId}:${key}`;

function readStored(projectId, key, fallback = "") {
  return localStorage.getItem(storageKey(projectId, key)) ?? fallback;
}

function writeStored(projectId, key, value) {
  localStorage.setItem(storageKey(projectId, key), value);
}

function saveUiState() {
  if (!selectedProjectId) return;
  writeStored(selectedProjectId, "story", storyInput.value);
  writeStored(selectedProjectId, "feel", storyFeel.value);
  writeStored(selectedProjectId, "pacing", storyPacing.value);
  writeStored(selectedProjectId, "visualStyle", storyVisualStyle.value);
  writeStored(selectedProjectId, "systemPrompt", storySystemPrompt.value);
  writeStored(selectedProjectId, "userPromptTemplate", storyUserPromptTemplate.value);
  writeStored(selectedProjectId, "imageEnabled", imageEnabled.checked ? "true" : "false");
  writeStored(selectedProjectId, "imageMode", imageMode.value);
  writeStored(selectedProjectId, "imageBudget", imageBudget.value);
  writeStored(selectedProjectId, "imageQuality", imageQuality.value);
}

function restoreUiState(projectId) {
  storyInput.value = readStored(projectId, "story");
  storyFeel.value = readStored(projectId, "feel", storyFeel.value);
  storyPacing.value = readStored(projectId, "pacing", storyPacing.value);
  storyVisualStyle.value = readStored(projectId, "visualStyle", storyVisualStyle.value);
  storySystemPrompt.value = readStored(projectId, "systemPrompt", DEFAULT_PLANNER_SYSTEM_PROMPT);
  storyUserPromptTemplate.value = readStored(projectId, "userPromptTemplate", DEFAULT_PLANNER_USER_PROMPT_TEMPLATE);
  imageEnabled.checked = readStored(projectId, "imageEnabled", imageEnabled.checked ? "true" : "false") === "true";
  imageMode.value = readStored(projectId, "imageMode", imageMode.value);
  imageBudget.value = normalizeImageCoverage(readStored(projectId, "imageBudget", imageBudget.value));
  imageQuality.value = readStored(projectId, "imageQuality", imageQuality.value);
  selectedBeatId = readStored(projectId, "selectedBeatId", "");
  voiceSettingsController.restorePreviewLines(projectId);
}

function normalizeImageCoverage(value) {
  return value === "beat" || value === "999" ? "beat" : "section";
}

function fmt(value) {
  return JSON.stringify(value, null, 2);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || "Request did not return JSON." };
  }
  if (!response.ok || !data.ok) {
    throw new Error([
      data.message ?? "Request failed.",
      data.output ? `Output:\n${data.output}` : "",
      data.errors ? `Errors:\n${fmt(data.errors)}` : ""
    ].filter(Boolean).join("\n\n"));
  }
  return data;
}

async function loadProjects() {
  const data = await fetchJson("/api/projects");
  projectList.innerHTML = "";
  let firstProjectElement = null;
  const preferredProjectId = localStorage.getItem("lvstudio:selectedProjectId");
  let preferredProjectElement = null;
  for (const project of data.projects) {
    const el = document.createElement("div");
    el.className = "project-item";
    const info = document.createElement("div");
    info.innerHTML = `<strong>${project.title || project.id}</strong><br/><small>${project.id} · ${project.mode} · ${project.status}</small>`;
    info.onclick = () => selectProject(project.id, el);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "project-delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.title = `Delete ${project.id}`;
    deleteBtn.onclick = async (event) => {
      event.stopPropagation();
      const typed = prompt(`Type ${project.id} to delete "${project.title || project.id}" and all of its files.`);
      if (typed !== project.id) return;
      await fetchJson(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      if (selectedProjectId === project.id) {
        selectedProjectId = null;
        localStorage.removeItem("lvstudio:selectedProjectId");
      }
      await loadProjects();
    };
    el.append(info, deleteBtn);
    projectList.appendChild(el);
    firstProjectElement ??= el;
    if (project.id === preferredProjectId) preferredProjectElement = el;
  }
  const preferredProject = data.projects.find((project) => project.id === preferredProjectId) ?? data.projects[0];
  if (!selectedProjectId && preferredProject) {
    await selectProject(preferredProject.id, preferredProjectElement ?? firstProjectElement);
  }
}

function slugify(value, fallback) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function extractStoryTitle(rawScript, fallbackTitle) {
  return rawScript.match(/^\s*TITLE:\s*(.+)$/im)?.[1].trim() || fallbackTitle;
}

function projectTitleFromStory(rawStory) {
  const explicitTitle = rawStory.match(/^\s*TITLE:\s*(.+)$/im)?.[1].trim();
  if (explicitTitle) return explicitTitle;
  const firstLine = rawStory
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Untitled Story";
  return firstLine.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 80) || "Untitled Story";
}

function extractThumbnailConcept(rawScript) {
  const match = rawScript.match(/^THUMBNAIL CONCEPT:\s*([\s\S]*?)(?=\n\s*\[\d+:\d+\]|\n\s*$)/im);
  return match?.[1].replace(/\s+/g, " ").trim();
}

function normalizeNarration(sectionBody) {
  return sectionBody
    .replace(/\[[\s\S]*?\]/g, " ")
    .replace(/\((?:long\s+)?pause[^)]*\)/gi, " ")
    .replace(/\(deliver[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNarrationParagraphs(sectionBody) {
  return sectionBody
    .replace(/\[[\s\S]*?\]/g, "\n\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\((?:long\s+)?pause[^)]*\)/gi, " ")
        .replace(/\(deliver[^)]*\)/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function estimateDurationSeconds(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Number((words * 0.42).toFixed(1))));
}

function extractDirectives(sectionBody) {
  return [...sectionBody.matchAll(/\[([A-Z][A-Z\s/]*):\s*([\s\S]*?)\]/g)]
    .map((match) => `${match[1].trim()}: ${match[2].replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

function splitStorySections(rawScript) {
  const sectionMatches = [...rawScript.matchAll(/^\s*\[(\d+:\d+)\]\s+(.+)$/gm)];
  return sectionMatches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = sectionMatches[index + 1]?.index ?? rawScript.length;
    return {
      timecode: match[1],
      title: match[2].trim(),
      body: rawScript.slice(start, end).trim()
    };
  });
}

function defaultDraftButtonLabel() {
  return selectedProjectId ? "Make Draft" : "Create Draft";
}

function ttsAvailability() {
  const status = ttsHealthState?.status || "checking";
  if (status === "ready" && ttsHealthState?.ok) return "ready";
  if (status === "no_health_endpoint" && ttsHealthState?.ok) return "ready_degraded";
  if (status === "loading") return "loading";
  if (status === "failed") return "failed";
  if (status === "unreachable") return "unreachable";
  return "checking";
}

function renderTtsHealthPill() {
  if (!ttsHealthPill) return;
  const availability = ttsAvailability();
  ttsHealthPill.className = "status-pill";
  if (ttsHealthDetail) {
    ttsHealthDetail.className = "tts-health-detail";
  }
  if (availability === "ready") {
    ttsHealthPill.classList.add("ok");
    const sampleRateLabel = ttsHealthState.sampleRate ? ` (${ttsHealthState.sampleRate}Hz)` : "";
    ttsHealthPill.textContent = `TTS: ready${sampleRateLabel}`;
    ttsHealthPill.title = "Chatterbox is ready for draft narration.";
    if (ttsHealthDetail) {
      ttsHealthDetail.classList.add("ok");
      ttsHealthDetail.textContent = "Narration service is ready. You can run Make Draft, Regenerate Narration, or Direct Voice now.";
    }
    return;
  }
  if (availability === "ready_degraded") {
    ttsHealthPill.classList.add("warn");
    ttsHealthPill.textContent = "TTS: reachable (no /health)";
    ttsHealthPill.title = "TTS endpoint is reachable but does not expose /health; Studio will proceed optimistically.";
    if (ttsHealthDetail) {
      ttsHealthDetail.classList.add("warn");
      ttsHealthDetail.textContent = "TTS server is reachable, but it does not provide a health endpoint. Draft actions are enabled; if generation fails, verify the speech endpoint configuration.";
    }
    return;
  }
  if (availability === "loading") {
    ttsHealthPill.classList.add("warn");
    ttsHealthPill.textContent = "TTS: warming model...";
    ttsHealthPill.title = "First run downloads/loads the TTS model. Draft actions are paused until ready.";
    if (ttsHealthDetail) {
      ttsHealthDetail.classList.add("warn");
      ttsHealthDetail.textContent = "Model is loading/downloading in the background. This is expected on first run and may take a few minutes. Studio auto-rechecks every 8 seconds.";
    }
    return;
  }
  ttsHealthPill.classList.add("bad");
  if (availability === "checking") {
    ttsHealthPill.textContent = "TTS: checking...";
    ttsHealthPill.title = "Checking Chatterbox status.";
    if (ttsHealthDetail) {
      ttsHealthDetail.classList.add("warn");
      ttsHealthDetail.textContent = "Checking narration service availability. If this stays here for more than ~20 seconds, verify the Chatterbox server process is running.";
    }
  } else {
    ttsHealthPill.textContent = "TTS: unavailable";
    ttsHealthPill.title = ttsHealthState.error || "Chatterbox is unreachable or failed to load.";
    if (ttsHealthDetail) {
      ttsHealthDetail.classList.add("bad");
      const reason = ttsHealthState.error ? `Reason: ${ttsHealthState.error}. ` : "";
      ttsHealthDetail.textContent = `${reason}Start the Chatterbox server, keep this page open, and Studio will enable draft actions automatically once status becomes ready.`;
    }
  }
}

function updateStoryButtons() {
  const hasSelectedProject = Boolean(selectedProjectId);
  const hasStory = storyInput.value.trim().length > 0;
  const draftJobRunning = currentDraftJob && ["queued", "running"].includes(currentDraftJob.status);
  const ttsReady = ttsAvailability() === "ready" || ttsAvailability() === "ready_degraded";
  const ttsWarming = ttsAvailability() === "loading" || ttsAvailability() === "checking";
  convertStoryBtn.disabled = !hasSelectedProject || !hasStory;
  aiPlanBtn.disabled = !hasSelectedProject || !hasStory;
  clearStoryBtn.disabled = !hasStory;
  renderBtn.disabled = !hasStory || draftJobRunning || !ttsReady;
  if (!draftJobRunning) {
    if (!hasStory) renderBtn.textContent = "Paste Story First";
    else if (!ttsReady) renderBtn.textContent = ttsWarming ? "TTS Warming..." : "TTS Unavailable";
    else renderBtn.textContent = defaultDraftButtonLabel();
  }
  voiceSettingsBtn.disabled = false;
  directVoiceBtn.disabled = !hasSelectedProject || !ttsReady;
  regenerateAudioBtn.disabled = !hasSelectedProject || !ttsReady;
  prepareDraftBtn.disabled = !hasSelectedProject || !ttsReady;
}

function syncStoryButtonsSoon() {
  window.setTimeout(updateStoryButtons, 0);
}

function parseStoryInputAsPlan() {
  try {
    const parsed = JSON.parse(storyInput.value);
    if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.sections)) return parsed;
  } catch {
    // Plain prose is the expected path.
  }
  return undefined;
}

function applyDraftDefaults(plan) {
  return {
    ...plan,
    providers: {
      ...plan.providers,
      tts: "chatterbox",
      transcription: "mock"
    },
    voice: {
      ...plan.voice,
      provider: "chatterbox",
      voiceId: ["onyx", "manual-voice", "verse", "marin"].includes(plan.voice?.voiceId) ? "clone" : (plan.voice?.voiceId || "clone"),
      format: "wav",
      options: {
        ...plan.voice?.options,
        speed: 0.92,
        emotion:
          "Narrate as an engaged suspense storyteller: intimate, alert, and controlled. Build intrigue from the first line, sharpen the turns, slow slightly on dread, and avoid sounding bored, detached, cheerful, or theatrical."
      }
    }
  };
}

function buildStoryFeedback(rawScript, plan) {
  const sections = splitStorySections(rawScript);
  const items = [];
  if (!rawScript.match(/^\s*TITLE:\s*(.+)$/im)) {
    items.push({ level: "warning", text: "Missing TITLE line; existing project title will be reused." });
  }
  if (!extractThumbnailConcept(rawScript)) {
    items.push({ level: "warning", text: "Missing THUMBNAIL CONCEPT; add one if this should drive cover art later." });
  }
  for (const section of sections) {
    const hasVisual = /\[(BACKGROUND VISUAL|IMAGE|VISUAL|MEDIA|B-ROLL|BROLL):/i.test(section.body);
    if (!hasVisual) {
      items.push({
        level: "warning",
        text: `[${section.timecode}] ${section.title}: missing visual/image directive; Studio will use title-card placeholders.`
      });
    }
  }
  const beatCount = plan.sections.reduce((total, section) => total + section.beats.length, 0);
  items.push({ level: "info", text: `Converted ${sections.length} section(s) into ${beatCount} beat(s).` });
  items.push({ level: "step", text: "Next: Save Plan, optionally Generate Images, then Regenerate Audio, then Render Draft. Until then, Rendered Output still shows the previous video." });
  return items;
}

function renderStoryFeedback(items) {
  storyFeedback.innerHTML = "";
  if (items.length === 0) return;
  for (const item of items) {
    const row = document.createElement("div");
    row.className = `feedback-row feedback-${item.level}`;
    row.textContent = item.text;
    storyFeedback.appendChild(row);
  }
}

function renderWorkflowState() {
  const items = [];
  if (hasUnsavedPlan) items.push({ level: "step", text: "Plan has converted story changes that are not saved yet." });
  if (!hasUnsavedPlan && needsPrepareDraft) items.push({ level: "step", text: "Make Draft will regenerate narration, images if enabled, captions, and video." });
  if (needsRender) items.push({ level: "step", text: "Rendered Output still shows the previous draft. Use Render Draft Only to resume without regenerating audio or photos." });
  renderStoryFeedback(items);
}

function renderAiPlanFeedback(result) {
  const sections = result.plan.sections.length;
  const beats = result.plan.sections.reduce((total, section) => total + section.beats.length, 0);
  renderStoryFeedback([
    { level: "info", text: `AI generated ${sections} section(s) and ${beats} beat(s) using ${result.model}.` },
    ...result.warnings.map((text) => ({ level: "warning", text })),
    { level: "step", text: "Next: Save Plan, optionally Generate Images, then Regenerate Audio, then Render Draft. Until then, Rendered Output still shows the previous video." }
  ]);
}

function buildPlanFromStory(rawScript, currentPlan) {
  const title = extractStoryTitle(rawScript, currentPlan.title);
  const thumbnailConcept = extractThumbnailConcept(rawScript);
  const sections = splitStorySections(rawScript);
  if (sections.length === 0) {
    throw new Error("Story script needs timestamped sections like [0:00] THE HOOK.");
  }

  return {
    ...currentPlan,
    title,
    providers: {
      ...currentPlan.providers,
      tts: "chatterbox",
      transcription: "mock"
    },
    voice: {
      ...currentPlan.voice,
      provider: "chatterbox",
      voiceId: "clone",
      format: "wav",
      options: {
        ...currentPlan.voice.options,
        speed: 0.95,
        emotion: "Narrate like a tense supernatural horror story: restrained, intimate, serious, and cinematic. Avoid theatrical overacting."
      }
    },
    sections: sections.map((section, index) => {
      const sectionId = slugify(section.title, `section-${index + 1}`);
      const paragraphs = splitNarrationParagraphs(section.body);
      const notes = [thumbnailConcept && index === 0 ? `THUMBNAIL CONCEPT: ${thumbnailConcept}` : "", extractDirectives(section.body)]
        .filter(Boolean)
        .join("\n\n");
      return {
        id: sectionId,
        title: section.title,
        purpose: section.timecode,
        estimatedDurationSeconds: paragraphs.reduce((total, paragraph) => total + estimateDurationSeconds(paragraph), 0),
        beats: (paragraphs.length > 0 ? paragraphs : [normalizeNarration(section.body) || section.title]).map((paragraph, beatIndex) => {
          const beatNumber = String(beatIndex + 1).padStart(3, "0");
          return {
            id: `${sectionId}-${beatNumber}`,
            order: beatIndex + 1,
            narration: paragraph,
            timing: {
              estimatedDurationSeconds: estimateDurationSeconds(paragraph),
              preferredMinSeconds: 4,
              preferredMaxSeconds: 20,
              mediaPolicy: "loop_or_freeze"
            },
            media: [
              {
                id: `${sectionId}-${beatNumber}-visual`,
                type: "title_card",
                role: "primary_visual",
                prompt: notes || paragraph,
                scaleMode: "cover",
                placement: "background"
              }
            ],
            motion: { type: "slow_zoom_in", intensity: 0.08 },
            caption: { emphasis: [], style: "default" },
            notes
          };
        })
      };
    })
  };
}

function historyForAsset(assetId) {
  return imageHistory
    .filter((entry) => entry.assetId === assetId)
    .sort((a, b) => Number(b.version) - Number(a.version));
}

function renderAssetCard(projectId, asset) {
  const card = document.createElement("article");
  card.className = "media-card";
  const label = document.createElement("div");
  label.className = "media-label";
  label.textContent = `${asset.id} · ${asset.type} · ${asset.role}`;
  const src = `/api/projects/${projectId}/media/${encodeURIComponent(asset.path)}`;

  if (asset.type === "image") {
    const image = document.createElement("img");
    image.src = src;
    image.loading = "lazy";
    card.appendChild(image);
  } else if (asset.type === "video" || asset.type === "screen_recording") {
    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.preload = "metadata";
    card.appendChild(video);
  } else if (asset.type === "audio" || asset.type === "music" || asset.type === "sfx") {
    const audio = document.createElement("audio");
    audio.src = src;
    audio.controls = true;
    audio.preload = "metadata";
    card.appendChild(audio);
  }

  card.appendChild(label);
  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.textContent = asset.status === "locked_by_user" ? "Unlock Asset" : "Lock Asset";
  lockBtn.onclick = async () => {
    lockBtn.disabled = true;
    try {
      await patchAssetStatus(projectId, asset.id, asset.status === "locked_by_user" ? "generated" : "locked_by_user");
      await selectProject(projectId, selectedProjectElement);
    } finally {
      lockBtn.disabled = false;
    }
  };
  card.appendChild(lockBtn);
  if (asset.type === "image" && asset.role === "primary_visual") {
    const promptLabel = document.createElement("label");
    promptLabel.className = "image-prompt-label";
    promptLabel.textContent = "Image prompt override";
    const promptInput = document.createElement("textarea");
    promptInput.className = "image-prompt";
    promptInput.value = asset.source?.prompt ?? "";
    promptInput.placeholder = "Describe what should change, then regenerate this image.";
    const regenerateBtn = document.createElement("button");
    regenerateBtn.type = "button";
    regenerateBtn.textContent = "Regenerate Photo";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-btn";
    deleteBtn.textContent = "Delete Photo";
    regenerateBtn.onclick = async () => {
      regenerateBtn.disabled = true;
      regenerateBtn.textContent = "Regenerating...";
      try {
        const result = await fetchJson(`/api/projects/${projectId}/generate-images`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "selected",
            assetId: asset.id,
            prompt: promptInput.value,
            quality: imageQuality.value,
            size: "1024x1536"
          })
        });
        qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage generation:\nGenerated ${result.data.generated.length} image(s).\n${result.data.syncOutput ?? ""}`;
        needsRender = true;
        await selectProject(projectId, selectedProjectElement);
        needsRender = true;
        renderWorkflowState();
      } catch (error) {
        qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage regeneration failed:\n${String(error)}`;
      } finally {
        regenerateBtn.disabled = false;
        regenerateBtn.textContent = "Regenerate Photo";
      }
    };
    const versions = historyForAsset(asset.id);
    const history = document.createElement("div");
    history.className = "image-version-history";
    history.textContent = versions.length > 0
      ? `Versions: ${versions.map((entry) => `v${entry.version}`).join(", ")}`
      : "No AI image versions yet.";
    deleteBtn.onclick = async () => {
      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting...";
      try {
        await fetchJson(`/api/projects/${projectId}/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
        needsRender = true;
        await selectProject(projectId, selectedProjectElement);
        needsRender = true;
        renderWorkflowState();
      } catch (error) {
        qualityOutput.textContent = `${qualityOutput.textContent}\n\nDelete photo failed:\n${String(error)}`;
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete Photo";
      }
    };
    card.append(promptLabel, promptInput, regenerateBtn, deleteBtn, history);
  }
  return card;
}

function renderMissingImageCard(beat) {
  const card = document.createElement("article");
  card.className = "media-card missing-media-card";
  const title = document.createElement("strong");
  title.textContent = beat.id;
  const note = document.createElement("p");
  note.textContent = "No generated photo yet. Use per-beat coverage or regenerate this beat later.";
  card.append(title, note);
  return card;
}

function renderMediaPreview(projectId, plan, assets) {
  mediaPreview.innerHTML = "";
  const visualAssetsByBeat = new Map(
    assets
      .filter((asset) => asset.role !== "voiceover")
      .map((asset) => [asset.beatId, asset])
  );
  for (const section of plan.sections ?? []) {
    for (const beat of section.beats ?? []) {
      const asset = visualAssetsByBeat.get(beat.id);
      mediaPreview.appendChild(asset ? renderAssetCard(projectId, asset) : renderMissingImageCard(beat));
    }
  }
}

async function patchAssetStatus(projectId, assetId, status) {
  return fetchJson(`/api/projects/${projectId}/assets/${encodeURIComponent(assetId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status })
  });
}

const beatWorkspace = createBeatWorkspaceController({
  timelineEl: beatTimeline,
  inspectorEl: beatInspector,
  getReviewIssues: () => reviewController.getIssues(),
  getSelectedBeatId: () => selectedBeatId,
  setSelectedBeatId: (beatId) => {
    selectedBeatId = beatId;
    selectedInspectorTab = "script";
  },
  persistSelectedBeatId: (projectId, beatId) => writeStored(projectId, "selectedBeatId", beatId),
  patchAssetStatus,
  onProjectRefresh: async (projectId) => selectProject(projectId, selectedProjectElement),
  onPlanChanged: (plan) => {
    planEditor.value = fmt(plan);
    hasUnsavedPlan = true;
    needsPrepareDraft = true;
    needsRender = true;
    renderWorkflowState();
  },
  fetchJson,
  imageQualityValue: () => imageQuality.value,
  onBeatJobQueued: async (projectId, beatId, withRender) => {
    await jobCenter.refresh(projectId);
    jobCenter.startPolling(projectId);
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nQueued beat regeneration${withRender ? " + render" : ""} for ${beatId}.`;
  }
});

const reviewController = createReviewController({
  reviewListEl: reviewList,
  reviewFilterEl: reviewFilter,
  fetchJson,
  onSelectBeat: (beatId) => {
    selectedBeatId = beatId;
    writeStored(selectedProjectId, "selectedBeatId", selectedBeatId);
    if (currentProjectDetails) {
      const assets = [];
      fetchJson(`/api/projects/${selectedProjectId}/assets`).then((result) => {
        assets.push(...result.data.assets);
        beatWorkspace.renderInspector({
          projectId: selectedProjectId,
          plan: currentProjectDetails.plan,
          assets,
          timeline: currentProjectDetails.timeline
        });
      });
    }
  }
});

const voiceSettingsController = createVoiceSettingsController({
  elements: {
    dialog: voiceSettingsDialog,
    form: voiceSettingsForm,
    status: voiceSettingsStatus,
    ttsModel: voiceTtsModel,
    audioPromptPath: voiceAudioPromptPath,
    deliveryProfile: voiceDeliveryProfile,
    intensity: voiceIntensity,
    stability: voiceStability,
    pacing: voicePacing,
    variation: voiceVariation,
    exaggeration: voiceExaggeration,
    cfgWeight: voiceCfgWeight,
    temperature: voiceTemperature,
    seed: voiceSeed,
    intensityValue: voiceIntensityValue,
    stabilityValue: voiceStabilityValue,
    pacingValue: voicePacingValue,
    variationValue: voiceVariationValue,
    exaggerationValue: voiceExaggerationValue,
    cfgWeightValue: voiceCfgWeightValue,
    temperatureValue: voiceTemperatureValue,
    pickReferenceBtn: voicePickReferenceBtn,
    clearReferenceBtn: voiceClearReferenceBtn,
    referenceFile: voiceReferenceFile,
    previewABtn: voicePreviewABtn,
    previewBBtn: voicePreviewBBtn,
    previewLineAInput: voicePreviewLineAInput,
    previewLineBInput: voicePreviewLineBInput,
    previewAudio: voicePreviewAudio
  },
  fetchJson,
  readStored,
  writeStored,
  getSelectedProjectId: () => selectedProjectId
});

async function refreshQualityHistory(projectId) {
  const result = await fetchJson(`/api/projects/${projectId}/quality-history`);
  const lines = result.data.entries.map((entry) => {
    return `[${entry.timestamp}] ${entry.kind}: ${entry.summary}`;
  });
  qualityHistoryOutput.textContent = lines.length > 0 ? lines.join("\n") : "No history yet.";
}

async function refreshRenderOutput(projectId) {
  const result = await fetchJson(`/api/projects/${projectId}/renders`);
  const draft = result.data.renders.find((render) => render.quality === "draft");
  const runState = currentProjectDetails?.runState ?? {};
  renderOutput.innerHTML = "";
  if (!draft) {
    renderOutput.textContent = "No draft render yet.";
    return;
  }

  const src = `${draft.url}?t=${Date.now()}`;
  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.preload = "metadata";
  const link = document.createElement("a");
  link.href = src;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = draft.fileName;
  const status = document.createElement("div");
  status.className = "render-note";
  const isCurrent =
    runState.lastRenderPlanHash &&
    runState.lastRenderPlanHash === runState.currentPlanHash &&
    runState.lastRenderTimelineHash === runState.currentTimelineHash;
  status.textContent = isCurrent && !needsRender
    ? `Latest draft${draft.updatedAt ? ` rendered ${new Date(draft.updatedAt).toLocaleString()}` : ""}.`
    : "Previous draft - current words or plan need Make Draft.";
  renderOutput.append(video, link, status);
}

function setRunStatus(items) {
  renderStoryFeedback(items.map((text, index) => ({
    level: index === items.length - 1 ? "step" : "info",
    text
  })));
}

function imageProgressLine(progress) {
  if (!progress || progress.kind !== "image_generation") return undefined;
  const coverage = progress.coverage === "beat" ? "per beat" : "per section";
  const total = Number(progress.total) || 0;
  const completed = Math.min(total, Number(progress.completed) || 0);
  const current = progress.currentBeatId ? ` · ${progress.currentBeatId}` : "";
  const generated = Number(progress.generated) || 0;
  const failed = Number(progress.failed) || 0;
  return `Images ${completed}/${total} (${coverage}) · generated ${generated}, failed ${failed}${current}`;
}

function draftJobProgressLine(job) {
  if (!job || job.kind !== "draft_job") return undefined;
  const total = Number(job.total) || 1;
  const completed = Math.min(total, Number(job.completed) || 0);
  const retry = job.attempt > 1 ? ` · retry ${job.attempt}/${job.maxAttempts}` : "";
  const section = job.currentSectionTitle ? ` · ${job.currentSectionTitle}` : "";
  return `${job.label || job.phase || "Working"} · ${completed}/${total}${retry}${section}`;
}

function showJobBanner(title, detail, status = "running") {
  jobBanner.hidden = false;
  jobBanner.classList.toggle("job-banner-complete", status === "completed");
  jobBanner.classList.toggle("job-banner-failed", status === "failed");
  jobBannerTitle.textContent = title;
  jobBannerDetail.textContent = detail;
}

function hideJobBanner() {
  jobBanner.hidden = true;
  jobBanner.classList.remove("job-banner-complete", "job-banner-failed");
}

const jobCenter = createJobCenterController({
  listEl: jobCenterList,
  fetchJobs: async (projectId) => {
    const result = await fetchJson(`/api/projects/${projectId}/jobs`);
    return result.data.jobs || [];
  },
  onRetry: async () => {
    if (!selectedProjectId) return;
    await renderBtn.onclick();
  }
});

function notifyDraftJobFinished(job) {
  const title = job.status === "failed" ? "Draft failed" : "Draft ready";
  const body = job.status === "failed"
    ? (job.error || "The background draft job failed.")
    : "Your draft video finished rendering.";
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
  document.title = `${title} - Local Video Studio`;
}

function renderDraftJobState(job) {
  currentDraftJob = job || null;
  if (!job || job.kind !== "draft_job") {
    renderBtn.textContent = defaultDraftButtonLabel();
    updateStoryButtons();
    return;
  }

  const line = draftJobProgressLine(job);
  if (job.status === "running" || job.status === "queued") {
    renderBtn.disabled = true;
    renderBtn.textContent = "Draft Running...";
    stopRunBtn.disabled = true;
    showJobBanner("Draft running", line || "Queued on this machine.");
    setRunStatus([line || "Draft job is running in the background."]);
    updateStoryButtons();
    return;
  }

  renderBtn.textContent = defaultDraftButtonLabel();
  stopRunBtn.disabled = true;
  if (job.status === "completed") {
    showJobBanner("Draft ready", "The background render finished. The preview below has been refreshed.", "completed");
    if (lastSeenDraftJobId !== job.jobId) notifyDraftJobFinished(job);
    lastSeenDraftJobId = job.jobId;
  } else if (job.status === "failed") {
    showJobBanner("Draft failed", job.error || "The background draft job failed.", "failed");
    if (lastSeenDraftJobId !== job.jobId) notifyDraftJobFinished(job);
    lastSeenDraftJobId = job.jobId;
  }
  updateStoryButtons();
}

async function pollDraftJob(projectId) {
  if (!projectId) return;
  try {
    const result = await fetchJson(`/api/projects/${projectId}/draft-job`);
    const job = result.data;
    renderDraftJobState(job);
    await jobCenter.refresh(projectId);
    if (job?.status === "completed" || job?.status === "failed") {
      await selectProject(projectId, selectedProjectElement);
      renderDraftJobState(job);
      stopDraftJobPolling();
    }
  } catch {
    // Polling should not hide the main workflow controls.
  }
}

function startDraftJobPolling(projectId) {
  stopDraftJobPolling();
  pollDraftJob(projectId);
  draftJobPollTimer = setInterval(() => pollDraftJob(projectId), 2500);
}

function stopDraftJobPolling() {
  if (!draftJobPollTimer) return;
  clearInterval(draftJobPollTimer);
  draftJobPollTimer = null;
}

function startProgressPolling(projectId, baseSteps) {
  stopProgressPolling();
  progressPollTimer = setInterval(async () => {
    try {
      const details = await fetchJson(`/api/projects/${projectId}`);
      currentProjectDetails = details.data;
      const progressLine = imageProgressLine(details.data.runState?.progress);
      if (progressLine) setRunStatus([...baseSteps, progressLine]);
    } catch {
      // The blocking operation owns the visible failure message.
    }
  }, 1500);
}

function stopProgressPolling() {
  if (!progressPollTimer) return;
  clearInterval(progressPollTimer);
  progressPollTimer = null;
}

function visualAssetForBeat(assets, beatId) {
  return assets.find((asset) => asset.role === "primary_visual" && asset.beatId === beatId);
}

async function currentVisualCoverage(projectId, coverage) {
  const [details, assetsResult] = await Promise.all([
    fetchJson(`/api/projects/${projectId}`),
    fetchJson(`/api/projects/${projectId}/assets`)
  ]);
  const assets = assetsResult.data.assets ?? [];
  const plan = details.data.plan;
  if (coverage === "beat") {
    const beats = (plan.sections ?? []).flatMap((section) => section.beats ?? []);
    const missing = beats.filter((beat) => !visualAssetForBeat(assets, beat.id));
    return { missing: missing.length, total: beats.length };
  }

  const sections = plan.sections ?? [];
  const missing = sections.filter((section) =>
    !(section.beats ?? []).some((beat) => visualAssetForBeat(assets, beat.id))
  );
  return { missing: missing.length, total: sections.length };
}

function runSignal() {
  return activeRunController ? { signal: activeRunController.signal } : {};
}

async function requestAiPlanFromStory() {
  const result = await fetchJson(`/api/projects/${selectedProjectId}/plan-from-story`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...runSignal(),
    body: JSON.stringify({
      story: storyInput.value,
      feel: storyFeel.value,
      pacing: storyPacing.value,
      visualStyle: storyVisualStyle.value,
      systemPrompt: storySystemPrompt.value,
      userPromptTemplate: storyUserPromptTemplate.value,
      format: "short_story"
    })
  });
  const { plan } = result.data;
  planEditor.value = fmt(plan);
  projectTitle.textContent = `${plan.title} (${selectedProjectId})`;
  return result.data;
}

async function saveCurrentPlan(options = {}) {
  const parsedPlan = JSON.parse(planEditor.value);
  const query = options.check === false ? "?check=false" : "";
  const result = await fetchJson(`/api/projects/${selectedProjectId}/plan${query}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    ...runSignal(),
    body: JSON.stringify(parsedPlan)
  });
  qualityOutput.textContent = `${qualityOutput.textContent}\n\nPlan save check:\n${result.output}`;
  return result;
}

async function generateImagesForCurrentPlan(progressSteps = ["Generating images..."]) {
  startProgressPolling(selectedProjectId, progressSteps);
  const result = await fetchJson(`/api/projects/${selectedProjectId}/generate-images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...runSignal(),
    body: JSON.stringify({
      mode: imageMode.value,
      coverage: normalizeImageCoverage(imageBudget.value),
      quality: imageQuality.value,
      size: "1024x1536"
    })
  });
  stopProgressPolling();
  const coverageLabel = result.data.coverage === "beat" ? "per beat" : "per section";
  qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage generation:\nGenerated ${result.data.generated.length} new image(s), coverage ${coverageLabel}. Failed ${result.data.failed?.length ?? 0}.\n${result.data.syncOutput ?? ""}`;
  await refreshMediaPreview(selectedProjectId);
  return result;
}

async function refreshMediaPreview(projectId) {
  if (!projectId) return;
  const [details, assets, history] = await Promise.all([
    fetchJson(`/api/projects/${projectId}`),
    fetchJson(`/api/projects/${projectId}/assets`),
    fetchJson(`/api/projects/${projectId}/image-history`)
  ]);
  currentProjectDetails = details.data;
  imageHistory = history.data.entries;
  projectMeta.textContent = fmt({
    status: details.data.project.status,
    mode: details.data.plan.mode,
    targetPlatform: details.data.plan.targetPlatform,
    assets: details.data.assetCount,
    captions: details.data.captionCount
  });
  timelineOutput.textContent = fmt(details.data.timeline ?? { message: "timeline.json missing" });
  renderMediaPreview(projectId, details.data.plan, assets.data.assets);
  beatWorkspace.renderTimeline({
    projectId,
    plan: details.data.plan,
    timeline: details.data.timeline,
    assets: assets.data.assets,
    runState: details.data.runState
  });
  beatWorkspace.renderInspector({
    projectId,
    plan: details.data.plan,
    assets: assets.data.assets,
    timeline: details.data.timeline
  });
  await reviewController.refresh(projectId).catch(() => {});
}

async function createProjectFromTitle(title) {
  const result = await fetchJson("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: title.trim(), mode: "short_story", platform: "local_only" })
  });
  selectedProjectId = null;
  localStorage.setItem("lvstudio:selectedProjectId", result.data.projectId);
  await loadProjects();
  return result.data.projectId;
}

function applyPendingStoryState(pendingStory, pendingUiState, projectId) {
  if (!pendingStory.trim() || !projectId || selectedProjectId !== projectId) return;
  storyInput.value = pendingStory;
  storyFeel.value = pendingUiState.feel;
  storyPacing.value = pendingUiState.pacing;
  storyVisualStyle.value = pendingUiState.visualStyle;
  storySystemPrompt.value = pendingUiState.systemPrompt;
  storyUserPromptTemplate.value = pendingUiState.userPromptTemplate;
  imageEnabled.checked = pendingUiState.imageEnabled === "true";
  imageMode.value = pendingUiState.imageMode;
  imageBudget.value = pendingUiState.imageBudget;
  imageQuality.value = pendingUiState.imageQuality;
  saveUiState();
  needsRender = true;
  renderWorkflowState();
  updateStoryButtons();
}

newProjectBtn.onclick = async () => {
  const pendingStory = storyInput.value;
  const pendingUiState = {
    feel: storyFeel.value,
    pacing: storyPacing.value,
    visualStyle: storyVisualStyle.value,
    systemPrompt: storySystemPrompt.value,
    userPromptTemplate: storyUserPromptTemplate.value,
    imageEnabled: imageEnabled.checked ? "true" : "false",
    imageMode: imageMode.value,
    imageBudget: normalizeImageCoverage(imageBudget.value),
    imageQuality: imageQuality.value
  };
  const title = prompt("Project title?", projectTitleFromStory(pendingStory));
  if (!title?.trim()) return;
  newProjectBtn.disabled = true;
  newProjectBtn.textContent = "Creating...";
  try {
    const projectId = await createProjectFromTitle(title);
    applyPendingStoryState(pendingStory, pendingUiState, projectId);
  } catch (error) {
    projectMeta.textContent = String(error);
  } finally {
    newProjectBtn.disabled = false;
    newProjectBtn.textContent = "New Project";
  }
};

async function selectProject(projectId, element) {
  selectedProjectId = projectId;
  selectedProjectElement = element ?? selectedProjectElement;
  localStorage.setItem("lvstudio:selectedProjectId", projectId);
  [...projectList.querySelectorAll(".project-item")].forEach((node) => node.classList.remove("active"));
  selectedProjectElement?.classList.add("active");
  renderBtn.disabled = false;
  savePlanBtn.disabled = false;
  prepareDraftBtn.disabled = false;
  renderDraftBtn.disabled = false;
  generateImagesBtn.disabled = false;
  hasUnsavedPlan = false;
  needsPrepareDraft = false;
  needsRender = false;
  updateStoryButtons();
  renderWorkflowState();

  const details = await fetchJson(`/api/projects/${projectId}`);
  const assets = await fetchJson(`/api/projects/${projectId}/assets`);
  const history = await fetchJson(`/api/projects/${projectId}/image-history`);
  currentProjectDetails = details.data;
  imageHistory = history.data.entries;
  restoreUiState(projectId);
  if (storyInput.value.trim() && storyInput.value !== readStored(projectId, "lastDraftStory")) {
    needsRender = true;
  }
  renderWorkflowState();
  jobCenter.clearExpanded();
  projectTitle.textContent = `${details.data.plan.title} (${projectId})`;
  projectMeta.textContent = fmt({
    status: details.data.project.status,
    mode: details.data.plan.mode,
    targetPlatform: details.data.plan.targetPlatform,
    assets: details.data.assetCount,
    captions: details.data.captionCount
  });
  planEditor.value = fmt(details.data.plan);
  timelineOutput.textContent = fmt(details.data.timeline ?? { message: "timeline.json missing" });
  captionsOutput.textContent = fmt({ captionCount: details.data.captionCount });
  renderMediaPreview(projectId, details.data.plan, assets.data.assets);
  beatWorkspace.renderTimeline({
    projectId,
    plan: details.data.plan,
    timeline: details.data.timeline,
    assets: assets.data.assets,
    runState: details.data.runState
  });
  beatWorkspace.renderInspector({
    projectId,
    plan: details.data.plan,
    assets: assets.data.assets,
    timeline: details.data.timeline
  });

  qualityOutput.textContent = "Quality checks run during Make Draft or from Advanced controls.";
  await refreshRenderOutput(projectId);
  await refreshQualityHistory(projectId);
  const jobs = await jobCenter.refresh(projectId);
  await reviewController.refresh(projectId).catch(() => {});
  if ((jobs || []).some((job) => ["queued", "running"].includes(job.status))) jobCenter.startPolling(projectId);
  else jobCenter.stopPolling();
  if (details.data.runState?.progress?.kind === "draft_job" && ["queued", "running"].includes(details.data.runState.progress.status)) {
    startDraftJobPolling(projectId);
  } else {
    renderDraftJobState(details.data.runState?.progress);
  }
  updateStoryButtons();
}

async function refreshTtsHealth() {
  try {
    const result = await fetchJson("/api/tts/health");
    ttsHealthState = result.data || ttsHealthState;
  } catch (error) {
    const errorText = String(error || "");
    const looksLikeMissingHealthRoute =
      /not found/i.test(errorText) ||
      /404/.test(errorText) ||
      /\/api\/tts\/health/.test(errorText);
    if (looksLikeMissingHealthRoute) {
      ttsHealthState = {
        provider: "chatterbox",
        ok: false,
        status: "checking",
        sampleRate: null,
        error: null
      };
      return;
    }
    ttsHealthState = {
      provider: "chatterbox",
      ok: false,
      status: "unreachable",
      sampleRate: null,
      error: String(error)
    };
  } finally {
    renderTtsHealthPill();
    updateStoryButtons();
  }
}

renderBtn.onclick = async () => {
  const hasStory = storyInput.value.trim().length > 0;
  if (!hasStory) return;
  if (!["ready", "ready_degraded"].includes(ttsAvailability())) {
    const msg = ttsAvailability() === "loading" || ttsAvailability() === "checking"
      ? "TTS model is still warming up. Wait for 'TTS: ready' then try Make Draft."
      : `TTS is unavailable: ${ttsHealthState.error || "check Chatterbox server."}`;
    renderStoryFeedback([{ level: "warning", text: msg }]);
    return;
  }
  const pendingUiState = {
    feel: storyFeel.value,
    pacing: storyPacing.value,
    visualStyle: storyVisualStyle.value,
    systemPrompt: storySystemPrompt.value,
    userPromptTemplate: storyUserPromptTemplate.value,
    imageEnabled: imageEnabled.checked ? "true" : "false",
    imageMode: imageMode.value,
    imageBudget: normalizeImageCoverage(imageBudget.value),
    imageQuality: imageQuality.value
  };
  renderBtn.disabled = true;
  renderBtn.textContent = "Queueing...";
  try {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (!selectedProjectId) {
      const projectId = await createProjectFromTitle(projectTitleFromStory(storyInput.value));
      applyPendingStoryState(storyInput.value, pendingUiState, projectId);
    }
    if (!selectedProjectId) throw new Error("Project was not selected after creation.");
    const plan = JSON.parse(planEditor.value);
    const result = await fetchJson(`/api/projects/${selectedProjectId}/draft-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        story: storyInput.value,
        plan,
        feel: storyFeel.value,
        pacing: storyPacing.value,
        visualStyle: storyVisualStyle.value,
        systemPrompt: storySystemPrompt.value,
        userPromptTemplate: storyUserPromptTemplate.value,
        imageEnabled: imageEnabled.checked,
        imageMode: imageMode.value,
        imageCoverage: normalizeImageCoverage(imageBudget.value),
        imageQuality: imageQuality.value
      })
    });
    hasUnsavedPlan = false;
    needsPrepareDraft = false;
    needsRender = true;
    writeStored(selectedProjectId, "lastDraftStory", storyInput.value);
    renderDraftJobState(result.data);
    await jobCenter.refresh(selectedProjectId);
    startDraftJobPolling(selectedProjectId);
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nDraft job queued. You can leave this tab; Studio will keep processing while the server is running.`;
  } catch (error) {
    const message = `Make Draft failed to queue: ${String(error)}`;
    qualityOutput.textContent = `${qualityOutput.textContent}\n\n${message}`;
    renderStoryFeedback([{ level: "warning", text: message }]);
    renderBtn.disabled = false;
    renderBtn.textContent = "Make Draft";
  } finally {
    activeRunController = null;
    updateStoryButtons();
  }
};

stopRunBtn.onclick = () => {
  if (!activeRunController) {
    renderStoryFeedback([{ level: "step", text: "Background draft jobs keep running on the server. Close the tab if you do not want to watch progress." }]);
    return;
  }
  activeRunController.abort();
  stopRunBtn.disabled = true;
  renderStoryFeedback([{ level: "step", text: "Stopping current operation. The server may finish the current provider call before it fully settles." }]);
};

generateImagesBtn.onclick = async () => {
  if (!selectedProjectId) return;
  generateImagesBtn.disabled = true;
  generateImagesBtn.textContent = "Generating Images...";
  try {
    if (hasUnsavedPlan) {
      throw new Error("Save Plan before generating images so image prompts match the current plan.");
    }
    const result = await generateImagesForCurrentPlan(["Generating images..."]);
    needsRender = true;
    await selectProject(selectedProjectId, selectedProjectElement);
    needsRender = true;
    await refreshRenderOutput(selectedProjectId);
    await refreshQualityHistory(selectedProjectId);
    renderWorkflowState();
  } catch (error) {
    stopProgressPolling();
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage generation failed:\n${String(error)}`;
  } finally {
    generateImagesBtn.disabled = false;
    generateImagesBtn.textContent = "Generate Images";
  }
};

async function regenerateAudioForCurrentProject(triggerBtn) {
  if (!selectedProjectId) return;
  triggerBtn.disabled = true;
  const originalLabel = triggerBtn.textContent;
  triggerBtn.textContent = "Queueing...";
  try {
    const result = await fetchJson(`/api/projects/${selectedProjectId}/draft-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageEnabled: false })
    });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRegenerate Narration queued.`;
    currentDraftJob = result.data;
    pollDraftJob(selectedProjectId).catch(() => {});
    await jobCenter.refresh(selectedProjectId);
    hasUnsavedPlan = false;
    needsPrepareDraft = false;
    needsRender = true;
    renderWorkflowState();
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRegenerate Narration failed:\n${String(error)}`;
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
  }
}

prepareDraftBtn.onclick = () => {
  regenerateAudioForCurrentProject(prepareDraftBtn);
};

regenerateAudioBtn.onclick = () => {
  regenerateAudioForCurrentProject(regenerateAudioBtn);
};

directVoiceBtn.onclick = async () => {
  if (!selectedProjectId) return;
  directVoiceBtn.disabled = true;
  const label = directVoiceBtn.textContent;
  directVoiceBtn.textContent = "Directing...";
  try {
    const result = await fetchJson(`/api/projects/${selectedProjectId}/direct-voice`, {
      method: "POST"
    });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nDirect Voice:\n${result.output}`;
    await selectProject(selectedProjectId, selectedProjectElement);
    hasUnsavedPlan = true;
    needsPrepareDraft = true;
    needsRender = true;
    renderWorkflowState();
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nDirect Voice failed:\n${String(error)}`;
  } finally {
    directVoiceBtn.disabled = false;
    directVoiceBtn.textContent = label;
  }
};

renderDraftBtn.onclick = async () => {
  if (!selectedProjectId) return;
  renderDraftBtn.disabled = true;
  renderDraftBtn.textContent = "Rendering...";
  try {
    const result = await fetchJson(`/api/projects/${selectedProjectId}/render?quality=draft&force=true`, { method: "POST" });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRender:\n${result.output}`;
    await selectProject(selectedProjectId, selectedProjectElement);
    hasUnsavedPlan = false;
    needsPrepareDraft = false;
    needsRender = false;
    await refreshRenderOutput(selectedProjectId);
    await refreshQualityHistory(selectedProjectId);
    renderWorkflowState();
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRender Draft failed:\n${String(error)}`;
  } finally {
    renderDraftBtn.disabled = false;
    renderDraftBtn.textContent = "Render Draft Only";
  }
};

convertStoryBtn.onclick = async () => {
  try {
    const currentPlan = JSON.parse(planEditor.value);
    const nextPlan = buildPlanFromStory(storyInput.value, currentPlan);
    planEditor.value = fmt(nextPlan);
    projectTitle.textContent = `${nextPlan.title} (${selectedProjectId})`;
    hasUnsavedPlan = true;
    needsPrepareDraft = true;
    needsRender = true;
    renderStoryFeedback(buildStoryFeedback(storyInput.value, nextPlan));
    await refreshRenderOutput(selectedProjectId).catch(() => {});
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nStory script converted to video plan. Save Plan, Regenerate Audio, then Render Draft before checking output.`;
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nStory conversion failed:\n${String(error)}`;
  }
};

aiPlanBtn.onclick = async () => {
  if (!selectedProjectId) return;
  aiPlanBtn.disabled = true;
  aiPlanBtn.textContent = "Generating...";
  try {
    const result = await fetchJson(`/api/projects/${selectedProjectId}/plan-from-story`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        story: storyInput.value,
        feel: storyFeel.value,
        pacing: storyPacing.value,
        visualStyle: storyVisualStyle.value,
        systemPrompt: storySystemPrompt.value,
        userPromptTemplate: storyUserPromptTemplate.value,
        format: "short_story"
      })
    });
    const { plan } = result.data;
    planEditor.value = fmt(plan);
    projectTitle.textContent = `${plan.title} (${selectedProjectId})`;
    hasUnsavedPlan = true;
    needsPrepareDraft = true;
    needsRender = true;
    renderAiPlanFeedback(result.data);
    await refreshRenderOutput(selectedProjectId).catch(() => {});
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nAI generated a video plan. Save Plan, Regenerate Audio, then Render Draft before checking output.`;
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nAI plan generation failed:\n${String(error)}`;
  } finally {
    aiPlanBtn.disabled = false;
    aiPlanBtn.textContent = "Generate Plan with AI";
    updateStoryButtons();
  }
};

clearStoryBtn.onclick = () => {
  storyInput.value = "";
  saveUiState();
  updateStoryButtons();
};

storyInput.addEventListener("input", () => {
  saveUiState();
  updateStoryButtons();
  needsRender = true;
  refreshRenderOutput(selectedProjectId).catch(() => {});
});
storyInput.addEventListener("change", () => {
  saveUiState();
  updateStoryButtons();
});
storyInput.addEventListener("keyup", updateStoryButtons);
storyInput.addEventListener("paste", syncStoryButtonsSoon);
storyInput.addEventListener("drop", syncStoryButtonsSoon);
[storyFeel, storyPacing, storyVisualStyle, storySystemPrompt, storyUserPromptTemplate, imageMode, imageBudget, imageQuality, imageEnabled].forEach((control) => {
  control.addEventListener("change", saveUiState);
});
voiceSettingsController.setupEvents();
document.querySelectorAll("[data-voice-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    voiceSettingsController.applyPreset(button.dataset.voicePreset);
    voiceSettingsStatus.textContent = "";
  });
});
const fieldHelpButtons = [...document.querySelectorAll(".field-help")];
fieldHelpButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const shouldOpen = !button.classList.contains("is-open");
    fieldHelpButtons.forEach((node) => node.classList.remove("is-open"));
    if (shouldOpen) button.classList.add("is-open");
  });
});
document.addEventListener("click", () => {
  fieldHelpButtons.forEach((button) => button.classList.remove("is-open"));
});
jobBannerDismiss.onclick = () => {
  hideJobBanner();
  document.title = "Local Video Studio";
};
voiceSettingsDialog.addEventListener("close", () => {
  fieldHelpButtons.forEach((button) => button.classList.remove("is-open"));
});
voiceSettingsBtn.onclick = async () => {
  await voiceSettingsController.openDialog();
};

resetPromptDefaultsBtn.onclick = () => {
  storySystemPrompt.value = DEFAULT_PLANNER_SYSTEM_PROMPT;
  storyUserPromptTemplate.value = DEFAULT_PLANNER_USER_PROMPT_TEMPLATE;
  saveUiState();
};
voiceSettingsClose.onclick = () => {
  voiceSettingsController.closeDialog();
};
reviewRefreshBtn.onclick = () => {
  reviewController.refresh(selectedProjectId).catch((error) => {
    reviewList.textContent = String(error);
  });
};
reviewFilter.addEventListener("change", () => reviewController.render());
planEditor.addEventListener("input", () => {
  hasUnsavedPlan = true;
  needsPrepareDraft = true;
  needsRender = true;
  renderWorkflowState();
  refreshRenderOutput(selectedProjectId).catch(() => {});
});

savePlanBtn.onclick = async () => {
  if (!selectedProjectId) return;
  savePlanBtn.disabled = true;
  savePlanBtn.textContent = "Saving...";
  try {
    const parsedPlan = JSON.parse(planEditor.value);
    const result = await fetchJson(`/api/projects/${selectedProjectId}/plan`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedPlan)
    });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nPlan save check:\n${result.output}`;
    hasUnsavedPlan = false;
    needsPrepareDraft = true;
    needsRender = true;
    await selectProject(selectedProjectId, selectedProjectElement);
    hasUnsavedPlan = false;
    needsPrepareDraft = true;
    needsRender = true;
    await refreshRenderOutput(selectedProjectId);
    await refreshQualityHistory(selectedProjectId);
    renderWorkflowState();
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nPlan save failed:\n${String(error)}`;
    await selectProject(selectedProjectId, selectedProjectElement).catch(() => {});
  } finally {
    savePlanBtn.disabled = false;
    savePlanBtn.textContent = "Save Plan";
  }
};

voiceSettingsController.loadSettings().catch((error) => {
  voiceSettingsStatus.textContent = String(error);
});

refreshTtsHealth().catch(() => {});
setInterval(() => {
  refreshTtsHealth().catch(() => {});
}, 8000);

loadProjects().catch((error) => {
  projectMeta.textContent = String(error);
});

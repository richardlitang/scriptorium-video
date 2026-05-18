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
const savePlanBtn = document.getElementById("save-plan-btn");
const prepareDraftBtn = document.getElementById("prepare-draft-btn");
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
const imageMode = document.getElementById("image-mode");
const imageBudget = document.getElementById("image-budget");
const imageQuality = document.getElementById("image-quality");
const imageEnabled = document.getElementById("image-enabled");

let selectedProjectId = null;
let selectedProjectElement = null;
let hasUnsavedPlan = false;
let needsPrepareDraft = false;
let needsRender = false;
let imageHistory = [];
let currentProjectDetails = null;
let activeRunController = null;

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
  imageEnabled.checked = readStored(projectId, "imageEnabled", imageEnabled.checked ? "true" : "false") === "true";
  imageMode.value = readStored(projectId, "imageMode", imageMode.value);
  imageBudget.value = readStored(projectId, "imageBudget", imageBudget.value);
  imageQuality.value = readStored(projectId, "imageQuality", imageQuality.value);
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

function updateStoryButtons() {
  const hasSelectedProject = Boolean(selectedProjectId);
  const hasStory = storyInput.value.trim().length > 0;
  convertStoryBtn.disabled = !hasSelectedProject || !hasStory;
  aiPlanBtn.disabled = !hasSelectedProject || !hasStory;
  clearStoryBtn.disabled = !hasStory;
  renderBtn.disabled = !hasSelectedProject;
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
  items.push({ level: "step", text: "Next: Save Plan, optionally Generate Images, then Prepare Draft, then Render Draft. Until then, Rendered Output still shows the previous video." });
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
  if (needsRender) items.push({ level: "step", text: "Rendered Output still shows the previous draft until Make Draft completes." });
  renderStoryFeedback(items);
}

function renderAiPlanFeedback(result) {
  const sections = result.plan.sections.length;
  const beats = result.plan.sections.reduce((total, section) => total + section.beats.length, 0);
  renderStoryFeedback([
    { level: "info", text: `AI generated ${sections} section(s) and ${beats} beat(s) using ${result.model}.` },
    ...result.warnings.map((text) => ({ level: "warning", text })),
    { level: "step", text: "Next: Save Plan, optionally Generate Images, then Prepare Draft, then Render Draft. Until then, Rendered Output still shows the previous video." }
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
  note.textContent = "No generated photo yet. Increase photo budget or regenerate this beat later.";
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

async function generateImagesForCurrentPlan() {
  const result = await fetchJson(`/api/projects/${selectedProjectId}/generate-images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...runSignal(),
    body: JSON.stringify({
      mode: imageMode.value,
      limit: Number(imageBudget.value),
      quality: imageQuality.value,
      size: "1024x1536"
    })
  });
  qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage generation:\nGenerated ${result.data.generated.length} new image(s), reused images for remaining beats. Failed ${result.data.failed?.length ?? 0}.\n${result.data.syncOutput ?? ""}`;
  return result;
}

newProjectBtn.onclick = async () => {
  const title = prompt("Project title?");
  if (!title?.trim()) return;
  newProjectBtn.disabled = true;
  newProjectBtn.textContent = "Creating...";
  try {
    const result = await fetchJson("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), mode: "short_story", platform: "local_only" })
    });
    selectedProjectId = null;
    localStorage.setItem("lvstudio:selectedProjectId", result.data.projectId);
    await loadProjects();
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

  qualityOutput.textContent = "Quality checks run during Make Draft or from Advanced controls.";
  await refreshRenderOutput(projectId);
  await refreshQualityHistory(projectId);
  updateStoryButtons();
}

renderBtn.onclick = async () => {
  if (!selectedProjectId) return;
  activeRunController = new AbortController();
  renderBtn.disabled = true;
  stopRunBtn.disabled = false;
  renderBtn.textContent = "Making Draft...";
  const steps = [];
  try {
    if (storyInput.value.trim()) {
      const pastedPlan = parseStoryInputAsPlan();
      if (pastedPlan) {
        const normalizedPlan = applyDraftDefaults(pastedPlan);
        planEditor.value = fmt(normalizedPlan);
        projectTitle.textContent = `${normalizedPlan.title} (${selectedProjectId})`;
        steps.push(`Using pasted video plan with ${normalizedPlan.sections.length} section(s).`);
      } else {
        steps.push("Reading story and creating a video plan...");
        setRunStatus(steps);
        const planResult = await requestAiPlanFromStory();
        steps[steps.length - 1] = `Created ${planResult.plan.sections.length} section plan.`;
      }
      steps.push("Saving plan and syncing timeline...");
      setRunStatus(steps);
      await saveCurrentPlan({ check: false });
      hasUnsavedPlan = false;
    } else if (hasUnsavedPlan) {
      steps.push("Saving edited plan...");
      setRunStatus(steps);
      await saveCurrentPlan({ check: false });
      hasUnsavedPlan = false;
    }

    if (imageEnabled.checked) {
      const budgetLabel = imageBudget.value === "999" ? "every beat" : `up to ${imageBudget.value} key photo(s)`;
      steps.push(`Generating ${budgetLabel}, then reusing them across uncovered beats. This can take 15-30 seconds per generated photo.`);
      setRunStatus(steps);
      const imageResult = await generateImagesForCurrentPlan();
      steps[steps.length - 1] = `Generated ${imageResult.data.generated.length} new photo(s), reused visuals for remaining beats. Failed ${imageResult.data.failed?.length ?? 0}.`;
    } else {
      steps.push("Skipping AI photos by request.");
    }

    steps.push("Generating narration, transcript, captions, and timeline...");
    setRunStatus(steps);
    const prepareResult = await fetchJson(`/api/projects/${selectedProjectId}/prepare-draft`, { method: "POST", ...runSignal() });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nPrepare Draft:\n${prepareResult.output}`;

    steps[steps.length - 1] = "Narration, captions, and timeline are ready.";
    steps.push("Rendering draft video...");
    setRunStatus(steps);
    const result = await fetchJson(`/api/projects/${selectedProjectId}/render?quality=draft&force=true`, { method: "POST", ...runSignal() });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nRender:\n${result.output}`;
    hasUnsavedPlan = false;
    needsPrepareDraft = false;
    needsRender = false;
    writeStored(selectedProjectId, "lastDraftStory", storyInput.value);
    steps[steps.length - 1] = "Draft video rendered.";
    setRunStatus(steps);
    await selectProject(selectedProjectId, selectedProjectElement);
    setRunStatus(["Draft video rendered. Use the player below, or edit a photo prompt and regenerate that photo."]);
  } catch (error) {
    const stopped = error?.name === "AbortError";
    const message = stopped ? "Make Draft stopped by user. Already-created files may remain in the project." : `Make Draft failed: ${String(error)}`;
    qualityOutput.textContent = `${qualityOutput.textContent}\n\n${message}`;
    renderStoryFeedback([{ level: stopped ? "step" : "warning", text: message }]);
  } finally {
    activeRunController = null;
    stopRunBtn.disabled = true;
    renderBtn.disabled = false;
    renderBtn.textContent = "Make Draft";
    updateStoryButtons();
  }
};

stopRunBtn.onclick = () => {
  if (!activeRunController) return;
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
    const result = await fetchJson(`/api/projects/${selectedProjectId}/generate-images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: imageMode.value,
        limit: Number(imageBudget.value),
        quality: imageQuality.value,
        size: "1024x1536"
      })
    });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage generation:\nGenerated ${result.data.generated.length} image(s). Failed ${result.data.failed?.length ?? 0}.\n${result.data.syncOutput ?? ""}`;
    needsRender = true;
    await selectProject(selectedProjectId, selectedProjectElement);
    needsRender = true;
    await refreshRenderOutput(selectedProjectId);
    await refreshQualityHistory(selectedProjectId);
    renderWorkflowState();
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nImage generation failed:\n${String(error)}`;
  } finally {
    generateImagesBtn.disabled = false;
    generateImagesBtn.textContent = "Generate Images";
  }
};

prepareDraftBtn.onclick = async () => {
  if (!selectedProjectId) return;
  prepareDraftBtn.disabled = true;
  prepareDraftBtn.textContent = "Preparing...";
  try {
    const result = await fetchJson(`/api/projects/${selectedProjectId}/prepare-draft`, { method: "POST" });
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nPrepare Draft:\n${result.output}`;
    await selectProject(selectedProjectId, selectedProjectElement);
    hasUnsavedPlan = false;
    needsPrepareDraft = false;
    needsRender = true;
    await refreshRenderOutput(selectedProjectId);
    await refreshQualityHistory(selectedProjectId);
    renderWorkflowState();
  } catch (error) {
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nPrepare Draft failed:\n${String(error)}`;
  } finally {
    prepareDraftBtn.disabled = false;
    prepareDraftBtn.textContent = "Prepare Draft";
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
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nStory script converted to video plan. Save Plan, Prepare Draft, then Render Draft before checking output.`;
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
    qualityOutput.textContent = `${qualityOutput.textContent}\n\nAI generated a video plan. Save Plan, Prepare Draft, then Render Draft before checking output.`;
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
[storyFeel, storyPacing, storyVisualStyle, imageMode, imageBudget, imageQuality, imageEnabled].forEach((control) => {
  control.addEventListener("change", saveUiState);
});
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

loadProjects().catch((error) => {
  projectMeta.textContent = String(error);
});

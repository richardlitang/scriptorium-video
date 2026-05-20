import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, writeFile, mkdir, appendFile, unlink, stat, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { imageReuseKey, narrationFromImagePrompt, selectCachedImage } from "./image-cache.mjs";
import { defaultVoiceSettings, normalizeVoiceSettings, voiceSettingsEnv } from "./voice-settings.mjs";
import { publicAssetForPath } from "./static-assets.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const projectsDir = path.join(rootDir, "content", "projects");
const qualityHistoryDir = path.join(rootDir, ".studio-data", "quality-history");
const imageHistoryDir = path.join(rootDir, ".studio-data", "image-history");
const imageCachePath = path.join(rootDir, ".studio-data", "image-cache.ndjson");
const voiceSettingsPath = path.join(rootDir, ".studio-data", "voice-settings.json");
const voiceReferencesDir = path.join(rootDir, ".studio-data", "voice-references");
const projectMutationQueues = new Map();
const activeDraftJobs = new Map();
const activeBeatJobs = new Map();
const commandLogPath = path.join(rootDir, ".studio-data", "server-commands.ndjson");
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const CHATTERBOX_SPEECH_URL = process.env.CHATTERBOX_TTS_URL ?? "http://127.0.0.1:8000/v1/audio/speech";
const CHATTERBOX_HEALTH_URL = (() => {
  try {
    const url = new URL(CHATTERBOX_SPEECH_URL);
    url.pathname = "/health";
    url.search = "";
    return url.toString();
  } catch {
    return "http://127.0.0.1:8000/health";
  }
})();
const voicePreviewCache = new Map();
const STUDIO_TEST_MODE = process.env.LVSTUDIO_TEST_MODE === "1";

const port = Number(process.env.PORT ?? "4173");

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function parseBinaryBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000_000) {
        reject(new Error("Upload too large. Max 20MB."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function safeReadJson(jsonPath) {
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

async function readVoiceSettings() {
  const saved = await safeReadJson(voiceSettingsPath).catch(() => defaultVoiceSettings);
  return normalizeVoiceSettings(saved);
}

async function writeVoiceSettings(settings) {
  const normalized = normalizeVoiceSettings(settings);
  await mkdir(path.dirname(voiceSettingsPath), { recursive: true });
  await writeFile(voiceSettingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

async function previewVoice(settings, text) {
  const normalized = normalizeVoiceSettings(settings);
  const payload = {
    model: normalized.ttsModel || "chatterbox",
    voice: "default",
    input: String(text || "").trim(),
    response_format: "wav",
    audio_prompt_path: normalized.audioPromptPath || undefined,
    exaggeration: normalized.exaggeration,
    cfg_weight: normalized.cfgWeight,
    temperature: normalized.temperature,
    seed: normalized.seed ? Number(normalized.seed) : undefined
  };
  if (!payload.input) throw new Error("Preview text is required.");
  const cacheKey = sha256(JSON.stringify(payload));
  const cached = voicePreviewCache.get(cacheKey);
  if (cached) return cached;

  const headers = { "content-type": "application/json" };
  if (process.env.CHATTERBOX_TTS_API_KEY) headers.authorization = `Bearer ${process.env.CHATTERBOX_TTS_API_KEY}`;
  const response = await fetch(CHATTERBOX_SPEECH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  }).catch((error) => {
    throw new Error(
      `Voice preview unavailable: Chatterbox is not reachable at ${CHATTERBOX_SPEECH_URL}. Start the local server or choose API fallback for generated narration. ${error.message}`
    );
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voice preview failed: ${response.status} ${body.slice(0, 300)}`.trim());
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  voicePreviewCache.set(cacheKey, bytes);
  if (voicePreviewCache.size > 24) {
    const firstKey = voicePreviewCache.keys().next().value;
    voicePreviewCache.delete(firstKey);
  }
  return bytes;
}

async function readTtsHealth() {
  if (STUDIO_TEST_MODE) {
    return { provider: "chatterbox", ok: true, status: "ready", sampleRate: 24000, error: null };
  }
  const headers = {};
  if (process.env.CHATTERBOX_TTS_API_KEY) headers.authorization = `Bearer ${process.env.CHATTERBOX_TTS_API_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(CHATTERBOX_HEALTH_URL, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        return {
          provider: "chatterbox",
          ok: true,
          status: "no_health_endpoint",
          sampleRate: null,
          error: `Health endpoint not found at ${CHATTERBOX_HEALTH_URL}`
        };
      }
      return {
        provider: "chatterbox",
        ok: false,
        status: "failed",
        sampleRate: null,
        error: `health-check-failed (${response.status})`
      };
    }
    return {
      provider: "chatterbox",
      ok: payload.ok === true,
      status: payload.status || (payload.ok ? "ready" : "failed"),
      sampleRate: typeof payload.sampleRate === "number" ? payload.sampleRate : null,
      error: payload.error || null
    };
  } catch (error) {
    return {
      provider: "chatterbox",
      ok: false,
      status: "unreachable",
      sampleRate: null,
      error: error?.name === "AbortError" ? "health-check-timeout" : String(error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function safeVoiceReferenceFileName(rawName) {
  const base = path.basename(rawName || "reference.wav");
  return base.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function readOptionalFile(filePath) {
  return readFile(filePath, "utf8").catch(() => null);
}

async function restoreOptionalFile(filePath, content) {
  if (content === null) {
    await unlink(filePath).catch(() => {});
    return;
  }
  await writeFile(filePath, content, "utf8");
}

async function readEnvFile(filePath) {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

async function getOpenAiApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPaths = [
    process.env.LVSTUDIO_OPENAI_ENV_FILE,
    path.resolve(rootDir, ".env.local"),
    path.resolve(rootDir, "..", "support", ".env.local")
  ].filter(Boolean);
  for (const envPath of envPaths) {
    const values = await readEnvFile(envPath);
    if (values.OPENAI_API_KEY) return values.OPENAI_API_KEY;
  }
  throw new Error("Missing OPENAI_API_KEY. Set it in env, LVSTUDIO_OPENAI_ENV_FILE, or ../support/.env.local.");
}

function slugify(value, fallback) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function safeProjectId(value) {
  return slugify(String(value || ""), "");
}

function estimateDurationSeconds(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Number((words * 0.42).toFixed(1))));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function dimensionsFromSize(size) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

function envConcurrency(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runProjectMutation(projectId, operation) {
  const previous = projectMutationQueues.get(projectId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  projectMutationQueues.set(projectId, current);
  try {
    return await current;
  } finally {
    if (projectMutationQueues.get(projectId) === current) {
      projectMutationQueues.delete(projectId);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePlanFromStoryInput(rawInput) {
  try {
    const parsed = JSON.parse(rawInput);
    if (parsed?.schemaVersion === 1 && Array.isArray(parsed.sections)) return parsed;
  } catch {
    // Plain story prose is the common path.
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
      voiceId: ["onyx", "manual-voice", "verse", "marin"].includes(plan.voice?.voiceId)
        ? "clone"
        : (plan.voice?.voiceId || "clone"),
      format: "wav",
      options: {
        ...plan.voice?.options,
        speed: 0.92,
        emotion:
          "Narrate as an engaged video storyteller: intimate, alert, and controlled. Match the genre and beat direction, slow slightly on important turns, and avoid sounding flat or theatrical."
      }
    }
  };
}

function jobProgress(job, patch = {}) {
  return {
    kind: "draft_job",
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    label: job.label,
    completed: job.completed,
    total: job.total,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    currentSectionId: job.currentSectionId,
    currentSectionTitle: job.currentSectionTitle,
    error: job.error,
    output: job.output.join("\n\n").trim(),
    ...patch
  };
}

function beatJobProgress(job, patch = {}) {
  return {
    kind: "beat_regenerate_job",
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    label: job.label,
    beatId: job.beatId,
    sectionId: job.sectionId,
    completed: job.completed,
    total: job.total,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    output: job.output.join("\n\n").trim(),
    ...patch
  };
}

async function writeDraftJobState(projectId, job, patch = {}) {
  Object.assign(job, patch);
  await upsertRunJob(projectId, {
    ...jobProgress(job),
    updatedAt: new Date().toISOString()
  });
}

async function runRetriedDraftStep(projectId, job, label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= job.maxAttempts; attempt += 1) {
    await writeDraftJobState(projectId, job, {
      status: "running",
      label,
      attempt
    });
    try {
      const result = await operation();
      if (result?.stdout?.trim()) job.output.push(`${label}:\n${result.stdout.trim()}`);
      job.completed += 1;
      await writeDraftJobState(projectId, job);
      return result;
    } catch (error) {
      lastError = error;
      job.output.push(`${label} attempt ${attempt} failed:\n${error instanceof Error ? error.message : String(error)}`);
      await writeDraftJobState(projectId, job, {
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < job.maxAttempts) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function generateDraftAudioBySection(projectId, job, plan, transcriptionProvider) {
  const sections = plan.sections ?? [];
  for (const section of sections) {
    await writeDraftJobState(projectId, job, {
      phase: "audio",
      currentSectionId: section.id,
      currentSectionTitle: section.title
    });
    await runRetriedDraftStep(projectId, job, `Narration: ${section.title}`, () =>
      runLvstudio(["generate:tts", projectId, "--provider", plan.providers.tts, "--force", "--only-section", section.id])
    );
  }

  await writeDraftJobState(projectId, job, { phase: "sync" });
  await runRetriedDraftStep(projectId, job, "Sync timeline", () => runLvstudio(["sync", projectId]));
  await writeDraftJobState(projectId, job, { phase: "transcribe" });
  await runRetriedDraftStep(projectId, job, "Transcribe narration", () =>
    runLvstudio(["transcribe", projectId, "--provider", transcriptionProvider])
  );
  await writeDraftJobState(projectId, job, { phase: "captions" });
  await runRetriedDraftStep(projectId, job, "Generate captions", () => runLvstudio(["captions", projectId]));
}

async function runDraftJob(projectId, body) {
  const job = {
    id: `draft-${Date.now().toString(36)}`,
    status: "queued",
    phase: "queued",
    label: "Waiting for project queue",
    completed: 0,
    total: 1,
    attempt: 0,
    maxAttempts: 2,
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    error: undefined,
    output: []
  };

  activeDraftJobs.set(projectId, job);
  await writeDraftJobState(projectId, job);

  runProjectMutation(projectId, async () => {
    try {
      const projectDir = path.join(projectsDir, projectId);
      const planPath = path.join(projectDir, "video-plan.json");
      let details = await getProjectDetails(projectId);
      let plan = details.plan;
      const story = String(body.story || "").trim();
      const imageEnabledForJob = body.imageEnabled !== false;
      const imageSteps = imageEnabledForJob ? 1 : 0;

      if (story) {
        await writeDraftJobState(projectId, job, {
          phase: "planning",
          label: "Creating video plan from story"
        });
        const pastedPlan = parsePlanFromStoryInput(story);
        if (pastedPlan) {
          plan = applyDraftDefaults(pastedPlan);
        } else {
          const draft = await generatePlanDraftWithOpenAi({
            story,
            currentPlan: plan,
            feel: body.feel ?? "cinematic supernatural suspense",
            pacing: body.pacing ?? "measured",
            visualStyle: body.visualStyle ?? "dark cinematic realism",
            format: body.format ?? "short_story",
            systemPrompt: body.systemPrompt,
            userPromptTemplate: body.userPromptTemplate
          });
          plan = draft.plan;
          job.output.push(`AI plan:\nGenerated ${plan.sections.length} section(s) using ${draft.model}.`);
        }
        await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      } else if (body.plan && typeof body.plan === "object") {
        plan = body.plan;
        await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      }

      details = await getProjectDetails(projectId);
      plan = details.plan;
      job.total = 1 + imageSteps + (plan.sections?.length ?? 0) + 5;

      await writeDraftJobState(projectId, job, { phase: "save", label: "Saving plan and syncing timeline" });
      await runRetriedDraftStep(projectId, job, "Initial sync", () => runLvstudio(["sync", projectId]));

      if (imageEnabledForJob) {
        await writeDraftJobState(projectId, job, { phase: "images", label: "Generating images" });
        const imageResult = await generateProjectImages(projectId, {
          mode: body.imageMode ?? "missing",
          coverage: body.imageCoverage === "beat" ? "beat" : "section",
          quality: body.imageQuality ?? "low",
          size: "1024x1536"
        });
        job.completed += 1;
        job.output.push(`Images:\nGenerated ${imageResult.generated.length}; failed ${imageResult.failed?.length ?? 0}.`);
        await writeDraftJobState(projectId, job);
      }

      await generateDraftAudioBySection(projectId, job, plan, plan.providers.transcription);

      await writeDraftJobState(projectId, job, { phase: "check", label: "Running quality check" });
      const checkResult = await runLvstudioReport(["check", projectId]);
      job.completed += 1;
      job.output.push(`${checkResult.ok ? "Quality check" : "Quality check warnings/errors"}:\n${checkResult.stdout.trim()}`);

      await writeDraftJobState(projectId, job, { phase: "render", label: "Rendering draft video" });
      await runRetriedDraftStep(projectId, job, "Render draft", () =>
        runLvstudio(["render", projectId, "--quality", "draft", "--force"])
      );

      const planHash = sha256(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
      const timelineHash = sha256(await readFile(path.join(projectDir, "timeline.json"), "utf8").catch(() => ""));
      const output = job.output.join("\n\n").trim();
      await appendQualityHistory(projectId, {
        timestamp: new Date().toISOString(),
        kind: "draft_job",
        summary: "Background draft job completed.",
        output
      });
      job.status = "completed";
      job.phase = "done";
      job.label = "Draft video is ready";
      job.completed = job.total;
      job.finishedAt = new Date().toISOString();
      await upsertRunJob(projectId, {
        ...jobProgress(job),
        updatedAt: new Date().toISOString()
      });
      await writeRunState(projectId, {
        ...(await readRunState(projectId)),
        lastRenderPlanHash: planHash,
        lastRenderTimelineHash: timelineHash,
        lastRenderQuality: "draft",
        lastRenderCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      activeDraftJobs.delete(projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      job.status = "failed";
      job.error = message;
      job.finishedAt = new Date().toISOString();
      job.output.push(`Draft job failed:\n${message}`);
      await appendQualityHistory(projectId, {
        timestamp: new Date().toISOString(),
        kind: "draft_job_failed",
        summary: "Background draft job failed.",
        output: job.output.join("\n\n").trim()
      }).catch(() => {});
      await writeDraftJobState(projectId, job);
      activeDraftJobs.delete(projectId);
    }
  }).catch(() => {});

  return jobProgress(job);
}

function narrationSummary(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function sectionBeatContext(section, sectionIndex, beat, beatIndex, plan) {
  const beats = section.beats ?? [];
  const previousBeat = beats[beatIndex - 1];
  const nextBeat = beats[beatIndex + 1];
  return [
    `Project title: ${plan.title}.`,
    `Story mode: ${plan.mode}; target platform: ${plan.targetPlatform}.`,
    `Section ${sectionIndex + 1} of ${plan.sections?.length ?? "unknown"}: ${section.title}.`,
    section.purpose ? `Section purpose: ${section.purpose}.` : "",
    `Beat ${beatIndex + 1} of ${beats.length} in this section.`,
    previousBeat ? `Previous beat narration: ${narrationSummary(previousBeat.narration)}` : "Previous beat narration: none; this opens the section.",
    `Current beat narration: ${narrationSummary(beat.narration)}`,
    nextBeat ? `Next beat narration: ${narrationSummary(nextBeat.narration)}` : "Next beat narration: none; this closes the section."
  ].filter(Boolean).join("\n");
}

function imagePromptForBeat(plan, section, beat, beatIndex) {
  const mediaPrompt = beat.media?.find((media) => media.role === "primary_visual" || media.role === "background")?.prompt;
  return [
    sectionBeatContext(section, plan.sections.indexOf(section), beat, beatIndex, plan),
    "",
    "Visual target:",
    mediaPrompt || beat.notes || beat.narration,
    "",
    "Create a vertical 9:16 photorealistic cinematic still for a suspense story video.",
    "Depict the exact current beat, not a generic mood board and not a later event.",
    "Preserve continuity with the immediately previous and next beats, but do not introduce objects, characters, or reveals that have not happened yet.",
    "Use natural lens perspective, believable human anatomy, grounded lighting, subtle film grain, and environmental detail.",
    "Avoid glossy AI fantasy style, plastic skin, over-smoothed faces, surreal distortions, extra fingers, fake text, UI, subtitles, watermarks, logos, split screens, and soundwave graphics.",
    "Make it look like a frame from an atmospheric indie thriller shot on a real camera."
  ].join("\n");
}

function imageTargetsFromPlan(plan) {
  return plan.sections.flatMap((section) =>
    section.beats.map((beat, beatIndex) => ({
      section,
      beat,
      beatIndex,
      assetId: `image-${beat.id}`,
      defaultPrompt: imagePromptForBeat(plan, section, beat, beatIndex)
    }))
  );
}

function groupTargetsBySection(targets) {
  const bySection = new Map();
  for (const target of targets) {
    bySection.set(target.section.id, [...(bySection.get(target.section.id) ?? []), target]);
  }
  return bySection;
}

function sectionHasVisualAsset(assets, sectionId) {
  return assets.some((asset) => asset.sectionId === sectionId && asset.role === "primary_visual");
}

function beatHasVisualAsset(assets, assetId, beatId) {
  return assets.some((asset) =>
    asset.role === "primary_visual" &&
    (asset.id === assetId || asset.beatId === beatId)
  );
}

function selectImageTargets(plan, manifest, mode, coverage, options) {
  const allTargets = imageTargetsFromPlan(plan);
  const assets = manifest.assets ?? [];
  const force = options.force === true;
  if (mode === "selected") {
    return allTargets.filter((target) => {
      if (target.assetId !== options.assetId) return false;
      const existing = assets.find((asset) => asset.id === target.assetId || (asset.beatId === target.beat.id && asset.role === "primary_visual"));
      return force || existing?.status !== "locked_by_user";
    }).slice(0, 1);
  }

  const unlockedTarget = (target) => {
    const existing = assets.find((asset) => asset.id === target.assetId || (asset.beatId === target.beat.id && asset.role === "primary_visual"));
    return force || existing?.status !== "locked_by_user";
  };
  if (coverage === "beat") {
    return allTargets.filter((target) =>
      (mode === "all" ? true : !beatHasVisualAsset(assets, target.assetId, target.beat.id)) && unlockedTarget(target)
    );
  }

  const bySection = groupTargetsBySection(allTargets);
  const selected = [];
  for (const [sectionId, sectionTargets] of bySection.entries()) {
    if (mode === "missing" && sectionHasVisualAsset(assets, sectionId)) continue;
    const target = sectionTargets.find(unlockedTarget);
    if (target) selected.push(target);
  }
  return selected;
}

function buildPlanFromAiDraft(currentPlan, draft) {
  const allowedVoiceProfiles = new Set([
    "neutral",
    "warm_open",
    "clear_explainer",
    "authoritative",
    "energetic",
    "key_point",
    "reflective",
    "tense",
    "reveal",
    "urgent",
    "soft_close"
  ]);
  const clampNumber = (value, fallback, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  };
  const normalizeVoiceDirection = (beatDraft) => {
    const confidence = clampNumber(beatDraft.voiceConfidence, 0.7, 0, 1);
    const conservative = confidence < 0.45;
    const profile = allowedVoiceProfiles.has(beatDraft.voiceProfile) ? beatDraft.voiceProfile : "neutral";
    return {
      profile: conservative ? "neutral" : profile,
      deliveryNote: String(beatDraft.deliveryNote || "").trim() || undefined,
      emphasis: Array.isArray(beatDraft.emphasis)
        ? beatDraft.emphasis.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 12)
        : [],
      pauseBeforeSeconds: conservative ? 0 : clampNumber(beatDraft.pauseBeforeSeconds, 0, 0, 1.2),
      pauseAfterSeconds: conservative ? 0.08 : clampNumber(beatDraft.pauseAfterSeconds, 0, 0, 1.2),
      intensity: conservative ? 0.45 : clampNumber(beatDraft.intensity, 0.5, 0, 1),
      speedMultiplier: clampNumber(beatDraft.speedMultiplier, 1, 0.6, 1.5),
      pitchOffset: clampNumber(beatDraft.pitchOffset, 0, -6, 6),
      source: "llm"
    };
  };
  const normalizeSfxCues = (beatDraft) => {
    if (!Array.isArray(beatDraft.sfxCues)) return [];
    return beatDraft.sfxCues
      .slice(0, 6)
      .map((cue, index) => ({
        id: String(cue.id || `cue-${index + 1}`),
        kind: String(cue.kind || "ambience"),
        placement: ["beat_start", "beat_end", "key_point", "manual"].includes(cue.placement) ? cue.placement : "manual",
        offsetSeconds: clampNumber(cue.offsetSeconds, 0, -5, 5),
        levelDb: clampNumber(cue.levelDb, -16, -48, 12),
        pan: clampNumber(cue.pan, 0, -1, 1),
        proximity: ["distant", "room", "close", "close_mic"].includes(cue.proximity) ? cue.proximity : "room",
        duckMusic: cue.duckMusic === true
      }));
  };
  const normalizeEditorial = (beatDraft) => {
    const visualEditCues = Array.isArray(beatDraft.visualEditCues)
      ? beatDraft.visualEditCues.slice(0, 4).map((cue, index) => ({
          id: String(cue.id || `edit-${index + 1}`),
          type: [
            "smash_cut",
            "cut_to_black",
            "hold_black",
            "j_cut",
            "l_cut",
            "slow_pan",
            "push_in",
            "hard_cut",
            "match_cut"
          ].includes(cue.type) ? cue.type : "hard_cut",
          placement: ["beat_start", "beat_end", "key_point", "manual"].includes(cue.placement) ? cue.placement : "manual",
          offsetSeconds: clampNumber(cue.offsetSeconds, 0, -5, 5),
          durationSeconds: clampNumber(cue.durationSeconds, 0.4, 0, 8),
          target: ["black", "current_visual", "next_visual"].includes(cue.target) ? cue.target : "current_visual",
          intensity: clampNumber(cue.intensity, 0.5, 0, 1)
        }))
      : [];
    const silenceWindows = Array.isArray(beatDraft.silenceWindows)
      ? beatDraft.silenceWindows.slice(0, 2).map((window, index) => ({
          id: String(window.id || `silence-${index + 1}`),
          placement: ["beat_start", "beat_end", "before_reveal", "manual"].includes(window.placement) ? window.placement : "manual",
          offsetSeconds: clampNumber(window.offsetSeconds, 0, -5, 5),
          durationSeconds: clampNumber(window.durationSeconds, 0.8, 0.1, 5),
          muteMusic: window.muteMusic !== false,
          muteSfx: window.muteSfx !== false,
          keepVoice: window.keepVoice === true
        }))
      : [];
    const endingPolicy = beatDraft.endingPolicy && typeof beatDraft.endingPolicy === "object"
      ? {
          cutToBlack: beatDraft.endingPolicy.cutToBlack === true,
          holdSeconds: clampNumber(beatDraft.endingPolicy.holdSeconds, 0, 0, 4),
          audioPolicy: ["hard_silence", "fade_out", "none"].includes(beatDraft.endingPolicy.audioPolicy)
            ? beatDraft.endingPolicy.audioPolicy
            : "none",
          avoidOutro: beatDraft.endingPolicy.avoidOutro === true
        }
      : undefined;
    if (visualEditCues.length === 0 && silenceWindows.length === 0 && !endingPolicy) return undefined;
    return { visualEditCues, silenceWindows, endingPolicy };
  };
  const visualBible = draft.visualBible || {};
  const visualBibleSuffix = [
    visualBible.stylePreset ? `Style preset: ${visualBible.stylePreset}` : "",
    visualBible.lookAndFeel ? `Look and feel: ${visualBible.lookAndFeel}` : "",
    Array.isArray(visualBible.characterAnchors) && visualBible.characterAnchors.length > 0
      ? `Character anchors: ${visualBible.characterAnchors.join("; ")}`
      : "",
    Array.isArray(visualBible.continuityRules) && visualBible.continuityRules.length > 0
      ? `Continuity rules: ${visualBible.continuityRules.join("; ")}`
      : "",
    visualBible.negativePrompt ? `Avoid: ${visualBible.negativePrompt}` : ""
  ].filter(Boolean).join("\n");

  return {
    ...currentPlan,
    title: draft.title,
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
        speed: draft.voice?.speed ?? 0.92,
        language: draft.voice?.language || currentPlan.voice?.options?.language,
        emotion: draft.voice?.direction || "Narrate as an engaged suspense storyteller: intimate, alert, and controlled, with rising tension, crisp pacing, and quiet dread. Do not sound bored or flat."
      }
    },
    visualBible: {
      ...(currentPlan.visualBible || {}),
      ...(draft.visualBible || {})
    },
    overrides: {
      ...(currentPlan.overrides || {}),
      ...(draft.captionTuning ? {
        captionTuning: {
          ...(currentPlan.overrides?.captionTuning || {}),
          ...draft.captionTuning
        }
      } : {})
    },
    sections: draft.sections.map((section, sectionIndex) => {
      const sectionId = slugify(section.title, `section-${sectionIndex + 1}`);
      return {
        id: sectionId,
        title: section.title,
        purpose: section.purpose || section.summary || "AI planned story section",
        estimatedDurationSeconds: section.beats.reduce(
          (total, beat) => total + (beat.estimatedDurationSeconds || estimateDurationSeconds(beat.narration)),
          0
        ),
        beats: section.beats.map((beat, beatIndex) => {
          const beatNumber = String(beatIndex + 1).padStart(3, "0");
          const beatId = `${sectionId}-${beatNumber}`;
          const shotMetadata = [
            beat.shotType ? `Shot type: ${beat.shotType}` : "",
            beat.cameraDistance ? `Camera distance: ${beat.cameraDistance}` : "",
            beat.lighting ? `Lighting: ${beat.lighting}` : "",
            beat.lens ? `Lens: ${beat.lens}` : "",
            beat.composition ? `Composition: ${beat.composition}` : "",
            beat.subjectContinuity ? `Subject continuity: ${beat.subjectContinuity}` : "",
            beat.negativePromptAdditions ? `Avoid (beat-specific): ${beat.negativePromptAdditions}` : ""
          ].filter(Boolean).join("\n");
          const visualConfidence = clampNumber(beat.visualConfidence, 0.7, 0, 1);
          const conservativeVisual = visualConfidence < 0.45;
          const motionType = ["none", "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right"].includes(beat.motion)
            ? beat.motion
            : "slow_zoom_in";
          return {
            id: beatId,
            order: beatIndex + 1,
            narration: beat.narration,
            timing: {
              estimatedDurationSeconds: beat.estimatedDurationSeconds || estimateDurationSeconds(beat.narration),
              preferredMinSeconds: 4,
              preferredMaxSeconds: 20,
              mediaPolicy: "loop_or_freeze"
            },
            media: [
              {
                id: `${beatId}-visual`,
                type: "title_card",
                role: "primary_visual",
                prompt: [
                  beat.visualPrompt || beat.narration,
                  shotMetadata,
                  visualBibleSuffix,
                  conservativeVisual ? "Keep framing simple and continuity-safe. Avoid creative leaps for this beat." : ""
                ].filter(Boolean).join("\n\n"),
                scaleMode: "cover",
                placement: "background"
              }
            ],
            motion: {
              type: conservativeVisual ? "slow_zoom_in" : motionType,
              intensity: conservativeVisual ? 0.05 : 0.08
            },
            caption: { emphasis: beat.emphasis || [], style: beat.captionStyle || "default" },
            voiceDirection: normalizeVoiceDirection(beat),
            sfxCues: normalizeSfxCues(beat),
            editorial: normalizeEditorial(beat),
            notes: [beat.notes || beat.visualPrompt || "", shotMetadata, visualBibleSuffix].filter(Boolean).join("\n\n")
          };
        })
      };
    })
  };
}

function extractResponseText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI planner response did not include output text.");
}

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
  "- Add optional visualEditCues, silenceWindows, and endingPolicy for retention-focused editing only where appropriate.",
  "- Use pauses around hooks, reveals, and emotional turns. Keep them subtle unless needed.",
  "- Add optional sfxCues only when they improve clarity; keep cues sparse and practical.",
  "- Surface warnings when uncertain or under-specified."
].join("\n");

function fillPlannerTemplate(template, values) {
  const source = String(template || DEFAULT_PLANNER_USER_PROMPT_TEMPLATE);
  return source.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ""));
}

async function generatePlanDraftWithOpenAi({ story, currentPlan, feel, pacing, visualStyle, format, systemPrompt, userPromptTemplate }) {
  if (STUDIO_TEST_MODE) {
    return {
      plan: buildPlanFromAiDraft(currentPlan, {
        title: currentPlan.title || "Test Plan",
        voice: {
          voiceId: "alloy",
          speed: 0.92,
          direction: "engaged",
          language: "en"
        },
        visualBible: {
          stylePreset: "cinematic_illustration",
          lookAndFeel: "grounded",
          palette: ["#111111", "#f1f1f1"],
          eraAndLocation: "present day",
          characterAnchors: ["same protagonist"],
          continuityRules: ["keep wardrobe stable"],
          negativePrompt: "watermarks"
        },
        captionTuning: {
          targetMaxWords: 14,
          hardMaxWords: 20,
          targetMaxDurationSeconds: 5,
          hardMaxDurationSeconds: 6.5,
          minWordsBeforeSentenceBreak: 8
        },
        sections: [
          {
            title: "Intro",
            summary: "test",
            purpose: "test",
            beats: [
              {
                narration: story.split(/\s+/).slice(0, 20).join(" ") || "test narration",
                visualPrompt: "test visual",
                estimatedDurationSeconds: 3,
                motion: "slow_zoom_in",
                emphasis: ["test"],
                notes: "test",
                voiceProfile: "neutral",
                intensity: 0.5,
                pauseBeforeSeconds: 0,
                pauseAfterSeconds: 0.1,
                deliveryNote: "clear",
                speedMultiplier: 1,
                pitchOffset: 0,
                voiceConfidence: 0.8,
                visualConfidence: 0.8,
                shotType: "close up",
                cameraDistance: "medium",
                lighting: "low key",
                lens: "35mm",
                composition: "centered",
                subjectContinuity: "same subject",
                negativePromptAdditions: "none",
                captionStyle: "default",
                sfxCues: []
              }
            ]
          }
        ],
        warnings: []
      }),
      warnings: [],
      model: "test-mode"
    };
  }
  const apiKey = await getOpenAiApiKey();
  const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
  const promptValues = {
    story,
    currentTitle: currentPlan.title,
    feel,
    pacing,
    visualStyle,
    format,
    target: "short horror/story video with per-beat narration and image-generation-ready visual prompts"
  };
  const resolvedSystemPrompt = String(systemPrompt || DEFAULT_PLANNER_SYSTEM_PROMPT).trim() || DEFAULT_PLANNER_SYSTEM_PROMPT;
  let resolvedUserPrompt = fillPlannerTemplate(userPromptTemplate, promptValues).trim();
  if (!resolvedUserPrompt.includes(promptValues.story)) {
    resolvedUserPrompt = `${resolvedUserPrompt}\n\nStory:\n${promptValues.story}`.trim();
  }
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: resolvedSystemPrompt
        },
        {
          role: "user",
          content: resolvedUserPrompt
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "video_plan_draft",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "voice", "visualBible", "sections", "warnings"],
            properties: {
              title: { type: "string" },
              captionTuning: {
                type: "object",
                additionalProperties: false,
                properties: {
                  targetMaxWords: { type: "number" },
                  hardMaxWords: { type: "number" },
                  targetMaxDurationSeconds: { type: "number" },
                  hardMaxDurationSeconds: { type: "number" },
                  minWordsBeforeSentenceBreak: { type: "number" }
                }
              },
              voice: {
                type: "object",
                additionalProperties: false,
                required: ["voiceId", "speed", "direction", "language"],
                properties: {
                  voiceId: { type: "string", enum: ["alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse"] },
                  speed: { type: "number" },
                  direction: { type: "string" },
                  language: { type: "string" }
                }
              },
              visualBible: {
                type: "object",
                additionalProperties: false,
                required: ["stylePreset", "lookAndFeel", "palette", "eraAndLocation", "characterAnchors", "continuityRules", "negativePrompt"],
                properties: {
                  stylePreset: { type: "string" },
                  lookAndFeel: { type: "string" },
                  palette: { type: "array", items: { type: "string" } },
                  eraAndLocation: { type: "string" },
                  characterAnchors: { type: "array", items: { type: "string" } },
                  continuityRules: { type: "array", items: { type: "string" } },
                  negativePrompt: { type: "string" }
                }
              },
              sections: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "summary", "purpose", "beats"],
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    purpose: { type: "string" },
                    beats: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["narration", "visualPrompt", "estimatedDurationSeconds", "motion", "emphasis", "notes", "voiceProfile", "intensity", "pauseBeforeSeconds", "pauseAfterSeconds", "deliveryNote", "speedMultiplier", "pitchOffset", "voiceConfidence", "visualConfidence"],
                        properties: {
                          narration: { type: "string" },
                          visualPrompt: { type: "string" },
                          estimatedDurationSeconds: { type: "number" },
                          motion: { type: "string", enum: ["none", "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right"] },
                          emphasis: { type: "array", items: { type: "string" } },
                          notes: { type: "string" },
                          voiceProfile: { type: "string", enum: ["neutral", "warm_open", "clear_explainer", "authoritative", "energetic", "key_point", "reflective", "tense", "reveal", "urgent", "soft_close"] },
                          intensity: { type: "number" },
                          pauseBeforeSeconds: { type: "number" },
                          pauseAfterSeconds: { type: "number" },
                          deliveryNote: { type: "string" },
                          speedMultiplier: { type: "number" },
                          pitchOffset: { type: "number" },
                          voiceConfidence: { type: "number" },
                          visualConfidence: { type: "number" },
                          captionStyle: { type: "string" },
                          shotType: { type: "string" },
                          cameraDistance: { type: "string" },
                          lighting: { type: "string" },
                          lens: { type: "string" },
                          composition: { type: "string" },
                          subjectContinuity: { type: "string" },
                          negativePromptAdditions: { type: "string" },
                          sfxCues: {
                            type: "array",
                            items: {
                              type: "object",
                              additionalProperties: false,
                              required: ["id", "kind", "placement", "offsetSeconds", "levelDb"],
                              properties: {
                                id: { type: "string" },
                                kind: { type: "string" },
                                placement: { type: "string", enum: ["beat_start", "beat_end", "key_point", "manual"] },
                                offsetSeconds: { type: "number" },
                                levelDb: { type: "number" },
                                pan: { type: "number" },
                                proximity: { type: "string", enum: ["distant", "room", "close", "close_mic"] },
                                duckMusic: { type: "boolean" }
                              }
                            }
                          },
                          visualEditCues: {
                            type: "array",
                            items: {
                              type: "object",
                              additionalProperties: false,
                              required: ["id", "type", "placement", "offsetSeconds", "durationSeconds", "target", "intensity"],
                              properties: {
                                id: { type: "string" },
                                type: { type: "string", enum: ["smash_cut", "cut_to_black", "hold_black", "j_cut", "l_cut", "slow_pan", "push_in", "hard_cut", "match_cut"] },
                                placement: { type: "string", enum: ["beat_start", "beat_end", "key_point", "manual"] },
                                offsetSeconds: { type: "number" },
                                durationSeconds: { type: "number" },
                                target: { type: "string", enum: ["black", "current_visual", "next_visual"] },
                                intensity: { type: "number" }
                              }
                            }
                          },
                          silenceWindows: {
                            type: "array",
                            items: {
                              type: "object",
                              additionalProperties: false,
                              required: ["id", "placement", "offsetSeconds", "durationSeconds", "muteMusic", "muteSfx", "keepVoice"],
                              properties: {
                                id: { type: "string" },
                                placement: { type: "string", enum: ["beat_start", "beat_end", "before_reveal", "manual"] },
                                offsetSeconds: { type: "number" },
                                durationSeconds: { type: "number" },
                                muteMusic: { type: "boolean" },
                                muteSfx: { type: "boolean" },
                                keepVoice: { type: "boolean" }
                              }
                            }
                          },
                          endingPolicy: {
                            type: "object",
                            additionalProperties: false,
                            required: ["cutToBlack", "holdSeconds", "audioPolicy", "avoidOutro"],
                            properties: {
                              cutToBlack: { type: "boolean" },
                              holdSeconds: { type: "number" },
                              audioPolicy: { type: "string", enum: ["hard_silence", "fade_out", "none"] },
                              avoidOutro: { type: "boolean" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              warnings: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI planner request failed: ${response.status} ${body.slice(0, 300)}`);
  }
  const text = extractResponseText(await response.json());
  const draft = JSON.parse(text);
  return {
    plan: buildPlanFromAiDraft(currentPlan, draft),
    warnings: draft.warnings,
    model
  };
}

async function readImageHistory(projectId) {
  const logPath = path.join(imageHistoryDir, `${projectId}.ndjson`);
  const raw = await readFile(logPath, "utf8").catch(() => "");
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter(Boolean)
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}

async function appendImageHistory(projectId, entry) {
  await mkdir(imageHistoryDir, { recursive: true });
  const logPath = path.join(imageHistoryDir, `${projectId}.ndjson`);
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function imageCacheEntryFromHistory(projectId, entry) {
  const narration = narrationFromImagePrompt(entry.prompt);
  return {
    projectId,
    assetId: entry.assetId,
    beatId: entry.beatId,
    rootPath: path.join("content", "projects", projectId, entry.path),
    inputHash: entry.inputHash,
    reuseKey: entry.reuseKey ?? (narration ? imageReuseKey({
      narration,
      size: entry.size,
      quality: entry.quality,
      model: entry.model
    }) : undefined),
    model: entry.model,
    size: entry.size,
    quality: entry.quality,
    prompt: entry.prompt,
    generatedAt: entry.generatedAt
  };
}

async function readImageCacheEntries() {
  const cacheRaw = await readFile(imageCachePath, "utf8").catch(() => "");
  const cacheEntries = cacheRaw.trim()
    ? cacheRaw.trim().split("\n").map((line) => JSON.parse(line)).filter(Boolean)
    : [];

  const historyFiles = await readdir(imageHistoryDir, { withFileTypes: true }).catch(() => []);
  const historyEntries = [];
  for (const file of historyFiles) {
    if (!file.isFile() || !file.name.endsWith(".ndjson")) continue;
    const projectId = path.basename(file.name, ".ndjson");
    const entries = await readImageHistory(projectId);
    historyEntries.push(...entries.map((entry) => imageCacheEntryFromHistory(projectId, entry)));
  }

  return [...cacheEntries, ...historyEntries];
}

async function findReusableImage(query) {
  const selected = selectCachedImage(await readImageCacheEntries(), query);
  if (!selected) return undefined;
  const absolutePath = path.resolve(rootDir, selected.rootPath);
  if (!absolutePath.startsWith(rootDir + path.sep)) return undefined;
  if (!(await stat(absolutePath).catch(() => null))) return undefined;
  return { ...selected, absolutePath };
}

async function appendImageCacheEntry(entry) {
  await mkdir(path.dirname(imageCachePath), { recursive: true });
  await appendFile(imageCachePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function runStatePath(projectId) {
  return path.join(rootDir, ".studio-data", "run-state", `${projectId}.json`);
}

function parseRunTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function normalizeRunState(raw = {}) {
  const jobs = Array.isArray(raw.jobs) ? raw.jobs.filter((job) => job && typeof job === "object" && job.jobId) : [];
  if (raw.progress?.jobId && !jobs.some((job) => job.jobId === raw.progress.jobId)) jobs.push(raw.progress);
  jobs.sort((a, b) => parseRunTime(b.startedAt || b.updatedAt || b.finishedAt) - parseRunTime(a.startedAt || a.updatedAt || a.finishedAt));
  const trimmed = jobs.slice(0, 30);
  const active = trimmed.find((job) => ["queued", "running"].includes(job.status)) ?? trimmed[0] ?? null;
  const status = active && ["queued", "running"].includes(active.status)
    ? "queued"
    : active?.status === "failed"
      ? "failed"
      : "idle";
  return {
    status,
    lastRenderPlanHash: raw.lastRenderPlanHash,
    lastRenderTimelineHash: raw.lastRenderTimelineHash,
    lastRenderQuality: raw.lastRenderQuality,
    lastRenderCompletedAt: raw.lastRenderCompletedAt,
    currentPlanHash: raw.currentPlanHash,
    currentTimelineHash: raw.currentTimelineHash,
    updatedAt: raw.updatedAt,
    jobs: trimmed,
    activeJobId: active?.jobId,
    progress: active
  };
}

async function readRunState(projectId) {
  return normalizeRunState(await safeReadJson(runStatePath(projectId)).catch(() => ({})));
}

async function writeRunState(projectId, state) {
  const filePath = runStatePath(projectId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalizeRunState(state), null, 2)}\n`, "utf8");
}

async function upsertRunJob(projectId, job) {
  const state = await readRunState(projectId);
  const jobs = [...(state.jobs ?? []).filter((entry) => entry.jobId !== job.jobId), job];
  await writeRunState(projectId, {
    ...state,
    jobs,
    updatedAt: new Date().toISOString()
  });
}

async function updateRunProgress(projectId, patch) {
  const state = await readRunState(projectId);
  if (patch?.progress?.kind) {
    const current = state.jobs?.find((job) => job.jobId === patch.progress.jobId || job.kind === patch.progress.kind);
    const startedAt = current?.startedAt || new Date().toISOString();
    const phase = patch.progress.phase || "running";
    const terminal = ["complete", "completed", "failed", "stopped"].includes(phase);
    const job = {
      ...current,
      ...patch.progress,
      jobId: patch.progress.jobId || current?.jobId || `run-${patch.progress.kind}`,
      status: terminal
        ? (phase === "failed" ? "failed" : "completed")
        : "running",
      startedAt,
      finishedAt: terminal ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString()
    };
    await upsertRunJob(projectId, job);
    return;
  }
  await writeRunState(projectId, { ...state, ...patch, updatedAt: new Date().toISOString() });
}

function nextImageVersion(history, assetId) {
  return history
    .filter((entry) => entry.assetId === assetId)
    .reduce((max, entry) => Math.max(max, Number(entry.version) || 0), 0) + 1;
}

async function generateImageWithOpenAi({ prompt, size, quality, timeoutMs = 90_000 }) {
  const apiKey = await getOpenAiApiKey();
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        quality,
        n: 1
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI image request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI image request failed: ${response.status} ${body.slice(0, 500)}`);
  }
  const json = await response.json();
  const image = json.data?.[0];
  if (image?.b64_json) {
    return { bytes: Buffer.from(image.b64_json, "base64"), model };
  }
  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error(`OpenAI image URL fetch failed: ${imageResponse.status}`);
    return { bytes: Buffer.from(await imageResponse.arrayBuffer()), model };
  }
  throw new Error("OpenAI image response did not include image data.");
}

async function generateProjectImages(projectId, options = {}) {
  const projectDir = path.join(projectsDir, projectId);
  const plan = await safeReadJson(path.join(projectDir, "video-plan.json"));
  const manifestPath = path.join(projectDir, "asset-manifest.json");
  const manifest = await safeReadJson(manifestPath).catch(() => ({ schemaVersion: 1, assets: [] }));
  const history = await readImageHistory(projectId);
  const mode = options.mode === "selected" ? "selected" : options.mode === "missing" ? "missing" : "all";
  const coverage = options.coverage === "beat" ? "beat" : "section";
  const size = options.size || "1024x1536";
  const quality = options.quality || "low";
  const promptOverrides = options.promptOverrides && typeof options.promptOverrides === "object" ? options.promptOverrides : {};
  const targets = selectImageTargets(plan, manifest, mode, coverage, options);
  const limitedTargets = targets;

  if (limitedTargets.length === 0) {
    return { generated: [], failed: [], skipped: "No image targets matched the selected mode." };
  }

  const generatedDir = path.join(projectDir, "assets", "images", "generated");
  await mkdir(generatedDir, { recursive: true });
  const generated = [];
  const failed = [];
  let nextAssets = [...(manifest.assets ?? [])];
  let completed = 0;
  const imageConcurrency = envConcurrency("LVSTUDIO_IMAGE_CONCURRENCY", 2);
  await updateRunProgress(projectId, {
    status: "generating_images",
    progress: {
      kind: "image_generation",
      phase: "starting",
      completed: 0,
      total: limitedTargets.length,
      generated: 0,
      failed: 0,
      coverage
    }
  });

  const imageResults = await mapWithConcurrency(limitedTargets, imageConcurrency, async (target) => {
    const prompt = String(promptOverrides[target.assetId] || options.prompt || target.defaultPrompt).trim();
    if (!prompt) return { target, skipped: true };
    const hasPromptOverride = Boolean(promptOverrides[target.assetId] || options.prompt);
    await updateRunProgress(projectId, {
      status: "generating_images",
      progress: {
        kind: "image_generation",
        phase: "generating",
        completed,
        total: limitedTargets.length,
        generated: generated.length,
        failed: failed.length,
        coverage,
        currentAssetId: target.assetId,
        currentBeatId: target.beat.id,
        currentSectionId: target.section.id,
        currentSectionTitle: target.section.title
      }
    });
    const version = nextImageVersion(history, target.assetId);
    const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
    const inputHash = sha256(JSON.stringify({ prompt, size, quality, model }));
    const reuseKey = imageReuseKey({ narration: target.beat.narration, size, quality, model });
    const fileName = `${target.beat.id}.v${version}.${inputHash.slice(0, 10)}.png`;
    const absolutePath = path.join(generatedDir, fileName);
    const cached = await findReusableImage({
      inputHash,
      reuseKey,
      size,
      quality,
      model,
      allowNarrationReuse: !hasPromptOverride
    });
    let result;
    let reusedFrom;
    if (cached) {
      await writeFile(absolutePath, await readFile(cached.absolutePath));
      result = { model: cached.model };
      reusedFrom = cached.rootPath;
    } else {
      try {
        result = await generateImageWithOpenAi({ prompt, size, quality });
        await writeFile(absolutePath, result.bytes);
      } catch (error) {
        completed += 1;
        const failure = {
          assetId: target.assetId,
          sectionId: target.section.id,
          beatId: target.beat.id,
          prompt,
          error: error instanceof Error ? error.message : String(error)
        };
        failed.push(failure);
        await updateRunProgress(projectId, {
          status: "generating_images",
          progress: {
            kind: "image_generation",
            phase: "failed",
            completed,
            total: limitedTargets.length,
            generated: generated.length,
            failed: failed.length,
            coverage,
            currentAssetId: target.assetId,
            currentBeatId: target.beat.id,
            currentSectionId: target.section.id,
            currentSectionTitle: target.section.title
          }
        });
        return { target, failure };
      }
    }
    const relativePath = path.relative(projectDir, absolutePath);
    const now = new Date().toISOString();
    const dimensions = dimensionsFromSize(size);
    const asset = {
      id: target.assetId,
      type: "image",
      role: "primary_visual",
      sectionId: target.section.id,
      beatId: target.beat.id,
      path: relativePath,
      source: {
        kind: reusedFrom ? "cached" : "generated",
        provider: "openai-image",
        inputHash,
        originalPath: reusedFrom,
        prompt
      },
      ...dimensions,
      status: "generated",
      createdAt: (manifest.assets ?? []).find((item) => item.id === target.assetId)?.createdAt ?? now,
      updatedAt: now
    };
    const historyEntry = {
      assetId: target.assetId,
      sectionId: target.section.id,
      beatId: target.beat.id,
      prompt,
      path: relativePath,
      version,
      model: result.model,
      size,
      quality,
      inputHash,
      reuseKey,
      reusedFrom,
      generatedAt: now
    };
    completed += 1;
    generated.push(historyEntry);
    await updateRunProgress(projectId, {
      status: "generating_images",
      progress: {
        kind: "image_generation",
        phase: "generated",
        completed,
        total: limitedTargets.length,
        generated: generated.length,
        failed: failed.length,
        coverage,
        currentAssetId: target.assetId,
        currentBeatId: target.beat.id,
        currentSectionId: target.section.id,
        currentSectionTitle: target.section.title
      }
    });
    const cacheEntry = {
      projectId,
      assetId: target.assetId,
      beatId: target.beat.id,
      rootPath: path.relative(rootDir, absolutePath),
      inputHash,
      reuseKey,
      model: result.model,
      size,
      quality,
      prompt,
      generatedAt: now
    };
    return { target, asset, historyEntry, cacheEntry };
  });

  for (const item of imageResults) {
    if (!item?.asset) continue;
    nextAssets = nextAssets.filter(
      (asset) =>
        asset.id !== item.asset.id &&
        !(asset.beatId === item.target.beat.id && asset.role === "primary_visual" && asset.source?.provider === "openai-image")
    );
    const firstBeatMediaIndex = nextAssets.findIndex((asset) => asset.beatId === item.target.beat.id && asset.role !== "voiceover");
    if (firstBeatMediaIndex === -1) nextAssets.push(item.asset);
    else nextAssets.splice(firstBeatMediaIndex, 0, item.asset);
    await appendImageHistory(projectId, item.historyEntry);
    await appendImageCacheEntry(item.cacheEntry);
  }

  if (mode !== "selected" && coverage === "section") {
    const allTargets = imageTargetsFromPlan(plan);
    const generatedOrExisting = (target) =>
      nextAssets.find((asset) => asset.id === target.assetId && asset.role === "primary_visual") ??
      nextAssets.find((asset) => asset.beatId === target.beat.id && asset.role === "primary_visual");
    const keyAssetsBySection = new Map();
    for (const target of allTargets) {
      const asset = generatedOrExisting(target);
      if (asset?.source?.provider === "openai-image" && !keyAssetsBySection.has(target.section.id)) {
        keyAssetsBySection.set(target.section.id, asset);
      }
    }
    const now = new Date().toISOString();
    for (const target of allTargets) {
      if (generatedOrExisting(target)) continue;
      const sourceAsset = keyAssetsBySection.get(target.section.id);
      if (!sourceAsset) continue;
      nextAssets.push({
        id: target.assetId,
        type: "image",
        role: "primary_visual",
        sectionId: target.section.id,
        beatId: target.beat.id,
        path: sourceAsset.path,
        source: {
          kind: "generated",
          provider: "openai-image",
          inputHash: `reused:${sourceAsset.id}`,
          prompt: target.defaultPrompt
        },
        width: sourceAsset.width,
        height: sourceAsset.height,
        status: "generated",
        createdAt: now,
        updatedAt: now
      });
    }
  }

  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, assets: nextAssets }, null, 2)}\n`, "utf8");
  const syncResult = await runLvstudio(["sync", projectId]);
  await appendQualityHistory(projectId, {
    timestamp: new Date().toISOString(),
    kind: "image_generation",
    summary: `Generated ${generated.length} OpenAI image asset(s); ${failed.length} failed.`,
    output: [
      syncResult.stdout.trim(),
      failed.length > 0 ? `Image failures:\n${JSON.stringify(failed, null, 2)}` : ""
    ].filter(Boolean).join("\n\n")
  });
  await updateRunProgress(projectId, {
    status: "idle",
    progress: {
      kind: "image_generation",
      phase: "complete",
      completed: limitedTargets.length,
      total: limitedTargets.length,
      generated: generated.length,
      failed: failed.length,
      coverage
    }
  });
  return {
    generated,
    failed,
    requested: targets.length,
    attempted: limitedTargets.length,
    coverage,
    remaining: coverage === "beat" ? 0 : imageTargetsFromPlan(plan).filter((target) => {
      const hasAsset = nextAssets.some((asset) => asset.role === "primary_visual" && asset.beatId === target.beat.id);
      return !hasAsset;
    }).length,
    syncOutput: syncResult.stdout.trim()
  };
}

async function deleteProjectAsset(projectId, assetId) {
  const projectDir = path.join(projectsDir, projectId);
  const manifestPath = path.join(projectDir, "asset-manifest.json");
  const manifest = await safeReadJson(manifestPath);
  const before = manifest.assets.length;
  const nextAssets = manifest.assets.filter((asset) => asset.id !== assetId);
  if (nextAssets.length === before) {
    throw new Error(`Asset not found: ${assetId}`);
  }
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, assets: nextAssets }, null, 2)}\n`, "utf8");
  const syncResult = await runLvstudio(["sync", projectId]);
  await appendQualityHistory(projectId, {
    timestamp: new Date().toISOString(),
    kind: "asset_delete",
    summary: `Deleted asset ${assetId}.`,
    output: syncResult.stdout.trim()
  });
  return { assetId, syncOutput: syncResult.stdout.trim() };
}

const lockableTransitions = new Set([
  "generated:locked_by_user",
  "edited:locked_by_user",
  "stale:locked_by_user",
  "locked_by_user:generated"
]);

async function updateProjectAssetStatus(projectId, assetId, nextStatus) {
  const projectDir = path.join(projectsDir, projectId);
  const manifestPath = path.join(projectDir, "asset-manifest.json");
  const manifest = await safeReadJson(manifestPath);
  const asset = manifest.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Asset not found: ${assetId}`);
  const transition = `${asset.status}:${nextStatus}`;
  if (!lockableTransitions.has(transition)) {
    throw new Error(`Unsupported status transition ${transition}.`);
  }
  asset.status = nextStatus;
  asset.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const syncResult = await runLvstudio(["sync", projectId]);
  return { asset, syncOutput: syncResult.stdout.trim() };
}

async function runBeatRegenerateJob(projectId, beatId, options = {}) {
  const details = await getProjectDetails(projectId);
  const plan = details.plan;
  const section = (plan.sections ?? []).find((entry) => (entry.beats ?? []).some((beat) => beat.id === beatId));
  if (!section) throw new Error(`Beat not found: ${beatId}`);
  const force = options.force === true;
  const job = {
    id: `beat-${Date.now().toString(36)}`,
    beatId,
    sectionId: section.id,
    status: "queued",
    phase: "queued",
    label: "Queued beat regeneration",
    completed: 0,
    total: (options.audio !== false ? 1 : 0) + (options.image !== false ? 1 : 0) + (options.captions !== false && options.audio !== false ? 2 : 0) + (options.render === true ? 1 : 0),
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    error: undefined,
    output: []
  };
  if (job.total === 0) job.total = 1;

  activeBeatJobs.set(projectId, job);
  await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: new Date().toISOString() });

  runProjectMutation(projectId, async () => {
    try {
      const runStep = async (phase, label, operation) => {
        job.status = "running";
        job.phase = phase;
        job.label = label;
        await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: new Date().toISOString() });
        const result = await operation();
        if (result?.stdout?.trim()) job.output.push(`${label}:\n${result.stdout.trim()}`);
        job.completed += 1;
        await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: new Date().toISOString() });
      };

      if (options.audio !== false) {
        await runStep("audio", "Regenerate beat narration", () => runLvstudio([
          "generate:tts",
          projectId,
          "--provider",
          plan.providers.tts,
          "--only-beat",
          beatId,
          ...(force ? ["--force"] : [])
        ]));
      }
      if (options.audio !== false) {
        await runStep("sync", "Sync timeline", () => runLvstudio(["sync", projectId]));
      }
      if (options.image !== false) {
        await runStep("images", "Regenerate beat image", async () => {
          const result = await generateProjectImages(projectId, {
            mode: "selected",
            assetId: `image-${beatId}`,
            prompt: options.prompt,
            quality: options.quality ?? "low",
            size: "1024x1536",
            force
          });
          return { stdout: `Image regenerate: generated ${result.generated.length}, failed ${result.failed.length}.` };
        });
      }
      if (options.captions !== false && options.audio !== false) {
        await runStep("transcribe", "Transcribe narration", () => runLvstudio(["transcribe", projectId, "--provider", plan.providers.transcription]));
        await runStep("captions", "Generate captions", () => runLvstudio(["captions", projectId]));
      }
      if (options.render === true) {
        await runStep("render", "Render draft", () => runLvstudio(["render", projectId, "--quality", "draft", "--force"]));
      }

      job.status = "completed";
      job.phase = "done";
      job.label = "Beat regeneration complete";
      job.finishedAt = new Date().toISOString();
      const output = job.output.join("\n\n").trim();
      await appendQualityHistory(projectId, {
        timestamp: job.finishedAt,
        kind: "beat_regenerate",
        summary: `Regenerated beat ${beatId}.`,
        output
      });
      await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: new Date().toISOString() });
      activeBeatJobs.delete(projectId);
    } catch (error) {
      job.status = "failed";
      job.phase = "failed";
      job.label = "Beat regeneration failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date().toISOString();
      job.output.push(`Beat regeneration failed:\n${job.error}`);
      await appendQualityHistory(projectId, {
        timestamp: job.finishedAt,
        kind: "beat_regenerate_failed",
        summary: `Beat regeneration failed for ${beatId}.`,
        output: job.output.join("\n\n").trim()
      }).catch(() => {});
      await upsertRunJob(projectId, { ...beatJobProgress(job), updatedAt: new Date().toISOString() });
      activeBeatJobs.delete(projectId);
    }
  }).catch(() => {});

  return beatJobProgress(job);
}

async function readQualityHistory(projectId) {
  const logPath = path.join(qualityHistoryDir, `${projectId}.ndjson`);
  const raw = await readFile(logPath, "utf8").catch(() => "");
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter(Boolean)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function isDraftJobHistory(entry) {
  return entry?.kind === "draft_job" || entry?.kind === "draft_job_failed" || entry?.kind === "beat_regenerate" || entry?.kind === "beat_regenerate_failed";
}

async function listDraftJobs(projectId) {
  const runState = await readRunState(projectId);
  const active = activeDraftJobs.get(projectId);
  const activeBeat = activeBeatJobs.get(projectId);
  const history = (await readQualityHistory(projectId))
    .filter(isDraftJobHistory)
    .slice(0, 12)
    .map((entry) => ({
      id: `${entry.kind}-${sha256(`${entry.timestamp}-${entry.summary}`).slice(0, 8)}`,
      status: entry.kind.endsWith("_failed") ? "failed" : "completed",
      startedAt: entry.timestamp,
      finishedAt: entry.timestamp,
      label: entry.summary,
      output: entry.output ?? "",
      kind: entry.kind
    }));

  const runStateJob = (runState.jobs ?? []).find((job) => ["draft_job", "beat_regenerate_job"].includes(job.kind));
  const liveJobs = [];
  if (active) {
    const current = jobProgress(active);
    liveJobs.push({
      id: current.jobId,
      status: current.status,
      startedAt: current.startedAt,
      finishedAt: current.finishedAt,
      label: current.label,
      output: current.output ?? "",
      kind: "draft_job_live",
      error: current.error,
      completed: current.completed,
      total: current.total,
      currentSectionTitle: current.currentSectionTitle
    });
  }
  if (activeBeat) {
    const current = beatJobProgress(activeBeat);
    liveJobs.push({
      id: current.jobId,
      status: current.status,
      startedAt: current.startedAt,
      finishedAt: current.finishedAt,
      label: current.label,
      output: current.output ?? "",
      kind: "beat_regenerate_job_live",
      error: current.error,
      completed: current.completed,
      total: current.total,
      currentSectionTitle: current.beatId
    });
  }
  if (liveJobs.length === 0 && runStateJob) {
    liveJobs.push({
      id: runStateJob.jobId,
      status: runStateJob.status,
      startedAt: runStateJob.startedAt,
      finishedAt: runStateJob.finishedAt,
      label: runStateJob.label,
      output: runStateJob.output ?? "",
      kind: `${runStateJob.kind}_runstate`,
      error: runStateJob.error,
      completed: runStateJob.completed,
      total: runStateJob.total,
      currentSectionTitle: runStateJob.currentSectionTitle ?? runStateJob.beatId
    });
  }
  const jobs = [...liveJobs, ...history.filter((item) => !liveJobs.some((live) => live.id === item.id))];
  return { jobs };
}

async function appendQualityHistory(projectId, entry) {
  await mkdir(qualityHistoryDir, { recursive: true });
  const logPath = path.join(qualityHistoryDir, `${projectId}.ndjson`);
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function appendCommandLog(entry) {
  await mkdir(path.dirname(commandLogPath), { recursive: true });
  await appendFile(commandLogPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, "utf8");
}

function safeProjectPath(projectId, relativeAssetPath) {
  const projectDir = path.join(projectsDir, projectId);
  const normalized = path.normalize(relativeAssetPath);
  const absolute = path.resolve(projectDir, normalized);
  if (!absolute.startsWith(projectDir + path.sep)) return null;
  return absolute;
}

async function sendVideoFile(req, res, filePath, contentType) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    return sendJson(res, 404, { ok: false, message: "Render not found." });
  }

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      "accept-ranges": "bytes",
      "content-length": fileStat.size,
      "content-type": contentType
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "content-range": `bytes */${fileStat.size}` });
    return res.end();
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileStat.size - 1;
  if (start > end || end >= fileStat.size) {
    res.writeHead(416, { "content-range": `bytes */${fileStat.size}` });
    return res.end();
  }

  res.writeHead(206, {
    "accept-ranges": "bytes",
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${fileStat.size}`,
    "content-type": contentType
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(filePath, { start, end }).pipe(res);
}

async function listProjects() {
  const entries = await readdir(projectsDir, { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    try {
      const project = await safeReadJson(path.join(projectsDir, id, "project.json"));
      const plan = await safeReadJson(path.join(projectsDir, id, "video-plan.json"));
      projects.push({
        id: project.id,
        title: project.title,
        status: project.status,
        mode: plan.mode,
        targetPlatform: plan.targetPlatform,
        updatedAt: project.updatedAt
      });
    } catch {
      // Skip invalid project folders.
    }
  }
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

async function runLvstudio(args) {
  if (STUDIO_TEST_MODE) {
    return runLvstudioTestMode(args);
  }
  const command = ["pnpm", "lvstudio", ...args].join(" ");
  const startedAt = Date.now();
  try {
    const settings = await readVoiceSettings();
    const { stdout, stderr } = await execFileAsync("pnpm", ["lvstudio", ...args], {
      cwd: rootDir,
      env: { ...process.env, ...voiceSettingsEnv(settings) }
    });
    await appendCommandLog({
      command,
      ok: true,
      durationMs: Date.now() - startedAt,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    });
    return { stdout, stderr };
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    const exitCode = typeof error.code === "number" || typeof error.code === "string" ? error.code : undefined;
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
    const message = [
      `Command failed: ${command}`,
      exitCode !== undefined ? `Exit code: ${exitCode}` : "",
      output || (error instanceof Error ? error.message : "lvstudio command failed.")
    ].filter(Boolean).join("\n\n");
    await appendCommandLog({
      command,
      ok: false,
      exitCode,
      durationMs: Date.now() - startedAt,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      message
    });
    throw new Error(message);
  }
}

async function runLvstudioTestMode(args) {
  const command = args[0];
  const projectId = args[1];
  if (!projectId && command !== "create") return { stdout: "ok", stderr: "" };
  const projectDir = projectId ? path.join(projectsDir, projectId) : null;
  const now = new Date().toISOString();

  if (command === "create") {
    const mode = args[3] || "short_story";
    const plan = {
      schemaVersion: 1,
      title: projectId,
      mode,
      targetPlatform: "local_only",
      stylePackId: "default",
      providers: { llm: "manual", tts: "chatterbox", transcription: "mock", media: "manual-media", renderer: "remotion" },
      voice: { provider: "chatterbox", voiceId: "clone", format: "wav", options: { speed: 0.92 } },
      sections: [{ id: "intro", title: "Intro", beats: [{ id: "intro-001", order: 1, narration: "Test narration.", timing: { mediaPolicy: "loop_or_freeze", locked: false }, media: [], motion: { type: "none", intensity: 0 }, caption: { emphasis: [], style: "default" }, sfxCues: [] }] }]
    };
    await mkdir(projectDir, { recursive: true });
    await mkdir(path.join(projectDir, "captions"), { recursive: true });
    await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
    await mkdir(path.join(projectDir, "renders"), { recursive: true });
    await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify({ schemaVersion: 1, id: projectId, title: projectId, createdAt: now, updatedAt: now, status: "draft" }, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "video-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    await writeFile(path.join(projectDir, "asset-manifest.json"), `${JSON.stringify({ schemaVersion: 1, assets: [] }, null, 2)}\n`, "utf8");
    return { stdout: "created", stderr: "" };
  }

  if (command === "sync") {
    const plan = await safeReadJson(path.join(projectDir, "video-plan.json"));
    const segments = [];
    let cursor = 0;
    for (const section of plan.sections ?? []) {
      for (const beat of section.beats ?? []) {
        const durationSeconds = beat.timing?.estimatedDurationSeconds || 3;
        segments.push({
          sectionId: section.id,
          beatId: beat.id,
          startSeconds: cursor,
          endSeconds: cursor + durationSeconds,
          durationSeconds,
          voiceAssetId: `voice-${beat.id}`,
          mediaAssetIds: [],
          audioCues: [],
          renderPolicy: { mediaPolicy: beat.timing?.mediaPolicy || "loop_or_freeze", scaleMode: "cover" }
        });
        cursor += durationSeconds;
      }
    }
    const timeline = { schemaVersion: 1, generatedAt: now, sourcePlanHash: sha256(JSON.stringify(plan)), fps: 30, width: 1080, height: 1920, durationSeconds: Math.max(1, cursor), segments };
    await writeFile(path.join(projectDir, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
    return { stdout: "synced", stderr: "" };
  }

  if (command === "generate:tts") {
    const plan = await safeReadJson(path.join(projectDir, "video-plan.json"));
    const manifestPath = path.join(projectDir, "asset-manifest.json");
    const manifest = await safeReadJson(manifestPath).catch(() => ({ schemaVersion: 1, assets: [] }));
    for (const section of plan.sections ?? []) {
      for (const beat of section.beats ?? []) {
        const rel = path.join("assets", "audio", "voice", `${beat.id}.wav`);
        await mkdir(path.dirname(path.join(projectDir, rel)), { recursive: true });
        await writeFile(path.join(projectDir, rel), "stub", "utf8");
        manifest.assets = (manifest.assets || []).filter((asset) => asset.id !== `voice-${beat.id}`);
        manifest.assets.push({
          id: `voice-${beat.id}`,
          type: "audio",
          role: "voiceover",
          sectionId: section.id,
          beatId: beat.id,
          path: rel,
          source: { kind: "generated", provider: "test", inputHash: "test" },
          durationSeconds: beat.timing?.estimatedDurationSeconds || 3,
          status: "generated",
          createdAt: now,
          updatedAt: now
        });
      }
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { stdout: "tts", stderr: "" };
  }

  if (command === "transcribe") {
    const timeline = await safeReadJson(path.join(projectDir, "timeline.json"));
    const words = [];
    const segments = [];
    for (const segment of timeline.segments ?? []) {
      const text = "test line";
      segments.push({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, text });
      words.push({ word: "test", startSeconds: segment.startSeconds, endSeconds: segment.startSeconds + 0.5, confidence: 1 });
      words.push({ word: "line", startSeconds: segment.startSeconds + 0.5, endSeconds: segment.startSeconds + 1, confidence: 1 });
    }
    const transcript = { schemaVersion: 1, status: "generated", source: { provider: "mock", audioAssetIds: [] }, text: "test line", durationSeconds: timeline.durationSeconds, segments, words };
    await mkdir(path.join(projectDir, "captions"), { recursive: true });
    await writeFile(path.join(projectDir, "captions", "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`, "utf8");
    return { stdout: "transcribed", stderr: "" };
  }

  if (command === "captions") {
    const timeline = await safeReadJson(path.join(projectDir, "timeline.json"));
    const captions = (timeline.segments || []).map((segment, index) => ({
      id: `caption-${index + 1}`,
      beatId: segment.beatId,
      startSeconds: segment.startSeconds,
      endSeconds: Math.min(segment.endSeconds, segment.startSeconds + 1.5),
      text: "test line",
      style: "default",
      words: []
    }));
    await writeFile(path.join(projectDir, "captions", "captions.json"), `${JSON.stringify({ schemaVersion: 1, status: "generated", source: { transcriptionProvider: "mock", audioAssetIds: [] }, captions }, null, 2)}\n`, "utf8");
    return { stdout: "captions", stderr: "" };
  }

  if (command === "render") {
    await mkdir(path.join(projectDir, "renders"), { recursive: true });
    await writeFile(path.join(projectDir, "renders", "draft.mp4"), "stub", "utf8");
    return { stdout: "rendered", stderr: "" };
  }

  if (command === "check") return { stdout: "{\"status\":\"pass\",\"checks\":[]}", stderr: "" };
  if (command === "review") return { stdout: "{\"issues\":[],\"summary\":{\"critical\":0,\"warning\":0,\"suggestion\":0}}", stderr: "" };
  if (command === "direct:voice") return { stdout: "{}", stderr: "" };
  return { stdout: "ok", stderr: "" };
}

async function runLvstudioReport(args) {
  try {
    const result = await runLvstudio(args);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      stdout: error instanceof Error ? error.message : String(error),
      stderr: ""
    };
  }
}

async function getProjectDetails(projectId) {
  const base = path.join(projectsDir, projectId);
  const [project, plan, timeline, manifest, captions, runState] = await Promise.all([
    safeReadJson(path.join(base, "project.json")),
    safeReadJson(path.join(base, "video-plan.json")),
    safeReadJson(path.join(base, "timeline.json")).catch(() => undefined),
    safeReadJson(path.join(base, "asset-manifest.json")).catch(() => ({ assets: [] })),
    safeReadJson(path.join(base, "captions", "captions.json")).catch(() => ({ captions: [] })),
    readRunState(projectId)
  ]);
  return {
    project,
    plan,
    timeline,
    runState: {
      ...runState,
      currentPlanHash: sha256(await readFile(path.join(base, "video-plan.json"), "utf8")),
      currentTimelineHash: sha256(await readFile(path.join(base, "timeline.json"), "utf8").catch(() => ""))
    },
    assetCount: manifest.assets?.length ?? 0,
    captionCount: captions.captions?.length ?? 0
  };
}

async function getRenderDetails(projectId) {
  const rendersDir = path.join(projectsDir, projectId, "renders");
  const entries = await readdir(rendersDir, { withFileTypes: true }).catch(() => []);
  const renderEntries = entries
    .filter((entry) => entry.isFile() && [".mp4", ".webm"].includes(path.extname(entry.name).toLowerCase()))
    .map(async (entry) => {
      const quality = path.basename(entry.name, path.extname(entry.name));
      const fileStat = await stat(path.join(rendersDir, entry.name)).catch(() => undefined);
      return {
        quality,
        fileName: entry.name,
        updatedAt: fileStat?.mtime?.toISOString(),
        url: `/api/projects/${projectId}/renders/${encodeURIComponent(quality)}`
      };
    });
  const renders = (await Promise.all(renderEntries)).sort((a, b) => a.quality.localeCompare(b.quality));
  return { renders };
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname === "/api/projects" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, projects: await listProjects() });
    }

    if (pathname === "/api/settings/voice" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, data: await readVoiceSettings() });
    }

    if (pathname === "/api/settings/voice" && req.method === "PUT") {
      const body = await parseJsonBody(req);
      return sendJson(res, 200, {
        ok: true,
        message: "Voice settings saved.",
        data: await writeVoiceSettings(body)
      });
    }

    if (pathname === "/api/tts/health" && req.method === "GET") {
      const data = await readTtsHealth();
      return sendJson(res, 200, { ok: true, data });
    }

    if (pathname === "/api/settings/voice/preview" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const audioBytes = await previewVoice(body.settings ?? {}, body.text ?? "");
      res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-store" });
      res.end(audioBytes);
      return;
    }

    if (pathname === "/api/settings/voice/reference" && req.method === "PUT") {
      const requestUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
      const fileName = safeVoiceReferenceFileName(requestUrl.searchParams.get("filename") ?? "reference.wav");
      const data = await parseBinaryBody(req);
      await mkdir(voiceReferencesDir, { recursive: true });
      const targetPath = path.resolve(voiceReferencesDir, fileName);
      await writeFile(targetPath, data);
      return sendJson(res, 200, { ok: true, data: { path: targetPath } });
    }

    if (pathname === "/api/projects" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const title = String(body.title || "Untitled Story").trim();
      const projectId = safeProjectId(body.id || title);
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Project title or id is required." });
      const projectDir = path.join(projectsDir, projectId);
      if (await stat(projectDir).catch(() => null)) {
        return sendJson(res, 409, { ok: false, message: `Project already exists: ${projectId}` });
      }
      const mode = body.mode || "short_story";
      const platform = body.platform || "local_only";
      await runLvstudio(["create", projectId, "--mode", mode, "--platform", platform]);
      const projectPath = path.join(projectDir, "project.json");
      const planPath = path.join(projectDir, "video-plan.json");
      const [project, plan] = await Promise.all([safeReadJson(projectPath), safeReadJson(planPath)]);
      project.title = title;
      project.updatedAt = new Date().toISOString();
      plan.title = title;
      plan.providers = { ...plan.providers, tts: "chatterbox", transcription: "mock" };
      plan.voice = {
        ...plan.voice,
        provider: "chatterbox",
        voiceId: "clone",
        format: "wav",
        options: {
          speed: 0.92,
          emotion: "Narrate as an engaged suspense storyteller: intimate, alert, and controlled. Build intrigue from the first line, sharpen the turns, slow slightly on dread, and avoid sounding bored, detached, cheerful, or theatrical."
        }
      };
      await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      await runLvstudio(["sync", projectId]);
      return sendJson(res, 201, { ok: true, message: "Project created.", data: { projectId } });
    }

    if (pathname.startsWith("/api/projects/") && req.method === "GET" && pathname.split("/").filter(Boolean).length === 3) {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      return sendJson(res, 200, { ok: true, data: await getProjectDetails(projectId) });
    }

    if (pathname.startsWith("/api/projects/") && req.method === "DELETE" && pathname.split("/").filter(Boolean).length === 3) {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      const activeDraft = activeDraftJobs.get(projectId);
      if (activeDraft && ["queued", "running"].includes(activeDraft.status)) {
        return sendJson(res, 409, {
          ok: false,
          message: "Cannot delete project while a draft job is queued or running. Stop the job first."
        });
      }
      const activeBeat = activeBeatJobs.get(projectId);
      if (activeBeat && ["queued", "running"].includes(activeBeat.status)) {
        return sendJson(res, 409, {
          ok: false,
          message: "Cannot delete project while a beat regeneration job is queued or running. Stop the job first."
        });
      }
      const projectDir = path.join(projectsDir, projectId);
      if (!projectDir.startsWith(projectsDir + path.sep)) return sendJson(res, 400, { ok: false, message: "Invalid project id." });
      await rm(projectDir, { recursive: true, force: true });
      activeDraftJobs.delete(projectId);
      activeBeatJobs.delete(projectId);
      projectMutationQueues.delete(projectId);
      await rm(runStatePath(projectId), { force: true }).catch(() => {});
      await rm(path.join(qualityHistoryDir, `${projectId}.ndjson`), { force: true }).catch(() => {});
      await rm(path.join(imageHistoryDir, `${projectId}.ndjson`), { force: true }).catch(() => {});
      return sendJson(res, 200, { ok: true, message: "Project deleted.", data: { projectId } });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/plan") && req.method === "PUT") {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      const projectDir = path.join(projectsDir, projectId);
      const planPath = path.join(projectDir, "video-plan.json");
      const timelinePath = path.join(projectDir, "timeline.json");
      const manifestPath = path.join(projectDir, "asset-manifest.json");
      const current = await readFile(planPath, "utf8");
      const currentTimeline = await readOptionalFile(timelinePath);
      const currentManifest = await readOptionalFile(manifestPath);
      const nextPlan = await parseJsonBody(req);
      await writeFile(planPath, `${JSON.stringify(nextPlan, null, 2)}\n`, "utf8");
      try {
        const skipCheck = requestUrl.searchParams.get("check") === "false";
        const syncResult = await runLvstudio(["sync", projectId]);
        const checkResult = skipCheck ? undefined : await runLvstudio(["check", projectId]);
        const output = [syncResult.stdout.trim(), checkResult?.stdout.trim()].filter(Boolean).join("\n\n");
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "plan_save",
          summary: skipCheck ? "Plan updated in Studio UI without readiness check." : "Plan updated in Studio UI.",
          output
        });
        const previousRunState = await readRunState(projectId);
        await writeRunState(projectId, {
          ...previousRunState,
          status: "idle",
          currentPlanHash: await sha256(await readFile(planPath, "utf8")),
          updatedAt: new Date().toISOString()
        });
        return sendJson(res, 200, { ok: true, message: "Plan saved.", output });
      } catch (error) {
        await writeFile(planPath, current, "utf8");
        await restoreOptionalFile(timelinePath, currentTimeline);
        await restoreOptionalFile(manifestPath, currentManifest);
        throw error;
      }
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/plan-from-story") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      const body = await parseJsonBody(req);
      if (!body.story || typeof body.story !== "string") {
        return sendJson(res, 400, { ok: false, message: "Story text is required." });
      }
      const details = await getProjectDetails(projectId);
      const result = await generatePlanDraftWithOpenAi({
        story: body.story,
        currentPlan: details.plan,
        feel: body.feel ?? "cinematic supernatural suspense",
        pacing: body.pacing ?? "measured",
        visualStyle: body.visualStyle ?? "dark cinematic realism",
        format: body.format ?? "short_story",
        systemPrompt: body.systemPrompt,
        userPromptTemplate: body.userPromptTemplate
      });
      return sendJson(res, 200, {
        ok: true,
        message: "AI video plan generated.",
        data: result
      });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/assets") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const manifest = await safeReadJson(path.join(projectsDir, projectId, "asset-manifest.json")).catch(() => ({ assets: [] }));
      return sendJson(res, 200, { ok: true, data: { assets: manifest.assets ?? [] } });
    }

    if (pathname.startsWith("/api/projects/") && pathname.includes("/assets/") && req.method === "DELETE") {
      const projectId = pathname.split("/")[3];
      const assetId = decodeURIComponent(pathname.split("/assets/")[1] ?? "");
      if (!projectId || !assetId) return sendJson(res, 400, { ok: false, message: "Missing project id or asset id." });
      return sendJson(res, 200, {
        ok: true,
        message: "Asset deleted.",
        data: await runProjectMutation(projectId, () => deleteProjectAsset(projectId, assetId))
      });
    }

    if (pathname.startsWith("/api/projects/") && pathname.includes("/assets/") && req.method === "PATCH") {
      const projectId = pathname.split("/")[3];
      const assetId = decodeURIComponent(pathname.split("/assets/")[1] ?? "");
      const body = await parseJsonBody(req);
      const nextStatus = String(body.status || "");
      if (!projectId || !assetId || !nextStatus) {
        return sendJson(res, 400, { ok: false, message: "Missing project id, asset id, or status." });
      }
      const data = await runProjectMutation(projectId, () => updateProjectAssetStatus(projectId, assetId, nextStatus));
      return sendJson(res, 200, { ok: true, message: "Asset status updated.", data });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/image-history") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      return sendJson(res, 200, { ok: true, data: { entries: await readImageHistory(projectId) } });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/generate-images") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      const body = await parseJsonBody(req);
      const result = await runProjectMutation(projectId, () => generateProjectImages(projectId, body));
      return sendJson(res, 200, {
        ok: true,
        message: `Generated ${result.generated.length} image asset(s).`,
        data: result
      });
    }

    if (pathname.startsWith("/api/projects/") && pathname.includes("/beats/") && pathname.endsWith("/regenerate") && req.method === "POST") {
      const parts = pathname.split("/");
      const projectId = parts[3];
      const beatId = decodeURIComponent(parts[5] ?? "");
      if (!projectId || !beatId) return sendJson(res, 400, { ok: false, message: "Missing project id or beat id." });
      const body = await parseJsonBody(req);
      const activeJob = activeBeatJobs.get(projectId);
      if (activeJob && ["queued", "running"].includes(activeJob.status)) {
        return sendJson(res, 202, { ok: true, message: "Beat regeneration already running.", data: beatJobProgress(activeJob) });
      }
      const result = await runBeatRegenerateJob(projectId, beatId, body);
      return sendJson(res, 202, { ok: true, message: `Queued beat regeneration for ${beatId}.`, data: result });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/renders") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      return sendJson(res, 200, { ok: true, data: await getRenderDetails(projectId) });
    }

    if (pathname.startsWith("/api/projects/") && pathname.includes("/renders/") && (req.method === "GET" || req.method === "HEAD")) {
      const projectId = pathname.split("/")[3];
      const quality = decodeURIComponent(pathname.split("/renders/")[1] ?? "");
      if (!["draft", "final"].includes(quality)) {
        return sendJson(res, 400, { ok: false, message: "Invalid render quality." });
      }
      const renderPath = path.join(projectsDir, projectId, "renders", `${quality}.mp4`);
      return sendVideoFile(req, res, renderPath, "video/mp4");
    }

    if (pathname.startsWith("/api/projects/") && pathname.includes("/media/") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const encodedPath = pathname.split("/media/")[1] ?? "";
      const relativeAssetPath = decodeURIComponent(encodedPath);
      const mediaPath = safeProjectPath(projectId, relativeAssetPath);
      if (!mediaPath) return sendJson(res, 400, { ok: false, message: "Invalid media path." });
      const content = await readFile(mediaPath).catch(() => null);
      if (!content) return sendJson(res, 404, { ok: false, message: "Media not found." });
      const ext = path.extname(mediaPath).toLowerCase();
      const mime =
        ext === ".mp4" ? "video/mp4" :
        ext === ".webm" ? "video/webm" :
        ext === ".mov" ? "video/quicktime" :
        ext === ".mp3" ? "audio/mpeg" :
        ext === ".wav" ? "audio/wav" :
        ext === ".m4a" ? "audio/mp4" :
        ext === ".png" ? "image/png" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        ext === ".webp" ? "image/webp" :
        ext === ".svg" ? "image/svg+xml" :
        "application/octet-stream";
      res.writeHead(200, { "content-type": mime });
      res.end(content);
      return;
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/quality") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const result = await runLvstudio(["check", projectId]);
      await appendQualityHistory(projectId, {
        timestamp: new Date().toISOString(),
        kind: "quality_check",
        summary: "Manual quality check run.",
        output: result.stdout.trim()
      });
      return sendJson(res, 200, { ok: true, output: result.stdout.trim() });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/review") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const result = await runLvstudioReport(["review", projectId]);
      if (!result.ok) {
        return sendJson(res, 200, {
          ok: true,
          data: { issues: [] },
          warning: "Review command failed. Showing empty review list."
        });
      }
      try {
        return sendJson(res, 200, { ok: true, data: JSON.parse(result.stdout) });
      } catch {
        return sendJson(res, 200, {
          ok: true,
          data: { issues: [] },
          warning: "Review output was not valid JSON. Showing empty review list."
        });
      }
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/quality-history") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const entries = await readQualityHistory(projectId);
      return sendJson(res, 200, { ok: true, data: { entries } });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/jobs") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      return sendJson(res, 200, { ok: true, data: await listDraftJobs(projectId) });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/draft-job") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const activeJob = activeDraftJobs.get(projectId);
      if (activeJob) return sendJson(res, 200, { ok: true, data: jobProgress(activeJob) });
      const runState = await readRunState(projectId);
      const draftRunStateJob = (runState.jobs ?? []).find((job) => job.kind === "draft_job");
      if (!draftRunStateJob) {
        return sendJson(res, 200, { ok: true, data: null });
      }
      const staleRunning = ["queued", "running"].includes(draftRunStateJob.status);
      return sendJson(res, 200, {
        ok: true,
        data: staleRunning
          ? {
              ...draftRunStateJob,
              status: "failed",
              phase: "stopped",
              label: "Draft job stopped",
              error: "Studio restarted before this background job finished. Start Make Draft again to resume from generated assets."
            }
          : draftRunStateJob
      });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/draft-job") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      if (!projectId) return sendJson(res, 400, { ok: false, message: "Missing project id." });
      const activeJob = activeDraftJobs.get(projectId);
      if (activeJob) return sendJson(res, 202, { ok: true, data: jobProgress(activeJob) });
      const body = await parseJsonBody(req);
      return sendJson(res, 202, {
        ok: true,
        message: "Draft job queued.",
        data: await runDraftJob(projectId, body)
      });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/prepare-draft") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      const project = await getProjectDetails(projectId);
      const ttsProvider = project.plan.providers.tts;
      const transcriptionProvider = project.plan.providers.transcription;
      const result = await runProjectMutation(projectId, async () => {
        await writeRunState(projectId, {
          ...project.runState,
          status: "preparing",
          updatedAt: new Date().toISOString()
        });
        const steps = [
          await runLvstudio(["generate:tts", projectId, "--provider", ttsProvider, "--force"]),
          await runLvstudio(["sync", projectId]),
          await runLvstudio(["transcribe", projectId, "--provider", transcriptionProvider]),
          await runLvstudio(["captions", projectId])
        ];
        const checkResult = await runLvstudioReport(["check", projectId]);
        const checkLabel = checkResult.ok ? "Quality check:" : "Quality check warnings/errors:";
        const output = [
          ...steps.map((step) => step.stdout.trim()).filter(Boolean),
          `${checkLabel}\n${checkResult.stdout.trim()}`
        ].join("\n\n");
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "prepare_draft",
          summary: checkResult.ok
            ? "Draft audio, captions, sync, and quality checks completed."
            : "Draft audio, captions, and sync completed with quality check warnings/errors.",
          output
        });
        await writeRunState(projectId, {
          ...project.runState,
          status: "prepared",
          updatedAt: new Date().toISOString()
        });
        return { output, qualityOk: checkResult.ok };
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/direct-voice") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      const result = await runProjectMutation(projectId, async () => {
        const step = await runLvstudio(["direct:voice", projectId]);
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "direct_voice",
          summary: "Voice direction generated per beat.",
          output: step.stdout.trim()
        });
        return { output: step.stdout.trim() };
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/render") && req.method === "POST") {
      const projectId = pathname.split("/")[3];
      const quality = requestUrl.searchParams.get("quality") === "final" ? "final" : "draft";
      const force = requestUrl.searchParams.get("force") === "true";
      const projectDir = path.join(projectsDir, projectId);
      const output = await runProjectMutation(projectId, async () => {
        await writeRunState(projectId, {
          ...(await readRunState(projectId)),
          status: "rendering",
          updatedAt: new Date().toISOString()
        });
        const result = await runLvstudio(["render", projectId, "--quality", quality, ...(force ? ["--force"] : [])]);
        const planHash = sha256(await readFile(path.join(projectDir, "video-plan.json"), "utf8"));
        const timelineHash = sha256(await readFile(path.join(projectDir, "timeline.json"), "utf8").catch(() => ""));
        await appendQualityHistory(projectId, {
          timestamp: new Date().toISOString(),
          kind: "render",
          summary: `Render ${quality} completed.`,
          output: result.stdout.trim()
        });
        await writeRunState(projectId, {
          status: "idle",
          lastRenderPlanHash: planHash,
          lastRenderTimelineHash: timelineHash,
          lastRenderQuality: quality,
          lastRenderCompletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return result.stdout.trim();
      });
      return sendJson(res, 200, { ok: true, output });
    }

    const staticAsset = publicAssetForPath(publicDir, pathname);
    if (staticAsset) {
      const content = await readFile(staticAsset.filePath).catch(() => null);
      if (!content) return sendJson(res, 404, { ok: false, message: "Not found." });
      res.writeHead(200, { "content-type": staticAsset.contentType });
      res.end(content);
      return;
    }

    sendJson(res, 404, { ok: false, message: "Not found." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : "Unknown server error." });
  }
});

server.listen(port, () => {
  console.log(`Studio running at http://localhost:${port}`);
});

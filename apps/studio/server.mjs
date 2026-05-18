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
const projectMutationQueues = new Map();
const commandLogPath = path.join(rootDir, ".studio-data", "server-commands.ndjson");
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const CHATTERBOX_SPEECH_URL = process.env.CHATTERBOX_TTS_URL ?? "http://127.0.0.1:8000/v1/audio/speech";

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

  const headers = { "content-type": "application/json" };
  if (process.env.CHATTERBOX_TTS_API_KEY) headers.authorization = `Bearer ${process.env.CHATTERBOX_TTS_API_KEY}`;
  const response = await fetch(CHATTERBOX_SPEECH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voice preview failed: ${response.status} ${body.slice(0, 300)}`.trim());
  }
  return Buffer.from(await response.arrayBuffer());
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
  if (mode === "selected") return allTargets.filter((target) => target.assetId === options.assetId).slice(0, 1);

  const assets = manifest.assets ?? [];
  if (coverage === "beat") {
    return allTargets.filter((target) =>
      mode === "all" ? true : !beatHasVisualAsset(assets, target.assetId, target.beat.id)
    );
  }

  const bySection = groupTargetsBySection(allTargets);
  const selected = [];
  for (const [sectionId, sectionTargets] of bySection.entries()) {
    if (mode === "missing" && sectionHasVisualAsset(assets, sectionId)) continue;
    selected.push(sectionTargets[0]);
  }
  return selected;
}

function buildPlanFromAiDraft(currentPlan, draft) {
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
        emotion: draft.voice?.direction || "Narrate as an engaged suspense storyteller: intimate, alert, and controlled, with rising tension, crisp pacing, and quiet dread. Do not sound bored or flat."
      }
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
                prompt: beat.visualPrompt || beat.narration,
                scaleMode: "cover",
                placement: "background"
              }
            ],
            motion: { type: beat.motion || "slow_zoom_in", intensity: 0.08 },
            caption: { emphasis: beat.emphasis || [], style: "default" },
            notes: beat.notes || beat.visualPrompt || ""
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

async function generatePlanDraftWithOpenAi({ story, currentPlan, feel, pacing, visualStyle, format }) {
  const apiKey = await getOpenAiApiKey();
  const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
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
          content:
            "You convert raw story prose into a local video production plan. Preserve the story wording unless light segmentation is needed. Create visually specific, photorealistic cinematic prompts grounded in the exact story action and setting. Avoid generic abstractions, soundwave graphics, split screens, fake text, and AI-looking fantasy imagery. Voice direction should be engaged, suspenseful, and intimate, not flat. Return JSON only."
        },
        {
          role: "user",
          content: JSON.stringify({
            story,
            currentTitle: currentPlan.title,
            feel,
            pacing,
            visualStyle,
            format,
            target: "short horror/story video with per-beat narration and image-generation-ready visual prompts"
          })
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
            required: ["title", "voice", "sections", "warnings"],
            properties: {
              title: { type: "string" },
              voice: {
                type: "object",
                additionalProperties: false,
                required: ["voiceId", "speed", "direction"],
                properties: {
                  voiceId: { type: "string", enum: ["alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse"] },
                  speed: { type: "number" },
                  direction: { type: "string" }
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
                        required: ["narration", "visualPrompt", "estimatedDurationSeconds", "motion", "emphasis", "notes"],
                        properties: {
                          narration: { type: "string" },
                          visualPrompt: { type: "string" },
                          estimatedDurationSeconds: { type: "number" },
                          motion: { type: "string", enum: ["none", "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right"] },
                          emphasis: { type: "array", items: { type: "string" } },
                          notes: { type: "string" }
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

async function readRunState(projectId) {
  return safeReadJson(runStatePath(projectId)).catch(() => ({
    status: "idle",
    lastRenderPlanHash: undefined,
    lastRenderQuality: undefined,
    lastRenderCompletedAt: undefined
  }));
}

async function writeRunState(projectId, state) {
  const filePath = runStatePath(projectId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function updateRunProgress(projectId, patch) {
  await writeRunState(projectId, {
    ...(await readRunState(projectId)),
    ...patch,
    updatedAt: new Date().toISOString()
  });
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

    if (pathname === "/api/settings/voice/preview" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const audioBytes = await previewVoice(body.settings ?? {}, body.text ?? "");
      res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-store" });
      res.end(audioBytes);
      return;
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
      const projectDir = path.join(projectsDir, projectId);
      if (!projectDir.startsWith(projectsDir + path.sep)) return sendJson(res, 400, { ok: false, message: "Invalid project id." });
      await rm(projectDir, { recursive: true, force: true });
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
        format: body.format ?? "short_story"
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

    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/quality-history") && req.method === "GET") {
      const projectId = pathname.split("/")[3];
      const entries = await readQualityHistory(projectId);
      return sendJson(res, 200, { ok: true, data: { entries } });
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

    if (pathname === "/" || pathname === "/index.html") {
      const html = await readFile(path.join(publicDir, "index.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (pathname === "/app.js") {
      const js = await readFile(path.join(publicDir, "app.js"), "utf8");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(js);
      return;
    }

    if (pathname === "/styles.css") {
      const css = await readFile(path.join(publicDir, "styles.css"), "utf8");
      res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      res.end(css);
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

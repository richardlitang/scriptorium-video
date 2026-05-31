import path from "node:path";
import { createHash } from "node:crypto";

export async function safeReadJson(readFile, jsonPath) {
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

export function safeVoiceReferenceFileName(rawName) {
  const base = path.basename(rawName || "reference.wav");
  return base.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function readOptionalFile(readFile, filePath) {
  return readFile(filePath, "utf8").catch(() => null);
}

export async function restoreOptionalFile({ unlink, writeFile, filePath, content }) {
  if (content === null) {
    await unlink(filePath).catch(() => {});
    return;
  }
  await writeFile(filePath, content, "utf8");
}

export function slugify(value, fallback) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function safeProjectId(value) {
  return slugify(String(value || ""), "");
}

export function isSafeProjectId(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || "")) && String(value || "").length <= 48;
}

export function estimateDurationSeconds(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Number((words * 0.42).toFixed(1))));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function countWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function redactPath(value) {
  if (!value) return "";
  return path.basename(String(value));
}

export function dimensionsFromSize(size) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function mapWithConcurrency(items, concurrency, worker) {
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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readMmsHealth({ fetchImpl = fetch, mmsHealthUrl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(mmsHealthUrl, {
      method: "GET",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        provider: "mms",
        ok: false,
        status: "failed",
        sampleRate: null,
        error: `health-check-failed (${response.status})`,
        healthUrl: mmsHealthUrl,
      };
    }
    return {
      provider: "mms",
      ok: payload.ok === true,
      status: payload.status || (payload.ok ? "ready" : "failed"),
      sampleRate: typeof payload.sampleRate === "number" ? payload.sampleRate : null,
      model: payload.model || null,
      error: payload.error || null,
      healthUrl: mmsHealthUrl,
    };
  } catch (error) {
    return {
      provider: "mms",
      ok: false,
      status: "unreachable",
      sampleRate: null,
      error:
        error?.name === "AbortError" ? "health-check-timeout" : String(error?.message || error),
      healthUrl: mmsHealthUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function readProjectTraceSnapshot({
  pathImpl,
  projectsDir,
  projectId,
  safeReadJsonImpl,
  summarizePlanForTrace,
  summarizeManifestForTrace,
  summarizeTimelineForTrace,
}) {
  const projectDir = pathImpl.join(projectsDir, projectId);
  const [plan, manifest, timeline] = await Promise.all([
    safeReadJsonImpl(pathImpl.join(projectDir, "video-plan.json")).catch(() => undefined),
    safeReadJsonImpl(pathImpl.join(projectDir, "asset-manifest.json")).catch(() => ({
      assets: [],
    })),
    safeReadJsonImpl(pathImpl.join(projectDir, "timeline.json")).catch(() => undefined),
  ]);
  return {
    plan: plan ? summarizePlanForTrace(plan) : undefined,
    manifest: summarizeManifestForTrace(manifest),
    timeline: summarizeTimelineForTrace(timeline, manifest),
  };
}

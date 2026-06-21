import path from "node:path";
import { createHash } from "node:crypto";

type ReadFileUtf8 = (filePath: string, encoding: "utf8") => Promise<string>;
type WriteFileUtf8 = (filePath: string, content: string, encoding: "utf8") => Promise<void>;
type UnlinkFn = (filePath: string) => Promise<void>;
type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;
type TraceManifest = { assets?: Array<{ id?: string; beatId?: string }> };
type TraceTimeline = {
  durationSeconds?: number;
  segments?: Array<{
    beatId?: string;
    startSeconds?: number;
    endSeconds?: number;
    durationSeconds?: number;
    voiceAssetId?: string;
    mediaAssetIds?: string[];
    visualEditCues?: unknown[];
    silenceWindows?: unknown[];
  }>;
};

export async function safeReadJson(readFile: ReadFileUtf8, jsonPath: string) {
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

export function safeVoiceReferenceFileName(rawName: string | undefined) {
  const base = path.basename(rawName || "reference.wav");
  return base.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function readOptionalFile(readFile: ReadFileUtf8, filePath: string) {
  return readFile(filePath, "utf8").catch(() => null);
}

export async function restoreOptionalFile({
  unlink,
  writeFile,
  filePath,
  content,
}: {
  unlink: UnlinkFn;
  writeFile: WriteFileUtf8;
  filePath: string;
  content: string | null;
}) {
  if (content === null) {
    await unlink(filePath).catch(() => {});
    return;
  }
  await writeFile(filePath, content, "utf8");
}

export function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function safeProjectId(value: string | undefined) {
  return slugify(String(value || ""), "");
}

export function isSafeProjectId(value: string | undefined) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || "")) && String(value || "").length <= 48;
}

export function estimateDurationSeconds(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Number((words * 0.42).toFixed(1))));
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function countWords(value: string | undefined) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function redactPath(value: string | undefined) {
  if (!value) return "";
  return path.basename(String(value));
}

export function dimensionsFromSize(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
) {
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readMmsHealth({
  fetchImpl = fetch as FetchLike,
  mmsHealthUrl,
}: {
  fetchImpl?: FetchLike;
  mmsHealthUrl: string;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(mmsHealthUrl, {
      method: "GET",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
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
    let message = String(error);
    if (error instanceof Error) {
      message = error.name === "AbortError" ? "health-check-timeout" : error.message;
    }
    return {
      provider: "mms",
      ok: false,
      status: "unreachable",
      sampleRate: null,
      error: message,
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
}: {
  pathImpl: typeof path;
  projectsDir: string;
  projectId: string;
  safeReadJsonImpl: (filePath: string) => Promise<unknown>;
  summarizePlanForTrace: (plan: unknown) => unknown;
  summarizeManifestForTrace: (manifest: TraceManifest) => unknown;
  summarizeTimelineForTrace: (
    timeline: TraceTimeline | undefined,
    manifest: TraceManifest,
  ) => unknown;
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
    manifest: summarizeManifestForTrace(manifest as TraceManifest),
    timeline: summarizeTimelineForTrace(
      timeline as TraceTimeline | undefined,
      manifest as TraceManifest,
    ),
  };
}

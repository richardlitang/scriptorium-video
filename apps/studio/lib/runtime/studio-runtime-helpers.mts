import path from "node:path";
import { createHash } from "node:crypto";

type ReadFileLike = (filePath: string, encoding: BufferEncoding) => Promise<string>;
type WriteFileLike = (
  filePath: string,
  content: string,
  encoding: BufferEncoding,
) => Promise<unknown>;
type UnlinkLike = (filePath: string) => Promise<unknown>;

interface RestoreOptionalFileArgs {
  unlink: UnlinkLike;
  writeFile: WriteFileLike;
  filePath: string;
  content: string | null;
}

interface MmsHealthPayload {
  ok?: boolean;
  status?: string;
  sampleRate?: number;
  model?: string | null;
  error?: string | null;
}

interface ReadMmsHealthArgs {
  fetchImpl?: typeof fetch;
  mmsHealthUrl: string;
}

interface PathJoinLike {
  join(...paths: string[]): string;
}

interface ReadProjectTraceSnapshotArgs<
  TPlan = unknown,
  TManifest = unknown,
  TTimeline = unknown,
  TPlanSummary = unknown,
  TManifestSummary = unknown,
  TTimelineSummary = unknown,
> {
  pathImpl: PathJoinLike;
  projectsDir: string;
  projectId: string;
  safeReadJsonImpl: <T = unknown>(jsonPath: string) => Promise<T>;
  summarizePlanForTrace: (plan: TPlan) => TPlanSummary;
  summarizeManifestForTrace: (manifest: TManifest) => TManifestSummary;
  summarizeTimelineForTrace: (
    timeline: TTimeline | undefined,
    manifest: TManifest,
  ) => TTimelineSummary;
}

export async function safeReadJson<T = unknown>(
  readFile: ReadFileLike,
  jsonPath: string,
): Promise<T> {
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw) as T;
}

export function safeVoiceReferenceFileName(rawName: string | null | undefined): string {
  const base = path.basename(rawName || "reference.wav");
  return base.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function readOptionalFile(
  readFile: ReadFileLike,
  filePath: string,
): Promise<string | null> {
  return readFile(filePath, "utf8").catch(() => null);
}

export async function restoreOptionalFile({
  unlink,
  writeFile,
  filePath,
  content,
}: RestoreOptionalFileArgs): Promise<void> {
  if (content === null) {
    await unlink(filePath).catch(() => {});
    return;
  }
  await writeFile(filePath, content, "utf8");
}

export function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function safeProjectId(value: string): string {
  return slugify(String(value || ""), "");
}

export function isSafeProjectId(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || "")) && String(value || "").length <= 48;
}

export function estimateDurationSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(20, Number((words * 0.42).toFixed(1))));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function countWords(value: string): number {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function redactPath(value: unknown): string {
  if (!value) return "";
  return path.basename(String(value));
}

export function dimensionsFromSize(size: string): { width?: number; height?: number } {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readMmsHealth({
  fetchImpl = fetch,
  mmsHealthUrl,
}: ReadMmsHealthArgs): Promise<{
  provider: "mms";
  ok: boolean;
  status: string;
  sampleRate: number | null;
  model?: string | null;
  error: string | null;
  healthUrl: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(mmsHealthUrl, {
      method: "GET",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as MmsHealthPayload;
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
    let errorMessage = String(error);
    if (error instanceof Error) {
      errorMessage = error.name === "AbortError" ? "health-check-timeout" : error.message;
    }
    return {
      provider: "mms",
      ok: false,
      status: "unreachable",
      sampleRate: null,
      error: errorMessage,
      healthUrl: mmsHealthUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function readProjectTraceSnapshot<
  TPlan = unknown,
  TManifest = { assets: unknown[] },
  TTimeline = unknown,
  TPlanSummary = unknown,
  TManifestSummary = unknown,
  TTimelineSummary = unknown,
>({
  pathImpl,
  projectsDir,
  projectId,
  safeReadJsonImpl,
  summarizePlanForTrace,
  summarizeManifestForTrace,
  summarizeTimelineForTrace,
}: ReadProjectTraceSnapshotArgs<
  TPlan,
  TManifest,
  TTimeline,
  TPlanSummary,
  TManifestSummary,
  TTimelineSummary
>): Promise<{
  plan: TPlanSummary | undefined;
  manifest: TManifestSummary;
  timeline: TTimelineSummary;
}> {
  const projectDir = pathImpl.join(projectsDir, projectId);
  const [plan, manifest, timeline] = await Promise.all([
    safeReadJsonImpl<TPlan>(pathImpl.join(projectDir, "video-plan.json")).catch(
      () => undefined as TPlan | undefined,
    ),
    safeReadJsonImpl<TManifest>(pathImpl.join(projectDir, "asset-manifest.json")).catch(
      () =>
        ({
          assets: [],
        }) as TManifest,
    ),
    safeReadJsonImpl<TTimeline>(pathImpl.join(projectDir, "timeline.json")).catch(() => undefined),
  ]);
  return {
    plan: plan ? summarizePlanForTrace(plan) : undefined,
    manifest: summarizeManifestForTrace(manifest),
    timeline: summarizeTimelineForTrace(timeline, manifest),
  };
}

import type { Dirent, Stats } from "node:fs";
import { narrationFromImagePrompt, selectCachedImage } from "../../image-cache.mjs";

type PathApi = {
  basename: (path: string, suffix?: string) => string;
  dirname: (path: string) => string;
  join: (...parts: string[]) => string;
  resolve: (...parts: string[]) => string;
  sep: string;
};

type ImageHistoryEntry = {
  assetId?: string;
  beatId?: string;
  libraryPath?: string;
  path: string;
  inputHash?: string;
  reuseKey?: string;
  model?: string;
  size?: string;
  quality?: string;
  prompt?: string;
  description?: string;
  tags?: string[];
  sha256?: string;
  generatedAt?: string;
};

type ImageCacheEntry = {
  projectId: string;
  assetId?: string;
  beatId?: string;
  rootPath: string;
  inputHash?: string;
  reuseKey?: string;
  model?: string;
  size?: string;
  quality?: string;
  prompt?: string;
  description?: string;
  tags?: string[];
  sha256?: string;
  generatedAt?: string;
};

type ImageLibraryMetadata = {
  firstSeen?: Record<string, unknown>;
  reuseCount?: number;
};

type ImageQuery = {
  inputHash: string | undefined;
  reuseKey: string | undefined;
  size: string | undefined;
  quality: string | undefined;
  model: string | undefined;
  allowNarrationReuse: boolean | undefined;
};

type StoreImageInput = {
  bytes: string | Uint8Array;
  prompt: string;
  projectId: string;
  assetId?: string;
  beatId?: string;
  sectionId?: string;
  model?: string;
  size?: string;
  quality?: string;
  inputHash?: string;
  reuseKey?: string;
};

interface ImageCacheStoreDeps {
  path: PathApi;
  rootDir: string;
  imageHistoryDir: string;
  imageCachePath: string;
  imageLibraryDir: string;
  imageReuseKey: (input: {
    narration: string;
    size?: string;
    quality?: string;
    model?: string;
  }) => string;
  imageDescriptionFromPrompt: (prompt: string) => string;
  imageTagsFromPrompt: (
    prompt: string,
    input: { size?: string; quality?: string; model?: string },
  ) => string[];
  sha256: (value: string | Uint8Array) => string;
  safeReadJson: <T>(filePath: string) => Promise<T>;
  readFile: (filePath: string, encoding: string) => Promise<string>;
  readdir: (dirPath: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
  stat: (filePath: string) => Promise<Stats>;
  appendFile: (filePath: string, content: string, encoding: string) => Promise<void>;
  mkdir: (dirPath: string, options: { recursive: true }) => Promise<void>;
  writeFile: (filePath: string, content: string | Uint8Array) => Promise<void>;
}

function imageCacheEntryFromHistory(
  projectId: string,
  entry: ImageHistoryEntry,
  { path, imageReuseKey }: Pick<ImageCacheStoreDeps, "path" | "imageReuseKey">,
): ImageCacheEntry {
  const narration = narrationFromImagePrompt(entry.prompt);
  return {
    projectId,
    assetId: entry.assetId,
    beatId: entry.beatId,
    rootPath: entry.libraryPath || path.join("content", "projects", projectId, entry.path),
    inputHash: entry.inputHash,
    reuseKey:
      entry.reuseKey ??
      (narration
        ? imageReuseKey({
            narration,
            size: entry.size,
            quality: entry.quality,
            model: entry.model,
          })
        : undefined),
    model: entry.model,
    size: entry.size,
    quality: entry.quality,
    prompt: entry.prompt,
    description: entry.description,
    tags: entry.tags,
    sha256: entry.sha256,
    generatedAt: entry.generatedAt,
  };
}

export function createImageCacheStore(deps: ImageCacheStoreDeps) {
  const {
    path,
    rootDir,
    imageHistoryDir,
    imageCachePath,
    imageLibraryDir,
    imageReuseKey,
    imageDescriptionFromPrompt,
    imageTagsFromPrompt,
    sha256,
    safeReadJson,
    readFile,
    readdir,
    stat,
    appendFile,
    mkdir,
    writeFile,
  } = deps;

  async function readImageHistory(projectId: string): Promise<ImageHistoryEntry[]> {
    const logPath = path.join(imageHistoryDir, `${projectId}.ndjson`);
    const raw = await readFile(logPath, "utf8").catch(() => "");
    if (!raw.trim()) return [];
    return raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as ImageHistoryEntry)
      .filter(Boolean)
      .sort((a, b) => (String(a.generatedAt) < String(b.generatedAt) ? 1 : -1));
  }

  async function appendImageHistory(projectId: string, entry: ImageHistoryEntry): Promise<void> {
    await mkdir(imageHistoryDir, { recursive: true });
    const logPath = path.join(imageHistoryDir, `${projectId}.ndjson`);
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async function readImageCacheEntries(): Promise<ImageCacheEntry[]> {
    const cacheRaw = await readFile(imageCachePath, "utf8").catch(() => "");
    const cacheEntries = cacheRaw.trim()
      ? cacheRaw
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as ImageCacheEntry)
          .filter(Boolean)
      : [];

    const historyFiles = await readdir(imageHistoryDir, { withFileTypes: true }).catch(() => []);
    const historyEntries: ImageCacheEntry[] = [];
    for (const file of historyFiles) {
      if (!file.isFile() || !file.name.endsWith(".ndjson")) continue;
      const projectId = path.basename(file.name, ".ndjson");
      const entries = await readImageHistory(projectId);
      historyEntries.push(
        ...entries.map((entry) =>
          imageCacheEntryFromHistory(projectId, entry, { path, imageReuseKey }),
        ),
      );
    }

    return [...cacheEntries, ...historyEntries];
  }

  async function findReusableImage(query: ImageQuery) {
    const selected = selectCachedImage(await readImageCacheEntries(), query) as
      | (ImageCacheEntry & { rootPath: string })
      | undefined;
    if (!selected) return undefined;
    const absolutePath = path.resolve(rootDir, selected.rootPath);
    if (!absolutePath.startsWith(rootDir + path.sep)) return undefined;
    if (!(await stat(absolutePath).catch(() => null))) return undefined;
    return { ...selected, absolutePath };
  }

  async function appendImageCacheEntry(entry: ImageCacheEntry): Promise<void> {
    await mkdir(path.dirname(imageCachePath), { recursive: true });
    await appendFile(imageCachePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async function storeImageInLibrary({
    bytes,
    prompt,
    projectId,
    assetId,
    beatId,
    sectionId,
    model,
    size,
    quality,
    inputHash,
    reuseKey,
  }: StoreImageInput) {
    const fileHash = sha256(bytes);
    const relativeImagePath = path.join(
      ".studio-data",
      "image-library",
      "images",
      `${fileHash}.png`,
    );
    const absoluteImagePath = path.join(rootDir, relativeImagePath);
    await mkdir(path.dirname(absoluteImagePath), { recursive: true });
    if (!(await stat(absoluteImagePath).catch(() => null))) {
      await writeFile(absoluteImagePath, bytes);
    }

    const description = imageDescriptionFromPrompt(prompt);
    const tags = imageTagsFromPrompt(prompt, { size, quality, model });
    const metadataPath = path.join(imageLibraryDir, "metadata", `${fileHash}.json`);
    const existingMetadata = await safeReadJson<ImageLibraryMetadata>(metadataPath).catch(
      () => null,
    );
    const metadata = {
      schemaVersion: 1,
      sha256: fileHash,
      path: relativeImagePath,
      prompt,
      description,
      tags,
      model,
      size,
      quality,
      inputHash,
      reuseKey,
      firstSeen: existingMetadata?.firstSeen ?? {
        projectId,
        assetId,
        beatId,
        sectionId,
      },
      lastSeen: {
        projectId,
        assetId,
        beatId,
        sectionId,
      },
      reuseCount: Number(existingMetadata?.reuseCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return {
      sha256: fileHash,
      rootPath: relativeImagePath,
      description,
      tags,
    };
  }

  return {
    readImageHistory,
    appendImageHistory,
    findReusableImage,
    appendImageCacheEntry,
    storeImageInLibrary,
  };
}

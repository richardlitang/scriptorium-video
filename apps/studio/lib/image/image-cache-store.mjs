import { narrationFromImagePrompt, selectCachedImage } from "../../image-cache.mjs";

function imageCacheEntryFromHistory(projectId, entry, { path, imageReuseKey }) {
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

export function createImageCacheStore(deps) {
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

  async function readImageCacheEntries() {
    const cacheRaw = await readFile(imageCachePath, "utf8").catch(() => "");
    const cacheEntries = cacheRaw.trim()
      ? cacheRaw
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter(Boolean)
      : [];

    const historyFiles = await readdir(imageHistoryDir, { withFileTypes: true }).catch(() => []);
    const historyEntries = [];
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
  }) {
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
    const existingMetadata = await safeReadJson(metadataPath).catch(() => null);
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
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
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

export function createImageGenerationRunner(deps) {
  const {
    path,
    projectsDir,
    safeReadJson,
    readImageHistory,
    normalizeImageCoverage,
    defaultImageSizeForPlan,
    imageTargetsFromPlan,
    selectImageTargetsFromCandidates,
    mkdir,
    updateRunProgress,
    mapWithConcurrency,
    sha256,
    imageReuseKey,
    findReusableImage,
    readFile,
    writeFile,
    generateImageWithOpenAi,
    storeImageInLibrary,
    dimensionsFromSize,
    appendImageHistory,
    appendImageCacheEntry,
    runLvstudio,
    appendQualityHistory,
  } = deps;

  function selectImageTargets(plan, manifest, mode, coverage, options) {
    const allTargets = imageTargetsFromPlan(plan);
    return selectImageTargetsFromCandidates({
      allTargets,
      assets: manifest?.assets ?? [],
      mode,
      coverage,
      options,
    });
  }

  async function generateProjectImages(projectId, options = {}) {
    const projectDir = path.join(projectsDir, projectId);
    const plan = await safeReadJson(path.join(projectDir, "video-plan.json"));
    const manifestPath = path.join(projectDir, "asset-manifest.json");
    const manifest = await safeReadJson(manifestPath).catch(() => ({
      schemaVersion: 1,
      assets: [],
    }));
    const history = await readImageHistory(projectId);
    const VALID_MODES = new Set(["selected", "missing"]);
    const mode = VALID_MODES.has(options.mode) ? options.mode : "all";
    const coverage = normalizeImageCoverage(options.coverage);
    const size = options.size || defaultImageSizeForPlan(plan);
    const quality = options.quality || "low";
    const promptOverrides =
      options.promptOverrides && typeof options.promptOverrides === "object"
        ? options.promptOverrides
        : {};
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
    const imageConcurrency = options.imageConcurrency ?? 2;
    await updateRunProgress(projectId, {
      status: "generating_images",
      progress: {
        kind: "image_generation",
        phase: "starting",
        completed: 0,
        total: limitedTargets.length,
        generated: 0,
        failed: 0,
        coverage,
      },
    });

    const imageResults = await mapWithConcurrency(
      limitedTargets,
      imageConcurrency,
      async (target) => {
        const prompt = String(
          promptOverrides[target.assetId] || options.prompt || target.defaultPrompt,
        ).trim();
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
            currentSectionTitle: target.section.title,
            referenceIds: target.referenceIds,
          },
        });
        const version =
          history
            .filter((entry) => entry.assetId === target.assetId)
            .reduce((max, entry) => Math.max(max, Number(entry.version) || 0), 0) + 1;
        const model = options.openAiImageModel ?? "gpt-image-2";
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
          allowNarrationReuse: !hasPromptOverride,
        });
        let result;
        let reusedFrom;
        let imageBytes;
        if (cached) {
          imageBytes = await readFile(cached.absolutePath);
          await writeFile(absolutePath, imageBytes);
          result = { model: cached.model };
          reusedFrom = cached.rootPath;
        } else {
          try {
            result = await generateImageWithOpenAi({ prompt, size, quality });
            imageBytes = result.bytes;
            await writeFile(absolutePath, result.bytes);
          } catch (error) {
            completed += 1;
            const failure = {
              assetId: target.assetId,
              sectionId: target.section.id,
              beatId: target.beat.id,
              referenceIds: target.referenceIds,
              prompt,
              error: error instanceof Error ? error.message : String(error),
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
              },
            });
            return { target, failure };
          }
        }
        const libraryEntry = await storeImageInLibrary({
          bytes: imageBytes,
          prompt,
          projectId,
          assetId: target.assetId,
          beatId: target.beat.id,
          sectionId: target.section.id,
          model: result.model,
          size,
          quality,
          inputHash,
          reuseKey,
        });
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
            libraryPath: libraryEntry.rootPath,
            originalPath: reusedFrom,
            prompt,
            description: libraryEntry.description,
            tags: libraryEntry.tags,
            sha256: libraryEntry.sha256,
          },
          ...dimensions,
          status: "generated",
          createdAt:
            (manifest.assets ?? []).find((item) => item.id === target.assetId)?.createdAt ?? now,
          updatedAt: now,
        };
        const historyEntry = {
          assetId: target.assetId,
          sectionId: target.section.id,
          beatId: target.beat.id,
          referenceIds: target.referenceIds,
          prompt,
          path: relativePath,
          version,
          model: result.model,
          size,
          quality,
          inputHash,
          reuseKey,
          libraryPath: libraryEntry.rootPath,
          description: libraryEntry.description,
          tags: libraryEntry.tags,
          sha256: libraryEntry.sha256,
          reusedFrom,
          generatedAt: now,
        };
        completed += 1;
        generated.push(historyEntry);
        const cacheEntry = {
          projectId,
          assetId: target.assetId,
          beatId: target.beat.id,
          rootPath: libraryEntry.rootPath,
          inputHash,
          reuseKey,
          model: result.model,
          size,
          quality,
          prompt,
          description: libraryEntry.description,
          tags: libraryEntry.tags,
          sha256: libraryEntry.sha256,
          generatedAt: now,
        };
        return { target, asset, historyEntry, cacheEntry };
      },
    );

    for (const item of imageResults) {
      if (!item?.asset) continue;
      nextAssets = nextAssets.filter(
        (asset) =>
          asset.id !== item.asset.id &&
          !(
            asset.beatId === item.target.beat.id &&
            asset.role === "primary_visual" &&
            asset.source?.provider === "openai-image"
          ),
      );
      const firstBeatMediaIndex = nextAssets.findIndex(
        (asset) => asset.beatId === item.target.beat.id && asset.role !== "voiceover",
      );
      if (firstBeatMediaIndex === -1) nextAssets.push(item.asset);
      else nextAssets.splice(firstBeatMediaIndex, 0, item.asset);
      await appendImageHistory(projectId, item.historyEntry);
      await appendImageCacheEntry(item.cacheEntry);
    }

    if (mode !== "selected" && coverage === "section") {
      const allTargets = imageTargetsFromPlan(plan);
      const generatedOrExisting = (target) =>
        nextAssets.find(
          (asset) => asset.id === target.assetId && asset.role === "primary_visual",
        ) ??
        nextAssets.find(
          (asset) => asset.beatId === target.beat.id && asset.role === "primary_visual",
        );
      const keyAssetsBySection = new Map();
      for (const target of allTargets) {
        const asset = generatedOrExisting(target);
        if (
          asset?.source?.provider === "openai-image" &&
          !keyAssetsBySection.has(target.section.id)
        ) {
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
            libraryPath: sourceAsset.source?.libraryPath,
            originalPath: sourceAsset.source?.originalPath,
            prompt: target.defaultPrompt,
            description: sourceAsset.source?.description,
            tags: sourceAsset.source?.tags,
            sha256: sourceAsset.source?.sha256,
          },
          width: sourceAsset.width,
          height: sourceAsset.height,
          status: "generated",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, assets: nextAssets }, null, 2)}\n`,
      "utf8",
    );
    const syncResult = await runLvstudio(["sync", projectId]);
    await appendQualityHistory(projectId, {
      timestamp: new Date().toISOString(),
      kind: "image_generation",
      summary: `Generated ${generated.length} OpenAI image asset(s); ${failed.length} failed.`,
      output: [
        syncResult.stdout.trim(),
        failed.length > 0 ? `Image failures:\n${JSON.stringify(failed, null, 2)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
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
        coverage,
      },
    });
    return {
      generated,
      failed,
      requested: targets.length,
      attempted: limitedTargets.length,
      coverage,
      remaining:
        coverage === "beat"
          ? 0
          : imageTargetsFromPlan(plan).filter((target) => {
              const hasAsset = nextAssets.some(
                (asset) => asset.role === "primary_visual" && asset.beatId === target.beat.id,
              );
              return !hasAsset;
            }).length,
      syncOutput: syncResult.stdout.trim(),
    };
  }

  return { selectImageTargets, generateProjectImages };
}

const REFERENCE_PRIORITY_SECTION_BOOST = { high: 20, medium: 8 };
const REFERENCE_PRIORITY_GLOBAL_BOOST = { high: 18, medium: 6 };
const COVERAGE_ROLE_BASE = { anchor: 40, key_moment: 24 };

function dimensionsFromSize(size) {
  const [width, height] = String(size || "")
    .toLowerCase()
    .split("x")
    .map((part) => Number(part));
  return { width, height };
}

function groupTargetsBySection(targets) {
  const bySection = new Map();
  for (const target of targets) {
    bySection.set(target.section.id, [...(bySection.get(target.section.id) ?? []), target]);
  }
  return bySection;
}

export function visualAssetMatchesSize(asset, expectedSize) {
  const expected = dimensionsFromSize(expectedSize);
  if (!expected.width || !expected.height) return true;
  return asset?.width === expected.width && asset?.height === expected.height;
}

function beatHasUsableVisualAsset(assets, assetId, beatId, expectedSize) {
  return assets.some(
    (asset) =>
      asset.role === "primary_visual" &&
      (asset.id === assetId || asset.beatId === beatId) &&
      visualAssetMatchesSize(asset, expectedSize),
  );
}

function sectionHasUsableVisualAsset(assets, sectionId, expectedSize) {
  return assets.some(
    (asset) =>
      asset.sectionId === sectionId &&
      asset.role === "primary_visual" &&
      visualAssetMatchesSize(asset, expectedSize),
  );
}

function balancedSectionTargets(sectionTargets) {
  if (sectionTargets.length <= 2) return sectionTargets;
  const limit = Math.min(3, Math.max(2, Math.ceil(sectionTargets.length / 2)));
  return sectionTargets
    .map((target, index) => {
      const text = [
        target.beat.narration,
        target.beat.notes,
        target.beat.visualPrompt,
        target.beat.voiceDirection?.deliveryNote,
      ]
        .join(" ")
        .toLowerCase();
      const intensity = Number(target.beat.voiceDirection?.intensity ?? target.beat.intensity ?? 0);
      const referenceBoost = REFERENCE_PRIORITY_SECTION_BOOST[target.referencePriority] ?? 0;
      const turningPoint =
        /\b(reveal|turn|sudden|suddenly|discover|realize|realise|but then|door|shadow|blood|scream|final|ending)\b/.test(
          text,
        );
      const score =
        (index === 0 ? 40 : 0) +
        (index === sectionTargets.length - 1 ? 35 : 0) +
        (turningPoint ? 24 : 0) +
        referenceBoost +
        intensity * 20 +
        Math.min(10, Number(target.beat.estimatedDurationSeconds ?? 0));
      return { target, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.target);
}

function llmGlobalTargets(allTargets) {
  if (allTargets.length === 0) return [];
  const ranked = allTargets
    .map((target, index) => {
      const role = target.beat.visual?.coverageRole;
      const imageChangeDecision = String(target.beat.imageChangeDecision || "").toLowerCase();
      const text = [
        target.beat.narration,
        target.beat.notes,
        target.beat.media?.[0]?.prompt,
        target.beat.voiceDirection?.deliveryNote,
      ]
        .join(" ")
        .toLowerCase();
      const hook =
        /\b(reveal|turn|sudden|discover|realize|but then|finally|ending|knock|shadow|blood|scream)\b/.test(
          text,
        );
      const base = COVERAGE_ROLE_BASE[role] ?? 0;
      const llmChangeBias = imageChangeDecision === "change" ? 22 : 0;
      const edge = index === 0 || index === allTargets.length - 1 ? 16 : 0;
      const intensity = Number(target.beat.voiceDirection?.intensity ?? 0) * 8;
      const referenceBoost = REFERENCE_PRIORITY_GLOBAL_BOOST[target.referencePriority] ?? 0;
      return {
        target,
        index,
        score: base + llmChangeBias + edge + (hook ? 10 : 0) + intensity + referenceBoost,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((entry) => {
      const role = entry.target.beat.visual?.coverageRole;
      const imageChangeDecision = String(entry.target.beat.imageChangeDecision || "").toLowerCase();
      return role === "anchor" || role === "key_moment" || imageChangeDecision === "change";
    })
    .map((entry) => entry.target);
  const minTargetCount = Math.min(24, Math.max(4, Math.ceil(allTargets.length * 0.45)));
  if (selected.length >= minTargetCount) return selected;
  const byId = new Map(selected.map((target) => [target.beat.id, target]));
  for (const entry of ranked) {
    if (byId.has(entry.target.beat.id)) continue;
    byId.set(entry.target.beat.id, entry.target);
    if (byId.size >= minTargetCount) break;
  }
  if (byId.size === 0 && allTargets.length > 0) byId.set(allTargets[0].beat.id, allTargets[0]);
  return [...byId.values()].sort((a, b) => a.beat.order - b.beat.order);
}

export function selectImageTargetsFromCandidates({
  allTargets,
  assets,
  mode,
  coverage,
  options = {},
}) {
  const force = options.force === true;
  const expectedSize = options.size;
  if (mode === "selected") {
    return allTargets
      .filter((target) => {
        if (target.assetId !== options.assetId) return false;
        const existing = assets.find(
          (asset) =>
            asset.id === target.assetId ||
            (asset.beatId === target.beat.id && asset.role === "primary_visual"),
        );
        return force || existing?.status !== "locked_by_user";
      })
      .slice(0, 1);
  }

  const unlockedTarget = (target) => {
    const existing = assets.find(
      (asset) =>
        asset.id === target.assetId ||
        (asset.beatId === target.beat.id && asset.role === "primary_visual"),
    );
    return force || existing?.status !== "locked_by_user";
  };

  if (coverage === "beat") {
    return allTargets.filter(
      (target) =>
        (mode === "all"
          ? true
          : !beatHasUsableVisualAsset(assets, target.assetId, target.beat.id, expectedSize)) &&
        unlockedTarget(target),
    );
  }

  if (coverage === "llm") {
    return llmGlobalTargets(allTargets).filter(
      (target) =>
        (mode === "all"
          ? true
          : !beatHasUsableVisualAsset(assets, target.assetId, target.beat.id, expectedSize)) &&
        unlockedTarget(target),
    );
  }

  const bySection = groupTargetsBySection(allTargets);
  const selected = [];
  for (const [sectionId, sectionTargets] of bySection.entries()) {
    const coverageTargets =
      coverage === "balanced" ? balancedSectionTargets(sectionTargets) : sectionTargets.slice(0, 1);
    if (
      coverage !== "balanced" &&
      mode === "missing" &&
      sectionHasUsableVisualAsset(assets, sectionId, expectedSize)
    )
      continue;
    for (const target of coverageTargets) {
      if (
        mode === "missing" &&
        beatHasUsableVisualAsset(assets, target.assetId, target.beat.id, expectedSize)
      )
        continue;
      if (unlockedTarget(target)) selected.push(target);
    }
  }
  return selected;
}

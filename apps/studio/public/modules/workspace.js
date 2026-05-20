export function pickSelectedBeat(plan, selectedBeatId) {
  const beats = (plan.sections ?? []).flatMap((section) => section.beats ?? []);
  if (selectedBeatId && beats.some((beat) => beat.id === selectedBeatId)) return selectedBeatId;
  return beats[0]?.id ?? "";
}

export function beatDurationSeconds(beatId, timeline) {
  const segment = timeline?.segments?.find((entry) => entry.beatId === beatId);
  return Number(segment?.durationSeconds || 0);
}

export function findBeat(plan, beatId) {
  for (const section of plan.sections ?? []) {
    const beat = (section.beats ?? []).find((entry) => entry.id === beatId);
    if (beat) return { section, beat };
  }
  return null;
}

export function voiceAssetForBeat(assets, beatId) {
  return assets.find((asset) => asset.role === "voiceover" && asset.beatId === beatId);
}

export function visualAssetForBeat(assets, timeline, beatId) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const segment = timeline?.segments?.find((entry) => entry.beatId === beatId);
  const timelineVisual = segment?.mediaAssetIds?.map((assetId) => assetsById.get(assetId)).find(Boolean);
  if (timelineVisual) return timelineVisual;
  return assets.find((asset) => asset.role === "primary_visual" && asset.beatId === beatId);
}

export function createReviewController({ reviewListEl, reviewFilterEl, fetchJson, onSelectBeat }) {
  let currentReview = [];

  function render() {
    reviewListEl.innerHTML = "";
    const filter = reviewFilterEl.value || "all";
    const rows = currentReview.filter((issue) => filter === "all" || issue.severity === filter);
    if (!rows.length) {
      reviewListEl.textContent = "No issues for this filter.";
      return;
    }
    for (const issue of rows) {
      const row = document.createElement("article");
      row.className = `review-item review-item-${issue.severity}`;
      const title = document.createElement("strong");
      title.textContent = `${issue.severity.toUpperCase()} · ${issue.code}`;
      const body = document.createElement("div");
      body.textContent = issue.message;
      row.append(title, body);
      const actions = document.createElement("div");
      actions.className = "review-actions";
      if (issue.beatId) {
        const selectBeat = document.createElement("button");
        selectBeat.type = "button";
        selectBeat.textContent = "Select Beat";
        selectBeat.onclick = () => onSelectBeat?.(issue.beatId);
        actions.appendChild(selectBeat);
      }
      row.appendChild(actions);
      reviewListEl.appendChild(row);
    }
  }

  async function refresh(projectId) {
    if (!projectId) return [];
    const result = await fetchJson(`/api/projects/${projectId}/review`);
    currentReview = result.data.issues || [];
    render();
    return currentReview;
  }

  return {
    getIssues: () => currentReview,
    render,
    refresh
  };
}

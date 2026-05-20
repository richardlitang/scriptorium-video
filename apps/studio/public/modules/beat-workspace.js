import { beatDurationSeconds, findBeat, pickSelectedBeat, voiceAssetForBeat } from "./workspace.js";

export function createBeatWorkspaceController({
  timelineEl,
  inspectorEl,
  getReviewIssues,
  getSelectedBeatId,
  setSelectedBeatId,
  persistSelectedBeatId,
  patchAssetStatus,
  onProjectRefresh,
  onPlanChanged,
  fetchJson,
  imageQualityValue,
  onBeatJobQueued
}) {
  function renderTimeline({ projectId, plan, timeline, assets, runState }) {
    timelineEl.innerHTML = "";
    const reviewCountsByBeat = getReviewIssues().reduce((acc, issue) => {
      if (!issue.beatId) return acc;
      acc.set(issue.beatId, (acc.get(issue.beatId) || 0) + 1);
      return acc;
    }, new Map());
    const hasStaleRender = Boolean(
      runState?.lastRenderPlanHash &&
      (
        runState?.lastRenderPlanHash !== runState?.currentPlanHash ||
        runState?.lastRenderTimelineHash !== runState?.currentTimelineHash
      )
    );

    const selectedBeat = pickSelectedBeat(plan, getSelectedBeatId());
    if (selectedBeat) {
      setSelectedBeatId(selectedBeat);
      persistSelectedBeatId(projectId, selectedBeat);
    }

    for (const section of plan.sections ?? []) {
      const lane = document.createElement("article");
      lane.className = "section-lane";
      const heading = document.createElement("h4");
      heading.textContent = section.title;
      lane.appendChild(heading);

      const row = document.createElement("div");
      row.className = "beat-row";
      for (const beat of section.beats ?? []) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `beat-card ${beat.id === getSelectedBeatId() ? "selected" : ""}`;
        card.onclick = () => {
          setSelectedBeatId(beat.id);
          persistSelectedBeatId(projectId, beat.id);
          renderTimeline({ projectId, plan, timeline, assets, runState });
          renderInspector({ projectId, plan, assets, timeline });
        };

        const top = document.createElement("div");
        top.className = "beat-card-top";
        const beatId = document.createElement("span");
        beatId.className = "beat-id";
        beatId.textContent = beat.id;
        const duration = document.createElement("span");
        duration.className = "beat-duration";
        const seconds = beatDurationSeconds(beat.id, timeline);
        duration.textContent = seconds > 0 ? `${seconds.toFixed(1)}s` : "n/a";
        top.append(beatId, duration);
        card.appendChild(top);

        const copy = document.createElement("div");
        copy.className = "beat-copy";
        copy.textContent = beat.narration.slice(0, 110);
        card.appendChild(copy);
        const issueCount = reviewCountsByBeat.get(beat.id) || 0;
        if (issueCount > 0) {
          const issues = document.createElement("div");
          issues.className = "status-pill warn";
          issues.textContent = `${issueCount} issue${issueCount === 1 ? "" : "s"}`;
          card.appendChild(issues);
        }

        const imageAsset = assets.find((asset) => asset.role === "primary_visual" && asset.beatId === beat.id);
        const voiceAsset = assets.find((asset) => asset.role === "voiceover" && asset.beatId === beat.id);
        const imageLocked = imageAsset?.status === "locked_by_user";
        const voiceLocked = voiceAsset?.status === "locked_by_user";
        const statusRow = document.createElement("div");
        statusRow.className = "beat-status-row";
        const chips = [
          { text: imageAsset ? "image" : "no image", className: imageAsset ? "ok" : "warn" },
          { text: voiceAsset ? "audio" : "no audio", className: voiceAsset ? "ok" : "warn" },
          { text: imageLocked || voiceLocked ? "locked" : "open", className: imageLocked || voiceLocked ? "ok" : "warn" },
          { text: hasStaleRender ? "render stale" : "render current", className: hasStaleRender ? "bad" : "ok" }
        ];
        for (const chip of chips) {
          const span = document.createElement("span");
          span.className = `status-pill ${chip.className}`;
          span.textContent = chip.text;
          statusRow.appendChild(span);
        }
        card.appendChild(statusRow);

        const actions = document.createElement("div");
        actions.className = "beat-inspector-actions";
        if (imageAsset) {
          const lockImage = document.createElement("button");
          lockImage.type = "button";
          lockImage.textContent = imageAsset.status === "locked_by_user" ? "Unlock Image" : "Lock Image";
          lockImage.onclick = async (event) => {
            event.stopPropagation();
            await patchAssetStatus(projectId, imageAsset.id, imageAsset.status === "locked_by_user" ? "generated" : "locked_by_user");
            await onProjectRefresh(projectId);
          };
          actions.appendChild(lockImage);
        }
        if (voiceAsset) {
          const lockVoice = document.createElement("button");
          lockVoice.type = "button";
          lockVoice.textContent = voiceAsset.status === "locked_by_user" ? "Unlock Audio" : "Lock Audio";
          lockVoice.onclick = async (event) => {
            event.stopPropagation();
            await patchAssetStatus(projectId, voiceAsset.id, voiceAsset.status === "locked_by_user" ? "generated" : "locked_by_user");
            await onProjectRefresh(projectId);
          };
          actions.appendChild(lockVoice);
        }
        card.appendChild(actions);
        row.appendChild(card);
      }

      lane.appendChild(row);
      timelineEl.appendChild(lane);
    }
  }

  function renderInspector({ projectId, plan, assets, timeline }) {
    inspectorEl.innerHTML = "";
    const selected = findBeat(plan, getSelectedBeatId());
    if (!selected) {
      inspectorEl.textContent = "Select a beat to inspect.";
      return;
    }
    const { beat, section } = selected;
    const voiceAsset = voiceAssetForBeat(assets, beat.id);
    const imageAsset = assets.find((asset) => asset.role === "primary_visual" && asset.beatId === beat.id);

    const sectionInfo = document.createElement("div");
    sectionInfo.className = "feedback-row feedback-info";
    sectionInfo.textContent = `${section.title} · ${beat.id} · ${beatDurationSeconds(beat.id, timeline).toFixed(1)}s`;
    inspectorEl.appendChild(sectionInfo);

    const narrationField = document.createElement("label");
    narrationField.className = "beat-inspector-field";
    narrationField.textContent = "Script";
    const narrationInput = document.createElement("textarea");
    narrationInput.value = beat.narration || "";
    narrationInput.rows = 4;
    narrationInput.oninput = () => {
      beat.narration = narrationInput.value;
      onPlanChanged(plan);
    };
    narrationField.appendChild(narrationInput);

    const voiceField = document.createElement("label");
    voiceField.className = "beat-inspector-field";
    voiceField.textContent = "Voice profile";
    const voiceSelect = document.createElement("select");
    const profiles = ["neutral", "warm_open", "clear_explainer", "authoritative", "energetic", "key_point", "reflective", "tense", "reveal", "urgent", "soft_close"];
    const currentProfile = beat.voiceDirection?.profile || "neutral";
    for (const profile of profiles) {
      const option = document.createElement("option");
      option.value = profile;
      option.textContent = profile;
      if (profile === currentProfile) option.selected = true;
      voiceSelect.appendChild(option);
    }
    voiceSelect.onchange = () => {
      beat.voiceDirection = { ...(beat.voiceDirection || {}), profile: voiceSelect.value, source: "user" };
      onPlanChanged(plan);
    };
    voiceField.appendChild(voiceSelect);

    const intensityField = document.createElement("label");
    intensityField.className = "beat-inspector-field";
    intensityField.textContent = "Voice intensity";
    const intensityInput = document.createElement("input");
    intensityInput.type = "range";
    intensityInput.min = "0";
    intensityInput.max = "1";
    intensityInput.step = "0.05";
    intensityInput.value = Number(beat.voiceDirection?.intensity ?? 0.5).toFixed(2);
    const intensityValue = document.createElement("output");
    intensityValue.value = Number(intensityInput.value).toFixed(2);
    intensityInput.oninput = () => {
      intensityValue.value = Number(intensityInput.value).toFixed(2);
      beat.voiceDirection = {
        ...(beat.voiceDirection || {}),
        intensity: Number(intensityInput.value),
        source: "user"
      };
      onPlanChanged(plan);
    };
    intensityField.append(intensityInput, intensityValue);

    const pauseBeforeField = document.createElement("label");
    pauseBeforeField.className = "beat-inspector-field";
    pauseBeforeField.textContent = "Pause before (seconds)";
    const pauseBeforeInput = document.createElement("input");
    pauseBeforeInput.type = "number";
    pauseBeforeInput.min = "0";
    pauseBeforeInput.max = "1.2";
    pauseBeforeInput.step = "0.05";
    pauseBeforeInput.value = Number(beat.voiceDirection?.pauseBeforeSeconds ?? 0).toFixed(2);
    pauseBeforeInput.onchange = () => {
      const next = Math.max(0, Math.min(1.2, Number(pauseBeforeInput.value) || 0));
      pauseBeforeInput.value = next.toFixed(2);
      beat.voiceDirection = {
        ...(beat.voiceDirection || {}),
        pauseBeforeSeconds: next,
        source: "user"
      };
      onPlanChanged(plan);
    };
    pauseBeforeField.appendChild(pauseBeforeInput);

    const pauseAfterField = document.createElement("label");
    pauseAfterField.className = "beat-inspector-field";
    pauseAfterField.textContent = "Pause after (seconds)";
    const pauseAfterInput = document.createElement("input");
    pauseAfterInput.type = "number";
    pauseAfterInput.min = "0";
    pauseAfterInput.max = "1.2";
    pauseAfterInput.step = "0.05";
    pauseAfterInput.value = Number(beat.voiceDirection?.pauseAfterSeconds ?? 0).toFixed(2);
    pauseAfterInput.onchange = () => {
      const next = Math.max(0, Math.min(1.2, Number(pauseAfterInput.value) || 0));
      pauseAfterInput.value = next.toFixed(2);
      beat.voiceDirection = {
        ...(beat.voiceDirection || {}),
        pauseAfterSeconds: next,
        source: "user"
      };
      onPlanChanged(plan);
    };
    pauseAfterField.appendChild(pauseAfterInput);

    const deliveryNoteField = document.createElement("label");
    deliveryNoteField.className = "beat-inspector-field";
    deliveryNoteField.textContent = "Delivery note";
    const deliveryNoteInput = document.createElement("textarea");
    deliveryNoteInput.rows = 2;
    deliveryNoteInput.value = beat.voiceDirection?.deliveryNote || "";
    deliveryNoteInput.oninput = () => {
      beat.voiceDirection = {
        ...(beat.voiceDirection || {}),
        deliveryNote: deliveryNoteInput.value.trim() || undefined,
        source: "user"
      };
      onPlanChanged(plan);
    };
    deliveryNoteField.appendChild(deliveryNoteInput);

    const actions = document.createElement("div");
    actions.className = "beat-inspector-actions";
    const regenerateBtn = document.createElement("button");
    regenerateBtn.type = "button";
    regenerateBtn.textContent = "Regenerate Beat";
    regenerateBtn.onclick = async () => {
      regenerateBtn.disabled = true;
      regenerateBtn.textContent = "Running...";
      try {
        await fetchJson(`/api/projects/${projectId}/beats/${encodeURIComponent(beat.id)}/regenerate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ audio: true, image: true, captions: true, render: false, force: false, quality: imageQualityValue() })
        });
        await onBeatJobQueued(projectId, beat.id, false);
      } finally {
        regenerateBtn.disabled = false;
        regenerateBtn.textContent = "Regenerate Beat";
      }
    };
    const renderNowBtn = document.createElement("button");
    renderNowBtn.type = "button";
    renderNowBtn.textContent = "Regenerate + Render";
    renderNowBtn.onclick = async () => {
      renderNowBtn.disabled = true;
      try {
        await fetchJson(`/api/projects/${projectId}/beats/${encodeURIComponent(beat.id)}/regenerate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ audio: true, image: true, captions: true, render: true, force: false, quality: imageQualityValue() })
        });
        await onBeatJobQueued(projectId, beat.id, true);
      } finally {
        renderNowBtn.disabled = false;
      }
    };
    actions.append(regenerateBtn, renderNowBtn);

    const assetsInfo = document.createElement("div");
    assetsInfo.className = "feedback-row";
    assetsInfo.textContent = `Image: ${imageAsset ? imageAsset.status : "missing"} · Audio: ${voiceAsset ? voiceAsset.status : "missing"}`;

    inspectorEl.append(
      sectionInfo,
      narrationField,
      voiceField,
      intensityField,
      pauseBeforeField,
      pauseAfterField,
      deliveryNoteField,
      assetsInfo,
      actions
    );
  }

  return {
    renderTimeline,
    renderInspector
  };
}

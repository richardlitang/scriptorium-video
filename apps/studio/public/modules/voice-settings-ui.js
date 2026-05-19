export function createVoiceSettingsController({
  elements,
  fetchJson,
  readStored,
  writeStored,
  getSelectedProjectId
}) {
  const {
    dialog,
    form,
    status,
    ttsModel,
    audioPromptPath,
    deliveryProfile,
    intensity,
    stability,
    pacing,
    variation,
    exaggeration,
    cfgWeight,
    temperature,
    seed,
    intensityValue,
    stabilityValue,
    pacingValue,
    variationValue,
    exaggerationValue,
    cfgWeightValue,
    temperatureValue,
    pickReferenceBtn,
    clearReferenceBtn,
    referenceFile,
    previewABtn,
    previewBBtn,
    previewLineAInput,
    previewLineBInput,
    previewAudio
  } = elements;

  let previewController = null;
  const previewCache = new Map();
  const defaultLineA = "I should have turned back when the hallway lights began to flicker, but I kept walking.";
  const defaultLineB = "By the time the last train arrived, everyone on the platform had vanished except me.";

  function updateOutputs() {
    intensityValue.value = Number(intensity.value || 0).toFixed(2);
    stabilityValue.value = Number(stability.value || 0).toFixed(2);
    pacingValue.value = Number(pacing.value || 0).toFixed(2);
    variationValue.value = Number(variation.value || 0).toFixed(2);
    exaggerationValue.value = Number(exaggeration.value || 0).toFixed(2);
    cfgWeightValue.value = Number(cfgWeight.value || 0).toFixed(2);
    temperatureValue.value = Number(temperature.value || 0).toFixed(2);
  }

  function applySettings(settings) {
    ttsModel.value = settings.ttsModel ?? "chatterbox";
    audioPromptPath.value = settings.audioPromptPath ?? "";
    deliveryProfile.value = settings.deliveryProfile ?? "suspense";
    intensity.value = settings.intensity ?? 0.55;
    stability.value = settings.stability ?? 0.65;
    pacing.value = settings.pacing ?? 0.5;
    variation.value = settings.variation ?? 0.5;
    exaggeration.value = settings.exaggeration ?? 0.55;
    cfgWeight.value = settings.cfgWeight ?? 0.35;
    temperature.value = settings.temperature ?? 0.75;
    seed.value = settings.seed ?? "";
    updateOutputs();
  }

  function readForm() {
    return {
      ttsModel: ttsModel.value,
      audioPromptPath: audioPromptPath.value,
      deliveryProfile: deliveryProfile.value,
      intensity: Number(intensity.value),
      stability: Number(stability.value),
      pacing: Number(pacing.value),
      variation: Number(variation.value),
      exaggeration: Number(exaggeration.value),
      cfgWeight: Number(cfgWeight.value),
      temperature: Number(temperature.value),
      seed: seed.value
    };
  }

  function previewLineA() {
    const value = previewLineAInput.value.trim();
    return value || defaultLineA;
  }

  function previewLineB() {
    const value = previewLineBInput.value.trim();
    return value || defaultLineB;
  }

  async function loadSettings() {
    const result = await fetchJson("/api/settings/voice");
    applySettings(result.data);
  }

  async function saveSettings(statusText = "Saved. Regenerate narration to hear these settings.") {
    const result = await fetchJson("/api/settings/voice", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readForm())
    });
    applySettings(result.data);
    status.textContent = statusText;
    return result.data;
  }

  async function runPreview(sentence) {
    const key = JSON.stringify({ settings: readForm(), sentence });
    const cachedUrl = previewCache.get(key);
    if (cachedUrl) {
      previewAudio.src = cachedUrl;
      await previewAudio.play().catch(() => {});
      status.textContent = "Preview ready (cached).";
      return;
    }

    if (previewController) previewController.abort();
    previewController = new AbortController();
    status.textContent = "Generating preview (first run can take longer)...";
    previewABtn.disabled = true;
    previewBBtn.disabled = true;
    try {
      const response = await fetch("/api/settings/voice/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: previewController.signal,
        body: JSON.stringify({ settings: readForm(), text: sentence })
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Preview failed.");
      }
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      previewCache.set(key, audioUrl);
      if (previewCache.size > 10) {
        const first = previewCache.keys().next().value;
        const firstUrl = previewCache.get(first);
        if (firstUrl) URL.revokeObjectURL(firstUrl);
        previewCache.delete(first);
      }
      previewAudio.src = audioUrl;
      await previewAudio.play().catch(() => {});
      status.textContent = "Preview ready.";
    } catch (error) {
      if (error?.name === "AbortError") status.textContent = "Previous preview canceled.";
      else status.textContent = String(error);
    } finally {
      previewABtn.disabled = false;
      previewBBtn.disabled = false;
      previewController = null;
    }
  }

  async function uploadReference(file) {
    if (!file) return;
    status.textContent = `Uploading ${file.name}...`;
    const response = await fetch(`/api/settings/voice/reference?filename=${encodeURIComponent(file.name)}`, {
      method: "PUT",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: await file.arrayBuffer()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || "Failed to upload voice reference.");
    audioPromptPath.value = payload.data.path;
    await saveSettings(`Reference saved: ${payload.data.path}`);
  }

  function applyPreset(preset) {
    const presets = {
      controlled: { exaggeration: 0.45, cfgWeight: 0.45, temperature: 0.6 },
      suspense: { exaggeration: 0.55, cfgWeight: 0.35, temperature: 0.75 },
      dramatic: { exaggeration: 0.7, cfgWeight: 0.3, temperature: 0.85 }
    };
    const values = presets[preset];
    if (!values) return;
    exaggeration.value = values.exaggeration;
    cfgWeight.value = values.cfgWeight;
    temperature.value = values.temperature;
    updateOutputs();
  }

  function restorePreviewLines(projectId) {
    previewLineAInput.value = readStored(projectId, "voicePreviewLineA", defaultLineA);
    previewLineBInput.value = readStored(projectId, "voicePreviewLineB", defaultLineB);
  }

  function setupEvents() {
    [intensity, stability, pacing, variation, exaggeration, cfgWeight, temperature].forEach((control) => {
      control.addEventListener("input", updateOutputs);
    });
    pickReferenceBtn.onclick = () => referenceFile.click();
    clearReferenceBtn.onclick = async () => {
      audioPromptPath.value = "";
      try {
        await saveSettings("Reference reset to default voice.");
      } catch (error) {
        status.textContent = String(error);
      }
    };
    referenceFile.addEventListener("change", async () => {
      const [file] = referenceFile.files ?? [];
      try {
        await uploadReference(file);
      } catch (error) {
        status.textContent = String(error);
      } finally {
        referenceFile.value = "";
      }
    });
    previewABtn.onclick = () => runPreview(previewLineA());
    previewBBtn.onclick = () => runPreview(previewLineB());
    previewLineAInput.addEventListener("input", () => {
      const projectId = getSelectedProjectId();
      if (!projectId) return;
      writeStored(projectId, "voicePreviewLineA", previewLineAInput.value);
    });
    previewLineBInput.addEventListener("input", () => {
      const projectId = getSelectedProjectId();
      if (!projectId) return;
      writeStored(projectId, "voicePreviewLineB", previewLineBInput.value);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Saving...";
      try {
        await saveSettings();
      } catch (error) {
        status.textContent = String(error);
      }
    });
  }

  async function openDialog() {
    status.textContent = "Loading settings...";
    try {
      await loadSettings();
      status.textContent = "";
      dialog.showModal();
    } catch (error) {
      status.textContent = String(error);
      dialog.showModal();
    }
  }

  function closeDialog() {
    dialog.close();
  }

  return {
    setupEvents,
    updateOutputs,
    applyPreset,
    openDialog,
    closeDialog,
    loadSettings,
    restorePreviewLines
  };
}

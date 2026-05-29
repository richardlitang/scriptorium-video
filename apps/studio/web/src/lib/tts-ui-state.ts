import type { TtsHealthState } from "@/queries/tts";

export type TtsAvailability =
  | "ready"
  | "ready_degraded"
  | "loading"
  | "checking"
  | "failed"
  | "unreachable";

export type TtsPillViewModel = {
  pillClass: "ok" | "warn" | "bad";
  pillText: string;
  pillTitle: string;
  detailClass: "ok" | "warn" | "bad";
  detailText: string;
};

export function ttsAvailabilityFromHealth(
  ttsHealthState: Partial<TtsHealthState> = {},
): TtsAvailability {
  const status = ttsHealthState.status ?? "checking";
  if (status === "ready" && ttsHealthState.ok) return "ready";
  if (status === "no_health_endpoint" && ttsHealthState.ok) return "ready_degraded";
  if (status === "loading") return "loading";
  if (status === "failed") return "failed";
  if (status === "unreachable") return "unreachable";
  return "checking";
}

export function ttsPillViewModel(ttsHealthState: Partial<TtsHealthState> = {}): TtsPillViewModel {
  const availability = ttsAvailabilityFromHealth(ttsHealthState);

  if (availability === "ready") {
    const sampleRateLabel = ttsHealthState.sampleRate ? ` (${ttsHealthState.sampleRate}Hz)` : "";
    return {
      pillClass: "ok",
      pillText: `TTS: ready${sampleRateLabel}`,
      pillTitle: "Chatterbox is ready for draft narration.",
      detailClass: "ok",
      detailText:
        "Narration service is ready. You can run Make Draft, Regenerate Narration, or Direct Voice now.",
    };
  }

  if (availability === "ready_degraded") {
    return {
      pillClass: "warn",
      pillText: "TTS: reachable (no /health)",
      pillTitle:
        "TTS endpoint is reachable but does not expose /health; Studio will proceed optimistically.",
      detailClass: "warn",
      detailText:
        "TTS server is reachable, but it does not provide a health endpoint. Draft actions are enabled; if generation fails, verify the speech endpoint configuration.",
    };
  }

  if (availability === "loading") {
    return {
      pillClass: "warn",
      pillText: "TTS: warming model...",
      pillTitle: "First run downloads/loads the TTS model. Draft actions are paused until ready.",
      detailClass: "warn",
      detailText:
        "Model is loading/downloading in the background. This is expected on first run and may take a few minutes. Studio auto-rechecks every 8 seconds.",
    };
  }

  if (availability === "checking") {
    return {
      pillClass: "bad",
      pillText: "TTS: checking...",
      pillTitle: "Checking Chatterbox status.",
      detailClass: "warn",
      detailText:
        "Checking narration service availability. If this stays here for more than ~20 seconds, verify the Chatterbox server process is running.",
    };
  }

  const reason = ttsHealthState.error ? `Reason: ${ttsHealthState.error}. ` : "";
  return {
    pillClass: "bad",
    pillText: "TTS: unavailable",
    pillTitle: ttsHealthState.error ?? "Chatterbox is unreachable or failed to load.",
    detailClass: "bad",
    detailText: `${reason}Start the Chatterbox server, keep this page open, and Studio will enable draft actions automatically once status becomes ready.`,
  };
}

export type StoryButtonStateInput = {
  selectedProjectId: string | null;
  storyValue: string;
  currentDraftJobStatus: string | null;
  ttsAvailability: TtsAvailability;
  defaultDraftButtonLabel: string;
};

export type StoryButtonState = {
  convertStoryDisabled: boolean;
  aiPlanDisabled: boolean;
  clearStoryDisabled: boolean;
  renderDisabled: boolean;
  draftNoImagesDisabled: boolean;
  renderButtonText: string | null;
  draftNoImagesText: string | null;
  directVoiceDisabled: boolean;
  regenerateAudioDisabled: boolean;
  prepareDraftDisabled: boolean;
  stopRunDisabled: boolean;
};

export function storyButtonState({
  selectedProjectId,
  storyValue,
  currentDraftJobStatus,
  ttsAvailability,
  defaultDraftButtonLabel,
}: StoryButtonStateInput): StoryButtonState {
  const hasSelectedProject = Boolean(selectedProjectId);
  const hasStory = String(storyValue ?? "").trim().length > 0;
  const draftJobRunning = ["queued", "running", "cancelling"].includes(currentDraftJobStatus ?? "");
  const ttsReady = ttsAvailability === "ready" || ttsAvailability === "ready_degraded";
  const ttsWarming = ttsAvailability === "loading" || ttsAvailability === "checking";

  function idleDraftLabel(): string {
    if (!hasStory) return "Paste Story First";
    if (!ttsReady) return ttsWarming ? "TTS Warming..." : "TTS Unavailable";
    return defaultDraftButtonLabel;
  }

  return {
    convertStoryDisabled: !hasSelectedProject || !hasStory,
    aiPlanDisabled: !hasSelectedProject || !hasStory,
    clearStoryDisabled: !hasStory,
    renderDisabled: !hasStory || draftJobRunning || !ttsReady,
    draftNoImagesDisabled: !hasStory || draftJobRunning || !ttsReady,
    renderButtonText: draftJobRunning ? null : idleDraftLabel(),
    draftNoImagesText: !draftJobRunning ? "Draft Without Images" : null,
    directVoiceDisabled: !hasSelectedProject || !ttsReady,
    regenerateAudioDisabled: !hasSelectedProject || !ttsReady,
    prepareDraftDisabled: !hasSelectedProject || !ttsReady,
    stopRunDisabled: !draftJobRunning,
  };
}

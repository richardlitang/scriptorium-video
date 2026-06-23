import { describe, it, expect } from "vitest";
import { storyButtonState, ttsAvailabilityFromHealth, ttsPillViewModel } from "../tts-ui-state";

describe("ttsAvailabilityFromHealth", () => {
  it("returns ready when status=ready and ok=true", () => {
    expect(ttsAvailabilityFromHealth({ ok: true, status: "ready" })).toBe("ready");
  });

  it("returns ready_degraded when status=no_health_endpoint and ok=true", () => {
    expect(ttsAvailabilityFromHealth({ ok: true, status: "no_health_endpoint" })).toBe(
      "ready_degraded",
    );
  });

  it("returns loading when status=loading", () => {
    expect(ttsAvailabilityFromHealth({ ok: false, status: "loading" })).toBe("loading");
  });

  it("returns unreachable when status=unreachable", () => {
    expect(ttsAvailabilityFromHealth({ ok: false, status: "unreachable" })).toBe("unreachable");
  });

  it("returns checking when status is absent", () => {
    expect(ttsAvailabilityFromHealth({})).toBe("checking");
  });

  it("returns checking (not ready) when ok=false and status=ready", () => {
    expect(ttsAvailabilityFromHealth({ ok: false, status: "ready" })).toBe("checking");
  });
});

describe("ttsPillViewModel", () => {
  it("shows green pill when ready", () => {
    const vm = ttsPillViewModel({ ok: true, status: "ready", sampleRate: 24000 });
    expect(vm.pillClass).toBe("ok");
    expect(vm.pillText).toContain("ready");
    expect(vm.pillText).toContain("24000Hz");
  });

  it("shows warn pill when model is warming", () => {
    const vm = ttsPillViewModel({ ok: false, status: "loading" });
    expect(vm.pillClass).toBe("warn");
    expect(vm.pillText).toContain("warming");
  });

  it("shows bad pill when unreachable", () => {
    const vm = ttsPillViewModel({ ok: false, status: "unreachable", error: "ECONNREFUSED" });
    expect(vm.pillClass).toBe("bad");
    expect(vm.pillText).toBe("TTS: unavailable");
    expect(vm.detailText).toContain("ECONNREFUSED");
  });

  it("shows bad pill and checking detail when status unknown", () => {
    const vm = ttsPillViewModel({});
    expect(vm.pillClass).toBe("bad");
    expect(vm.pillText).toContain("checking");
  });
});

describe("storyButtonState", () => {
  it("enables story actions when a selected project has story text and TTS is ready", () => {
    const state = storyButtonState({
      selectedProjectId: "demo",
      storyValue: "A short story",
      currentDraftJobStatus: null,
      ttsAvailability: "ready",
      defaultDraftButtonLabel: "Make Draft",
    });

    expect(state.convertStoryDisabled).toBe(false);
    expect(state.aiPlanDisabled).toBe(false);
    expect(state.renderDisabled).toBe(false);
    expect(state.draftNoImagesDisabled).toBe(false);
    expect(state.renderButtonText).toBe("Make Draft");
    expect(state.draftNoImagesText).toBe("Draft Without Images");
    expect(state.stopRunDisabled).toBe(true);
  });

  it("disables draft actions and shows warming copy while TTS is loading", () => {
    const state = storyButtonState({
      selectedProjectId: "demo",
      storyValue: "A short story",
      currentDraftJobStatus: null,
      ttsAvailability: "loading",
      defaultDraftButtonLabel: "Make Draft",
    });

    expect(state.convertStoryDisabled).toBe(false);
    expect(state.renderDisabled).toBe(true);
    expect(state.draftNoImagesDisabled).toBe(true);
    expect(state.renderButtonText).toBe("TTS Warming...");
    expect(state.directVoiceDisabled).toBe(true);
    expect(state.prepareDraftDisabled).toBe(true);
  });

  it("suppresses draft labels and enables stop while a draft job is active", () => {
    const state = storyButtonState({
      selectedProjectId: "demo",
      storyValue: "A short story",
      currentDraftJobStatus: "running",
      ttsAvailability: "ready_degraded",
      defaultDraftButtonLabel: "Make Draft",
    });

    expect(state.renderDisabled).toBe(true);
    expect(state.draftNoImagesDisabled).toBe(true);
    expect(state.renderButtonText).toBeNull();
    expect(state.draftNoImagesText).toBeNull();
    expect(state.stopRunDisabled).toBe(false);
  });

  it("requires selected project and story content for project-bound story actions", () => {
    const state = storyButtonState({
      selectedProjectId: null,
      storyValue: "   ",
      currentDraftJobStatus: null,
      ttsAvailability: "failed",
      defaultDraftButtonLabel: "Make Draft",
    });

    expect(state.convertStoryDisabled).toBe(true);
    expect(state.aiPlanDisabled).toBe(true);
    expect(state.clearStoryDisabled).toBe(true);
    expect(state.renderButtonText).toBe("Paste Story First");
    expect(state.directVoiceDisabled).toBe(true);
    expect(state.regenerateAudioDisabled).toBe(true);
  });
});

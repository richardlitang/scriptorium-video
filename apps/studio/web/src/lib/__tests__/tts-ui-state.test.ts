import { describe, it, expect } from "vitest";
import { ttsAvailabilityFromHealth, ttsPillViewModel } from "../tts-ui-state";

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

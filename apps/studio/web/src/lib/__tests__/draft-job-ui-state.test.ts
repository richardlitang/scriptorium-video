import { describe, it, expect } from "vitest";
import {
  draftJobProgressLine,
  draftJobUiModel,
  shouldNotifyDraftJobFinished,
  isJobActive,
  type DraftJob,
} from "../draft-job-ui-state";

const base = (overrides: Partial<DraftJob>): DraftJob => ({
  kind: "draft_job",
  status: "running",
  ...overrides,
});

describe("isJobActive", () => {
  it.each(["queued", "running", "cancelling"] as const)("returns true for %s", (s) => {
    expect(isJobActive(s)).toBe(true);
  });
  it.each(["completed", "failed", "cancelled"] as const)("returns false for %s", (s) => {
    expect(isJobActive(s)).toBe(false);
  });
});

describe("draftJobProgressLine", () => {
  it("returns undefined for non-draft-job kind", () => {
    expect(draftJobProgressLine({ kind: "other", status: "running" })).toBeUndefined();
  });

  it("formats progress with beat info", () => {
    const line = draftJobProgressLine(
      base({ label: "TTS", total: 10, completed: 3, currentBeatIndex: 2, currentBeatTotal: 5 }),
    );
    expect(line).toContain("3/10");
    expect(line).toContain("beat 2/5");
  });

  it("includes retry info when attempt > 1", () => {
    const line = draftJobProgressLine(base({ attempt: 2, maxAttempts: 3, total: 4, completed: 1 }));
    expect(line).toContain("retry 2/3");
  });
});

describe("draftJobUiModel", () => {
  it("hides banner for null job", () => {
    const m = draftJobUiModel(null, undefined, "Make Draft");
    expect(m.hideBanner).toBe(true);
    expect(m.renderButtonText).toBe("Make Draft");
  });

  it("shows running banner", () => {
    const m = draftJobUiModel(base({ status: "running" }), "TTS · 2/5", "Make Draft");
    expect(m.hideBanner).toBe(false);
    expect(m.bannerStatus).toBe("running");
    expect(m.renderButtonDisabled).toBe(true);
    expect(m.stopRunDisabled).toBe(false);
  });

  it("shows completed banner", () => {
    const m = draftJobUiModel(base({ status: "completed" }), undefined, "Make Draft");
    expect(m.bannerStatus).toBe("completed");
    expect(m.stopRunDisabled).toBe(true);
  });

  it("shows failed banner with error", () => {
    const m = draftJobUiModel(base({ status: "failed", error: "Out of memory" }), undefined, "Make Draft");
    expect(m.bannerStatus).toBe("failed");
    expect(m.bannerDetail).toContain("Out of memory");
  });
});

describe("shouldNotifyDraftJobFinished", () => {
  it("returns false for active job", () => {
    expect(shouldNotifyDraftJobFinished(null, base({ status: "running", jobId: "j1" }))).toBe(false);
  });

  it("returns true for new completed job", () => {
    expect(shouldNotifyDraftJobFinished(null, base({ status: "completed", jobId: "j1" }))).toBe(true);
  });

  it("returns false for already-seen completed job", () => {
    expect(shouldNotifyDraftJobFinished("j1", base({ status: "completed", jobId: "j1" }))).toBe(false);
  });
});

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TtsHealthPill } from "../TtsHealthPill";
import * as ttsQueries from "@/queries/tts";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("TtsHealthPill", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows checking state while loading", () => {
    vi.spyOn(ttsQueries, "useTtsHealth").mockReturnValue({
      data: undefined,
    } as ReturnType<typeof ttsQueries.useTtsHealth>);
    render(<TtsHealthPill />, { wrapper });
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it("shows ready when TTS is healthy", () => {
    vi.spyOn(ttsQueries, "useTtsHealth").mockReturnValue({
      data: { ok: true, status: "ready", sampleRate: 24000, error: null },
    } as ReturnType<typeof ttsQueries.useTtsHealth>);
    render(<TtsHealthPill />, { wrapper });
    expect(screen.getByText(/ready.*24000Hz/)).toBeInTheDocument();
  });

  it("shows unavailable when TTS is unreachable", () => {
    vi.spyOn(ttsQueries, "useTtsHealth").mockReturnValue({
      data: { ok: false, status: "unreachable", sampleRate: null, error: "ECONNREFUSED" },
    } as ReturnType<typeof ttsQueries.useTtsHealth>);
    render(<TtsHealthPill />, { wrapper });
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});

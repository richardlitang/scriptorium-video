import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StartupPanel } from "../StartupPanel";
import * as client from "@/api/client";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("StartupPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client.api.tts, "health").mockResolvedValue({
      ok: false,
      status: "loading",
      sampleRate: null,
      error: null,
    });
  });

  it("shows a loading state while projects load", () => {
    render(
      <StartupPanel projectsLoading hasProjects={false} onCreate={vi.fn()} creating={false} />,
      { wrapper },
    );
    expect(screen.getByText("Starting Studio")).toBeInTheDocument();
    expect(screen.getByText("Loading your projects…")).toBeInTheDocument();
  });

  it("offers to create a project when there are none", async () => {
    const onCreate = vi.fn();
    render(
      <StartupPanel
        projectsLoading={false}
        hasProjects={false}
        onCreate={onCreate}
        creating={false}
      />,
      { wrapper },
    );
    const button = screen.getByRole("button", { name: "New project" });
    await userEvent.click(button);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("reflects the warming narration engine status", async () => {
    render(
      <StartupPanel projectsLoading={false} hasProjects onCreate={vi.fn()} creating={false} />,
      { wrapper },
    );
    expect(await screen.findByText("Warming narration model…")).toBeInTheDocument();
    // With existing projects and nothing selected, point the user at the sidebar.
    expect(screen.getByText("Pick up where you left off")).toBeInTheDocument();
  });
});

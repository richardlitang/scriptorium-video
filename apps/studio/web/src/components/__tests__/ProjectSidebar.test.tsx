import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectSidebar } from "../ProjectSidebar";
import * as client from "@/api/client";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ProjectSidebar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially", () => {
    vi.spyOn(client.api.projects, "list").mockReturnValue(new Promise(() => {}));
    render(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />, { wrapper });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders project list", async () => {
    vi.spyOn(client.api.projects, "list").mockResolvedValue({
      projects: [
        { id: "abc", title: "My Film", mode: "landscape", status: "active" },
        { id: "xyz", title: "Short", mode: "vertical", status: "draft" },
      ],
    });
    render(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />, { wrapper });
    expect(await screen.findByText("My Film")).toBeInTheDocument();
    expect(screen.getByText("Short")).toBeInTheDocument();
  });

  it("shows empty state when no projects", async () => {
    vi.spyOn(client.api.projects, "list").mockResolvedValue({
      projects: [],
    });
    render(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />, { wrapper });
    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });
});

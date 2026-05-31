import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanEditor } from "../PlanEditor";
import * as planner from "@/queries/planner";

const VALID_PLAN = JSON.stringify({ schemaVersion: 1, title: "Test", sections: [] }, null, 2);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const defaultFlags = { hasUnsavedPlan: false, needsPrepareDraft: false, needsRender: false };

describe("PlanEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows Save Plan button", () => {
    vi.spyOn(planner, "useSavePlan").mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof planner.useSavePlan>);

    render(
      <PlanEditor
        projectId="abc"
        planJson={VALID_PLAN}
        onChange={vi.fn()}
        workflowFlags={defaultFlags}
        onSaved={vi.fn()}
        qualityLog={[]}
      />,
      { wrapper },
    );
    expect(screen.getByRole("button", { name: /save plan/i })).toBeInTheDocument();
  });

  it("shows unsaved plan warning when flag is set", () => {
    vi.spyOn(planner, "useSavePlan").mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof planner.useSavePlan>);

    render(
      <PlanEditor
        projectId="abc"
        planJson={VALID_PLAN}
        onChange={vi.fn()}
        workflowFlags={{ hasUnsavedPlan: true, needsPrepareDraft: true, needsRender: true }}
        onSaved={vi.fn()}
        qualityLog={[]}
      />,
      { wrapper },
    );
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("shows invalid JSON error when plan is malformed and save is clicked", async () => {
    vi.spyOn(planner, "useSavePlan").mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof planner.useSavePlan>);

    render(
      <PlanEditor
        projectId="abc"
        planJson="{ not valid json"
        onChange={vi.fn()}
        workflowFlags={defaultFlags}
        onSaved={vi.fn()}
        qualityLog={[]}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("button", { name: /save plan/i }));
    expect(await screen.findByText(/invalid json/i)).toBeInTheDocument();
  });

  it("renders quality log entries", () => {
    vi.spyOn(planner, "useSavePlan").mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof planner.useSavePlan>);

    render(
      <PlanEditor
        projectId="abc"
        planJson={VALID_PLAN}
        onChange={vi.fn()}
        workflowFlags={defaultFlags}
        onSaved={vi.fn()}
        qualityLog={["Plan saved.", "Quality check passed."]}
      />,
      { wrapper },
    );
    expect(screen.getByText(/Plan saved./)).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewPanel } from "../ReviewPanel";
import * as reviewQueries from "@/queries/review";

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("ReviewPanel", () => {
  it("filters canonical critical review issues", () => {
    vi.spyOn(reviewQueries, "useProjectReview").mockReturnValue({
      data: [{ id: "1", severity: "critical", scope: "beat", code: "missing", message: "Missing" }],
      isLoading: false,
      refetch: vi.fn(),
    } as ReturnType<typeof reviewQueries.useProjectReview>);
    render(<ReviewPanel projectId="demo" />, { wrapper });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "critical" } });
    expect(screen.getByText(/CRITICAL.*missing/i)).toBeInTheDocument();
  });
});

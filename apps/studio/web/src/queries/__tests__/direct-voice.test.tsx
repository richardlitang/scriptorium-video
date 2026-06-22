import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useDirectVoice } from "../draft-job";

describe("useDirectVoice", () => {
  it("calls the typed client and invalidates the draft-job query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const directVoice = vi.spyOn(api.projects, "directVoice").mockResolvedValue({});

    const { result } = renderHook(() => useDirectVoice("demo"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(directVoice).toHaveBeenCalledWith("demo");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["projects", "demo", "draft-job"] });
  });
});

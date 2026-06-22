import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useRegenerateBeat } from "../assets";

describe("useRegenerateBeat", () => {
  it("uses the typed client and refreshes project state", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const regenerateBeat = vi.spyOn(api.projects, "regenerateBeat").mockResolvedValue({});
    const { result } = renderHook(() => useRegenerateBeat("demo"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ beatId: "b1", render: false, quality: "low" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(regenerateBeat).toHaveBeenCalledWith("demo", "b1", {
      audio: true,
      image: true,
      captions: true,
      render: false,
      force: false,
      quality: "low",
    });
  });
});

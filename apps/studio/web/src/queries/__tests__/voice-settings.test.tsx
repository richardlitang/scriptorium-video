import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { defaultVoiceSettings } from "../../../../voice-settings.mjs";
import { useSaveVoiceSettings } from "../voice-settings";

describe("voice settings mutations", () => {
  it("saves through the typed client", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const save = vi.spyOn(api.voice, "saveSettings").mockResolvedValue(defaultVoiceSettings);
    const { result } = renderHook(() => useSaveVoiceSettings(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate(defaultVoiceSettings);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(save).toHaveBeenCalledWith(defaultVoiceSettings);
  });
});

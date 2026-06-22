import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../voice-settings.mjs", () => ({
  defaultVoiceSettings: {
    ttsModel: "chatterbox",
    audioPromptPath: "",
    deliveryProfile: "suspense",
    intensity: 0.2,
    stability: 0.65,
    pacing: 0.5,
    variation: 0.5,
    exaggeration: 0.55,
    cfgWeight: 0.35,
    temperature: 0.75,
    seed: "",
  },
}));

import { VoiceSettingsDialog } from "../VoiceSettingsDialog";

describe("VoiceSettingsDialog", () => {
  it("uses the canonical Studio voice defaults", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VoiceSettingsDialog projectId="demo" trigger={<button type="button">Open voice</button>} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open voice" }));

    expect(screen.getAllByRole("slider")[0]).toHaveValue("0.2");
  });
});

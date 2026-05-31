import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export const ttsKeys = {
  health: ["tts", "health"] as const,
};

export type TtsHealthState = {
  ok: boolean;
  status: "ready" | "no_health_endpoint" | "loading" | "failed" | "unreachable" | "checking";
  sampleRate: number | null;
  error: string | null;
  provider?: string;
};

const CHECKING_STATE: TtsHealthState = {
  ok: false,
  status: "checking",
  sampleRate: null,
  error: null,
};

const UNREACHABLE_STATE = (error: string): TtsHealthState => ({
  ok: false,
  status: "unreachable",
  sampleRate: null,
  error,
});

export function useTtsHealth() {
  return useQuery({
    queryKey: ttsKeys.health,
    queryFn: async (): Promise<TtsHealthState> => {
      try {
        const result = await api.tts.health();
        return (result as TtsHealthState) ?? CHECKING_STATE;
      } catch (err) {
        const msg = String(err ?? "");
        const isMissingRoute =
          /not found/i.test(msg) || /404/.test(msg) || /\/api\/tts\/health/.test(msg);
        if (isMissingRoute) return CHECKING_STATE;
        return UNREACHABLE_STATE(msg);
      }
    },
    refetchInterval: 8_000,
    staleTime: 7_000,
    // Never throw — health errors are mapped to a state, not treated as query failures
    throwOnError: false,
  });
}

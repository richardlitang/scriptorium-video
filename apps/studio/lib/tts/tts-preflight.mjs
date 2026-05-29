import { ttsProvidersForPlan } from "./tts-draft-planning.mjs";

export async function preflightDraftTtsProviders(plan, deps) {
  if (!deps) {
    throw new Error("preflightDraftTtsProviders requires runtime dependencies.");
  }
  const { ensureChatterboxReady, readMmsHealth, getOpenAiApiKey } = deps;

  const providers = ttsProvidersForPlan(plan);
  const checks = await Promise.all(
    providers.map(async (provider) => {
      if (provider === "chatterbox") return ensureChatterboxReady("draft_preflight");
      if (provider === "mms") return readMmsHealth();
      if (provider === "openai") {
        try {
          await getOpenAiApiKey();
          return { provider, ok: true, status: "ready", error: null };
        } catch (error) {
          return {
            provider,
            ok: false,
            status: "missing_credentials",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return { provider, ok: true, status: "unchecked", error: null };
    }),
  );
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    const details = failed
      .map((check) => `${check.provider}: ${check.status}${check.error ? ` (${check.error})` : ""}`)
      .join("; ");
    throw new Error(`Draft requires unavailable TTS provider(s): ${details}`);
  }
  return checks;
}

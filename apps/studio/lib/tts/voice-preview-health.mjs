import { createHash } from "node:crypto";
import { normalizeVoiceSettings } from "../../voice-settings.mjs";
import { resolveVoiceReferencePath } from "./voice-reference-path.mjs";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function chatterboxAuthHeaders(env = process.env) {
  const headers = { "content-type": "application/json" };
  if (env.CHATTERBOX_TTS_API_KEY) headers.authorization = `Bearer ${env.CHATTERBOX_TTS_API_KEY}`;
  return headers;
}

function applyFifoCache(cache, key, value, maxEntries) {
  cache.set(key, value);
  if (cache.size <= maxEntries) return;
  const firstKey = cache.keys().next().value;
  cache.delete(firstKey);
}

export function createVoicePreviewAndHealth({
  fetchImpl = fetch,
  env = process.env,
  chatterboxSpeechUrl,
  chatterboxHealthUrl,
  rootDir,
  studioTestMode = false,
  previewCacheMaxEntries = 24,
  normalizePreviewAudio = async (bytes) => bytes,
} = {}) {
  if (!chatterboxSpeechUrl)
    throw new Error("createVoicePreviewAndHealth requires chatterboxSpeechUrl.");
  if (!chatterboxHealthUrl)
    throw new Error("createVoicePreviewAndHealth requires chatterboxHealthUrl.");

  const voicePreviewCache = new Map();

  async function previewVoice(settings, text) {
    const normalized = normalizeVoiceSettings(settings);
    const payload = {
      model: normalized.ttsModel || "chatterbox",
      voice: "default",
      input: String(text || "").trim(),
      response_format: "wav",
      audio_prompt_path: resolveVoiceReferencePath(normalized.audioPromptPath, rootDir),
      exaggeration: normalized.exaggeration,
      cfg_weight: normalized.cfgWeight,
      temperature: normalized.temperature,
      seed: normalized.seed ? Number(normalized.seed) : undefined,
    };
    if (!payload.input) throw new Error("Preview text is required.");
    const cacheKey = sha256(JSON.stringify(payload));
    const cached = voicePreviewCache.get(cacheKey);
    if (cached) return cached;

    const response = await fetchImpl(chatterboxSpeechUrl, {
      method: "POST",
      headers: chatterboxAuthHeaders(env),
      body: JSON.stringify(payload),
    }).catch((error) => {
      throw new Error(
        `Voice preview unavailable: Chatterbox is not reachable at ${chatterboxSpeechUrl}. Start the local server or choose API fallback for generated narration. ${error.message}`,
      );
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Voice preview failed: ${response.status} ${body.slice(0, 300)}`.trim());
    }
    const rawBytes = Buffer.from(await response.arrayBuffer());
    const bytes = await normalizePreviewAudio(rawBytes).catch(() => rawBytes);
    applyFifoCache(voicePreviewCache, cacheKey, bytes, previewCacheMaxEntries);
    return bytes;
  }

  async function readTtsHealth() {
    if (studioTestMode) {
      return { provider: "chatterbox", ok: true, status: "ready", sampleRate: 24000, error: null };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetchImpl(chatterboxHealthUrl, {
        method: "GET",
        headers: env.CHATTERBOX_TTS_API_KEY
          ? { authorization: `Bearer ${env.CHATTERBOX_TTS_API_KEY}` }
          : {},
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          return {
            provider: "chatterbox",
            ok: true,
            status: "no_health_endpoint",
            sampleRate: null,
            error: `Health endpoint not found at ${chatterboxHealthUrl}`,
          };
        }
        return {
          provider: "chatterbox",
          ok: false,
          status: "failed",
          sampleRate: null,
          error: `health-check-failed (${response.status})`,
        };
      }
      return {
        provider: "chatterbox",
        ok: payload.ok === true,
        status: payload.status || (payload.ok ? "ready" : "failed"),
        sampleRate: typeof payload.sampleRate === "number" ? payload.sampleRate : null,
        error: payload.error || null,
      };
    } catch (error) {
      return {
        provider: "chatterbox",
        ok: false,
        status: "unreachable",
        sampleRate: null,
        error:
          error?.name === "AbortError" ? "health-check-timeout" : String(error?.message || error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function clearPreviewCache() {
    voicePreviewCache.clear();
  }

  function previewCacheSize() {
    return voicePreviewCache.size;
  }

  return { previewVoice, readTtsHealth, clearPreviewCache, previewCacheSize };
}

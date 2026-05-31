const DEFAULT_CHATTERBOX_SPEECH_URL = "http://127.0.0.1:8000/v1/audio/speech";
const DEFAULT_MMS_SPEECH_URL = "http://127.0.0.1:8001/v1/audio/speech";
const DEFAULT_PLANNER_MODEL = "gpt-5.4-mini";
const DEFAULT_PLANNER_FALLBACK_MODELS = ["gpt-5-mini", "gpt-4.1-mini"];
const DEFAULT_TTS_ROUTING_MODEL = "gpt-4o-mini";

function healthUrlForSpeechUrl(speechUrl, fallback) {
  try {
    const url = new URL(speechUrl);
    url.pathname = "/health";
    url.search = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function integerEnv(env, name, fallback, { min = 1 } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

function parseModelFallbacks(value, fallbackModels) {
  const parsed = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallbackModels;
}

function stringEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim();
  return normalized === "" ? fallback : normalized;
}

function requireValidHttpUrl(value, envName) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
    return value;
  } catch {
    throw new Error(`Invalid ${envName}: ${value}`);
  }
}

export function createStudioRuntimeConfig({ env = process.env, rootDir } = {}) {
  if (!rootDir) throw new Error("createStudioRuntimeConfig requires rootDir.");

  const chatterboxSpeechUrl = requireValidHttpUrl(
    env.CHATTERBOX_TTS_URL ?? DEFAULT_CHATTERBOX_SPEECH_URL,
    "CHATTERBOX_TTS_URL",
  );
  const mmsSpeechUrl = requireValidHttpUrl(
    env.MMS_TTS_URL ?? DEFAULT_MMS_SPEECH_URL,
    "MMS_TTS_URL",
  );

  const plannerRequestTimeout = (() => {
    const plannerTimeout = env.OPENAI_PLANNER_REQUEST_TIMEOUT_MS;
    if (plannerTimeout !== undefined && plannerTimeout !== "") {
      return integerEnv(env, "OPENAI_PLANNER_REQUEST_TIMEOUT_MS", 300000, { min: 1000 });
    }
    const requestTimeout = env.OPENAI_REQUEST_TIMEOUT_MS;
    if (requestTimeout !== undefined && requestTimeout !== "") {
      return integerEnv(env, "OPENAI_REQUEST_TIMEOUT_MS", 300000, { min: 1000 });
    }
    return 300000;
  })();

  return {
    port: integerEnv(env, "PORT", 4173),
    studioTestMode: env.LVSTUDIO_TEST_MODE === "1",
    openAiResponsesUrl: "https://api.openai.com/v1/responses",
    openAiImagesUrl: "https://api.openai.com/v1/images/generations",
    openAiImageModel: env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    imageConcurrency: integerEnv(env, "LVSTUDIO_IMAGE_CONCURRENCY", 2),
    chatterboxSpeechUrl,
    chatterboxHealthUrl: healthUrlForSpeechUrl(chatterboxSpeechUrl, "http://127.0.0.1:8000/health"),
    chatterboxAutoStartEnabled: env.LVSTUDIO_CHATTERBOX_AUTOSTART !== "0",
    chatterboxStartTimeoutMs: integerEnv(env, "LVSTUDIO_CHATTERBOX_START_TIMEOUT_MS", 45000, {
      min: 1000,
    }),
    chatterboxStartCommand: {
      python: env.LVSTUDIO_CHATTERBOX_PYTHON || "/private/tmp/lvstudio-chatterbox-venv/bin/python",
      script: env.LVSTUDIO_CHATTERBOX_START_SCRIPT || `${rootDir}/scripts/chatterbox_tts_server.py`,
      modelCache: env.CHATTERBOX_MODEL_CACHE || "/private/tmp/lvstudio-hf",
    },
    mmsSpeechUrl,
    mmsHealthUrl: healthUrlForSpeechUrl(mmsSpeechUrl, "http://127.0.0.1:8001/health"),
    splitPlannerEnabled: env.LVSTUDIO_SPLIT_PLANNER !== "0",
    splitPlannerMinWords: integerEnv(env, "LVSTUDIO_SPLIT_PLANNER_MIN_WORDS", 2500),
    splitPlannerMinUnits: integerEnv(env, "LVSTUDIO_SPLIT_PLANNER_MIN_UNITS", 40),
    plannerRequestConfig: {
      model: stringEnv(env, "OPENAI_PLANNER_MODEL", DEFAULT_PLANNER_MODEL),
      fallbackModels: parseModelFallbacks(
        env.OPENAI_PLANNER_FALLBACK_MODELS,
        DEFAULT_PLANNER_FALLBACK_MODELS,
      ),
      timeoutMs: plannerRequestTimeout,
      maxAttempts: integerEnv(env, "OPENAI_PLANNER_REQUEST_MAX_ATTEMPTS", 1),
    },
    ttsRoutingConfig: {
      enabled: env.LVSTUDIO_OPENAI_TTS_ROUTING === "1",
      model: stringEnv(
        env,
        "OPENAI_TTS_ROUTING_MODEL",
        stringEnv(env, "OPENAI_ORCHESTRATOR_MODEL", DEFAULT_TTS_ROUTING_MODEL),
      ),
    },
    splitPlannerBeatsPerSection: integerEnv(env, "LVSTUDIO_SPLIT_PLANNER_BEATS_PER_SECTION", 24),
    splitPlannerMaxSections: integerEnv(env, "LVSTUDIO_SPLIT_PLANNER_MAX_SECTIONS", 6),
    splitPlannerSectionAttempts: integerEnv(env, "LVSTUDIO_SPLIT_PLANNER_SECTION_ATTEMPTS", 2),
  };
}

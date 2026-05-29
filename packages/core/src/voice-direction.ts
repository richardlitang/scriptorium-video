import type { Beat, VideoPlan } from "./schemas/video-plan.schema.js";
import { VoiceDirectionSchema } from "./schemas/video-plan.schema.js";
import { resolveBeatProductionDirection } from "./resolve-production-direction.js";
import { canonicalizeVoicePauseFields } from "./voice-pauses.js";

type ChatterboxProfile = {
  exaggeration: number;
  cfg_weight: number;
  temperature: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function secondsFromMs(value: number | undefined): number {
  if (value === undefined) return 0;
  return Number((value / 1000).toFixed(3));
}

function stableSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647;
}

const CHATTERBOX_PROFILE_MAP: Record<string, ChatterboxProfile> = {
  neutral: { exaggeration: 0.38, cfg_weight: 0.55, temperature: 0.45 },
  warm_open: { exaggeration: 0.45, cfg_weight: 0.52, temperature: 0.55 },
  clear_explainer: { exaggeration: 0.35, cfg_weight: 0.58, temperature: 0.4 },
  authoritative: { exaggeration: 0.42, cfg_weight: 0.55, temperature: 0.45 },
  energetic: { exaggeration: 0.72, cfg_weight: 0.38, temperature: 0.78 },
  key_point: { exaggeration: 0.58, cfg_weight: 0.42, temperature: 0.6 },
  reflective: { exaggeration: 0.36, cfg_weight: 0.45, temperature: 0.45 },
  tense: { exaggeration: 0.62, cfg_weight: 0.34, temperature: 0.65 },
  reveal: { exaggeration: 0.75, cfg_weight: 0.3, temperature: 0.7 },
  urgent: { exaggeration: 0.78, cfg_weight: 0.34, temperature: 0.82 },
  soft_close: { exaggeration: 0.32, cfg_weight: 0.48, temperature: 0.42 },
};

export type ResolvedVoiceDirection = {
  delivery: {
    profile: string;
    intensity: number;
    deliveryNote?: string;
    emphasis: string[];
  };
  pauses: {
    beforeSeconds: number;
    afterSeconds: number;
  };
  providerOptions: Record<string, unknown>;
  voiceOptions: {
    speed?: number;
    pitch?: number;
    language?: string;
  };
  ttsProvider?: string;
};

export function resolveVoiceDirection(
  beat: Beat,
  plan: VideoPlan,
  providerId = plan.providers.tts,
): ResolvedVoiceDirection {
  const section = plan.sections.find((entry) =>
    entry.beats.some((candidate) => candidate.id === beat.id),
  );
  const resolvedDirection = section
    ? resolveBeatProductionDirection(plan, section, beat).voiceDirection
    : canonicalizeVoicePauseFields(VoiceDirectionSchema.parse(beat.voiceDirection ?? {}));
  const direction = resolvedDirection;
  const profile = CHATTERBOX_PROFILE_MAP[direction.profile] ?? CHATTERBOX_PROFILE_MAP.neutral;

  const providerOptions: Record<string, unknown> = {};
  if (providerId === "chatterbox") {
    const intensityDelta = clamp(direction.intensity, 0, 1) - 0.5;
    const emphasisBoost = clamp((direction.emphasis?.length ?? 0) * 0.02, 0, 0.08);
    const deliveryBoost = direction.deliveryNote ? 0.03 : 0;
    const exaggeration = clamp(
      profile.exaggeration + intensityDelta * 0.35 + emphasisBoost,
      0.25,
      2,
    );
    const cfgWeight = clamp(profile.cfg_weight - intensityDelta * 0.25, 0.2, 1);
    const temperature = clamp(profile.temperature + intensityDelta * 0.25 + deliveryBoost, 0.05, 5);
    providerOptions.exaggeration = Number(exaggeration.toFixed(3));
    providerOptions.cfg_weight = Number(cfgWeight.toFixed(3));
    providerOptions.temperature = Number(temperature.toFixed(3));
    providerOptions.seed = stableSeed(
      [
        beat.id || "",
        direction.profile || "",
        String(Number(direction.intensity).toFixed(3)),
        direction.deliveryNote || "",
        (direction.emphasis || []).join("|"),
      ].join("::"),
    );
  }

  const baseSpeed =
    typeof plan.voice.options?.speed === "number" ? plan.voice.options.speed : undefined;
  const speed =
    baseSpeed !== undefined
      ? Number((baseSpeed * direction.speedMultiplier).toFixed(3))
      : undefined;
  const basePitch = typeof plan.voice.options?.pitch === "number" ? plan.voice.options.pitch : 0;
  const pitch = Number((basePitch + direction.pitchOffset).toFixed(3));

  const voiceOptions: ResolvedVoiceDirection["voiceOptions"] = {
    speed,
    pitch,
  };
  const language = direction.language || plan.voice.options?.language;
  if (language) voiceOptions.language = language;

  return {
    delivery: {
      profile: direction.profile,
      intensity: direction.intensity,
      deliveryNote: direction.deliveryNote,
      emphasis: direction.emphasis,
    },
    pauses: {
      beforeSeconds: secondsFromMs(direction.pauseBeforeMs),
      afterSeconds: secondsFromMs(direction.pauseAfterMs),
    },
    providerOptions,
    voiceOptions,
    ttsProvider: direction.ttsProvider,
  };
}

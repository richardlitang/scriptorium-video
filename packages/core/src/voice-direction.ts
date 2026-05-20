import type { Beat, VideoPlan } from "./schemas/video-plan.schema.js";
import { VoiceDirectionSchema } from "./schemas/video-plan.schema.js";
import { resolveBeatProductionDirection } from "./resolve-production-direction.js";

type ChatterboxProfile = {
  exaggeration: number;
  cfg_weight: number;
  temperature: number;
};

const CHATTERBOX_PROFILE_MAP: Record<string, ChatterboxProfile> = {
  neutral: { exaggeration: 0.45, cfg_weight: 0.45, temperature: 0.6 },
  warm_open: { exaggeration: 0.48, cfg_weight: 0.42, temperature: 0.65 },
  clear_explainer: { exaggeration: 0.42, cfg_weight: 0.48, temperature: 0.58 },
  authoritative: { exaggeration: 0.5, cfg_weight: 0.44, temperature: 0.62 },
  energetic: { exaggeration: 0.68, cfg_weight: 0.38, temperature: 0.78 },
  key_point: { exaggeration: 0.56, cfg_weight: 0.4, temperature: 0.68 },
  reflective: { exaggeration: 0.46, cfg_weight: 0.36, temperature: 0.64 },
  tense: { exaggeration: 0.65, cfg_weight: 0.32, temperature: 0.78 },
  reveal: { exaggeration: 0.62, cfg_weight: 0.3, temperature: 0.72 },
  urgent: { exaggeration: 0.72, cfg_weight: 0.36, temperature: 0.82 },
  soft_close: { exaggeration: 0.44, cfg_weight: 0.4, temperature: 0.6 }
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

export function resolveVoiceDirection(beat: Beat, plan: VideoPlan, providerId = plan.providers.tts): ResolvedVoiceDirection {
  const section = plan.sections.find((entry) => entry.beats.some((candidate) => candidate.id === beat.id));
  const resolvedDirection = section
    ? resolveBeatProductionDirection(plan, section, beat).voiceDirection
    : VoiceDirectionSchema.parse(beat.voiceDirection ?? {});
  const direction = resolvedDirection;
  const profile = CHATTERBOX_PROFILE_MAP[direction.profile] ?? CHATTERBOX_PROFILE_MAP.neutral;

  const providerOptions: Record<string, unknown> = {};
  if (providerId === "chatterbox") {
    providerOptions.exaggeration = profile.exaggeration;
    providerOptions.cfg_weight = profile.cfg_weight;
    providerOptions.temperature = profile.temperature;
  }

  const baseSpeed = typeof plan.voice.options?.speed === "number" ? plan.voice.options.speed : undefined;
  const speed = baseSpeed !== undefined
    ? Number((baseSpeed * direction.speedMultiplier).toFixed(3))
    : undefined;
  const basePitch = typeof plan.voice.options?.pitch === "number" ? plan.voice.options.pitch : 0;
  const pitch = Number((basePitch + direction.pitchOffset).toFixed(3));

  const voiceOptions: ResolvedVoiceDirection["voiceOptions"] = {
    speed,
    pitch
  };
  const language = direction.language || plan.voice.options?.language;
  if (language) voiceOptions.language = language;

  return {
    delivery: {
      profile: direction.profile,
      intensity: direction.intensity,
      deliveryNote: direction.deliveryNote,
      emphasis: direction.emphasis
    },
    pauses: {
      beforeSeconds: direction.pauseBeforeSeconds,
      afterSeconds: direction.pauseAfterSeconds
    },
    providerOptions,
    voiceOptions,
    ttsProvider: direction.ttsProvider
  };
}

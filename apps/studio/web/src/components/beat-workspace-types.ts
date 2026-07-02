export interface Beat {
  id: string;
  narration: string;
  voiceDirection?: VoiceDirection;
  directionMeta?: { lockedPaths?: string[]; sources?: Record<string, string> };
  caption?: { style?: string; emphasis?: string[] };
  direction?: {
    creative?: { feel?: string; pacing?: string; visualStyle?: string };
    voice?: unknown;
    caption?: unknown;
  };
  timing?: { estimatedDurationSeconds?: number };
  [key: string]: unknown;
}

export interface Section {
  id: string;
  title: string;
  beats: Beat[];
  direction?: { creative?: { feel?: string; pacing?: string; visualStyle?: string } };
}

export interface Plan {
  sections: Section[];
  direction?: unknown;
  [key: string]: unknown;
}

export interface VoiceDirection {
  profile?: string;
  intensity?: number;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  pauseBeforeSeconds?: number;
  pauseAfterSeconds?: number;
  deliveryNote?: string;
  speedMultiplier?: number;
  pitchOffset?: number;
  source?: string;
}

import { z } from "zod";
import { SoundCueIntentSchema, VoiceDirectionSchema } from "./video-plan.schema.js";

export const VoiceDirectorBeatSchema = z.object({
  beatId: z.string(),
  voiceDirection: VoiceDirectionSchema,
  captionEmphasis: z.array(z.string()).default([]),
  sfxCues: z.array(SoundCueIntentSchema).default([])
}).strict();

export const VoiceDirectorOutputSchema = z.object({
  beats: z.array(VoiceDirectorBeatSchema).default([])
}).strict();

export type VoiceDirectorOutput = z.infer<typeof VoiceDirectorOutputSchema>;

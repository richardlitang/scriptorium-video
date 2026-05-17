export type TTSVoice = {
  id: string;
  label: string;
  language: string;
  gender?: "male" | "female" | "neutral";
  styleTags?: string[];
  supportsSsml?: boolean;
  supportsSpeed?: boolean;
  supportsPitch?: boolean;
  supportsEmotion?: boolean;
};

export type TTSRequest = {
  text: string;
  voiceId: string;
  outputPath: string;
  format: "mp3" | "wav" | "m4a";
  options?: {
    speed?: number;
    pitch?: number;
    emotion?: string;
    stability?: number;
    similarityBoost?: number;
    language?: string;
    ssml?: string;
  };
};

export type TTSResult = {
  audioPath: string;
  durationSeconds: number;
  providerId: string;
  voiceId: string;
  inputHash: string;
  metadata?: Record<string, unknown>;
};

export interface TTSProvider {
  id: string;
  listVoices(): Promise<TTSVoice[]>;
  synthesize(request: TTSRequest): Promise<TTSResult>;
}

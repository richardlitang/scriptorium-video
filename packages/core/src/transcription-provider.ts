export type TranscriptSegment = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type TranscriptWord = {
  startSeconds: number;
  endSeconds: number;
  word: string;
  confidence?: number;
};

export type TranscriptionRequest = {
  audioPath: string;
  language?: string;
  wordTimestamps: boolean;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
  providerId: string;
};

export interface TranscriptionProvider {
  id: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptResult>;
}

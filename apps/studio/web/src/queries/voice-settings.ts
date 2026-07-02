import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type VoiceSettings } from "@/api/client";

const voiceSettingsKey = ["settings", "voice"] as const;

export function useVoiceSettings(enabled = true) {
  return useQuery({ queryKey: voiceSettingsKey, queryFn: api.voice.getSettings, enabled });
}

export function useSaveVoiceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: VoiceSettings) => api.voice.saveSettings(settings),
    onSuccess: (settings) => queryClient.setQueryData(voiceSettingsKey, settings),
  });
}

export function useVoicePreview() {
  return useMutation({
    mutationFn: ({
      settings,
      text,
      signal,
    }: {
      settings: VoiceSettings;
      text: string;
      signal?: AbortSignal;
    }) => api.voice.preview(settings, text, signal),
  });
}

export function useUploadVoiceReference() {
  return useMutation({ mutationFn: (file: File) => api.voice.uploadReference(file) });
}

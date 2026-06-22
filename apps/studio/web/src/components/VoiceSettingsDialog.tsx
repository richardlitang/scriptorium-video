import { useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { readStored, writeStored } from "@/lib/project-storage";
import { defaultVoiceSettings } from "../../../voice-settings.mjs";
import {
  useSaveVoiceSettings,
  useUploadVoiceReference,
  useVoicePreview,
  useVoiceSettings,
} from "@/queries/voice-settings";

type VoiceSettings = typeof defaultVoiceSettings;

const PRESETS: Record<string, Partial<VoiceSettings>> = {
  controlled: { exaggeration: 0.45, cfgWeight: 0.45, temperature: 0.6 },
  suspense: { exaggeration: 0.55, cfgWeight: 0.35, temperature: 0.75 },
  dramatic: { exaggeration: 0.7, cfgWeight: 0.3, temperature: 0.85 },
};

const DEFAULT_LINE_A =
  "I should have turned back when the hallway lights began to flicker, but I kept walking.";
const DEFAULT_LINE_B =
  "By the time the last train arrived, everyone on the platform had vanished except me.";

interface Props {
  projectId: string | null;
  trigger: React.ReactNode;
}

export function VoiceSettingsDialog({ projectId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(defaultVoiceSettings);
  const [status, setStatus] = useState("");
  const settingsQuery = useVoiceSettings(false);
  const saveVoiceSettings = useSaveVoiceSettings();
  const previewVoice = useVoicePreview();
  const uploadVoiceReference = useUploadVoiceReference();
  const saving = saveVoiceSettings.isPending;
  const previewing = previewVoice.isPending;
  const previewControllerRef = useRef<AbortController | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [lineA, setLineA] = useState(() =>
    projectId ? readStored(projectId, "voicePreviewLineA", DEFAULT_LINE_A) : DEFAULT_LINE_A,
  );
  const [lineB, setLineB] = useState(() =>
    projectId ? readStored(projectId, "voicePreviewLineB", DEFAULT_LINE_B) : DEFAULT_LINE_B,
  );

  async function loadSettings() {
    setStatus("Loading…");
    try {
      const { data } = await settingsQuery.refetch();
      if (data) setSettings({ ...defaultVoiceSettings, ...data });
      setStatus("");
    } catch (err) {
      setStatus(String(err));
    }
  }

  async function saveSettings(extraStatus?: string, nextSettings = settings) {
    try {
      const data = await saveVoiceSettings.mutateAsync(nextSettings);
      setSettings({ ...defaultVoiceSettings, ...data });
      setStatus(extraStatus ?? "Saved. Regenerate narration to hear these settings.");
    } catch (err) {
      setStatus(String(err));
    }
  }

  async function runPreview(sentence: string) {
    const key = JSON.stringify({ settings, sentence });
    const cached = previewCacheRef.current.get(key);
    if (cached) {
      if (audioRef.current) {
        audioRef.current.src = cached;
        audioRef.current.play().catch(() => {});
      }
      setStatus("Preview ready (cached).");
      return;
    }
    if (previewControllerRef.current) previewControllerRef.current.abort();
    previewControllerRef.current = new AbortController();
    setStatus("Generating preview…");
    try {
      const blob = await previewVoice.mutateAsync({
        settings,
        text: sentence,
        signal: previewControllerRef.current.signal,
      });
      const url = URL.createObjectURL(blob);
      const cache = previewCacheRef.current;
      if (cache.size >= 10) {
        const first = cache.keys().next().value!;
        URL.revokeObjectURL(cache.get(first)!);
        cache.delete(first);
      }
      cache.set(key, url);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
      setStatus("Preview ready.");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") setStatus("Preview cancelled.");
      else setStatus(String(err));
    } finally {
      previewControllerRef.current = null;
    }
  }

  async function uploadReference(file: File) {
    setStatus(`Uploading ${file.name}…`);
    const { path } = await uploadVoiceReference.mutateAsync(file);
    const nextSettings = { ...settings, audioPromptPath: path };
    setSettings(nextSettings);
    await saveSettings(`Reference saved: ${path}`, nextSettings);
  }

  function set<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (v) void loadSettings();
        setOpen(v);
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed inset-y-4 right-4 w-[420px] z-50 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-lg overflow-y-auto shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0">
            <Dialog.Title className="text-sm font-semibold">Voice Settings</Dialog.Title>
            <Dialog.Close className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none">
              ×
            </Dialog.Close>
          </div>

          <form
            className="flex flex-col gap-4 p-4 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSettings();
            }}
          >
            {/* TTS model */}
            <F label="TTS Model">
              <select
                value={settings.ttsModel}
                onChange={(e) => set("ttsModel", e.target.value)}
                className={iCls}
              >
                <option value="chatterbox">Chatterbox</option>
              </select>
            </F>

            {/* Delivery profile */}
            <F label="Delivery Profile">
              <select
                value={settings.deliveryProfile}
                onChange={(e) => set("deliveryProfile", e.target.value)}
                className={iCls}
              >
                {["suspense", "neutral", "documentary", "energetic", "intimate"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </F>

            {/* Sliders */}
            {(
              [
                ["Intensity", "intensity", 0, 1, 0.05],
                ["Stability", "stability", 0, 1, 0.05],
                ["Pacing", "pacing", 0, 1, 0.05],
                ["Variation", "variation", 0, 1, 0.05],
                ["Exaggeration", "exaggeration", 0, 1, 0.05],
                ["CFG Weight", "cfgWeight", 0, 1, 0.05],
                ["Temperature", "temperature", 0, 1, 0.05],
              ] as [string, keyof VoiceSettings, number, number, number][]
            ).map(([label, key, min, max, step]) => (
              <F key={key} label={`${label} (${Number(settings[key]).toFixed(2)})`}>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={Number(settings[key])}
                  onChange={(e) => set(key, Number(e.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
              </F>
            ))}

            {/* Seed */}
            <F label="Seed (blank = random)">
              <input
                type="text"
                value={settings.seed}
                onChange={(e) => set("seed", e.target.value)}
                className={iCls}
                placeholder="blank for random"
              />
            </F>

            {/* Reference audio */}
            <F label="Voice Reference Path">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={settings.audioPromptPath}
                  onChange={(e) => set("audioPromptPath", e.target.value)}
                  className={`${iCls} flex-1`}
                  placeholder="path/to/reference.wav"
                />
                <label className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer transition-colors">
                  Upload
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        try {
                          await uploadReference(file);
                        } catch (err) {
                          setStatus(String(err));
                        }
                      e.target.value = "";
                    }}
                  />
                </label>
                {settings.audioPromptPath && (
                  <button
                    type="button"
                    onClick={() => {
                      set("audioPromptPath", "");
                      void saveSettings("Reference cleared.");
                    }}
                    className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </F>

            {/* Presets */}
            <div className="flex gap-1 flex-wrap">
              {Object.entries(PRESETS).map(([name, values]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, ...values }))}
                  className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors capitalize"
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
              <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Preview
              </div>
              <F label="Line A">
                <input
                  value={lineA}
                  onChange={(e) => {
                    setLineA(e.target.value);
                    if (projectId) writeStored(projectId, "voicePreviewLineA", e.target.value);
                  }}
                  className={iCls}
                />
              </F>
              <F label="Line B">
                <input
                  value={lineB}
                  onChange={(e) => {
                    setLineB(e.target.value);
                    if (projectId) writeStored(projectId, "voicePreviewLineB", e.target.value);
                  }}
                  className={iCls}
                />
              </F>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={previewing}
                  onClick={() => runPreview(lineA || DEFAULT_LINE_A)}
                  className="px-3 py-1 text-xs rounded bg-[var(--color-surface-overlay)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
                >
                  Preview A
                </button>
                <button
                  type="button"
                  disabled={previewing}
                  onClick={() => runPreview(lineB || DEFAULT_LINE_B)}
                  className="px-3 py-1 text-xs rounded bg-[var(--color-surface-overlay)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
                >
                  Preview B
                </button>
              </div>
              {/* Preview audio — captions not applicable for TTS samples */}
              <audio ref={audioRef} controls className="w-full h-8 mt-1" />
            </div>

            {/* Status */}
            {status && (
              <div className="text-xs text-[var(--color-text-muted)] italic">{status}</div>
            )}

            {/* Save */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 text-sm font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const iCls =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
      {children}
    </div>
  );
}

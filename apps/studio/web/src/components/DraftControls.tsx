import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDraftJob, useStartDraftJob } from "@/queries/draft-job";
import { draftJobUiModel, draftJobProgressLine, isJobActive } from "@/lib/draft-job-ui-state";
import { normalizeImageCoverage } from "@/lib/image-coverage";
import { readStored, writeStored } from "@/lib/project-storage";
import { useTtsHealth } from "@/queries/tts";
import { ttsAvailabilityFromHealth, storyButtonState } from "@/lib/tts-ui-state";
import { draftJobKeys } from "@/queries/draft-job";
import { VoiceSettingsDialog } from "./VoiceSettingsDialog";

interface Props {
  projectId: string;
  story: string;
  planJson: string;
  feel: string;
  pacing: string;
  visualStyle: string;
  systemPrompt: string;
  userPromptTemplate: string;
  onDraftQueued: () => void;
  onError: (msg: string) => void;
}

export function DraftControls({
  projectId,
  story,
  planJson,
  feel,
  pacing,
  visualStyle,
  systemPrompt,
  userPromptTemplate,
  onDraftQueued,
  onError,
}: Props) {
  const qc = useQueryClient();
  const { data: job } = useDraftJob(projectId);
  const startDraft = useStartDraftJob(projectId);
  const { data: healthState } = useTtsHealth();
  const ttsAvailability = ttsAvailabilityFromHealth(healthState ?? {});

  const [imageEnabled, setImageEnabled] = useState(
    () => readStored(projectId, "imageEnabled", "true") === "true",
  );
  const [imageMode, setImageMode] = useState(
    () => readStored(projectId, "imageMode", "missing"),
  );
  const [imageBudget, setImageBudget] = useState(
    () => readStored(projectId, "imageBudget", "llm"),
  );
  const [imageQuality, setImageQuality] = useState(
    () => readStored(projectId, "imageQuality", "low"),
  );

  const progressLine = draftJobProgressLine(job);
  const draftModel = draftJobUiModel(job, progressLine, "Make Draft");

  const btnState = storyButtonState({
    selectedProjectId: projectId,
    storyValue: story,
    currentDraftJobStatus: job?.status ?? null,
    ttsAvailability,
    defaultDraftButtonLabel: "Make Draft",
  });

  async function handleMakeDraft(withImages: boolean) {
    if (!story.trim()) return;
    const ttsOk = ttsAvailability === "ready" || ttsAvailability === "ready_degraded";
    if (!ttsOk) {
      const msg =
        ttsAvailability === "loading" || ttsAvailability === "checking"
          ? "TTS model is warming up. Wait for 'TTS: ready' then try Make Draft."
          : "TTS is unavailable — check Chatterbox server.";
      onError(msg);
      return;
    }
    let plan: Record<string, unknown>;
    try {
      plan = planJson ? JSON.parse(planJson) : {};
    } catch {
      onError("Plan JSON is invalid — save a valid plan before running Make Draft.");
      return;
    }
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    try {
      await startDraft.mutateAsync({
        story,
        plan,
        feel,
        pacing,
        visualStyle,
        systemPrompt,
        userPromptTemplate,
        imageEnabled: withImages && imageEnabled,
        imageMode,
        imageCoverage: normalizeImageCoverage(imageBudget),
        imageQuality,
      });
      writeStored(projectId, "lastDraftStory", story);
      // Force the draft-job query to start polling immediately
      qc.invalidateQueries({ queryKey: draftJobKeys.current(projectId) });
      onDraftQueued();
    } catch (err) {
      onError(`Make Draft failed: ${String(err)}`);
    }
  }

  const jobRunning = isJobActive(job?.status);

  async function handleDirectVoice() {
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/direct-voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ story, feel, pacing, visualStyle }),
      });
      onDraftQueued();
    } catch (err) {
      onError(`Direct voice failed: ${String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Image settings */}
      <div className="flex flex-col gap-2 p-3 bg-[var(--color-surface-overlay)] rounded border border-[var(--color-border)]">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={imageEnabled}
            onChange={(e) => {
              setImageEnabled(e.target.checked);
              writeStored(projectId, "imageEnabled", e.target.checked ? "true" : "false");
            }}
            className="accent-[var(--color-accent)]"
          />
          <span className="font-medium">Generate AI photos during draft</span>
        </label>

        {imageEnabled && (
          <div className="grid grid-cols-3 gap-2">
            <SelectField
              label="Mode"
              value={imageMode}
              onChange={(v) => { setImageMode(v); writeStored(projectId, "imageMode", v); }}
              options={[
                { value: "missing", label: "Only missing" },
                { value: "all", label: "Refresh all" },
              ]}
            />
            <SelectField
              label="Density"
              value={imageBudget}
              onChange={(v) => { setImageBudget(v); writeStored(projectId, "imageBudget", v); }}
              options={[
                { value: "llm", label: "LLM-driven" },
                { value: "balanced", label: "Balanced" },
                { value: "beat", label: "All beats" },
              ]}
            />
            <SelectField
              label="Quality"
              value={imageQuality}
              onChange={(v) => { setImageQuality(v); writeStored(projectId, "imageQuality", v); }}
              options={[
                { value: "low", label: "Draft" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </div>
        )}
      </div>

      {/* Draft buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleMakeDraft(true)}
          disabled={btnState.renderDisabled || startDraft.isPending}
          className={`px-4 py-2 text-xs font-semibold rounded transition-colors ${
            jobRunning
              ? "bg-[var(--color-running)]/20 text-[var(--color-running)] border border-[var(--color-running)]/30"
              : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {draftModel.renderButtonText}
        </button>

        {!jobRunning && (
          <button
            onClick={() => handleMakeDraft(false)}
            disabled={btnState.draftNoImagesDisabled || startDraft.isPending}
            className="px-3 py-2 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Draft Without Images
          </button>
        )}
      </div>

      {/* Voice actions */}
      <div className="flex gap-1 flex-wrap">
        <VoiceSettingsDialog
          projectId={projectId}
          trigger={
            <button className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
              Voice Settings
            </button>
          }
        />
        <button
          onClick={handleDirectVoice}
          disabled={btnState.directVoiceDisabled}
          className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
        >
          Direct Voice
        </button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1 py-1 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { draftJobKeys, useDirectVoice, useDraftJob, useStartDraftJob } from "@/queries/draft-job";
import { draftJobUiModel, draftJobProgressLine, isJobActive } from "@/lib/draft-job-ui-state";
import { normalizeImageCoverage } from "@/lib/image-coverage";
import { readStored, writeStored } from "@/lib/project-storage";
import { useTtsHealth } from "@/queries/tts";
import { ttsAvailabilityFromHealth, storyButtonState } from "@/lib/tts-ui-state";
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
  const directVoice = useDirectVoice(projectId);
  const { data: healthState } = useTtsHealth();
  const ttsAvailability = ttsAvailabilityFromHealth(healthState ?? {});

  const [imageEnabled, setImageEnabled] = useState(
    () => readStored(projectId, "imageEnabled", "true") === "true",
  );
  const [imageMode, setImageMode] = useState(() => readStored(projectId, "imageMode", "missing"));
  const [imageBudget, setImageBudget] = useState(() => readStored(projectId, "imageBudget", "llm"));
  const [imageQuality, setImageQuality] = useState(() =>
    readStored(projectId, "imageQuality", "low"),
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
      void qc.invalidateQueries({ queryKey: draftJobKeys.current(projectId) });
      onDraftQueued();
    } catch (err) {
      onError(`Make Draft failed: ${String(err)}`);
    }
  }

  const jobRunning = isJobActive(job?.status);

  async function handleDirectVoice() {
    try {
      await directVoice.mutateAsync();
      onDraftQueued();
    } catch (err) {
      onError(`Direct voice failed: ${String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ImageDraftSettings
        projectId={projectId}
        imageEnabled={imageEnabled}
        imageMode={imageMode}
        imageBudget={imageBudget}
        imageQuality={imageQuality}
        onImageEnabledChange={setImageEnabled}
        onImageModeChange={setImageMode}
        onImageBudgetChange={setImageBudget}
        onImageQualityChange={setImageQuality}
      />
      <DraftActionButtons
        jobRunning={jobRunning}
        startPending={startDraft.isPending}
        renderDisabled={btnState.renderDisabled}
        draftNoImagesDisabled={btnState.draftNoImagesDisabled}
        renderButtonText={draftModel.renderButtonText}
        onMakeDraft={handleMakeDraft}
      />
      <VoiceActions
        projectId={projectId}
        directVoiceDisabled={btnState.directVoiceDisabled}
        onDirectVoice={handleDirectVoice}
      />
    </div>
  );
}

function ImageDraftSettings({
  projectId,
  imageEnabled,
  imageMode,
  imageBudget,
  imageQuality,
  onImageEnabledChange,
  onImageModeChange,
  onImageBudgetChange,
  onImageQualityChange,
}: {
  projectId: string;
  imageEnabled: boolean;
  imageMode: string;
  imageBudget: string;
  imageQuality: string;
  onImageEnabledChange: (value: boolean) => void;
  onImageModeChange: (value: string) => void;
  onImageBudgetChange: (value: string) => void;
  onImageQualityChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-[var(--color-surface-overlay)] rounded border border-[var(--color-border)]">
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={imageEnabled}
          onChange={(e) => {
            onImageEnabledChange(e.target.checked);
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
            onChange={(v) => {
              onImageModeChange(v);
              writeStored(projectId, "imageMode", v);
            }}
            options={[
              { value: "missing", label: "Only missing" },
              { value: "all", label: "Refresh all" },
            ]}
          />
          <SelectField
            label="Density"
            value={imageBudget}
            onChange={(v) => {
              onImageBudgetChange(v);
              writeStored(projectId, "imageBudget", v);
            }}
            options={[
              { value: "llm", label: "LLM-driven" },
              { value: "balanced", label: "Balanced" },
              { value: "beat", label: "All beats" },
            ]}
          />
          <SelectField
            label="Quality"
            value={imageQuality}
            onChange={(v) => {
              onImageQualityChange(v);
              writeStored(projectId, "imageQuality", v);
            }}
            options={[
              { value: "low", label: "Draft" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function DraftActionButtons({
  jobRunning,
  startPending,
  renderDisabled,
  draftNoImagesDisabled,
  renderButtonText,
  onMakeDraft,
}: {
  jobRunning: boolean;
  startPending: boolean;
  renderDisabled: boolean;
  draftNoImagesDisabled: boolean;
  renderButtonText: string;
  onMakeDraft: (withImages: boolean) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onMakeDraft(true)}
        disabled={renderDisabled || startPending}
        className={`px-4 py-2 text-xs font-semibold rounded transition-colors ${
          jobRunning
            ? "bg-[var(--color-running)]/20 text-[var(--color-running)] border border-[var(--color-running)]/30"
            : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {renderButtonText}
      </button>

      {!jobRunning && (
        <button
          onClick={() => onMakeDraft(false)}
          disabled={draftNoImagesDisabled || startPending}
          className="px-3 py-2 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Draft Without Images
        </button>
      )}
    </div>
  );
}

function VoiceActions({
  projectId,
  directVoiceDisabled,
  onDirectVoice,
}: {
  projectId: string;
  directVoiceDisabled: boolean;
  onDirectVoice: () => void;
}) {
  return (
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
        onClick={onDirectVoice}
        disabled={directVoiceDisabled}
        className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
      >
        Direct Voice
      </button>
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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

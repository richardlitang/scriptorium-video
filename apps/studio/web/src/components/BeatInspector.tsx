import { useRegenerateBeat } from "@/queries/assets";
import type { Asset } from "@/api/client";
import type { Beat, Plan, Section, VoiceDirection } from "./beat-workspace-types";
import {
  beatDurationSeconds,
  imageAssetStatus,
  pauseMsToSeconds,
  visualAssetForBeat,
  voiceAssetForBeat,
} from "./beat-workspace-helpers";

const VOICE_PROFILES = [
  "neutral",
  "warm_open",
  "clear_explainer",
  "authoritative",
  "energetic",
  "key_point",
  "reflective",
  "tense",
  "reveal",
  "urgent",
  "soft_close",
];

interface BeatInspectorProps {
  beat: Beat;
  section: Section;
  plan: Plan;
  assets: Asset[];
  timeline: Record<string, unknown> | null;
  selectedBeatIds: Set<string>;
  projectId: string;
  imageQuality: string;
  mutatePlan: (updater: (p: Plan) => void) => void;
}

type WithBeat = (fn: (b: Beat, s: Section) => void) => void;

export function BeatInspector({
  beat,
  section,
  plan,
  assets,
  timeline,
  selectedBeatIds,
  projectId,
  imageQuality,
  mutatePlan,
}: BeatInspectorProps) {
  const imageAsset = visualAssetForBeat(assets, beat.id);
  const voiceAsset = voiceAssetForBeat(assets, beat.id);
  const dur = beatDurationSeconds(beat.id, timeline);
  const regenerateBeat = useRegenerateBeat(projectId);
  const regenerating = regenerateBeat.isPending;

  function withBeat(fn: (b: Beat, s: Section) => void) {
    mutatePlan((currentPlan) => {
      for (const sec of currentPlan.sections ?? []) {
        const matchingBeat = sec.beats?.find((candidateBeat) => candidateBeat.id === beat.id);
        if (matchingBeat) {
          fn(matchingBeat, sec);
          break;
        }
      }
    });
  }

  async function handleRegenerate(withRender: boolean) {
    await regenerateBeat.mutateAsync({
      beatId: beat.id,
      render: withRender,
      quality: imageQuality,
    });
  }

  function toggleDirectionLock(path: string) {
    withBeat((b) => {
      const locked = new Set(b.directionMeta?.lockedPaths ?? []);
      locked.has(path) ? locked.delete(path) : locked.add(path);
      b.directionMeta = { ...(b.directionMeta ?? {}), lockedPaths: [...locked] };
    });
  }

  function voiceMs(msField: number | undefined, secField: number | undefined): number {
    if (typeof msField === "number" && Number.isFinite(msField)) return msField;
    return Math.round((secField ?? 0) * 1000);
  }

  function applyVoiceTuningToBeats(targets: Beat[]) {
    const vd = beat.voiceDirection;
    const tuning: VoiceDirection = {
      profile: vd?.profile ?? "neutral",
      intensity: vd?.intensity ?? 0.5,
      pauseBeforeMs: voiceMs(vd?.pauseBeforeMs, vd?.pauseBeforeSeconds),
      pauseAfterMs: voiceMs(vd?.pauseAfterMs, vd?.pauseAfterSeconds),
      deliveryNote: vd?.deliveryNote,
      speedMultiplier: vd?.speedMultiplier ?? 1,
      pitchOffset: vd?.pitchOffset ?? 0,
      source: "user",
    };
    mutatePlan((p) => {
      const ids = new Set(targets.map((b) => b.id));
      for (const sec of p.sections ?? []) {
        for (const b of sec.beats ?? []) {
          if (ids.has(b.id)) b.voiceDirection = { ...(b.voiceDirection ?? {}), ...tuning };
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-[var(--color-text-muted)]">
        {section.title} · {beat.id}
        {dur > 0 ? ` · ${dur.toFixed(1)}s` : ""}
      </div>
      <div className="text-xs text-[var(--color-text-muted)] opacity-70">
        Image: {imageAssetStatus(imageAsset, beat.id)} · Audio:{" "}
        {voiceAsset ? String(voiceAsset["status"]) : "missing"}
      </div>

      <SectionDirectionEditor section={section} withBeat={withBeat} />
      <ScriptEditor beat={beat} withBeat={withBeat} />
      <VoiceEditor beat={beat} withBeat={withBeat} />
      <CaptionEditor beat={beat} withBeat={withBeat} />
      <BeatActions
        beat={beat}
        section={section}
        plan={plan}
        selectedBeatIds={selectedBeatIds}
        regenerating={regenerating}
        onToggleDirectionLock={toggleDirectionLock}
        onApplyVoiceTuning={applyVoiceTuningToBeats}
        onRegenerate={handleRegenerate}
      />
    </div>
  );
}

function SectionDirectionEditor({ section, withBeat }: { section: Section; withBeat: WithBeat }) {
  function updateCreativeField(field: "feel" | "pacing" | "visualStyle", value: string) {
    withBeat((_, sec) => {
      sec.direction = {
        ...(sec.direction ?? {}),
        creative: {
          ...(sec.direction?.creative ?? {}),
          [field]: value.trim() || undefined,
        },
      };
    });
  }

  return (
    <InspectorSection label="Section direction">
      <Field label="Feel">
        <input
          className={iCls}
          defaultValue={section.direction?.creative?.feel ?? ""}
          onBlur={(e) => updateCreativeField("feel", e.target.value)}
        />
      </Field>
      <Field label="Pacing">
        <input
          className={iCls}
          defaultValue={section.direction?.creative?.pacing ?? ""}
          onBlur={(e) => updateCreativeField("pacing", e.target.value)}
        />
      </Field>
      <Field label="Visual style">
        <input
          className={iCls}
          defaultValue={section.direction?.creative?.visualStyle ?? ""}
          onBlur={(e) => updateCreativeField("visualStyle", e.target.value)}
        />
      </Field>
    </InspectorSection>
  );
}

function ScriptEditor({ beat, withBeat }: { beat: Beat; withBeat: WithBeat }) {
  return (
    <InspectorSection label="Script">
      <textarea
        className={`${iCls} resize-y`}
        defaultValue={beat.narration}
        rows={4}
        onBlur={(e) =>
          withBeat((b) => {
            b.narration = e.target.value;
          })
        }
      />
    </InspectorSection>
  );
}

function VoiceEditor({ beat, withBeat }: { beat: Beat; withBeat: WithBeat }) {
  const vd = beat.voiceDirection ?? {};

  function updateVoiceDirection(patch: Partial<VoiceDirection>) {
    withBeat((b) => {
      b.voiceDirection = {
        ...(b.voiceDirection ?? {}),
        ...patch,
        source: "user",
      };
    });
  }

  function clampedNumber(value: string, fallback: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number(value) || fallback));
  }

  return (
    <InspectorSection label="Voice">
      <Field label="Profile">
        <select
          className={iCls}
          defaultValue={vd.profile ?? "neutral"}
          onChange={(e) => updateVoiceDirection({ profile: e.target.value })}
        >
          {VOICE_PROFILES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Intensity (${Number(vd.intensity ?? 0.5).toFixed(2)})`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          defaultValue={vd.intensity ?? 0.5}
          className="w-full accent-[var(--color-accent)]"
          onChange={(e) => updateVoiceDirection({ intensity: Number(e.target.value) })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Pause before (s)">
          <input
            type="number"
            min="0"
            max="1.2"
            step="0.05"
            className={iCls}
            defaultValue={pauseMsToSeconds(vd.pauseBeforeMs, vd.pauseBeforeSeconds ?? 0)}
            onBlur={(e) =>
              updateVoiceDirection({
                pauseBeforeMs: Math.round(clampedNumber(e.target.value, 0, 0, 1.2) * 1000),
              })
            }
          />
        </Field>
        <Field label="Pause after (s)">
          <input
            type="number"
            min="0"
            max="1.2"
            step="0.05"
            className={iCls}
            defaultValue={pauseMsToSeconds(vd.pauseAfterMs, vd.pauseAfterSeconds ?? 0)}
            onBlur={(e) =>
              updateVoiceDirection({
                pauseAfterMs: Math.round(clampedNumber(e.target.value, 0, 0, 1.2) * 1000),
              })
            }
          />
        </Field>
        <Field label="Speed (0.6-1.5)">
          <input
            type="number"
            min="0.6"
            max="1.5"
            step="0.05"
            className={iCls}
            defaultValue={vd.speedMultiplier ?? 1}
            onBlur={(e) =>
              updateVoiceDirection({
                speedMultiplier: clampedNumber(e.target.value, 1, 0.6, 1.5),
              })
            }
          />
        </Field>
        <Field label="Pitch offset (-6-6)">
          <input
            type="number"
            min="-6"
            max="6"
            step="0.25"
            className={iCls}
            defaultValue={vd.pitchOffset ?? 0}
            onBlur={(e) =>
              updateVoiceDirection({
                pitchOffset: clampedNumber(e.target.value, 0, -6, 6),
              })
            }
          />
        </Field>
      </div>
      <Field label="Delivery note">
        <textarea
          className={`${iCls} resize-none`}
          rows={2}
          defaultValue={vd.deliveryNote ?? ""}
          onBlur={(e) =>
            updateVoiceDirection({
              deliveryNote: e.target.value.trim() || undefined,
            })
          }
        />
      </Field>
    </InspectorSection>
  );
}

function CaptionEditor({ beat, withBeat }: { beat: Beat; withBeat: WithBeat }) {
  return (
    <InspectorSection label="Captions">
      <Field label="Style">
        <input
          className={iCls}
          defaultValue={beat.caption?.style ?? "default"}
          onBlur={(e) =>
            withBeat((b) => {
              b.caption = { ...(b.caption ?? {}), style: e.target.value.trim() || "default" };
            })
          }
        />
      </Field>
      <Field label="Emphasis phrases (comma-separated)">
        <textarea
          className={`${iCls} resize-none`}
          rows={2}
          defaultValue={
            Array.isArray(beat.caption?.emphasis) ? beat.caption.emphasis.join(", ") : ""
          }
          onBlur={(e) =>
            withBeat((b) => {
              b.caption = {
                ...(b.caption ?? {}),
                emphasis: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 16),
              };
            })
          }
        />
      </Field>
    </InspectorSection>
  );
}

function BeatActions({
  beat,
  section,
  plan,
  selectedBeatIds,
  regenerating,
  onToggleDirectionLock,
  onApplyVoiceTuning,
  onRegenerate,
}: {
  beat: Beat;
  section: Section;
  plan: Plan;
  selectedBeatIds: Set<string>;
  regenerating: boolean;
  onToggleDirectionLock: (path: string) => void;
  onApplyVoiceTuning: (targets: Beat[]) => void;
  onRegenerate: (withRender: boolean) => void;
}) {
  return (
    <InspectorSection label="Actions">
      <div className="flex flex-wrap gap-1">
        {(["voice", "caption.emphasis", "sfx"] as const).map((path) => (
          <SmBtn key={path} onClick={() => onToggleDirectionLock(path)}>
            {(beat.directionMeta?.lockedPaths ?? []).includes(path)
              ? `Unlock ${path}`
              : `Lock ${path}`}
          </SmBtn>
        ))}
        <SmBtn onClick={() => onApplyVoiceTuning(section.beats ?? [])}>
          Apply voice to section
        </SmBtn>
        {selectedBeatIds.size > 0 && (
          <SmBtn
            onClick={() => {
              const targets = (plan.sections ?? []).flatMap((s) =>
                (s.beats ?? []).filter((b) => selectedBeatIds.has(b.id)),
              );
              onApplyVoiceTuning(targets);
            }}
          >
            Apply voice to {selectedBeatIds.size} selected
          </SmBtn>
        )}
        <SmBtn onClick={() => onRegenerate(false)} disabled={regenerating}>
          {regenerating ? "Running..." : "Regenerate beat"}
        </SmBtn>
        <SmBtn onClick={() => onRegenerate(true)} disabled={regenerating}>
          {regenerating ? "Running..." : "Regen + render"}
        </SmBtn>
      </div>
    </InspectorSection>
  );
}

const iCls =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
      {children}
    </div>
  );
}

function InspectorSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border)] pb-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function SmBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  );
}

import { useState, useMemo, useCallback } from "react";
import { useAssets, useRegenerateBeat } from "@/queries/assets";
import { useProjectDetails } from "@/queries/project-details";
import { readStored, writeStored } from "@/lib/project-storage";
import type { Asset } from "@/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Beat {
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

interface Section {
  id: string;
  title: string;
  beats: Beat[];
  direction?: { creative?: { feel?: string; pacing?: string; visualStyle?: string } };
}

interface Plan {
  sections: Section[];
  direction?: unknown;
  [key: string]: unknown;
}

interface VoiceDirection {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function visualAssetForBeat(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((a) => a["role"] === "primary_visual" && a["beatId"] === beatId);
}
function voiceAssetForBeat(assets: Asset[], beatId: string): Asset | undefined {
  return assets.find((a) => a["role"] === "voiceover" && a["beatId"] === beatId);
}
function beatDurationSeconds(beatId: string, timeline: Record<string, unknown> | null): number {
  const beats =
    (timeline?.["beats"] as { id: string; durationSeconds?: number }[] | undefined) ?? [];
  return beats.find((b) => b.id === beatId)?.durationSeconds ?? 0;
}
function pauseMsToSeconds(ms?: number, fallbackSeconds = 0): number {
  if (typeof ms === "number" && Number.isFinite(ms))
    return Number((Math.max(0, Math.min(1200, ms)) / 1000).toFixed(2));
  return Number(Math.max(0, Math.min(1.2, fallbackSeconds)).toFixed(2));
}
function findBeatInPlan(
  plan: Plan,
  beatId: string | null,
): { beat: Beat; section: Section } | null {
  if (!beatId) return null;
  for (const section of plan.sections ?? []) {
    const beat = section.beats?.find((b) => b.id === beatId);
    if (beat) return { beat, section };
  }
  return null;
}

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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  planJson: string;
  onPlanChange: (json: string) => void;
}

export function BeatWorkspace({ projectId, planJson, onPlanChange }: Props) {
  const { data: assets = [] } = useAssets(projectId);
  const { data: details } = useProjectDetails(projectId);
  const timeline = details?.timeline ?? null;
  const runState = details?.runState ?? null;

  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(
    () => readStored(projectId, "selectedBeatId") || null,
  );
  const [selectedBeatIds, setSelectedBeatIds] = useState<Set<string>>(new Set());

  const plan = useMemo((): Plan => {
    try {
      return planJson ? JSON.parse(planJson) : { sections: [] };
    } catch {
      return { sections: [] };
    }
  }, [planJson]);

  const mutatePlan = useCallback(
    (updater: (p: Plan) => void) => {
      const clone = JSON.parse(JSON.stringify(plan)) as Plan;
      updater(clone);
      onPlanChange(JSON.stringify(clone, null, 2));
    },
    [plan, onPlanChange],
  );

  function selectBeat(beatId: string) {
    setSelectedBeatId(beatId);
    writeStored(projectId, "selectedBeatId", beatId);
  }

  const hasStaleRender = Boolean(
    runState?.lastRenderPlanHash &&
    (runState.lastRenderPlanHash !== runState.currentPlanHash ||
      runState.lastRenderTimelineHash !== runState.currentTimelineHash),
  );

  const selected = findBeatInPlan(plan, selectedBeatId);

  if (!plan.sections?.length) {
    return (
      <div className="p-4 text-xs text-[var(--color-text-muted)]">
        Convert or generate a plan to see beat timeline.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Timeline */}
      <div className="flex-1 overflow-auto p-3 border-b border-[var(--color-border)]">
        {plan.sections.map((section) => (
          <div key={section.id} className="mb-4">
            <div className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">
              {section.title}
            </div>
            <div className="flex gap-2 flex-wrap">
              {section.beats?.map((beat) => {
                const imgAsset = visualAssetForBeat(assets, beat.id);
                const audAsset = voiceAssetForBeat(assets, beat.id);
                const dur = beatDurationSeconds(beat.id, timeline);
                const isSelected = beat.id === selectedBeatId;
                return (
                  <button
                    key={beat.id}
                    onClick={() => selectBeat(beat.id)}
                    className={`text-left p-2 rounded border transition-colors w-36 shrink-0 ${
                      isSelected
                        ? "border-[var(--color-accent)] bg-[var(--color-surface-overlay)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50 bg-[var(--color-surface-raised)]"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedBeatIds.has(beat.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelectedBeatIds((prev) => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(beat.id) : next.delete(beat.id);
                            return next;
                          })
                        }
                        className="accent-[var(--color-accent)]"
                      />
                      <span className="text-xs font-mono text-[var(--color-text-muted)] truncate flex-1">
                        {beat.id}
                      </span>
                      {dur > 0 && (
                        <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                          {dur.toFixed(1)}s
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text)] line-clamp-2 leading-tight mb-1">
                      {beat.narration.slice(0, 100)}
                    </p>
                    <div className="flex gap-0.5 flex-wrap">
                      <Chip ok={!!imgAsset}>{imageChipLabel(imgAsset, beat.id)}</Chip>
                      <Chip ok={!!audAsset}>{audAsset ? "audio" : "no audio"}</Chip>
                      <Chip ok={!hasStaleRender}>{hasStaleRender ? "stale" : "ok"}</Chip>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Inspector */}
      <div className="flex-1 overflow-y-auto p-3">
        {selected ? (
          <BeatInspector
            beat={selected.beat}
            section={selected.section}
            plan={plan}
            assets={assets}
            timeline={timeline}
            selectedBeatIds={selectedBeatIds}
            projectId={projectId}
            imageQuality={readStored(projectId, "imageQuality", "low")}
            mutatePlan={mutatePlan}
          />
        ) : (
          <div className="text-xs text-[var(--color-text-muted)]">Select a beat to inspect.</div>
        )}
      </div>
    </div>
  );
}

function imageChipLabel(imgAsset: Asset | undefined, beatId: string): string {
  if (!imgAsset) return "no img";
  return imgAsset["beatId"] !== beatId ? "reused" : "img";
}

function imageAssetStatus(imgAsset: Asset | undefined, beatId: string): string {
  if (!imgAsset) return "missing";
  if (imgAsset["beatId"] !== beatId) return `reused (${imgAsset["beatId"]})`;
  return String(imgAsset["status"]);
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`text-[10px] px-1 rounded ${ok ? "bg-[var(--color-success)]/15 text-[var(--color-success)]" : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"}`}
    >
      {children}
    </span>
  );
}

// ─── Inspector ────────────────────────────────────────────────────────────────

interface InspectorProps {
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

function BeatInspector({
  beat,
  section,
  plan,
  assets,
  timeline,
  selectedBeatIds,
  projectId,
  imageQuality,
  mutatePlan,
}: InspectorProps) {
  const imageAsset = visualAssetForBeat(assets, beat.id);
  const voiceAsset = voiceAssetForBeat(assets, beat.id);
  const dur = beatDurationSeconds(beat.id, timeline);
  const regenerateBeat = useRegenerateBeat(projectId);
  const regenerating = regenerateBeat.isPending;

  function withBeat(fn: (b: Beat, s: Section) => void) {
    mutatePlan((plan) => {
      for (const sec of plan.sections ?? []) {
        const b = sec.beats?.find((b) => b.id === beat.id);
        if (b) {
          fn(b, sec);
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

  const vd = beat.voiceDirection ?? {};

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

      {/* Section creative direction */}
      <InspectorSection label="Section direction">
        <Field label="Feel">
          <input
            className={iCls}
            defaultValue={section.direction?.creative?.feel ?? ""}
            onBlur={(e) =>
              withBeat((_, sec) => {
                sec.direction = {
                  ...(sec.direction ?? {}),
                  creative: {
                    ...(sec.direction?.creative ?? {}),
                    feel: e.target.value.trim() || undefined,
                  },
                };
              })
            }
          />
        </Field>
        <Field label="Pacing">
          <input
            className={iCls}
            defaultValue={section.direction?.creative?.pacing ?? ""}
            onBlur={(e) =>
              withBeat((_, sec) => {
                sec.direction = {
                  ...(sec.direction ?? {}),
                  creative: {
                    ...(sec.direction?.creative ?? {}),
                    pacing: e.target.value.trim() || undefined,
                  },
                };
              })
            }
          />
        </Field>
        <Field label="Visual style">
          <input
            className={iCls}
            defaultValue={section.direction?.creative?.visualStyle ?? ""}
            onBlur={(e) =>
              withBeat((_, sec) => {
                sec.direction = {
                  ...(sec.direction ?? {}),
                  creative: {
                    ...(sec.direction?.creative ?? {}),
                    visualStyle: e.target.value.trim() || undefined,
                  },
                };
              })
            }
          />
        </Field>
      </InspectorSection>

      {/* Script */}
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

      {/* Voice direction */}
      <InspectorSection label="Voice">
        <Field label="Profile">
          <select
            className={iCls}
            defaultValue={vd.profile ?? "neutral"}
            onChange={(e) =>
              withBeat((b) => {
                b.voiceDirection = {
                  ...(b.voiceDirection ?? {}),
                  profile: e.target.value,
                  source: "user",
                };
              })
            }
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
            onChange={(e) =>
              withBeat((b) => {
                b.voiceDirection = {
                  ...(b.voiceDirection ?? {}),
                  intensity: Number(e.target.value),
                  source: "user",
                };
              })
            }
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
              onBlur={(e) => {
                const v = Math.max(0, Math.min(1.2, Number(e.target.value) || 0));
                withBeat((b) => {
                  b.voiceDirection = {
                    ...(b.voiceDirection ?? {}),
                    pauseBeforeMs: Math.round(v * 1000),
                    source: "user",
                  };
                });
              }}
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
              onBlur={(e) => {
                const v = Math.max(0, Math.min(1.2, Number(e.target.value) || 0));
                withBeat((b) => {
                  b.voiceDirection = {
                    ...(b.voiceDirection ?? {}),
                    pauseAfterMs: Math.round(v * 1000),
                    source: "user",
                  };
                });
              }}
            />
          </Field>
          <Field label="Speed (0.6–1.5)">
            <input
              type="number"
              min="0.6"
              max="1.5"
              step="0.05"
              className={iCls}
              defaultValue={vd.speedMultiplier ?? 1}
              onBlur={(e) => {
                const v = Math.max(0.6, Math.min(1.5, Number(e.target.value) || 1));
                withBeat((b) => {
                  b.voiceDirection = {
                    ...(b.voiceDirection ?? {}),
                    speedMultiplier: v,
                    source: "user",
                  };
                });
              }}
            />
          </Field>
          <Field label="Pitch offset (−6–6)">
            <input
              type="number"
              min="-6"
              max="6"
              step="0.25"
              className={iCls}
              defaultValue={vd.pitchOffset ?? 0}
              onBlur={(e) => {
                const v = Math.max(-6, Math.min(6, Number(e.target.value) || 0));
                withBeat((b) => {
                  b.voiceDirection = {
                    ...(b.voiceDirection ?? {}),
                    pitchOffset: v,
                    source: "user",
                  };
                });
              }}
            />
          </Field>
        </div>
        <Field label="Delivery note">
          <textarea
            className={`${iCls} resize-none`}
            rows={2}
            defaultValue={vd.deliveryNote ?? ""}
            onBlur={(e) =>
              withBeat((b) => {
                b.voiceDirection = {
                  ...(b.voiceDirection ?? {}),
                  deliveryNote: e.target.value.trim() || undefined,
                  source: "user",
                };
              })
            }
          />
        </Field>
      </InspectorSection>

      {/* Captions */}
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

      {/* Actions */}
      <InspectorSection label="Actions">
        <div className="flex flex-wrap gap-1">
          {(["voice", "caption.emphasis", "sfx"] as const).map((path) => (
            <SmBtn key={path} onClick={() => toggleDirectionLock(path)}>
              {(beat.directionMeta?.lockedPaths ?? []).includes(path)
                ? `Unlock ${path}`
                : `Lock ${path}`}
            </SmBtn>
          ))}
          <SmBtn onClick={() => applyVoiceTuningToBeats(section.beats ?? [])}>
            Apply voice to section
          </SmBtn>
          {selectedBeatIds.size > 0 && (
            <SmBtn
              onClick={() => {
                const targets = (plan.sections ?? []).flatMap((s) =>
                  (s.beats ?? []).filter((b) => selectedBeatIds.has(b.id)),
                );
                applyVoiceTuningToBeats(targets);
              }}
            >
              Apply voice to {selectedBeatIds.size} selected
            </SmBtn>
          )}
          <SmBtn onClick={() => handleRegenerate(false)} disabled={regenerating}>
            {regenerating ? "Running…" : "Regenerate beat"}
          </SmBtn>
          <SmBtn onClick={() => handleRegenerate(true)} disabled={regenerating}>
            {regenerating ? "Running…" : "Regen + render"}
          </SmBtn>
        </div>
      </InspectorSection>
    </div>
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

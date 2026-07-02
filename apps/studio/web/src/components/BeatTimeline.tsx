import type { Asset } from "@/api/client";
import type { Plan } from "./beat-workspace-types";
import {
  beatDurationSeconds,
  imageChipLabel,
  visualAssetForBeat,
  voiceAssetForBeat,
} from "./beat-workspace-helpers";

interface BeatTimelineProps {
  plan: Plan;
  assets: Asset[];
  timeline: Record<string, unknown> | null;
  selectedBeatId: string | null;
  selectedBeatIds: Set<string>;
  hasStaleRender: boolean;
  onSelectBeat: (beatId: string) => void;
  onSelectedBeatIdsChange: (updater: (previous: Set<string>) => Set<string>) => void;
}

export function BeatTimeline({
  plan,
  assets,
  timeline,
  selectedBeatId,
  selectedBeatIds,
  hasStaleRender,
  onSelectBeat,
  onSelectedBeatIdsChange,
}: BeatTimelineProps) {
  return (
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
                  onClick={() => onSelectBeat(beat.id)}
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
                        onSelectedBeatIdsChange((prev) => {
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
  );
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

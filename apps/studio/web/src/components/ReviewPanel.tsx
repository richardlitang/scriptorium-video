import { useState } from "react";
import { useProjectReview } from "@/queries/review";

interface Props {
  projectId: string;
  onSelectBeat?: (beatId: string) => void;
}

const SEV_COLORS: Record<string, string> = {
  critical: "border-l-[var(--color-error)] bg-[var(--color-error)]/5",
  warning: "border-l-[var(--color-warning)] bg-[var(--color-warning)]/5",
  suggestion: "border-l-[var(--color-text-muted)] bg-[var(--color-surface-overlay)]",
};

export function ReviewPanel({ projectId, onSelectBeat }: Props) {
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "suggestion">("all");
  const { data: issues = [], isLoading, refetch } = useProjectReview(projectId);

  const filtered = issues.filter((i) => filter === "all" || i.severity === filter);
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1;

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] shrink-0 flex-wrap">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs text-[var(--color-text)] focus:outline-none"
        >
          <option value="all">All ({issues.length})</option>
          <option value="critical">Critical ({counts.critical})</option>
          <option value="warning">Warnings ({counts.warning})</option>
          <option value="suggestion">Suggestions ({counts.suggestion})</option>
        </select>
        <button
          onClick={() => refetch()}
          className="px-2 py-0.5 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && <div className="text-xs text-[var(--color-text-muted)]">Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-xs text-[var(--color-text-muted)]">No issues for this filter.</div>
        )}
        <div className="flex flex-col gap-2">
          {filtered.map((issue, i) => (
            <article
              key={i}
              className={`border border-[var(--color-border)] border-l-4 ${SEV_COLORS[issue.severity] ?? SEV_COLORS["suggestion"]} rounded p-2`}
            >
              <div className="text-xs font-semibold">
                {issue.severity.toUpperCase()} · {issue.code}
              </div>
              <div className="text-xs text-[var(--color-text)] mt-0.5">{issue.message}</div>
              {issue.beatId && onSelectBeat && (
                <button
                  onClick={() => onSelectBeat(issue.beatId)}
                  className="mt-1 text-xs px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Select Beat
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useSavePlan } from "@/queries/planner";
import type { FeedbackItem } from "@/lib/story-parser";

interface WorkflowFlags {
  hasUnsavedPlan: boolean;
  needsPrepareDraft: boolean;
  needsRender: boolean;
}

interface Props {
  projectId: string;
  planJson: string;
  onChange: (json: string) => void;
  workflowFlags: WorkflowFlags;
  onSaved: () => void;
  qualityLog: string[];
}

export function PlanEditor({
  projectId,
  planJson,
  onChange,
  workflowFlags,
  onSaved,
  qualityLog,
}: Props) {
  const savePlan = useSavePlan(projectId);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleSave() {
    setParseError(null);
    try {
      JSON.parse(planJson); // validate before sending
    } catch (err) {
      setParseError(`Invalid JSON: ${String(err)}`);
      return;
    }
    try {
      await savePlan.mutateAsync(planJson);
      onSaved();
    } catch (err) {
      // error surfaces in qualityLog via the workspace
    }
  }

  const workflowFeedback = buildWorkflowFeedback(workflowFlags);

  return (
    <div className="flex flex-col gap-2 p-4 h-full">
      {/* Workflow status */}
      {workflowFeedback.length > 0 && (
        <div className="flex flex-col gap-1">
          {workflowFeedback.map((item, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded border-l-2 bg-[var(--color-surface-overlay)] ${LEVEL_COLORS[item.level]}`}
            >
              {item.text}
            </div>
          ))}
        </div>
      )}

      {/* Plan textarea */}
      <textarea
        value={planJson}
        onChange={(e) => onChange(e.target.value)}
        rows={20}
        spellCheck={false}
        className="flex-1 w-full bg-[var(--color-surface-overlay)] border border-[var(--color-border)] rounded px-3 py-2 text-xs font-mono text-[var(--color-text)] resize-none focus:outline-none focus:border-[var(--color-accent)]"
        placeholder="Plan JSON will appear here after Convert Story or Generate Plan with AI."
      />

      {parseError && (
        <div className="text-xs text-[var(--color-error)] px-2 py-1 bg-[var(--color-error)]/10 rounded">
          {parseError}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={savePlan.isPending || !planJson.trim()}
        className="self-start px-4 py-1.5 text-xs font-medium rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {savePlan.isPending ? "Saving…" : "Save Plan"}
      </button>

      {/* Quality log */}
      {qualityLog.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            Output
          </div>
          <pre className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-overlay)] border border-[var(--color-border)] rounded p-2 overflow-y-auto max-h-48 whitespace-pre-wrap">
            {qualityLog.join("\n\n")}
          </pre>
        </div>
      )}
    </div>
  );
}

function buildWorkflowFeedback(flags: WorkflowFlags): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  if (flags.hasUnsavedPlan)
    items.push({ level: "step", text: "Plan has unsaved changes — click Save Plan to persist." });
  else if (flags.needsPrepareDraft)
    items.push({
      level: "step",
      text: "Make Draft will regenerate narration, images if enabled, captions, and video.",
    });
  if (flags.needsRender)
    items.push({
      level: "step",
      text: "Rendered output shows a previous draft — run Make Draft to update.",
    });
  return items;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-[var(--color-text-muted)] border-[var(--color-border)]",
  warning: "text-[var(--color-warning)] border-[var(--color-warning)]/30",
  step: "text-[var(--color-accent)] border-[var(--color-accent)]/30",
  error: "text-[var(--color-error)] border-[var(--color-error)]/30",
};

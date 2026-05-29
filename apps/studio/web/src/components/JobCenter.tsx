import { useState } from "react";
import { useJobs, fetchJobTrace, type Job, type JobTrace } from "@/queries/jobs";

interface Props {
  projectId: string;
  onRetry?: () => void;
}

function formatJobTime(value?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleTimeString();
}

function formatElapsed(startedAt?: string, finishedAt?: string) {
  const start = Date.parse(startedAt ?? "");
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

const STATUS_COLORS: Record<string, string> = {
  queued: "border-l-[var(--color-warning)] text-[var(--color-warning)]",
  running: "border-l-[var(--color-running)] text-[var(--color-running)]",
  cancelling: "border-l-[var(--color-warning)] text-[var(--color-warning)]",
  completed: "border-l-[var(--color-success)] text-[var(--color-success)]",
  failed: "border-l-[var(--color-error)] text-[var(--color-error)]",
  cancelled: "border-l-[var(--color-text-muted)] text-[var(--color-text-muted)]",
};

export function JobCenter({ projectId, onRetry }: Props) {
  const { data: jobs, isLoading } = useJobs(projectId);
  const [expandedOutput, setExpandedOutput] = useState<Set<string>>(new Set());
  const [expandedTrace, setExpandedTrace] = useState<Set<string>>(new Set());
  const [traceCache, setTraceCache] = useState<Map<string, JobTrace>>(new Map());
  const [loadingTrace, setLoadingTrace] = useState<Set<string>>(new Set());

  function toggleOutput(id: string) {
    setExpandedOutput((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleTrace(job: Job) {
    const id = job.id;
    if (expandedTrace.has(id)) {
      setExpandedTrace((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      return;
    }
    setExpandedTrace((prev) => new Set(prev).add(id));
    if (!traceCache.has(id)) {
      setLoadingTrace((prev) => new Set(prev).add(id));
      try {
        const data = await fetchJobTrace(projectId, job);
        setTraceCache((prev) => new Map(prev).set(id, data));
      } catch (err) {
        setTraceCache((prev) =>
          new Map(prev).set(id, { raw: `Trace unavailable:\n${String(err)}` }),
        );
      } finally {
        setLoadingTrace((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    }
  }

  if (isLoading) return <div className="p-4 text-xs text-[var(--color-text-muted)]">Loading…</div>;
  if (!jobs?.length)
    return <div className="p-4 text-xs text-[var(--color-text-muted)]">No jobs yet.</div>;

  return (
    <div className="flex flex-col gap-2 p-3">
      {jobs.map((job) => {
        const elapsed = formatElapsed(job.startedAt, job.finishedAt);
        const color = STATUS_COLORS[job.status] ?? STATUS_COLORS["cancelled"];
        const progress =
          typeof job.completed === "number" && typeof job.total === "number"
            ? `${Math.min(job.total, job.completed)}/${job.total}`
            : null;

        return (
          <article
            key={job.id}
            className={`border border-[var(--color-border)] border-l-4 ${color} rounded bg-[var(--color-surface-raised)]`}
          >
            <div className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{job.label ?? "Job"}</span>
                <span className={`text-xs shrink-0 ${color.split(" ")[1]}`}>{job.status}</span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {formatJobTime(job.startedAt)}
                {elapsed ? ` · ${elapsed}` : ""}
                {progress && ` · ${progress}`}
                {job.currentSectionTitle && ` · ${job.currentSectionTitle}`}
              </div>
            </div>

            <div className="flex gap-1 px-3 pb-2 flex-wrap">
              <ActionBtn onClick={() => toggleOutput(job.id)}>
                {expandedOutput.has(job.id) ? "Hide Output" : "View Output"}
              </ActionBtn>
              {job.tracePath && (
                <ActionBtn onClick={() => toggleTrace(job)} disabled={loadingTrace.has(job.id)}>
                  {traceButtonLabel(loadingTrace.has(job.id), expandedTrace.has(job.id))}
                </ActionBtn>
              )}
              {job.status === "failed" && onRetry && (
                <ActionBtn onClick={onRetry} variant="danger">
                  Retry
                </ActionBtn>
              )}
            </div>

            {expandedOutput.has(job.id) && (
              <pre className="px-3 pb-3 text-xs font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-words border-t border-[var(--color-border)] pt-2">
                {job.output ?? job.error ?? "No output captured."}
              </pre>
            )}
            {expandedTrace.has(job.id) && (
              <pre className="px-3 pb-3 text-xs font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-words border-t border-[var(--color-border)] pt-2">
                {traceCache.get(job.id)?.raw ?? `Trace: ${job.tracePath}`}
              </pre>
            )}
          </article>
        );
      })}
    </div>
  );
}

function traceButtonLabel(loading: boolean, expanded: boolean): string {
  if (loading) return "Loading…";
  return expanded ? "Hide Trace" : "View Trace";
}

function ActionBtn({
  onClick,
  disabled,
  children,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:opacity-40 ${
        variant === "danger"
          ? "border-[var(--color-error)]/40 text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

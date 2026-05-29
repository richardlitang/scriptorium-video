import { useState } from "react";
import { useQualityHistory, useRenders, type RunState } from "@/queries/project-details";
import { JobCenter } from "./JobCenter";
import { ImagesPanel } from "./ImagesPanel";
import { BeatWorkspace } from "./BeatWorkspace";
import { ReviewPanel } from "./ReviewPanel";

interface Props {
  projectId: string;
  timeline: Record<string, unknown> | null;
  captionCount: number;
  runState: RunState | null;
  needsRender: boolean;
  onRetry?: () => void;
  onLog?: (msg: string) => void;
  planJson?: string;
  onPlanChange?: (json: string) => void;
}

type OutputTab = "render" | "beats" | "images" | "jobs" | "quality" | "review" | "timeline";

const TAB_LABELS: Record<OutputTab, string> = {
  render: "Render",
  beats: "Beats",
  images: "Images",
  jobs: "Jobs",
  quality: "Quality",
  review: "Review",
  timeline: "Timeline",
};

export function ProjectOutput({
  projectId,
  timeline,
  captionCount,
  runState,
  needsRender,
  onRetry,
  onLog,
  planJson,
  onPlanChange,
}: Props) {
  const [tab, setTab] = useState<OutputTab>("render");
  const { data: qualityHistory } = useQualityHistory(projectId);
  const { data: renders } = useRenders(projectId);

  const draftRender = renders?.find((r) => r.quality === "draft");
  const isCurrent =
    !needsRender &&
    runState?.lastRenderPlanHash != null &&
    runState.lastRenderPlanHash === runState.currentPlanHash &&
    runState.lastRenderTimelineHash === runState.currentTimelineHash;

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border)] shrink-0">
        {(
          ["render", "beats", "images", "jobs", "quality", "review", "timeline"] as OutputTab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[var(--color-accent)] text-[var(--color-text)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        <div className="ml-auto px-3 py-2 text-xs text-[var(--color-text-muted)]">
          {captionCount > 0 && `${captionCount} captions`}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "render" && <RenderTab draftRender={draftRender} isCurrent={isCurrent} />}
        {tab === "beats" && planJson != null && onPlanChange != null && (
          <BeatWorkspace projectId={projectId} planJson={planJson} onPlanChange={onPlanChange} />
        )}
        {tab === "images" && <ImagesPanel projectId={projectId} onLog={onLog ?? (() => {})} />}
        {tab === "jobs" && <JobCenter projectId={projectId} onRetry={onRetry} />}
        {tab === "quality" && <QualityTab entries={qualityHistory ?? []} />}
        {tab === "review" && <ReviewPanel projectId={projectId} />}
        {tab === "timeline" && <TimelineTab timeline={timeline} />}
      </div>
    </div>
  );
}

function RenderTab({
  draftRender,
  isCurrent,
}: {
  draftRender: { url: string; fileName: string; updatedAt?: string } | undefined;
  isCurrent: boolean;
}) {
  if (!draftRender) {
    return <div className="text-xs text-[var(--color-text-muted)]">No draft render yet.</div>;
  }

  // Use updatedAt as the cache buster so the URL is stable across renders
  const src = draftRender.updatedAt
    ? `${draftRender.url}?t=${encodeURIComponent(draftRender.updatedAt)}`
    : draftRender.url;
  const statusText = isCurrent
    ? `Latest draft${draftRender.updatedAt ? ` · ${new Date(draftRender.updatedAt).toLocaleString()}` : ""}.`
    : "Previous draft — current words or plan need Make Draft.";

  return (
    <div className="flex flex-col gap-2">
      <video
        key={src}
        src={src}
        controls
        preload="metadata"
        className="w-full max-w-lg rounded border border-[var(--color-border)]"
      />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-[var(--color-accent)] hover:underline"
      >
        {draftRender.fileName}
      </a>
      <div
        className={`text-xs ${isCurrent ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}
      >
        {statusText}
      </div>
    </div>
  );
}

function QualityTab({
  entries,
}: {
  entries: { timestamp: string; kind: string; summary: string }[];
}) {
  if (entries.length === 0) {
    return (
      <div className="text-xs text-[var(--color-text-muted)]">
        Quality checks run during Make Draft.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {[...entries].reverse().map((entry, i) => (
        <div key={i} className="flex gap-2 text-xs border-b border-[var(--color-border)] pb-1">
          <span className="text-[var(--color-text-muted)] shrink-0">{entry.timestamp}</span>
          <span className="font-medium text-[var(--color-text-muted)]">{entry.kind}</span>
          <span className="text-[var(--color-text)]">{entry.summary}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineTab({ timeline }: { timeline: Record<string, unknown> | null }) {
  return (
    <pre className="text-xs font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-words">
      {timeline ? JSON.stringify(timeline, null, 2) : '{ "message": "timeline.json missing" }'}
    </pre>
  );
}

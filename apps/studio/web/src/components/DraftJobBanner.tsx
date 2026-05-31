import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDraftJob, useStopDraftJob } from "@/queries/draft-job";
import {
  draftJobUiModel,
  draftJobProgressLine,
  shouldNotifyDraftJobFinished,
  draftJobNotificationModel,
} from "@/lib/draft-job-ui-state";
import { projectKeys } from "@/queries/projects";

interface Props {
  projectId: string;
  onJobFinished: () => void;
}

export function DraftJobBanner({ projectId, onJobFinished }: Props) {
  const { data: job } = useDraftJob(projectId);
  const stopJob = useStopDraftJob(projectId);
  const qc = useQueryClient();
  const lastSeenJobId = useRef<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const progressLine = draftJobProgressLine(job);
  const model = draftJobUiModel(job, progressLine, "Make Draft");

  // Notify + refresh when job finishes
  useEffect(() => {
    if (!job) return;
    if (shouldNotifyDraftJobFinished(lastSeenJobId.current, job)) {
      const notif = draftJobNotificationModel(job);
      document.title = notif.documentTitle;
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification(notif.title, { body: notif.body });
      }
      void qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      void qc.invalidateQueries({ queryKey: projectKeys.renders(projectId) });
      onJobFinished();
      setDismissed(false);
    }
    if (job.jobId) lastSeenJobId.current = job.jobId as string;
  }, [job, projectId, qc, onJobFinished]);

  if (model.hideBanner || dismissed) return null;

  const bannerColors = {
    running: "bg-[var(--color-running)]/10 border-[var(--color-running)]/30",
    completed: "bg-[var(--color-success)]/10 border-[var(--color-success)]/30",
    failed: "bg-[var(--color-error)]/10 border-[var(--color-error)]/30",
  };
  const colorClass = bannerColors[model.bannerStatus ?? "running"];

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b ${colorClass}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{model.bannerTitle}</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
          {model.bannerDetail}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {model.stopRunDisabled === false && (
          <button
            onClick={() => stopJob.mutate()}
            disabled={stopJob.isPending}
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:border-[var(--color-error)]/50 transition-colors"
          >
            Stop
          </button>
        )}
        {(model.bannerStatus === "completed" || model.bannerStatus === "failed") && (
          <button
            onClick={() => setDismissed(true)}
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

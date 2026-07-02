type DraftJobStatus = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled";

export type DraftJob = {
  kind?: string;
  status: DraftJobStatus;
  jobId?: string;
  error?: string;
  label?: string;
  phase?: string;
  total?: number;
  completed?: number;
  currentBeatIndex?: number;
  currentBeatTotal?: number;
  currentSectionTitle?: string;
  attempt?: number;
  maxAttempts?: number;
  [key: string]: unknown;
};

type DraftJobUiModel = {
  hideBanner: boolean;
  bannerTitle?: string;
  bannerDetail?: string;
  bannerStatus?: "running" | "completed" | "failed";
  renderButtonText: string;
  renderButtonDisabled: boolean | null;
  stopRunDisabled: boolean | null;
  runStatusLines: string[] | null;
};

export function draftJobProgressLine(job: DraftJob | null | undefined): string | undefined {
  if (!job || job.kind !== "draft_job") return undefined;
  const total = Number(job.total) || 1;
  const completed = Math.min(total, Number(job.completed) || 0);
  const retry = Number(job.attempt) > 1 ? ` · retry ${job.attempt}/${job.maxAttempts}` : "";
  const section = job.currentSectionTitle ? ` · ${job.currentSectionTitle}` : "";
  const beat =
    Number(job.currentBeatIndex) > 0 && Number(job.currentBeatTotal) > 0
      ? ` · beat ${job.currentBeatIndex}/${job.currentBeatTotal}`
      : "";
  return `${job.label ?? job.phase ?? "Working"} · ${completed}/${total}${beat}${retry}${section}`;
}

export function draftJobUiModel(
  job: DraftJob | null | undefined,
  progressLine: string | undefined,
  defaultDraftButtonLabel: string,
): DraftJobUiModel {
  if (!job || job.kind !== "draft_job") {
    return {
      hideBanner: true,
      renderButtonText: defaultDraftButtonLabel,
      renderButtonDisabled: null,
      stopRunDisabled: null,
      runStatusLines: null,
    };
  }

  if (job.status === "running" || job.status === "queued") {
    const line = progressLine ?? "Queued on this machine.";
    return {
      hideBanner: false,
      bannerTitle: "Draft running",
      bannerDetail: line,
      bannerStatus: "running",
      renderButtonText: "Draft Running...",
      renderButtonDisabled: true,
      stopRunDisabled: false,
      runStatusLines: [line],
    };
  }

  if (job.status === "cancelling") {
    const line = progressLine ?? "Waiting for current step to stop.";
    return {
      hideBanner: false,
      bannerTitle: "Stopping draft",
      bannerDetail: line,
      bannerStatus: "running",
      renderButtonText: "Stopping...",
      renderButtonDisabled: true,
      stopRunDisabled: true,
      runStatusLines: [line],
    };
  }

  if (job.status === "completed") {
    return {
      hideBanner: false,
      bannerTitle: "Draft ready",
      bannerDetail: "The background render finished. The preview has been refreshed.",
      bannerStatus: "completed",
      renderButtonText: defaultDraftButtonLabel,
      renderButtonDisabled: null,
      stopRunDisabled: true,
      runStatusLines: null,
    };
  }

  if (job.status === "failed") {
    return {
      hideBanner: false,
      bannerTitle: "Draft failed",
      bannerDetail: job.error ?? "The background draft job failed.",
      bannerStatus: "failed",
      renderButtonText: defaultDraftButtonLabel,
      renderButtonDisabled: null,
      stopRunDisabled: true,
      runStatusLines: null,
    };
  }

  return {
    hideBanner: true,
    renderButtonText: defaultDraftButtonLabel,
    renderButtonDisabled: null,
    stopRunDisabled: null,
    runStatusLines: null,
  };
}

export function shouldNotifyDraftJobFinished(
  lastSeenJobId: string | null,
  job: DraftJob | null | undefined,
): boolean {
  if (!job) return false;
  if (job.status !== "completed" && job.status !== "failed") return false;
  return lastSeenJobId !== (job.jobId ?? null);
}

export function draftJobNotificationModel(job: DraftJob) {
  const failed = job.status === "failed";
  return {
    title: failed ? "Draft failed" : "Draft ready",
    body: failed
      ? (job.error ?? "The background draft job failed.")
      : "Your draft video finished rendering.",
    documentTitle: `${failed ? "Draft failed" : "Draft ready"} - Local Video Studio`,
  };
}

export function isJobActive(status: DraftJobStatus | undefined): boolean {
  return ["queued", "running", "cancelling"].includes(status ?? "");
}

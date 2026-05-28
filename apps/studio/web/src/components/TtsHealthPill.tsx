import { useTtsHealth } from "@/queries/tts";
import { ttsPillViewModel } from "@/lib/tts-ui-state";

const PILL_COLORS = {
  ok: "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]/30",
  warn: "bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-[var(--color-warning)]/30",
  bad: "bg-[var(--color-error)]/15 text-[var(--color-text-muted)] border-[var(--color-border)]",
};

const DETAIL_COLORS = {
  ok: "text-[var(--color-success)]",
  warn: "text-[var(--color-warning)]",
  bad: "text-[var(--color-error)]",
};

export function TtsHealthPill() {
  const { data: healthState } = useTtsHealth();
  const vm = ttsPillViewModel(healthState ?? {});

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-mono whitespace-nowrap transition-colors ${PILL_COLORS[vm.pillClass]}`}
      title={vm.pillTitle}
      aria-label={vm.pillTitle}
    >
      {vm.pillText}
    </span>
  );
}

export function TtsHealthDetail() {
  const { data: healthState } = useTtsHealth();
  const vm = ttsPillViewModel(healthState ?? {});

  if (vm.pillClass === "ok") return null;

  return (
    <p
      className={`text-xs mt-1 px-3 pb-2 ${DETAIL_COLORS[vm.detailClass]}`}
    >
      {vm.detailText}
    </p>
  );
}

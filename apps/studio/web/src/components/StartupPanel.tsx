import { useTtsHealth } from "@/queries/tts";
import { ttsAvailabilityFromHealth, type TtsAvailability } from "@/lib/tts-ui-state";

type EngineReadout = {
  dotClass: string;
  pulse: boolean;
  label: string;
};

const ENGINE_READOUT: Record<TtsAvailability, EngineReadout> = {
  ready: { dotClass: "bg-[var(--color-success)]", pulse: false, label: "Narration engine ready" },
  ready_degraded: {
    dotClass: "bg-[var(--color-success)]",
    pulse: false,
    label: "Narration engine reachable",
  },
  loading: {
    dotClass: "bg-[var(--color-warning)]",
    pulse: true,
    label: "Warming narration model…",
  },
  checking: {
    dotClass: "bg-[var(--color-text-muted)]",
    pulse: true,
    label: "Checking narration engine…",
  },
  failed: { dotClass: "bg-[var(--color-error)]", pulse: false, label: "Narration engine offline" },
  unreachable: {
    dotClass: "bg-[var(--color-error)]",
    pulse: false,
    label: "Narration engine offline",
  },
};

function EngineStatus() {
  const { data: health } = useTtsHealth();
  const availability = ttsAvailabilityFromHealth(health ?? {});
  const readout = ENGINE_READOUT[availability];
  const warming = availability === "loading" || availability === "checking";

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-1.5">
      <span className="relative flex h-2 w-2">
        {readout.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${readout.dotClass}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${readout.dotClass}`} />
      </span>
      <span className="text-xs font-medium text-[var(--color-text)]">{readout.label}</span>
      {warming && (
        <span className="text-xs text-[var(--color-text-muted)]">first run can take a minute</span>
      )}
    </div>
  );
}

interface Props {
  projectsLoading: boolean;
  hasProjects: boolean;
  onCreate: () => void;
  creating: boolean;
}

function startupCopy(projectsLoading: boolean, hasProjects: boolean) {
  if (projectsLoading) {
    return { heading: "Starting Studio", body: "Loading your projects…" };
  }
  if (hasProjects) {
    return {
      heading: "Pick up where you left off",
      body: "Choose a project from the sidebar to open its story, plan, and render output.",
    };
  }
  return {
    heading: "Turn a story into a narrated video",
    body: "Create a project to draft a script, generate narration, and render a video — all locally.",
  };
}

export function StartupPanel({ projectsLoading, hasProjects, onCreate, creating }: Props) {
  const { heading, body } = startupCopy(projectsLoading, hasProjects);

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-5 text-3xl leading-none text-[var(--color-accent)]">◎</div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">{heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{body}</p>

        {projectsLoading ? (
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2" aria-hidden="true">
            <div className="h-9 motion-safe:animate-pulse rounded-md bg-[var(--color-surface-overlay)]" />
            <div className="h-9 w-3/4 motion-safe:animate-pulse rounded-md bg-[var(--color-surface-overlay)]" />
          </div>
        ) : (
          !hasProjects && (
            <button
              onClick={onCreate}
              disabled={creating}
              className="mt-6 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {creating ? "Creating…" : "New project"}
            </button>
          )
        )}

        <div className="mt-8">
          <EngineStatus />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { ProjectSidebar } from "./ProjectSidebar";
import { TtsHealthPill, TtsHealthDetail } from "./TtsHealthPill";

const STORAGE_KEY = "lvstudio:selectedProjectId";

export function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem(STORAGE_KEY, selectedProjectId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedProjectId]);

  return (
    <div className="flex h-screen overflow-hidden flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0">
        <span className="text-sm font-semibold tracking-tight text-[var(--color-text-muted)]">
          Local Video Studio
        </span>
        <TtsHealthPill />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col border-r border-[var(--color-border)] overflow-hidden">
          <ProjectSidebar
            selectedId={selectedProjectId}
            onSelect={setSelectedProjectId}
          />
          <TtsHealthDetail />
        </div>
        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedProjectId ? (
            <ProjectWorkspace projectId={selectedProjectId} />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
      <div className="text-center">
        <div className="text-4xl mb-4 opacity-30">◎</div>
        <div className="text-sm">Select a project to get started</div>
      </div>
    </div>
  );
}

// Placeholder — subsequent slices fill this out
function ProjectWorkspace({ projectId }: { projectId: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
      <div className="text-sm font-mono opacity-50">{projectId}</div>
    </div>
  );
}

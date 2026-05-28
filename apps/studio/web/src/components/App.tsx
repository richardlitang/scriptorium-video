import { useState, useEffect } from "react";
import { ProjectSidebar } from "./ProjectSidebar";

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
    <div className="flex h-screen overflow-hidden">
      <ProjectSidebar
        selectedId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />
      <main className="flex-1 overflow-hidden flex flex-col">
        {selectedProjectId ? (
          <ProjectWorkspace projectId={selectedProjectId} />
        ) : (
          <EmptyState />
        )}
      </main>
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

import { useState, useEffect } from "react";
import { ProjectSidebar } from "./ProjectSidebar";
import { TtsHealthPill, TtsHealthDetail } from "./TtsHealthPill";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { StartupPanel } from "./StartupPanel";
import { useProjects, useCreateProject } from "@/queries/projects";

const STORAGE_KEY = "lvstudio:selectedProjectId";

export function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const createProject = useCreateProject();

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem(STORAGE_KEY, selectedProjectId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedProjectId]);

  // Land in a workspace on startup instead of an empty center: drop a stale
  // selection that points at a deleted project, then open the first project
  // when nothing is selected.
  useEffect(() => {
    if (!projects) return;
    if (selectedProjectId && !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  async function handleCreateFirstProject() {
    const result = await createProject.mutateAsync({ title: "Untitled project" });
    setSelectedProjectId(result.project.id);
  }

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
          <ProjectSidebar selectedId={selectedProjectId} onSelect={setSelectedProjectId} />
          <TtsHealthDetail />
        </div>
        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedProjectId ? (
            <ProjectWorkspace projectId={selectedProjectId} />
          ) : (
            <StartupPanel
              projectsLoading={projectsLoading}
              hasProjects={(projects?.length ?? 0) > 0}
              onCreate={handleCreateFirstProject}
              creating={createProject.isPending}
            />
          )}
        </main>
      </div>
    </div>
  );
}

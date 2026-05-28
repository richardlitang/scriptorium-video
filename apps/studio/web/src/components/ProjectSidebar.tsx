import { useState } from "react";
import { useProjects, useCreateProject, useDeleteProject, useDeleteAllProjects } from "@/queries/projects";
import type { Project } from "@/api/client";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ProjectSidebar({ selectedId, onSelect }: Props) {
  const { data: projects, isLoading, isError } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const deleteAll = useDeleteAllProjects();
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const result = await createProject.mutateAsync({ title: newTitle.trim() });
    setNewTitle("");
    setCreating(false);
    onSelect(result.project.id);
  }

  return (
    <aside className="flex flex-col h-full w-64 min-w-[200px] border-r bg-[var(--color-surface-raised)] border-[var(--color-border)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Projects
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setCreating((v) => !v)}
            className="px-2 py-1 text-xs rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
            title="New project"
          >
            +
          </button>
          {projects && projects.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Delete all projects?")) deleteAll.mutate();
              }}
              className="px-2 py-1 text-xs rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
              title="Delete all"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="px-3 py-2 border-b border-[var(--color-border)]">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Project title…"
            className="w-full text-sm bg-[var(--color-surface-overlay)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={createProject.isPending}
              className="flex-1 text-xs py-1 rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
            >
              {createProject.isPending ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs px-2 py-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-4 py-6 text-xs text-[var(--color-text-muted)]">Loading…</div>
        )}
        {isError && (
          <div className="px-4 py-6 text-xs text-[var(--color-error)]">Failed to load projects.</div>
        )}
        {projects?.length === 0 && !isLoading && (
          <div className="px-4 py-6 text-xs text-[var(--color-text-muted)]">No projects yet.</div>
        )}
        {projects?.map((project: Project) => (
          <ProjectItem
            key={project.id}
            project={project}
            selected={project.id === selectedId}
            onSelect={() => onSelect(project.id)}
            onDelete={() => {
              if (project.id === selectedId) onSelect("");
              deleteProject.mutate(project.id);
            }}
          />
        ))}
      </div>
    </aside>
  );
}

function ProjectItem({
  project,
  selected,
  onSelect,
  onDelete,
}: {
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-start justify-between px-4 py-3 cursor-pointer border-b border-[var(--color-border)] transition-colors ${
        selected
          ? "bg-[var(--color-surface-overlay)] border-l-2 border-l-[var(--color-accent)]"
          : "hover:bg-[var(--color-surface-overlay)]"
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{project.title || project.id}</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {project.mode} · <StatusBadge status={project.status} />
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${project.title || project.id}"?`)) onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 ml-2 mt-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-all shrink-0"
        title="Delete project"
      >
        ✕
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "text-[var(--color-success)]",
    draft: "text-[var(--color-warning)]",
    error: "text-[var(--color-error)]",
  };
  return <span className={colors[status] ?? "text-[var(--color-text-muted)]"}>{status}</span>;
}

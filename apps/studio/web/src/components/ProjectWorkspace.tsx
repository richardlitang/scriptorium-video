import { useState } from "react";
import { StoryComposer } from "./StoryComposer";

interface Props {
  projectId: string;
}

export function ProjectWorkspace({ projectId }: Props) {
  // Shared plan state flows through here; Slice 4 will add the plan editor.
  const [planJson, setPlanJson] = useState("");

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel: story composer */}
      <section className="w-[420px] min-w-[320px] overflow-y-auto border-r border-[var(--color-border)]">
        <SectionHeader>Story</SectionHeader>
        <StoryComposer
          projectId={projectId}
          currentPlanJson={planJson}
          onPlanChange={setPlanJson}
        />
      </section>

      {/* Right panel: plan editor + output (Slices 4–10 fill this) */}
      <section className="flex-1 overflow-y-auto">
        <SectionHeader>Plan</SectionHeader>
        {planJson ? (
          <pre className="p-4 text-xs font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-words">
            {planJson}
          </pre>
        ) : (
          <div className="p-4 text-xs text-[var(--color-text-muted)]">
            Convert or generate a plan to see it here.
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

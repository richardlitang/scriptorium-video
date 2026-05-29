import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StoryComposer } from "./StoryComposer";
import { PlanEditor } from "./PlanEditor";
import { ProjectOutput } from "./ProjectOutput";
import { useProjectDetails } from "@/queries/project-details";
import { projectKeys } from "@/queries/projects";
import { plannerKeys } from "@/queries/planner";

interface Props {
  projectId: string;
}

interface WorkflowFlags {
  hasUnsavedPlan: boolean;
  needsPrepareDraft: boolean;
  needsRender: boolean;
}

export function ProjectWorkspace({ projectId }: Props) {
  const qc = useQueryClient();
  const { data: details, isLoading } = useProjectDetails(projectId);

  const [planJson, setPlanJson] = useState("");
  const [qualityLog, setQualityLog] = useState<string[]>([]);
  const [flags, setFlags] = useState<WorkflowFlags>({
    hasUnsavedPlan: false,
    needsPrepareDraft: false,
    needsRender: false,
  });

  // Reset state when project changes
  useEffect(() => {
    setPlanJson("");
    setQualityLog([]);
    setFlags({ hasUnsavedPlan: false, needsPrepareDraft: false, needsRender: false });
  }, [projectId]);

  // Seed planJson from server response on load / refresh
  useEffect(() => {
    if (details?.plan && !flags.hasUnsavedPlan) {
      setPlanJson(JSON.stringify(details.plan, null, 2));
    }
  }, [details]); // eslint-disable-line react-hooks/exhaustive-deps

  function markPlanDirty() {
    setFlags({ hasUnsavedPlan: true, needsPrepareDraft: true, needsRender: true });
  }

  function markPlanSaved() {
    setFlags({ hasUnsavedPlan: false, needsPrepareDraft: true, needsRender: true });
    appendQualityLog("Plan saved.");
    // Refresh details so timeline/runState update
    qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    qc.invalidateQueries({ queryKey: projectKeys.qualityHistory(projectId) });
    qc.invalidateQueries({ queryKey: projectKeys.renders(projectId) });
    qc.invalidateQueries({ queryKey: plannerKeys.plan(projectId) });
  }

  function appendQualityLog(msg: string) {
    setQualityLog((prev) => [...prev, msg]);
  }

  function handlePlanChange(json: string) {
    setPlanJson(json);
    markPlanDirty();
  }

  if (isLoading && !planJson) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
        Loading project…
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left column: story composer */}
      <section className="w-[380px] min-w-[280px] overflow-y-auto border-r border-[var(--color-border)] shrink-0">
        <SectionHeader>Story</SectionHeader>
        <StoryComposer
          projectId={projectId}
          currentPlanJson={planJson}
          onPlanChange={handlePlanChange}
        />
      </section>

      {/* Middle column: plan editor */}
      <section className="w-[420px] min-w-[280px] overflow-y-auto border-r border-[var(--color-border)] shrink-0 flex flex-col">
        <SectionHeader>Plan</SectionHeader>
        <PlanEditor
          projectId={projectId}
          planJson={planJson}
          onChange={handlePlanChange}
          workflowFlags={flags}
          onSaved={markPlanSaved}
          qualityLog={qualityLog}
        />
      </section>

      {/* Right column: output panels */}
      <section className="flex-1 overflow-hidden flex flex-col min-w-[240px]">
        <SectionHeader>Output</SectionHeader>
        <ProjectOutput
          projectId={projectId}
          timeline={details?.timeline ?? null}
          captionCount={details?.captionCount ?? 0}
          runState={details?.runState ?? null}
          needsRender={flags.needsRender}
        />
      </section>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0">
      {children}
    </div>
  );
}

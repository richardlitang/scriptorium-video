import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StoryComposer } from "./StoryComposer";
import { PlanEditor } from "./PlanEditor";
import { ProjectOutput } from "./ProjectOutput";
import { DraftJobBanner } from "./DraftJobBanner";
import { DraftControls } from "./DraftControls";
import { useProjectDetails } from "@/queries/project-details";
import { projectKeys } from "@/queries/projects";
import { plannerKeys } from "@/queries/planner";
import { readStored } from "@/lib/project-storage";

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

  // Story/direction state — lifted so DraftControls can read them
  const [story, setStory] = useState(() => readStored(projectId, "story"));
  const [feel, setFeel] = useState(() => readStored(projectId, "feel", ""));
  const [pacing, setPacing] = useState(() => readStored(projectId, "pacing", ""));
  const [visualStyle, setVisualStyle] = useState(() => readStored(projectId, "visualStyle", ""));
  const [systemPrompt, setSystemPrompt] = useState(() => readStored(projectId, "systemPrompt"));
  const [userPromptTemplate, setUserPromptTemplate] = useState(
    () => readStored(projectId, "userPromptTemplate"),
  );

  // Reset all per-project state when project changes
  useEffect(() => {
    setPlanJson("");
    setQualityLog([]);
    setFlags({ hasUnsavedPlan: false, needsPrepareDraft: false, needsRender: false });
    setStory(readStored(projectId, "story"));
    setFeel(readStored(projectId, "feel", ""));
    setPacing(readStored(projectId, "pacing", ""));
    setVisualStyle(readStored(projectId, "visualStyle", ""));
    setSystemPrompt(readStored(projectId, "systemPrompt"));
    setUserPromptTemplate(readStored(projectId, "userPromptTemplate"));
  }, [projectId]);

  // Seed planJson from server on load (don't overwrite dirty edits)
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

  const handleDraftQueued = useCallback(() => {
    setFlags({ hasUnsavedPlan: false, needsPrepareDraft: false, needsRender: true });
    appendQualityLog("Draft job queued. Studio will keep processing while the server is running.");
  }, []);

  const handleJobFinished = useCallback(() => {
    setFlags((prev) => ({ ...prev, needsRender: true }));
    qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    qc.invalidateQueries({ queryKey: projectKeys.renders(projectId) });
  }, [projectId, qc]);

  if (isLoading && !planJson) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
        Loading project…
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Draft job banner — spans full width */}
      <DraftJobBanner projectId={projectId} onJobFinished={handleJobFinished} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left column: story + draft controls */}
        <section className="w-[380px] min-w-[280px] overflow-y-auto border-r border-[var(--color-border)] shrink-0">
          <SectionHeader>Story</SectionHeader>
          <StoryComposer
            projectId={projectId}
            currentPlanJson={planJson}
            onPlanChange={handlePlanChange}
            story={story}
            feel={feel}
            pacing={pacing}
            visualStyle={visualStyle}
            systemPrompt={systemPrompt}
            userPromptTemplate={userPromptTemplate}
            onStoryChange={setStory}
            onFeelChange={setFeel}
            onPacingChange={setPacing}
            onVisualStyleChange={setVisualStyle}
            onSystemPromptChange={setSystemPrompt}
            onUserPromptTemplateChange={setUserPromptTemplate}
          />
          <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3">
            <DraftControls
              projectId={projectId}
              story={story}
              planJson={planJson}
              feel={feel}
              pacing={pacing}
              visualStyle={visualStyle}
              systemPrompt={systemPrompt}
              userPromptTemplate={userPromptTemplate}
              onDraftQueued={handleDraftQueued}
              onError={(msg) => appendQualityLog(msg)}
            />
          </div>
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
            onLog={appendQualityLog}
            planJson={planJson}
            onPlanChange={handlePlanChange}
          />
        </section>
      </div>
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

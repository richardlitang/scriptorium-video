import { useState, useMemo, useCallback } from "react";
import { useAssets } from "@/queries/assets";
import { useProjectDetails } from "@/queries/project-details";
import { readStored, writeStored } from "@/lib/project-storage";
import { BeatInspector } from "./BeatInspector";
import { BeatTimeline } from "./BeatTimeline";
import { findBeatInPlan } from "./beat-workspace-helpers";
import type { Plan } from "./beat-workspace-types";

interface Props {
  projectId: string;
  planJson: string;
  onPlanChange: (json: string) => void;
}

export function BeatWorkspace({ projectId, planJson, onPlanChange }: Props) {
  const { data: assets = [] } = useAssets(projectId);
  const { data: details } = useProjectDetails(projectId);
  const timeline = details?.timeline ?? null;
  const runState = details?.runState ?? null;

  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(
    () => readStored(projectId, "selectedBeatId") || null,
  );
  const [selectedBeatIds, setSelectedBeatIds] = useState<Set<string>>(new Set());

  const plan = useMemo((): Plan => {
    try {
      return planJson ? JSON.parse(planJson) : { sections: [] };
    } catch {
      return { sections: [] };
    }
  }, [planJson]);

  const mutatePlan = useCallback(
    (updater: (p: Plan) => void) => {
      const clone = JSON.parse(JSON.stringify(plan)) as Plan;
      updater(clone);
      onPlanChange(JSON.stringify(clone, null, 2));
    },
    [plan, onPlanChange],
  );

  function selectBeat(beatId: string) {
    setSelectedBeatId(beatId);
    writeStored(projectId, "selectedBeatId", beatId);
  }

  const hasStaleRender = Boolean(
    runState?.lastRenderPlanHash &&
    (runState.lastRenderPlanHash !== runState.currentPlanHash ||
      runState.lastRenderTimelineHash !== runState.currentTimelineHash),
  );

  const selected = findBeatInPlan(plan, selectedBeatId);

  if (!plan.sections?.length) {
    return (
      <div className="p-4 text-xs text-[var(--color-text-muted)]">
        Convert or generate a plan to see beat timeline.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BeatTimeline
        plan={plan}
        assets={assets}
        timeline={timeline}
        selectedBeatId={selectedBeatId}
        selectedBeatIds={selectedBeatIds}
        hasStaleRender={hasStaleRender}
        onSelectBeat={selectBeat}
        onSelectedBeatIdsChange={setSelectedBeatIds}
      />

      <div className="flex-1 overflow-y-auto p-3">
        {selected ? (
          <BeatInspector
            beat={selected.beat}
            section={selected.section}
            plan={plan}
            assets={assets}
            timeline={timeline}
            selectedBeatIds={selectedBeatIds}
            projectId={projectId}
            imageQuality={readStored(projectId, "imageQuality", "low")}
            mutatePlan={mutatePlan}
          />
        ) : (
          <div className="text-xs text-[var(--color-text-muted)]">Select a beat to inspect.</div>
        )}
      </div>
    </div>
  );
}

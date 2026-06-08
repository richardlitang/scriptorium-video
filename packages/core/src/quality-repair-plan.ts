import type { QualityFinding, QualityReport } from "./schemas/quality-report.schema.js";

export type QualityRepairActionKind =
  | "generate_tts"
  | "resolve_media"
  | "rewrite_narration"
  | "adjust_voice_direction"
  | "adjust_editorial";

export type QualityRepairAction = {
  kind: QualityRepairActionKind;
  severity: QualityFinding["severity"];
  reason: string;
  path?: string;
  sectionId?: string;
  beatId?: string;
  data?: Record<string, unknown>;
};

export type QualityRepairPlanStatus = "no_repair_needed" | "needs_repair" | "blocked";

export type QualityRepairPlan = {
  status: QualityRepairPlanStatus;
  actions: QualityRepairAction[];
  blockedFindings: QualityFinding[];
};

const REPAIR_ACTION_BY_FINDING_ID: Record<string, QualityRepairActionKind> = {
  "shared.beat.voice": "generate_tts",
  "shared.beat.media": "resolve_media",
  "shared.narration.production_directive": "rewrite_narration",
  "shared.voice.duration_outlier": "generate_tts",
  "shared.voice.pause_budget": "adjust_voice_direction",
  "shared.voice.intensity_jump": "adjust_voice_direction",
  "shared.editorial.visual_cue_density": "adjust_editorial",
  "shared.editorial.silence_overlap": "adjust_editorial",
  "shared.editorial.silence_overuse": "adjust_editorial",
};

function repairActionForFinding(finding: QualityFinding): QualityRepairAction | undefined {
  if (finding.severity === "info") return undefined;
  const kind = REPAIR_ACTION_BY_FINDING_ID[finding.id];
  if (!kind) return undefined;
  const action: QualityRepairAction = {
    kind,
    severity: finding.severity,
    reason: finding.message,
  };
  if (finding.path !== undefined) action.path = finding.path;
  if (finding.sectionId !== undefined) action.sectionId = finding.sectionId;
  if (finding.beatId !== undefined) action.beatId = finding.beatId;
  if (finding.data !== undefined) action.data = finding.data;
  return action;
}

function actionKey(action: QualityRepairAction): string {
  return [action.kind, action.sectionId ?? "", action.beatId ?? "", action.path ?? ""].join(":");
}

export function buildQualityRepairPlan(report: QualityReport): QualityRepairPlan {
  const actions: QualityRepairAction[] = [];
  const seenActions = new Set<string>();
  const blockedFindings: QualityFinding[] = [];

  for (const finding of report.checks) {
    const action = repairActionForFinding(finding);
    if (action) {
      const key = actionKey(action);
      if (!seenActions.has(key)) {
        seenActions.add(key);
        actions.push(action);
      }
      continue;
    }
    if (finding.severity === "error") {
      blockedFindings.push(finding);
    }
  }

  if (blockedFindings.length > 0) {
    return { status: "blocked", actions, blockedFindings };
  }
  if (actions.length > 0) {
    return { status: "needs_repair", actions, blockedFindings };
  }
  return { status: "no_repair_needed", actions, blockedFindings };
}

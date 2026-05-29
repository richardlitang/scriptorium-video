import { useState, useEffect, useCallback } from "react";
import { usePlannerDefaults, usePlanFromStory } from "@/queries/planner";
import { readStored, writeStored } from "@/lib/project-storage";
import { buildPlanFromStory, buildStoryFeedback, type FeedbackItem } from "@/lib/story-parser";
import { currentStoryDirection } from "@/lib/story-ui-state";
import { useTtsHealth } from "@/queries/tts";
import { ttsAvailabilityFromHealth } from "@/lib/tts-ui-state";

const FEEL_DEFAULT = "eerie animated suspense with emotional intensity";
const PACING_DEFAULT = "measured slow-burn with sharp turns";
const VISUAL_STYLE_DEFAULT = "stylized animated cinematic frames, explicitly non-photorealistic";

interface Props {
  projectId: string;
  onPlanChange: (planJson: string) => void;
  currentPlanJson: string;
}

export function StoryComposer({ projectId, onPlanChange, currentPlanJson }: Props) {
  const { data: plannerDefaults } = usePlannerDefaults();
  const { data: healthState } = useTtsHealth();
  const ttsAvailability = ttsAvailabilityFromHealth(healthState ?? {});
  const ttsReady = ttsAvailability === "ready" || ttsAvailability === "ready_degraded";

  const [story, setStory] = useState(() => readStored(projectId, "story"));
  const [feel, setFeel] = useState(() => readStored(projectId, "feel", FEEL_DEFAULT));
  const [pacing, setPacing] = useState(() => readStored(projectId, "pacing", PACING_DEFAULT));
  const [visualStyle, setVisualStyle] = useState(
    () => readStored(projectId, "visualStyle", VISUAL_STYLE_DEFAULT),
  );
  const [systemPrompt, setSystemPrompt] = useState(() => readStored(projectId, "systemPrompt"));
  const [userPromptTemplate, setUserPromptTemplate] = useState(
    () => readStored(projectId, "userPromptTemplate"),
  );
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const planFromStory = usePlanFromStory(projectId);

  // Restore per-project state when projectId changes
  useEffect(() => {
    setStory(readStored(projectId, "story"));
    setFeel(readStored(projectId, "feel", FEEL_DEFAULT));
    setPacing(readStored(projectId, "pacing", PACING_DEFAULT));
    setVisualStyle(readStored(projectId, "visualStyle", VISUAL_STYLE_DEFAULT));
    setSystemPrompt(readStored(projectId, "systemPrompt"));
    setUserPromptTemplate(readStored(projectId, "userPromptTemplate"));
    setFeedback([]);
  }, [projectId]);

  // Seed prompt fields from server defaults when they arrive (only when empty)
  useEffect(() => {
    if (!plannerDefaults) return;
    if (!systemPrompt && plannerDefaults.systemPrompt)
      setSystemPrompt(plannerDefaults.systemPrompt);
    if (!userPromptTemplate && plannerDefaults.userPromptTemplate)
      setUserPromptTemplate(plannerDefaults.userPromptTemplate);
  }, [plannerDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(
    (updates: Partial<{ story: string; feel: string; pacing: string; visualStyle: string; systemPrompt: string; userPromptTemplate: string }>) => {
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) writeStored(projectId, key, value);
      }
    },
    [projectId],
  );

  function handleConvertStory() {
    if (!story.trim()) return;
    try {
      const currentPlan = currentPlanJson ? JSON.parse(currentPlanJson) : {};
      const nextPlan = buildPlanFromStory(story, currentPlan);
      const nextPlanJson = JSON.stringify(nextPlan, null, 2);
      onPlanChange(nextPlanJson);
      setFeedback(buildStoryFeedback(story, nextPlan as { sections: { beats: unknown[] }[] }));
    } catch (err) {
      setFeedback([{ level: "error", text: String(err) }]);
    }
  }

  async function handleAiPlan() {
    if (!story.trim() || !projectId) return;
    const direction = currentStoryDirection({ feel, pacing, visualStyle });
    try {
      const result = await planFromStory.mutateAsync({
        story,
        feel: direction.feel,
        pacing: direction.pacing,
        visualStyle: direction.visualStyle,
        systemPrompt,
        userPromptTemplate,
        format: "long_documentary",
      });
      const data = (result as unknown as { data?: { plan?: unknown; model?: string; warnings?: string[] } }).data;
      if (data?.plan) {
        onPlanChange(JSON.stringify(data.plan, null, 2));
        const sections = (data.plan as { sections?: { beats?: unknown[] }[] }).sections ?? [];
        const beatCount = sections.reduce((t, s) => t + (s.beats?.length ?? 0), 0);
        setFeedback([
          { level: "info", text: `AI generated ${sections.length} section(s) and ${beatCount} beat(s) using ${data.model ?? "AI"}.` },
          ...(data.warnings ?? []).map((w): FeedbackItem => ({ level: "warning", text: w })),
          { level: "step", text: "Next: Save Plan, optionally Generate Images, then Regenerate Audio, then Render Draft." },
        ]);
      }
    } catch (err) {
      setFeedback([{ level: "error", text: String(err) }]);
    }
  }

  const hasStory = story.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Story textarea */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
          Story Script
        </label>
        <textarea
          value={story}
          onChange={(e) => {
            setStory(e.target.value);
            persist({ story: e.target.value });
          }}
          placeholder={"TITLE: My Story\n\n[0:00] THE HOOK\nYour narration here...\n[0:30] THE RISE\n..."}
          rows={12}
          className="w-full bg-[var(--color-surface-overlay)] border border-[var(--color-border)] rounded px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] resize-y focus:outline-none focus:border-[var(--color-accent)] font-mono"
        />
      </div>

      {/* Direction controls */}
      <div className="grid grid-cols-1 gap-2">
        <Field label="Feel">
          <input
            value={feel}
            onChange={(e) => { setFeel(e.target.value); persist({ feel: e.target.value }); }}
            className={inputCls}
          />
        </Field>
        <Field label="Pacing">
          <input
            value={pacing}
            onChange={(e) => { setPacing(e.target.value); persist({ pacing: e.target.value }); }}
            className={inputCls}
          />
        </Field>
        <Field label="Visual Style">
          <input
            value={visualStyle}
            onChange={(e) => { setVisualStyle(e.target.value); persist({ visualStyle: e.target.value }); }}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Advanced prompts (collapsed by default) */}
      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          {showAdvanced ? "▲ Hide" : "▼ Show"} advanced prompts
        </button>
        {showAdvanced && (
          <div className="mt-2 flex flex-col gap-2">
            <Field label="System Prompt">
              <textarea
                value={systemPrompt}
                onChange={(e) => { setSystemPrompt(e.target.value); persist({ systemPrompt: e.target.value }); }}
                rows={4}
                className={`${inputCls} resize-y`}
              />
            </Field>
            <Field label="User Prompt Template">
              <textarea
                value={userPromptTemplate}
                onChange={(e) => { setUserPromptTemplate(e.target.value); persist({ userPromptTemplate: e.target.value }); }}
                rows={4}
                className={`${inputCls} resize-y`}
              />
            </Field>
            <button
              onClick={() => {
                const sys = plannerDefaults?.systemPrompt ?? "";
                const upt = plannerDefaults?.userPromptTemplate ?? "";
                setSystemPrompt(sys);
                setUserPromptTemplate(upt);
                persist({ systemPrompt: sys, userPromptTemplate: upt });
              }}
              className="self-start text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] rounded px-2 py-1 transition-colors"
            >
              Reset to defaults
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleConvertStory}
          disabled={!hasStory || !currentPlanJson}
          className={btnCls("primary")}
          title="Parse story sections into a video plan (local, no AI)"
        >
          Convert Story
        </button>
        <button
          onClick={handleAiPlan}
          disabled={!hasStory || !ttsReady || planFromStory.isPending}
          className={btnCls("accent")}
          title="Generate a structured video plan using AI"
        >
          {planFromStory.isPending ? "Generating…" : "Generate Plan with AI"}
        </button>
        <button
          onClick={() => {
            setStory("");
            persist({ story: "" });
          }}
          disabled={!hasStory}
          className={btnCls("ghost")}
        >
          Clear
        </button>
      </div>

      {/* Feedback */}
      {feedback.length > 0 && <FeedbackPanel items={feedback} />}
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--color-surface-overlay)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]";

function btnCls(variant: "primary" | "accent" | "ghost") {
  const base = "px-3 py-1.5 text-xs rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  if (variant === "primary")
    return `${base} bg-[var(--color-surface-overlay)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]`;
  if (variant === "accent")
    return `${base} bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]`;
  return `${base} text-[var(--color-text-muted)] hover:text-[var(--color-text)]`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
      {children}
    </div>
  );
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-[var(--color-text-muted)] border-[var(--color-border)]",
  warning: "text-[var(--color-warning)] border-[var(--color-warning)]/30",
  step: "text-[var(--color-accent)] border-[var(--color-accent)]/30",
  error: "text-[var(--color-error)] border-[var(--color-error)]/30",
};

function FeedbackPanel({ items }: { items: FeedbackItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => (
        <div
          key={i}
          className={`text-xs px-2 py-1 rounded border-l-2 bg-[var(--color-surface-overlay)] ${LEVEL_COLORS[item.level] ?? LEVEL_COLORS["info"]}`}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}

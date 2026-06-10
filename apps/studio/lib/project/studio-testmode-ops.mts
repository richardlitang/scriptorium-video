import { canonicalizePlanForPersistence } from "../planner/canonicalize-plan.mjs";

type PathApi = {
  dirname: (path: string) => string;
  join: (...parts: string[]) => string;
};

type SafeReadJson = <T>(filePath: string) => Promise<T>;

type TestModeDeps = {
  path: PathApi;
  mkdir: (dirPath: string, options: { recursive: true }) => Promise<void>;
  writeFile: (filePath: string, content: string, encoding: string) => Promise<void>;
  safeReadJson: SafeReadJson;
  projectsDir: string;
  sha256: (value: string) => string;
};

type TestCommandResult = { stdout: string; stderr: string };

type TestPlanBeat = {
  id: string;
  order: number;
  narration: string;
  timing?: { mediaPolicy?: string; estimatedDurationSeconds?: number; locked?: boolean };
};

type TestPlanSection = {
  id: string;
  title: string;
  beats?: TestPlanBeat[];
};

type TestPlan = {
  schemaVersion: number;
  title: string;
  mode: string;
  targetPlatform: string;
  stylePackId: string;
  providers: Record<string, string>;
  voice: Record<string, unknown>;
  sections?: TestPlanSection[];
};

type TestManifest = {
  schemaVersion: number;
  assets: Array<{ id: string; [key: string]: unknown }>;
};

type TestTimeline = {
  durationSeconds: number;
  segments?: Array<{
    sectionId: string;
    beatId: string;
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
  }>;
  [key: string]: unknown;
};

export function createStudioTestModeOps({
  path,
  mkdir,
  writeFile,
  safeReadJson,
  projectsDir,
  sha256,
}: TestModeDeps) {
  return async function runLvstudioTestMode(args: string[]): Promise<TestCommandResult> {
    const command = args[0];
    const projectId = args[1];
    if (!projectId && command !== "create") return { stdout: "ok", stderr: "" };
    const projectDir = projectId ? path.join(projectsDir, projectId) : "";
    const now = new Date().toISOString();

    if (command === "create") {
      const mode = args[3] || "long_documentary";
      const plan: TestPlan = {
        schemaVersion: 1,
        title: String(projectId),
        mode,
        targetPlatform: "local_only",
        stylePackId: "default",
        providers: {
          llm: "manual",
          tts: "chatterbox",
          transcription: "mock",
          media: "manual-media",
          renderer: "remotion",
        },
        voice: {
          provider: "chatterbox",
          voiceId: "clone",
          format: "wav",
          options: { speed: 0.92 },
        },
        sections: [
          {
            id: "intro",
            title: "Intro",
            beats: [
              {
                id: "intro-001",
                order: 1,
                narration: "Test narration.",
                timing: { mediaPolicy: "loop_or_freeze", locked: false },
              },
            ],
          },
        ],
      };
      await mkdir(projectDir, { recursive: true });
      await mkdir(path.join(projectDir, "captions"), { recursive: true });
      await mkdir(path.join(projectDir, "assets", "audio", "voice"), { recursive: true });
      await mkdir(path.join(projectDir, "renders"), { recursive: true });
      await writeFile(
        path.join(projectDir, "project.json"),
        `${JSON.stringify({ schemaVersion: 1, id: projectId, title: projectId, createdAt: now, updatedAt: now, status: "draft" }, null, 2)}\n`,
        "utf8",
      );
      const canonicalPlan = canonicalizePlanForPersistence(plan as Record<string, unknown>);
      await writeFile(
        path.join(projectDir, "video-plan.json"),
        `${JSON.stringify(canonicalPlan, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        path.join(projectDir, "asset-manifest.json"),
        `${JSON.stringify({ schemaVersion: 1, assets: [] }, null, 2)}\n`,
        "utf8",
      );
      return { stdout: "created", stderr: "" };
    }

    if (command === "sync") {
      const plan = await safeReadJson<TestPlan>(path.join(projectDir, "video-plan.json"));
      const segments: Array<Record<string, unknown>> = [];
      let cursor = 0;
      for (const section of plan.sections ?? []) {
        for (const beat of section.beats ?? []) {
          const durationSeconds = beat.timing?.estimatedDurationSeconds || 3;
          segments.push({
            sectionId: section.id,
            beatId: beat.id,
            startSeconds: cursor,
            endSeconds: cursor + durationSeconds,
            durationSeconds,
            voiceAssetId: `voice-${beat.id}`,
            mediaAssetIds: [],
            audioCues: [],
            renderPolicy: {
              mediaPolicy: beat.timing?.mediaPolicy || "loop_or_freeze",
              scaleMode: "safe_cover",
              subjectPosition: "center",
              cropRisk: "medium",
            },
          });
          cursor += durationSeconds;
        }
      }
      const isShorts = plan.mode === "short_story";
      const timeline = {
        schemaVersion: 1,
        generatedAt: now,
        sourcePlanHash: sha256(JSON.stringify(plan)),
        fps: 30,
        width: isShorts ? 1080 : 1920,
        height: isShorts ? 1920 : 1080,
        durationSeconds: Math.max(1, cursor),
        segments,
      };
      await writeFile(
        path.join(projectDir, "timeline.json"),
        `${JSON.stringify(timeline, null, 2)}\n`,
        "utf8",
      );
      return { stdout: "synced", stderr: "" };
    }

    if (command === "generate:tts") {
      const plan = await safeReadJson<TestPlan>(path.join(projectDir, "video-plan.json"));
      const manifestPath = path.join(projectDir, "asset-manifest.json");
      const manifest = await safeReadJson<TestManifest>(manifestPath).catch(() => ({
        schemaVersion: 1,
        assets: [],
      }));
      for (const section of plan.sections ?? []) {
        for (const beat of section.beats ?? []) {
          const rel = path.join("assets", "audio", "voice", `${beat.id}.wav`);
          await mkdir(path.dirname(path.join(projectDir, rel)), { recursive: true });
          await writeFile(path.join(projectDir, rel), "stub", "utf8");
          manifest.assets = (manifest.assets || []).filter(
            (asset) => asset.id !== `voice-${beat.id}`,
          );
          manifest.assets.push({
            id: `voice-${beat.id}`,
            type: "audio",
            role: "voiceover",
            sectionId: section.id,
            beatId: beat.id,
            path: rel,
            source: { kind: "generated", provider: "test", inputHash: "test" },
            durationSeconds: beat.timing?.estimatedDurationSeconds || 3,
            status: "generated",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      return { stdout: "tts", stderr: "" };
    }

    if (command === "transcribe") {
      const timeline = await safeReadJson<TestTimeline>(path.join(projectDir, "timeline.json"));
      const words: Array<Record<string, unknown>> = [];
      const segments: Array<Record<string, unknown>> = [];
      for (const segment of timeline.segments ?? []) {
        const text = "test line";
        const startSeconds = Number(segment.startSeconds ?? 0);
        const endSeconds = Number(segment.endSeconds ?? startSeconds + 1);
        segments.push({ startSeconds, endSeconds, text });
        words.push({
          word: "test",
          startSeconds,
          endSeconds: startSeconds + 0.5,
          confidence: 1,
        });
        words.push({
          word: "line",
          startSeconds: startSeconds + 0.5,
          endSeconds: startSeconds + 1,
          confidence: 1,
        });
      }
      const transcript = {
        schemaVersion: 1,
        status: "generated",
        source: { provider: "mock", audioAssetIds: [] },
        text: "test line",
        durationSeconds: timeline.durationSeconds,
        segments,
        words,
      };
      await mkdir(path.join(projectDir, "captions"), { recursive: true });
      await writeFile(
        path.join(projectDir, "captions", "transcript.json"),
        `${JSON.stringify(transcript, null, 2)}\n`,
        "utf8",
      );
      return { stdout: "transcribed", stderr: "" };
    }

    if (command === "captions") {
      const timeline = await safeReadJson<TestTimeline>(path.join(projectDir, "timeline.json"));
      const captions = (timeline.segments || []).map((segment, index) => ({
        id: `caption-${index + 1}`,
        beatId: segment.beatId,
        startSeconds: Number(segment.startSeconds ?? 0),
        endSeconds: Math.min(
          Number(segment.endSeconds ?? Number(segment.startSeconds ?? 0) + 1.5),
          Number(segment.startSeconds ?? 0) + 1.5,
        ),
        text: "test line",
        style: "default",
        words: [],
      }));
      await writeFile(
        path.join(projectDir, "captions", "captions.json"),
        `${JSON.stringify({ schemaVersion: 1, status: "generated", source: { transcriptionProvider: "mock", audioAssetIds: [] }, captions }, null, 2)}\n`,
        "utf8",
      );
      return { stdout: "captions", stderr: "" };
    }

    if (command === "render") {
      await mkdir(path.join(projectDir, "renders"), { recursive: true });
      await writeFile(path.join(projectDir, "renders", "draft.mp4"), "stub", "utf8");
      return { stdout: "rendered", stderr: "" };
    }

    if (command === "check") return { stdout: '{"status":"pass","checks":[]}', stderr: "" };
    if (command === "review") {
      return {
        stdout: '{"issues":[],"summary":{"critical":0,"warning":0,"suggestion":0}}',
        stderr: "",
      };
    }
    if (command === "direct:voice") return { stdout: "{}", stderr: "" };
    return { stdout: "ok", stderr: "" };
  };
}

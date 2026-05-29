import { canonicalizePlanForPersistence } from "../planner/canonicalize-plan.mjs";

export function createStudioTestModeOps({
  path,
  mkdir,
  writeFile,
  safeReadJson,
  projectsDir,
  sha256,
}) {
  return async function runLvstudioTestMode(args) {
    const command = args[0];
    const projectId = args[1];
    if (!projectId && command !== "create") return { stdout: "ok", stderr: "" };
    const projectDir = projectId ? path.join(projectsDir, projectId) : null;
    const now = new Date().toISOString();

    if (command === "create") {
      const mode = args[3] || "long_documentary";
      const plan = {
        schemaVersion: 1,
        title: projectId,
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
                media: [],
                motion: { type: "none", intensity: 0 },
                caption: { emphasis: [], style: "default" },
                sfxCues: [],
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
      const canonicalPlan = canonicalizePlanForPersistence(plan);
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
      const plan = await safeReadJson(path.join(projectDir, "video-plan.json"));
      const segments = [];
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
      const plan = await safeReadJson(path.join(projectDir, "video-plan.json"));
      const manifestPath = path.join(projectDir, "asset-manifest.json");
      const manifest = await safeReadJson(manifestPath).catch(() => ({
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
      const timeline = await safeReadJson(path.join(projectDir, "timeline.json"));
      const words = [];
      const segments = [];
      for (const segment of timeline.segments ?? []) {
        const text = "test line";
        segments.push({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, text });
        words.push({
          word: "test",
          startSeconds: segment.startSeconds,
          endSeconds: segment.startSeconds + 0.5,
          confidence: 1,
        });
        words.push({
          word: "line",
          startSeconds: segment.startSeconds + 0.5,
          endSeconds: segment.startSeconds + 1,
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
      const timeline = await safeReadJson(path.join(projectDir, "timeline.json"));
      const captions = (timeline.segments || []).map((segment, index) => ({
        id: `caption-${index + 1}`,
        beatId: segment.beatId,
        startSeconds: segment.startSeconds,
        endSeconds: Math.min(segment.endSeconds, segment.startSeconds + 1.5),
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
    if (command === "review")
      return {
        stdout: '{"issues":[],"summary":{"critical":0,"warning":0,"suggestion":0}}',
        stderr: "",
      };
    if (command === "direct:voice") return { stdout: "{}", stderr: "" };
    return { stdout: "ok", stderr: "" };
  };
}

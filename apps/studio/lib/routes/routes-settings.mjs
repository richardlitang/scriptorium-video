import { requireRouteContext } from "./route-context.mjs";

export const SETTINGS_ROUTE_KEYS = [
  "sendJson",
  "parseJsonBody",
  "parseBinaryBody",
  "readVoiceSettings",
  "writeVoiceSettings",
  "readTtsHealth",
  "previewVoice",
  "safeVoiceReferenceFileName",
  "voiceReferencesDir",
  "mkdir",
  "path",
  "writeFile",
  "DEFAULT_PLANNER_SYSTEM_PROMPT",
  "DEFAULT_PLANNER_USER_PROMPT_TEMPLATE",
];

export async function handleSettingsRoutes(context, req, res, pathname, requestUrl) {
  requireRouteContext(context, "settings routes", SETTINGS_ROUTE_KEYS);
  const {
    sendJson,
    parseJsonBody,
    parseBinaryBody,
    readVoiceSettings,
    writeVoiceSettings,
    readTtsHealth,
    previewVoice,
    safeVoiceReferenceFileName,
    voiceReferencesDir,
    mkdir,
    path,
    writeFile,
    DEFAULT_PLANNER_SYSTEM_PROMPT,
    DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
  } = context;

  if (pathname === "/api/settings/voice" && req.method === "GET") {
    sendJson(res, 200, { ok: true, data: await readVoiceSettings() });
    return true;
  }

  if (pathname === "/api/planner-defaults" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      data: {
        systemPrompt: DEFAULT_PLANNER_SYSTEM_PROMPT,
        userPromptTemplate: DEFAULT_PLANNER_USER_PROMPT_TEMPLATE,
      },
    });
    return true;
  }

  if (pathname === "/api/settings/voice" && req.method === "PUT") {
    const body = await parseJsonBody(req);
    sendJson(res, 200, {
      ok: true,
      message: "Voice settings saved.",
      data: await writeVoiceSettings(body),
    });
    return true;
  }

  if (pathname === "/api/tts/health" && req.method === "GET") {
    const data = await readTtsHealth();
    sendJson(res, 200, { ok: true, data });
    return true;
  }

  if (pathname === "/api/settings/voice/preview" && req.method === "POST") {
    const body = await parseJsonBody(req);
    const audioBytes = await previewVoice(body.settings ?? {}, body.text ?? "");
    res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-store" });
    res.end(audioBytes);
    return true;
  }

  if (pathname === "/api/settings/voice/reference" && req.method === "PUT") {
    const nestedRequestUrl = new URL(req.url ?? "/", requestUrl);
    const fileName = safeVoiceReferenceFileName(
      nestedRequestUrl.searchParams.get("filename") ?? "reference.wav",
    );
    const data = await parseBinaryBody(req);
    await mkdir(voiceReferencesDir, { recursive: true });
    const targetPath = path.resolve(voiceReferencesDir, fileName);
    await writeFile(targetPath, data);
    sendJson(res, 200, { ok: true, data: { path: targetPath } });
    return true;
  }

  return false;
}

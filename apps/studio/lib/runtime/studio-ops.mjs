export function createStudioOps({ path, mkdir, appendFile, qualityHistoryDir }) {
  async function appendQualityHistory(projectId, entry) {
    await mkdir(qualityHistoryDir, { recursive: true });
    const logPath = path.join(qualityHistoryDir, `${projectId}.ndjson`);
    await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  return {
    appendQualityHistory,
  };
}

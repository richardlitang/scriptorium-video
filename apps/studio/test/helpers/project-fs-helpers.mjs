export function createInMemoryProjectFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const restored = [];

  return {
    files,
    restored,
    async readFile(filePath) {
      if (!files.has(filePath)) throw new Error(`missing: ${filePath}`);
      return files.get(filePath);
    },
    async writeFile(filePath, content) {
      files.set(filePath, content);
    },
    async readOptionalFile(filePath) {
      return files.get(filePath) ?? null;
    },
    async restoreOptionalFile(filePath, content) {
      restored.push([filePath, content]);
      if (content === null) files.delete(filePath);
      else files.set(filePath, content);
    },
  };
}

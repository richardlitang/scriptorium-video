export function storageKey(projectId: string, key: string) {
  return `lvstudio:${projectId}:${key}`;
}

export function readStored(projectId: string, key: string, fallback = ""): string {
  if (!projectId) return fallback;
  try {
    return localStorage.getItem(storageKey(projectId, key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(projectId: string, key: string, value: string) {
  if (!projectId) return;
  try {
    localStorage.setItem(storageKey(projectId, key), value);
  } catch {
    // Storage quota or private-browsing restriction — silently skip.
  }
}

import "@testing-library/jest-dom";

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}

function installStorageIfMissing(name: "localStorage" | "sessionStorage") {
  const existing = globalThis[name];
  if (typeof existing?.clear === "function") return;

  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: createMemoryStorage(),
  });
}

installStorageIfMissing("localStorage");
installStorageIfMissing("sessionStorage");

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "coverage"]);
const DEFAULT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function shouldScanFile(filePath, extensions) {
  if (extensions === null) return true;
  return extensions.has(path.extname(filePath));
}

function collectFiles(targetPath, extensions, skipDirs, out) {
  const stats = statSync(targetPath);
  if (stats.isFile()) {
    if (shouldScanFile(targetPath, extensions)) out.push(targetPath);
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      collectFiles(path.join(targetPath, entry.name), extensions, skipDirs, out);
    } else if (entry.isFile()) {
      const filePath = path.join(targetPath, entry.name);
      if (shouldScanFile(filePath, extensions)) out.push(filePath);
    }
  }
}

/**
 * Pure-Node replacement for `rg -n <pattern> <paths...>`.
 * Returns matches as a newline-joined string of `relpath:lineno:text`
 * (forward-slash paths), matching ripgrep's `-n` output shape so callers
 * that previously shelled out to ripgrep can parse it identically.
 *
 * @param {RegExp|string} pattern - matched per line (string is compiled as-is)
 * @param {string[]} paths - files or directories to scan, relative to cwd
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()] - base dir for relative paths
 * @param {Set<string>|null} [options.extensions] - extensions to scan; null = all
 * @param {Set<string>} [options.skipDirs] - directory names to skip
 * @returns {string}
 */
export function grepFiles(pattern, paths, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const extensions = options.extensions === undefined ? DEFAULT_EXTENSIONS : options.extensions;
  const skipDirs = options.skipDirs ?? DEFAULT_SKIP_DIRS;
  const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

  const files = [];
  for (const target of paths) {
    collectFiles(path.resolve(cwd, target), extensions, skipDirs, files);
  }

  const matches = [];
  for (const absPath of files) {
    const relPath = path.relative(cwd, absPath).split(path.sep).join("/");
    const lines = readFileSync(absPath, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push(`${relPath}:${i + 1}:${lines[i]}`);
      }
    }
  }
  return matches.join("\n");
}

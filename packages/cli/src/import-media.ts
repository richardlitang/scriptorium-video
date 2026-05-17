import {
  importMediaToProject,
  type ImportMediaOptions
} from "@lvstudio/core";

export async function importMedia(projectId: string, filePath: string, options: ImportMediaOptions): Promise<void> {
  const result = await importMediaToProject(projectId, filePath, options);
  console.log(`Imported media as ${result.relativePath}`);
}

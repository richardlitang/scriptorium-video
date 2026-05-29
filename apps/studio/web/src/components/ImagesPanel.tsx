import { useAssets, useImageHistory, useGenerateImages } from "@/queries/assets";
import { useProjectDetails } from "@/queries/project-details";
import { currentVisualCoverageFromPlan } from "@/lib/image-coverage-stats";
import { normalizeImageCoverage, imageCoverageLabel } from "@/lib/image-coverage";
import { readStored } from "@/lib/project-storage";

interface Props {
  projectId: string;
  onLog: (msg: string) => void;
}

export function ImagesPanel({ projectId, onLog }: Props) {
  const { data: assets = [] } = useAssets(projectId);
  const { data: imageHistory = [] } = useImageHistory(projectId);
  const { data: details } = useProjectDetails(projectId);
  const generateImages = useGenerateImages(projectId);

  const imageMode = readStored(projectId, "imageMode", "missing");
  const imageBudget = normalizeImageCoverage(readStored(projectId, "imageBudget", "llm"));
  const imageQuality = readStored(projectId, "imageQuality", "low");

  const plan = details?.plan ?? {};
  const coverage = currentVisualCoverageFromPlan(plan, assets, imageBudget);
  const visualAssets = assets.filter(
    (a) => a["type"] === "image" || String(a["role"]).includes("visual"),
  );

  async function handleGenerate() {
    try {
      const result = await generateImages.mutateAsync({
        mode: imageMode,
        coverage: imageBudget,
        quality: imageQuality,
      });
      const data = (result as unknown as { data?: { generated?: unknown[]; failed?: unknown[]; coverage?: string } }).data;
      const label = imageCoverageLabel(data?.coverage ?? imageBudget);
      onLog(`Images: generated ${data?.generated?.length ?? 0}, failed ${data?.failed?.length ?? 0}. Coverage: ${label}.`);
    } catch (err) {
      onLog(`Image generation failed: ${String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Coverage summary */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-muted)]">
          Coverage ({imageCoverageLabel(imageBudget)}): {coverage.total - coverage.missing}/{coverage.total}
          {coverage.missing > 0 && (
            <span className="text-[var(--color-warning)] ml-1">· {coverage.missing} missing</span>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generateImages.isPending}
          className="px-3 py-1 text-xs rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
        >
          {generateImages.isPending ? "Generating…" : "Generate Images"}
        </button>
      </div>

      {/* Asset grid */}
      {visualAssets.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {visualAssets.map((asset) => {
            const history = imageHistory
              .filter((h) => h.assetId === asset.id)
              .sort((a, b) => Number(b.version) - Number(a.version));
            const latest = history[0];
            const mediaUrl = latest?.url
              ? latest.url
              : `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(String(asset["path"] ?? ""))}`;

            return (
              <div key={asset.id} className="flex flex-col gap-1 bg-[var(--color-surface-raised)] rounded border border-[var(--color-border)] overflow-hidden">
                <div className="aspect-video bg-[var(--color-surface-overlay)] relative">
                  {asset["path"] && (
                    <img
                      src={mediaUrl}
                      alt={String(asset["beatId"] ?? asset.id)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  {asset["locked_by_user"] && (
                    <div className="absolute top-1 right-1 text-xs bg-[var(--color-warning)]/80 text-black px-1 rounded">🔒</div>
                  )}
                </div>
                <div className="px-2 py-1">
                  <div className="text-xs font-mono text-[var(--color-text-muted)] truncate">
                    {String(asset["beatId"] ?? asset.id)}
                  </div>
                  {history.length > 0 && (
                    <div className="text-xs text-[var(--color-text-muted)] opacity-60">v{history.length}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-[var(--color-text-muted)]">
          No images yet — run Generate Images or Make Draft with images enabled.
        </div>
      )}
    </div>
  );
}

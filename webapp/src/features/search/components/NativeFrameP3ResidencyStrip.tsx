import type {
  NativeFrameResidencyLegendItem,
  NativeFrameResidencyTile,
  NativeFrameResidencyView,
} from "@/services/nativeFrameResidency";

export interface NativeFrameP3ResidencyStripProps {
  readonly view: NativeFrameResidencyView;
  readonly busy: boolean;
  readonly onClearOpfs: () => void;
  readonly onClearBoth: () => void;
  readonly notice: string | null;
  readonly error: string | null;
}

export const P3_UNAVAILABLE_HATCH_STYLE = Object.freeze({
  backgroundImage:
    "repeating-linear-gradient(45deg, #374151 0px, #374151 4px, #4b5563 4px, #4b5563 8px)",
});

export function p3ResidencyTileClassName(
  tile: NativeFrameResidencyTile,
): string {
  const tone =
    tile.residency === "both"
      ? "border-blue-300 bg-gradient-to-r from-blue-700 to-purple-700 text-white"
      : tile.residency === "opfs"
        ? "border-purple-300 bg-purple-700 text-white"
        : tile.residency === "ram"
          ? "border-blue-300 bg-blue-700 text-white"
          : "border-gray-600 bg-gray-800 text-gray-300";
  const error =
    tile.opfsError || tile.opfsIneligible ? "ring-2 ring-red-400" : "";
  const reading = tile.opfsPendingWrite || tile.opfsPendingDelete
    ? "ring-1 ring-yellow-300"
    : "";
  return `${tone} ${error} ${reading}`.trim();
}

function legendToneClassName(
  tone: NativeFrameResidencyLegendItem["tone"],
): string {
  switch (tone) {
    case "ram":
      return "bg-blue-700";
    case "opfs":
      return "bg-purple-700";
    case "both":
      return "bg-gradient-to-r from-blue-700 to-purple-700";
    case "pending":
      return "bg-yellow-400";
    case "error":
      return "bg-red-500";
    case "requested":
      return "bg-white";
    case "displayed":
      return "bg-emerald-400";
    case "window":
      return "border border-amber-300";
    case "prefetch":
      return "bg-cyan-400";
    default:
      return "bg-gray-700";
  }
}

function residencyLabel(tile: NativeFrameResidencyTile): string {
  switch (tile.residency) {
    case "both":
      return "BOTH";
    case "opfs":
      return "OPFS";
    case "ram":
      return "RAM";
    default:
      return "Absent";
  }
}

function markers(tile: NativeFrameResidencyTile): string[] {
  return [
    ...(tile.requested ? ["R"] : []),
    ...(tile.displayed ? ["D"] : []),
    ...(tile.opfsPendingWrite ? ["S"] : []),
    ...(tile.opfsPendingDelete ? ["X"] : []),
    ...(tile.opfsError ? ["!"] : []),
    ...(tile.opfsIneligible ? ["Ineligible"] : []),
    ...(tile.ramInWindow ? ["Wr"] : []),
    ...(tile.opfsInWindow ? ["Wo"] : []),
  ];
}

export function NativeFrameP3ResidencyStrip({
  view,
  busy,
  onClearOpfs,
  onClearBoth,
  notice,
  error,
}: NativeFrameP3ResidencyStripProps) {
  const opfsClearDisabled = busy || !view.opfsAvailable;
  const bothClearDisabled =
    busy ||
    view.opfsStatus === "cleanup-required" ||
    view.opfsStatus === "closed";
  return (
    <section
      aria-label="P3 dual-tier residency"
      className="mt-2 rounded border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-gray-300">
          P3 dual-tier residency · frames {view.startFrame}–{view.endFrame} of{" "}
          {view.totalFrames} · bounded {view.limit} tiles · no fetch
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClearOpfs}
            disabled={opfsClearDisabled}
            className="rounded border border-purple-500 px-2 py-0.5 text-purple-200 disabled:opacity-50"
            title="Clear only the owned OPFS namespace; RAM and the displayed frame remain"
          >
            Clear OPFS
          </button>
          <button
            type="button"
            onClick={onClearBoth}
            disabled={bothClearDisabled}
            className="rounded border border-amber-500 px-2 py-0.5 text-amber-200 disabled:opacity-50"
            title="Clear owned RAM and OPFS; the displayed frame remains transient"
          >
            Clear Both
          </button>
        </div>
      </div>

      {view.opfsUnknown && (
        <div
          role="status"
          data-opfs-state="unavailable"
          style={P3_UNAVAILABLE_HATCH_STYLE}
          className="mt-2 rounded border border-red-700 px-2 py-1 text-red-100"
        >
          OPFS disk tier unavailable/unknown (hatched) — not an empty tier. RAM
          and network remain available.
        </div>
      )}

      <ul className="mt-2 flex flex-wrap gap-1" aria-label="P3 residency tiles">
        {view.tiles.map((tile) => (
          <li
            key={tile.frameNumber}
            data-frame={tile.frameNumber}
            data-residency={tile.residency}
            data-opfs={tile.opfs ? "committed" : "none"}
            data-pending-write={tile.opfsPendingWrite ? "true" : "false"}
            data-pending-delete={tile.opfsPendingDelete ? "true" : "false"}
            data-error={tile.opfsError || tile.opfsIneligible ? "true" : "false"}
            data-opfs-reading={
              view.opfsReadingFrame === tile.frameNumber ? "true" : "false"
            }
            data-network-pending={
              view.networkPendingFrame === tile.frameNumber ? "true" : "false"
            }
            className={`min-w-[2.75rem] rounded border px-1.5 py-1 text-center ${p3ResidencyTileClassName(tile)}`}
            title={tile.labels.join(" · ")}
          >
            <div className="text-[11px] font-medium">{tile.frameNumber}</div>
            <div className="text-[9px] opacity-90">{residencyLabel(tile)}</div>
            {view.opfsUnknown && (
              <span
                aria-hidden="true"
                data-opfs-tier="unavailable"
                style={P3_UNAVAILABLE_HATCH_STYLE}
                className="mt-0.5 block h-1.5 w-full rounded-sm"
              />
            )}
            <div className="flex flex-wrap items-center justify-center gap-0.5 text-[9px]">
              {markers(tile).map((marker) => (
                <span
                  key={marker}
                  className="rounded border border-current px-0.5"
                >
                  {marker}
                </span>
              ))}
              {view.opfsReadingFrame === tile.frameNumber && (
                <span
                  title="OPFS read in progress"
                  className="rounded border border-yellow-300 px-0.5 text-yellow-200"
                >
                  OPFS read
                </span>
              )}
              {view.networkPendingFrame === tile.frameNumber && (
                <span
                  title="Network pending"
                  className="rounded border border-sky-300 px-0.5 text-sky-200"
                >
                  Network
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ul
        aria-label="P3 residency legend"
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400"
      >
        {view.legend.map((item) => (
          <li
            key={item.key}
            className={`flex items-center gap-1 ${item.disabled ? "opacity-60" : ""}`}
          >
            <span className={`h-2 w-2 rounded-sm ${legendToneClassName(item.tone)}`} />
            {item.label}
          </li>
        ))}
      </ul>

      {notice && (
        <div
          className={
            notice.startsWith("Partial") ? "mt-2 text-amber-300" : "mt-2 text-emerald-300"
          }
          role="status"
        >
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-1 text-red-300" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

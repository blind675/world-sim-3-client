'use client';

interface Props {
  screenW: number;
  screenH: number;
  ppc: number;
  cx: number;
  cy: number;
  readyCount: number;
  loadingCount: number;
  objectCount: number;
  agentCount: number;
  showObjects: boolean;
}

export default function MapStatusBar({
  screenW,
  screenH,
  ppc,
  cx,
  cy,
  readyCount,
  loadingCount,
  objectCount,
  agentCount,
  showObjects,
}: Props) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 text-xs bg-black/60 px-2 py-1 rounded">
      view: {Math.round(screenW / ppc)} × {Math.round(screenH / ppc)} cells
      &nbsp;|&nbsp; zoom: {ppc.toFixed(2)} px/cell
      &nbsp;|&nbsp; center: {Math.round(cx)}, {Math.round(cy)}
      &nbsp;|&nbsp; chunks: {readyCount} cached{loadingCount > 0 ? ` · ${loadingCount} loading…` : ''}
      {showObjects ? <>&nbsp;|&nbsp; objects: {objectCount}</> : null}
      &nbsp;|&nbsp; agents: {agentCount}
    </div>
  );
}

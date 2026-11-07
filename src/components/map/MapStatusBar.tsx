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
    <div className="pointer-events-none absolute left-2 right-2 sm:right-auto text-[10px] sm:text-xs bg-black/70 px-2 py-1 rounded leading-tight" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
      view: {Math.round(screenW / ppc)} × {Math.round(screenH / ppc)} cells
      &nbsp;|&nbsp; zoom: {ppc.toFixed(2)} px/cell
      <span className="hidden sm:inline">&nbsp;|&nbsp; center: {Math.round(cx)}, {Math.round(cy)}</span>
      <span className="hidden sm:inline">&nbsp;|&nbsp; chunks: {readyCount} cached{loadingCount > 0 ? ` · ${loadingCount} loading…` : ''}</span>
      {showObjects ? <>&nbsp;|&nbsp; objects: {objectCount}</> : null}
      &nbsp;|&nbsp; agents: {agentCount}
    </div>
  );
}

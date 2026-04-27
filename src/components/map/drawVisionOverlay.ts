import type { AgentDetail, AgentInViewEntity, MemoryEntry, WorldMeta } from '@/lib/types';
import { interpolateAgentPosition } from '@/lib/agentInterpolation';

// RGB triples keyed by memory type. Kept in sync with the Sidebar legend
// swatches so cluster rings match the color an agent "would have seen".
const MEMORY_TYPE_RGB: Record<string, [number, number, number]> = {
  tree: [47, 122, 45],
  rock: [141, 141, 149],
  food: [200, 55, 45],
  water_source: [61, 142, 208],
  rest_spot: [138, 100, 54],
  agent: [255, 184, 77],
};

interface DrawVisionOverlayOptions {
  ctx: CanvasRenderingContext2D;
  ppc: number;
  worldLeft: number;
  worldTop: number;
  worldW: number;
  worldH: number;
  cameraCx: number;
  cameraCy: number;
  screenW: number;
  screenH: number;
  selectedAgent: AgentDetail;
  agentsInView: AgentInViewEntity[];
  meta: WorldMeta;
  showClusterExtents: boolean;
  animationFrame: number;
  tickMs: number;
}

export function drawVisionOverlay({
  ctx,
  ppc,
  worldLeft,
  worldTop,
  worldW,
  worldH,
  cameraCx,
  cameraCy,
  screenW,
  screenH,
  selectedAgent,
  agentsInView,
  meta,
  showClusterExtents,
  animationFrame,
  tickMs,
}: DrawVisionOverlayOptions): void {
  if (!meta.perception) return;

  const liveAgent = agentsInView.find((a) => a.id === selectedAgent.id);
  let facing = selectedAgent.facing;
  let ax: number;
  let ay: number;
  if (liveAgent) {
    const pos = interpolateAgentPosition(liveAgent, animationFrame, tickMs);
    ax = pos.x;
    ay = pos.y;
    facing = liveAgent.facing;
  } else {
    ax = selectedAgent.x;
    ay = selectedAgent.y;
  }

  let wx = ax + 0.5;
  let wy = ay + 0.5;
  const dxw = wx - cameraCx;
  if (dxw > worldW / 2) wx -= worldW;
  else if (dxw < -worldW / 2) wx += worldW;
  const dyw = wy - cameraCy;
  if (dyw > worldH / 2) wy -= worldH;
  else if (dyw < -worldH / 2) wy += worldH;
  const sx = (wx - worldLeft) * ppc;
  const sy = (wy - worldTop) * ppc;

  const visionR = selectedAgent.traits.visionRange * ppc;
  const nearR = meta.perception.nearRadius * ppc;
  const half = meta.perception.coneHalfAngleRad;

  const margin = visionR + 8;
  const onScreen = !(sx + margin < 0 || sy + margin < 0 || sx - margin > screenW || sy - margin > screenH);
  if (onScreen) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 235, 130, 0.12)';
    ctx.strokeStyle = 'rgba(255, 235, 130, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, visionR, facing - half, facing + half);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 235, 130, 0.45)';
    ctx.setLineDash([4, 3]);
    ctx.arc(sx, sy, nearR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const memory: MemoryEntry[] = selectedAgent.memory ?? [];
  if (memory.length === 0) return;

  ctx.save();
  const dotR = Math.max(2, Math.min(5, ppc * 0.35));

  for (const m of memory) {
    let mx = m.x + 0.5;
    let my = m.y + 0.5;
    const mdx = mx - cameraCx;
    if (mdx > worldW / 2) mx -= worldW;
    else if (mdx < -worldW / 2) mx += worldW;
    const mdy = my - cameraCy;
    if (mdy > worldH / 2) my -= worldH;
    else if (mdy < -worldH / 2) my += worldH;
    const msx = (mx - worldLeft) * ppc;
    const msy = (my - worldTop) * ppc;

    if (m.kind === 'cluster') {
      const ringR = Math.max(dotR + 1, m.radius * ppc);
      if (msx + ringR < 0 || msy + ringR < 0 || msx - ringR > screenW || msy - ringR > screenH) continue;

      const c = Math.max(0.1, Math.min(1, m.confidence));
      const rgb = MEMORY_TYPE_RGB[m.type] ?? [255, 220, 90];
      const tr = Math.round(rgb[0] * c + 80 * (1 - c));
      const tg = Math.round(rgb[1] * c + 80 * (1 - c));
      const tb = Math.round(rgb[2] * c + 80 * (1 - c));

      if (showClusterExtents) {
        ctx.fillStyle = `rgba(${tr},${tg},${tb},${0.12 * (0.5 + 0.5 * c)})`;
        ctx.strokeStyle = `rgba(${tr},${tg},${tb},${0.55 * (0.4 + 0.6 * c)})`;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(msx, msy, ringR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const centroidR = showClusterExtents ? Math.max(2, dotR) : Math.max(4, ppc * 0.8);
      ctx.fillStyle = `rgba(${tr},${tg},${tb},${0.6 + 0.35 * c})`;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(msx, msy, centroidR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (ppc >= 2) {
        const label = `×${m.count}`;
        const fontSize = showClusterExtents ? Math.max(10, Math.min(14, ringR * 0.6)) : 12;
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = showClusterExtents ? 'center' : 'left';
        ctx.textBaseline = 'middle';
        const lx = showClusterExtents ? msx : msx + centroidR + 4;
        const ly = msy;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = `rgba(255,255,255,${0.7 + 0.25 * c})`;
        ctx.fillText(label, lx, ly);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
      continue;
    }

    if (msx < -8 || msy < -8 || msx > screenW + 8 || msy > screenH + 8) continue;

    const c = Math.max(0.1, Math.min(1, m.confidence));
    const r = Math.round(255 * c + 80 * (1 - c));
    const g = Math.round(220 * c + 40 * (1 - c));
    const b = Math.round(90 * c + 20 * (1 - c));
    const alpha = 0.35 + 0.55 * c;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(msx, msy, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

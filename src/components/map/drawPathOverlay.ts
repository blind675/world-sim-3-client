import type { AgentInViewEntity } from '@/lib/types';
import { interpolateAgentPosition } from '@/lib/agentInterpolation';

interface DrawPathOverlayOptions {
  ctx: CanvasRenderingContext2D;
  ppc: number;
  worldLeft: number;
  worldTop: number;
  worldW: number;
  worldH: number;
  cameraCx: number;
  cameraCy: number;
  selectedAgentId: string | null | undefined;
  selectedAgentPath: { x: number; y: number }[] | null | undefined;
  agentsInView: AgentInViewEntity[];
  animationFrame: number;
  tickMs: number;
}

export function drawPathOverlay({
  ctx,
  ppc,
  worldLeft,
  worldTop,
  worldW,
  worldH,
  cameraCx,
  cameraCy,
  selectedAgentId,
  selectedAgentPath,
  agentsInView,
  animationFrame,
  tickMs,
}: DrawPathOverlayOptions): void {
  if (!selectedAgentId || !selectedAgentPath || selectedAgentPath.length === 0) return;

  const selAgent = agentsInView.find((a) => a.id === selectedAgentId);
  const interpolatedPos = selAgent
    ? interpolateAgentPosition(selAgent, animationFrame, tickMs)
    : null;
  const startX = interpolatedPos ? interpolatedPos.x + 0.5 : null;
  const startY = interpolatedPos ? interpolatedPos.y + 0.5 : null;

  const toScreen = (wx: number, wy: number) => {
    let x = wx;
    let y = wy;
    const dxw = x - cameraCx;
    if (dxw > worldW / 2) x -= worldW;
    else if (dxw < -worldW / 2) x += worldW;
    const dyw = y - cameraCy;
    if (dyw > worldH / 2) y -= worldH;
    else if (dyw < -worldH / 2) y += worldH;
    return { sx: (x - worldLeft) * ppc, sy: (y - worldTop) * ppc };
  };

  ctx.save();
  ctx.lineWidth = Math.max(1.5, Math.min(3, ppc * 0.2));
  ctx.strokeStyle = 'rgba(255, 220, 90, 0.9)';
  ctx.beginPath();

  let prev: { x: number; y: number } | null = null;
  if (startX !== null && startY !== null) {
    const { sx, sy } = toScreen(startX, startY);
    ctx.moveTo(sx, sy);
    prev = { x: startX, y: startY };
  }

  for (const p of selectedAgentPath) {
    const px = p.x + 0.5;
    const py = p.y + 0.5;
    const { sx, sy } = toScreen(px, py);
    if (prev) {
      let dx = px - prev.x;
      let dy = py - prev.y;
      if (dx > worldW / 2) dx -= worldW;
      else if (dx < -worldW / 2) dx += worldW;
      if (dy > worldH / 2) dy -= worldH;
      else if (dy < -worldH / 2) dy += worldH;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    } else {
      ctx.moveTo(sx, sy);
    }
    prev = { x: px, y: py };
  }
  ctx.stroke();

  const end = selectedAgentPath[selectedAgentPath.length - 1];
  if (end) {
    const { sx, sy } = toScreen(end.x + 0.5, end.y + 0.5);
    ctx.fillStyle = 'rgba(255, 220, 90, 0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(3, Math.min(6, ppc * 0.45)), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

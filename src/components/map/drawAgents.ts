import type { AgentInViewEntity } from '@/lib/types';
import { interpolateAgentPosition } from '@/lib/agentInterpolation';

interface DrawAgentsOptions {
  ctx: CanvasRenderingContext2D;
  agents: AgentInViewEntity[];
  ppc: number;
  worldLeft: number;
  worldTop: number;
  worldW: number;
  worldH: number;
  cameraCx: number;
  cameraCy: number;
  screenW: number;
  screenH: number;
  selectedAgentId: string | null | undefined;
  animationFrame: number;
  tickMs: number;
}

export function drawAgents({
  ctx,
  agents,
  ppc,
  worldLeft,
  worldTop,
  worldW,
  worldH,
  cameraCx,
  cameraCy,
  screenW,
  screenH,
  selectedAgentId,
  animationFrame,
  tickMs,
}: DrawAgentsOptions): void {
  if (agents.length === 0) return;

  const agentR = Math.max(3, Math.min(12, ppc * 1.5));

  for (const a of agents) {
    const interpolatedPos = interpolateAgentPosition(a, animationFrame, tickMs);
    let wx = interpolatedPos.x + 0.5;
    let wy = interpolatedPos.y + 0.5;
    const dxw = wx - cameraCx;
    if (dxw > worldW / 2) wx -= worldW;
    else if (dxw < -worldW / 2) wx += worldW;
    const dyw = wy - cameraCy;
    if (dyw > worldH / 2) wy -= worldH;
    else if (dyw < -worldH / 2) wy += worldH;

    const sx = (wx - worldLeft) * ppc;
    const sy = (wy - worldTop) * ppc;
    if (sx < -16 || sy < -16 || sx > screenW + 16 || sy > screenH + 16) continue;

    const isSelected = !!(selectedAgentId && a.id === selectedAgentId);

    ctx.beginPath();
    ctx.fillStyle = '#ffb84d';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 1.2;
    ctx.arc(sx, sy, agentR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const fx = Math.cos(a.facing);
    const fy = Math.sin(a.facing);
    const tipX = sx + fx * agentR * 1.55;
    const tipY = sy + fy * agentR * 1.55;
    const leftX = sx + (-fy) * agentR * 0.55 + fx * agentR * 0.4;
    const leftY = sy + fx * agentR * 0.55 + fy * agentR * 0.4;
    const rightX = sx + fy * agentR * 0.55 + fx * agentR * 0.4;
    const rightY = sy + (-fx) * agentR * 0.55 + fy * agentR * 0.4;
    ctx.beginPath();
    ctx.fillStyle = '#7a3d00';
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (isSelected) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, agentR + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

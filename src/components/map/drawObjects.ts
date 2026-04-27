import type { WorldObject } from '@/lib/types';

interface DrawObjectsOptions {
  ctx: CanvasRenderingContext2D;
  objects: WorldObject[];
  ppc: number;
  worldLeft: number;
  worldTop: number;
  worldW: number;
  worldH: number;
  cameraCx: number;
  cameraCy: number;
  screenW: number;
  screenH: number;
  selectedObject: WorldObject | null | undefined;
}

const DETAIL_PPC = 3.5;

export function drawObjects({
  ctx,
  objects,
  ppc,
  worldLeft,
  worldTop,
  worldW,
  worldH,
  cameraCx,
  cameraCy,
  screenW,
  screenH,
  selectedObject,
}: DrawObjectsOptions): void {
  const treeR = Math.max(2, Math.min(12, ppc * 1.5));
  const rockR = Math.max(2, Math.min(9, ppc * 1.2));
  const foodR = Math.max(2, Math.min(8, ppc * 1.1));
  const waterR = Math.max(2, Math.min(9, ppc * 1.2));
  const restR = Math.max(3, Math.min(10, ppc * 1.4));

  for (const obj of objects) {
    let wx = obj.x + 0.5;
    let wy = obj.y + 0.5;
    const dx = wx - cameraCx;
    if (dx > worldW / 2) wx -= worldW;
    else if (dx < -worldW / 2) wx += worldW;
    const dy = wy - cameraCy;
    if (dy > worldH / 2) wy -= worldH;
    else if (dy < -worldH / 2) wy += worldH;

    const sx = (wx - worldLeft) * ppc;
    const sy = (wy - worldTop) * ppc;
    if (sx < -12 || sy < -12 || sx > screenW + 12 || sy > screenH + 12) continue;

    const isSelected = !!(selectedObject && selectedObject.id === obj.id);
    let hitR = treeR;

    if (obj.type === 'tree') {
      hitR = treeR;
      drawTree(ctx, sx, sy, treeR, ppc);
    } else if (obj.type === 'rock') {
      hitR = rockR;
      drawRock(ctx, sx, sy, rockR, ppc);
    } else if (obj.type === 'food') {
      hitR = foodR;
      drawFood(ctx, sx, sy, foodR, ppc);
    } else if (obj.type === 'water_source') {
      hitR = waterR;
      drawWater(ctx, sx, sy, waterR, ppc);
    } else if (obj.type === 'rest_spot') {
      hitR = restR;
      drawRestSpot(ctx, sx, sy, restR, ppc);
    }

    if (isSelected) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, hitR + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, ppc: number): void {
  if (ppc < DETAIL_PPC) {
    ctx.beginPath();
    ctx.fillStyle = '#2f7a2d';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const canopyTop = sy - r * 1.05;
  const canopyBaseY = sy + r * 0.25;
  const canopyHalfW = r * 0.95;
  const trunkW = Math.max(1, r * 0.32);
  const trunkH = r * 0.55;

  ctx.fillStyle = '#5a3a1e';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1;
  ctx.fillRect(sx - trunkW / 2, canopyBaseY, trunkW, trunkH);
  ctx.strokeRect(sx - trunkW / 2, canopyBaseY, trunkW, trunkH);

  ctx.beginPath();
  ctx.fillStyle = '#2f7a2d';
  ctx.moveTo(sx, canopyTop);
  ctx.lineTo(sx + canopyHalfW, canopyBaseY);
  ctx.lineTo(sx - canopyHalfW, canopyBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (r >= 5) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(140, 200, 120, 0.45)';
    ctx.moveTo(sx, canopyTop);
    ctx.lineTo(sx - canopyHalfW * 0.55, canopyBaseY);
    ctx.lineTo(sx - canopyHalfW * 0.1, canopyBaseY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRock(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, ppc: number): void {
  if (ppc < DETAIL_PPC) {
    ctx.beginPath();
    ctx.fillStyle = '#8d8d95';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx + r, sy + r * 0.7);
    ctx.lineTo(sx - r, sy + r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.fillStyle = '#8d8d95';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 1;
  ctx.moveTo(sx - r * 0.85, sy + r * 0.1);
  ctx.lineTo(sx - r * 0.4, sy - r * 0.85);
  ctx.lineTo(sx + r * 0.55, sy - r * 0.7);
  ctx.lineTo(sx + r * 0.95, sy + r * 0.1);
  ctx.lineTo(sx + r * 0.25, sy + r * 0.8);
  ctx.lineTo(sx - r * 0.65, sy + r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(210,210,215,0.55)';
  ctx.moveTo(sx - r * 0.4, sy - r * 0.85);
  ctx.lineTo(sx + r * 0.1, sy - r * 0.3);
  ctx.lineTo(sx - r * 0.55, sy - r * 0.1);
  ctx.closePath();
  ctx.fill();
}

function drawFood(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, ppc: number): void {
  if (ppc < DETAIL_PPC) {
    ctx.beginPath();
    ctx.fillStyle = '#c8372d';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const br = r * 0.55;
  const offsets: Array<[number, number]> = [
    [-r * 0.45, -r * 0.25],
    [r * 0.45, -r * 0.25],
    [0, r * 0.5],
  ];
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  for (const [ox, oy] of offsets) {
    ctx.beginPath();
    ctx.fillStyle = '#c8372d';
    ctx.arc(sx + ox, sy + oy, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (r >= 4) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,210,190,0.75)';
      ctx.arc(sx + ox - br * 0.3, sy + oy - br * 0.3, br * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (r >= 4) {
    ctx.beginPath();
    ctx.fillStyle = '#3e8c3a';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.moveTo(sx, sy - r * 0.55);
    ctx.quadraticCurveTo(sx + r * 0.4, sy - r * 1.0, sx + r * 0.15, sy - r * 1.05);
    ctx.quadraticCurveTo(sx - r * 0.1, sy - r * 0.8, sx, sy - r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, ppc: number): void {
  if (ppc >= DETAIL_PPC) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(90,160,220,0.55)';
    ctx.lineWidth = 1;
    ctx.ellipse(sx, sy + r * 0.7, r * 1.25, r * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.fillStyle = '#3d8ed0';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1;
  ctx.moveTo(sx, sy - r);
  ctx.bezierCurveTo(sx + r, sy - r * 0.2, sx + r, sy + r, sx, sy + r);
  ctx.bezierCurveTo(sx - r, sy + r, sx - r, sy - r * 0.2, sx, sy - r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (r >= 3) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.arc(sx - r * 0.25, sy + r * 0.15, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRestSpot(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, ppc: number): void {
  if (ppc < DETAIL_PPC) {
    ctx.beginPath();
    ctx.fillStyle = '#7a5a38';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.fillStyle = '#8a6436';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1;
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#3a2614';
  ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  if (r >= 4) {
    ctx.strokeStyle = 'rgba(40,25,12,0.8)';
    ctx.lineWidth = 1;
    const ticks = 8;
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * r * 0.6, sy + Math.sin(a) * r * 0.6);
      ctx.lineTo(sx + Math.cos(a) * r * 0.95, sy + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }
  }
}

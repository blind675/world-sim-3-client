export interface Camera {
  cx: number; // camera center world X (cells)
  cy: number; // camera center world Y (cells)
  ppc: number; // pixels per cell (zoom)
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function clampZoom(ppc: number, ppcMinOut: number, ppcMaxIn: number): number {
  return Math.max(ppcMinOut, Math.min(ppcMaxIn, ppc));
}

export function zoomBounds(
  screenW: number,
  screenH: number,
  chunkSize: number,
): { ppcMinOut: number; ppcMaxIn: number } {
  const ppcByW = screenW / (16 * chunkSize);
  const ppcByH = screenH / (12 * chunkSize);
  const out = Math.max(ppcByW, ppcByH);
  const shorter = Math.max(1, Math.min(screenW, screenH));
  const maxIn = (2 * shorter) / chunkSize;
  return { ppcMinOut: out, ppcMaxIn: maxIn };
}

export function visibleChunkRange(
  camera: Camera,
  screenW: number,
  screenH: number,
  chunkSize: number,
  prefetchPadding: number,
) {
  const worldLeft = camera.cx - screenW / (2 * camera.ppc);
  const worldTop = camera.cy - screenH / (2 * camera.ppc);
  const worldRight = worldLeft + screenW / camera.ppc;
  const worldBottom = worldTop + screenH / camera.ppc;

  const cxMin = Math.floor(worldLeft / chunkSize) - prefetchPadding;
  const cyMin = Math.floor(worldTop / chunkSize) - prefetchPadding;
  const cxMax = Math.floor((worldRight - 1) / chunkSize) + prefetchPadding;
  const cyMax = Math.floor((worldBottom - 1) / chunkSize) + prefetchPadding;

  return { cxMin, cyMin, cxMax, cyMax, worldLeft, worldTop };
}

export function screenToWorldCoords(
  sx: number,
  sy: number,
  camera: Camera,
  screenW: number,
  screenH: number,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  const wx = camera.cx - screenW / (2 * camera.ppc) + sx / camera.ppc;
  const wy = camera.cy - screenH / (2 * camera.ppc) + sy / camera.ppc;
  const x = wrapIndex(Math.floor(wx), worldWidth);
  const y = wrapIndex(Math.floor(wy), worldHeight);
  return { x, y };
}

export function wrapWorldCoord(
  wx: number,
  wy: number,
  cameraCx: number,
  cameraCy: number,
  worldW: number,
  worldH: number,
): { wx: number; wy: number } {
  let x = wx;
  let y = wy;
  const dx = x - cameraCx;
  if (dx > worldW / 2) x -= worldW;
  else if (dx < -worldW / 2) x += worldW;
  const dy = y - cameraCy;
  if (dy > worldH / 2) y -= worldH;
  else if (dy < -worldH / 2) y += worldH;
  return { wx: x, wy: y };
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchViewport } from '@/lib/api';
import type { LayerName, ViewportResponse, WorldMeta } from '@/lib/types';
import { groundColor, heightColor, waterDepthColor } from '@/lib/color';

export interface HoverInfo {
  worldX: number;
  worldY: number;
  height: number | null;
  groundType: string | null;
  waterDepth: number | null;
  moveCost: number | null;
}

interface Props {
  meta: WorldMeta;
  layer: 'height' | 'groundType' | 'waterDepth';
  onHover: (info: HoverInfo | null) => void;
  onSelect?: (info: HoverInfo) => void;
}

// Maps world-space to screen-space with pan (tx,ty in world cells) and zoom (pixels per cell).
interface Camera {
  cx: number; // camera center world X (cells)
  cy: number; // camera center world Y (cells)
  ppc: number; // pixels per cell (zoom)
}

export default function MapCanvas({ meta, layer, onHover, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState<Camera>(() => ({
    cx: meta.width / 2,
    cy: meta.height / 2,
    ppc: 1, // 1 cell = 1 pixel initially → 5120x5120 world visible at ~small size
  }));
  const [viewport, setViewport] = useState<ViewportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  // Resize observer for the canvas container.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(100, Math.floor(rect.width)), h: Math.max(100, Math.floor(rect.height)) });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: Math.max(100, Math.floor(rect.width)), h: Math.max(100, Math.floor(rect.height)) });
    return () => ro.disconnect();
  }, []);

  // Compute requested viewport (in world cells) and stride to stay within backend caps.
  const requested = useMemo(() => {
    const viewCellsW = Math.ceil(size.w / camera.ppc);
    const viewCellsH = Math.ceil(size.h / camera.ppc);
    // Snap origin to integer cell.
    const x = Math.floor(camera.cx - viewCellsW / 2);
    const y = Math.floor(camera.cy - viewCellsH / 2);
    // Choose stride to keep total output cells under backend cap (~65536).
    const CAP = 256 * 256;
    let stride = 1;
    while (Math.ceil(viewCellsW / stride) * Math.ceil(viewCellsH / stride) > CAP) {
      stride *= 2;
    }
    return { x, y, w: viewCellsW, h: viewCellsH, stride };
  }, [size.w, size.h, camera.cx, camera.cy, camera.ppc]);

  // Fetch viewport when request window changes.
  useEffect(() => {
    const ctrl = new AbortController();
    const layers: LayerName[] = layer === 'height'
      ? ['height', 'groundType', 'waterDepth', 'moveCost']
      : layer === 'waterDepth'
      ? ['height', 'waterDepth', 'groundType', 'moveCost']
      : ['groundType', 'height', 'waterDepth', 'moveCost'];
    setLoading(true);
    fetchViewport({ ...requested, layers }, ctrl.signal)
      .then((vp) => setViewport(vp))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.error('viewport fetch failed', err);
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [requested, layer]);

  // Render viewport to canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const { outWidth, outHeight, stride, layers } = viewport;
    const img = ctx.createImageData(outWidth, outHeight);
    const data = img.data;

    const hs = layers.height;
    const gs = layers.groundType;
    const ws = layers.waterDepth;

    const { minHeight, maxHeight, seaLevel } = meta.terrain;

    for (let j = 0; j < outHeight; j++) {
      for (let i = 0; i < outWidth; i++) {
        const idx = j * outWidth + i;
        let r = 0, g = 0, b = 0;
        if (layer === 'height' && hs) {
          [r, g, b] = heightColor(hs[idx], minHeight, maxHeight, seaLevel);
        } else if (layer === 'groundType' && gs) {
          [r, g, b] = groundColor(gs[idx]);
        } else if (layer === 'waterDepth') {
          if (ws && ws[idx] > 0) {
            [r, g, b] = waterDepthColor(ws[idx], seaLevel, minHeight);
          } else if (hs) {
            // dim terrain beneath
            const [hr, hg, hb] = heightColor(hs[idx], minHeight, maxHeight, seaLevel);
            r = Math.round(hr * 0.5); g = Math.round(hg * 0.5); b = Math.round(hb * 0.5);
          }
        }
        const p = idx * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }

    // Draw to an offscreen canvas of output size, then scale-blit with nearest-neighbor.
    const off = document.createElement('canvas');
    off.width = outWidth;
    off.height = outHeight;
    const offCtx = off.getContext('2d')!;
    offCtx.putImageData(img, 0, 0);

    // Clear
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, 0, size.w, size.h);

    // Screen rect for the viewport we fetched:
    const screenX = (viewport.x - (camera.cx - size.w / (2 * camera.ppc))) * camera.ppc;
    const screenY = (viewport.y - (camera.cy - size.h / (2 * camera.ppc))) * camera.ppc;
    const screenW = viewport.w * camera.ppc;
    const screenH = viewport.h * camera.ppc;

    ctx.drawImage(off, 0, 0, outWidth, outHeight, screenX, screenY, screenW, screenH);

    // Tile copies if the viewport we fetched is smaller than screen (shouldn't happen
    // now, but keeps behavior correct if we ever under-request).
  }, [viewport, size.w, size.h, camera.ppc, camera.cx, camera.cy, layer, meta.terrain]);

  // Screen->world conversion.
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const wx = camera.cx - size.w / (2 * camera.ppc) + sx / camera.ppc;
      const wy = camera.cy - size.h / (2 * camera.ppc) + sy / camera.ppc;
      const wxw = ((Math.floor(wx) % meta.width) + meta.width) % meta.width;
      const wyw = ((Math.floor(wy) % meta.height) + meta.height) % meta.height;
      return { x: wxw, y: wyw };
    },
    [camera, size.w, size.h, meta.width, meta.height],
  );

  // Lookup from current viewport by world coords.
  const sampleViewport = useCallback(
    (wx: number, wy: number): HoverInfo | null => {
      if (!viewport) return null;
      // Convert to viewport-local (wrapped):
      let lx = wx - viewport.x;
      let ly = wy - viewport.y;
      // wrap to positive modulo world size
      lx = ((lx % meta.width) + meta.width) % meta.width;
      ly = ((ly % meta.height) + meta.height) % meta.height;
      if (lx >= viewport.w || ly >= viewport.h) return null;
      const i = Math.floor(lx / viewport.stride);
      const j = Math.floor(ly / viewport.stride);
      const idx = j * viewport.outWidth + i;
      const hs = viewport.layers.height;
      const gs = viewport.layers.groundType;
      const ws = viewport.layers.waterDepth;
      const cs = viewport.layers.moveCost;
      return {
        worldX: wx,
        worldY: wy,
        height: hs ? hs[idx] : null,
        groundType: gs ? gs[idx] : null,
        waterDepth: ws ? ws[idx] : null,
        moveCost: cs ? (cs[idx] < 0 ? null : cs[idx]) : null,
      };
    },
    [viewport, meta.width, meta.height],
  );

  // Pan state
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; camCx: number; camCy: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      camCx: camera.cx,
      camCy: camera.cy,
    };
  };
  const onMouseUp = () => {
    if (dragRef.current) dragRef.current.active = false;
    dragRef.current = null;
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (dragRef.current && dragRef.current.active) {
      const dx = (e.clientX - dragRef.current.startX) / camera.ppc;
      const dy = (e.clientY - dragRef.current.startY) / camera.ppc;
      setCamera((c) => ({ ...c, cx: dragRef.current!.camCx - dx, cy: dragRef.current!.camCy - dy }));
    }
    const { x, y } = screenToWorld(sx, sy);
    onHover(sampleViewport(x, y) ?? { worldX: x, worldY: y, height: null, groundType: null, waterDepth: null, moveCost: null });
  };
  const onMouseLeave = () => {
    onHover(null);
    if (dragRef.current) dragRef.current.active = false;
    dragRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldBefore = screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
    const nextPpc = Math.max(0.125, Math.min(32, camera.ppc * factor));
    // Pivot so that (sx, sy) stays on the same world cell after zoom.
    const halfWx = size.w / (2 * nextPpc);
    const halfHy = size.h / (2 * nextPpc);
    const nextCx = worldBefore.x - (sx / nextPpc - halfWx);
    const nextCy = worldBefore.y - (sy / nextPpc - halfHy);
    setCamera({ cx: nextCx, cy: nextCy, ppc: nextPpc });
  };
  const onClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);
    const info = sampleViewport(x, y);
    if (info && onSelect) onSelect(info);
  };

  return (
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel}
        onClick={onClick}
        className="block w-full h-full cursor-crosshair select-none"
      />
      <div className="pointer-events-none absolute bottom-2 left-2 text-xs bg-black/60 px-2 py-1 rounded">
        zoom: {camera.ppc.toFixed(3)} px/cell &nbsp;|&nbsp; center: {Math.round(camera.cx)}, {Math.round(camera.cy)}
        {loading ? ' · loading…' : ''}
      </div>
    </div>
  );
}

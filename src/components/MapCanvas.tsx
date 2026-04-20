'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChunks } from '@/lib/api';
import type { LayerName, WorldMeta } from '@/lib/types';
import { groundColor, heightColor, waterDepthColor } from '@/lib/color';

export interface HoverInfo {
  worldX: number;
  worldY: number;
  height: number | null;
  groundType: string | null;
  waterDepth: number | null;
  moveCost: number | null;
}

type LayerKey = 'height' | 'groundType' | 'waterDepth';

interface Props {
  meta: WorldMeta;
  layer: LayerKey;
  showChunkGrid?: boolean;
  onHover: (info: HoverInfo | null) => void;
  onSelect?: (info: HoverInfo) => void;
}

interface Camera {
  cx: number; // camera center world X (cells)
  cy: number; // camera center world Y (cells)
  ppc: number; // pixels per cell (zoom)
}

interface ChunkData {
  height: Float32Array;
  groundType: string[];
  waterDepth: Float32Array;
  moveCost: Float32Array; // -1 means impassable
}

interface ChunkEntry {
  status: 'loading' | 'ready' | 'error';
  data?: ChunkData;
  canvas?: HTMLCanvasElement; // cached colour render for the current layer
  renderedLayer?: LayerKey;
}

// Always fetch all four layers per chunk so we never have to refetch when the
// display layer changes or a hover inspects a different field.
const ALL_LAYERS: LayerName[] = ['height', 'groundType', 'waterDepth', 'moveCost'];

// How many chunks of padding to prefetch beyond the visible rect, in every direction.
const PREFETCH_PADDING = 2;

// Max chunks per HTTP request (must be <= MAX_CHUNKS_PER_BATCH on the server).
const BATCH_SIZE = 32;

function chunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

function wrapIndex(i: number, n: number) {
  return ((i % n) + n) % n;
}

export default function MapCanvas({ meta, layer, showChunkGrid = true, onHover, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [camera, setCamera] = useState<Camera>(() => ({
    cx: meta.width / 2,
    cy: meta.height / 2,
    ppc: 3,
  }));

  // Chunk caches kept in refs so renders don't invalidate them.
  const chunksRef = useRef<Map<string, ChunkEntry>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  // Re-render trigger bumped whenever cache contents change.
  const [cacheTick, setCacheTick] = useState(0);

  const cs = meta.chunkSize;
  const chunksW = Math.floor(meta.width / cs);
  const chunksH = Math.floor(meta.height / cs);

  // ---- Resize observer ----
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(100, Math.floor(r.width)), h: Math.max(100, Math.floor(r.height)) });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Zoom bounds derived from chunk size ----
  // Farthest out: at most 10 chunks wide AND 8 chunks tall visible.
  // Closest in: at most 1/3 chunk across the shorter screen axis.
  const { ppcMinOut, ppcMaxIn } = useMemo(() => {
    const ppcByW = size.w / (10 * cs);
    const ppcByH = size.h / (8 * cs);
    const out = Math.max(ppcByW, ppcByH); // both constraints must hold
    const shorter = Math.max(1, Math.min(size.w, size.h));
    const maxIn = (3 * shorter) / cs;
    return { ppcMinOut: out, ppcMaxIn: maxIn };
  }, [size.w, size.h, cs]);

  // Clamp camera zoom whenever the screen size or bounds change.
  useEffect(() => {
    setCamera((c) => {
      const ppc = Math.max(ppcMinOut, Math.min(ppcMaxIn, c.ppc));
      return ppc === c.ppc ? c : { ...c, ppc };
    });
  }, [ppcMinOut, ppcMaxIn]);

  // ---- Visible chunk range (unwrapped, integer) + padding ----
  const visibleChunks = useMemo(() => {
    const worldLeft = camera.cx - size.w / (2 * camera.ppc);
    const worldTop = camera.cy - size.h / (2 * camera.ppc);
    const worldRight = worldLeft + size.w / camera.ppc;
    const worldBottom = worldTop + size.h / camera.ppc;

    const cxMin = Math.floor(worldLeft / cs) - PREFETCH_PADDING;
    const cyMin = Math.floor(worldTop / cs) - PREFETCH_PADDING;
    const cxMax = Math.floor((worldRight - 1) / cs) + PREFETCH_PADDING;
    const cyMax = Math.floor((worldBottom - 1) / cs) + PREFETCH_PADDING;

    return { cxMin, cyMin, cxMax, cyMax, worldLeft, worldTop };
  }, [camera.cx, camera.cy, camera.ppc, size.w, size.h, cs]);

  // ---- Fetch missing chunks ----
  useEffect(() => {
    const { cxMin, cyMin, cxMax, cyMax } = visibleChunks;
    const toFetch: Array<{ cx: number; cy: number; key: string }> = [];
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const wcx = wrapIndex(cx, chunksW);
        const wcy = wrapIndex(cy, chunksH);
        const key = chunkKey(wcx, wcy);
        if (chunksRef.current.has(key)) continue;
        if (inFlightRef.current.has(key)) continue;
        toFetch.push({ cx: wcx, cy: wcy, key });
      }
    }
    if (toFetch.length === 0) return;

    // Mark all as loading up-front so the UI and de-dupe are consistent.
    for (const { key } of toFetch) {
      inFlightRef.current.add(key);
      chunksRef.current.set(key, { status: 'loading' });
    }
    setCacheTick((t) => t + 1);

    // Prioritise chunks closest to the camera so what the user is looking at
    // comes in first.
    const ccx = camera.cx / cs;
    const ccy = camera.cy / cs;
    toFetch.sort((a, b) => {
      const da = (a.cx - ccx) ** 2 + (a.cy - ccy) ** 2;
      const db = (b.cx - ccx) ** 2 + (b.cy - ccy) ** 2;
      return da - db;
    });

    // Split into batches of BATCH_SIZE and fire one POST per batch.
    // Fire-and-forget on purpose: the user pans constantly, so aborting on
    // effect re-run would cancel everything. A fetched chunk is always useful
    // to the cache regardless of where the camera is now.
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const req = batch.map(({ cx, cy }) => ({ cx, cy }));

      fetchChunks(req, ALL_LAYERS)
        .then((resp) => {
          for (const ch of resp.chunks) {
            const key = chunkKey(ch.cx, ch.cy);
            const h = ch.layers.height ?? [];
            const g = ch.layers.groundType ?? [];
            const w = ch.layers.waterDepth ?? [];
            const m = ch.layers.moveCost ?? [];
            const data: ChunkData = {
              height: Float32Array.from(h),
              groundType: g as string[],
              waterDepth: Float32Array.from(w),
              moveCost: Float32Array.from(m),
            };
            chunksRef.current.set(key, { status: 'ready', data });
            inFlightRef.current.delete(key);
          }
          setCacheTick((t) => t + 1);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('chunk batch failed', err);
          for (const { key } of batch) {
            chunksRef.current.set(key, { status: 'error' });
            inFlightRef.current.delete(key);
          }
          setCacheTick((t) => t + 1);
        });
    }
  }, [visibleChunks, chunksW, chunksH, cs, camera.cx, camera.cy]);

  // ---- Paint a single chunk's data into a 128x128 cached canvas for the active layer. ----
  const paintChunkCanvas = useCallback(
    (entry: ChunkEntry, forLayer: LayerKey) => {
      if (!entry.data) return;
      const canvas = entry.canvas ?? document.createElement('canvas');
      canvas.width = cs;
      canvas.height = cs;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(cs, cs);
      const d = img.data;
      const { height: hs, groundType: gs, waterDepth: ws } = entry.data;
      const { minHeight, maxHeight, seaLevel } = meta.terrain;

      for (let j = 0; j < cs; j++) {
        for (let i = 0; i < cs; i++) {
          const idx = j * cs + i;
          let r = 0, g = 0, b = 0;
          if (forLayer === 'height') {
            [r, g, b] = heightColor(hs[idx], minHeight, maxHeight, seaLevel);
          } else if (forLayer === 'groundType') {
            [r, g, b] = groundColor(gs[idx]);
          } else {
            // waterDepth layer
            if (ws[idx] > 0) {
              [r, g, b] = waterDepthColor(ws[idx], seaLevel, minHeight);
            } else {
              const [hr, hg, hb] = heightColor(hs[idx], minHeight, maxHeight, seaLevel);
              r = Math.round(hr * 0.5); g = Math.round(hg * 0.5); b = Math.round(hb * 0.5);
            }
          }
          const p = idx * 4;
          d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      entry.canvas = canvas;
      entry.renderedLayer = forLayer;
    },
    [cs, meta.terrain],
  );

  // ---- Render everything to the main canvas ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, 0, size.w, size.h);

    const { cxMin, cyMin, cxMax, cyMax, worldLeft, worldTop } = visibleChunks;
    const ppc = camera.ppc;

    for (let cyRaw = cyMin; cyRaw <= cyMax; cyRaw++) {
      for (let cxRaw = cxMin; cxRaw <= cxMax; cxRaw++) {
        // Skip pure prefetch padding from drawing (nothing to draw yet if
        // the chunk isn't even on screen); still keep prefetching above.
        const screenX = (cxRaw * cs - worldLeft) * ppc;
        const screenY = (cyRaw * cs - worldTop) * ppc;
        const drawSize = cs * ppc;
        if (screenX + drawSize < 0 || screenY + drawSize < 0 || screenX > size.w || screenY > size.h) continue;

        const wcx = wrapIndex(cxRaw, chunksW);
        const wcy = wrapIndex(cyRaw, chunksH);
        const entry = chunksRef.current.get(chunkKey(wcx, wcy));
        if (!entry || entry.status !== 'ready' || !entry.data) continue;

        if (!entry.canvas || entry.renderedLayer !== layer) {
          paintChunkCanvas(entry, layer);
        }
        if (entry.canvas) {
          ctx.drawImage(entry.canvas, 0, 0, cs, cs, screenX, screenY, drawSize, drawSize);
        }
      }
    }

    // Chunk grid overlay.
    if (showChunkGrid && cs * ppc >= 4) {
      const firstVx = Math.ceil(worldLeft / cs) * cs;
      const firstVy = Math.ceil(worldTop / cs) * cs;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 64, 64, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let wx = firstVx; (wx - worldLeft) * ppc <= size.w; wx += cs) {
        const x = Math.round((wx - worldLeft) * ppc) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.h);
      }
      for (let wy = firstVy; (wy - worldTop) * ppc <= size.h; wy += cs) {
        const y = Math.round((wy - worldTop) * ppc) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(size.w, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [
    visibleChunks, camera.ppc, size.w, size.h, layer, showChunkGrid,
    cs, chunksW, chunksH, paintChunkCanvas, cacheTick,
  ]);

  // ---- Screen -> world, wrapped ----
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const wx = camera.cx - size.w / (2 * camera.ppc) + sx / camera.ppc;
      const wy = camera.cy - size.h / (2 * camera.ppc) + sy / camera.ppc;
      const wxw = wrapIndex(Math.floor(wx), meta.width);
      const wyw = wrapIndex(Math.floor(wy), meta.height);
      return { x: wxw, y: wyw };
    },
    [camera.cx, camera.cy, camera.ppc, size.w, size.h, meta.width, meta.height],
  );

  // ---- Hover / pin lookup from chunk cache ----
  const sampleWorld = useCallback(
    (wx: number, wy: number): HoverInfo => {
      const cxW = Math.floor(wx / cs);
      const cyW = Math.floor(wy / cs);
      const entry = chunksRef.current.get(chunkKey(cxW, cyW));
      const base: HoverInfo = {
        worldX: wx, worldY: wy,
        height: null, groundType: null, waterDepth: null, moveCost: null,
      };
      if (!entry || entry.status !== 'ready' || !entry.data) return base;
      const lx = wx - cxW * cs;
      const ly = wy - cyW * cs;
      const idx = ly * cs + lx;
      const mc = entry.data.moveCost[idx];
      return {
        worldX: wx, worldY: wy,
        height: entry.data.height[idx],
        groundType: entry.data.groundType[idx],
        waterDepth: entry.data.waterDepth[idx],
        moveCost: mc < 0 ? null : mc,
      };
    },
    [cs],
  );

  // ---- Pan / zoom / hover / click ----
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
    onHover(sampleWorld(x, y));
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

    const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const delta = Math.max(-80, Math.min(80, rawDelta));
    const factor = Math.exp(-delta * 0.0035);

    const nextPpc = Math.max(ppcMinOut, Math.min(ppcMaxIn, camera.ppc * factor));

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
    const info = sampleWorld(x, y);
    if (onSelect) onSelect(info);
  };

  // ---- Loading indicator stats ----
  const { readyCount, loadingCount } = useMemo(() => {
    let ready = 0, loading = 0;
    chunksRef.current.forEach((e) => {
      if (e.status === 'ready') ready++;
      else if (e.status === 'loading') loading++;
    });
    return { readyCount: ready, loadingCount: loading };
  }, [cacheTick]);

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
        view: {Math.round(size.w / camera.ppc)} × {Math.round(size.h / camera.ppc)} cells
        &nbsp;|&nbsp; zoom: {camera.ppc.toFixed(2)} px/cell
        &nbsp;|&nbsp; center: {Math.round(camera.cx)}, {Math.round(camera.cy)}
        &nbsp;|&nbsp; chunks: {readyCount} cached{loadingCount > 0 ? ` · ${loadingCount} loading…` : ''}
      </div>
    </div>
  );
}

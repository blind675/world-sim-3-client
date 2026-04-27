import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChunks } from '@/lib/api';
import type { LayerName, WorldMeta } from '@/lib/types';
import { chunkKey, wrapIndex, visibleChunkRange } from '@/lib/mapCamera';
import type { Camera } from '@/lib/mapCamera';
import { heightColor, groundColor, waterDepthColor } from '@/lib/color';

export interface ChunkData {
  height: Float32Array;
  groundType: string[];
  waterDepth: Float32Array;
  moveCost: Float32Array; // -1 means impassable
}

export type LayerKey = 'height' | 'groundType' | 'waterDepth';

export interface ChunkEntry {
  status: 'loading' | 'ready' | 'error';
  data?: ChunkData;
  canvas?: HTMLCanvasElement; // cached colour render for the current layer
  renderedLayer?: LayerKey;
}

const ALL_LAYERS: LayerName[] = ['height', 'groundType', 'waterDepth', 'moveCost'];
const PREFETCH_PADDING = 2;
const BATCH_SIZE = 32;

interface UseChunkCacheOptions {
  meta: WorldMeta;
  camera: Camera;
  size: { w: number; h: number };
  onChunksReady?: (checker: () => boolean) => void;
}

export function useChunkCache({ meta, camera, size, onChunksReady }: UseChunkCacheOptions) {
  const cs = meta.chunkSize;
  const chunksW = Math.floor(meta.width / cs);
  const chunksH = Math.floor(meta.height / cs);

  const chunksRef = useRef<Map<string, ChunkEntry>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const [cacheTick, setCacheTick] = useState(0);

  const visible = useMemo(
    () => visibleChunkRange(camera, size.w, size.h, cs, PREFETCH_PADDING),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera.cx, camera.cy, camera.ppc, size.w, size.h, cs],
  );

  // ---- Expose chunks ready checker to parent ----
  useEffect(() => {
    if (!onChunksReady) return;
    const checker = () => {
      const { cxMin, cyMin, cxMax, cyMax } = visible;
      const keys: string[] = [];
      for (let cx = cxMin; cx <= cxMax; cx++) {
        for (let cy = cyMin; cy <= cyMax; cy++) {
          keys.push(chunkKey(wrapIndex(cx, chunksW), wrapIndex(cy, chunksH)));
        }
      }
      const loaded = keys.filter((k) => chunksRef.current.get(k)?.status === 'ready').length;
      return loaded >= Math.ceil(keys.length * 0.75);
    };
    onChunksReady(checker);
  }, [onChunksReady, visible, chunksW, chunksH, cacheTick]);

  // ---- Fetch missing chunks ----
  useEffect(() => {
    const { cxMin, cyMin, cxMax, cyMax } = visible;
    const toFetch: Array<{ cx: number; cy: number; key: string }> = [];
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const wcx = wrapIndex(cx, chunksW);
        const wcy = wrapIndex(cy, chunksH);
        const key = chunkKey(wcx, wcy);
        if (chunksRef.current.has(key) || inFlightRef.current.has(key)) continue;
        toFetch.push({ cx: wcx, cy: wcy, key });
      }
    }
    if (toFetch.length === 0) return;

    for (const { key } of toFetch) {
      inFlightRef.current.add(key);
      chunksRef.current.set(key, { status: 'loading' });
    }
    setCacheTick((t) => t + 1);

    const ccx = camera.cx / cs;
    const ccy = camera.cy / cs;
    toFetch.sort((a, b) => {
      const da = (a.cx - ccx) ** 2 + (a.cy - ccy) ** 2;
      const db = (b.cx - ccx) ** 2 + (b.cy - ccy) ** 2;
      return da - db;
    });

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      fetchChunks(batch.map(({ cx, cy }) => ({ cx, cy })), ALL_LAYERS)
        .then((resp) => {
          for (const ch of resp.chunks) {
            const key = chunkKey(ch.cx, ch.cy);
            const data: ChunkData = {
              height: Float32Array.from(ch.layers.height ?? []),
              groundType: (ch.layers.groundType ?? []) as string[],
              waterDepth: Float32Array.from(ch.layers.waterDepth ?? []),
              moveCost: Float32Array.from(ch.layers.moveCost ?? []),
            };
            chunksRef.current.set(key, { status: 'ready', data });
            inFlightRef.current.delete(key);
          }
          setCacheTick((t) => t + 1);
        })
        .catch((err) => {
          console.error('chunk batch failed', err);
          for (const { key } of batch) {
            chunksRef.current.set(key, { status: 'error' });
            inFlightRef.current.delete(key);
          }
          setCacheTick((t) => t + 1);
        });
    }
  }, [visible, chunksW, chunksH, cs, camera.cx, camera.cy]);

  // ---- Paint chunk data to an offscreen canvas for the active layer ----
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
            if (ws[idx] > 0) {
              [r, g, b] = waterDepthColor(ws[idx], seaLevel, minHeight);
            } else {
              const [hr, hg, hb] = heightColor(hs[idx], minHeight, maxHeight, seaLevel);
              r = Math.round(hr * 0.5); g = Math.round(hg * 0.5); b = Math.round(hb * 0.5);
            }
          }
          d[4 * idx] = r;
          d[4 * idx + 1] = g;
          d[4 * idx + 2] = b;
          d[4 * idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      entry.canvas = canvas;
      entry.renderedLayer = forLayer;
    },
    [cs, meta.terrain],
  );

  // ---- Loading stats ----
  const { readyCount, loadingCount } = (() => {
    let ready = 0, loading = 0;
    chunksRef.current.forEach((e) => {
      if (e.status === 'ready') ready++;
      else if (e.status === 'loading') loading++;
    });
    return { readyCount: ready, loadingCount: loading };
  })();

  return {
    chunksRef,
    cacheTick,
    visible,
    chunksW,
    chunksH,
    paintChunkCanvas,
    readyCount,
    loadingCount,
  };
}

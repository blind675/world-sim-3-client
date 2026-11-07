import { useEffect, useRef, useState } from 'react';
import { fetchEntitiesInView } from '@/lib/api';
import type { AgentInViewEntity, WorldObject } from '@/lib/types';
import type { ChunkEntry } from './useChunkCache';
import { chunkKey, wrapIndex } from '@/lib/mapCamera';

interface UseEntitiesPollingOptions {
  visibleChunks: { cxMin: number; cyMin: number; cxMax: number; cyMax: number };
  chunkSize: number;
  chunksW: number;
  chunksH: number;
  showObjects: boolean;
  refreshKey: number;
  cacheTick: number;
  tickMs: number;
  chunksRef: React.RefObject<Map<string, ChunkEntry>>;
}

export function useEntitiesPolling({
  visibleChunks,
  chunkSize: cs,
  chunksW,
  chunksH,
  showObjects,
  refreshKey,
  cacheTick,
  tickMs,
  chunksRef,
}: UseEntitiesPollingOptions) {
  const [objectsInView, setObjectsInView] = useState<WorldObject[]>([]);
  const [agentsInView, setAgentsInView] = useState<AgentInViewEntity[]>([]);
  // Track the viewport key of the last *successful* fetch so we don't
  // re-fire identical HTTP requests every time a new chunk finishes loading.
  const lastFetchedViewportKey = useRef<string | null>(null);

  // ---- Fetch objects + agents when visible area or chunk readiness changes ----
  // Debounced: waits 300 ms of camera stillness before firing so rapid pan/zoom
  // movements only produce a single request once the camera settles.
  useEffect(() => {
    const { cxMin, cyMin, cxMax, cyMax } = visibleChunks;

    const requiredKeys: string[] = [];
    for (let cx = cxMin; cx <= cxMax; cx++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        requiredKeys.push(chunkKey(wrapIndex(cx, chunksW), wrapIndex(cy, chunksH)));
      }
    }

    // Deduplicate: same viewport already fetched successfully — skip.
    const viewportKey = `${cxMin},${cyMin},${cxMax},${cyMax},${showObjects},${refreshKey}`;
    if (lastFetchedViewportKey.current === viewportKey) return;

    const ac = new AbortController();

    const debounceId = setTimeout(() => {
      // Re-check chunk readiness at fire time (chunks may still be loading
      // when the effect first runs after a pan, but are ready 300ms later).
      const loadedCount = requiredKeys.filter(
        (k) => chunksRef.current?.get(k)?.status === 'ready',
      ).length;
      if (loadedCount < Math.ceil(requiredKeys.length * 0.75)) return;

      const x = cxMin * cs;
      const y = cyMin * cs;
      const w = (cxMax - cxMin + 1) * cs;
      const h = (cyMax - cyMin + 1) * cs;
      const types = showObjects
        ? (['tree', 'rock', 'food', 'water_source', 'rest_spot', 'agent'] as const)
        : (['agent'] as const);

      fetchEntitiesInView({ x, y, w, h, types: [...types] }, ac.signal)
        .then((resp) => {
          const objs: WorldObject[] = [];
          const ags: AgentInViewEntity[] = [];
          for (const e of resp.objects) {
            if (e.type === 'agent') ags.push(e);
            else objs.push(e);
          }
          lastFetchedViewportKey.current = viewportKey;
          setObjectsInView(showObjects ? objs : []);
          setAgentsInView(ags);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          console.error('entities fetch failed', err);
        });
    }, 300);

    return () => {
      clearTimeout(debounceId);
      ac.abort();
    };
    // cacheTick is intentionally included so this re-runs as chunks load in,
    // but the viewportKey guard above prevents duplicate HTTP requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChunks, cs, chunksW, chunksH, showObjects, refreshKey, cacheTick]);

  // Poll the visible area only; the global agent list grows with the world.
  useEffect(() => {
    const ac = new AbortController();
    const { cxMin, cyMin, cxMax, cyMax } = visibleChunks;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetchEntitiesInView({
          x: cxMin * cs,
          y: cyMin * cs,
          w: (cxMax - cxMin + 1) * cs,
          h: (cyMax - cyMin + 1) * cs,
          types: ['agent'],
        }, ac.signal);
        setAgentsInView(response.objects.filter((entity): entity is AgentInViewEntity => entity.type === 'agent'));
      } catch {
        // Keep the last known agent positions during a transient request failure.
      } finally {
        inFlight = false;
      }
    };
    const pollInterval = setInterval(poll, tickMs);

    return () => { clearInterval(pollInterval); ac.abort(); };
  }, [visibleChunks, cs, tickMs]);

  return { objectsInView, agentsInView, setAgentsInView };
}

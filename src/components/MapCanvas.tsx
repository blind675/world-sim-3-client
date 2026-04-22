'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChunks, fetchEntitiesInView, fetchAllAgents } from '@/lib/api';
import type {
  AgentDetail,
  AgentInViewEntity,
  LayerName,
  MemoryEntry,
  WorldMeta,
  WorldObject,
} from '@/lib/types';
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
  showObjects?: boolean;
  showVision?: boolean;
  showClusterExtents?: boolean;
  selected?: HoverInfo | null;
  selectedObject?: WorldObject | null;
  selectedAgentId?: string | null;
  selectedAgentPath?: { x: number; y: number }[] | null;
  selectedAgent?: AgentDetail | null;
  refreshKey?: number; // bump to force a re-fetch of entities-in-view
  onSelect?: (info: HoverInfo) => void;
  onSelectObject?: (obj: WorldObject | null) => void;
  onSelectAgent?: (a: AgentInViewEntity | null) => void;
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

// Map to track movement start times for smooth interpolation
const movementStartTimes = new Map<string, number>();

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

// Interpolation function for smooth agent movement
function interpolateAgentPosition(agent: AgentInViewEntity, currentAnimTime: number, tickMs: number): { x: number; y: number } {
  if (!agent.isMoving || !agent.movementStartPos || !agent.targetPos) {
    // Clear movement start time when agent stops moving
    movementStartTimes.delete(agent.id);
    return { x: agent.x, y: agent.y };
  }

  // Check if agent has already reached the target position
  const hasReachedTarget = Math.abs(agent.x - agent.targetPos.x) < 0.1 &&
    Math.abs(agent.y - agent.targetPos.y) < 0.1;

  if (hasReachedTarget) {
    // Agent is at target but still marked as moving - clear tracking
    movementStartTimes.delete(agent.id);
    return { x: agent.x, y: agent.y };
  }

  // Store the animation time when we first see this agent's movement
  if (!movementStartTimes.has(agent.id)) {
    movementStartTimes.set(agent.id, currentAnimTime);
  }

  // Use simulation tick interval for animation timing
  // Animation should span the entire tick interval for smooth movement
  const movementDuration = tickMs / agent.moveSpeed; // ms per tick
  const elapsedSinceStart = currentAnimTime - movementStartTimes.get(agent.id)!;
  const progress = Math.min(elapsedSinceStart / movementDuration, 1);

  // Check if animation has completed
  if (progress >= 1) {
    // Animation complete - clear tracking and return target position
    movementStartTimes.delete(agent.id);
    return { x: agent.targetPos.x, y: agent.targetPos.y };
  }

  // Return interpolated position during movement
  return {
    x: agent.movementStartPos.x + (agent.targetPos.x - agent.movementStartPos.x) * progress,
    y: agent.movementStartPos.y + (agent.targetPos.y - agent.movementStartPos.y) * progress
  };
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

export default function MapCanvas({
  meta,
  layer,
  showChunkGrid,
  showObjects,
  showVision,
  showClusterExtents = true,
  selected,
  selectedObject,
  selectedAgentId,
  selectedAgentPath,
  selectedAgent,
  refreshKey = 0,
  onSelect,
  onSelectObject,
  onSelectAgent,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [camera, setCamera] = useState<Camera>(() => ({
    cx: meta.width / 2,
    cy: meta.height / 2,
    ppc: 3,
  }));

  // Initialize camera to focus on first agent after meta loads
  useEffect(() => {
    if (meta.width > 0) {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/agents`)
        .then(res => res.json())
        .then(data => {
          console.log('Camera init: fetched agents:', data.agents?.length || 0);
          if (data.agents && data.agents.length > 0) {
            const firstAgent = data.agents[0];
            console.log('Camera init: positioning to agent', firstAgent.id, 'at', firstAgent.x, firstAgent.y);
            setCamera(prev => ({ ...prev, cx: firstAgent.x, cy: firstAgent.y }));
          }
        })
        .catch(err => console.error('Failed to fetch agents for camera init:', err));
    }
  }, [meta.width]);

  // Chunk caches kept in refs so renders don't invalidate them.
  const chunksRef = useRef<Map<string, ChunkEntry>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  // Re-render trigger bumped whenever cache contents change.
  const [cacheTick, setCacheTick] = useState(0);

  // Static objects visible in the current view. Refetched when the set of
  // visible chunks changes. Kept in state so React triggers a repaint.
  const [objectsInView, setObjectsInView] = useState<WorldObject[]>([]);
  const [agentsInView, setAgentsInView] = useState<AgentInViewEntity[]>([]);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);

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

  // ---- Fetch objects (trees, rocks) for the visible rect ----
  // Keyed on the visible chunk range so we don't refetch on every pan pixel.
  // A small AbortController cancels stale requests when the view moves quickly.
  useEffect(() => {
    const { cxMin, cyMin, cxMax, cyMax } = visibleChunks;
    const x = cxMin * cs;
    const y = cyMin * cs;
    const w = (cxMax - cxMin + 1) * cs;
    const h = (cyMax - cyMin + 1) * cs;
    const types = showObjects
      ? (['tree', 'rock', 'food', 'water_source', 'rest_spot', 'agent'] as const)
      : (['agent'] as const);
    const ac = new AbortController();
    fetchEntitiesInView({ x, y, w, h, types: [...types] }, ac.signal)
      .then((resp) => {
        console.log('Entities fetch: viewport', { x, y, w, h }, 'returned', resp.objects.length, 'objects');
        const objs: WorldObject[] = [];
        const ags: AgentInViewEntity[] = [];
        for (const e of resp.objects) {
          if (e.type === 'agent') ags.push(e);
          else objs.push(e);
        }
        console.log('Entities fetch: found', ags.length, 'agents in viewport');
        setObjectsInView(showObjects ? objs : []);
        setAgentsInView(ags);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.error('entities fetch failed', err);
      });
    return () => ac.abort();
  }, [visibleChunks, cs, showObjects, refreshKey]);

  // Animation frame state to trigger re-renders for smooth movement
  const [animationFrame, setAnimationFrame] = useState(0);

  // ---- Real-time agent animation polling ----
  useEffect(() => {
    // Use exact tick interval for polling - no need for more frequent updates
    const pollInterval = setInterval(async () => {
      try {
        const allAgents = await fetchAllAgents();
        setAgentsInView(allAgents);
      } catch (error) {
        // Silently fail to avoid spamming console during polling
        // Errors will be caught by the viewport fetch above
      }
    }, meta.simulation.tickMs); // Poll exactly when ticks occur

    return () => clearInterval(pollInterval);
  }, [meta.simulation.tickMs]);

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

    // ---- Static objects overlay ----
    if (showObjects && objectsInView.length > 0) {
      const W = meta.width;
      const H = meta.height;
      // Radii for each glyph type, clamped so objects stay visible at low
      // zoom and don't swamp the view at high zoom. Detailed glyphs kick in
      // above `detailPpc` — below that we fall back to simple shapes so tiny
      // dots at max zoom-out remain readable.
      const treeR = Math.max(2, Math.min(8, ppc * 1.0));
      const rockR = Math.max(2, Math.min(6, ppc * 0.8));
      const foodR = Math.max(2, Math.min(5, ppc * 0.75));
      const waterR = Math.max(2, Math.min(6, ppc * 0.8));
      const restR = Math.max(3, Math.min(7, ppc * 0.95));
      const detailPpc = 3.5;

      // Pre-compute center cell offset (+0.5) so objects sit in the middle
      // of their 1x1 cell rather than the top-left corner.
      const cellCenter = 0.5;

      for (const obj of objectsInView) {
        // Shift world coord to the instance nearest the camera centre to
        // handle wrap without seams.
        let wx = obj.x + cellCenter;
        let wy = obj.y + cellCenter;
        const dx = wx - camera.cx;
        if (dx > W / 2) wx -= W;
        else if (dx < -W / 2) wx += W;
        const dy = wy - camera.cy;
        if (dy > H / 2) wy -= H;
        else if (dy < -H / 2) wy += H;

        const sx = (wx - worldLeft) * ppc;
        const sy = (wy - worldTop) * ppc;
        if (sx < -12 || sy < -12 || sx > size.w + 12 || sy > size.h + 12) continue;

        const isSelected = selectedObject && selectedObject.id === obj.id;

        let hitR = treeR;
        if (obj.type === 'tree') {
          hitR = treeR;
          if (ppc < detailPpc) {
            // Simple green dot when cells are tiny.
            ctx.beginPath();
            ctx.fillStyle = '#2f7a2d';
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineWidth = 1;
            ctx.arc(sx, sy, treeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // Conifer: brown trunk + green triangular canopy.
            const canopyTop = sy - treeR * 1.05;
            const canopyBaseY = sy + treeR * 0.25;
            const canopyHalfW = treeR * 0.95;
            const trunkW = Math.max(1, treeR * 0.32);
            const trunkH = treeR * 0.55;

            // Trunk
            ctx.fillStyle = '#5a3a1e';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 1;
            ctx.fillRect(sx - trunkW / 2, canopyBaseY, trunkW, trunkH);
            ctx.strokeRect(sx - trunkW / 2, canopyBaseY, trunkW, trunkH);

            // Canopy
            ctx.beginPath();
            ctx.fillStyle = '#2f7a2d';
            ctx.moveTo(sx, canopyTop);
            ctx.lineTo(sx + canopyHalfW, canopyBaseY);
            ctx.lineTo(sx - canopyHalfW, canopyBaseY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Subtle lighter highlight on the canopy's left face.
            if (treeR >= 5) {
              ctx.beginPath();
              ctx.fillStyle = 'rgba(140, 200, 120, 0.45)';
              ctx.moveTo(sx, canopyTop);
              ctx.lineTo(sx - canopyHalfW * 0.55, canopyBaseY);
              ctx.lineTo(sx - canopyHalfW * 0.1, canopyBaseY);
              ctx.closePath();
              ctx.fill();
            }
          }
        } else if (obj.type === 'rock') {
          hitR = rockR;
          if (ppc < detailPpc) {
            ctx.beginPath();
            ctx.fillStyle = '#8d8d95';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 1;
            ctx.moveTo(sx, sy - rockR);
            ctx.lineTo(sx + rockR, sy + rockR * 0.7);
            ctx.lineTo(sx - rockR, sy + rockR * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else {
            // Boulder: irregular pentagon with a lighter highlight facet.
            ctx.beginPath();
            ctx.fillStyle = '#8d8d95';
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.lineWidth = 1;
            ctx.moveTo(sx - rockR * 0.85, sy + rockR * 0.1);
            ctx.lineTo(sx - rockR * 0.4, sy - rockR * 0.85);
            ctx.lineTo(sx + rockR * 0.55, sy - rockR * 0.7);
            ctx.lineTo(sx + rockR * 0.95, sy + rockR * 0.1);
            ctx.lineTo(sx + rockR * 0.25, sy + rockR * 0.8);
            ctx.lineTo(sx - rockR * 0.65, sy + rockR * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Top-left highlight facet.
            ctx.beginPath();
            ctx.fillStyle = 'rgba(210,210,215,0.55)';
            ctx.moveTo(sx - rockR * 0.4, sy - rockR * 0.85);
            ctx.lineTo(sx + rockR * 0.1, sy - rockR * 0.3);
            ctx.lineTo(sx - rockR * 0.55, sy - rockR * 0.1);
            ctx.closePath();
            ctx.fill();
          }
        } else if (obj.type === 'food') {
          hitR = foodR;
          if (ppc < detailPpc) {
            ctx.beginPath();
            ctx.fillStyle = '#c8372d';
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineWidth = 1;
            ctx.arc(sx, sy, foodR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // Berry cluster: three small red circles + a tiny green leaf.
            const br = foodR * 0.55;
            const offsets: Array<[number, number]> = [
              [-foodR * 0.45, -foodR * 0.25], // left
              [foodR * 0.45, -foodR * 0.25], // right
              [0, foodR * 0.5],               // bottom
            ];
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 1;
            for (const [ox, oy] of offsets) {
              ctx.beginPath();
              ctx.fillStyle = '#c8372d';
              ctx.arc(sx + ox, sy + oy, br, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              // Tiny highlight per berry.
              if (foodR >= 4) {
                ctx.beginPath();
                ctx.fillStyle = 'rgba(255,210,190,0.75)';
                ctx.arc(sx + ox - br * 0.3, sy + oy - br * 0.3, br * 0.3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            // Little leaf on top.
            if (foodR >= 4) {
              ctx.beginPath();
              ctx.fillStyle = '#3e8c3a';
              ctx.strokeStyle = 'rgba(0,0,0,0.7)';
              ctx.moveTo(sx, sy - foodR * 0.55);
              ctx.quadraticCurveTo(sx + foodR * 0.4, sy - foodR * 1.0, sx + foodR * 0.15, sy - foodR * 1.05);
              ctx.quadraticCurveTo(sx - foodR * 0.1, sy - foodR * 0.8, sx, sy - foodR * 0.55);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
        } else if (obj.type === 'water_source') {
          hitR = waterR;
          if (ppc >= detailPpc) {
            // Soft ripple ring underneath the droplet.
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(90,160,220,0.55)';
            ctx.lineWidth = 1;
            ctx.ellipse(sx, sy + waterR * 0.7, waterR * 1.25, waterR * 0.45, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Droplet body.
          ctx.beginPath();
          ctx.fillStyle = '#3d8ed0';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 1;
          ctx.moveTo(sx, sy - waterR);
          ctx.bezierCurveTo(
            sx + waterR, sy - waterR * 0.2,
            sx + waterR, sy + waterR,
            sx, sy + waterR,
          );
          ctx.bezierCurveTo(
            sx - waterR, sy + waterR,
            sx - waterR, sy - waterR * 0.2,
            sx, sy - waterR,
          );
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          if (waterR >= 3) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.arc(sx - waterR * 0.25, sy + waterR * 0.15, waterR * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (obj.type === 'rest_spot') {
          hitR = restR;
          if (ppc < detailPpc) {
            // Simple brown dot.
            ctx.beginPath();
            ctx.fillStyle = '#7a5a38';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 1;
            ctx.arc(sx, sy, restR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // Nest: a twig ring (outer brown) around a darker hollow, with a
            // few short radial strokes suggesting twigs.
            ctx.beginPath();
            ctx.fillStyle = '#8a6436';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 1;
            ctx.arc(sx, sy, restR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner hollow.
            ctx.beginPath();
            ctx.fillStyle = '#3a2614';
            ctx.arc(sx, sy, restR * 0.55, 0, Math.PI * 2);
            ctx.fill();

            // Radial twig ticks.
            if (restR >= 4) {
              ctx.strokeStyle = 'rgba(40,25,12,0.8)';
              ctx.lineWidth = 1;
              const ticks = 8;
              for (let i = 0; i < ticks; i++) {
                const a = (i / ticks) * Math.PI * 2;
                const r0 = restR * 0.6;
                const r1 = restR * 0.95;
                ctx.beginPath();
                ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
                ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
                ctx.stroke();
              }
            }
          }
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

    // ---- Selected agent's path polyline ----
    if (selectedAgentId && selectedAgentPath && selectedAgentPath.length > 0) {
      const W = meta.width;
      const H = meta.height;
      const selAgent = agentsInView.find((a) => a.id === selectedAgentId);
      // Use interpolated position for smooth path animation
      const interpolatedPos = selAgent ? interpolateAgentPosition(selAgent, animationFrame, meta.simulation.tickMs) : null;
      const startX = interpolatedPos ? interpolatedPos.x + 0.5 : null;
      const startY = interpolatedPos ? interpolatedPos.y + 0.5 : null;

      // Build points shifted to the instance nearest the camera centre to
      // avoid seam-crossing lines. We also break the polyline whenever the
      // delta between consecutive path cells exceeds half a world (wrap jump).
      ctx.save();
      ctx.lineWidth = Math.max(1.5, Math.min(3, ppc * 0.2));
      ctx.strokeStyle = 'rgba(255, 220, 90, 0.9)';
      ctx.beginPath();

      const toScreen = (wx: number, wy: number) => {
        let x = wx;
        let y = wy;
        const dxw = x - camera.cx;
        if (dxw > W / 2) x -= W; else if (dxw < -W / 2) x += W;
        const dyw = y - camera.cy;
        if (dyw > H / 2) y -= H; else if (dyw < -H / 2) y += H;
        return { sx: (x - worldLeft) * ppc, sy: (y - worldTop) * ppc };
      };

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
          if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
          if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
          // Only treat as wrap-jump if the delta is very large; normal 1-cell
          // steps always draw a line.
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

      // Target marker at the end of the path.
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

    // ---- Vision cone + memory overlay (selected agent only) ----
    // Drawn BEFORE the agents overlay so agent glyphs render on top of the cone.
    if (showVision && selectedAgent && meta.perception) {
      const W = meta.width;
      const H = meta.height;
      // Prefer the live entry from agentsInView (has interpolation-ready
      // fields and up-to-date facing); fall back to the detail fetch.
      const liveAgent = agentsInView.find((a) => a.id === selectedAgent.id);
      let facing = selectedAgent.facing;
      let ax: number;
      let ay: number;
      if (liveAgent) {
        const pos = interpolateAgentPosition(liveAgent, animationFrame, meta.simulation.tickMs);
        ax = pos.x;
        ay = pos.y;
        facing = liveAgent.facing;
      } else {
        ax = selectedAgent.x;
        ay = selectedAgent.y;
      }

      // Shift to the nearest instance for wrap.
      let wx = ax + 0.5;
      let wy = ay + 0.5;
      const dxw = wx - camera.cx;
      if (dxw > W / 2) wx -= W; else if (dxw < -W / 2) wx += W;
      const dyw = wy - camera.cy;
      if (dyw > H / 2) wy -= H; else if (dyw < -H / 2) wy += H;
      const sx = (wx - worldLeft) * ppc;
      const sy = (wy - worldTop) * ppc;

      const visionR = selectedAgent.traits.visionRange * ppc;
      const nearR = meta.perception.nearRadius * ppc;
      const half = meta.perception.coneHalfAngleRad;

      // Skip drawing entirely if the agent is off-screen by more than
      // the vision range (nothing visible anyway).
      const margin = visionR + 8;
      const onScreen = !(sx + margin < 0 || sy + margin < 0 || sx - margin > size.w || sy - margin > size.h);
      if (onScreen) {
        // Cone slice: arc + two radial edges.
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

        // Near-field ring (omnidirectional).
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 235, 130, 0.45)';
        ctx.setLineDash([4, 3]);
        ctx.arc(sx, sy, nearR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Memory overlay: entity entries as yellow dots (confidence-shaded);
      // cluster entries as either a translucent type-colored ring ("forest")
      // with ×N label, or — if the user disables cluster extents — as a
      // larger central dot in the type color with the ×N label next to it.
      const memory: MemoryEntry[] = selectedAgent.memory ?? [];
      if (memory.length > 0) {
        ctx.save();
        const dotR = Math.max(2, Math.min(5, ppc * 0.35));
        for (const m of memory) {
          let mx = m.x + 0.5;
          let my = m.y + 0.5;
          const mdx = mx - camera.cx;
          if (mdx > W / 2) mx -= W; else if (mdx < -W / 2) mx += W;
          const mdy = my - camera.cy;
          if (mdy > H / 2) my -= H; else if (mdy < -H / 2) my += H;
          const msx = (mx - worldLeft) * ppc;
          const msy = (my - worldTop) * ppc;

          if (m.kind === 'cluster') {
            const ringR = Math.max(dotR + 1, m.radius * ppc);
            // Cull clusters whose entire extent is off-screen.
            if (
              msx + ringR < 0 || msy + ringR < 0 ||
              msx - ringR > size.w || msy - ringR > size.h
            ) continue;

            const c = Math.max(0.1, Math.min(1, m.confidence));
            const rgb = MEMORY_TYPE_RGB[m.type] ?? [255, 220, 90];
            const tr = Math.round(rgb[0] * c + 80 * (1 - c));
            const tg = Math.round(rgb[1] * c + 80 * (1 - c));
            const tb = Math.round(rgb[2] * c + 80 * (1 - c));

            if (showClusterExtents) {
              // Translucent disk of the cluster's world-space radius.
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

            // Centroid marker (always visible, regardless of the ring toggle).
            const centroidR = showClusterExtents
              ? Math.max(2, dotR)
              : Math.max(4, ppc * 0.8);
            ctx.fillStyle = `rgba(${tr},${tg},${tb},${0.6 + 0.35 * c})`;
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(msx, msy, centroidR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // ×N label — only when the text is legible at current zoom.
            if (ppc >= 2) {
              const label = `×${m.count}`;
              const fontSize = showClusterExtents
                ? Math.max(10, Math.min(14, ringR * 0.6))
                : 12;
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

          if (msx < -8 || msy < -8 || msx > size.w + 8 || msy > size.h + 8) continue;

          // Individual entity dot — bright yellow when fresh, fading as confidence decays.
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
    }

    // ---- Agents overlay ----
    if (agentsInView.length > 0) {
      const W = meta.width;
      const H = meta.height;
      const agentR = Math.max(3, Math.min(8, ppc * 1.0));
      for (const a of agentsInView) {
        // Use interpolated position for smooth animation
        const interpolatedPos = interpolateAgentPosition(a, animationFrame, meta.simulation.tickMs);
        let wx = interpolatedPos.x + 0.5;
        let wy = interpolatedPos.y + 0.5;
        const dxw = wx - camera.cx;
        if (dxw > W / 2) wx -= W; else if (dxw < -W / 2) wx += W;
        const dyw = wy - camera.cy;
        if (dyw > H / 2) wy -= H; else if (dyw < -H / 2) wy += H;
        const sx = (wx - worldLeft) * ppc;
        const sy = (wy - worldTop) * ppc;
        if (sx < -16 || sy < -16 || sx > size.w + 16 || sy > size.h + 16) continue;

        const isSelected = selectedAgentId && a.id === selectedAgentId;
        // Body: filled circle
        ctx.beginPath();
        ctx.fillStyle = '#ffb84d';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 1.2;
        ctx.arc(sx, sy, agentR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Facing arrow / notch.
        const fx = Math.cos(a.facing);
        const fy = Math.sin(a.facing);
        const tipX = sx + fx * agentR * 1.55;
        const tipY = sy + fy * agentR * 1.55;
        const leftX = sx + (-fy) * agentR * 0.55 + fx * agentR * 0.4;
        const leftY = sy + (fx) * agentR * 0.55 + fy * agentR * 0.4;
        const rightX = sx + (fy) * agentR * 0.55 + fx * agentR * 0.4;
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

    // Selected-cell white outline. The world wraps, so shift the selected
    // world coords to the instance nearest the camera centre before projecting.
    if (selected) {
      let wx = selected.worldX;
      let wy = selected.worldY;
      const dx = wx - camera.cx;
      if (dx > meta.width / 2) wx -= meta.width;
      else if (dx < -meta.width / 2) wx += meta.width;
      const dy = wy - camera.cy;
      if (dy > meta.height / 2) wy -= meta.height;
      else if (dy < -meta.height / 2) wy += meta.height;

      const sx = (wx - worldLeft) * ppc;
      const sy = (wy - worldTop) * ppc;
      const sSize = ppc;
      if (sx + sSize >= 0 && sy + sSize >= 0 && sx <= size.w && sy <= size.h) {
        ctx.save();
        // Outer dark stroke for contrast, inner white stroke on top.
        ctx.lineWidth = Math.max(3, Math.min(5, ppc * 0.3));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.strokeRect(sx, sy, sSize, sSize);
        ctx.lineWidth = Math.max(1.5, Math.min(2.5, ppc * 0.18));
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(sx, sy, sSize, sSize);
      }
      ctx.restore();
    }
  }, [
    meta, size, cs, camera, layer, visibleChunks, chunksW, chunksH,
    showChunkGrid, showObjects, showVision, showClusterExtents, objectsInView, selectedObject,
    agentsInView, selectedAgentId, selectedAgentPath, selectedAgent,
    animationFrame, selected,
  ]);

  // ---- Continuous animation loop for smooth agent movement ----
  useEffect(() => {
    let animationId: number;
    let lastTime = 0;

    const animate = (currentTime: number) => {
      // Only redraw if enough time has passed (cap at 60fps)
      if (currentTime - lastTime >= 16) { // ~60fps
        setAnimationFrame(currentTime);
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

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

  // ---- Object hit-testing in screen space ----
  // Returns the closest object within `pxThreshold` pixels of (sx, sy), or null.
  const pickObject = useCallback(
    (sx: number, sy: number, pxThreshold = 10): WorldObject | null => {
      if (!showObjects || objectsInView.length === 0) return null;
      const W = meta.width;
      const H = meta.height;
      const ppc = camera.ppc;
      const worldLeft = camera.cx - size.w / (2 * ppc);
      const worldTop = camera.cy - size.h / (2 * ppc);
      let best: WorldObject | null = null;
      let bestD2 = pxThreshold * pxThreshold;
      for (const obj of objectsInView) {
        let wx = obj.x + 0.5;
        let wy = obj.y + 0.5;
        const dxw = wx - camera.cx;
        if (dxw > W / 2) wx -= W;
        else if (dxw < -W / 2) wx += W;
        const dyw = wy - camera.cy;
        if (dyw > H / 2) wy -= H;
        else if (dyw < -H / 2) wy += H;
        const osx = (wx - worldLeft) * ppc;
        const osy = (wy - worldTop) * ppc;
        const dx = osx - sx;
        const dy = osy - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = obj;
        }
      }
      return best;
    },
    [showObjects, objectsInView, meta.width, meta.height, camera.cx, camera.cy, camera.ppc, size.w, size.h],
  );

  const pickAgent = useCallback(
    (sx: number, sy: number, pxThreshold = 12): AgentInViewEntity | null => {
      if (agentsInView.length === 0) return null;
      const W = meta.width;
      const H = meta.height;
      const ppc = camera.ppc;
      const worldLeft = camera.cx - size.w / (2 * ppc);
      const worldTop = camera.cy - size.h / (2 * ppc);
      let best: AgentInViewEntity | null = null;
      let bestD2 = pxThreshold * pxThreshold;
      for (const a of agentsInView) {
        // Use interpolated position for accurate click detection
        const interpolatedPos = interpolateAgentPosition(a, animationFrame, meta.simulation.tickMs);
        let wx = interpolatedPos.x + 0.5;
        let wy = interpolatedPos.y + 0.5;
        const dxw = wx - camera.cx;
        if (dxw > W / 2) wx -= W; else if (dxw < -W / 2) wx += W;
        const dyw = wy - camera.cy;
        if (dyw > H / 2) wy -= H; else if (dyw < -H / 2) wy += H;
        const osx = (wx - worldLeft) * ppc;
        const osy = (wy - worldTop) * ppc;
        const dx = osx - sx;
        const dy = osy - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = a; }
      }
      return best;
    },
    [agentsInView, meta.width, meta.height, camera.cx, camera.cy, camera.ppc, size.w, size.h],
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
    if (dragRef.current?.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setCamera((c) => ({ ...c, cx: dragRef.current!.camCx - dx, cy: dragRef.current!.camCy - dy }));
      return;
    }

    // Generate tooltip content
    const { x, y } = screenToWorld(sx, sy);
    const worldInfo = sampleWorld(x, y);
    const hovAgent = pickAgent(sx, sy);
    const hovObject = hovAgent ? null : pickObject(sx, sy);

    let content = '';
    if (hovAgent) {
      const interpolatedPos = interpolateAgentPosition(hovAgent, animationFrame, meta.simulation.tickMs);
      const goalText = hovAgent.currentGoal ?
        `${hovAgent.currentGoal.type} (${hovAgent.currentGoal.targetX}, ${hovAgent.currentGoal.targetY})` :
        'none';
      content = `Agent ${hovAgent.id}\nPosition: ${Math.round(interpolatedPos.x)}, ${Math.round(interpolatedPos.y)}\nState: ${hovAgent.state}\nGoal: ${goalText}`;
    } else if (hovObject) {
      content = `${hovObject.type} ${hovObject.id}\nPosition: ${hovObject.x}, ${hovObject.y}`;
    } else {
      content = `Position: ${Math.floor(worldInfo.worldX)}, ${Math.floor(worldInfo.worldY)}`;
      if (worldInfo.height != null) content += `\nHeight: ${worldInfo.height.toFixed(2)}m`;
      if (worldInfo.groundType) content += `\nGround: ${worldInfo.groundType}`;
      if (worldInfo.waterDepth != null && worldInfo.waterDepth > 0) content += `\nWater: ${worldInfo.waterDepth.toFixed(2)}m`;
      if (worldInfo.moveCost != null) content += `\nMove cost: ${worldInfo.moveCost.toFixed(2)}`;
    }

    setTooltip({
      x: e.clientX,
      y: e.clientY,
      content
    });
  };
  const onMouseLeave = () => {
    setTooltip(null);
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


    // Agents win over objects and cell selection when the click lands on one.
    const hitAgent = pickAgent(sx, sy);
    if (hitAgent) {
      if (onSelectAgent) onSelectAgent(hitAgent);
      if (onSelectObject) onSelectObject(null);
      return;
    }
    // Objects next.
    const hitObj = pickObject(sx, sy);
    if (hitObj) {
      if (onSelectObject) onSelectObject(hitObj);
      if (onSelectAgent) onSelectAgent(null);
      return;
    }
    // Empty space: clear object + agent selection, pin the tile.
    if (onSelectObject) onSelectObject(null);
    if (onSelectAgent) onSelectAgent(null);
    const { x, y } = screenToWorld(sx, sy);
    const info = sampleWorld(x, y);
    if (onSelect) onSelect(info);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    // Right-click disabled - simulation runs automatically
    e.preventDefault();
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
        onContextMenu={onContextMenu}
        className="block w-full h-full cursor-crosshair select-none"
      />
      <div className="pointer-events-none absolute bottom-2 left-2 text-xs bg-black/60 px-2 py-1 rounded">
        view: {Math.round(size.w / camera.ppc)} × {Math.round(size.h / camera.ppc)} cells
        &nbsp;|&nbsp; zoom: {camera.ppc.toFixed(2)} px/cell
        &nbsp;|&nbsp; center: {Math.round(camera.cx)}, {Math.round(camera.cy)}
        &nbsp;|&nbsp; chunks: {readyCount} cached{loadingCount > 0 ? ` · ${loadingCount} loading…` : ''}
        {showObjects ? <>&nbsp;|&nbsp; objects: {objectsInView.length}</> : null}
        &nbsp;|&nbsp; agents: {agentsInView.length}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute bg-black/90 text-white text-xs px-2 py-1 rounded shadow-lg border border-white/20 whitespace-pre-line"
          style={{
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y - 30}px`,
            transform: 'translateY(-100%)'
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentDetail, AgentInViewEntity, WorldObject, WorldMeta } from '@/lib/types';
import {
  Camera,
  chunkKey,
  wrapIndex,
  zoomBounds,
  screenToWorldCoords,
  wrapWorldCoord,
} from '@/lib/mapCamera';
import { interpolateAgentPosition } from '@/lib/agentInterpolation';
import { useChunkCache, type LayerKey } from './useChunkCache';
import { useEntitiesPolling } from './useEntitiesPolling';
import { drawObjects } from './drawObjects';
import { drawAgents } from './drawAgents';
import { drawPathOverlay } from './drawPathOverlay';
import { drawVisionOverlay } from './drawVisionOverlay';
import MapTooltip from './MapTooltip';
import MapStatusBar from './MapStatusBar';

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
  refreshKey?: number;
  onSelect?: (info: HoverInfo) => void;
  onSelectObject?: (obj: WorldObject | null) => void;
  onSelectAgent?: (a: AgentInViewEntity | null) => void;
  onChunksReady?: (chunksReadyChecker: () => boolean) => void;
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
  onChunksReady,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [camera, setCamera] = useState<Camera>(() => ({
    cx: meta.width / 2,
    cy: meta.height / 2,
    ppc: 5,
  }));

  // Initialize camera to focus on first agent after meta loads
  useEffect(() => {
    if (meta.width > 0) {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/agents`)
        .then((res) => res.json())
        .then((data) => {
          console.log('Camera init: fetched agents:', data.agents?.length || 0);
          if (data.agents && data.agents.length > 0) {
            const firstAgent = data.agents[0];
            console.log('Camera init: positioning to agent', firstAgent.id, 'at', firstAgent.x, firstAgent.y);
            setCamera((prev) => ({ ...prev, cx: firstAgent.x, cy: firstAgent.y }));
          }
        })
        .catch((err) => console.error('Failed to fetch agents for camera init:', err));
    }
  }, [meta.width]);

  const cs = meta.chunkSize;

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

  // ---- Zoom bounds ----
  const { ppcMinOut, ppcMaxIn } = useMemo(
    () => zoomBounds(size.w, size.h, cs),
    [size.w, size.h, cs],
  );

  useEffect(() => {
    setCamera((c) => {
      const ppc = Math.max(ppcMinOut, Math.min(ppcMaxIn, c.ppc));
      return ppc === c.ppc ? c : { ...c, ppc };
    });
  }, [ppcMinOut, ppcMaxIn]);

  // ---- Chunk cache hook ----
  const {
    chunksRef,
    cacheTick,
    visible: visibleChunks,
    chunksW,
    chunksH,
    paintChunkCanvas,
    readyCount,
    loadingCount,
  } = useChunkCache({ meta, camera, size, onChunksReady });

  // ---- Entities polling hook ----
  const { objectsInView, agentsInView, setAgentsInView } = useEntitiesPolling({
    visibleChunks,
    chunkSize: cs,
    showObjects: showObjects ?? false,
    refreshKey,
    cacheTick,
    tickMs: meta.simulation.tickMs,
    chunksRef,
  });

  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [animationFrame, setAnimationFrame] = useState(0);

  // ---- Camera following for selected agent ----
  useEffect(() => {
    if (!selectedAgent) return;
    const followAgent = () => {
      setCamera((prevCamera) => {
        const targetCx = selectedAgent.x;
        const targetCy = selectedAgent.y;
        const smoothFactor = 0.15;
        const newCx = prevCamera.cx + (targetCx - prevCamera.cx) * smoothFactor;
        const newCy = prevCamera.cy + (targetCy - prevCamera.cy) * smoothFactor;
        const threshold = 0.01;
        if (
          Math.abs(newCx - prevCamera.cx) < threshold &&
          Math.abs(newCy - prevCamera.cy) < threshold
        ) {
          return prevCamera;
        }
        return { ...prevCamera, cx: newCx, cy: newCy };
      });
    };
    const intervalId = setInterval(followAgent, 50);
    return () => clearInterval(intervalId);
  }, [selectedAgent]);

  // ---- Continuous animation loop ----
  useEffect(() => {
    let animationId: number;
    let lastTime = 0;
    const animate = (currentTime: number) => {
      if (currentTime - lastTime >= 16) {
        setAnimationFrame(currentTime);
        lastTime = currentTime;
      }
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

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

    // Terrain chunks
    for (let cyRaw = cyMin; cyRaw <= cyMax; cyRaw++) {
      for (let cxRaw = cxMin; cxRaw <= cxMax; cxRaw++) {
        const screenX = (cxRaw * cs - worldLeft) * ppc;
        const screenY = (cyRaw * cs - worldTop) * ppc;
        const drawSize = cs * ppc;
        if (
          screenX + drawSize < 0 || screenY + drawSize < 0 ||
          screenX > size.w || screenY > size.h
        ) continue;

        const wcx = wrapIndex(cxRaw, chunksW);
        const wcy = wrapIndex(cyRaw, chunksH);
        const entry = chunksRef.current.get(chunkKey(wcx, wcy));
        if (!entry || entry.status !== 'ready' || !entry.data) continue;

        if (!entry.canvas || entry.renderedLayer !== layer) {
          paintChunkCanvas(entry, layer);
        }
        if (entry.canvas) {
          ctx.drawImage(
            entry.canvas,
            0, 0, cs, cs,
            Math.round(screenX), Math.round(screenY),
            Math.round(drawSize), Math.round(drawSize),
          );
        }
      }
    }

    const sharedDrawProps = {
      ppc,
      worldLeft,
      worldTop,
      worldW: meta.width,
      worldH: meta.height,
      cameraCx: camera.cx,
      cameraCy: camera.cy,
      screenW: size.w,
      screenH: size.h,
    };

    // Static objects
    if (showObjects && objectsInView.length > 0) {
      drawObjects({ ctx, objects: objectsInView, selectedObject: selectedObject ?? null, ...sharedDrawProps });
    }

    // Path overlay (below agents)
    drawPathOverlay({
      ctx,
      selectedAgentId: selectedAgentId ?? null,
      selectedAgentPath: selectedAgentPath ?? null,
      agentsInView,
      animationFrame,
      tickMs: meta.simulation.tickMs,
      ...sharedDrawProps,
    });

    // Vision cone + memory (below agents)
    if (showVision && selectedAgent && meta.perception) {
      drawVisionOverlay({
        ctx,
        selectedAgent,
        agentsInView,
        meta,
        showClusterExtents,
        animationFrame,
        tickMs: meta.simulation.tickMs,
        ...sharedDrawProps,
      });
    }

    // Agents
    drawAgents({
      ctx,
      agents: agentsInView,
      selectedAgentId: selectedAgentId ?? null,
      animationFrame,
      tickMs: meta.simulation.tickMs,
      ...sharedDrawProps,
    });

    // Chunk grid overlay
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

    // Selected-cell highlight
    if (selected) {
      const { wx: swx, wy: swy } = wrapWorldCoord(
        selected.worldX, selected.worldY,
        camera.cx, camera.cy,
        meta.width, meta.height,
      );
      const sx = (swx - worldLeft) * ppc;
      const sy = (swy - worldTop) * ppc;
      const sSize = ppc;
      if (sx + sSize >= 0 && sy + sSize >= 0 && sx <= size.w && sy <= size.h) {
        ctx.save();
        ctx.lineWidth = Math.max(3, Math.min(5, ppc * 0.3));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.strokeRect(sx, sy, sSize, sSize);
        ctx.lineWidth = Math.max(1.5, Math.min(2.5, ppc * 0.18));
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(sx, sy, sSize, sSize);
        ctx.restore();
      }
    }
  }, [
    meta, size, cs, camera, layer, visibleChunks, chunksW, chunksH,
    showChunkGrid, showObjects, showVision, showClusterExtents,
    objectsInView, selectedObject, agentsInView, selectedAgentId,
    selectedAgentPath, selectedAgent, animationFrame, selected,
    paintChunkCanvas, chunksRef,
  ]);

  // ---- Hover / sample helpers ----
  const screenToWorld = useCallback(
    (sx: number, sy: number) =>
      screenToWorldCoords(sx, sy, camera, size.w, size.h, meta.width, meta.height),
    [camera, size.w, size.h, meta.width, meta.height],
  );

  const sampleWorld = useCallback(
    (wx: number, wy: number): HoverInfo => {
      const cxW = Math.floor(wx / cs);
      const cyW = Math.floor(wy / cs);
      const entry = chunksRef.current.get(chunkKey(cxW, cyW));
      const base: HoverInfo = { worldX: wx, worldY: wy, height: null, groundType: null, waterDepth: null, moveCost: null };
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
    [cs, chunksRef],
  );

  // ---- Object / agent hit-testing ----
  const pickObject = useCallback(
    (sx: number, sy: number, pxThreshold = 10): WorldObject | null => {
      if (!showObjects || objectsInView.length === 0) return null;
      const ppc = camera.ppc;
      const worldLeft = camera.cx - size.w / (2 * ppc);
      const worldTop = camera.cy - size.h / (2 * ppc);
      let best: WorldObject | null = null;
      let bestD2 = pxThreshold * pxThreshold;
      for (const obj of objectsInView) {
        const { wx, wy } = wrapWorldCoord(obj.x + 0.5, obj.y + 0.5, camera.cx, camera.cy, meta.width, meta.height);
        const osx = (wx - worldLeft) * ppc;
        const osy = (wy - worldTop) * ppc;
        const d2 = (osx - sx) ** 2 + (osy - sy) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = obj; }
      }
      return best;
    },
    [showObjects, objectsInView, meta.width, meta.height, camera, size.w, size.h],
  );

  const pickAgent = useCallback(
    (sx: number, sy: number, pxThreshold = 12): AgentInViewEntity | null => {
      if (agentsInView.length === 0) return null;
      const ppc = camera.ppc;
      const worldLeft = camera.cx - size.w / (2 * ppc);
      const worldTop = camera.cy - size.h / (2 * ppc);
      let best: AgentInViewEntity | null = null;
      let bestD2 = pxThreshold * pxThreshold;
      for (const a of agentsInView) {
        const pos = interpolateAgentPosition(a, animationFrame, meta.simulation.tickMs);
        const { wx, wy } = wrapWorldCoord(pos.x + 0.5, pos.y + 0.5, camera.cx, camera.cy, meta.width, meta.height);
        const osx = (wx - worldLeft) * ppc;
        const osy = (wy - worldTop) * ppc;
        const d2 = (osx - sx) ** 2 + (osy - sy) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = a; }
      }
      return best;
    },
    [agentsInView, meta.width, meta.height, meta.simulation.tickMs, camera, size.w, size.h, animationFrame],
  );

  // ---- Input handlers ----
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; camCx: number; camCy: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, camCx: camera.cx, camCy: camera.cy };
  };
  const onMouseUp = () => {
    if (dragRef.current) dragRef.current.active = false;
    dragRef.current = null;
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const dragState = dragRef.current;
    if (dragState?.active) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      setCamera((c) => ({ ...c, cx: dragState.camCx - dx / c.ppc, cy: dragState.camCy - dy / c.ppc }));
      return;
    }

    const { x, y } = screenToWorld(sx, sy);
    const worldInfo = sampleWorld(x, y);
    const hovAgent = pickAgent(sx, sy);
    const hovObject = hovAgent ? null : pickObject(sx, sy);

    let content = '';
    if (hovAgent) {
      const pos = interpolateAgentPosition(hovAgent, animationFrame, meta.simulation.tickMs);
      const goalText = hovAgent.currentGoal
        ? `${hovAgent.currentGoal.type} (${hovAgent.currentGoal.targetX}, ${hovAgent.currentGoal.targetY})`
        : 'none';
      content = `Agent ${hovAgent.id}\nPosition: ${Math.round(pos.x)}, ${Math.round(pos.y)}\nState: ${hovAgent.state}\nGoal: ${goalText}`;
    } else if (hovObject) {
      content = `${hovObject.type} ${hovObject.id}\nPosition: ${hovObject.x}, ${hovObject.y}`;
    } else {
      content = `Position: ${Math.floor(worldInfo.worldX)}, ${Math.floor(worldInfo.worldY)}`;
      if (worldInfo.height != null) content += `\nHeight: ${worldInfo.height.toFixed(2)}m`;
      if (worldInfo.groundType) content += `\nGround: ${worldInfo.groundType}`;
      if (worldInfo.waterDepth != null && worldInfo.waterDepth > 0) content += `\nWater: ${worldInfo.waterDepth.toFixed(2)}m`;
      if (worldInfo.moveCost != null) content += `\nMove cost: ${worldInfo.moveCost.toFixed(2)}`;
    }

    setTooltip({ x: e.clientX, y: e.clientY, content });
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
    const hitAgent = pickAgent(sx, sy);
    if (hitAgent) {
      onSelectAgent?.(hitAgent);
      onSelectObject?.(null);
      return;
    }
    const hitObj = pickObject(sx, sy);
    if (hitObj) {
      onSelectObject?.(hitObj);
      onSelectAgent?.(null);
      return;
    }
    onSelectObject?.(null);
    onSelectAgent?.(null);
    const { x, y } = screenToWorld(sx, sy);
    const info = sampleWorld(x, y);
    onSelect?.(info);
  };
  const onContextMenu = (e: React.MouseEvent) => e.preventDefault();

  // ---- Spacebar: select closest agent ----
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && agentsInView.length > 0) {
        e.preventDefault();
        let closestAgent: AgentInViewEntity | null = null;
        let minDistance = Infinity;
        for (const agent of agentsInView) {
          let dx = agent.x - camera.cx;
          let dy = agent.y - camera.cy;
          if (dx > meta.width / 2) dx -= meta.width;
          else if (dx < -meta.width / 2) dx += meta.width;
          if (dy > meta.height / 2) dy -= meta.height;
          else if (dy < -meta.height / 2) dy += meta.height;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < minDistance) { minDistance = distance; closestAgent = agent; }
        }
        if (closestAgent && onSelectAgent) {
          onSelectAgent(closestAgent);
          setCamera((prev) => ({ ...prev, cx: closestAgent!.x, cy: closestAgent!.y }));
        }
      }
    },
    [agentsInView, camera.cx, camera.cy, meta.width, meta.height, onSelectAgent],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

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
      <MapStatusBar
        screenW={size.w}
        screenH={size.h}
        ppc={camera.ppc}
        cx={camera.cx}
        cy={camera.cy}
        readyCount={readyCount}
        loadingCount={loadingCount}
        objectCount={objectsInView.length}
        agentCount={agentsInView.length}
        showObjects={showObjects ?? false}
      />
      <MapTooltip tooltip={tooltip} />
    </div>
  );
}

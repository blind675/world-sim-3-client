'use client';

import { useCallback, useEffect, useState } from 'react';
import MapCanvas, { HoverInfo } from '@/components/MapCanvas';
import Sidebar from '@/components/Sidebar';
import TutorialModal from '@/components/TutorialModal';
import StatisticsModal from '@/components/StatisticsModal';
import AgentFinder from '@/components/AgentFinder';
import { BACKEND_URL, fetchAgent, fetchMeta, fetchTickCount } from '@/lib/api';
import type {
  AgentDetail,
  AgentInViewEntity,
  WorldMeta,
  WorldObject,
} from '@/lib/types';

export default function HomePage() {
  const [meta, setMeta] = useState<WorldMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<'height' | 'groundType' | 'waterDepth'>('height');
  const [selected, setSelected] = useState<HoverInfo | null>(null);
  const [selectedObject, setSelectedObject] = useState<WorldObject | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null);
  const [showChunkGrid, setShowChunkGrid] = useState(false);
  const [showObjects, setShowObjects] = useState(true);
  const [showVision, setShowVision] = useState(true);
  const [showClusterExtents, setShowClusterExtents] = useState(true);
  const [tickCount, setTickCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tickMs, setTickMs] = useState(200);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [chunksReadyChecker, setChunksReadyChecker] = useState<(() => boolean) | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string; x: number; y: number; nonce: number } | null>(null);

  useEffect(() => {
    fetchMeta()
      .then(setMeta)
      .catch((e) => setError(String(e)));
  }, []);

  // Check if this is the first visit and show tutorial
  useEffect(() => {
    const hasCompletedTutorial = localStorage.getItem('flatworld-tutorial-completed');
    if (!hasCompletedTutorial && window.matchMedia('(min-width: 768px)').matches) {
      setShowTutorial(true);
    }
  }, []);

  // Refetch selected agent detail whenever selection changes or sim advances.
  useEffect(() => {
    if (!selectedAgentId) { setSelectedAgent(null); return; }
    const ac = new AbortController();
    fetchAgent(selectedAgentId, ac.signal)
      .then(setSelectedAgent)
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        if (String(e).includes('404')) {
          setFollowing(false);
          setSelectedAgent(null);
          setAgentMessage(`Agent ${selectedAgentId} has died or disappeared.`);
        } else {
          setAgentMessage('Could not refresh this agent. Retrying on the next tick.');
        }
      });
    return () => ac.abort();
  }, [selectedAgentId, refreshKey, tickCount]);

  // Fetch tick count at SIM_TICK_MS interval
  useEffect(() => {
    const fetchTickInfo = async () => {
      try {
        const tickInfo = await fetchTickCount(undefined, chunksReadyChecker || undefined);
        setTickCount(tickInfo.tickCount);
        setTickMs(tickInfo.tickMs);
      } catch (error) {
        // Silently fail to avoid spamming console
      }
    };

    // Initial fetch
    fetchTickInfo();

    // Set up interval to fetch at SIM_TICK_MS rate
    const intervalId = setInterval(fetchTickInfo, tickMs);

    return () => clearInterval(intervalId);
  }, [tickMs, chunksReadyChecker]);

  const onSelectAgent = useCallback((a: AgentInViewEntity | null) => {
    setSelectedAgentId(a ? a.id : null);
    setSelectedAgent(current => current?.id === a?.id ? current : null);
    setFollowing(false);
    setAgentMessage(null);
    if (a) setMobilePanelOpen(true);
  }, []);

  const jumpToAgent = useCallback((agent: AgentDetail) => {
    setSelected(null);
    setSelectedObject(null);
    setSelectedAgentId(agent.id);
    setSelectedAgent(agent);
    setFollowing(false);
    setAgentMessage(null);
    setFocusTarget({ id: agent.id, x: agent.x, y: agent.y, nonce: Date.now() });
    setMobilePanelOpen(true);
  }, []);

  return (
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#0b0d11] md:flex-row">
      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
      <StatisticsModal isOpen={showStatistics} onClose={() => setShowStatistics(false)} meta={meta} />
      <AgentFinder open={finderOpen} onClose={() => setFinderOpen(false)} onChoose={jumpToAgent} />
      <main className="relative min-h-0 min-w-0 flex-1 bg-black">
        {meta ? (
          <MapCanvas
            meta={meta}
            layer={layer}
            showChunkGrid={showChunkGrid}
            showObjects={showObjects}
            showVision={showVision}
            showClusterExtents={showClusterExtents}
            selected={selected}
            selectedObject={selectedObject}
            selectedAgentId={selectedAgentId}
            selectedAgentPath={selectedAgent ? selectedAgent.path : null}
            selectedAgent={selectedAgent}
            focusTarget={focusTarget}
            following={following}
            onManualPan={() => setFollowing(false)}
            refreshKey={refreshKey}
            onSelect={(info) => { setSelectedObject(null); setSelectedAgentId(null); setFollowing(false); setSelected(info); setMobilePanelOpen(true); }}
            onSelectObject={(o) => { if (o) { setSelectedAgentId(null); setFollowing(false); setSelectedObject(o); setMobilePanelOpen(true); } }}
            onSelectAgent={onSelectAgent}
            onChunksReady={setChunksReadyChecker}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            {error ? (
              <div className="max-w-md text-center">
                <p className="text-red-400 mb-2">Backend not reachable</p>
                <p className="text-xs">{error}</p>
                <p className="text-xs mt-2">Make sure the backend is running on <code>{BACKEND_URL}</code>.</p>
              </div>
            ) : (
              <p>loading world…</p>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute left-3 z-20 flex flex-col gap-2 md:left-4" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}>
          <button onClick={() => setFinderOpen(true)} className="pointer-events-auto min-h-11 rounded-xl border border-amber-300/60 bg-gray-900/95 px-4 text-sm font-semibold text-amber-200 shadow-lg">Find agent</button>
          <button onClick={() => setMobilePanelOpen(value => !value)} className="pointer-events-auto min-h-11 rounded-xl border border-white/20 bg-gray-900/95 px-4 text-sm font-semibold text-white shadow-lg md:hidden">{mobilePanelOpen ? 'Hide details' : 'Layers & details'}</button>
        </div>
        {agentMessage && <div role="status" className="absolute bottom-16 left-3 right-3 z-20 rounded-lg bg-gray-900/95 p-3 text-sm text-amber-200 md:right-auto">{agentMessage}</div>}
      </main>
      <div className={`${mobilePanelOpen ? 'h-[46dvh] border-t border-white/15' : 'hidden'} min-h-0 shrink-0 overflow-hidden md:block md:h-full md:w-72 md:border-t-0`} style={{ paddingBottom: mobilePanelOpen ? 'env(safe-area-inset-bottom)' : undefined }}>
      <Sidebar
        meta={meta}
        layer={layer}
        onLayer={setLayer}
        selected={selected}
        selectedObject={selectedObject}
        selectedAgent={selectedAgent}
        following={following}
        onToggleFollow={() => setFollowing(value => !value)}
        backendOk={!!meta && !error}
        showChunkGrid={showChunkGrid}
        onToggleChunkGrid={setShowChunkGrid}
        showObjects={showObjects}
        onToggleObjects={setShowObjects}
        showVision={showVision}
        onToggleVision={setShowVision}
        showClusterExtents={showClusterExtents}
        onToggleClusterExtents={setShowClusterExtents}
        tickCount={tickCount}
        onShowTutorial={() => setShowTutorial(true)}
        onShowStatistics={() => setShowStatistics(true)}
      />
      </div>
    </div>
  );
}


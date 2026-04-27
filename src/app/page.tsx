'use client';

import { useCallback, useEffect, useState } from 'react';
import MapCanvas, { HoverInfo } from '@/components/MapCanvas';
import Sidebar from '@/components/Sidebar';
import TutorialModal from '@/components/TutorialModal';
import StatisticsModal from '@/components/StatisticsModal';
import { fetchAgent, fetchMeta, postAgentPath, postSimStep, fetchTickCount } from '@/lib/api';
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

  useEffect(() => {
    fetchMeta()
      .then(setMeta)
      .catch((e) => setError(String(e)));
  }, []);

  // Check if this is the first visit and show tutorial
  useEffect(() => {
    const hasCompletedTutorial = localStorage.getItem('flatworld-tutorial-completed');
    if (!hasCompletedTutorial) {
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
        // eslint-disable-next-line no-console
        console.error('fetch agent failed', e);
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
  }, []);

  return (
    <div className="h-screen w-screen flex">
      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
      <StatisticsModal isOpen={showStatistics} onClose={() => setShowStatistics(false)} meta={meta} />
      <main className="flex-1 relative bg-black">
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
            refreshKey={refreshKey}
            onSelect={(info) => { setSelectedObject(null); setSelectedAgentId(null); setSelected(info); }}
            onSelectObject={(o) => { if (o) setSelectedAgentId(null); setSelectedObject(o); }}
            onSelectAgent={onSelectAgent}
            onChunksReady={setChunksReadyChecker}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            {error ? (
              <div className="max-w-md text-center">
                <p className="text-red-400 mb-2">Backend not reachable</p>
                <p className="text-xs">{error}</p>
                <p className="text-xs mt-2">Make sure the backend is running on <code>http://localhost:4000</code>.</p>
              </div>
            ) : (
              <p>loading world…</p>
            )}
          </div>
        )}
      </main>
      <Sidebar
        meta={meta}
        layer={layer}
        onLayer={setLayer}
        selected={selected}
        selectedObject={selectedObject}
        selectedAgent={selectedAgent}
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
  );
}


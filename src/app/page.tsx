'use client';

import { useEffect, useState } from 'react';
import MapCanvas, { HoverInfo } from '@/components/MapCanvas';
import Sidebar from '@/components/Sidebar';
import { fetchMeta } from '@/lib/api';
import type { WorldMeta } from '@/lib/types';

export default function HomePage() {
  const [meta, setMeta] = useState<WorldMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<'height' | 'groundType' | 'waterDepth'>('height');
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<HoverInfo | null>(null);
  const [showChunkGrid, setShowChunkGrid] = useState(true);

  useEffect(() => {
    fetchMeta()
      .then(setMeta)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="h-screen w-screen flex">
      <main className="flex-1 relative bg-black">
        {meta ? (
          <MapCanvas
            meta={meta}
            layer={layer}
            showChunkGrid={showChunkGrid}
            onHover={setHover}
            onSelect={setSelected}
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
        hover={hover}
        selected={selected}
        backendOk={!!meta && !error}
        showChunkGrid={showChunkGrid}
        onToggleChunkGrid={setShowChunkGrid}
      />
    </div>
  );
}

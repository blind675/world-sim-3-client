'use client';

import type { WorldMeta } from '@/lib/types';
import type { HoverInfo } from './MapCanvas';

interface Props {
  meta: WorldMeta | null;
  layer: 'height' | 'groundType' | 'waterDepth';
  onLayer: (l: 'height' | 'groundType' | 'waterDepth') => void;
  hover: HoverInfo | null;
  selected: HoverInfo | null;
  backendOk: boolean;
  showChunkGrid: boolean;
  onToggleChunkGrid: (v: boolean) => void;
}

function row(label: string, value: React.ReactNode) {
  return (
    <div className="flex justify-between gap-4 text-xs py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100 tabular-nums">{value}</span>
    </div>
  );
}

export default function Sidebar({ meta, layer, onLayer, hover, selected, backendOk, showChunkGrid, onToggleChunkGrid }: Props) {
  return (
    <aside className="w-72 shrink-0 bg-panel border-l border-white/5 p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${backendOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <h1 className="text-sm font-semibold tracking-wide">Life Simulation v3</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1">Phase 1 — Terrain viewer</p>
      </div>

      <section className="bg-panelSoft rounded p-3">
        <h2 className="text-xs uppercase text-gray-400 mb-2">World</h2>
        {meta ? (
          <>
            {row('seed', meta.seed)}
            {row('size', `${meta.width} × ${meta.height}`)}
            {row('cell', `${meta.cellSize} m`)}
            {row('chunk', `${meta.chunkSize}`)}
            {row('wrap', meta.wrapMode)}
            {row('height', `${meta.terrain.minHeight} … ${meta.terrain.maxHeight} m`)}
            {row('sea', `${meta.terrain.seaLevel} m`)}
          </>
        ) : (
          <p className="text-xs text-gray-500">loading…</p>
        )}
      </section>

      <section className="bg-panelSoft rounded p-3">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Layer</h2>
        <div className="grid grid-cols-3 gap-1">
          {(['height', 'groundType', 'waterDepth'] as const).map((l) => (
            <button
              key={l}
              onClick={() => onLayer(l)}
              className={`text-xs px-2 py-1 rounded border transition ${layer === l
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'bg-black/20 border-white/10 text-gray-300 hover:bg-white/5'
                }`}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-panelSoft rounded p-3">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Overlays</h2>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showChunkGrid}
            onChange={(e) => onToggleChunkGrid(e.target.checked)}
            className="accent-red-500"
          />
          <span>Chunk grid</span>
          <span className="ml-auto text-gray-500">
            {meta ? `${meta.chunkSize}×${meta.chunkSize}` : ''}
          </span>
        </label>
      </section>

      <section className="bg-panelSoft rounded p-3">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Hover</h2>
        {hover ? (
          <>
            {row('x, y', `${hover.worldX}, ${hover.worldY}`)}
            {row('height', hover.height != null ? `${hover.height.toFixed(2)} m` : '—')}
            {row('ground', hover.groundType ?? '—')}
            {row('water', hover.waterDepth != null ? `${hover.waterDepth.toFixed(2)} m` : '—')}
            {row('move cost', hover.moveCost != null ? hover.moveCost.toFixed(2) : '∞')}
          </>
        ) : (
          <p className="text-xs text-gray-500">move the mouse over the map</p>
        )}
      </section>

      <section className="bg-panelSoft rounded p-3">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Selected tile</h2>
        {selected ? (
          <>
            {row('x, y', `${selected.worldX}, ${selected.worldY}`)}
            {row('height', selected.height != null ? `${selected.height.toFixed(2)} m` : '—')}
            {row('ground', selected.groundType ?? '—')}
            {row('water', selected.waterDepth != null ? `${selected.waterDepth.toFixed(2)} m` : '—')}
            {row('move cost', selected.moveCost != null ? selected.moveCost.toFixed(2) : '∞')}
          </>
        ) : (
          <p className="text-xs text-gray-500">click a tile to pin its data</p>
        )}
      </section>

      <section className="bg-panelSoft rounded p-3 text-xs text-gray-400 leading-relaxed">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Controls</h2>
        <p><b>Drag</b> — pan</p>
        <p><b>Wheel</b> — zoom</p>
        <p><b>Click</b> — pin tile</p>
        <p className="mt-2 text-gray-500">World wraps seamlessly on both axes.</p>
      </section>
    </aside>
  );
}

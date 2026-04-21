'use client';

import type {
  AgentDetail,
  AgentInViewEntity,
  WorldMeta,
  WorldObject,
} from '@/lib/types';
import type { HoverInfo } from './MapCanvas';

interface Props {
  meta: WorldMeta | null;
  layer: 'height' | 'groundType' | 'waterDepth';
  onLayer: (l: 'height' | 'groundType' | 'waterDepth') => void;
  selected: HoverInfo | null;
  selectedObject: WorldObject | null;
  selectedAgent: AgentDetail | null;
  backendOk: boolean;
  showChunkGrid: boolean;
  onToggleChunkGrid: (v: boolean) => void;
  showObjects: boolean;
  onToggleObjects: (v: boolean) => void;
  tickCount: number;
}

function row(label: string, value: React.ReactNode) {
  return (
    <div className="flex justify-between gap-4 text-xs py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100 tabular-nums">{value}</span>
    </div>
  );
}

export default function Sidebar({
  meta,
  layer,
  onLayer,
  selected,
  selectedObject,
  selectedAgent,
  backendOk,
  showChunkGrid,
  onToggleChunkGrid,
  showObjects,
  onToggleObjects,
  tickCount,
}: Props) {
  return (
    <aside className="w-72 shrink-0 bg-panel border-l border-white/5 p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${backendOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <h1 className="text-sm font-semibold tracking-wide">Life Simulation v3</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1">Milestone 3 — First moving agent</p>
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

      <section className="bg-panelSoft rounded p-3 flex flex-col gap-2">
        <h2 className="text-xs uppercase text-gray-400">Overlays</h2>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showObjects}
            onChange={(e) => onToggleObjects(e.target.checked)}
            className="accent-emerald-500"
          />
          <span>Objects</span>
        </label>
        {showObjects ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 pl-6 text-[11px] text-gray-300">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 bg-[#2f7a2d]"
                style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
              />
              tree
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 bg-[#8d8d95]"
                style={{ clipPath: 'polygon(15% 60%, 40% 10%, 80% 20%, 100% 60%, 65% 95%, 25% 85%)' }}
              />
              rock
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#c8372d] border border-black/60" />
              berries
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 bg-[#3d8ed0]"
                style={{ clipPath: 'polygon(50% 0%, 100% 60%, 75% 100%, 25% 100%, 0% 60%)' }}
              />
              water
            </div>
            <div className="flex items-center gap-2">
              <span className="relative inline-block w-2.5 h-2.5">
                <span className="absolute inset-0 rounded-full bg-[#8a6436] border border-black/60" />
                <span className="absolute inset-[30%] rounded-full bg-[#3a2614]" />
              </span>
              nest (rest)
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ffb84d] border border-black/80" />
              agent
            </div>
          </div>
        ) : null}
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
        <h2 className="text-xs uppercase text-gray-400 mb-2">Simulation</h2>
        {row('ticks', tickCount)}
        <div className="text-xs text-gray-500 pt-1">
          Running automatically
        </div>
      </section>

      <section className="bg-panelSoft rounded p-3">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Selected</h2>
        {selectedAgent ? (
          <>
            <div className="text-xs font-medium text-emerald-400 mb-2">Agent</div>
            {row('id', selectedAgent.id)}
            {row('x, y', `${selectedAgent.x}, ${selectedAgent.y}`)}
            {row('facing', `${((selectedAgent.facing * 180) / Math.PI).toFixed(0)}°`)}
            {row('sex', selectedAgent.sex)}
            {row('state', selectedAgent.state)}
            {row('goal', selectedAgent.currentGoal ?? '—')}
            {row('action', selectedAgent.currentAction ?? '—')}
            {row('hunger', selectedAgent.hunger.toFixed(2))}
            {row('thirst', selectedAgent.thirst.toFixed(2))}
            {row('tired', selectedAgent.tiredness.toFixed(2))}
            {row('path', `${selectedAgent.pathIndex} / ${selectedAgent.pathLength}`)}
            {row('vision', selectedAgent.traits.visionRange)}
            {row('speed', selectedAgent.traits.moveSpeed)}
          </>
        ) : selectedObject ? (
          <>
            <div className="text-xs font-medium text-blue-400 mb-2">Object</div>
            {row('type', selectedObject.type)}
            {row('id', selectedObject.id)}
            {row('x, y', `${selectedObject.x}, ${selectedObject.y}`)}
          </>
        ) : selected ? (
          <>
            <div className="text-xs font-medium text-gray-400 mb-2">Tile</div>
            {row('x, y', `${selected.worldX}, ${selected.worldY}`)}
            {row('height', selected.height != null ? `${selected.height.toFixed(2)} m` : '—')}
            {row('ground', selected.groundType ?? '—')}
            {row('water', selected.waterDepth != null ? `${selected.waterDepth.toFixed(2)} m` : '—')}
            {row('move cost', selected.moveCost != null ? selected.moveCost.toFixed(2) : '∞')}
          </>
        ) : (
          <p className="text-xs text-gray-500">click an agent, object, or tile to select it</p>
        )}
      </section>

      <section className="bg-panelSoft rounded p-3 text-xs text-gray-400 leading-relaxed">
        <h2 className="text-xs uppercase text-gray-400 mb-2">Controls</h2>
        <p><b>Drag</b> — pan</p>
        <p><b>Wheel</b> — zoom</p>
        <p><b>Click</b> — select agent / object / pin tile</p>
        <p><b>Right-click</b> or <b>Shift+click</b> — command selected agent to path here</p>
        <p className="mt-2 text-gray-500">World wraps seamlessly on both axes.</p>
      </section>
    </aside>
  );
}

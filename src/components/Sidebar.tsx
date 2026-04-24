'use client';

import { useState } from 'react';
import type {
  AgentDetail,
  AgentInViewEntity,
  MemoryEntry,
  WorldMeta,
  WorldObject,
} from '@/lib/types';
import type { HoverInfo } from './MapCanvas';
import { MemoryModal } from './MemoryModal';

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
  showVision: boolean;
  onToggleVision: (v: boolean) => void;
  showClusterExtents: boolean;
  onToggleClusterExtents: (v: boolean) => void;
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

// Color-per-type dot used in the memory list to match the map legend glyphs.
const MEMORY_TYPE_COLOR: Record<string, string> = {
  tree: '#2f7a2d',
  rock: '#8d8d95',
  food: '#c8372d',
  water_source: '#3d8ed0',
  rest_spot: '#8a6436',
  agent: '#ffb84d',
};

// Gradient from green (low) to yellow to red (high) based on need value.
// Mirrors the intent of "0 = safe, 1 = critical" at a glance.
function needColor(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  if (clamped < 0.5) {
    // green -> yellow
    const t = clamped / 0.5;
    const r = Math.round(60 + t * (220 - 60));
    const g = Math.round(180 - t * (180 - 180));
    const b = Math.round(80 - t * 80);
    return `rgb(${r},${g},${b})`;
  }
  // yellow -> red
  const t = (clamped - 0.5) / 0.5;
  const r = Math.round(220 + t * (235 - 220));
  const g = Math.round(180 - t * (180 - 60));
  const b = Math.round(0 + t * 40);
  return `rgb(${r},${g},${b})`;
}

function NeedBar({ label, value, accent }: { label: string; value: number; accent: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = needColor(value);
  return (
    <div className="text-[11px] py-0.5">
      <div className="flex justify-between tabular-nums">
        <span className="text-gray-400">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
            style={{ backgroundColor: accent }}
          />
          {label}
        </span>
        <span className="text-gray-100">{pct}%</span>
      </div>
      <div className="h-1.5 bg-black/40 rounded overflow-hidden mt-0.5">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function NeedsPanel({ agent }: { agent: AgentDetail }) {
  const inAction = ['eating', 'drinking', 'resting'].includes(agent.state);
  return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span className="uppercase">Needs</span>
        {inAction ? (
          <span className="text-emerald-400 tabular-nums">
            {agent.state} · {agent.actionTicksRemaining}t left
          </span>
        ) : null}
      </div>
      <NeedBar label="thirst" value={agent.thirst} accent="#3d8ed0" />
      <NeedBar label="hunger" value={agent.hunger} accent="#c8372d" />
      <NeedBar label="tiredness" value={agent.tiredness} accent="#8a6fb8" />
    </div>
  );
}

function MemoryPanel({ memory, currentTick, agentId }: { memory: MemoryEntry[]; currentTick: number; agentId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sorted = [...memory].sort((a, b) => b.confidence - a.confidence);
  const top = sorted.slice(0, 5);

  // Count individuals and cluster groups separately per type so chips read
  // "tree ×12 · group ×1 (Σ18)" — you can see at a glance how much of the
  // memory is compressed into clusters.
  type Bucket = { entities: number; clusters: number; members: number };
  const byType = new Map<string, Bucket>();
  let clusterCount = 0;
  let clusterMemberCount = 0;
  for (const m of memory) {
    const bucket = byType.get(m.type) ?? { entities: 0, clusters: 0, members: 0 };
    if (m.kind === 'cluster') {
      bucket.clusters += 1;
      bucket.members += m.count;
      clusterCount += 1;
      clusterMemberCount += m.count;
    } else {
      bucket.entities += 1;
    }
    byType.set(m.type, bucket);
  }

  return (
    <div className="mt-3 pt-2 border-t border-white/5">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span className="uppercase">Memory</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {memory.length} {memory.length === 1 ? 'entry' : 'entries'}
            {clusterCount > 0 ? (
              <span className="text-gray-500">
                {' '}· {clusterCount} group{clusterCount === 1 ? '' : 's'} (Σ{clusterMemberCount})
              </span>
            ) : null}
          </span>
          {memory.length > 0 && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              title="Inspect all memory items"
            >
              View All
            </button>
          )}
        </div>
      </div>
      {memory.length === 0 ? (
        <p className="text-[11px] text-gray-500">Nothing remembered yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {Array.from(byType.entries()).map(([t, b]) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 text-gray-300 tabular-nums"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                  style={{ backgroundColor: MEMORY_TYPE_COLOR[t] ?? '#aaa' }}
                />
                {t}
                {b.entities > 0 ? ` ×${b.entities}` : ''}
                {b.clusters > 0 ? (
                  <span className="text-yellow-400/80">
                    {b.entities > 0 ? ' · ' : ' '}
                    ◯{b.clusters} (Σ{b.members})
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <ul className="space-y-1">
            {top.map((m) => {
              const ticksAgo = Math.max(0, currentTick - m.lastSeenTick);
              const confPct = Math.round(m.confidence * 100);
              const color = MEMORY_TYPE_COLOR[m.type] ?? '#aaa';
              return (
                <li key={m.id} className="text-[11px]">
                  <div className="flex justify-between tabular-nums">
                    <span className="truncate">
                      {m.kind === 'cluster' ? (
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1 align-middle border"
                          style={{
                            backgroundColor: `${color}33`,
                            borderColor: color,
                          }}
                        />
                      ) : (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {m.kind === 'cluster' ? (
                        <>
                          {m.type} group
                          <span className="text-yellow-400/80"> ×{m.count}</span>
                          <span className="text-gray-500">
                            {' '}({Math.round(m.x)},{Math.round(m.y)}) ≈r{m.radius.toFixed(1)}
                          </span>
                        </>
                      ) : (
                        <>
                          {m.type}
                          <span className="text-gray-500"> ({m.x},{m.y})</span>
                        </>
                      )}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {ticksAgo === 0 ? 'now' : `-${ticksAgo}t`}
                    </span>
                  </div>
                  <div className="h-1 bg-black/40 rounded overflow-hidden mt-0.5">
                    <div
                      className={m.kind === 'cluster' ? 'h-full bg-emerald-400/80' : 'h-full bg-yellow-400/80'}
                      style={{ width: `${confPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <MemoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        memory={memory}
        currentTick={currentTick}
        agentId={agentId}
      />
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
  showVision,
  onToggleVision,
  showClusterExtents,
  onToggleClusterExtents,
  tickCount,
}: Props) {
  return (
    <aside className="w-72 shrink-0 bg-panel border-l border-white/5 p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${backendOk ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <h1 className="text-sm font-semibold tracking-wide">Life Simulation v3</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1">Milestone 5 — Survival loop</p>
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
            checked={showVision}
            onChange={(e) => onToggleVision(e.target.checked)}
            className="accent-yellow-400"
          />
          <span>Vision</span>
          <span className="ml-auto text-gray-500">
            {meta?.perception
              ? `${meta.perception.coneDeg}° · near ${meta.perception.nearRadius}`
              : 'selected agent'}
          </span>
        </label>
        {showVision ? (
          <label className="flex items-center gap-2 text-xs cursor-pointer pl-6">
            <input
              type="checkbox"
              checked={showClusterExtents}
              onChange={(e) => onToggleClusterExtents(e.target.checked)}
              className="accent-emerald-400"
            />
            <span>Cluster extents</span>
            <span className="ml-auto text-gray-500">
              {meta?.perception?.clusterRadius !== undefined
                ? `≥${meta.perception.clusterMinCount ?? 3} · r${meta.perception.clusterRadius}`
                : 'groups'}
            </span>
          </label>
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
            {row('goal', selectedAgent.currentGoal ? (
              <span>
                {selectedAgent.currentGoal.type}
                <span className="text-gray-500"> ({selectedAgent.currentGoal.targetX}, {selectedAgent.currentGoal.targetY})</span>
                {selectedAgent.currentGoal.memoryConfidence !== undefined ? (
                  <span className="text-yellow-400/80 ml-1">
                    · mem {Math.round(selectedAgent.currentGoal.memoryConfidence * 100)}%
                  </span>
                ) : null}
              </span>
            ) : '---')}
            {row('action', selectedAgent.currentAction ?? '—')}
            {row('path', `${selectedAgent.pathIndex} / ${selectedAgent.pathLength}`)}
            {row('vision', selectedAgent.traits.visionRange)}
            {row('speed', selectedAgent.traits.moveSpeed)}

            <NeedsPanel agent={selectedAgent} />
            <MemoryPanel memory={selectedAgent.memory} currentTick={tickCount} agentId={selectedAgent.id} />
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

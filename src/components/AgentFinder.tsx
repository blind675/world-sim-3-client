'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchAgent, fetchAllAgents } from '@/lib/api';
import type { AgentDetail, AgentInViewEntity } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (agent: AgentDetail) => void;
}

export default function AgentFinder({ open, onClose, onChoose }: Props) {
  const [agents, setAgents] = useState<AgentInViewEntity[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQuery('');
    fetchAllAgents(controller.signal)
      .then(list => setAgents(list.filter(agent => !agent.dead)))
      .catch(err => { if (err?.name !== 'AbortError') setError('Could not load agents. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, reload]);

  const visible = useMemo(() => agents.filter(agent =>
    `${agent.id} ${agent.state} ${agent.currentGoal?.type ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())
  ), [agents, query]);

  async function choose(agent: AgentInViewEntity) {
    if (choosing) return;
    setChoosing(agent.id);
    setError(null);
    try {
      const fresh = await fetchAgent(agent.id);
      if (fresh.dead) throw new Error('gone');
      onChoose(fresh);
      onClose();
    } catch {
      setAgents(current => current.filter(item => item.id !== agent.id));
      setError('That agent is no longer available. Choose another.');
    } finally { setChoosing(null); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Find an agent">
      <div className="flex w-full max-w-xl flex-col rounded-t-2xl border border-white/10 bg-gray-900 shadow-2xl sm:rounded-2xl" style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 8px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <div><h2 className="text-lg font-semibold">Find agent</h2><p className="text-xs text-gray-400">Choose a living agent to jump to it</p></div>
          <button onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm bg-gray-700" aria-label="Close agent list">Close</button>
        </div>
        <div className="p-4 pb-2">
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search ID, state, or goal" aria-label="Search agents" className="w-full min-h-11 rounded-lg border border-white/20 bg-gray-800 px-3 text-base outline-none focus:border-blue-400" />
        </div>
        {error && <div role="alert" className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-red-300"><span>{error}</span><button onClick={() => setReload(value => value + 1)} className="min-h-11 shrink-0 rounded-lg bg-gray-700 px-3 text-white">Retry</button></div>}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 pt-2" style={{ touchAction: 'pan-y' }}>
          {loading ? <p className="py-6 text-center text-gray-400">Loading agents…</p>
            : visible.length === 0 ? <div className="py-6 text-center text-gray-400">
                <p>{error ? '' : agents.length === 0 ? 'No living agents found.' : 'No matches.'}</p>
                {!error && agents.length === 0 && <a href="/admin/world" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-red-400/40 px-4 text-sm font-semibold text-red-200">Start a fresh world</a>}
              </div>
              : <div className="grid gap-2">{visible.map(agent => (
                <button key={agent.id} onClick={() => choose(agent)} disabled={!!choosing} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-gray-800 p-3 text-left hover:border-amber-400 disabled:opacity-50">
                  <span><span className="block font-semibold text-amber-300">{agent.id}</span><span className="text-xs text-gray-400">{agent.state}{agent.currentGoal ? ` · ${agent.currentGoal.type}` : ''}</span></span>
                  <span className="shrink-0 text-xs text-gray-400">{choosing === agent.id ? 'Opening…' : `${agent.x}, ${agent.y}`}</span>
                </button>
              ))}</div>}
        </div>
      </div>
    </div>
  );
}

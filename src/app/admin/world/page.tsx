'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchTickCount } from '@/lib/api';

type Status = Awaited<ReturnType<typeof fetchTickCount>>;

export default function WorldAdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchTickCount());
      setError(null);
    } catch (cause) { setError(`Could not load world status: ${String(cause)}`); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function reset() {
    if (!status?.worldId || confirmation !== 'RESET WORLD' || !password || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/world/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, worldId: status.worldId, confirmation }),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Reset failed (${response.status})`);
      setStatus(result.current);
      setPassword('');
      setConfirmation('');
      setMessage('A fresh world is running. Tick and death counts are back to zero.');
    } catch (cause) {
      await refresh();
      setError(String(cause));
    } finally { setBusy(false); }
  }

  return <main className="min-h-[100dvh] bg-[#0b0d11] px-4 py-6 text-gray-100" style={{ paddingTop: 'max(24px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
    <div className="mx-auto max-w-xl">
      <a href="/" className="inline-flex min-h-11 items-center text-amber-300">← Back to world</a>
      <h1 className="mt-4 text-2xl font-bold">World administration</h1>
      <p className="mt-2 text-sm text-gray-300">Start a fresh simulation when all agents have died. This clears agents, deaths, resources, and progress on the server. The current world cannot be recovered through this page.</p>
      <section className="mt-6 rounded-xl border border-white/15 bg-gray-900 p-4" aria-label="Current world">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Current world</h2><button onClick={() => void refresh()} className="min-h-11 rounded-lg border border-white/20 px-4 text-sm">Refresh</button></div>
        {status ? <p className="mt-2 text-sm text-gray-300">Tick {status.tickCount} · {status.agentCount} living agents · {status.deathCount} deaths</p> : <p className="mt-2 text-sm text-gray-400">Loading status…</p>}
      </section>
      <section className="mt-5 rounded-xl border border-red-400/30 bg-red-950/20 p-4" aria-label="Reset world">
        <h2 className="font-semibold text-red-200">Reset world</h2>
        <p className="mt-2 text-sm text-gray-300">Enter the admin password and type <strong>RESET WORLD</strong> to confirm. The password is sent only to this site’s server and is not saved in your browser.</p>
        <label className="mt-4 block text-sm">Admin password<input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-white/20 bg-gray-800 px-3" /></label>
        <label className="mt-3 block text-sm">Confirmation<input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="RESET WORLD" className="mt-1 min-h-11 w-full rounded-lg border border-white/20 bg-gray-800 px-3" /></label>
        <button onClick={() => void reset()} disabled={busy || !status?.worldId || !password || confirmation !== 'RESET WORLD'} className="mt-4 min-h-11 w-full rounded-lg bg-red-600 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Resetting…' : 'Start fresh world'}</button>
        {status && !status.worldId && <p className="mt-2 text-sm text-amber-200">The backend needs the reset API update before this action is available.</p>}
      </section>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">{message}</p>}
    </div>
  </main>;
}

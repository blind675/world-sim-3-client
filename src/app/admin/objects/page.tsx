'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { fetchObjectCatalog } from '@/lib/api';
import { SPAWN_STRATEGY, validateObjectCatalog, type CatalogDraft } from '@/lib/objectCatalog';
import type { ObjectCatalog, ObjectDefinition, WorldObjectType } from '@/lib/types';

const BEHAVIORS = Object.keys(SPAWN_STRATEGY) as WorldObjectType[];
const SPRITES = ['tree', 'pine_tree', 'rock', 'slate_rock', 'food', 'blueberry_bush', 'water_source', 'rest_spot'];
const blank = (): ObjectDefinition => ({
  id: '', name: '', category: 'food', behavior: 'food', color: '#c8372d',
  sprite: 'food', blocksVision: false,
  spawn: { strategy: 'berry_patch', weight: 1 },
});

export default function ObjectEditorPage() {
  const [tab, setTab] = useState<'browse' | 'editor'>('browse');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [query, setQuery] = useState('');
  const [published, setPublished] = useState<ObjectCatalog | null>(null);
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [editing, setEditing] = useState<ObjectDefinition | null>(null);
  const [groundInput, setGroundInput] = useState('');
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchObjectCatalog().then(catalog => {
      setPublished(catalog);
      const key = `object-catalog-draft:${catalog.hash}`;
      try {
        const saved = localStorage.getItem(key);
        setDraft(saved ? validateObjectCatalog(JSON.parse(saved)) : validateObjectCatalog(catalog));
      } catch { setDraft(validateObjectCatalog(catalog)); }
    }).catch(() => setError('Could not load the object catalogue from the backend.'));
  }, []);

  useEffect(() => {
    if (draft && published) localStorage.setItem(`object-catalog-draft:${published.hash}`, JSON.stringify(draft));
  }, [draft, published]);

  const categories = useMemo(() =>
    [...new Set(draft?.definitions.map(def => def.category) ?? [])].sort(), [draft]);
  const visibleDefinitions = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (draft?.definitions ?? []).filter(def =>
      (!categoryFilter || def.category === categoryFilter)
      && (!search || `${def.id} ${def.name} ${def.category} ${def.behavior}`.toLowerCase().includes(search)));
  }, [draft, categoryFilter, query]);

  function startAdd() {
    setOriginalId(null);
    setGroundInput('');
    setEditing(blank());
    setError(null);
    setTab('editor');
  }

  function startEdit(definition: ObjectDefinition) {
    setOriginalId(definition.id);
    setGroundInput(definition.spawn.preferredGroundTypes?.join(', ') ?? '');
    setEditing(structuredClone(definition));
    setError(null);
    setTab('editor');
  }

  function saveDefinition() {
    if (!draft || !editing || !published) return;
    try {
      const toSave = structuredClone(editing);
      const preferredGroundTypes = groundInput.split(',').map(type => type.trim()).filter(Boolean);
      if (preferredGroundTypes.length) toSave.spawn.preferredGroundTypes = preferredGroundTypes;
      else delete toSave.spawn.preferredGroundTypes;
      const definitions = originalId
        ? draft.definitions.map(def => def.id === originalId ? toSave : def)
        : [...draft.definitions, toSave];
      const next = validateObjectCatalog({ ...draft, revision: Math.max(draft.revision, published.revision + 1), definitions });
      setDraft(next);
      setEditing(null);
      setOriginalId(null);
      setCategoryFilter(toSave.category);
      setQuery('');
      setTab('browse');
      setError(null);
      setMessage(`${editing.name} saved to this browser's draft.`);
    } catch (cause) { setError(String(cause)); }
  }

  function removeDefinition(id: string) {
    if (!draft || !published || BEHAVIORS.includes(id as WorldObjectType)) return;
    try {
      setDraft(validateObjectCatalog({ ...draft, revision: Math.max(draft.revision, published.revision + 1), definitions: draft.definitions.filter(def => def.id !== id) }));
      setEditing(null);
      setOriginalId(null);
      setMessage(`${id} removed from this browser's draft.`);
    } catch (cause) { setError(String(cause)); }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Catalogue file must be at most 1 MiB.');
      const imported = validateObjectCatalog(JSON.parse(await file.text()));
      setDraft(imported);
      setEditing(null);
      setOriginalId(null);
      setCategoryFilter('');
      setQuery('');
      setTab('browse');
      setError(null);
      setMessage('JSON imported into this browser’s draft. The live world is unchanged.');
    } catch (cause) { setError(`Import failed: ${String(cause)}`); }
  }

  function download() {
    if (!draft) return;
    try {
      const valid = validateObjectCatalog(draft);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(valid, null, 2)}\n`], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `object-catalog-${valid.id}-r${valid.revision}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Draft downloaded. Review and commit it to the backend catalogue to publish it.');
    } catch (cause) { setError(String(cause)); }
  }

  const dirty = !!(published && draft && JSON.stringify(validateObjectCatalog(published)) !== JSON.stringify(draft));
  return (
    <main className="h-[100dvh] w-full overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#0b0d11] px-3 pt-4 text-gray-100 sm:px-6" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(48px, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-6xl">
        <a href="/" className="inline-flex min-h-11 items-center text-amber-300">← Back to world</a>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Object catalogue</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-400">Inspect live definitions and prepare a versioned JSON draft. Edits stay in this browser; this page cannot change the running world.</p>
          </div>
          {published && <span className="max-w-full break-all rounded-lg bg-gray-800 px-3 py-2 text-xs">{published.id} · revision {published.revision} · {published.hash.slice(0, 10)}</span>}
        </div>
        {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        {message && <p role="status" className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200">{message}</p>}
        {!draft ? <p>{error ? 'The catalogue is unavailable. Reload this page to try again.' : 'Loading catalogue…'}</p> : <>
          <div role="tablist" aria-label="Object catalogue sections" className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-900 p-1">
            <button id="browse-tab" role="tab" aria-controls="browse-panel" aria-selected={tab === 'browse'} onClick={() => setTab('browse')} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${tab === 'browse' ? 'bg-amber-500 text-gray-950' : 'text-gray-200'}`}>Browse objects <span className="opacity-70">({draft.definitions.length})</span></button>
            <button id="editor-tab" role="tab" aria-controls="editor-panel" aria-selected={tab === 'editor'} onClick={() => { if (editing) setTab('editor'); else startAdd(); }} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${tab === 'editor' ? 'bg-amber-500 text-gray-950' : 'text-gray-200'}`}>{originalId ? 'Edit object' : 'Add object'}</button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={download} className="min-h-11 rounded-lg border border-white/20 bg-gray-800 px-4 text-sm">Download JSON</button>
            <label className="flex min-h-11 cursor-pointer items-center rounded-lg border border-white/20 bg-gray-800 px-4 text-sm">Import JSON<input type="file" accept=".json,application/json" className="sr-only" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
            <button onClick={() => { if (published) setDraft(validateObjectCatalog(published)); setEditing(null); setOriginalId(null); setCategoryFilter(''); setQuery(''); setTab('browse'); setError(null); setMessage('Draft reset to the live catalogue.'); }} className="min-h-11 rounded-lg border border-white/20 px-4 text-sm">Reset draft</button>
          </div>
          {dirty && <p className="mb-4 text-sm text-amber-200">Draft differs from the live catalogue. Export it to review and deploy; an incompatible live world requires a planned migration or a new world.</p>}
          {tab === 'browse' ? <section id="browse-panel" role="tabpanel" aria-labelledby="browse-tab">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Category
                <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-white/20 bg-gray-800 px-3">
                  <option value="">All categories ({draft.definitions.length})</option>
                  {categories.map(category => <option key={category} value={category}>{category.replaceAll('_', ' ')} ({draft.definitions.filter(def => def.category === category).length})</option>)}
                </select>
              </label>
              <label className="text-sm">Search objects
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, ID, or behavior" className="mt-1 min-h-11 w-full rounded-lg border border-white/20 bg-gray-800 px-3" />
              </label>
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-400">Showing {visibleDefinitions.length} of {draft.definitions.length} definitions</p>
              <button onClick={startAdd} className="min-h-11 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-gray-950">Add object variety</button>
            </div>
            {visibleDefinitions.length === 0 ? <p className="rounded-xl border border-white/10 bg-gray-900 p-6 text-center text-gray-400">No objects match these filters.</p> :
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleDefinitions.map(definition => <article key={definition.id} className="min-w-0 rounded-xl border border-white/10 bg-gray-900 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-800"><Image unoptimized src={`/objects/${definition.sprite}.svg`} alt="" width={56} height={56} /></div>
                    <div className="min-w-0"><h2 className="truncate font-semibold">{definition.name}</h2><p className="truncate text-xs text-gray-400">{definition.id} · {definition.category}</p><p className="text-xs text-gray-400">{definition.behavior} · {definition.spawn.strategy}</p></div>
                  </div>
                  <p className="mt-3 text-xs text-gray-400">Prefers {definition.spawn.preferredGroundTypes?.join(', ') || 'all suitable terrain'} · weight {definition.spawn.weight}</p>
                  <div className="mt-3 flex gap-2"><button onClick={() => startEdit(definition)} className="min-h-11 flex-1 rounded-lg bg-blue-700 px-3 text-sm">Inspect / edit</button>{!BEHAVIORS.includes(definition.id as WorldObjectType) && <button onClick={() => removeDefinition(definition.id)} className="min-h-11 rounded-lg border border-red-500/40 px-3 text-sm text-red-300">Remove</button>}</div>
                </article>)}
              </div>}
            <details className="mt-6 rounded-xl border border-white/10 bg-gray-900 p-4"><summary className="cursor-pointer font-semibold">View JSON draft</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-300">{JSON.stringify(draft, null, 2)}</pre></details>
          </section> : editing && <section id="editor-panel" role="tabpanel" aria-labelledby="editor-tab" className="rounded-xl border border-amber-500/30 bg-gray-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">{originalId ? `Edit ${originalId}` : 'Add object variety'}</h2>
            <form onSubmit={event => { event.preventDefault(); saveDefinition(); }}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm">ID<input value={editing.id} disabled={!!originalId} onChange={event => setEditing({ ...editing, id: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3 disabled:opacity-60" /></label>
                <label className="text-sm">Name<input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3" /></label>
                <label className="text-sm">Category<input value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3" /></label>
                <label className="text-sm">Behavior<select value={editing.behavior} disabled={!!originalId} onChange={event => { const behavior = event.target.value as WorldObjectType; setEditing({ ...editing, behavior, sprite: behavior, spawn: { ...editing.spawn, strategy: SPAWN_STRATEGY[behavior] }, blocksVision: behavior === 'tree' || behavior === 'rock' }); }} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3 disabled:opacity-60">{BEHAVIORS.map(behavior => <option key={behavior}>{behavior}</option>)}</select></label>
                <label className="text-sm">Sprite<select value={editing.sprite} onChange={event => setEditing({ ...editing, sprite: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3">{SPRITES.map(sprite => <option key={sprite}>{sprite}</option>)}</select></label>
                <label className="text-sm">Colour<input type="color" value={editing.color} onChange={event => setEditing({ ...editing, color: event.target.value })} className="mt-1 h-11 w-full rounded-lg bg-gray-800 p-1" /></label>
                <label className="text-sm">Relative variety weight<input type="number" min="0.01" max="100" step="0.01" value={editing.spawn.weight} onChange={event => setEditing({ ...editing, spawn: { ...editing.spawn, weight: Number(event.target.value) } })} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3" /></label>
                <label className="text-sm">Preferred ground types (comma separated)<input value={groundInput} onChange={event => setGroundInput(event.target.value)} placeholder="forest_floor, tall_grass" className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3" /></label>
                <label className="text-sm">Minimum height (optional)<input type="number" value={editing.spawn.minHeight ?? ''} onChange={event => { const spawn = { ...editing.spawn }; if (event.target.value) spawn.minHeight = Number(event.target.value); else delete spawn.minHeight; setEditing({ ...editing, spawn }); }} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3" /></label>
                <label className="text-sm">Maximum height (optional)<input type="number" value={editing.spawn.maxHeight ?? ''} onChange={event => { const spawn = { ...editing.spawn }; if (event.target.value) spawn.maxHeight = Number(event.target.value); else delete spawn.maxHeight; setEditing({ ...editing, spawn }); }} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3" /></label>
                <label className="text-sm">Blocks vision<select value={String(editing.blocksVision)} onChange={event => setEditing({ ...editing, blocksVision: event.target.value === 'true' })} className="mt-1 min-h-11 w-full rounded-lg bg-gray-800 px-3"><option value="true">Yes</option><option value="false">No</option></select></label>
              </div>
              <p className="mt-3 text-xs text-gray-400">Placement count and resource behavior follow the selected strategy. Variety weight chooses among objects already placed by that strategy; it does not increase object count.</p>
              <div className="mt-4 flex flex-wrap gap-2"><button type="submit" className="min-h-11 rounded-lg bg-amber-500 px-5 font-semibold text-gray-950">Save draft</button><button type="button" onClick={() => { setEditing(null); setOriginalId(null); setTab('browse'); setError(null); }} className="min-h-11 rounded-lg border border-white/20 px-5">Cancel</button></div>
            </form>
          </section>}
        </>}
      </div>
    </main>
  );
}

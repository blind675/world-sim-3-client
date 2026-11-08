import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObjectCatalog, SPAWN_STRATEGY } from '../src/lib/objectCatalog.ts';

const base = () => ({
  schemaVersion: 1, id: 'core', revision: 1,
  definitions: Object.entries(SPAWN_STRATEGY).map(([behavior, strategy]) => ({
    id: behavior, name: behavior, category: 'scenery', behavior,
    color: '#123456', sprite: behavior, blocksVision: false,
    spawn: { strategy, weight: 1 },
  })),
});

test('validates catalogue drafts and strips server-only hash', () => {
  const input = { ...base(), hash: 'server-hash' };
  const valid = validateObjectCatalog(input);
  assert.equal(valid.hash, undefined);
  assert.equal(valid.definitions.length, 5);
});

test('accepts a terrain-specific variety but rejects unsafe or incompatible entries', () => {
  const draft = base();
  draft.definitions.push({
    ...draft.definitions[0], id: 'pine_tree', name: 'Pine tree',
    spawn: { strategy: 'forest', weight: 0.5, preferredGroundTypes: ['forest_floor'] },
  });
  assert.equal(validateObjectCatalog(draft).definitions.length, 6);
  assert.throws(() => validateObjectCatalog({ ...draft, definitions: [...draft.definitions, draft.definitions[0]] }), /duplicate/);
  assert.throws(() => validateObjectCatalog({ ...draft, definitions: draft.definitions.map(def => def.id === 'pine_tree' ? { ...def, sprite: '../bad' } : def) }), /Invalid definition/);
});

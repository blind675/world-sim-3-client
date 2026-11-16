import type { ObjectCatalog, ObjectDefinition, WorldObjectType } from './types';

export type CatalogDraft = Omit<ObjectCatalog, 'hash'>;

export const SPAWN_STRATEGY: Record<WorldObjectType, string> = {
  tree: 'forest', rock: 'outcrop', food: 'berry_patch',
  water_source: 'shoreline', rest_spot: 'forest_rest',
};

const GROUND_TYPES = new Set([
  'deep_water', 'shallow_water', 'mud', 'rock', 'short_grass',
  'tall_grass', 'forest_floor', 'ground',
]);
const SLUG = /^[a-z][a-z0-9_]*$/;

export function validateObjectCatalog(input: unknown): CatalogDraft {
  const catalog = input as Partial<ObjectCatalog> | null;
  if (!catalog || catalog.schemaVersion !== 1 || !SLUG.test(catalog.id ?? '')
    || !Number.isSafeInteger(catalog.revision) || (catalog.revision ?? 0) < 1
    || !Array.isArray(catalog.definitions) || catalog.definitions.length === 0
    || catalog.definitions.length > 128) {
    throw new Error('Expected schemaVersion 1, a catalogue id, revision, and definitions.');
  }
  const ids = new Set<string>();
  for (const definition of catalog.definitions) {
    if (!definition || typeof definition !== 'object') throw new Error('Invalid object definition.');
    const def = definition as Partial<ObjectDefinition>;
    if (!SLUG.test(def.id ?? '') || ids.has(def.id!)) throw new Error(`Invalid or duplicate id: ${def.id}`);
    ids.add(def.id!);
    if (!def.name?.trim() || def.name.length > 80 || !SLUG.test(def.category ?? '')
      || !Object.prototype.hasOwnProperty.call(SPAWN_STRATEGY, def.behavior ?? '')
      || !/^#[0-9a-fA-F]{6}$/.test(def.color ?? '') || !SLUG.test(def.sprite ?? '')
      || typeof def.blocksVision !== 'boolean') throw new Error(`Invalid definition: ${def.id}`);
    const spawn = def.spawn;
    const habitat = spawn?.strategy === 'habitat';
    if (!spawn || (spawn.strategy !== SPAWN_STRATEGY[def.behavior!]
      && !(habitat && (def.behavior === 'tree' || def.behavior === 'food')))
      || !Number.isFinite(spawn.weight) || spawn.weight <= 0 || spawn.weight > 100
      || (spawn.preferredGroundTypes !== undefined && (!Array.isArray(spawn.preferredGroundTypes)
        || !spawn.preferredGroundTypes.every(type => GROUND_TYPES.has(type))))
      || (spawn.minHeight !== undefined && !Number.isFinite(spawn.minHeight))
      || (spawn.maxHeight !== undefined && !Number.isFinite(spawn.maxHeight))
      || (spawn.minHeight !== undefined && spawn.maxHeight !== undefined && spawn.minHeight > spawn.maxHeight)
      || (habitat && (!Number.isSafeInteger(spawn.candidatesPerChunk)
        || (spawn.candidatesPerChunk ?? 0) < 1 || (spawn.candidatesPerChunk ?? 0) > 64
        || !spawn.preferredGroundTypes?.length))
      || (!habitat && spawn.candidatesPerChunk !== undefined)) {
      throw new Error(`Invalid spawn settings: ${def.id}`);
    }
    if (def.lifecycle !== undefined && (def.behavior !== 'food' || !habitat || !def.lifecycle
      || !Number.isSafeInteger(def.lifecycle?.dynamicLifetimeTicks)
      || (def.lifecycle.dynamicLifetimeTicks ?? 0) < 1
      || (def.lifecycle.dynamicLifetimeTicks ?? 0) > 1440
      || Object.keys(def.lifecycle).length !== 1)) {
      throw new Error(`Invalid lifecycle: ${def.id}`);
    }
  }
  if (catalog.definitions.reduce((sum, def) => sum + (def.spawn.strategy === 'habitat'
    ? (def.spawn.candidatesPerChunk ?? 0) : 0), 0) > 256) {
    throw new Error('Habitat placement exceeds 256 attempts per chunk.');
  }
  for (const behavior of Object.keys(SPAWN_STRATEGY)) {
    const base = catalog.definitions.find(def => def.id === behavior && def.behavior === behavior);
    if (!base || base.spawn.preferredGroundTypes || base.spawn.minHeight !== undefined
      || base.spawn.maxHeight !== undefined) throw new Error(`Missing unrestricted base definition: ${behavior}`);
  }
  return {
    schemaVersion: 1,
    id: catalog.id!,
    revision: catalog.revision!,
    definitions: catalog.definitions,
  };
}

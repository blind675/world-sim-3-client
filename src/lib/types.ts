export type WrapMode = 'toroidal';

export interface WorldMeta {
  seed: number;
  width: number;
  height: number;
  cellSize: number;
  chunkSize: number;
  wrapMode: WrapMode;
  terrain: {
    minHeight: number;
    maxHeight: number;
    seaLevel: number;
  };
  simulation: { tickMs: number };
}

export type LayerName = 'height' | 'groundType' | 'waterDepth' | 'moveCost' | 'blocksVision';

export interface ViewportResponse {
  x: number;
  y: number;
  w: number;
  h: number;
  stride: number;
  outWidth: number;
  outHeight: number;
  wrap: WrapMode;
  worldWidth: number;
  worldHeight: number;
  layers: Partial<{
    height: number[];
    groundType: string[];
    waterDepth: number[];
    moveCost: number[];
    blocksVision: number[];
  }>;
}

export interface ChunkEntryResponse {
  cx: number;
  cy: number;
  size: number;
  layers: Partial<{
    height: number[];
    groundType: string[];
    waterDepth: number[];
    moveCost: number[];
    blocksVision: number[];
  }>;
}

export interface ChunksResponse {
  wrap: WrapMode;
  worldWidth: number;
  worldHeight: number;
  chunks: ChunkEntryResponse[];
}

export type WorldObjectType = 'tree' | 'rock' | 'food' | 'water_source' | 'rest_spot';

export interface WorldObject {
  id: string;
  type: WorldObjectType;
  x: number;
  y: number;
}

export interface EntitiesInViewResponse {
  x: number;
  y: number;
  w: number;
  h: number;
  objectCount: number;
  objects: WorldObject[];
}

export interface CellResponse {
  x: number;
  y: number;
  height: number;
  groundType: string;
  waterDepth: number;
  baseMoveCost: number | null;
  blocksVision: boolean;
}

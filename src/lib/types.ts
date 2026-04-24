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
  perception?: {
    coneDeg: number;
    coneHalfAngleRad: number;
    nearRadius: number;
    clusterRadius?: number;
    clusterMinCount?: number;
    clusterDecayMultiplier?: number;
  };
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
export type EntityType = WorldObjectType | 'agent';

export interface WorldObject {
  id: string;
  type: WorldObjectType;
  x: number;
  y: number;
}

export interface AgentInViewEntity {
  id: string;
  type: 'agent';
  x: number;
  y: number;
  facing: number;
  state: string;
  currentGoal?: AgentGoal;
  currentAction?: string;
  // Movement data for interpolation
  movementStartPos?: { x: number; y: number };
  targetPos?: { x: number; y: number };
  movementStartTick?: number;
  currentTick: number;
  moveSpeed: number;
  isMoving: boolean;
}

export type InViewEntity = WorldObject | AgentInViewEntity;

export interface EntitiesInViewResponse {
  x: number;
  y: number;
  w: number;
  h: number;
  objectCount: number;
  agentCount?: number;
  objects: InViewEntity[];
}

export interface AgentTraits {
  visionRange: number;
  memoryCapacity: number;
  memoryDecayRate: number;
  moveSpeed: number;
}

export interface AgentGoal {
  type: 'wander' | 'seek_food' | 'seek_water' | 'seek_rest' | string;
  targetX: number;
  targetY: number;
  memoryId?: string;
  memoryConfidence?: number;
}

export interface AgentSummary {
  id: string;
  x: number;
  y: number;
  facing: number;
  sex: 'female' | 'male';
  age: number;
  state: string;
  currentGoal: AgentGoal | null;
  currentAction: string | null;
  targetId: string | null;
  actionTargetId: string | null;
  actionTicksRemaining: number;
  hunger: number;
  thirst: number;
  tiredness: number;
  dead?: boolean;
  traits: AgentTraits;
  pathLength: number;
  pathIndex: number;
  pathRemaining: number;
}

export type MemoryEntryType = WorldObjectType | 'agent';

interface MemoryEntryBase {
  id: string;
  type: MemoryEntryType;
  x: number;
  y: number;
  firstSeenTick: number;
  lastSeenTick: number;
  confidence: number;
}

export interface MemoryEntryEntity extends MemoryEntryBase {
  kind: 'entity';
}

export interface MemoryEntryCluster extends MemoryEntryBase {
  kind: 'cluster';
  radius: number;
  count: number;
  memberIds: string[];
}

export type MemoryEntry = MemoryEntryEntity | MemoryEntryCluster;

export interface AgentDetail extends AgentSummary {
  inventory: unknown[];
  memory: MemoryEntry[];
  path: { x: number; y: number }[];
}

export interface PathResponse {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  length: number;
  path: { x: number; y: number }[];
}

export interface SimStepResponse {
  steps: number;
  agents: AgentSummary[];
}

export interface DeathRecord {
  id: string;
  agentId: string;
  x: number;
  y: number;
  tick: number;
  cause: 'hunger' | 'thirst' | 'tiredness' | 'unknown';
  timestamp: number;
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

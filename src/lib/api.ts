import type {
  AgentDetail,
  AgentInViewEntity,
  CellResponse,
  ChunksResponse,
  EntitiesInViewResponse,
  EntityType,
  LayerName,
  PathResponse,
  SimStepResponse,
  ViewportResponse,
  WorldMeta,
  WorldStatistics,
} from './types';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export function fetchMeta(signal?: AbortSignal) {
  return getJson<WorldMeta>('/api/world/meta', signal);
}

export function fetchViewport(
  params: { x: number; y: number; w: number; h: number; stride?: number; layers: LayerName[] },
  signal?: AbortSignal,
) {
  const q = new URLSearchParams({
    x: String(params.x),
    y: String(params.y),
    w: String(params.w),
    h: String(params.h),
    stride: String(params.stride ?? 1),
    layers: params.layers.join(','),
  });
  return getJson<ViewportResponse>(`/api/world/viewport?${q.toString()}`, signal);
}

export async function fetchChunks(
  chunks: Array<{ cx: number; cy: number }>,
  layers: LayerName[],
  signal?: AbortSignal,
): Promise<ChunksResponse> {
  const res = await fetch(`${BASE}/api/world/chunks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks, layers }),
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/world/chunks failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<ChunksResponse>;
}

export function fetchEntitiesInView(
  params: { x: number; y: number; w: number; h: number; types?: EntityType[] },
  signal?: AbortSignal,
) {
  const q = new URLSearchParams({
    x: String(params.x),
    y: String(params.y),
    w: String(params.w),
    h: String(params.h),
  });
  if (params.types && params.types.length > 0) q.set('types', params.types.join(','));
  return getJson<EntitiesInViewResponse>(`/api/entities/in-view?${q.toString()}`, signal);
}

export function fetchCell(x: number, y: number, signal?: AbortSignal) {
  const q = new URLSearchParams({ x: String(x), y: String(y) });
  return getJson<CellResponse>(`/api/world/cell?${q.toString()}`, signal);
}

export function fetchAgent(id: string, signal?: AbortSignal) {
  return getJson<AgentDetail>(`/api/agents/${encodeURIComponent(id)}`, signal);
}

export async function postAgentPath(
  id: string,
  target: { x: number; y: number },
  signal?: AbortSignal,
): Promise<PathResponse> {
  const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(target),
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/agents/${id}/path failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<PathResponse>;
}

export async function postSimStep(steps: number, signal?: AbortSignal): Promise<SimStepResponse> {
  const res = await fetch(`${BASE}/api/sim/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps }),
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/sim/step failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<SimStepResponse>;
}

export async function fetchAllAgents(signal?: AbortSignal): Promise<AgentInViewEntity[]> {
  const res = await fetch(`${BASE}/api/agents`, {
    method: 'GET',
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET /api/agents failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { agents: AgentInViewEntity[] };
  return data.agents || [];
}

export async function fetchTickCount(signal?: AbortSignal): Promise<{ tickCount: number; tickMs: number; agentCount: number }> {
  const res = await fetch(`${BASE}/api/simulation/status`, {
    method: 'GET',
    signal,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET /api/simulation/status failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ tickCount: number; tickMs: number; agentCount: number }>;
}

export function fetchWorldStatistics(signal?: AbortSignal) {
  return getJson<WorldStatistics>('/api/world/statistics', signal);
}

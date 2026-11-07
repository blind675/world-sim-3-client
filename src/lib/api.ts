import type {
  AgentDetail,
  AgentInViewEntity,
  CellResponse,
  ChunksResponse,
  EntitiesInViewResponse,
  EntityType,
  LayerName,
  ViewportResponse,
  WorldMeta,
  WorldStatistics,
} from './types';

// Netlify users sometimes enter a hostname without a scheme. Fetch would
// otherwise treat it as a path on the frontend's own origin.
const configuredBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || 'http://localhost:4000';
export const BACKEND_URL = (/^https?:\/\//i.test(configuredBackendUrl)
  ? configuredBackendUrl
  : `https://${configuredBackendUrl}`).replace(/\/+$/, '');

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { signal, cache: 'no-store' });
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
  const res = await fetch(`${BACKEND_URL}/api/world/chunks`, {
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

export async function fetchAllAgents(signal?: AbortSignal): Promise<AgentInViewEntity[]> {
  const res = await fetch(`${BACKEND_URL}/api/agents`, {
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

export async function fetchTickCount(
  signal?: AbortSignal,
  chunksReadyChecker?: () => boolean
): Promise<{ tickCount: number; tickMs: number; agentCount: number }> {
  // If chunks ready checker is provided, wait until chunks are ready
  if (chunksReadyChecker) {
    const maxWaitTime = 10000; // Maximum wait time of 10 seconds
    const startTime = Date.now();

    while (!chunksReadyChecker()) {
      if (Date.now() - startTime > maxWaitTime) {
        // Timeout after maxWaitTime, proceed anyway
        break;
      }
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const res = await fetch(`${BACKEND_URL}/api/simulation/status`, {
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

import type { CellResponse, LayerName, ViewportResponse, WorldMeta } from './types';

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

export function fetchCell(x: number, y: number, signal?: AbortSignal) {
  const q = new URLSearchParams({ x: String(x), y: String(y) });
  return getJson<CellResponse>(`/api/world/cell?${q.toString()}`, signal);
}

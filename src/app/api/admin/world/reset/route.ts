import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameSecret(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const password = process.env.WORLD_ADMIN_PASSWORD;
  const controlToken = process.env.CONTROL_API_TOKEN;
  const configuredBackend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
  if (!password || !controlToken) {
    return NextResponse.json({ error: 'Admin reset is not configured on this site.' }, { status: 503 });
  }
  let body: { password?: unknown; worldId?: unknown; confirmation?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (typeof body.password !== 'string' || body.password.length > 256 || !sameSecret(body.password, password)) {
    return NextResponse.json({ error: 'Invalid admin password.' }, { status: 401 });
  }
  if (typeof body.worldId !== 'string' || body.confirmation !== 'RESET WORLD') {
    return NextResponse.json({ error: 'World ID and confirmation are required.' }, { status: 400 });
  }
  const backend = /^https?:\/\//i.test(configuredBackend) ? configuredBackend : `https://${configuredBackend}`;
  if (process.env.NODE_ENV === 'production' && !backend.startsWith('https://')) {
    return NextResponse.json({ error: 'Backend must use HTTPS.' }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${backend.replace(/\/+$/, '')}/api/admin/world/reset`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${controlToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldId: body.worldId, confirmation: body.confirmation }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    const result = await upstream.json().catch(() => ({ error: 'Backend returned an invalid response.' }));
    return NextResponse.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not reach the backend.' }, { status: 502 });
  }
}

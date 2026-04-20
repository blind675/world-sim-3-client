// Color helpers for terrain visualization.

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Height gradient: deep water -> shallow -> beach -> grass -> hills -> rock/snow.
// Returns [r,g,b].
export function heightColor(
  h: number,
  minH: number,
  maxH: number,
  seaLevel: number,
): [number, number, number] {
  if (h < seaLevel) {
    const d = (seaLevel - h) / Math.max(1, seaLevel - minH);
    // deep -> shallow blue
    const t = clamp(1 - d, 0, 1);
    const r = Math.round(20 + 20 * t);
    const g = Math.round(40 + 80 * t);
    const b = Math.round(90 + 120 * t);
    return [r, g, b];
  }
  const range = Math.max(1, maxH - seaLevel);
  const t = clamp((h - seaLevel) / range, 0, 1);
  // Stops: beach (0), grass (0.12), hill (0.5), rock (0.85), peak (1.0)
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [214, 200, 150]],
    [0.05, [160, 180, 110]],
    [0.35, [90, 140, 70]],
    [0.7, [120, 110, 85]],
    [0.9, [170, 165, 160]],
    [1.0, [230, 230, 235]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export const GROUND_COLORS: Record<string, [number, number, number]> = {
  ground: [150, 170, 110],
  tall_grass: [100, 150, 80],
  forest_floor: [60, 95, 55],
  mud: [110, 85, 60],
  rock: [140, 135, 130],
  shallow_water: [90, 160, 200],
  deep_water: [30, 70, 130],
};

export function groundColor(t: string): [number, number, number] {
  return GROUND_COLORS[t] || [200, 50, 200];
}

// Water depth overlay (0 = none). Returns blue with alpha.
export function waterDepthColor(d: number, seaLevel: number, minH: number) {
  const depthMax = Math.max(1, seaLevel - minH);
  const t = clamp(d / depthMax, 0, 1);
  const r = 20 + 30 * (1 - t);
  const g = 80 + 60 * (1 - t);
  const b = 160 + 40 * (1 - t);
  return [Math.round(r), Math.round(g), Math.round(b)];
}

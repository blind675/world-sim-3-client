import type { AgentInViewEntity } from './types';

type Point = { x: number; y: number };

// Used only while an older backend is being replaced during deployment.
const legacySteps = new Map<string, { key: string; startedAt: number }>();

function between(from: Point, to: Point, progress: number, worldW: number, worldH: number): Point {
  const axis = (start: number, end: number, size: number) => {
    if (size <= 0) return start + (end - start) * progress;
    const delta = ((end - start + size * 1.5) % size) - size / 2;
    return ((start + delta * progress) % size + size) % size;
  };
  return { x: axis(from.x, to.x, worldW), y: axis(from.y, to.y, worldH) };
}

// A step spans two ticks and may traverse several adjacent path cells. Use
// the route polyline so a fast walker still turns around terrain and wraps.
export function interpolateAgentPosition(
  agent: AgentInViewEntity,
  animationTime: number,
  tickMs: number,
  worldW: number,
  worldH: number,
): Point {
  const path = agent.path ?? [];
  const origin = agent.isMoving && agent.movementStartPos ? agent.movementStartPos : agent;
  if (path.length > 0 && agent.timelineTickAt != null && Number.isFinite(agent.timelineTickAt) && tickMs > 0) {
    const stride = Math.max(1, Math.floor(agent.moveCellsPerStep ?? 1));
    const firstStepAt = agent.timelineTickAt + (agent.isMoving ? 0 : tickMs);
    // Predict only a few ticks without another server observation. If the
    // instance pauses or the network drops, hold instead of running away.
    const elapsed = Math.min(animationTime - firstStepAt, 4 * tickMs);
    if (elapsed <= 0) return { x: origin.x, y: origin.y };
    const stepIndex = Math.floor(elapsed / (2 * tickMs));
    const startIndex = stepIndex * stride;
    if (startIndex >= path.length) return path[path.length - 1];
    const segmentLength = Math.min(stride, path.length - startIndex);
    const progress = Math.min(1, (elapsed % (2 * tickMs)) / tickMs);
    const distance = progress * segmentLength;
    const cellIndex = Math.min(segmentLength - 1, Math.floor(distance));
    const from = cellIndex === 0
      ? (startIndex === 0 ? origin : path[startIndex - 1])
      : path[startIndex + cellIndex - 1];
    return between(from, path[startIndex + cellIndex], distance - cellIndex, worldW, worldH);
  }

  // A backend without timing metadata still gets one stable animation per
  // movement step. Reaching the target never restarts that same step.
  if (!agent.isMoving || !agent.movementStartPos || !agent.targetPos) {
    legacySteps.delete(agent.id);
    return { x: agent.x, y: agent.y };
  }
  const key = `${agent.movementStartTick}:${agent.targetPos.x},${agent.targetPos.y}`;
  const previous = legacySteps.get(agent.id);
  if (!previous || previous.key !== key) legacySteps.set(agent.id, { key, startedAt: animationTime });
  const progress = Math.min(1, (animationTime - legacySteps.get(agent.id)!.startedAt) / tickMs);
  return between(agent.movementStartPos, agent.targetPos, progress, worldW, worldH);
}

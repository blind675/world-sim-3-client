import type { AgentInViewEntity } from './types';

// Map to track movement start times for smooth interpolation (legacy)
export const movementStartTimes = new Map<string, number>();

// Interpolation function for smooth agent movement
export function interpolateAgentPosition(
  agent: AgentInViewEntity,
  currentAnimTime: number,
  tickMs: number,
): { x: number; y: number } {
  if (!agent.isMoving || !agent.movementStartPos || !agent.targetPos) {
    movementStartTimes.delete(agent.id);
    return { x: agent.x, y: agent.y };
  }

  const hasReachedTarget =
    Math.abs(agent.x - agent.targetPos.x) < 0.1 &&
    Math.abs(agent.y - agent.targetPos.y) < 0.1;

  if (hasReachedTarget) {
    movementStartTimes.delete(agent.id);
    return { x: agent.x, y: agent.y };
  }

  if (!movementStartTimes.has(agent.id)) {
    movementStartTimes.set(agent.id, currentAnimTime);
  }

  const movementDuration = tickMs / agent.moveSpeed;
  const elapsedSinceStart = currentAnimTime - movementStartTimes.get(agent.id)!;
  const progress = Math.min(elapsedSinceStart / movementDuration, 1);

  if (progress >= 1) {
    movementStartTimes.delete(agent.id);
    return { x: agent.targetPos.x, y: agent.targetPos.y };
  }

  return {
    x: agent.movementStartPos.x + (agent.targetPos.x - agent.movementStartPos.x) * progress,
    y: agent.movementStartPos.y + (agent.targetPos.y - agent.movementStartPos.y) * progress,
  };
}

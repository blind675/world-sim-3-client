import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolateAgentPosition } from '../src/lib/agentInterpolation.ts';
import { estimateTickAt } from '../src/lib/api.ts';

const tickMs = 1000;
const point = (x, y) => ({ x, y });
const sample = (agent, time, width = 100, height = 100) =>
  interpolateAgentPosition(agent, time, tickMs, width, height);

test('animates a whole planned route between polls, then holds at its end', () => {
  const agent = {
    id: 'a-1', x: 0, y: 0, isMoving: false, path: [point(1, 0), point(2, 0)],
    timelineTickAt: 0,
  };
  assert.deepEqual(sample(agent, 500), point(0, 0));
  assert.deepEqual(sample(agent, 1500), point(0.5, 0));
  assert.deepEqual(sample(agent, 2000), point(1, 0));
  assert.deepEqual(sample(agent, 3000), point(1, 0));
  assert.deepEqual(sample(agent, 3500), point(1.5, 0));
  assert.deepEqual(sample(agent, 4000), point(2, 0));
  assert.deepEqual(sample(agent, 10000), point(2, 0));
});

test('resumes a step in progress and takes the short direction across a seam', () => {
  const agent = {
    id: 'a-2', x: 9, y: 0, isMoving: true, movementStartPos: point(9, 0),
    targetPos: point(0, 0), path: [point(0, 0), point(1, 0)], timelineTickAt: 0,
  };
  assert.deepEqual(sample(agent, 500, 10, 10), point(9.5, 0));
  assert.deepEqual(sample(agent, 1000, 10, 10), point(0, 0));
  assert.deepEqual(sample(agent, 2500, 10, 10), point(0.5, 0));
});

test('fast walking follows path bends and wraps within one step', () => {
  const agent = {
    id: 'a-fast', x: 8, y: 0, isMoving: true, movementStartPos: point(8, 0),
    targetPos: point(0, 1), moveCellsPerStep: 3,
    path: [point(9, 0), point(0, 0), point(0, 1), point(1, 1)], timelineTickAt: 0,
  };
  assert.deepEqual(sample(agent, 500, 10, 10), point(9.5, 0));
  assert.deepEqual(sample(agent, 1000, 10, 10), point(0, 1));
  assert.deepEqual(sample(agent, 2500, 10, 10), point(0.5, 1));
});

test('holds after several ticks without a fresh server observation', () => {
  const agent = {
    id: 'a-3', x: 0, y: 0, isMoving: false,
    path: Array.from({ length: 20 }, (_, index) => point(index + 1, 0)),
    timelineTickAt: 0,
  };
  assert.deepEqual(sample(agent, 100000), point(2, 0));
});

test('old-server fallback does not replay a finished step', () => {
  const agent = {
    id: 'legacy', x: 0, y: 0, isMoving: true, movementStartTick: 4,
    movementStartPos: point(0, 0), targetPos: point(1, 0),
  };
  assert.deepEqual(sample(agent, 0), point(0, 0));
  assert.deepEqual(sample(agent, 500), point(0.5, 0));
  assert.deepEqual(sample(agent, 1000), point(1, 0));
  assert.deepEqual(sample(agent, 2000), point(1, 0));
});

test('server tick time is anchored without assuming matching client clocks', () => {
  assert.equal(estimateTickAt({ serverTime: 500000, lastTickAt: 499500 }, 100, 200), -350);
  assert.equal(estimateTickAt({ serverTime: 500000, lastTickAt: null }, 100, 200), undefined);
});

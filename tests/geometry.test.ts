import { describe, expect, it } from 'vitest';
import {
  bounds,
  distanceToSegment,
  emptySketch,
  footOfPerpendicular,
  hitTest,
  tidy,
} from '../src/core';
import { make } from './helpers';

const sketch = make({
  points: [
    [0, 0],
    [10, 0],
    [30, 30],
  ],
  lines: [['p1', 'p2']],
  circles: [['p3', 5]],
});

describe('hitTest', () => {
  it('picks a line when the cursor is near its middle', () => {
    expect(hitTest(sketch, { x: 5, y: 0.4 }, { tolerance: 1 })).toBe('l1');
  });

  it('prefers a point over the line it sits on', () => {
    expect(hitTest(sketch, { x: 0.3, y: 0.2 }, { tolerance: 1 })).toBe('p1');
  });

  it('picks a circle by its rim, not its inside', () => {
    expect(hitTest(sketch, { x: 35.3, y: 30 }, { tolerance: 1 })).toBe('c1');
    expect(hitTest(sketch, { x: 32, y: 31 }, { tolerance: 1 })).toBeNull();
  });

  it('does not treat the extension of a line as the line', () => {
    expect(hitTest(sketch, { x: 14, y: 0 }, { tolerance: 1 })).toBeNull();
  });

  it('returns null over empty space', () => {
    expect(hitTest(sketch, { x: -20, y: 20 }, { tolerance: 1 })).toBeNull();
  });

  it('can be limited to points', () => {
    expect(hitTest(sketch, { x: 5, y: 0 }, { tolerance: 1, pointsOnly: true })).toBeNull();
    expect(hitTest(sketch, { x: 10, y: 0.5 }, { tolerance: 1, pointsOnly: true })).toBe('p2');
  });

  it('takes the nearest when several are in range', () => {
    expect(hitTest(sketch, { x: 6, y: 0 }, { tolerance: 1, pointTolerance: 8 })).toBe('p2');
  });
});

describe('measuring', () => {
  it('finds the distance to a segment, clamping at its ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('drops a perpendicular onto the infinite line', () => {
    expect(footOfPerpendicular({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 13,
      y: 0,
    });
  });

  it('boxes in everything, including the full extent of circles', () => {
    expect(bounds(sketch)).toEqual({ minX: 0, minY: 0, maxX: 35, maxY: 35 });
    expect(bounds(emptySketch)).toBeNull();
  });

  it('tidies numbers for display', () => {
    expect(tidy(12.3456)).toBe(12.35);
    expect(tidy(40.000000001)).toBe(40);
    expect(Object.is(tidy(-0.0001), 0)).toBe(true);
  });
});

/**
 * Measuring and picking. None of this involves the solver.
 */

import { getCircle, getLine, getPoint } from './sketch';
import type { Id, Sketch } from './types';

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The two endpoints of a line. */
export function endpoints(sketch: Sketch, lineId: Id): [Vec, Vec] {
  const line = getLine(sketch, lineId);
  return [getPoint(sketch, line.a), getPoint(sketch, line.b)];
}

export function lineLength(sketch: Sketch, lineId: Id): number {
  const [a, b] = endpoints(sketch, lineId);
  return distance(a, b);
}

/** Shortest distance from a point to a line segment (not the infinite line). */
export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSquared));
  return distance(p, { x: a.x + t * vx, y: a.y + t * vy });
}

/** The point on the infinite line through a and b that is closest to p. */
export function footOfPerpendicular(p: Vec, a: Vec, b: Vec): Vec {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) return a;
  const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSquared;
  return { x: a.x + t * vx, y: a.y + t * vy };
}

export interface HitOptions {
  /** How close counts as a hit for lines and circle rims. */
  readonly tolerance: number;
  /** How close counts as a hit for points. Usually a little more generous. */
  readonly pointTolerance?: number;
  /** Only consider points. */
  readonly pointsOnly?: boolean;
}

/**
 * The entity under a position, or null. Points win over lines and circles,
 * because they are small and usually sit on top of them.
 */
export function hitTest(sketch: Sketch, at: Vec, options: HitOptions): Id | null {
  const pointTolerance = options.pointTolerance ?? options.tolerance;
  let best: Id | null = null;
  let bestDistance = Infinity;

  for (const e of sketch.entities) {
    if (e.kind !== 'point') continue;
    const d = distance(at, e);
    if (d <= pointTolerance && d < bestDistance) {
      best = e.id;
      bestDistance = d;
    }
  }
  if (best !== null || options.pointsOnly) return best;

  for (const e of sketch.entities) {
    let d = Infinity;
    if (e.kind === 'line') {
      d = distanceToSegment(at, getPoint(sketch, e.a), getPoint(sketch, e.b));
    } else if (e.kind === 'circle') {
      d = Math.abs(distance(at, getPoint(sketch, e.center)) - e.r);
    }
    if (d <= options.tolerance && d < bestDistance) {
      best = e.id;
      bestDistance = d;
    }
  }
  return best;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** The smallest box containing everything in the sketch, or null if it is empty. */
export function bounds(sketch: Sketch): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number, margin: number) => {
    minX = Math.min(minX, x - margin);
    minY = Math.min(minY, y - margin);
    maxX = Math.max(maxX, x + margin);
    maxY = Math.max(maxY, y + margin);
  };
  for (const e of sketch.entities) {
    if (e.kind === 'point') include(e.x, e.y, 0);
    else if (e.kind === 'circle') {
      const c = getCircle(sketch, e.id);
      const centre = getPoint(sketch, c.center);
      include(centre.x, centre.y, c.r);
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** Round to a sensible number of decimal places for showing to a person. */
export function tidy(value: number, places = 2): number {
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

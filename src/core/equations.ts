/**
 * Every constraint, written as equations the solver can drive to zero.
 *
 * Each equation reports two things for the current parameter values: how far
 * it is from being satisfied (`value`) and how that error changes when each
 * parameter it touches is nudged (`grads`). The derivatives are written out
 * by hand. The test suite checks every one of them against a numerical
 * derivative on random geometry, so a slip here fails loudly.
 *
 * All errors are measured in length units, so that one constraint is never
 * numerically "louder" than another. Angle errors are multiplied by the
 * length of the lines involved, frozen when the equations are compiled.
 */

import type { Layout } from './params';
import type { Constraint, ConstraintKind, Id, Sketch } from './types';

export interface Row {
  /** Signed error. Zero means the equation holds. */
  value: number;
  /** Indices of the parameters this equation depends on. May repeat. */
  cols: number[];
  /** d(value) / d(parameter), one per entry in `cols`. */
  grads: number[];
}

export interface CompiledConstraint {
  readonly id: Id;
  readonly kind: ConstraintKind;
  /** Evaluate this constraint's equations at the given parameter values. */
  evaluate(x: Float64Array): Row[];
}

const TINY = 1e-12;

/** Wrap an angle into (-pi/2, pi/2], treating a line and its reverse as the same direction. */
export function wrapHalfTurn(angle: number): number {
  return angle - Math.PI * Math.round(angle / Math.PI);
}

/** Distance between two points, minus a target. */
function distanceRow(x: Float64Array, p: number, q: number, target: number): Row {
  const dx = (x[p] as number) - (x[q] as number);
  const dy = (x[p + 1] as number) - (x[q + 1] as number);
  const len = Math.hypot(dx, dy);
  // Two points on top of each other have no direction to separate along. Pick one.
  const ux = len < TINY ? 1 : dx / len;
  const uy = len < TINY ? 0 : dy / len;
  return { value: len - target, cols: [p, p + 1, q, q + 1], grads: [ux, uy, -ux, -uy] };
}

/**
 * Angle from line A (a1 to a2) to line B (b1 to b2), minus an offset, wrapped
 * to half a turn and scaled to length units.
 *
 * The angle is atan2(cross, dot), which equals angle(B) - angle(A). Its
 * derivative with respect to a direction vector (vx, vy) is (-vy, vx) / |v|^2,
 * so it never vanishes. A cross-product formulation would stall when the
 * lines start out exactly perpendicular.
 */
function angleRow(
  x: Float64Array,
  a1: number,
  a2: number,
  b1: number,
  b2: number,
  offset: number,
  scale: number,
): Row {
  const ax = (x[a2] as number) - (x[a1] as number);
  const ay = (x[a2 + 1] as number) - (x[a1 + 1] as number);
  const bx = (x[b2] as number) - (x[b1] as number);
  const by = (x[b2 + 1] as number) - (x[b1 + 1] as number);
  const la2 = Math.max(ax * ax + ay * ay, TINY * TINY);
  const lb2 = Math.max(bx * bx + by * by, TINY * TINY);
  const theta = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  const dax = (scale * ay) / la2;
  const day = (-scale * ax) / la2;
  const dbx = (-scale * by) / lb2;
  const dby = (scale * bx) / lb2;
  return {
    value: scale * wrapHalfTurn(theta - offset),
    cols: [a2, a2 + 1, a1, a1 + 1, b2, b2 + 1, b1, b1 + 1],
    grads: [dax, day, -dax, -day, dbx, dby, -dbx, -dby],
  };
}

/** Signed distance from point p to the infinite line through a and b. */
function lineDistanceRow(x: Float64Array, p: number, a: number, b: number): Row {
  const ux = (x[p] as number) - (x[a] as number);
  const uy = (x[p + 1] as number) - (x[a + 1] as number);
  const vx = (x[b] as number) - (x[a] as number);
  const vy = (x[b + 1] as number) - (x[a + 1] as number);
  const len = Math.max(Math.hypot(vx, vy), TINY);
  const cross = ux * vy - uy * vx;
  const k = cross / (len * len * len);
  return {
    value: cross / len,
    cols: [p, p + 1, a, a + 1, b, b + 1],
    grads: [
      vy / len,
      -vx / len,
      (uy - vy) / len + k * vx,
      (vx - ux) / len + k * vy,
      -uy / len - k * vx,
      ux / len - k * vy,
    ],
  };
}

function lineLength(x: Float64Array, a: number, b: number): number {
  return Math.hypot(
    (x[b] as number) - (x[a] as number),
    (x[b + 1] as number) - (x[a + 1] as number),
  );
}

/**
 * Turn a sketch's constraints into equations over the parameter vector.
 *
 * `x0` is the geometry at the moment of compiling. It is only used to pick
 * the fixed length scale for angle equations.
 */
export function compile(sketch: Sketch, layout: Layout, x0: Float64Array): CompiledConstraint[] {
  const point = (id: Id): number => {
    const e = layout.entities.get(id);
    const at = layout.offsets.get(id);
    if (!e || e.kind !== 'point' || at === undefined) throw new Error(`No point "${id}"`);
    return at;
  };
  const line = (id: Id): [number, number] => {
    const e = layout.entities.get(id);
    if (!e || e.kind !== 'line') throw new Error(`No line "${id}"`);
    return [point(e.a), point(e.b)];
  };
  const circle = (id: Id): [number, number] => {
    const e = layout.entities.get(id);
    const at = layout.offsets.get(id);
    if (!e || e.kind !== 'circle' || at === undefined) throw new Error(`No circle "${id}"`);
    return [point(e.center), at];
  };

  const build = (c: Constraint): ((x: Float64Array) => Row[]) => {
    switch (c.kind) {
      case 'coincident': {
        const p = point(c.p);
        const q = point(c.q);
        return (x) => [
          { value: (x[p] as number) - (x[q] as number), cols: [p, q], grads: [1, -1] },
          {
            value: (x[p + 1] as number) - (x[q + 1] as number),
            cols: [p + 1, q + 1],
            grads: [1, -1],
          },
        ];
      }
      case 'horizontal': {
        const p = point(c.p) + 1;
        const q = point(c.q) + 1;
        return (x) => [
          { value: (x[p] as number) - (x[q] as number), cols: [p, q], grads: [1, -1] },
        ];
      }
      case 'vertical': {
        const p = point(c.p);
        const q = point(c.q);
        return (x) => [
          { value: (x[p] as number) - (x[q] as number), cols: [p, q], grads: [1, -1] },
        ];
      }
      case 'fixed': {
        const p = point(c.p);
        return (x) => [
          { value: (x[p] as number) - c.x, cols: [p], grads: [1] },
          { value: (x[p + 1] as number) - c.y, cols: [p + 1], grads: [1] },
        ];
      }
      case 'distance': {
        const p = point(c.p);
        const q = point(c.q);
        return (x) => [distanceRow(x, p, q, c.value)];
      }
      case 'parallel':
      case 'perpendicular': {
        const [a1, a2] = line(c.l1);
        const [b1, b2] = line(c.l2);
        const offset = c.kind === 'parallel' ? 0 : Math.PI / 2;
        const scale = Math.max((lineLength(x0, a1, a2) + lineLength(x0, b1, b2)) / 2, 1e-6);
        return (x) => [angleRow(x, a1, a2, b1, b2, offset, scale)];
      }
      case 'equalLength': {
        const [a1, a2] = line(c.l1);
        const [b1, b2] = line(c.l2);
        return (x) => {
          const first = distanceRow(x, a2, a1, 0);
          const second = distanceRow(x, b2, b1, 0);
          return [
            {
              value: first.value - second.value,
              cols: [...first.cols, ...second.cols],
              grads: [...first.grads, ...second.grads.map((g) => -g)],
            },
          ];
        };
      }
      case 'pointOnLine': {
        const p = point(c.p);
        const [a, b] = line(c.line);
        return (x) => [lineDistanceRow(x, p, a, b)];
      }
      case 'pointOnCircle': {
        const p = point(c.p);
        const [o, r] = circle(c.circle);
        return (x) => {
          const row = distanceRow(x, p, o, x[r] as number);
          row.cols.push(r);
          row.grads.push(-1);
          return [row];
        };
      }
      case 'radius': {
        const [, r] = circle(c.circle);
        return (x) => [{ value: (x[r] as number) - c.value, cols: [r], grads: [1] }];
      }
      case 'tangent': {
        const [a, b] = line(c.line);
        const [o, r] = circle(c.circle);
        return (x) => {
          // The centre must sit exactly one radius from the line, on either side.
          const row = lineDistanceRow(x, o, a, b);
          const sign = row.value < 0 ? -1 : 1;
          return [
            {
              value: sign * row.value - (x[r] as number),
              cols: [...row.cols, r],
              grads: [...row.grads.map((g) => sign * g), -1],
            },
          ];
        };
      }
      case 'equalRadius': {
        const [, r1] = circle(c.c1);
        const [, r2] = circle(c.c2);
        return (x) => [
          { value: (x[r1] as number) - (x[r2] as number), cols: [r1, r2], grads: [1, -1] },
        ];
      }
    }
  };

  return sketch.constraints.map((c) => ({ id: c.id, kind: c.kind, evaluate: build(c) }));
}

/** The largest absolute error among a constraint's equations. */
export function worstError(rows: readonly Row[]): number {
  let worst = 0;
  for (const row of rows) worst = Math.max(worst, Math.abs(row.value));
  return worst;
}

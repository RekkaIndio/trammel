/**
 * The constraint solver.
 *
 * Given a sketch whose geometry breaks some of its constraints, find nearby
 * geometry that satisfies all of them. "Nearby" matters: a sketch usually
 * has many valid shapes, and the one people expect is the one that moves
 * the least from where they left it.
 *
 * The method is Levenberg-Marquardt: repeatedly linearise the equations,
 * solve a damped least-squares problem for a step, and keep the step only if
 * it reduces the total error. With light damping each step is close to the
 * smallest move that fixes the linearised equations, which gives the
 * "moves the least" behaviour. Heavier damping kicks in automatically when a
 * step would make things worse.
 */

import { compile, worstError, type CompiledConstraint, type Row } from './equations';
import { choleskySolve } from './linalg';
import { buildLayout, readParams, writeParams } from './params';
import { setPoint, setRadius } from './sketch';
import type { Id, Sketch } from './types';

export interface SolveOptions {
  /** Give up after this many accepted steps. */
  maxIterations?: number;
  /** A constraint counts as satisfied when its error is below this, relative to the sketch's size. */
  tolerance?: number;
  /**
   * Entities the solver should avoid moving: points, or circles (their radius).
   * Dragging uses this so the thing under the cursor stays under the cursor
   * and the rest of the sketch does the adjusting.
   */
  stiff?: Iterable<Id>;
}

export interface SolveResult {
  /** The sketch with the solver's best geometry, whether or not it converged. */
  sketch: Sketch;
  /** True if every constraint ended up satisfied. */
  converged: boolean;
  iterations: number;
  /** The largest remaining error of each constraint, by constraint id. */
  errors: Map<Id, number>;
  /** The tolerance that was used, after scaling to the sketch's size. */
  tolerance: number;
}

export const DEFAULT_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITERATIONS = 100;
/**
 * How much harder it is to move a "stiff" parameter than an ordinary one.
 * Large enough that a dragged point stays within a hair of the cursor, small
 * enough that it can still give way when the constraints insist.
 */
const STIFF_WEIGHT = 1e6;
const DAMPING_START = 1e-8;
const DAMPING_MIN = 1e-12;
const MAX_ATTEMPTS = 24;

interface Evaluation {
  rows: Row[];
  /** Half the sum of squared errors. */
  cost: number;
  /** Largest absolute error. */
  worst: number;
}

function evaluateAll(compiled: readonly CompiledConstraint[], x: Float64Array): Evaluation {
  const rows: Row[] = [];
  let cost = 0;
  let worst = 0;
  for (const constraint of compiled) {
    for (const row of constraint.evaluate(x)) {
      rows.push(row);
      cost += 0.5 * row.value * row.value;
      worst = Math.max(worst, Math.abs(row.value));
    }
  }
  return { rows, cost, worst };
}

/** A sense of how big the numbers in a sketch are, so tolerances can scale with it. */
export function magnitude(x: Float64Array): number {
  let max = 1;
  for (const value of x) max = Math.max(max, Math.abs(value));
  return max;
}

interface Minimum {
  x: Float64Array;
  converged: boolean;
  iterations: number;
}

function minimise(
  compiled: readonly CompiledConstraint[],
  start: Float64Array,
  weights: Float64Array,
  maxIterations: number,
  tolerance: number,
): Minimum {
  const n = start.length;
  let x = Float64Array.from(start);
  let state = evaluateAll(compiled, x);
  let damping = DAMPING_START;
  let iterations = 0;

  const normal = new Float64Array(n * n); // J^T J
  const damped = new Float64Array(n * n);
  const gradient = new Float64Array(n); // J^T r
  const rhs = new Float64Array(n);

  while (state.worst > tolerance && iterations < maxIterations) {
    // Build the normal equations straight from the sparse rows.
    normal.fill(0);
    gradient.fill(0);
    for (const { value, cols, grads } of state.rows) {
      for (let a = 0; a < cols.length; a++) {
        const ca = cols[a] as number;
        const ga = grads[a] as number;
        gradient[ca] = (gradient[ca] as number) + ga * value;
        for (let b = 0; b < cols.length; b++) {
          const at = ca * n + (cols[b] as number);
          normal[at] = (normal[at] as number) + ga * (grads[b] as number);
        }
      }
    }

    let largest = 0;
    for (let i = 0; i < n; i++) largest = Math.max(largest, normal[i * n + i] as number);
    if (largest === 0) break; // no parameter can change any equation

    let accepted = false;
    let stalled = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !accepted; attempt++) {
      damped.set(normal);
      for (let i = 0; i < n; i++) {
        damped[i * n + i] =
          (damped[i * n + i] as number) + damping * largest * (weights[i] as number);
        rhs[i] = -(gradient[i] as number);
      }
      const step = choleskySolve(damped, rhs, n);
      if (step) {
        const trial = new Float64Array(n);
        for (let i = 0; i < n; i++) trial[i] = (x[i] as number) + (step[i] as number);
        const next = evaluateAll(compiled, trial);
        if (next.cost < state.cost) {
          stalled = state.cost - next.cost <= 1e-15 * state.cost;
          x = trial;
          state = next;
          damping = Math.max(damping / 10, DAMPING_MIN);
          accepted = true;
          continue;
        }
      }
      damping *= 10;
    }

    if (!accepted) break; // a local minimum: no step improves things
    iterations++;
    if (stalled) break; // improving, but by nothing that matters
  }

  return { x, converged: state.worst <= tolerance, iterations };
}

/** Solve a sketch's constraints, starting from its current geometry. */
export function solve(sketch: Sketch, options: SolveOptions = {}): SolveResult {
  const layout = buildLayout(sketch);
  const start = readParams(sketch, layout);
  const compiled = compile(sketch, layout, start);
  const tolerance = (options.tolerance ?? DEFAULT_TOLERANCE) * magnitude(start);

  const weights = new Float64Array(layout.size).fill(1);
  for (const id of options.stiff ?? []) {
    const at = layout.offsets.get(id);
    const entity = layout.entities.get(id);
    if (at === undefined || !entity) continue;
    weights[at] = STIFF_WEIGHT;
    if (entity.kind === 'point') weights[at + 1] = STIFF_WEIGHT;
  }

  const result = minimise(
    compiled,
    start,
    weights,
    options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    tolerance,
  );

  const errors = new Map<Id, number>();
  for (const constraint of compiled) {
    errors.set(constraint.id, worstError(constraint.evaluate(result.x)));
  }

  return {
    sketch: result.iterations === 0 ? sketch : writeParams(sketch, layout, result.x),
    converged: result.converged,
    iterations: result.iterations,
    errors,
    tolerance,
  };
}

/**
 * Solve, and keep the answer only if it worked.
 *
 * If the constraints cannot all be met, the sketch comes back unchanged
 * rather than bent into a compromise that satisfies none of them.
 */
export function settle(sketch: Sketch): Sketch {
  const result = solve(sketch);
  return result.converged ? result.sketch : sketch;
}

export type DragTarget =
  | { readonly kind: 'point'; readonly id: Id; readonly x: number; readonly y: number }
  | { readonly kind: 'radius'; readonly id: Id; readonly r: number };

/**
 * Pull parts of the sketch towards new positions while keeping every
 * constraint true. Whatever cannot follow (a pinned point, say) stays put.
 * If no valid geometry is found, the sketch comes back unchanged.
 */
export function drag(sketch: Sketch, targets: readonly DragTarget[]): Sketch {
  let seeded = sketch;
  for (const target of targets) {
    seeded =
      target.kind === 'point'
        ? setPoint(seeded, target.id, target.x, target.y)
        : setRadius(seeded, target.id, Math.max(target.r, 1e-6));
  }
  const result = solve(seeded, { stiff: targets.map((t) => t.id), maxIterations: 60 });
  return result.converged ? result.sketch : sketch;
}

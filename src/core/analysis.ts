/**
 * Working out what state a sketch is in.
 *
 * The solver answers "where should everything go?". This module answers the
 * questions a person sketching actually asks:
 *
 * - How much freedom is left? (degrees of freedom)
 * - Which parts can still move, and which are pinned down?
 * - Which constraints add nothing because others already imply them?
 * - Which constraints contradict each other?
 *
 * Freedom is counted with linear algebra. Each equation has a gradient: the
 * direction in parameter space it stops the sketch moving in. The number of
 * independent gradients (the rank) is how many freedoms the constraints
 * remove, so `freedom = parameters - rank`. A parameter is pinned down
 * exactly when those gradients fully cover its direction.
 */

import { compile, worstError } from './equations';
import { Basis } from './linalg';
import { buildLayout, readParams } from './params';
import { removeConstraint } from './sketch';
import { magnitude, solve } from './solver';
import type { Id, Sketch } from './types';

export type SketchState =
  /** Nothing drawn yet. */
  | 'empty'
  /** Valid, with freedom left: something can still be dragged. */
  | 'under'
  /** Valid, with no freedom left: every measurement is decided. */
  | 'full'
  /** Some constraints contradict each other. */
  | 'over';

export interface Analysis {
  readonly state: SketchState;
  /** How many independent ways the sketch can still move. */
  readonly freedom: number;
  readonly parameterCount: number;
  readonly equationCount: number;
  /** How many of the equations are independent. */
  readonly rank: number;
  /** Entities (points, lines, circles) that can still move. */
  readonly free: ReadonlySet<Id>;
  /** Constraints that change nothing because the others already imply them. */
  readonly redundant: ReadonlySet<Id>;
  /** Constraints that cannot all be true at once. */
  readonly conflicting: ReadonlySet<Id>;
}

/** Errors below this (relative to the sketch's size) count as "satisfied" for display. */
const SATISFIED = 1e-6;
/** A parameter counts as pinned when the constraints cover this much of its direction. */
const COVERED = 1 - 1e-7;

function findConflicts(sketch: Sketch, threshold: number): Set<Id> {
  const compromise = solve(sketch);
  if (compromise.converged) return new Set(); // merely unsolved, not contradictory

  // Everything left unsatisfied at the best compromise is involved somehow.
  const involved = sketch.constraints
    .filter((c) => (compromise.errors.get(c.id) ?? 0) > threshold)
    .map((c) => c.id);

  // Narrow it down: a constraint is a culprit if removing it alone makes the
  // rest solvable. A pin that merely got dragged along by the tug of war is
  // not, so it drops out here.
  const culprits = involved.filter((id) => solve(removeConstraint(sketch, id)).converged);
  return new Set(culprits.length > 0 ? culprits : involved);
}

export function analyse(sketch: Sketch): Analysis {
  const layout = buildLayout(sketch);
  const x = readParams(sketch, layout);
  const compiled = compile(sketch, layout, x);
  const n = layout.size;
  const threshold = SATISFIED * magnitude(x);

  const basis = new Basis();
  const redundant = new Set<Id>();
  let equationCount = 0;
  let unsatisfied = false;

  for (const constraint of compiled) {
    const rows = constraint.evaluate(x);
    if (worstError(rows) > threshold) unsatisfied = true;
    for (const row of rows) {
      equationCount++;
      const dense = new Float64Array(n);
      for (let i = 0; i < row.cols.length; i++) {
        const col = row.cols[i] as number;
        dense[col] = (dense[col] as number) + (row.grads[i] as number);
      }
      if (!basis.add(dense)) redundant.add(constraint.id);
    }
  }

  const conflicting = unsatisfied ? findConflicts(sketch, threshold) : new Set<Id>();

  const isFree = (index: number) => basis.coverage(index) < COVERED;
  const free = new Set<Id>();
  for (const entity of sketch.entities) {
    if (entity.kind !== 'point') continue;
    const at = layout.offsets.get(entity.id) as number;
    if (isFree(at) || isFree(at + 1)) free.add(entity.id);
  }
  for (const entity of sketch.entities) {
    if (entity.kind === 'line') {
      if (free.has(entity.a) || free.has(entity.b)) free.add(entity.id);
    } else if (entity.kind === 'circle') {
      const at = layout.offsets.get(entity.id) as number;
      if (isFree(at) || free.has(entity.center)) free.add(entity.id);
    }
  }

  const freedom = n - basis.rank;
  let state: SketchState;
  if (conflicting.size > 0) state = 'over';
  else if (n === 0) state = 'empty';
  else if (freedom === 0) state = 'full';
  else state = 'under';

  return {
    state,
    freedom,
    parameterCount: n,
    equationCount,
    rank: basis.rank,
    free,
    redundant,
    conflicting,
  };
}

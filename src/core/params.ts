/**
 * The bridge between a sketch and the flat list of numbers the solver works on.
 *
 * Each point contributes two parameters (x then y) and each circle one
 * (its radius). Lines contribute none: they are defined by their points.
 */

import type { Entity, Id, Sketch } from './types';

export interface Layout {
  /** Total number of parameters. */
  readonly size: number;
  /** Point id to the index of its x (y is the next one). Circle id to the index of its radius. */
  readonly offsets: ReadonlyMap<Id, number>;
  readonly entities: ReadonlyMap<Id, Entity>;
}

export function buildLayout(sketch: Sketch): Layout {
  const offsets = new Map<Id, number>();
  const entities = new Map<Id, Entity>();
  let size = 0;
  for (const e of sketch.entities) {
    entities.set(e.id, e);
    if (e.kind === 'point') {
      offsets.set(e.id, size);
      size += 2;
    } else if (e.kind === 'circle') {
      offsets.set(e.id, size);
      size += 1;
    }
  }
  return { size, offsets, entities };
}

export function readParams(sketch: Sketch, layout: Layout): Float64Array {
  const x = new Float64Array(layout.size);
  for (const e of sketch.entities) {
    const at = layout.offsets.get(e.id);
    if (at === undefined) continue;
    if (e.kind === 'point') {
      x[at] = e.x;
      x[at + 1] = e.y;
    } else if (e.kind === 'circle') {
      x[at] = e.r;
    }
  }
  return x;
}

/** A copy of the sketch with its geometry replaced by the parameter values. */
export function writeParams(sketch: Sketch, layout: Layout, x: Float64Array): Sketch {
  const entities = sketch.entities.map((e): Entity => {
    const at = layout.offsets.get(e.id);
    if (at === undefined) return e;
    if (e.kind === 'point') return { ...e, x: x[at] as number, y: x[at + 1] as number };
    if (e.kind === 'circle') return { ...e, r: x[at] as number };
    return e;
  });
  return { ...sketch, entities };
}

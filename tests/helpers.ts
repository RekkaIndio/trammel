import {
  addCircle,
  addConstraints,
  addLine,
  addPoint,
  buildLayout,
  compile,
  emptySketch,
  readParams,
  type Id,
  type NewConstraint,
  type Sketch,
} from '../src/core';

/** Build a sketch from a compact description. Ids come out as p1.., l1.., c1.., k1.. in order. */
export function make(spec: {
  points?: readonly (readonly [number, number])[];
  lines?: readonly (readonly [Id, Id])[];
  circles?: readonly (readonly [Id, number])[];
  constraints?: readonly NewConstraint[];
}): Sketch {
  let sketch = emptySketch;
  for (const [x, y] of spec.points ?? []) sketch = addPoint(sketch, x, y).sketch;
  for (const [a, b] of spec.lines ?? []) sketch = addLine(sketch, a, b).sketch;
  for (const [center, r] of spec.circles ?? []) sketch = addCircle(sketch, center, r).sketch;
  return addConstraints(sketch, spec.constraints ?? []);
}

export function pointAt(sketch: Sketch, id: Id): { x: number; y: number } {
  const e = sketch.entities.find((entity) => entity.id === id);
  if (!e || e.kind !== 'point') throw new Error(`no point ${id}`);
  return { x: e.x, y: e.y };
}

export function radiusOf(sketch: Sketch, id: Id): number {
  const e = sketch.entities.find((entity) => entity.id === id);
  if (!e || e.kind !== 'circle') throw new Error(`no circle ${id}`);
  return e.r;
}

export function dist(sketch: Sketch, a: Id, b: Id): number {
  const p = pointAt(sketch, a);
  const q = pointAt(sketch, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** The largest error of any constraint at the sketch's current geometry. */
export function worstErrorOf(sketch: Sketch): number {
  const layout = buildLayout(sketch);
  const x = readParams(sketch, layout);
  let worst = 0;
  for (const c of compile(sketch, layout, x)) {
    for (const row of c.evaluate(x)) worst = Math.max(worst, Math.abs(row.value));
  }
  return worst;
}

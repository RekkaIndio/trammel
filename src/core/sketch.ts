/**
 * Pure editing operations on a sketch. Every function returns a new sketch
 * and leaves its input untouched, which is what makes undo a matter of
 * keeping old values around.
 */

import {
  CONSTRAINT_REFS,
  constraintRefs,
  type CircleEntity,
  type Constraint,
  type Entity,
  type Id,
  type LineEntity,
  type NewConstraint,
  type PointEntity,
  type Sketch,
} from './types';

export const emptySketch: Sketch = { entities: [], constraints: [] };

export class SketchError extends Error {
  override name = 'SketchError';
}

type Prefix = 'p' | 'l' | 'c' | 'k';

/** The next unused id with this prefix: p1, p2, and so on. */
export function nextId(sketch: Sketch, prefix: Prefix): Id {
  let max = 0;
  const scan = (id: Id) => {
    if (id.startsWith(prefix)) {
      const n = Number(id.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
  };
  if (prefix === 'k') sketch.constraints.forEach((c) => scan(c.id));
  else sketch.entities.forEach((e) => scan(e.id));
  return `${prefix}${max + 1}`;
}

export function findEntity(sketch: Sketch, id: Id): Entity | undefined {
  return sketch.entities.find((e) => e.id === id);
}

export function getPoint(sketch: Sketch, id: Id): PointEntity {
  const e = findEntity(sketch, id);
  if (!e || e.kind !== 'point') throw new SketchError(`No point with id "${id}"`);
  return e;
}

export function getLine(sketch: Sketch, id: Id): LineEntity {
  const e = findEntity(sketch, id);
  if (!e || e.kind !== 'line') throw new SketchError(`No line with id "${id}"`);
  return e;
}

export function getCircle(sketch: Sketch, id: Id): CircleEntity {
  const e = findEntity(sketch, id);
  if (!e || e.kind !== 'circle') throw new SketchError(`No circle with id "${id}"`);
  return e;
}

function assertFinite(value: unknown, what: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SketchError(`${what} must be a finite number`);
  }
}

function assertPositive(value: unknown, what: string): asserts value is number {
  assertFinite(value, what);
  if (value <= 0) throw new SketchError(`${what} must be greater than zero`);
}

export function addPoint(sketch: Sketch, x: number, y: number): { sketch: Sketch; id: Id } {
  assertFinite(x, 'x');
  assertFinite(y, 'y');
  const id = nextId(sketch, 'p');
  const point: PointEntity = { kind: 'point', id, x, y };
  return { sketch: { ...sketch, entities: [...sketch.entities, point] }, id };
}

export function addLine(sketch: Sketch, a: Id, b: Id): { sketch: Sketch; id: Id } {
  getPoint(sketch, a);
  getPoint(sketch, b);
  if (a === b) throw new SketchError('A line needs two different points');
  const id = nextId(sketch, 'l');
  const line: LineEntity = { kind: 'line', id, a, b };
  return { sketch: { ...sketch, entities: [...sketch.entities, line] }, id };
}

export function addCircle(sketch: Sketch, center: Id, r: number): { sketch: Sketch; id: Id } {
  getPoint(sketch, center);
  assertPositive(r, 'Radius');
  const id = nextId(sketch, 'c');
  const circle: CircleEntity = { kind: 'circle', id, center, r };
  return { sketch: { ...sketch, entities: [...sketch.entities, circle] }, id };
}

/** Check a constraint points at real entities of the right kind and is not degenerate. */
export function validateConstraint(sketch: Sketch, c: Constraint | NewConstraint): void {
  // hasOwn, not a plain lookup: a kind of "toString" must not find Object's method.
  if (typeof c.kind !== 'string' || !Object.hasOwn(CONSTRAINT_REFS, c.kind)) {
    throw new SketchError(`Unknown kind of constraint: "${String(c.kind)}"`);
  }
  const expected: Readonly<Record<string, string>> = CONSTRAINT_REFS[c.kind];
  const record = c as unknown as Record<string, unknown>;
  const seen = new Set<Id>();
  for (const [field, kind] of Object.entries(expected)) {
    const ref = record[field];
    if (typeof ref !== 'string') throw new SketchError(`"${c.kind}" is missing "${field}"`);
    const entity = findEntity(sketch, ref);
    if (!entity || entity.kind !== kind) {
      throw new SketchError(`"${c.kind}" needs "${field}" to be a ${kind}, but "${ref}" is not`);
    }
    if (seen.has(ref)) throw new SketchError(`"${c.kind}" needs two different ${kind}s`);
    seen.add(ref);
  }
  if (c.kind === 'distance' || c.kind === 'radius') assertPositive(c.value, 'Value');
  if (c.kind === 'fixed') {
    assertFinite(c.x, 'x');
    assertFinite(c.y, 'y');
  }
}

export function addConstraint(sketch: Sketch, c: NewConstraint): { sketch: Sketch; id: Id } {
  validateConstraint(sketch, c);
  const id = nextId(sketch, 'k');
  const constraint = { ...c, id } as Constraint;
  return { sketch: { ...sketch, constraints: [...sketch.constraints, constraint] }, id };
}

export function addConstraints(sketch: Sketch, list: readonly NewConstraint[]): Sketch {
  return list.reduce((s, c) => addConstraint(s, c).sketch, sketch);
}

export function removeConstraint(sketch: Sketch, id: Id): Sketch {
  return { ...sketch, constraints: sketch.constraints.filter((c) => c.id !== id) };
}

/** Change the number on a distance or radius constraint. */
export function setConstraintValue(sketch: Sketch, id: Id, value: number): Sketch {
  assertPositive(value, 'Value');
  let found = false;
  const constraints = sketch.constraints.map((c) => {
    if (c.id !== id) return c;
    if (c.kind !== 'distance' && c.kind !== 'radius') {
      throw new SketchError(`A "${c.kind}" constraint has no value to change`);
    }
    found = true;
    return { ...c, value };
  });
  if (!found) throw new SketchError(`No constraint with id "${id}"`);
  return { ...sketch, constraints };
}

/** Ids of the points an entity is built on. A point is built on itself. */
export function pointsOf(entity: Entity): Id[] {
  switch (entity.kind) {
    case 'point':
      return [entity.id];
    case 'line':
      return [entity.a, entity.b];
    case 'circle':
      return [entity.center];
  }
}

/**
 * Delete entities and everything that can no longer exist without them.
 *
 * - Deleting a point deletes the lines and circles built on it.
 * - Deleting a line or circle deletes its points too, unless another line
 *   or circle still uses them.
 * - Constraints that mention anything deleted are deleted.
 */
export function removeEntities(sketch: Sketch, ids: Iterable<Id>): Sketch {
  const requested = new Set(ids);
  const doomed = new Set<Id>();
  for (const e of sketch.entities) if (requested.has(e.id)) doomed.add(e.id);

  // Shapes cannot outlive the points they are built on.
  for (const e of sketch.entities) {
    if (e.kind !== 'point' && pointsOf(e).some((p) => doomed.has(p))) doomed.add(e.id);
  }

  // Points that only existed to hold up a deleted shape go with it.
  const stillUsed = new Set<Id>();
  const candidates = new Set<Id>();
  for (const e of sketch.entities) {
    if (e.kind === 'point') continue;
    for (const p of pointsOf(e)) (doomed.has(e.id) ? candidates : stillUsed).add(p);
  }
  for (const p of candidates) if (!stillUsed.has(p)) doomed.add(p);

  if (doomed.size === 0) return sketch;
  return {
    entities: sketch.entities.filter((e) => !doomed.has(e.id)),
    constraints: sketch.constraints.filter((c) => !constraintRefs(c).some((r) => doomed.has(r))),
  };
}

/** Move a point without solving. Used to seed a drag. */
export function setPoint(sketch: Sketch, id: Id, x: number, y: number): Sketch {
  return {
    ...sketch,
    entities: sketch.entities.map((e) => (e.id === id && e.kind === 'point' ? { ...e, x, y } : e)),
  };
}

/** Change a circle's radius without solving. Used to seed a drag. */
export function setRadius(sketch: Sketch, id: Id, r: number): Sketch {
  return {
    ...sketch,
    entities: sketch.entities.map((e) => (e.id === id && e.kind === 'circle' ? { ...e, r } : e)),
  };
}

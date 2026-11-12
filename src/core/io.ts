/**
 * Saving, loading and exporting.
 *
 * Sketch files are plain JSON so they are easy to read, diff and keep in
 * version control. Loading never trusts the file: every entity and
 * constraint is checked, and a bad file produces a message that says what
 * is wrong with it.
 */

import { bounds } from './geometry';
import { SketchError, addCircle, addLine, getPoint, pointsOf, validateConstraint } from './sketch';
import {
  CONSTRAINT_REFS,
  type Constraint,
  type ConstraintKind,
  type Entity,
  type Id,
  type PointEntity,
  type Sketch,
} from './types';

export const FILE_FORMAT = 'trammel-sketch';
export const FILE_VERSION = 1;

export interface SketchFile {
  readonly sketch: Sketch;
  readonly name: string | null;
}

export function serialise(sketch: Sketch, name?: string | null): string {
  const file = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    ...(name ? { name } : {}),
    entities: sketch.entities,
    constraints: sketch.constraints,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readId(value: unknown, what: string): Id {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new SketchError(`${what} needs a text id`);
  }
  return value;
}

function readNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SketchError(`${what} must be a number`);
  }
  return value;
}

function cleanConstraint(raw: Record<string, unknown>, id: Id): Constraint {
  const kind = raw.kind as ConstraintKind;
  const out: Record<string, unknown> = { kind, id };
  for (const field of Object.keys(CONSTRAINT_REFS[kind])) out[field] = raw[field];
  if (kind === 'distance' || kind === 'radius') out.value = raw.value;
  if (kind === 'fixed') {
    out.x = raw.x;
    out.y = raw.y;
  }
  return out as unknown as Constraint;
}

/** Read a sketch file. Throws a SketchError with a readable message if it is not valid. */
export function parse(text: string): SketchFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SketchError('This file is not valid JSON, so it cannot be a Trammel sketch.');
  }
  if (!isRecord(data) || data.format !== FILE_FORMAT) {
    throw new SketchError('This file is not a Trammel sketch.');
  }
  if (typeof data.version !== 'number' || data.version < 1) {
    throw new SketchError('This sketch file does not say which format version it uses.');
  }
  if (data.version > FILE_VERSION) {
    throw new SketchError(
      `This sketch was saved in format ${data.version}. This version of Trammel reads format ${FILE_VERSION}.`,
    );
  }
  if (!Array.isArray(data.entities) || !Array.isArray(data.constraints)) {
    throw new SketchError('This sketch file is missing its list of entities or constraints.');
  }

  const claimIn = (seen: Set<Id>, what: string) => (id: Id) => {
    if (seen.has(id)) throw new SketchError(`${what} id "${id}" appears twice`);
    seen.add(id);
  };
  const claimEntity = claimIn(new Set(), 'Entity');
  const claimConstraint = claimIn(new Set(), 'Constraint');

  const rawEntities = data.entities.map((raw: unknown) => {
    if (!isRecord(raw)) throw new SketchError('Every entity must be an object');
    return raw;
  });

  // Points first, so lines and circles can be checked against them whatever
  // order the file lists things in.
  const points = new Map<Id, PointEntity>();
  for (const raw of rawEntities) {
    if (raw.kind !== 'point') continue;
    const id = readId(raw.id, 'A point');
    claimEntity(id);
    points.set(id, {
      kind: 'point',
      id,
      x: readNumber(raw.x, `Point "${id}" x`),
      y: readNumber(raw.y, `Point "${id}" y`),
    });
  }
  const pointsOnly: Sketch = { entities: [...points.values()], constraints: [] };

  const entities: Entity[] = [];
  for (const raw of rawEntities) {
    if (raw.kind === 'point') {
      entities.push(points.get(raw.id as Id) as PointEntity);
    } else if (raw.kind === 'line') {
      const id = readId(raw.id, 'A line');
      claimEntity(id);
      const a = readId(raw.a, `Line "${id}"`);
      const b = readId(raw.b, `Line "${id}"`);
      addLine(pointsOnly, a, b); // checks both ends exist and differ
      entities.push({ kind: 'line', id, a, b });
    } else if (raw.kind === 'circle') {
      const id = readId(raw.id, 'A circle');
      claimEntity(id);
      const center = readId(raw.center, `Circle "${id}"`);
      const r = readNumber(raw.r, `Circle "${id}" radius`);
      addCircle(pointsOnly, center, r); // checks the centre exists and the radius is positive
      entities.push({ kind: 'circle', id, center, r });
    } else {
      throw new SketchError(`Unknown kind of entity: "${String(raw.kind)}"`);
    }
  }
  const geometry: Sketch = { entities, constraints: [] };

  const constraints: Constraint[] = [];
  for (const raw of data.constraints as unknown[]) {
    if (!isRecord(raw)) throw new SketchError('Every constraint must be an object');
    const id = readId(raw.id, 'A constraint');
    claimConstraint(id);
    validateConstraint(geometry, raw as unknown as Constraint);
    constraints.push(cleanConstraint(raw, id)); // only known fields survive
  }

  const name = typeof data.name === 'string' ? data.name.trim().slice(0, 80) : '';
  return { sketch: { entities, constraints }, name: name || null };
}

function fmt(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Export the geometry as a standalone SVG drawing, one unit per sketch unit.
 * Constraints are not drawn: this is the output you would send to a laser
 * cutter or import into another drawing program.
 */
export function toSvg(sketch: Sketch, padding = 5): string {
  const box = bounds(sketch) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const width = box.maxX - box.minX + 2 * padding;
  const height = box.maxY - box.minY + 2 * padding;
  // SVG's y axis points down. Sketches, like graph paper, point up.
  const sx = (x: number) => fmt(x - box.minX + padding);
  const sy = (y: number) => fmt(box.maxY - y + padding);

  const used = new Set<Id>();
  const shapes: string[] = [];
  for (const e of sketch.entities) {
    if (e.kind === 'line') {
      const a = getPoint(sketch, e.a);
      const b = getPoint(sketch, e.b);
      shapes.push(`  <line x1="${sx(a.x)}" y1="${sy(a.y)}" x2="${sx(b.x)}" y2="${sy(b.y)}"/>`);
    } else if (e.kind === 'circle') {
      const c = getPoint(sketch, e.center);
      shapes.push(`  <circle cx="${sx(c.x)}" cy="${sy(c.y)}" r="${fmt(e.r)}"/>`);
    }
    if (e.kind !== 'point') pointsOf(e).forEach((p) => used.add(p));
  }
  // Points that are not part of any shape are drawn as small dots.
  for (const e of sketch.entities) {
    if (e.kind === 'point' && !used.has(e.id)) {
      shapes.push(`  <circle cx="${sx(e.x)}" cy="${sy(e.y)}" r="0.5" fill="#000" stroke="none"/>`);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}mm" height="${fmt(height)}mm" fill="none" stroke="#000" stroke-width="0.35" stroke-linecap="round">`,
    ...shapes,
    '</svg>',
    '',
  ].join('\n');
}

import { describe, expect, it } from 'vitest';
import {
  SketchError,
  addCircle,
  addConstraint,
  addLine,
  addPoint,
  emptySketch,
  nextId,
  removeConstraint,
  removeEntities,
  setConstraintValue,
  type NewConstraint,
} from '../src/core';
import { make } from './helpers';

const ids = (sketch: { entities: readonly { id: string }[] }) => sketch.entities.map((e) => e.id);

describe('building a sketch', () => {
  it('hands out ids in order, by kind', () => {
    const sketch = make({
      points: [
        [0, 0],
        [1, 1],
      ],
      lines: [['p1', 'p2']],
      circles: [['p1', 3]],
      constraints: [{ kind: 'horizontal', p: 'p1', q: 'p2' }],
    });
    expect(ids(sketch)).toEqual(['p1', 'p2', 'l1', 'c1']);
    expect(sketch.constraints[0]?.id).toBe('k1');
    expect(nextId(sketch, 'p')).toBe('p3');
    expect(nextId(sketch, 'k')).toBe('k2');
  });

  it('never reuses an id that is still present after a deletion', () => {
    let sketch = make({
      points: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    });
    sketch = removeEntities(sketch, ['p2']);
    expect(addPoint(sketch, 5, 5).id).toBe('p4');
  });

  it('does not change the sketch it was given', () => {
    const before = make({ points: [[0, 0]] });
    const snapshot = JSON.stringify(before);
    addPoint(before, 1, 1);
    addCircle(before, 'p1', 2);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('rejects shapes that make no sense', () => {
    const sketch = make({ points: [[0, 0]], circles: [['p1', 1]] });
    expect(() => addLine(sketch, 'p1', 'p1')).toThrow(SketchError);
    expect(() => addLine(sketch, 'p1', 'nope')).toThrow(SketchError);
    expect(() => addLine(sketch, 'p1', 'c1')).toThrow(SketchError);
    expect(() => addCircle(sketch, 'p1', 0)).toThrow(SketchError);
    expect(() => addCircle(sketch, 'p1', -2)).toThrow(SketchError);
    expect(() => addPoint(sketch, NaN, 0)).toThrow(SketchError);
    expect(() => addPoint(sketch, 0, Infinity)).toThrow(SketchError);
  });
});

describe('constraints', () => {
  const base = make({
    points: [
      [0, 0],
      [10, 0],
      [5, 5],
    ],
    lines: [['p1', 'p2']],
    circles: [['p3', 2]],
  });

  it.each<[string, NewConstraint]>([
    ['a missing entity', { kind: 'horizontal', p: 'p1', q: 'p9' }],
    ['the wrong kind of entity', { kind: 'parallel', l1: 'l1', l2: 'p1' }],
    ['the same entity twice', { kind: 'coincident', p: 'p1', q: 'p1' }],
    ['a zero distance', { kind: 'distance', p: 'p1', q: 'p2', value: 0 }],
    ['a negative radius', { kind: 'radius', circle: 'c1', value: -1 }],
    ['a non-finite pin', { kind: 'fixed', p: 'p1', x: NaN, y: 0 }],
  ])('rejects %s', (_label, constraint) => {
    expect(() => addConstraint(base, constraint)).toThrow(SketchError);
  });

  it('rejects kinds it does not know, including names borrowed from Object', () => {
    for (const kind of ['wobbly', 'toString', 'constructor', '__proto__']) {
      const bogus = { kind, p: 'p1', q: 'p2' } as unknown as NewConstraint;
      expect(() => addConstraint(base, bogus)).toThrow(SketchError);
    }
  });

  it('changes the value of a dimension, and only a dimension', () => {
    let sketch = addConstraint(base, { kind: 'distance', p: 'p1', q: 'p2', value: 10 }).sketch;
    sketch = addConstraint(sketch, { kind: 'horizontal', p: 'p1', q: 'p2' }).sketch;
    const changed = setConstraintValue(sketch, 'k1', 25);
    expect(changed.constraints[0]).toMatchObject({ kind: 'distance', value: 25 });
    expect(() => setConstraintValue(sketch, 'k2', 5)).toThrow(SketchError);
    expect(() => setConstraintValue(sketch, 'k1', 0)).toThrow(SketchError);
    expect(() => setConstraintValue(sketch, 'k9', 5)).toThrow(SketchError);
  });

  it('removes a constraint by id', () => {
    const sketch = addConstraint(base, { kind: 'horizontal', p: 'p1', q: 'p2' }).sketch;
    expect(removeConstraint(sketch, 'k1').constraints).toHaveLength(0);
  });
});

describe('deleting', () => {
  // A triangle p1-p2-p3 plus a separate circle on p4.
  const triangle = make({
    points: [
      [0, 0],
      [10, 0],
      [5, 8],
      [30, 30],
    ],
    lines: [
      ['p1', 'p2'],
      ['p2', 'p3'],
      ['p3', 'p1'],
    ],
    circles: [['p4', 4]],
    constraints: [
      { kind: 'horizontal', p: 'p1', q: 'p2' },
      { kind: 'parallel', l1: 'l1', l2: 'l2' },
      { kind: 'radius', circle: 'c1', value: 4 },
      { kind: 'tangent', line: 'l3', circle: 'c1' },
    ],
  });

  it('deleting a line keeps points that other lines still use', () => {
    const after = removeEntities(triangle, ['l1']);
    expect(ids(after)).toEqual(['p1', 'p2', 'p3', 'p4', 'l2', 'l3', 'c1']);
    // The parallel constraint mentioned l1, so it goes. The others stay.
    expect(after.constraints.map((c) => c.id)).toEqual(['k1', 'k3', 'k4']);
  });

  it('deleting a line takes its points with it when nothing else uses them', () => {
    const lone = make({
      points: [
        [0, 0],
        [10, 0],
      ],
      lines: [['p1', 'p2']],
      constraints: [{ kind: 'distance', p: 'p1', q: 'p2', value: 10 }],
    });
    const after = removeEntities(lone, ['l1']);
    expect(after.entities).toHaveLength(0);
    expect(after.constraints).toHaveLength(0);
  });

  it('deleting a point deletes every shape built on it', () => {
    const after = removeEntities(triangle, ['p1']);
    // l1 and l3 used p1. p2 and p3 survive because l2 still joins them.
    expect(ids(after)).toEqual(['p2', 'p3', 'p4', 'l2', 'c1']);
    expect(after.constraints.map((c) => c.id)).toEqual(['k3']);
  });

  it('deleting a circle takes its centre and its constraints', () => {
    const after = removeEntities(triangle, ['c1']);
    expect(ids(after)).toEqual(['p1', 'p2', 'p3', 'l1', 'l2', 'l3']);
    expect(after.constraints.map((c) => c.id)).toEqual(['k1', 'k2']);
  });

  it('ignores ids that are not there and returns the same sketch', () => {
    expect(removeEntities(triangle, ['zzz'])).toBe(triangle);
    expect(removeEntities(emptySketch, ['p1'])).toBe(emptySketch);
  });
});

/**
 * Built-in example sketches.
 *
 * Each one is built with the same public functions the interface uses, with
 * geometry that is only roughly right. Loading an example runs the solver,
 * which is what snaps it into its exact shape.
 */

import {
  addCircle,
  addConstraints,
  addLine,
  addPoint,
  emptySketch,
  type Id,
  type NewConstraint,
  type Sketch,
} from '../core';

export interface Example {
  readonly id: string;
  readonly name: string;
  /** One or two sentences on what to notice or try. */
  readonly blurb: string;
  readonly build: () => Sketch;
}

/** A tiny builder so the examples below read like a list of drawing steps. */
class Builder {
  sketch: Sketch = emptySketch;

  point(x: number, y: number): Id {
    const result = addPoint(this.sketch, x, y);
    this.sketch = result.sketch;
    return result.id;
  }

  line(a: Id, b: Id): Id {
    const result = addLine(this.sketch, a, b);
    this.sketch = result.sketch;
    return result.id;
  }

  circle(center: Id, r: number): Id {
    const result = addCircle(this.sketch, center, r);
    this.sketch = result.sketch;
    return result.id;
  }

  constrain(...constraints: NewConstraint[]): this {
    this.sketch = addConstraints(this.sketch, constraints);
    return this;
  }
}

function linkage(): Sketch {
  const b = new Builder();
  const pivotA = b.point(0, 0);
  const pivotB = b.point(60, 0);
  const crankEnd = b.point(2, 19);
  const rockerEnd = b.point(50, 37);
  b.line(pivotA, pivotB);
  b.line(pivotA, crankEnd);
  b.line(crankEnd, rockerEnd);
  b.line(rockerEnd, pivotB);
  b.constrain(
    { kind: 'fixed', p: pivotA, x: 0, y: 0 },
    { kind: 'fixed', p: pivotB, x: 60, y: 0 },
    { kind: 'distance', p: pivotA, q: crankEnd, value: 20 },
    { kind: 'distance', p: crankEnd, q: rockerEnd, value: 55 },
    { kind: 'distance', p: rockerEnd, q: pivotB, value: 40 },
  );
  return b.sketch;
}

function triangle(): Sketch {
  const b = new Builder();
  const p1 = b.point(0, 0);
  const p2 = b.point(38, 3);
  const p3 = b.point(30, 34);
  b.line(p1, p2);
  b.line(p2, p3);
  b.line(p3, p1);
  b.constrain(
    { kind: 'fixed', p: p1, x: 0, y: 0 },
    { kind: 'horizontal', p: p1, q: p2 },
    { kind: 'distance', p: p1, q: p2, value: 40 },
    { kind: 'distance', p: p2, q: p3, value: 30 },
    { kind: 'distance', p: p3, q: p1, value: 50 },
  );
  return b.sketch;
}

function plate(): Sketch {
  const b = new Builder();
  const p1 = b.point(0, 0);
  const p2 = b.point(78, 2);
  const p3 = b.point(81, 49);
  const p4 = b.point(-2, 52);
  const hole = b.point(24, 26);
  b.line(p1, p2);
  b.line(p2, p3);
  b.line(p3, p4);
  b.line(p4, p1);
  const circle = b.circle(hole, 9);
  b.constrain(
    { kind: 'fixed', p: p1, x: 0, y: 0 },
    { kind: 'horizontal', p: p1, q: p2 },
    { kind: 'horizontal', p: p4, q: p3 },
    { kind: 'vertical', p: p2, q: p3 },
    { kind: 'vertical', p: p1, q: p4 },
    { kind: 'distance', p: p1, q: p2, value: 80 },
    { kind: 'distance', p: p4, q: p1, value: 50 },
    { kind: 'radius', circle, value: 10 },
    { kind: 'distance', p: hole, q: p1, value: 35 },
    { kind: 'distance', p: hole, q: p4, value: 35 },
  );
  return b.sketch;
}

function ladder(): Sketch {
  const b = new Builder();
  const corner = b.point(0, 0);
  const floorEnd = b.point(100, 0);
  const wallTop = b.point(0, 100);
  const barrelCentre = b.point(16, 14);
  const ladderTop = b.point(1, 80);
  const ladderFoot = b.point(40, 1);
  const floor = b.line(corner, floorEnd);
  const wall = b.line(corner, wallTop);
  const ladderLine = b.line(ladderTop, ladderFoot);
  const barrel = b.circle(barrelCentre, 15);
  b.constrain(
    { kind: 'fixed', p: corner, x: 0, y: 0 },
    { kind: 'horizontal', p: corner, q: floorEnd },
    { kind: 'distance', p: corner, q: floorEnd, value: 100 },
    { kind: 'vertical', p: corner, q: wallTop },
    { kind: 'distance', p: corner, q: wallTop, value: 100 },
    { kind: 'tangent', line: floor, circle: barrel },
    { kind: 'tangent', line: wall, circle: barrel },
    { kind: 'pointOnLine', p: ladderTop, line: wall },
    { kind: 'pointOnLine', p: ladderFoot, line: floor },
    { kind: 'distance', p: ladderTop, q: ladderFoot, value: 90 },
    { kind: 'tangent', line: ladderLine, circle: barrel },
  );
  return b.sketch;
}

function impossible(): Sketch {
  const b = new Builder();
  const p1 = b.point(0, 0);
  const p2 = b.point(40, 0);
  const p3 = b.point(25, 26);
  b.line(p1, p2);
  b.line(p2, p3);
  b.line(p3, p1);
  b.constrain(
    { kind: 'fixed', p: p1, x: 0, y: 0 },
    { kind: 'horizontal', p: p1, q: p2 },
    { kind: 'distance', p: p1, q: p2, value: 40 },
    { kind: 'distance', p: p2, q: p3, value: 30 },
    { kind: 'distance', p: p3, q: p1, value: 80 },
  );
  return b.sketch;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'linkage',
    name: 'Four-bar linkage',
    blurb:
      'Two pinned pivots and three bars of fixed length leave one way to move. Drag the short bar round and the rest follows.',
    build: linkage,
  },
  {
    id: 'triangle',
    name: '3-4-5 triangle',
    blurb:
      'Only the three side lengths are set. The right angle is not a constraint: it falls out of the lengths.',
    build: triangle,
  },
  {
    id: 'plate',
    name: 'Plate with a hole',
    blurb:
      'Fully constrained: every size and position is decided, so nothing can be dragged. Change a number in the list to resize it.',
    build: plate,
  },
  {
    id: 'ladder',
    name: 'Ladder and barrel',
    blurb:
      'The barrel touches the floor and wall, and the ladder rests on it. Drag the rim of the barrel and the ladder slides to stay in contact.',
    build: ladder,
  },
  {
    id: 'impossible',
    name: 'Impossible triangle',
    blurb:
      'Sides of 40, 30 and 80 cannot close into a triangle. The three lengths are flagged as conflicting until one is changed or removed.',
    build: impossible,
  },
];

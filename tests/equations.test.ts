import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildLayout,
  compile,
  readParams,
  wrapHalfTurn,
  type NewConstraint,
  type Sketch,
} from '../src/core';
import { make } from './helpers';

/**
 * Compare every hand-written derivative with a numerical one.
 * Returns the worst disagreement found.
 */
function worstGradientError(sketch: Sketch): number {
  const layout = buildLayout(sketch);
  const x0 = readParams(sketch, layout);
  const compiled = compile(sketch, layout, x0);
  const h = 1e-5;
  let worst = 0;

  for (const constraint of compiled) {
    const rows = constraint.evaluate(x0);
    rows.forEach((row, rowIndex) => {
      const analytic = new Float64Array(layout.size);
      row.cols.forEach((col, i) => {
        analytic[col] = (analytic[col] as number) + (row.grads[i] as number);
      });
      for (let j = 0; j < layout.size; j++) {
        const plus = Float64Array.from(x0);
        const minus = Float64Array.from(x0);
        plus[j] = (plus[j] as number) + h;
        minus[j] = (minus[j] as number) - h;
        const up = (constraint.evaluate(plus)[rowIndex] as { value: number }).value;
        const down = (constraint.evaluate(minus)[rowIndex] as { value: number }).value;
        const numeric = (up - down) / (2 * h);
        const error = Math.abs(numeric - (analytic[j] as number));
        worst = Math.max(worst, error / (1 + Math.abs(numeric)));
      }
    });
  }
  return worst;
}

// p1..p6, three lines (l3 shares an end with each of the others), two circles.
const ALL_KINDS: NewConstraint[] = [
  { kind: 'coincident', p: 'p1', q: 'p4' },
  { kind: 'horizontal', p: 'p1', q: 'p2' },
  { kind: 'vertical', p: 'p3', q: 'p4' },
  { kind: 'fixed', p: 'p5', x: 3, y: -4 },
  { kind: 'distance', p: 'p1', q: 'p3', value: 12 },
  { kind: 'parallel', l1: 'l1', l2: 'l2' },
  { kind: 'perpendicular', l1: 'l1', l2: 'l3' },
  { kind: 'perpendicular', l1: 'l2', l2: 'l1' },
  { kind: 'equalLength', l1: 'l1', l2: 'l3' },
  { kind: 'pointOnLine', p: 'p5', line: 'l1' },
  { kind: 'pointOnLine', p: 'p1', line: 'l2' },
  { kind: 'pointOnCircle', p: 'p1', circle: 'c1' },
  { kind: 'radius', circle: 'c1', value: 7 },
  { kind: 'tangent', line: 'l1', circle: 'c1' },
  { kind: 'tangent', line: 'l3', circle: 'c2' },
  { kind: 'equalRadius', c1: 'c1', c2: 'c2' },
];

type Coords = readonly [number, number];

function sketchFrom(points: readonly Coords[], r1: number, r2: number): Sketch {
  return make({
    points,
    lines: [
      ['p1', 'p2'],
      ['p3', 'p4'],
      ['p2', 'p3'],
    ],
    circles: [
      ['p5', r1],
      ['p6', r2],
    ],
    constraints: ALL_KINDS,
  });
}

/** True when no equation is sitting on a kink, where a numerical derivative means nothing. */
function isSmooth(points: readonly Coords[]): boolean {
  const [p1, p2, p3, p4, p5, p6] = points as [Coords, Coords, Coords, Coords, Coords, Coords];
  const length = (a: Coords, b: Coords) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const angle = (a: Coords, b: Coords) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const signed = (p: Coords, a: Coords, b: Coords) =>
    ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / length(a, b);
  const awayFromFlip = (theta: number) =>
    Math.abs(Math.abs(wrapHalfTurn(theta)) - Math.PI / 2) > 0.02;

  const lengths = [length(p1, p2), length(p3, p4), length(p2, p3), length(p1, p3), length(p1, p5)];
  if (lengths.some((l) => l < 2)) return false;
  const a1 = angle(p1, p2);
  const a2 = angle(p3, p4);
  const a3 = angle(p2, p3);
  if (!awayFromFlip(a2 - a1)) return false; // parallel l1, l2
  if (!awayFromFlip(a3 - a1 - Math.PI / 2)) return false; // perpendicular l1, l3
  if (!awayFromFlip(a1 - a2 - Math.PI / 2)) return false; // perpendicular l2, l1
  if (Math.abs(signed(p5, p1, p2)) < 0.05) return false; // tangent l1, c1
  if (Math.abs(signed(p6, p2, p3)) < 0.05) return false; // tangent l3, c2
  return true;
}

// Evenly spread coordinates. fast-check's own double generator picks evenly
// among representable numbers, which crowds almost everything next to zero,
// and its default bias favours the range limits. Neither suits geometry.
const spread = (min: number, max: number) =>
  fc.noBias(fc.integer({ min: min * 1000, max: max * 1000 })).map((n) => n / 1000);
const coordinate = spread(-60, 60);
const sixPoints = fc.array(fc.tuple(coordinate, coordinate), { minLength: 6, maxLength: 6 });
const radius = spread(1, 40);

describe('constraint equations', () => {
  it('have derivatives that match a numerical check on random geometry', () => {
    fc.assert(
      fc.property(sixPoints, radius, radius, (points, r1, r2) => {
        fc.pre(isSmooth(points));
        expect(worstGradientError(sketchFrom(points, r1, r2))).toBeLessThan(1e-6);
      }),
      { numRuns: 300 },
    );
  });

  it('covers every kind of constraint in that check', () => {
    const kinds = new Set(ALL_KINDS.map((c) => c.kind));
    expect(kinds.size).toBe(13);
  });

  it('report zero error when the constraint already holds', () => {
    const sketch = make({
      points: [
        [0, 0],
        [10, 0],
        [0, 5],
        [10, 5],
        [5, 5],
      ],
      lines: [
        ['p1', 'p2'],
        ['p3', 'p4'],
        ['p1', 'p3'],
      ],
      circles: [['p5', 5]],
      constraints: [
        { kind: 'horizontal', p: 'p1', q: 'p2' },
        { kind: 'vertical', p: 'p1', q: 'p3' },
        { kind: 'distance', p: 'p1', q: 'p2', value: 10 },
        { kind: 'parallel', l1: 'l1', l2: 'l2' },
        { kind: 'perpendicular', l1: 'l1', l2: 'l3' },
        { kind: 'equalLength', l1: 'l1', l2: 'l2' },
        { kind: 'pointOnLine', p: 'p5', line: 'l2' },
        { kind: 'pointOnCircle', p: 'p3', circle: 'c1' },
        { kind: 'radius', circle: 'c1', value: 5 },
        { kind: 'tangent', line: 'l1', circle: 'c1' },
        { kind: 'fixed', p: 'p1', x: 0, y: 0 },
      ],
    });
    const layout = buildLayout(sketch);
    const x = readParams(sketch, layout);
    for (const c of compile(sketch, layout, x)) {
      for (const row of c.evaluate(x)) expect(Math.abs(row.value)).toBeLessThan(1e-12);
    }
  });

  it('treat a line and its reverse as the same direction', () => {
    const forwards = make({
      points: [
        [0, 0],
        [10, 0],
        [0, 5],
        [10, 5],
      ],
      lines: [
        ['p1', 'p2'],
        ['p4', 'p3'], // drawn right to left
      ],
      constraints: [{ kind: 'parallel', l1: 'l1', l2: 'l2' }],
    });
    const layout = buildLayout(forwards);
    const x = readParams(forwards, layout);
    const rows = compile(forwards, layout, x).flatMap((c) => c.evaluate(x));
    expect(rows).toHaveLength(1);
    expect(Math.abs(rows[0]?.value ?? 1)).toBeLessThan(1e-12);
  });

  it('wrapHalfTurn folds angles into half a turn', () => {
    expect(wrapHalfTurn(0)).toBe(0);
    expect(wrapHalfTurn(Math.PI)).toBeCloseTo(0, 12);
    expect(wrapHalfTurn(-Math.PI)).toBeCloseTo(0, 12);
    expect(wrapHalfTurn(Math.PI * 0.75)).toBeCloseTo(-Math.PI * 0.25, 12);
    expect(wrapHalfTurn(0.3)).toBeCloseTo(0.3, 12);
  });
});

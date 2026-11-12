import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { drag, settle, solve, type NewConstraint } from '../src/core';
import { EXAMPLES } from '../src/examples';
import { dist, make, pointAt, radiusOf, worstErrorOf } from './helpers';

const example = (id: string) => {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`no example ${id}`);
  return found.build();
};

describe('solve: cases with exact answers', () => {
  it('finds the right angle in a 3-4-5 triangle from the side lengths alone', () => {
    const result = solve(example('triangle'));
    expect(result.converged).toBe(true);
    const p2 = pointAt(result.sketch, 'p2');
    const p3 = pointAt(result.sketch, 'p3');
    expect(p2.x).toBeCloseTo(40, 7);
    expect(p2.y).toBeCloseTo(0, 7);
    expect(p3.x).toBeCloseTo(40, 7);
    expect(p3.y).toBeCloseTo(30, 7); // started above the base, so it stays above
  });

  it('squares up a roughly drawn rectangle', () => {
    const result = solve(
      make({
        points: [
          [1, -2],
          [58, 3],
          [63, 37],
          [-3, 44],
        ],
        lines: [
          ['p1', 'p2'],
          ['p2', 'p3'],
          ['p3', 'p4'],
          ['p4', 'p1'],
        ],
        constraints: [
          { kind: 'fixed', p: 'p1', x: 0, y: 0 },
          { kind: 'horizontal', p: 'p1', q: 'p2' },
          { kind: 'horizontal', p: 'p4', q: 'p3' },
          { kind: 'vertical', p: 'p2', q: 'p3' },
          { kind: 'vertical', p: 'p1', q: 'p4' },
          { kind: 'distance', p: 'p1', q: 'p2', value: 60 },
          { kind: 'distance', p: 'p1', q: 'p4', value: 40 },
        ],
      }),
    );
    expect(result.converged).toBe(true);
    const corners = ['p1', 'p2', 'p3', 'p4'].map((id) => pointAt(result.sketch, id));
    const expected = [
      [0, 0],
      [60, 0],
      [60, 40],
      [0, 40],
    ];
    corners.forEach((corner, i) => {
      expect(corner.x).toBeCloseTo(expected[i]?.[0] as number, 7);
      expect(corner.y).toBeCloseTo(expected[i]?.[1] as number, 7);
    });
  });

  it('rests a level line on top of a circle', () => {
    const result = solve(
      make({
        points: [
          [0, 0],
          [-20, 13],
          [20, 12],
        ],
        lines: [['p2', 'p3']],
        circles: [['p1', 9]],
        constraints: [
          { kind: 'fixed', p: 'p1', x: 0, y: 0 },
          { kind: 'radius', circle: 'c1', value: 10 },
          { kind: 'horizontal', p: 'p2', q: 'p3' },
          { kind: 'tangent', line: 'l1', circle: 'c1' },
        ],
      }),
    );
    expect(result.converged).toBe(true);
    expect(pointAt(result.sketch, 'p2').y).toBeCloseTo(10, 7);
    expect(pointAt(result.sketch, 'p3').y).toBeCloseTo(10, 7);
    expect(radiusOf(result.sketch, 'c1')).toBeCloseTo(10, 9);
  });

  it('makes a parallelogram from two parallel pairs', () => {
    const result = solve(
      make({
        points: [
          [0, 0],
          [30, 2],
          [41, 22],
          [8, 19],
        ],
        lines: [
          ['p1', 'p2'],
          ['p2', 'p3'],
          ['p3', 'p4'],
          ['p4', 'p1'],
        ],
        constraints: [
          { kind: 'parallel', l1: 'l1', l2: 'l3' },
          { kind: 'parallel', l1: 'l2', l2: 'l4' },
        ],
      }),
    );
    expect(result.converged).toBe(true);
    // Opposite sides of a parallelogram are equal, though that was never asked for.
    expect(dist(result.sketch, 'p1', 'p2')).toBeCloseTo(dist(result.sketch, 'p3', 'p4'), 6);
    expect(dist(result.sketch, 'p2', 'p3')).toBeCloseTo(dist(result.sketch, 'p4', 'p1'), 6);
  });

  it('puts points on a line and on a circle', () => {
    const result = solve(
      make({
        points: [
          [0, 0],
          [10, 0],
          [4, 3],
          [0, 20],
          [6, 22],
        ],
        lines: [['p1', 'p2']],
        circles: [['p4', 5]],
        constraints: [
          { kind: 'fixed', p: 'p1', x: 0, y: 0 },
          { kind: 'fixed', p: 'p2', x: 10, y: 0 },
          { kind: 'fixed', p: 'p4', x: 0, y: 20 },
          { kind: 'radius', circle: 'c1', value: 5 },
          { kind: 'pointOnLine', p: 'p3', line: 'l1' },
          { kind: 'pointOnCircle', p: 'p5', circle: 'c1' },
        ],
      }),
    );
    expect(result.converged).toBe(true);
    expect(pointAt(result.sketch, 'p3').y).toBeCloseTo(0, 8);
    expect(pointAt(result.sketch, 'p3').x).toBeCloseTo(4, 8); // slid straight down, not sideways
    expect(dist(result.sketch, 'p5', 'p4')).toBeCloseTo(5, 8);
  });

  it('joins coincident points and equalises lengths and radii', () => {
    const result = solve(
      make({
        points: [
          [0, 0],
          [10, 1],
          [11, 0],
          [14, 9],
          [30, 30],
          [50, 30],
        ],
        lines: [
          ['p1', 'p2'],
          ['p3', 'p4'],
        ],
        circles: [
          ['p5', 4],
          ['p6', 7],
        ],
        constraints: [
          { kind: 'coincident', p: 'p2', q: 'p3' },
          { kind: 'equalLength', l1: 'l1', l2: 'l2' },
          { kind: 'equalRadius', c1: 'c1', c2: 'c2' },
        ],
      }),
    );
    expect(result.converged).toBe(true);
    expect(dist(result.sketch, 'p2', 'p3')).toBeLessThan(1e-8);
    expect(dist(result.sketch, 'p1', 'p2')).toBeCloseTo(dist(result.sketch, 'p3', 'p4'), 7);
    expect(radiusOf(result.sketch, 'c1')).toBeCloseTo(radiusOf(result.sketch, 'c2'), 9);
  });
});

describe('solve: awkward starting points', () => {
  const twoLines = (constraint: NewConstraint, second: [[number, number], [number, number]]) =>
    make({
      points: [[0, 0], [10, 0], ...second],
      lines: [
        ['p1', 'p2'],
        ['p3', 'p4'],
      ],
      constraints: [constraint],
    });

  it('makes lines perpendicular even when they start exactly parallel', () => {
    const result = solve(
      twoLines({ kind: 'perpendicular', l1: 'l1', l2: 'l2' }, [
        [0, 5],
        [10, 5],
      ]),
    );
    expect(result.converged).toBe(true);
  });

  it('makes lines parallel even when they start exactly perpendicular', () => {
    const result = solve(
      twoLines({ kind: 'parallel', l1: 'l1', l2: 'l2' }, [
        [5, 1],
        [5, 11],
      ]),
    );
    expect(result.converged).toBe(true);
  });

  it('separates two points that start on top of each other', () => {
    const result = solve(
      make({
        points: [
          [3, 3],
          [3, 3],
        ],
        constraints: [{ kind: 'distance', p: 'p1', q: 'p2', value: 12 }],
      }),
    );
    expect(result.converged).toBe(true);
    expect(dist(result.sketch, 'p1', 'p2')).toBeCloseTo(12, 8);
  });

  it('copes with a sketch drawn far from the origin at a large scale', () => {
    const result = solve(
      make({
        points: [
          [250000, 180000],
          [251900, 180300],
          [251700, 181500],
        ],
        lines: [
          ['p1', 'p2'],
          ['p2', 'p3'],
        ],
        constraints: [
          { kind: 'horizontal', p: 'p1', q: 'p2' },
          { kind: 'perpendicular', l1: 'l1', l2: 'l2' },
          { kind: 'distance', p: 'p1', q: 'p2', value: 2000 },
          { kind: 'distance', p: 'p2', q: 'p3', value: 1000 },
        ],
      }),
    );
    expect(result.converged).toBe(true);
  });
});

describe('solve: behaviour', () => {
  it('leaves an already-solved sketch exactly as it was', () => {
    const solved = solve(example('plate')).sketch;
    const again = solve(solved);
    expect(again.iterations).toBe(0);
    expect(again.sketch).toBe(solved);
  });

  it('does not move anything the constraints do not touch', () => {
    const sketch = make({
      points: [
        [0, 0],
        [7, 1],
        [123.456, -78.9],
      ],
      constraints: [{ kind: 'distance', p: 'p1', q: 'p2', value: 20 }],
    });
    const result = solve(sketch);
    expect(pointAt(result.sketch, 'p3')).toEqual({ x: 123.456, y: -78.9 });
  });

  it('moves both ends of a line equally when neither is pinned', () => {
    const result = solve(
      make({
        points: [
          [0, 0],
          [10, 0],
        ],
        constraints: [{ kind: 'distance', p: 'p1', q: 'p2', value: 20 }],
      }),
    );
    expect(pointAt(result.sketch, 'p1').x).toBeCloseTo(-5, 6);
    expect(pointAt(result.sketch, 'p2').x).toBeCloseTo(15, 6);
    expect(dist(result.sketch, 'p1', 'p2')).toBeCloseTo(20, 9);
  });

  it('reports failure, and says which constraints are left unmet, when they contradict', () => {
    const result = solve(example('impossible'));
    expect(result.converged).toBe(false);
    const unmet = [...result.errors].filter(([, error]) => error > 1e-3).map(([id]) => id);
    expect(unmet).toEqual(expect.arrayContaining(['k3', 'k4', 'k5']));
  });

  it('settle keeps the original geometry when there is no solution', () => {
    const sketch = example('impossible');
    expect(settle(sketch)).toBe(sketch);
  });

  it('restores every constraint after random knocks to a valid sketch', () => {
    const offset = fc.noBias(fc.integer({ min: -3000, max: 3000 })).map((n) => n / 1000);
    fc.assert(
      fc.property(fc.array(offset, { minLength: 8, maxLength: 8 }), (knocks) => {
        const solved = solve(example('linkage')).sketch;
        // Knock every point off its place, then ask the solver to put things right.
        let i = 0;
        const knocked = {
          ...solved,
          entities: solved.entities.map((e) =>
            e.kind === 'point'
              ? { ...e, x: e.x + (knocks[i++] as number), y: e.y + (knocks[i++] as number) }
              : e,
          ),
        };
        const result = solve(knocked);
        expect(result.converged).toBe(true);
        expect(worstErrorOf(result.sketch)).toBeLessThan(1e-6);
      }),
      { numRuns: 100 },
    );
  });
});

describe('drag', () => {
  const rod = () =>
    make({
      points: [
        [0, 0],
        [10, 0],
      ],
      lines: [['p1', 'p2']],
      constraints: [
        { kind: 'fixed', p: 'p1', x: 0, y: 0 },
        { kind: 'distance', p: 'p1', q: 'p2', value: 10 },
      ],
    });

  it('moves a free point exactly where it is dragged', () => {
    const sketch = make({ points: [[1, 1]] });
    expect(pointAt(drag(sketch, [{ kind: 'point', id: 'p1', x: 40, y: -7 }]), 'p1')).toEqual({
      x: 40,
      y: -7,
    });
  });

  it('swings a pinned rod towards the cursor without stretching it', () => {
    const dragged = drag(rod(), [{ kind: 'point', id: 'p2', x: 30, y: 40 }]);
    // (30, 40) is in the direction (3, 4)/5, so a rod of 10 ends at (6, 8).
    expect(pointAt(dragged, 'p2').x).toBeCloseTo(6, 6);
    expect(pointAt(dragged, 'p2').y).toBeCloseTo(8, 6);
    expect(pointAt(dragged, 'p1').x).toBeCloseTo(0, 9);
    expect(pointAt(dragged, 'p1').y).toBeCloseTo(0, 9);
  });

  it('cannot move a pinned point', () => {
    const dragged = drag(rod(), [{ kind: 'point', id: 'p1', x: 5, y: 5 }]);
    expect(pointAt(dragged, 'p1').x).toBeCloseTo(0, 8);
    expect(pointAt(dragged, 'p1').y).toBeCloseTo(0, 8);
    expect(dist(dragged, 'p1', 'p2')).toBeCloseTo(10, 8);
  });

  it('carries a rigid triangle along with the corner being dragged', () => {
    const triangle = make({
      points: [
        [0, 0],
        [40, 0],
        [40, 30],
      ],
      constraints: [
        { kind: 'distance', p: 'p1', q: 'p2', value: 40 },
        { kind: 'distance', p: 'p2', q: 'p3', value: 30 },
        { kind: 'distance', p: 'p3', q: 'p1', value: 50 },
      ],
    });
    const dragged = drag(triangle, [{ kind: 'point', id: 'p3', x: 55, y: 42 }]);
    expect(pointAt(dragged, 'p3').x).toBeCloseTo(55, 2);
    expect(pointAt(dragged, 'p3').y).toBeCloseTo(42, 2);
    expect(dist(dragged, 'p1', 'p2')).toBeCloseTo(40, 7);
    expect(dist(dragged, 'p2', 'p3')).toBeCloseTo(30, 7);
    expect(dist(dragged, 'p3', 'p1')).toBeCloseTo(50, 7);
  });

  it('turns the crank of a four-bar linkage and keeps every bar its length', () => {
    let sketch = solve(example('linkage')).sketch;
    // Walk the crank end a quarter of the way round its circle in small steps, as a mouse would.
    for (let step = 1; step <= 20; step++) {
      const angle = Math.PI / 2 - (step / 20) * (Math.PI / 2);
      sketch = drag(sketch, [
        { kind: 'point', id: 'p3', x: 25 * Math.cos(angle), y: 25 * Math.sin(angle) },
      ]);
      expect(worstErrorOf(sketch)).toBeLessThan(1e-6);
    }
    // The crank is 20 long, so its end follows the cursor round at that radius.
    expect(pointAt(sketch, 'p3').x).toBeCloseTo(20, 3);
    expect(pointAt(sketch, 'p3').y).toBeCloseTo(0, 3);
  });

  it('resizes the barrel and slides the ladder to stay resting on it', () => {
    const before = solve(example('ladder')).sketch;
    const after = drag(before, [{ kind: 'radius', id: 'c1', r: 12 }]);
    expect(radiusOf(after, 'c1')).toBeCloseTo(12, 3);
    expect(worstErrorOf(after)).toBeLessThan(1e-6);
    // Still in the corner, touching floor and wall.
    expect(pointAt(after, 'p4').x).toBeCloseTo(radiusOf(after, 'c1'), 6);
    expect(pointAt(after, 'p4').y).toBeCloseTo(radiusOf(after, 'c1'), 6);
    expect(dist(after, 'p5', 'p6')).toBeCloseTo(90, 6);
  });

  it('refuses a drag that has no valid answer and returns the sketch untouched', () => {
    const before = solve(example('ladder')).sketch;
    // A 90-long ladder cannot rest on a barrel this big in the corner.
    expect(drag(before, [{ kind: 'radius', id: 'c1', r: 60 }])).toBe(before);
  });
});

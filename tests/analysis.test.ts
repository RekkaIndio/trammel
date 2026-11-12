import { describe, expect, it } from 'vitest';
import { addConstraint, analyse, emptySketch, settle } from '../src/core';
import { EXAMPLES } from '../src/examples';
import { make } from './helpers';

const example = (id: string) => {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`no example ${id}`);
  return settle(found.build());
};

describe('analyse: counting freedom', () => {
  it('calls an empty sketch empty', () => {
    const result = analyse(emptySketch);
    expect(result.state).toBe('empty');
    expect(result.freedom).toBe(0);
  });

  it('gives a lone point two freedoms and a lone circle three', () => {
    expect(analyse(make({ points: [[1, 2]] })).freedom).toBe(2);
    expect(analyse(make({ points: [[1, 2]], circles: [['p1', 5]] })).freedom).toBe(3);
  });

  it('gives a pinned point none', () => {
    const result = analyse(
      make({ points: [[1, 2]], constraints: [{ kind: 'fixed', p: 'p1', x: 1, y: 2 }] }),
    );
    expect(result.freedom).toBe(0);
    expect(result.state).toBe('full');
    expect(result.free.size).toBe(0);
  });

  it('removes one freedom per independent equation', () => {
    const line = make({
      points: [
        [0, 0],
        [10, 0],
      ],
      lines: [['p1', 'p2']],
      constraints: [{ kind: 'horizontal', p: 'p1', q: 'p2' }],
    });
    expect(analyse(line).freedom).toBe(3);
    const withLength = addConstraint(line, {
      kind: 'distance',
      p: 'p1',
      q: 'p2',
      value: 10,
    }).sketch;
    expect(analyse(withLength).freedom).toBe(2);
  });

  it('knows which parts of a pinned rod can still move', () => {
    const rod = make({
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
    const result = analyse(rod);
    expect(result.state).toBe('under');
    expect(result.freedom).toBe(1);
    expect([...result.free].sort()).toEqual(['l1', 'p2']);
  });

  it('treats a circle as free if only its size is undecided', () => {
    const result = analyse(
      make({
        points: [[0, 0]],
        circles: [['p1', 5]],
        constraints: [{ kind: 'fixed', p: 'p1', x: 0, y: 0 }],
      }),
    );
    expect(result.freedom).toBe(1);
    expect([...result.free]).toEqual(['c1']);
  });
});

describe('analyse: the built-in examples', () => {
  it('four-bar linkage: one freedom, and only the moving bars are free', () => {
    const result = analyse(example('linkage'));
    expect(result.state).toBe('under');
    expect(result.freedom).toBe(1);
    // p1, p2 are the pinned pivots and l1 is the ground bar between them.
    expect([...result.free].sort()).toEqual(['l2', 'l3', 'l4', 'p3', 'p4']);
    expect(result.redundant.size).toBe(0);
  });

  it('3-4-5 triangle: fully constrained', () => {
    const result = analyse(example('triangle'));
    expect(result.state).toBe('full');
    expect(result.freedom).toBe(0);
  });

  it('plate with a hole: fully constrained, nothing free, nothing redundant', () => {
    const result = analyse(example('plate'));
    expect(result.state).toBe('full');
    expect(result.free.size).toBe(0);
    expect(result.redundant.size).toBe(0);
    expect(result.rank).toBe(result.parameterCount);
  });

  it('ladder and barrel: one freedom', () => {
    const result = analyse(example('ladder'));
    expect(result.state).toBe('under');
    expect(result.freedom).toBe(1);
    // The corner, floor and wall are pinned. The barrel and ladder are not.
    expect(result.free.has('c1')).toBe(true);
    expect(result.free.has('l3')).toBe(true);
    expect(result.free.has('l1')).toBe(false);
    expect(result.free.has('l2')).toBe(false);
  });

  it('impossible triangle: over-constrained, blaming exactly the three lengths', () => {
    const result = analyse(example('impossible'));
    expect(result.state).toBe('over');
    // k1 pins a corner and k2 levels the base. Neither is at fault.
    expect([...result.conflicting].sort()).toEqual(['k3', 'k4', 'k5']);
  });
});

describe('analyse: redundant and conflicting constraints', () => {
  it('flags a constraint that repeats another', () => {
    const sketch = make({
      points: [
        [0, 0],
        [10, 0],
      ],
      constraints: [
        { kind: 'horizontal', p: 'p1', q: 'p2' },
        { kind: 'horizontal', p: 'p2', q: 'p1' },
      ],
    });
    const result = analyse(sketch);
    expect([...result.redundant]).toEqual(['k2']);
    expect(result.conflicting.size).toBe(0);
    expect(result.freedom).toBe(3);
  });

  it('flags the fourth right angle of a rectangle, which the first three imply', () => {
    const sketch = settle(
      make({
        points: [
          [0, 0],
          [30, 1],
          [31, 20],
          [1, 21],
        ],
        lines: [
          ['p1', 'p2'],
          ['p2', 'p3'],
          ['p3', 'p4'],
          ['p4', 'p1'],
        ],
        constraints: [
          { kind: 'perpendicular', l1: 'l1', l2: 'l2' },
          { kind: 'perpendicular', l1: 'l2', l2: 'l3' },
          { kind: 'perpendicular', l1: 'l3', l2: 'l4' },
          { kind: 'perpendicular', l1: 'l4', l2: 'l1' },
        ],
      }),
    );
    const result = analyse(sketch);
    expect([...result.redundant]).toEqual(['k4']);
    expect(result.state).toBe('under');
    // 8 parameters, 3 independent equations.
    expect(result.freedom).toBe(5);
  });

  it('flags both lengths when one line is given two different ones', () => {
    const sketch = make({
      points: [
        [0, 0],
        [10, 0],
      ],
      lines: [['p1', 'p2']],
      constraints: [
        { kind: 'distance', p: 'p1', q: 'p2', value: 10 },
        { kind: 'distance', p: 'p2', q: 'p1', value: 25 },
      ],
    });
    const result = analyse(sketch);
    expect(result.state).toBe('over');
    expect([...result.conflicting].sort()).toEqual(['k1', 'k2']);
  });

  it('does not call a sketch conflicting just because it has not been solved yet', () => {
    const unsolved = make({
      points: [
        [0, 0],
        [10, 3],
      ],
      constraints: [{ kind: 'horizontal', p: 'p1', q: 'p2' }],
    });
    const result = analyse(unsolved);
    expect(result.conflicting.size).toBe(0);
    expect(result.state).toBe('under');
  });

  it('flags a pin fighting a pin', () => {
    const sketch = make({
      points: [
        [0, 0],
        [10, 0],
      ],
      constraints: [
        { kind: 'fixed', p: 'p1', x: 0, y: 0 },
        { kind: 'fixed', p: 'p2', x: 10, y: 0 },
        { kind: 'distance', p: 'p1', q: 'p2', value: 30 },
      ],
    });
    const result = analyse(sketch);
    expect(result.state).toBe('over');
    expect(result.conflicting.has('k3')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addConstraint,
  describe as describeConstraint,
  displayName,
  optionsFor,
} from '../src/core';
import { make } from './helpers';

const sketch = make({
  points: [
    [0, 0],
    [10, 0],
    [0, 10],
    [10, 10],
    [5, 5],
    [20, 20],
  ],
  lines: [
    ['p1', 'p2'],
    ['p3', 'p4'],
  ],
  circles: [
    ['p5', 3],
    ['p6', 4],
  ],
});

const keys = (selection: string[], from = sketch) => optionsFor(from, selection).map((o) => o.key);

describe('optionsFor', () => {
  it('offers nothing for an empty selection', () => {
    expect(keys([])).toEqual([]);
  });

  it.each<[string, string[], string[]]>([
    ['one point', ['p1'], ['fixed']],
    ['two loose points', ['p1', 'p4'], ['coincident', 'horizontal', 'vertical', 'distance']],
    ['the two ends of a line', ['p1', 'p2'], ['horizontal', 'vertical', 'distance']],
    ['one line', ['l1'], ['horizontal', 'vertical', 'distance']],
    ['two lines', ['l1', 'l2'], ['parallel', 'perpendicular', 'equalLength']],
    ['a point and a line', ['p3', 'l1'], ['pointOnLine']],
    ['a line and a point, picked the other way round', ['l1', 'p3'], ['pointOnLine']],
    ['a point and a circle', ['p1', 'c1'], ['pointOnCircle']],
    ['a line and a circle', ['l1', 'c1'], ['tangent']],
    ['one circle', ['c1'], ['radius']],
    ['two circles', ['c1', 'c2'], ['equalRadius', 'concentric']],
  ])('for %s', (_label, selection, expected) => {
    expect(keys(selection)).toEqual(expected);
  });

  it('offers nothing for selections no constraint fits', () => {
    expect(keys(['p1', 'p2', 'p3'])).toEqual([]);
    expect(keys(['l1', 'l2', 'c1'])).toEqual([]);
    expect(keys(['p1', 'nope'])).toEqual([]);
    expect(keys(['p1', 'p1'])).toEqual([]);
  });

  it('does not offer to put a line end on its own line, or a centre on its own circle', () => {
    expect(keys(['p1', 'l1'])).toEqual([]);
    expect(keys(['p5', 'c1'])).toEqual([]);
  });

  it('leaves out constraints the sketch already has', () => {
    let next = addConstraint(sketch, { kind: 'parallel', l1: 'l2', l2: 'l1' }).sketch;
    next = addConstraint(next, { kind: 'distance', p: 'p2', q: 'p1', value: 10 }).sketch;
    expect(keys(['l1', 'l2'], next)).toEqual(['perpendicular', 'equalLength']);
    expect(keys(['l1'], next)).toEqual(['horizontal', 'vertical']);
  });

  it('starts dimensions at the current measurement', () => {
    const length = optionsFor(sketch, ['l1']).find((o) => o.key === 'distance');
    expect(length?.label).toBe('Length');
    expect(length?.constraint).toMatchObject({ kind: 'distance', value: 10 });
    const radius = optionsFor(sketch, ['c2'])[0];
    expect(radius?.constraint).toMatchObject({ kind: 'radius', value: 4 });
  });

  it('pins a point at its current position', () => {
    expect(optionsFor(sketch, ['p4'])[0]?.constraint).toEqual({
      kind: 'fixed',
      p: 'p4',
      x: 10,
      y: 10,
    });
  });

  it('stores concentric as coincident centres', () => {
    const option = optionsFor(sketch, ['c1', 'c2']).find((o) => o.key === 'concentric');
    expect(option?.constraint).toEqual({ kind: 'coincident', p: 'p5', q: 'p6' });
  });
});

describe('describe', () => {
  it("names a distance between line ends as that line's length", () => {
    const next = addConstraint(sketch, { kind: 'distance', p: 'p1', q: 'p2', value: 10 }).sketch;
    expect(describeConstraint(next, next.constraints[0]!)).toEqual({
      title: 'Length',
      targets: 'L1',
      highlight: ['l1'],
    });
  });

  it('names a distance between unconnected points as a distance', () => {
    const next = addConstraint(sketch, { kind: 'distance', p: 'p1', q: 'p4', value: 14 }).sketch;
    expect(describeConstraint(next, next.constraints[0]!)).toMatchObject({
      title: 'Distance',
      targets: 'P1, P4',
    });
  });

  it('names coincident circle centres as concentric', () => {
    const next = addConstraint(sketch, { kind: 'coincident', p: 'p5', q: 'p6' }).sketch;
    expect(describeConstraint(next, next.constraints[0]!)).toMatchObject({
      title: 'Concentric',
      targets: 'C1, C2',
    });
  });

  it('lists what the other kinds apply to', () => {
    const next = addConstraint(sketch, { kind: 'tangent', line: 'l2', circle: 'c1' }).sketch;
    expect(describeConstraint(next, next.constraints[0]!)).toEqual({
      title: 'Tangent',
      targets: 'L2, C1',
      highlight: ['l2', 'c1'],
    });
  });

  it('shows ids in capitals', () => {
    expect(displayName('p12')).toBe('P12');
  });
});

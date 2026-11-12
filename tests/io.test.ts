import { describe, expect, it } from 'vitest';
import {
  FILE_FORMAT,
  SketchError,
  emptySketch,
  parse,
  serialise,
  settle,
  toSvg,
} from '../src/core';
import { EXAMPLES } from '../src/examples';
import { make } from './helpers';

const file = (overrides: Record<string, unknown>) =>
  JSON.stringify({ format: FILE_FORMAT, version: 1, entities: [], constraints: [], ...overrides });

describe('saving and loading', () => {
  it.each(EXAMPLES.map((e) => [e.name, e] as const))('round-trips %s exactly', (_name, example) => {
    const sketch = settle(example.build());
    const loaded = parse(serialise(sketch, example.name));
    expect(loaded.sketch).toEqual(sketch);
    expect(loaded.name).toBe(example.name);
  });

  it('round-trips an empty sketch with no name', () => {
    expect(parse(serialise(emptySketch))).toEqual({ sketch: emptySketch, name: null });
  });

  it('writes readable, indented JSON that ends with a newline', () => {
    const text = serialise(make({ points: [[1, 2]] }));
    expect(text).toContain('\n  "entities": [');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('accepts lines listed before the points they use', () => {
    const loaded = parse(
      file({
        entities: [
          { kind: 'line', id: 'l1', a: 'p1', b: 'p2' },
          { kind: 'point', id: 'p1', x: 0, y: 0 },
          { kind: 'point', id: 'p2', x: 5, y: 5 },
        ],
      }),
    );
    expect(loaded.sketch.entities.map((e) => e.id)).toEqual(['l1', 'p1', 'p2']);
  });

  it('drops fields it does not recognise', () => {
    const loaded = parse(
      file({
        entities: [
          { kind: 'point', id: 'p1', x: 0, y: 0, colour: 'red' },
          { kind: 'point', id: 'p2', x: 5, y: 0 },
        ],
        constraints: [{ kind: 'horizontal', id: 'k1', p: 'p1', q: 'p2', note: 'hello', value: 9 }],
      }),
    );
    expect(loaded.sketch.entities[0]).toEqual({ kind: 'point', id: 'p1', x: 0, y: 0 });
    expect(loaded.sketch.constraints[0]).toEqual({
      kind: 'horizontal',
      id: 'k1',
      p: 'p1',
      q: 'p2',
    });
  });

  it.each<[string, string, RegExp]>([
    ['text that is not JSON', 'not json {', /not valid JSON/],
    ['JSON that is not a sketch', '{"hello": "world"}', /not a Trammel sketch/],
    ['an array', '[]', /not a Trammel sketch/],
    [
      'a missing version',
      JSON.stringify({ format: FILE_FORMAT, entities: [], constraints: [] }),
      /version/,
    ],
    ['a newer format', file({ version: 99 }), /format 99/],
    ['missing lists', JSON.stringify({ format: FILE_FORMAT, version: 1 }), /missing/],
    ['an entity that is not an object', file({ entities: [3] }), /must be an object/],
    [
      'an unknown entity kind',
      file({ entities: [{ kind: 'spline', id: 's1' }] }),
      /Unknown kind of entity/,
    ],
    [
      'a point without numbers',
      file({ entities: [{ kind: 'point', id: 'p1', x: 'left', y: 0 }] }),
      /must be a number/,
    ],
    [
      'a point at infinity',
      '{"format":"trammel-sketch","version":1,"entities":[{"kind":"point","id":"p1","x":1e999,"y":0}],"constraints":[]}',
      /must be a number/,
    ],
    [
      'a repeated id',
      file({
        entities: [
          { kind: 'point', id: 'p1', x: 0, y: 0 },
          { kind: 'point', id: 'p1', x: 1, y: 1 },
        ],
      }),
      /appears twice/,
    ],
    [
      'a line to a point that is not there',
      file({
        entities: [
          { kind: 'point', id: 'p1', x: 0, y: 0 },
          { kind: 'line', id: 'l1', a: 'p1', b: 'p7' },
        ],
      }),
      /No point with id "p7"/,
    ],
    [
      'a circle with no size',
      file({
        entities: [
          { kind: 'point', id: 'p1', x: 0, y: 0 },
          { kind: 'circle', id: 'c1', center: 'p1', r: 0 },
        ],
      }),
      /greater than zero/,
    ],
    [
      'a constraint on something missing',
      file({
        entities: [{ kind: 'point', id: 'p1', x: 0, y: 0 }],
        constraints: [{ kind: 'horizontal', id: 'k1', p: 'p1', q: 'p2' }],
      }),
      /needs "q" to be a point/,
    ],
    [
      'an unknown constraint kind',
      file({
        entities: [{ kind: 'point', id: 'p1', x: 0, y: 0 }],
        constraints: [{ kind: 'toString', id: 'k1', p: 'p1' }],
      }),
      /Unknown kind of constraint/,
    ],
    [
      'a constraint without an id',
      file({
        entities: [{ kind: 'point', id: 'p1', x: 0, y: 0 }],
        constraints: [{ kind: 'fixed', p: 'p1', x: 0, y: 0 }],
      }),
      /needs a text id/,
    ],
  ])('refuses %s, and says why', (_label, text, message) => {
    expect(() => parse(text)).toThrow(SketchError);
    expect(() => parse(text)).toThrow(message);
  });
});

describe('SVG export', () => {
  it('draws lines and circles with the y axis flipped to point up', () => {
    const svg = toSvg(
      make({
        points: [
          [0, 0],
          [40, 0],
          [40, 30],
        ],
        lines: [
          ['p1', 'p2'],
          ['p2', 'p3'],
        ],
        circles: [['p1', 10]],
      }),
      5,
    );
    // Bounds are x -10..40, y -10..30, plus a margin of 5 all round.
    expect(svg).toContain('viewBox="0 0 60 50"');
    expect(svg).toContain('<line x1="15" y1="35" x2="55" y2="35"/>'); // the base, at the bottom
    expect(svg).toContain('<line x1="55" y1="35" x2="55" y2="5"/>'); // the upright, going up
    expect(svg).toContain('<circle cx="15" cy="35" r="10"/>');
  });

  it('draws a point that belongs to no shape as a dot, and skips the rest', () => {
    const svg = toSvg(
      make({
        points: [
          [0, 0],
          [10, 0],
          [5, 5],
        ],
        lines: [['p1', 'p2']],
      }),
    );
    expect(svg.match(/<circle/g)).toHaveLength(1);
    expect(svg).toContain('fill="#000"');
  });

  it('produces a valid, empty drawing for an empty sketch', () => {
    const svg = toSvg(emptySketch);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('rounds coordinates to four decimal places', () => {
    const svg = toSvg(
      make({
        points: [
          [0, 0],
          [1 / 3, 0],
        ],
        lines: [['p1', 'p2']],
      }),
      0,
    );
    expect(svg).toContain('x2="0.3333"');
  });
});

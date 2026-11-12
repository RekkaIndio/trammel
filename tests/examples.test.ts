import { describe, expect, it } from 'vitest';
import { analyse, solve } from '../src/core';
import { EXAMPLES } from '../src/examples';

const EXPECTED: Record<string, { state: string; freedom?: number }> = {
  linkage: { state: 'under', freedom: 1 },
  triangle: { state: 'full', freedom: 0 },
  plate: { state: 'full', freedom: 0 },
  ladder: { state: 'under', freedom: 1 },
  impossible: { state: 'over' },
};

describe('examples', () => {
  it('has an expectation written down for every example', () => {
    expect(EXAMPLES.map((e) => e.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(EXAMPLES.map((e) => [e.name, e] as const))(
    '%s behaves as its blurb says',
    (_name, example) => {
      const expected = EXPECTED[example.id];
      const result = solve(example.build());
      expect(result.converged).toBe(expected?.state !== 'over');
      const analysis = analyse(result.converged ? result.sketch : example.build());
      expect(analysis.state).toBe(expected?.state);
      if (expected?.freedom !== undefined) expect(analysis.freedom).toBe(expected.freedom);
    },
  );

  it('gives every example a name and a blurb', () => {
    for (const example of EXAMPLES) {
      expect(example.name.length).toBeGreaterThan(3);
      expect(example.blurb.length).toBeGreaterThan(20);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { Basis, choleskySolve } from '../src/core/linalg';

describe('choleskySolve', () => {
  it('solves a small positive-definite system', () => {
    // [4 2; 2 3] x = [10; 8]  ->  x = [1.75, 1.5]
    const x = choleskySolve(new Float64Array([4, 2, 2, 3]), new Float64Array([10, 8]), 2);
    expect(x).not.toBeNull();
    expect(x?.[0]).toBeCloseTo(1.75, 12);
    expect(x?.[1]).toBeCloseTo(1.5, 12);
  });

  it('solves a 3 by 3 system and reproduces the right-hand side', () => {
    const A = [6, 2, 1, 2, 5, 2, 1, 2, 4];
    const b = [1, -2, 3];
    const x = choleskySolve(new Float64Array(A), new Float64Array(b), 3) as Float64Array;
    for (let i = 0; i < 3; i++) {
      const row = A.slice(i * 3, i * 3 + 3);
      const product = row.reduce((sum, value, j) => sum + value * (x[j] as number), 0);
      expect(product).toBeCloseTo(b[i] as number, 12);
    }
  });

  it('refuses a matrix that is not positive definite', () => {
    expect(choleskySolve(new Float64Array([1, 2, 2, 1]), new Float64Array([1, 1]), 2)).toBeNull();
    expect(choleskySolve(new Float64Array([0, 0, 0, 0]), new Float64Array([1, 1]), 2)).toBeNull();
    expect(choleskySolve(new Float64Array([NaN]), new Float64Array([1]), 1)).toBeNull();
  });
});

describe('Basis', () => {
  it('counts independent directions', () => {
    const basis = new Basis();
    expect(basis.add(new Float64Array([1, 0, 0]))).toBe(true);
    expect(basis.add(new Float64Array([1, 1, 0]))).toBe(true);
    expect(basis.add(new Float64Array([3, -2, 0]))).toBe(false); // in the plane already spanned
    expect(basis.add(new Float64Array([0, 0, 5]))).toBe(true);
    expect(basis.rank).toBe(3);
  });

  it('ignores scale when judging independence', () => {
    const basis = new Basis();
    basis.add(new Float64Array([1e-6, 0]));
    expect(basis.add(new Float64Array([1e6, 0]))).toBe(false);
    expect(basis.add(new Float64Array([0, 1e-6]))).toBe(true);
  });

  it('rejects the zero vector', () => {
    expect(new Basis().add(new Float64Array(4))).toBe(false);
  });

  it('reports how much of each axis is covered', () => {
    const basis = new Basis();
    basis.add(new Float64Array([1, 0, 0]));
    basis.add(new Float64Array([0, 1, 1]));
    expect(basis.coverage(0)).toBeCloseTo(1, 12);
    expect(basis.coverage(1)).toBeCloseTo(0.5, 12);
    expect(basis.coverage(2)).toBeCloseTo(0.5, 12);
  });
});

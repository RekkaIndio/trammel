/**
 * The small amount of dense linear algebra the solver needs.
 * Matrices are stored row by row in a flat Float64Array.
 */

/**
 * Solve A x = b where A is symmetric and positive definite (n by n).
 *
 * Uses a Cholesky factorisation. `A` is overwritten with the factor.
 * Returns null if A turns out not to be positive definite.
 */
export function choleskySolve(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let j = 0; j < n; j++) {
    let diagonal = A[j * n + j] as number;
    for (let k = 0; k < j; k++) {
      const l = A[j * n + k] as number;
      diagonal -= l * l;
    }
    if (!(diagonal > 0)) return null; // also catches NaN
    const d = Math.sqrt(diagonal);
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let sum = A[i * n + j] as number;
      for (let k = 0; k < j; k++) sum -= (A[i * n + k] as number) * (A[j * n + k] as number);
      A[i * n + j] = sum / d;
    }
  }

  // Forward substitution: L y = b
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i] as number;
    for (let k = 0; k < i; k++) sum -= (A[i * n + k] as number) * (y[k] as number);
    y[i] = sum / (A[i * n + i] as number);
  }

  // Back substitution: L^T x = y
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i] as number;
    for (let k = i + 1; k < n; k++) sum -= (A[k * n + i] as number) * (x[k] as number);
    x[i] = sum / (A[i * n + i] as number);
  }
  return x;
}

export function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

export function norm(a: Float64Array): number {
  return Math.sqrt(dot(a, a));
}

/**
 * Grows an orthonormal basis one vector at a time (modified Gram-Schmidt,
 * run twice for stability). Used to count how many equations are truly
 * independent.
 */
export class Basis {
  readonly vectors: Float64Array[] = [];

  constructor(private readonly tolerance = 1e-7) {}

  /**
   * Offer a vector. Returns true if it pointed somewhere new (and was added),
   * false if it was already a combination of the vectors seen so far.
   */
  add(vector: Float64Array): boolean {
    const size = norm(vector);
    if (size < 1e-12) return false;
    const v = vector.map((value) => value / size);
    for (let pass = 0; pass < 2; pass++) {
      for (const q of this.vectors) {
        const overlap = dot(q, v);
        for (let i = 0; i < v.length; i++) v[i] = (v[i] as number) - overlap * (q[i] as number);
      }
    }
    const left = norm(v);
    if (left < this.tolerance) return false;
    for (let i = 0; i < v.length; i++) v[i] = (v[i] as number) / left;
    this.vectors.push(v);
    return true;
  }

  get rank(): number {
    return this.vectors.length;
  }

  /**
   * How much of the unit direction along `index` the basis covers:
   * 1 means fully covered, 0 means not at all.
   */
  coverage(index: number): number {
    let sum = 0;
    for (const q of this.vectors) sum += (q[index] as number) * (q[index] as number);
    return sum;
  }
}

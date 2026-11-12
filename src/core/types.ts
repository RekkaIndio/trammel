/**
 * The data model for a sketch.
 *
 * A sketch is plain, immutable data: a list of entities (the things you
 * draw) and a list of constraints (the rules they must obey). Nothing in
 * here knows about the solver or the screen.
 */

export type Id = string;

/** A point owns two solver parameters: x and y. */
export interface PointEntity {
  readonly kind: 'point';
  readonly id: Id;
  readonly x: number;
  readonly y: number;
}

/** A line owns no parameters of its own. It joins two points. */
export interface LineEntity {
  readonly kind: 'line';
  readonly id: Id;
  readonly a: Id;
  readonly b: Id;
}

/** A circle owns one parameter (its radius) and borrows a centre point. */
export interface CircleEntity {
  readonly kind: 'circle';
  readonly id: Id;
  readonly center: Id;
  readonly r: number;
}

export type Entity = PointEntity | LineEntity | CircleEntity;
export type EntityKind = Entity['kind'];

interface Base<K extends string> {
  readonly kind: K;
  readonly id: Id;
}

export type Constraint =
  /** Two points sit at the same place. */
  | (Base<'coincident'> & { readonly p: Id; readonly q: Id })
  /** Two points share a y coordinate. Applied to a line, it uses the endpoints. */
  | (Base<'horizontal'> & { readonly p: Id; readonly q: Id })
  /** Two points share an x coordinate. */
  | (Base<'vertical'> & { readonly p: Id; readonly q: Id })
  /** A point is pinned to a fixed position. */
  | (Base<'fixed'> & { readonly p: Id; readonly x: number; readonly y: number })
  /** Two points are a set distance apart. Also used for the length of a line. */
  | (Base<'distance'> & { readonly p: Id; readonly q: Id; readonly value: number })
  | (Base<'parallel'> & { readonly l1: Id; readonly l2: Id })
  | (Base<'perpendicular'> & { readonly l1: Id; readonly l2: Id })
  | (Base<'equalLength'> & { readonly l1: Id; readonly l2: Id })
  /** A point lies on the infinite line through a segment. */
  | (Base<'pointOnLine'> & { readonly p: Id; readonly line: Id })
  | (Base<'pointOnCircle'> & { readonly p: Id; readonly circle: Id })
  | (Base<'radius'> & { readonly circle: Id; readonly value: number })
  /** A line touches a circle at exactly one point. */
  | (Base<'tangent'> & { readonly line: Id; readonly circle: Id })
  | (Base<'equalRadius'> & { readonly c1: Id; readonly c2: Id });

export type ConstraintKind = Constraint['kind'];

/** `Omit` that keeps a union a union. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A constraint that has not been given an id yet. */
export type NewConstraint = DistributiveOmit<Constraint, 'id'>;

export interface Sketch {
  readonly entities: readonly Entity[];
  readonly constraints: readonly Constraint[];
}

/** The kind of entity each field of each constraint must point at. */
export const CONSTRAINT_REFS: {
  readonly [K in ConstraintKind]: Readonly<Record<string, EntityKind>>;
} = {
  coincident: { p: 'point', q: 'point' },
  horizontal: { p: 'point', q: 'point' },
  vertical: { p: 'point', q: 'point' },
  fixed: { p: 'point' },
  distance: { p: 'point', q: 'point' },
  parallel: { l1: 'line', l2: 'line' },
  perpendicular: { l1: 'line', l2: 'line' },
  equalLength: { l1: 'line', l2: 'line' },
  pointOnLine: { p: 'point', line: 'line' },
  pointOnCircle: { p: 'point', circle: 'circle' },
  radius: { circle: 'circle' },
  tangent: { line: 'line', circle: 'circle' },
  equalRadius: { c1: 'circle', c2: 'circle' },
};

export const CONSTRAINT_KINDS = Object.keys(CONSTRAINT_REFS) as readonly ConstraintKind[];

/** The ids of every entity a constraint refers to, in field order. */
export function constraintRefs(c: Constraint | NewConstraint): Id[] {
  const fields = Object.keys(CONSTRAINT_REFS[c.kind]);
  const record = c as unknown as Record<string, Id>;
  return fields.map((field) => record[field] as Id);
}

/** True for the constraints that carry a number the user can edit. */
export function hasValue(c: Constraint): c is Extract<Constraint, { readonly value: number }> {
  return c.kind === 'distance' || c.kind === 'radius';
}

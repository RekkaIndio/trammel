/**
 * The constraint catalogue: which constraints make sense for a given
 * selection, and how to describe an existing constraint in words.
 *
 * This is deliberately separate from the interface so the rules ("two lines
 * can be made parallel, a line and a circle can be made tangent") are plain
 * data that can be tested without a browser.
 */

import { distance, tidy } from './geometry';
import { findEntity, getCircle, getLine, getPoint } from './sketch';
import {
  constraintRefs,
  type CircleEntity,
  type Constraint,
  type ConstraintKind,
  type Entity,
  type Id,
  type LineEntity,
  type NewConstraint,
  type PointEntity,
  type Sketch,
} from './types';

/** `concentric` is offered as its own action but stored as `coincident` centres. */
export type OptionKey = ConstraintKind | 'concentric';

export interface ConstraintOption {
  readonly key: OptionKey;
  readonly label: string;
  /** One plain sentence saying what it does. */
  readonly help: string;
  /** The constraint to add. Measurements start at their current value. */
  readonly constraint: NewConstraint;
}

/** P1, L2, C3: how entities are named to the user. */
export function displayName(id: Id): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function lineBetween(sketch: Sketch, p: Id, q: Id): LineEntity | undefined {
  return sketch.entities.find(
    (e): e is LineEntity =>
      e.kind === 'line' && ((e.a === p && e.b === q) || (e.a === q && e.b === p)),
  );
}

function sameRefs(a: Constraint | NewConstraint, b: Constraint | NewConstraint): boolean {
  const first = constraintRefs(a).slice().sort();
  const second = constraintRefs(b).slice().sort();
  return first.length === second.length && first.every((id, i) => id === second[i]);
}

/** True if the sketch already has this constraint (ignoring any value it carries). */
export function alreadyHas(sketch: Sketch, candidate: NewConstraint): boolean {
  return sketch.constraints.some((c) => c.kind === candidate.kind && sameRefs(c, candidate));
}

/** A measurement to start a dimension at: the current size, rounded, never zero. */
function startingValue(measured: number): number {
  return Math.max(tidy(measured), 0.01);
}

function pairOptions(sketch: Sketch, p: PointEntity, q: PointEntity, asLine: boolean) {
  const options: ConstraintOption[] = [
    {
      key: 'horizontal',
      label: 'Horizontal',
      help: asLine ? 'Keep this line level.' : 'Keep these points level with each other.',
      constraint: { kind: 'horizontal', p: p.id, q: q.id },
    },
    {
      key: 'vertical',
      label: 'Vertical',
      help: asLine ? 'Keep this line upright.' : 'Keep one point directly above the other.',
      constraint: { kind: 'vertical', p: p.id, q: q.id },
    },
    {
      key: 'distance',
      label: asLine ? 'Length' : 'Distance',
      help: asLine ? 'Set how long this line is.' : 'Set how far apart these points are.',
      constraint: {
        kind: 'distance',
        p: p.id,
        q: q.id,
        value: startingValue(distance(p, q)),
      },
    },
  ];
  if (!asLine && !lineBetween(sketch, p.id, q.id)) {
    options.unshift({
      key: 'coincident',
      label: 'Coincident',
      help: 'Hold these two points at the same place.',
      constraint: { kind: 'coincident', p: p.id, q: q.id },
    });
  }
  return options;
}

/**
 * The constraints that can be added for a selection, in the order they
 * should be offered. Anything the sketch already has is left out.
 */
export function optionsFor(sketch: Sketch, selection: readonly Id[]): ConstraintOption[] {
  const entities = selection
    .map((id) => findEntity(sketch, id))
    .filter((e): e is Entity => e !== undefined);
  if (entities.length !== selection.length || new Set(selection).size !== selection.length) {
    return [];
  }

  const points = entities.filter((e): e is PointEntity => e.kind === 'point');
  const lines = entities.filter((e): e is LineEntity => e.kind === 'line');
  const circles = entities.filter((e): e is CircleEntity => e.kind === 'circle');
  const shape = `${points.length}${lines.length}${circles.length}`;
  let options: ConstraintOption[] = [];

  switch (shape) {
    case '100': {
      const [p] = points as [PointEntity];
      options = [
        {
          key: 'fixed',
          label: 'Fix in place',
          help: 'Pin this point where it is.',
          constraint: { kind: 'fixed', p: p.id, x: p.x, y: p.y },
        },
      ];
      break;
    }
    case '200': {
      const [p, q] = points as [PointEntity, PointEntity];
      options = pairOptions(sketch, p, q, false);
      break;
    }
    case '010': {
      const [line] = lines as [LineEntity];
      options = pairOptions(sketch, getPoint(sketch, line.a), getPoint(sketch, line.b), true);
      break;
    }
    case '020': {
      const [l1, l2] = lines as [LineEntity, LineEntity];
      options = [
        {
          key: 'parallel',
          label: 'Parallel',
          help: 'Keep these lines pointing the same way.',
          constraint: { kind: 'parallel', l1: l1.id, l2: l2.id },
        },
        {
          key: 'perpendicular',
          label: 'Perpendicular',
          help: 'Keep these lines at a right angle.',
          constraint: { kind: 'perpendicular', l1: l1.id, l2: l2.id },
        },
        {
          key: 'equalLength',
          label: 'Equal length',
          help: 'Keep these lines the same length.',
          constraint: { kind: 'equalLength', l1: l1.id, l2: l2.id },
        },
      ];
      break;
    }
    case '110': {
      const [p] = points as [PointEntity];
      const [line] = lines as [LineEntity];
      if (line.a !== p.id && line.b !== p.id) {
        options = [
          {
            key: 'pointOnLine',
            label: 'On line',
            help: 'Keep the point on this line, or on its extension.',
            constraint: { kind: 'pointOnLine', p: p.id, line: line.id },
          },
        ];
      }
      break;
    }
    case '101': {
      const [p] = points as [PointEntity];
      const [circle] = circles as [CircleEntity];
      if (circle.center !== p.id) {
        options = [
          {
            key: 'pointOnCircle',
            label: 'On circle',
            help: 'Keep the point on the rim of this circle.',
            constraint: { kind: 'pointOnCircle', p: p.id, circle: circle.id },
          },
        ];
      }
      break;
    }
    case '011': {
      const [line] = lines as [LineEntity];
      const [circle] = circles as [CircleEntity];
      options = [
        {
          key: 'tangent',
          label: 'Tangent',
          help: 'Make the line just touch the circle.',
          constraint: { kind: 'tangent', line: line.id, circle: circle.id },
        },
      ];
      break;
    }
    case '001': {
      const [circle] = circles as [CircleEntity];
      options = [
        {
          key: 'radius',
          label: 'Radius',
          help: 'Set how big this circle is.',
          constraint: { kind: 'radius', circle: circle.id, value: startingValue(circle.r) },
        },
      ];
      break;
    }
    case '002': {
      const [c1, c2] = circles as [CircleEntity, CircleEntity];
      options = [
        {
          key: 'equalRadius',
          label: 'Equal radius',
          help: 'Keep these circles the same size.',
          constraint: { kind: 'equalRadius', c1: c1.id, c2: c2.id },
        },
      ];
      if (c1.center !== c2.center) {
        options.push({
          key: 'concentric',
          label: 'Concentric',
          help: 'Give these circles the same centre.',
          constraint: { kind: 'coincident', p: c1.center, q: c2.center },
        });
      }
      break;
    }
  }

  return options.filter((option) => !alreadyHas(sketch, option.constraint));
}

const TITLES: Readonly<Record<ConstraintKind, string>> = {
  coincident: 'Coincident',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  fixed: 'Fixed',
  distance: 'Distance',
  parallel: 'Parallel',
  perpendicular: 'Perpendicular',
  equalLength: 'Equal length',
  pointOnLine: 'On line',
  pointOnCircle: 'On circle',
  radius: 'Radius',
  tangent: 'Tangent',
  equalRadius: 'Equal radius',
};

export interface Description {
  /** What kind of rule it is: "Parallel", "Length". */
  readonly title: string;
  /** What it applies to: "L1, L3". */
  readonly targets: string;
  /** The entities to highlight when pointing at this constraint. */
  readonly highlight: readonly Id[];
}

/** Describe a constraint in the words the interface uses. */
export function describe(sketch: Sketch, c: Constraint): Description {
  if (c.kind === 'horizontal' || c.kind === 'vertical' || c.kind === 'distance') {
    const line = lineBetween(sketch, c.p, c.q);
    if (line) {
      return {
        title: c.kind === 'distance' ? 'Length' : TITLES[c.kind],
        targets: displayName(line.id),
        highlight: [line.id],
      };
    }
  }
  if (c.kind === 'coincident') {
    const circles = sketch.entities.filter((e): e is CircleEntity => e.kind === 'circle');
    const first = circles.find((circle) => circle.center === c.p);
    const second = circles.find((circle) => circle.center === c.q);
    if (first && second) {
      return {
        title: 'Concentric',
        targets: `${displayName(first.id)}, ${displayName(second.id)}`,
        highlight: [first.id, second.id],
      };
    }
  }
  const refs = constraintRefs(c);
  return { title: TITLES[c.kind], targets: refs.map(displayName).join(', '), highlight: refs };
}

/** The measurement a value-carrying constraint currently has in the geometry. */
export function measure(sketch: Sketch, c: Constraint): number | null {
  if (c.kind === 'distance') return distance(getPoint(sketch, c.p), getPoint(sketch, c.q));
  if (c.kind === 'radius') return getCircle(sketch, c.circle).r;
  return null;
}

/** Resolve a line id to its two endpoint entities. */
export function lineEnds(sketch: Sketch, id: Id): [PointEntity, PointEntity] {
  const line = getLine(sketch, id);
  return [getPoint(sketch, line.a), getPoint(sketch, line.b)];
}

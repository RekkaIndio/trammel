/**
 * The sheet: draws the sketch and turns pointer input into edits.
 *
 * Everything is drawn in screen pixels from positions this component
 * computes itself, so line weights, point sizes and lettering stay the same
 * size however far the view is zoomed.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  addCircle,
  addConstraints,
  addLine,
  addPoint,
  bounds,
  describe,
  distance,
  drag,
  findEntity,
  footOfPerpendicular,
  getPoint,
  hitTest,
  midpoint,
  tidy,
  type Analysis,
  type Constraint,
  type DragTarget,
  type Id,
  type Sketch,
  type Vec,
} from '../core';
import { Icon, glyph, type IconName } from './icons';
import { gridStep, panBy, toScreen, toWorld, zoomAbout, type Size, type View } from './view';

export type Tool = 'select' | 'point' | 'line' | 'circle' | 'rect';

/** A place a shape will start from: an existing point, or a spot where one will be made. */
type Anchor = { readonly id: Id } | { readonly at: Vec };

type Draft =
  | { readonly tool: 'line'; readonly from: Anchor; readonly first: Anchor }
  | { readonly tool: 'circle'; readonly center: Anchor }
  | { readonly tool: 'rect'; readonly corner: Vec }
  | null;

type Gesture =
  | { readonly type: 'none' }
  | {
      readonly type: 'pending';
      readonly start: Vec;
      readonly hit: Id | null;
      readonly touch: boolean;
    }
  | { readonly type: 'pan'; readonly last: Vec }
  | {
      readonly type: 'drag';
      readonly hit: Id;
      readonly startWorld: Vec;
      /** Where the dragged entity's points were when the drag began. */
      readonly origin: readonly { readonly id: Id; readonly x: number; readonly y: number }[];
      /** The sketch as it was when the drag began. */
      readonly base: Sketch;
      /** The most recent solved geometry. Each move continues from here. */
      latest: Sketch;
    };

interface CanvasProps {
  sketch: Sketch;
  analysis: Analysis;
  tool: Tool;
  selection: readonly Id[];
  /** The constraint being pointed at in the list, if any. */
  highlightConstraint: Id | null;
  view: View;
  size: Size;
  onSize: (size: Size) => void;
  onView: (view: View) => void;
  onFit: () => void;
  onTool: (tool: Tool) => void;
  onSelection: (ids: Id[]) => void;
  onPreview: (sketch: Sketch | null) => void;
  onCommit: (sketch: Sketch) => void;
  onPickConstraint: (id: Id) => void;
  children?: ReactNode;
}

const DRAG_THRESHOLD = 4;
const DIMENSION_OFFSET = 24;

function hitTolerances(view: View, touch: boolean) {
  return {
    tolerance: (touch ? 14 : 7) / view.zoom,
    pointTolerance: (touch ? 18 : 10) / view.zoom,
  };
}

function realise(sketch: Sketch, anchor: Anchor): { sketch: Sketch; id: Id } {
  return 'id' in anchor ? { sketch, id: anchor.id } : addPoint(sketch, anchor.at.x, anchor.at.y);
}

function anchorPosition(sketch: Sketch, anchor: Anchor): Vec | null {
  if ('at' in anchor) return anchor.at;
  const e = findEntity(sketch, anchor.id);
  return e && e.kind === 'point' ? e : null;
}

function anchorExists(sketch: Sketch, anchor: Anchor): boolean {
  return 'at' in anchor || findEntity(sketch, anchor.id) !== undefined;
}

/** Keep lettering the right way up, whichever way the line it follows was drawn. */
function readableAngle(degrees: number): number {
  if (degrees > 90) return degrees - 180;
  if (degrees <= -90) return degrees + 180;
  return degrees;
}

export function Canvas(props: CanvasProps) {
  const { sketch, analysis, tool, selection, view, size } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture>({ type: 'none' });
  const [draft, setDraft] = useState<Draft>(null);
  const [cursor, setCursor] = useState<Vec | null>(null);
  const [hover, setHover] = useState<Id | null>(null);
  const [dragging, setDragging] = useState(false);

  // Keep the latest props reachable from event listeners without re-binding them.
  const live = useRef(props);
  live.current = props;

  const { onSize } = props;
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const report = () => onSize({ width: element.clientWidth, height: element.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);

  // The wheel listener must be non-passive to stop the page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const p = live.current;
      p.onView(zoomAbout(p.view, p.size, at, Math.exp(-event.deltaY * 0.0015)));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // A half-drawn shape makes no sense once the tool changes.
  useEffect(() => setDraft(null), [tool]);

  // Undo can remove the point a half-drawn shape starts from.
  useEffect(() => {
    if (!draft) return;
    const ok =
      draft.tool === 'line'
        ? anchorExists(sketch, draft.from) && anchorExists(sketch, draft.first)
        : draft.tool === 'circle'
          ? anchorExists(sketch, draft.center)
          : true;
    if (!ok) setDraft(null);
  }, [sketch, draft]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      const p = live.current;
      if (event.key === 'Escape') {
        if (draft) setDraft(null);
        else if (p.tool !== 'select') p.onTool('select');
        else p.onSelection([]);
      } else if (event.key === 'Enter' && draft) {
        setDraft(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft]);

  const screenOf = useCallback((p: Vec) => toScreen(view, size, p), [view, size]);

  const eventPosition = (event: ReactPointerEvent): Vec => {
    const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const anchorAt = (world: Vec, touch: boolean): Anchor => {
    const id = hitTest(sketch, world, { ...hitTolerances(view, touch), pointsOnly: true });
    return id ? { id } : { at: world };
  };

  // ---- Drawing tools ------------------------------------------------------

  const clickWithTool = (world: Vec, touch: boolean) => {
    const anchor = anchorAt(world, touch);
    const reach = hitTolerances(view, touch).pointTolerance;

    if (tool === 'point') {
      if ('at' in anchor) props.onCommit(addPoint(sketch, world.x, world.y).sketch);
      return;
    }

    if (tool === 'line') {
      if (!draft || draft.tool !== 'line') {
        setDraft({ tool: 'line', from: anchor, first: anchor });
        return;
      }
      const fromPosition = anchorPosition(sketch, draft.from);
      const sameSpot =
        ('id' in anchor && 'id' in draft.from && anchor.id === draft.from.id) ||
        (fromPosition !== null && distance(fromPosition, world) <= reach);
      if (sameSpot) {
        setDraft(null); // clicking the last point again ends the run of lines
        return;
      }
      const start = realise(sketch, draft.from);
      const end = realise(start.sketch, anchor);
      const exists = end.sketch.entities.some(
        (e) =>
          e.kind === 'line' &&
          ((e.a === start.id && e.b === end.id) || (e.a === end.id && e.b === start.id)),
      );
      props.onCommit(exists ? end.sketch : addLine(end.sketch, start.id, end.id).sketch);
      const first: Anchor = draft.first === draft.from ? { id: start.id } : draft.first;
      const closed = 'id' in first && first.id === end.id;
      setDraft(closed ? null : { tool: 'line', from: { id: end.id }, first });
      return;
    }

    if (tool === 'circle') {
      if (!draft || draft.tool !== 'circle') {
        setDraft({ tool: 'circle', center: anchor });
        return;
      }
      const centre = anchorPosition(sketch, draft.center);
      if (!centre) return;
      const r = distance(centre, world);
      if (r * view.zoom < 3) return; // too small to have been meant
      const made = realise(sketch, draft.center);
      props.onCommit(addCircle(made.sketch, made.id, r).sketch);
      setDraft(null);
      return;
    }

    if (tool === 'rect') {
      if (!draft || draft.tool !== 'rect') {
        setDraft({ tool: 'rect', corner: world });
        return;
      }
      const a = draft.corner;
      if (Math.abs(world.x - a.x) * view.zoom < 3 || Math.abs(world.y - a.y) * view.zoom < 3)
        return;
      let next = sketch;
      const corners: Id[] = [];
      for (const [x, y] of [
        [a.x, a.y],
        [world.x, a.y],
        [world.x, world.y],
        [a.x, world.y],
      ] as const) {
        const made = addPoint(next, x, y);
        next = made.sketch;
        corners.push(made.id);
      }
      const [p1, p2, p3, p4] = corners as [Id, Id, Id, Id];
      for (const [from, to] of [
        [p1, p2],
        [p2, p3],
        [p3, p4],
        [p4, p1],
      ] as const) {
        next = addLine(next, from, to).sketch;
      }
      // A rectangle is four lines plus the rules that keep it square.
      next = addConstraints(next, [
        { kind: 'horizontal', p: p1, q: p2 },
        { kind: 'horizontal', p: p4, q: p3 },
        { kind: 'vertical', p: p2, q: p3 },
        { kind: 'vertical', p: p1, q: p4 },
      ]);
      props.onCommit(next);
      setDraft(null);
    }
  };

  // ---- Pointer handling ---------------------------------------------------

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const at = eventPosition(event);
    const touch = event.pointerType === 'touch';
    if (event.button === 1) {
      gesture.current = { type: 'pan', last: at };
      return;
    }
    const hit =
      tool === 'select'
        ? hitTest(sketch, toWorld(view, size, at), hitTolerances(view, touch))
        : null;
    gesture.current = { type: 'pending', start: at, hit, touch };
  };

  const dragTargets = (g: Extract<Gesture, { type: 'drag' }>, world: Vec): DragTarget[] => {
    const entity = findEntity(sketch, g.hit);
    if (entity?.kind === 'circle') {
      const centre = getPoint(g.latest, entity.center);
      return [{ kind: 'radius', id: entity.id, r: distance(centre, world) }];
    }
    const dx = world.x - g.startWorld.x;
    const dy = world.y - g.startWorld.y;
    return g.origin.map((p) => ({ kind: 'point', id: p.id, x: p.x + dx, y: p.y + dy }));
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const at = eventPosition(event);
    const world = toWorld(view, size, at);
    const touch = event.pointerType === 'touch';
    let g = gesture.current;

    if (g.type === 'pending' && Math.hypot(at.x - g.start.x, at.y - g.start.y) > DRAG_THRESHOLD) {
      const entity = g.hit ? findEntity(sketch, g.hit) : undefined;
      if (entity) {
        const ids =
          entity.kind === 'point'
            ? [entity.id]
            : entity.kind === 'line'
              ? [entity.a, entity.b]
              : [];
        g = {
          type: 'drag',
          hit: entity.id,
          startWorld: toWorld(view, size, g.start),
          origin: ids.map((id) => {
            const p = getPoint(sketch, id);
            return { id, x: p.x, y: p.y };
          }),
          base: sketch,
          latest: sketch,
        };
        setDragging(true);
      } else {
        g = { type: 'pan', last: g.start };
      }
      gesture.current = g;
    }

    if (g.type === 'drag') {
      g.latest = drag(g.latest, dragTargets(g, world));
      props.onPreview(g.latest);
    } else if (g.type === 'pan') {
      props.onView(panBy(view, at.x - g.last.x, at.y - g.last.y));
      gesture.current = { type: 'pan', last: at };
    } else if (g.type === 'none') {
      const over = tool === 'select' ? hitTest(sketch, world, hitTolerances(view, touch)) : null;
      if (over !== hover) setHover(over);
    }
    setCursor(world);
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = { type: 'none' };
    setDragging(false);
    if (g.type === 'drag') {
      // Committing the previewed geometry makes the whole drag one undo step.
      if (g.latest !== g.base) props.onCommit(g.latest);
      else props.onPreview(null);
      return;
    }
    if (g.type !== 'pending') return;
    if (tool === 'select') {
      if (!g.hit) props.onSelection([]);
      else if (selection.includes(g.hit)) props.onSelection(selection.filter((id) => id !== g.hit));
      else props.onSelection([...selection, g.hit]);
      return;
    }
    clickWithTool(toWorld(view, size, eventPosition(event)), g.touch);
  };

  const onPointerCancel = () => {
    if (gesture.current.type === 'drag') props.onPreview(null);
    gesture.current = { type: 'none' };
    setDragging(false);
  };

  // ---- What to draw -------------------------------------------------------

  const positions = useMemo(() => {
    const map = new Map<Id, Vec>();
    for (const e of sketch.entities) if (e.kind === 'point') map.set(e.id, screenOf(e));
    return map;
  }, [sketch, screenOf]);
  const at = (id: Id): Vec => positions.get(id) ?? { x: 0, y: 0 };

  const { conflicted, emphasised, pinned } = useMemo(() => {
    const bad = new Set<Id>();
    const strong = new Set<Id>();
    const fixed = new Set<Id>();
    for (const c of sketch.constraints) {
      if (c.kind === 'fixed') fixed.add(c.p);
      if (analysis.conflicting.has(c.id))
        describe(sketch, c).highlight.forEach((id) => bad.add(id));
      if (c.id === props.highlightConstraint) {
        describe(sketch, c).highlight.forEach((id) => strong.add(id));
      }
    }
    return { conflicted: bad, emphasised: strong, pinned: fixed };
  }, [sketch, analysis, props.highlightConstraint]);

  const selected = new Set(selection);
  const stateClass = (id: Id) =>
    conflicted.has(id) ? 'is-conflict' : analysis.free.has(id) ? 'is-free' : 'is-set';

  // Grid
  const grid = useMemo(() => {
    if (size.width === 0) return { minor: '', major: '', step: 1 };
    const step = gridStep(view.zoom);
    const topLeft = toWorld(view, size, { x: 0, y: 0 });
    const bottomRight = toWorld(view, size, { x: size.width, y: size.height });
    let minor = '';
    let major = '';
    for (let i = Math.floor(topLeft.x / step); i * step <= bottomRight.x; i++) {
      const x = Math.round(toScreen(view, size, { x: i * step, y: 0 }).x) + 0.5;
      const segment = `M${x} 0V${size.height}`;
      if (i % 5 === 0) major += segment;
      else minor += segment;
    }
    for (let j = Math.floor(bottomRight.y / step); j * step <= topLeft.y; j++) {
      const y = Math.round(toScreen(view, size, { x: 0, y: j * step }).y) + 0.5;
      const segment = `M0 ${y}H${size.width}`;
      if (j % 5 === 0) major += segment;
      else minor += segment;
    }
    return { minor, major, step };
  }, [view, size]);

  const halos: ReactNode[] = [];
  const shapes: ReactNode[] = [];
  const dots: ReactNode[] = [];

  for (const e of sketch.entities) {
    const lit = selected.has(e.id) ? 'is-selected' : emphasised.has(e.id) ? 'is-emphasised' : '';
    const hovered = hover === e.id && !dragging ? ' is-hover' : '';
    if (e.kind === 'line') {
      const a = at(e.a);
      const b = at(e.b);
      if (lit) {
        halos.push(
          <line key={e.id} className={`halo ${lit}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />,
        );
      }
      shapes.push(
        <line
          key={e.id}
          data-id={e.id}
          className={`shape ${stateClass(e.id)}${hovered}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
        />,
      );
    } else if (e.kind === 'circle') {
      const c = at(e.center);
      const r = e.r * view.zoom;
      if (lit) halos.push(<circle key={e.id} className={`halo ${lit}`} cx={c.x} cy={c.y} r={r} />);
      shapes.push(
        <circle
          key={e.id}
          data-id={e.id}
          className={`shape ${stateClass(e.id)}${hovered}`}
          cx={c.x}
          cy={c.y}
          r={r}
        />,
      );
    } else {
      const p = at(e.id);
      if (lit)
        halos.push(<circle key={e.id} className={`halo-dot ${lit}`} cx={p.x} cy={p.y} r={9} />);
      dots.push(
        pinned.has(e.id) ? (
          <rect
            key={e.id}
            data-id={e.id}
            className={`dot is-pinned ${stateClass(e.id)}${hovered}`}
            x={p.x - 4}
            y={p.y - 4}
            width={8}
            height={8}
          />
        ) : (
          <circle
            key={e.id}
            data-id={e.id}
            className={`dot ${stateClass(e.id)}${hovered}`}
            cx={p.x}
            cy={p.y}
            r={3.5}
          />
        ),
      );
    }
  }

  // Dimensions and constraint badges
  const box = bounds(sketch);
  const middle = box
    ? screenOf({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 })
    : { x: 0, y: 0 };
  const dimensions: ReactNode[] = [];
  const badgeGroups = new Map<
    string,
    { x: number; y: number; items: { c: Constraint; icon: IconName }[] }
  >();
  const addBadge = (c: Constraint, where: Vec, icon: IconName = c.kind) => {
    const key = `${Math.round(where.x / 6)}:${Math.round(where.y / 6)}`;
    const group = badgeGroups.get(key) ?? { x: where.x, y: where.y, items: [] };
    group.items.push({ c, icon });
    badgeGroups.set(key, group);
  };
  const constraintClass = (c: Constraint) =>
    (analysis.conflicting.has(c.id) ? ' is-conflict' : '') +
    (analysis.redundant.has(c.id) && !analysis.conflicting.has(c.id) ? ' is-redundant' : '') +
    (c.id === props.highlightConstraint ? ' is-emphasised' : '');
  // Labels and badges are clickable in their own right. Stopping the press
  // keeps the sheet from treating it as a click on empty space, and acting on
  // the click (not the press) lets the number box keep the keyboard focus.
  const pick = (id: Id) => ({
    onPointerDown: (event: ReactPointerEvent) => event.stopPropagation(),
    onClick: () => props.onPickConstraint(id),
  });

  for (const c of sketch.constraints) {
    switch (c.kind) {
      case 'distance': {
        const a = at(c.p);
        const b = at(c.q);
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < 1) break;
        const ux = (b.x - a.x) / length;
        const uy = (b.y - a.y) / length;
        // Put the dimension on the outside: the side facing away from the
        // middle of the sketch. If that does not decide it, go above or left.
        let nx = uy;
        let ny = -ux;
        const outward = nx * ((a.x + b.x) / 2 - middle.x) + ny * ((a.y + b.y) / 2 - middle.y);
        const flip =
          Math.abs(outward) > 2 ? outward < 0 : ny > 0.001 || (Math.abs(ny) <= 0.001 && nx > 0);
        if (flip) {
          nx = -nx;
          ny = -ny;
        }
        const a2 = { x: a.x + nx * DIMENSION_OFFSET, y: a.y + ny * DIMENSION_OFFSET };
        const b2 = { x: b.x + nx * DIMENSION_OFFSET, y: b.y + ny * DIMENSION_OFFSET };
        const head = (tip: Vec, direction: number) =>
          `M${tip.x} ${tip.y}l${direction * ux * 8 + nx * 2.6} ${direction * uy * 8 + ny * 2.6}l${-nx * 5.2} ${-ny * 5.2}z`;
        const mid = midpoint(a2, b2);
        const angle = readableAngle((Math.atan2(uy, ux) * 180) / Math.PI);
        dimensions.push(
          <g key={c.id} className={`dimension${constraintClass(c)}`}>
            <path
              className="dimension-line"
              d={
                `M${a.x + nx * 5} ${a.y + ny * 5}L${a2.x + nx * 6} ${a2.y + ny * 6}` +
                `M${b.x + nx * 5} ${b.y + ny * 5}L${b2.x + nx * 6} ${b2.y + ny * 6}` +
                `M${a2.x} ${a2.y}L${b2.x} ${b2.y}`
              }
            />
            {length > 26 && <path className="dimension-head" d={head(a2, 1) + head(b2, -1)} />}
            <text
              className="dimension-text"
              data-constraint={c.id}
              transform={`translate(${mid.x + nx * 9} ${mid.y + ny * 9}) rotate(${angle})`}
              textAnchor="middle"
              dominantBaseline="central"
              {...pick(c.id)}
            >
              {tidy(c.value)}
            </text>
          </g>,
        );
        break;
      }
      case 'radius': {
        const circle = findEntity(sketch, c.circle);
        if (!circle || circle.kind !== 'circle') break;
        const centre = at(circle.center);
        const r = circle.r * view.zoom;
        const k = Math.SQRT1_2;
        const rim = { x: centre.x + r * k, y: centre.y - r * k };
        dimensions.push(
          <g key={c.id} className={`dimension${constraintClass(c)}`}>
            <path className="dimension-line" d={`M${centre.x} ${centre.y}L${rim.x} ${rim.y}`} />
            {r > 20 && (
              <path
                className="dimension-head"
                d={`M${rim.x} ${rim.y}l${-k * 8 - k * 2.6} ${k * 8 - k * 2.6}l${k * 5.2} ${k * 5.2}z`}
              />
            )}
            <text
              className="dimension-text"
              data-constraint={c.id}
              x={rim.x + 7}
              y={rim.y - 8}
              {...pick(c.id)}
            >
              R {tidy(c.value)}
            </text>
          </g>,
        );
        break;
      }
      case 'horizontal':
      case 'vertical':
        addBadge(c, midpoint(at(c.p), at(c.q)));
        break;
      case 'coincident':
        addBadge(
          c,
          at(c.p),
          describe(sketch, c).title === 'Concentric' ? 'concentric' : 'coincident',
        );
        break;
      case 'pointOnLine':
      case 'pointOnCircle':
        addBadge(c, at(c.p));
        break;
      case 'parallel':
      case 'perpendicular':
      case 'equalLength':
        for (const id of [c.l1, c.l2]) {
          const line = findEntity(sketch, id);
          if (line?.kind === 'line') addBadge(c, midpoint(at(line.a), at(line.b)));
        }
        break;
      case 'tangent': {
        const line = findEntity(sketch, c.line);
        const circle = findEntity(sketch, c.circle);
        if (line?.kind === 'line' && circle?.kind === 'circle') {
          addBadge(c, footOfPerpendicular(at(circle.center), at(line.a), at(line.b)));
        }
        break;
      }
      case 'equalRadius':
        for (const id of [c.c1, c.c2]) {
          const circle = findEntity(sketch, id);
          if (circle?.kind === 'circle') {
            const centre = at(circle.center);
            const r = circle.r * view.zoom * Math.SQRT1_2;
            addBadge(c, { x: centre.x - r, y: centre.y - r });
          }
        }
        break;
      case 'fixed':
        break; // shown by drawing the point as a square
    }
  }

  const badges: ReactNode[] = [];
  for (const group of badgeGroups.values()) {
    group.items.forEach(({ c, icon }, index) => {
      const x = group.x + 9 + index * 19;
      const y = group.y - 25;
      badges.push(
        <g
          key={`${c.id}:${badges.length}`}
          className={`badge${constraintClass(c)}`}
          data-constraint={c.id}
          transform={`translate(${x} ${y})`}
          {...pick(c.id)}
        >
          <rect width="17" height="17" rx="3" />
          <g transform="translate(0.5 0.5)">{glyph(icon)}</g>
        </g>,
      );
    });
  }

  // The shape being drawn, following the cursor
  let preview: ReactNode = null;
  let snapRing: ReactNode = null;
  if (cursor && tool !== 'select' && gesture.current.type !== 'pan') {
    const snap = hitTest(sketch, cursor, { ...hitTolerances(view, false), pointsOnly: true });
    if (snap) {
      const p = at(snap);
      snapRing = <circle className="snap-ring" cx={p.x} cy={p.y} r={8} />;
    }
    const end = screenOf(snap ? getPoint(sketch, snap) : cursor);
    if (draft?.tool === 'line') {
      const from = anchorPosition(sketch, draft.from);
      if (from) {
        const a = screenOf(from);
        preview = <line className="preview" x1={a.x} y1={a.y} x2={end.x} y2={end.y} />;
      }
    } else if (draft?.tool === 'circle') {
      const centre = anchorPosition(sketch, draft.center);
      if (centre) {
        const c = screenOf(centre);
        preview = (
          <>
            <circle
              className="preview"
              cx={c.x}
              cy={c.y}
              r={distance(centre, cursor) * view.zoom}
            />
            <circle className="preview-dot" cx={c.x} cy={c.y} r={3} />
          </>
        );
      }
    } else if (draft?.tool === 'rect') {
      const a = screenOf(draft.corner);
      const b = screenOf(cursor);
      preview = (
        <rect
          className="preview"
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)}
          height={Math.abs(b.y - a.y)}
        />
      );
    }
  }

  const cursorClass = dragging
    ? 'is-dragging'
    : tool !== 'select'
      ? 'is-drawing'
      : hover
        ? 'is-over'
        : '';

  const zoomBy = (factor: number) =>
    props.onView(zoomAbout(view, size, { x: size.width / 2, y: size.height / 2 }, factor));

  return (
    <div className="sheet" ref={wrapperRef}>
      <svg
        ref={svgRef}
        className={`sheet-svg ${cursorClass}`}
        width={size.width}
        height={size.height}
        role="application"
        aria-label="Sketch. Use the drawing tools to add shapes, then select them to add constraints."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          setCursor(null);
          setHover(null);
        }}
      >
        <path className="grid-minor" d={grid.minor} />
        <path className="grid-major" d={grid.major} />
        {halos}
        {dimensions}
        {shapes}
        {dots}
        {badges}
        {preview}
        {snapRing}
      </svg>
      <div className="zoom-controls">
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in" title="Zoom in">
          <Icon name="plus" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.4)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          onClick={props.onFit}
          aria-label="Fit sketch to view"
          title="Fit to view (F)"
        >
          <Icon name="fit" />
        </button>
      </div>
      {props.children}
    </div>
  );
}

/** The hint shown for the current tool, in the interface's own words. */
export function toolHint(tool: Tool, isEmpty: boolean, hasSelection: boolean): string {
  switch (tool) {
    case 'select':
      if (isEmpty) return 'Pick a drawing tool to start, or open an example.';
      if (hasSelection) return 'Click more to add to the selection. Click empty space to clear it.';
      return 'Click a shape to select it. Drag anything blue to move it.';
    case 'point':
      return 'Click to place a point.';
    case 'line':
      return 'Click to place each end. Click the last point again, or press Esc, to finish.';
    case 'circle':
      return 'Click the centre, then click to set the size.';
    case 'rect':
      return 'Click one corner, then the opposite corner.';
  }
}

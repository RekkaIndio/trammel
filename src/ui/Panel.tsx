import { useEffect, useRef, useState } from 'react';
import {
  describe,
  displayName,
  hasValue,
  optionsFor,
  tidy,
  type Analysis,
  type Constraint,
  type ConstraintOption,
  type Id,
  type Sketch,
} from '../core';
import { Icon, type IconName } from './icons';

interface PanelProps {
  sketch: Sketch;
  analysis: Analysis;
  selection: readonly Id[];
  /** Shown at the top while an example is open. */
  intro: { readonly name: string; readonly blurb: string } | null;
  /** The constraint whose number box should take the keyboard, if any. */
  focusConstraint: Id | null;
  onFocusHandled: () => void;
  highlightConstraint: Id | null;
  onHighlight: (id: Id | null) => void;
  onAdd: (option: ConstraintOption) => void;
  onRemove: (id: Id) => void;
  onValue: (id: Id, value: number) => void;
}

const GUIDE: readonly (readonly [string, string])[] = [
  ['A point', 'fix it in place'],
  ['Two points', 'distance, level, upright'],
  ['A line', 'length, level, upright'],
  ['Two lines', 'parallel, square, equal'],
  ['Point and line', 'keep the point on it'],
  ['Point and circle', 'keep the point on it'],
  ['Line and circle', 'make them touch'],
  ['A circle', 'radius'],
  ['Two circles', 'equal, same centre'],
];

function ValueBox(props: {
  constraint: Extract<Constraint, { readonly value: number }>;
  label: string;
  wantsFocus: boolean;
  onFocusHandled: () => void;
  onValue: (value: number) => void;
}) {
  const { constraint, wantsFocus, onFocusHandled } = props;
  const shown = String(tidy(constraint.value, 4));
  const [text, setText] = useState(shown);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setText(shown), [shown]);

  useEffect(() => {
    if (!wantsFocus) return;
    input.current?.focus();
    input.current?.select();
    onFocusHandled();
  }, [wantsFocus, onFocusHandled]);

  const commit = () => {
    const value = Number(text.replace(',', '.'));
    if (Number.isFinite(value) && value > 0) {
      if (value !== constraint.value) props.onValue(value);
      else setText(shown);
    } else {
      setText(shown); // not a usable size: put the old one back
    }
  };

  return (
    <input
      ref={input}
      className="value-box"
      inputMode="decimal"
      aria-label={props.label}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setText(shown);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function Panel(props: PanelProps) {
  const { sketch, analysis, selection, focusConstraint, onFocusHandled } = props;
  const options = optionsFor(sketch, selection);
  const list = useRef<HTMLUListElement>(null);

  // When a constraint is picked on the sheet, bring its row into view. Rows
  // with a number box hand the keyboard to it (see ValueBox).
  useEffect(() => {
    if (!focusConstraint) return;
    const constraint = sketch.constraints.find((c) => c.id === focusConstraint);
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-constraint]') ?? [];
    for (const row of rows) {
      if (row.dataset.constraint === focusConstraint) row.scrollIntoView({ block: 'nearest' });
    }
    if (!constraint || !hasValue(constraint)) onFocusHandled();
  }, [focusConstraint, onFocusHandled, sketch]);

  return (
    <aside className="panel" aria-label="Constraints">
      {props.intro && (
        <section className="panel-intro">
          <h2>{props.intro.name}</h2>
          <p>{props.intro.blurb}</p>
        </section>
      )}

      <section>
        <h2>Add a constraint</h2>
        {selection.length === 0 ? (
          <>
            <p className="quiet">Select something on the sheet to see what you can add.</p>
            <dl className="guide">
              {GUIDE.map(([what, result]) => (
                <div key={what}>
                  <dt>{what}</dt>
                  <dd>{result}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <p className="selection-summary">
              Selected: <b>{selection.map(displayName).join(', ')}</b>
            </p>
            {options.length > 0 ? (
              <ul className="option-list">
                {options.map((option) => (
                  <li key={option.key}>
                    <button
                      type="button"
                      data-option={option.key}
                      onClick={() => props.onAdd(option)}
                    >
                      <Icon name={option.key} />
                      <span>
                        <b>{option.label}</b>
                        <small>{option.help}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">
                Nothing new fits this selection. Constraints apply to one or two things at a time,
                and each can only be added once.
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <h2>
          Constraints <span className="count">{sketch.constraints.length}</span>
        </h2>
        {sketch.constraints.length === 0 ? (
          <p className="quiet">
            None yet. Without constraints a sketch is only a drawing: everything can move.
          </p>
        ) : (
          <ul className="constraint-list" ref={list}>
            {sketch.constraints.map((c) => {
              const { title, targets } = describe(sketch, c);
              const conflict = analysis.conflicting.has(c.id);
              const redundant = !conflict && analysis.redundant.has(c.id);
              const icon: IconName = title === 'Concentric' ? 'concentric' : c.kind;
              return (
                <li
                  key={c.id}
                  data-constraint={c.id}
                  className={
                    'constraint-row' +
                    (conflict ? ' is-conflict' : '') +
                    (redundant ? ' is-redundant' : '') +
                    (props.highlightConstraint === c.id ? ' is-emphasised' : '')
                  }
                  onPointerEnter={() => props.onHighlight(c.id)}
                  onPointerLeave={() => props.onHighlight(null)}
                  onFocus={() => props.onHighlight(c.id)}
                  onBlur={() => props.onHighlight(null)}
                >
                  <Icon name={icon} />
                  <span className="constraint-text">
                    <b>{title}</b> <span>{targets}</span>
                    {conflict && <em>Conflicts with others in red</em>}
                    {redundant && <em>Already implied by the others</em>}
                  </span>
                  {hasValue(c) && (
                    <ValueBox
                      constraint={c}
                      label={`${title} of ${targets}`}
                      wantsFocus={props.focusConstraint === c.id}
                      onFocusHandled={props.onFocusHandled}
                      onValue={(value) => props.onValue(c.id, value)}
                    />
                  )}
                  <button
                    type="button"
                    className="remove"
                    aria-label={`Remove ${title} on ${targets}`}
                    title="Remove"
                    onClick={() => props.onRemove(c.id)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

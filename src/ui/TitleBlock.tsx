/**
 * The title block: the ruled box in the corner of every engineering drawing
 * that says what the drawing is and what state it is in. Here it carries the
 * sketch's name and the answer to the question that matters most while
 * constraining: how much freedom is left?
 */

import type { Analysis, Sketch } from '../core';

interface TitleBlockProps {
  name: string;
  onName: (name: string) => void;
  sketch: Sketch;
  analysis: Analysis;
  gridStep: number;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export function statusText(analysis: Analysis): { headline: string; detail: string } {
  const repeats =
    analysis.redundant.size > 0 && analysis.state !== 'over'
      ? ` ${plural(analysis.redundant.size, 'constraint repeats', 'constraints repeat')} what others already say.`
      : '';
  switch (analysis.state) {
    case 'empty':
      return { headline: 'Blank sheet', detail: 'Nothing drawn yet.' };
    case 'under':
      return {
        headline: plural(analysis.freedom, 'degree of freedom', 'degrees of freedom'),
        detail: `Blue parts can still move. Add constraints until nothing is blue.${repeats}`,
      };
    case 'full':
      return {
        headline: 'Fully constrained',
        detail: `Every size and position is decided.${repeats}`,
      };
    case 'over':
      return {
        headline: 'Over-constrained',
        detail: `${plural(analysis.conflicting.size, 'constraint')} cannot all be true. Change or remove one of those marked in red.`,
      };
  }
}

export function TitleBlock({ name, onName, sketch, analysis, gridStep }: TitleBlockProps) {
  const { headline, detail } = statusText(analysis);
  const count = (kind: 'point' | 'line' | 'circle') =>
    sketch.entities.filter((e) => e.kind === kind).length;
  const shapes = count('line') + count('circle');

  return (
    <section className={`title-block state-${analysis.state}`} aria-label="Sketch status">
      <div className="title-block-name">
        <label className="visually-hidden" htmlFor="sketch-name">
          Sketch name
        </label>
        <input
          id="sketch-name"
          value={name}
          maxLength={80}
          spellCheck={false}
          onChange={(event) => onName(event.target.value)}
        />
      </div>
      <div className="title-block-status" role="status" aria-live="polite">
        <strong>{headline}</strong>
        <span>{detail}</span>
      </div>
      <dl className="title-block-facts">
        <div>
          <dt>Shapes</dt>
          <dd>{shapes}</dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>{count('point')}</dd>
        </div>
        <div>
          <dt>Constraints</dt>
          <dd>{sketch.constraints.length}</dd>
        </div>
        <div>
          <dt>Grid</dt>
          <dd>{Number(gridStep.toPrecision(3))}</dd>
        </div>
      </dl>
    </section>
  );
}

import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, canRedo, canUndo, commit, createHistory, redo, undo } from '../src/core';

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistory('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('steps back and forward through committed states', () => {
    let h = createHistory('a');
    h = commit(h, 'b');
    h = commit(h, 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
  });

  it('forgets the redo branch once something new is committed', () => {
    let h = createHistory('a');
    h = commit(h, 'b');
    h = undo(h);
    h = commit(h, 'c');
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('a');
  });

  it('ignores a commit of the state it is already on', () => {
    const state = { n: 1 };
    const h = createHistory(state);
    expect(commit(h, state)).toBe(h);
  });

  it('keeps a bounded number of steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(50);
  });
});

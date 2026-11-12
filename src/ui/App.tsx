import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  addConstraint,
  analyse,
  bounds,
  canRedo,
  canUndo,
  commit as commitHistory,
  createHistory,
  emptySketch,
  parse,
  redo,
  removeConstraint,
  removeEntities,
  serialise,
  setConstraintValue,
  settle,
  toSvg,
  undo,
  type ConstraintOption,
  type History,
  type Id,
  type Sketch,
} from '../core';
import { EXAMPLES } from '../examples';
import { Canvas, toolHint, type Tool } from './Canvas';
import { download, fileStem } from './files';
import { Panel } from './Panel';
import { TitleBlock } from './TitleBlock';
import { Toolbar } from './Toolbar';
import { DEFAULT_VIEW, fitView, gridStep, type Padding, type Size, type View } from './view';

const UNTITLED = 'Untitled sketch';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Store {
  readonly history: History<Sketch>;
  /** Geometry being tried out mid-drag. Shown instead of the present, but not yet in history. */
  readonly preview: Sketch | null;
}

type Action =
  | { readonly type: 'commit'; readonly sketch: Sketch }
  | { readonly type: 'preview'; readonly sketch: Sketch | null }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'open'; readonly sketch: Sketch };

function reducer(store: Store, action: Action): Store {
  switch (action.type) {
    case 'commit':
      return { history: commitHistory(store.history, action.sketch), preview: null };
    case 'preview':
      return { ...store, preview: action.sketch };
    case 'undo':
      return { history: undo(store.history), preview: null };
    case 'redo':
      return { history: redo(store.history), preview: null };
    case 'open':
      return { history: createHistory(action.sketch), preview: null };
  }
}

/** Room to leave around a fitted sketch so the hint and title block do not cover it. */
function fitPadding(size: Size): Padding {
  return size.width < 640
    ? { top: 78, right: 48, bottom: 120, left: 48 }
    : { top: 76, right: 84, bottom: 216, left: 84 };
}

const STARTER = EXAMPLES[0];

export function App() {
  const [store, dispatch] = useReducer(reducer, undefined, () => ({
    history: createHistory(STARTER ? settle(STARTER.build()) : emptySketch),
    preview: null,
  }));
  const [name, setName] = useState(STARTER?.name ?? UNTITLED);
  const [exampleId, setExampleId] = useState<string | null>(STARTER?.id ?? null);
  const [tool, setTool] = useState<Tool>('select');
  const [rawSelection, setSelection] = useState<Id[]>([]);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [fitPending, setFitPending] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Id | null>(null);
  const [focusConstraint, setFocusConstraint] = useState<Id | null>(null);
  /** Counts sketches opened, so the panel starts afresh (scrolled to the top) for each one. */
  const [opened, setOpened] = useState(0);

  const present = store.history.present;
  const shown = store.preview ?? present;
  const analysis = useMemo(() => analyse(shown), [shown]);
  const selection = useMemo(() => {
    const alive = new Set(shown.entities.map((e) => e.id));
    return rawSelection.filter((id) => alive.has(id));
  }, [rawSelection, shown]);

  // Fit once the sheet has been measured, and again whenever a sketch is opened.
  useEffect(() => {
    if (!fitPending || size.width === 0) return;
    setView(fitView(bounds(present), size, fitPadding(size)));
    setFitPending(false);
  }, [fitPending, size, present]);

  const commit = useCallback((sketch: Sketch) => dispatch({ type: 'commit', sketch }), []);
  const preview = useCallback((sketch: Sketch | null) => dispatch({ type: 'preview', sketch }), []);
  const clearFocus = useCallback(() => setFocusConstraint(null), []);

  /** Run an edit, turning any refusal into a message instead of a crash. */
  const attempt = (edit: () => void) => {
    try {
      edit();
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const open = useCallback((sketch: Sketch, title: string, example: string | null) => {
    dispatch({ type: 'open', sketch: settle(sketch) });
    setName(title);
    setExampleId(example);
    setSelection([]);
    setTool('select');
    setNotice(null);
    setHighlight(null);
    setFocusConstraint(null);
    setOpened((count) => count + 1);
    setFitPending(true);
  }, []);

  const addOption = (option: ConstraintOption) =>
    attempt(() => {
      const added = addConstraint(present, option.constraint);
      commit(settle(added.sketch));
      if ('value' in option.constraint) setFocusConstraint(added.id);
    });

  const deleteSelection = useCallback(() => {
    if (selection.length === 0) return;
    commit(settle(removeEntities(present, selection)));
    setSelection([]);
  }, [commit, present, selection]);

  const save = useCallback(() => {
    download(`${fileStem(name)}.trammel.json`, serialise(present, name), 'application/json');
  }, [name, present]);

  const openFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setNotice('That file is too large to be a sketch (over 5 MB).');
      return;
    }
    file
      .text()
      .then((text) => {
        const loaded = parse(text);
        open(loaded.sketch, loaded.name ?? file.name.replace(/(\.trammel)?\.json$/i, ''), null);
      })
      .catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : 'That file could not be read.');
      });
  };

  // Keyboard shortcuts. Listeners read the latest handlers through a ref.
  const keys = useRef({ deleteSelection, save });
  keys.current = { deleteSelection, save };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (command && key === 's') {
        event.preventDefault();
        keys.current.save();
        return;
      }
      if (typing) return;
      if (command && key === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (command && key === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
      } else if (!command && !event.altKey) {
        const tools: Record<string, Tool> = {
          v: 'select',
          p: 'point',
          l: 'line',
          c: 'circle',
          r: 'rect',
        };
        const picked = tools[key];
        if (picked) setTool(picked);
        else if (key === 'f') setFitPending(true);
        else if (key === 'delete' || key === 'backspace') {
          event.preventDefault();
          keys.current.deleteSelection();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const example = EXAMPLES.find((e) => e.id === exampleId) ?? null;

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        onTool={setTool}
        canUndo={canUndo(store.history)}
        canRedo={canRedo(store.history)}
        canDelete={selection.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onDelete={deleteSelection}
        onNew={() => open(emptySketch, UNTITLED, null)}
        onExample={(id) => {
          const picked = EXAMPLES.find((e) => e.id === id);
          if (picked) open(picked.build(), picked.name, picked.id);
        }}
        onOpen={openFile}
        onSave={save}
        onExport={() => download(`${fileStem(name)}.svg`, toSvg(present), 'image/svg+xml')}
      />
      <main className="workspace">
        <Canvas
          sketch={shown}
          analysis={analysis}
          tool={tool}
          selection={selection}
          highlightConstraint={highlight}
          view={view}
          size={size}
          onSize={setSize}
          onView={setView}
          onFit={() => setFitPending(true)}
          onTool={setTool}
          onSelection={setSelection}
          onPreview={preview}
          onCommit={commit}
          onPickConstraint={(id) => {
            setHighlight(id);
            setFocusConstraint(id);
          }}
        >
          <div className="sheet-notes">
            <p className="hint">
              {toolHint(tool, shown.entities.length === 0, selection.length > 0)}
            </p>
            {notice && (
              <p className="notice" role="alert">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)}>
                  Dismiss
                </button>
              </p>
            )}
          </div>
          <TitleBlock
            name={name}
            onName={setName}
            sketch={shown}
            analysis={analysis}
            gridStep={gridStep(view.zoom)}
          />
        </Canvas>
        <Panel
          key={opened}
          sketch={shown}
          analysis={analysis}
          selection={selection}
          intro={example ? { name: example.name, blurb: example.blurb } : null}
          focusConstraint={focusConstraint}
          onFocusHandled={clearFocus}
          highlightConstraint={highlight}
          onHighlight={setHighlight}
          onAdd={addOption}
          onRemove={(id) => commit(settle(removeConstraint(present, id)))}
          onValue={(id, value) =>
            attempt(() => commit(settle(setConstraintValue(present, id, value))))
          }
        />
      </main>
    </div>
  );
}

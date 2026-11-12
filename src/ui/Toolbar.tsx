import { useRef } from 'react';
import { EXAMPLES } from '../examples';
import type { Tool } from './Canvas';
import { Icon, type IconName } from './icons';

interface ToolbarProps {
  tool: Tool;
  onTool: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onNew: () => void;
  onExample: (id: string) => void;
  onOpen: (file: File) => void;
  onSave: () => void;
  onExport: () => void;
}

const TOOLS: readonly { tool: Tool; label: string; key: string; icon: IconName }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: 'select' },
  { tool: 'point', label: 'Point', key: 'P', icon: 'point' },
  { tool: 'line', label: 'Line', key: 'L', icon: 'line' },
  { tool: 'circle', label: 'Circle', key: 'C', icon: 'circle' },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: 'rect' },
];

export function Toolbar(props: ToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <h1 className="brand">Trammel</h1>

      <div className="tool-group" role="radiogroup" aria-label="Tool">
        {TOOLS.map(({ tool, label, key, icon }) => (
          <button
            key={tool}
            type="button"
            role="radio"
            aria-checked={props.tool === tool}
            className={`tool${props.tool === tool ? ' is-active' : ''}`}
            title={`${label} (${key})`}
            onClick={() => props.onTool(tool)}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="tool-group">
        <button
          type="button"
          onClick={props.onUndo}
          disabled={!props.canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Icon name="undo" />
          <span className="visually-hidden">Undo</span>
        </button>
        <button
          type="button"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Icon name="redo" />
          <span className="visually-hidden">Redo</span>
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          disabled={!props.canDelete}
          title="Delete selection (Delete)"
        >
          <Icon name="delete" />
          <span className="visually-hidden">Delete selection</span>
        </button>
      </div>

      <div className="tool-group file-group">
        <label className="visually-hidden" htmlFor="example-picker">
          Open an example
        </label>
        <select
          id="example-picker"
          value=""
          onChange={(event) => {
            if (event.target.value) props.onExample(event.target.value);
          }}
        >
          <option value="">Examples</option>
          {EXAMPLES.map((example) => (
            <option key={example.id} value={example.id}>
              {example.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={props.onNew}>
          New
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Open
        </button>
        <button type="button" onClick={props.onSave}>
          Save
        </button>
        <button type="button" onClick={props.onExport}>
          Export SVG
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onOpen(file);
            event.target.value = ''; // let the same file be chosen again
          }}
        />
      </div>
    </header>
  );
}

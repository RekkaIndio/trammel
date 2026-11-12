/**
 * Every icon in the interface, drawn on a 16 by 16 grid with a single stroke
 * weight, in the manner of symbols on a drawing. The same glyphs are used on
 * buttons, in the constraint list and as badges on the sheet, so a symbol
 * means the same thing wherever it appears.
 */

import type { ReactNode } from 'react';
import type { OptionKey } from '../core';

export type IconName =
  | OptionKey
  | 'select'
  | 'point'
  | 'line'
  | 'circle'
  | 'rect'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'fit'
  | 'plus'
  | 'minus'
  | 'close';

const dot = (cx: number, cy: number, r = 1.4) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

const GLYPHS: Record<IconName, ReactNode> = {
  // Tools
  select: <path d="M3.5 2.5l8.5 4.6-3.7 1.1-1.3 3.7z" />,
  point: (
    <>
      {dot(8, 8, 1.8)}
      <path d="M8 2v2.6M8 11.4V14M2 8h2.6M11.4 8H14" />
    </>
  ),
  line: (
    <>
      <path d="M3.5 12.5l9-9" />
      {dot(3.5, 12.5)}
      {dot(12.5, 3.5)}
    </>
  ),
  circle: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      {dot(8, 8, 1.1)}
    </>
  ),
  rect: <rect x="2.5" y="4" width="11" height="8" />,
  undo: <path d="M5.5 3.5l-3 3 3 3M2.5 6.5H9a3.5 3.5 0 010 7H6.5" />,
  redo: <path d="M10.5 3.5l3 3-3 3M13.5 6.5H7a3.5 3.5 0 000 7h2.5" />,
  delete: <path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.6 9h5.8l.6-9" />,
  fit: <path d="M2.5 6v-3.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,

  // Constraints
  coincident: (
    <>
      <circle cx="8" cy="8" r="4.5" />
      {dot(8, 8, 1.6)}
    </>
  ),
  concentric: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.5" />
    </>
  ),
  horizontal: <path d="M2.5 8h11M2.5 5.5v5M13.5 5.5v5" />,
  vertical: <path d="M8 2.5v11M5.5 2.5h5M5.5 13.5h5" />,
  fixed: (
    <>
      <path d="M8 6.2L4.5 11.5h7zM3 13.5h10" />
      {dot(8, 4.2, 1.7)}
    </>
  ),
  distance: <path d="M2.5 8h11M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5M2.5 3v10M13.5 3v10" />,
  parallel: <path d="M3.5 13l4-10M8.5 13l4-10" />,
  perpendicular: <path d="M8 3v10M3 13h10" />,
  equalLength: <path d="M3.5 6h9M3.5 10h9" />,
  pointOnLine: (
    <>
      <path d="M2.5 12.5l11-9" />
      {dot(8, 8, 1.9)}
    </>
  ),
  pointOnCircle: (
    <>
      <circle cx="7.5" cy="8.5" r="5" />
      {dot(11, 5, 1.9)}
    </>
  ),
  radius: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 8l3.9-3.9" />
      {dot(8, 8, 1.1)}
    </>
  ),
  tangent: (
    <>
      <circle cx="8" cy="9.5" r="4" />
      <path d="M2 5.5h12" />
    </>
  ),
  equalRadius: (
    <>
      <circle cx="4.5" cy="8" r="2.6" />
      <circle cx="11.5" cy="8" r="2.6" />
    </>
  ),
};

/** The raw drawing for an icon, for placing inside an existing SVG (the sheet's badges). */
export function glyph(name: IconName): ReactNode {
  return GLYPHS[name];
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}

/**
 * The view: how sketch coordinates map to pixels.
 *
 * Sketch space has y pointing up, like graph paper. Screen space has y
 * pointing down. `zoom` is pixels per sketch unit, and (cx, cy) is the
 * sketch position shown at the centre of the sheet.
 */

import type { Bounds, Vec } from '../core';

export interface View {
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 400;
export const DEFAULT_VIEW: View = { cx: 0, cy: 0, zoom: 4 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function toScreen(view: View, size: Size, p: Vec): Vec {
  return {
    x: size.width / 2 + (p.x - view.cx) * view.zoom,
    y: size.height / 2 - (p.y - view.cy) * view.zoom,
  };
}

export function toWorld(view: View, size: Size, s: Vec): Vec {
  return {
    x: view.cx + (s.x - size.width / 2) / view.zoom,
    y: view.cy - (s.y - size.height / 2) / view.zoom,
  };
}

/** Zoom by a factor, keeping whatever is under the given screen position where it is. */
export function zoomAbout(view: View, size: Size, s: Vec, factor: number): View {
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const anchor = toWorld(view, size, s);
  return {
    zoom,
    cx: anchor.x - (s.x - size.width / 2) / zoom,
    cy: anchor.y + (s.y - size.height / 2) / zoom,
  };
}

/** Slide the view by a number of screen pixels. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, cx: view.cx - dx / view.zoom, cy: view.cy + dy / view.zoom };
}

/** The view that shows a whole bounding box, centred in the space left after padding. */
export function fitView(box: Bounds | null, size: Size, padding: Padding): View {
  if (!box || size.width <= 0 || size.height <= 0) return DEFAULT_VIEW;
  const availableWidth = Math.max(size.width - padding.left - padding.right, 60);
  const availableHeight = Math.max(size.height - padding.top - padding.bottom, 60);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  // A single point has no extent to fit, so fall back to a comfortable zoom.
  const zoom =
    width < 1e-9 && height < 1e-9
      ? DEFAULT_VIEW.zoom
      : clamp(
          Math.min(
            availableWidth / Math.max(width, 1e-9),
            availableHeight / Math.max(height, 1e-9),
          ),
          MIN_ZOOM,
          40,
        );
  const centreX = padding.left + availableWidth / 2;
  const centreY = padding.top + availableHeight / 2;
  return {
    zoom,
    cx: (box.minX + box.maxX) / 2 - (centreX - size.width / 2) / zoom,
    cy: (box.minY + box.maxY) / 2 + (centreY - size.height / 2) / zoom,
  };
}

/** A grid spacing from the 1-2-5 series that is at least `minPixels` apart on screen. */
export function gridStep(zoom: number, minPixels = 14): number {
  const raw = minPixels / zoom;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const multiple of [1, 2, 5]) {
    if (multiple * power >= raw - 1e-12) return multiple * power;
  }
  return 10 * power;
}

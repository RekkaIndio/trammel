import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  MAX_ZOOM,
  fitView,
  gridStep,
  panBy,
  toScreen,
  toWorld,
  zoomAbout,
} from '../src/ui/view';

const size = { width: 800, height: 600 };
const noPadding = { top: 0, right: 0, bottom: 0, left: 0 };

describe('view', () => {
  it('puts the view centre in the middle of the sheet, with y pointing up', () => {
    const view = { cx: 10, cy: 20, zoom: 2 };
    expect(toScreen(view, size, { x: 10, y: 20 })).toEqual({ x: 400, y: 300 });
    expect(toScreen(view, size, { x: 15, y: 30 })).toEqual({ x: 410, y: 280 });
  });

  it('converts to the screen and back without loss', () => {
    const view = { cx: -3.5, cy: 8.25, zoom: 3.7 };
    const p = { x: 12.5, y: -40.125 };
    const back = toWorld(view, size, toScreen(view, size, p));
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
  });

  it('zooms about the cursor, leaving what is under it in place', () => {
    const view = { cx: 0, cy: 0, zoom: 2 };
    const cursor = { x: 650, y: 120 };
    const under = toWorld(view, size, cursor);
    const zoomed = zoomAbout(view, size, cursor, 1.8);
    expect(zoomed.zoom).toBeCloseTo(3.6, 10);
    const after = toScreen(zoomed, size, under);
    expect(after.x).toBeCloseTo(cursor.x, 8);
    expect(after.y).toBeCloseTo(cursor.y, 8);
  });

  it('will not zoom past its limits', () => {
    expect(zoomAbout({ cx: 0, cy: 0, zoom: 300 }, size, { x: 0, y: 0 }, 50).zoom).toBe(MAX_ZOOM);
  });

  it('pans by screen pixels', () => {
    const moved = panBy({ cx: 0, cy: 0, zoom: 4 }, 40, 20);
    // Dragging the sheet right and down shows what was to the left and above.
    expect(moved).toEqual({ cx: -10, cy: 5, zoom: 4 });
  });

  it('fits a box inside the padded area and centres it there', () => {
    const padding = { top: 50, right: 250, bottom: 150, left: 50 };
    const view = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, size, padding);
    // 500 by 400 available. Width is the tighter fit: 500 / 100 = 5.
    expect(view.zoom).toBe(5);
    const centre = toScreen(view, size, { x: 50, y: 25 });
    expect(centre.x).toBeCloseTo(300, 8);
    expect(centre.y).toBeCloseTo(250, 8);
  });

  it('falls back to the default view for nothing, and a default zoom for a single point', () => {
    expect(fitView(null, size, noPadding)).toEqual(DEFAULT_VIEW);
    const view = fitView({ minX: 7, minY: 7, maxX: 7, maxY: 7 }, size, noPadding);
    expect(view).toEqual({ cx: 7, cy: 7, zoom: DEFAULT_VIEW.zoom });
  });

  it('chooses grid spacings from the 1-2-5 series', () => {
    expect(gridStep(14)).toBe(1); // 14 px per unit: one unit is just far enough apart
    expect(gridStep(4)).toBe(5);
    expect(gridStep(1)).toBe(20);
    expect(gridStep(0.1)).toBe(200);
    expect(gridStep(100)).toBeCloseTo(0.2, 12);
  });
});

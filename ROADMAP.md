# Roadmap

This is the planned work for Trammel after the first version, in the order it will be done. Every task has an estimate in hours and is sized to become one GitHub issue. The total is **61 hours**.

Estimates include writing tests and updating the docs for each task.

| Stage | Theme               | Hours  |
| ----- | ------------------- | ------ |
| 1     | More geometry       | 10     |
| 2     | More constraints    | 11     |
| 3     | Sketching feel      | 9      |
| 4     | Solver depth        | 11     |
| 5     | Files and export    | 7      |
| 6     | Touch and access    | 7      |
| 7     | Quality and release | 6      |
|       | **Total**           | **61** |

## Where version 0.1 stands

Done and tested: points, lines, circles and rectangles; 13 constraint kinds; the solver; dragging; the degrees-of-freedom count with free, redundant and conflicting parts identified; undo and redo; JSON save and load with validation; SVG export; five examples; light and dark themes; a phone-width layout.

The known limits are listed in the [README](README.md#known-limits). Each one is addressed by a task below.

## Stage 1: More geometry (10 hours)

Lines and circles are enough to prove the solver. Real parts need arcs.

- [ ] **Arcs (4h).** A new entity with a centre, a start point and an end point. Two internal equations keep both ends the same distance from the centre. Drawing tool: centre, start, end. Rendering, hit testing, bounds and SVG export for arcs. Tangent, point-on and radius constraints extended to accept an arc wherever they accept a circle.
- [ ] **Construction geometry (2h).** A per-entity flag for reference lines and circles that guide the sketch but are not part of the result. Drawn dashed, toggled from the panel, left out of SVG export.
- [ ] **Origin and axes (1.5h).** New sketches start with a fixed origin point and two construction axes, so there is always something to dimension from. Older files open unchanged.
- [ ] **Fillet tool (2.5h).** Click a corner where two lines meet to replace it with an arc tangent to both, with a radius dimension. Depends on arcs.

## Stage 2: More constraints (11 hours)

- [ ] **Angle dimension (3h).** A set angle between two lines. The equation already exists in general form (parallel and perpendicular are the 0 and 90 degree cases). Needs the value-carrying variant, an arc-shaped dimension drawn on the sheet, and entry in degrees.
- [ ] **Midpoint (1.5h).** Hold a point at the middle of a line. Two linear equations.
- [ ] **Symmetric (2h).** Hold two points as mirror images across a line. Offered for two points and a line.
- [ ] **Horizontal and vertical distance (1.5h).** Dimensions that measure along one axis only, which is how most drawings position holes.
- [ ] **Tangent at an end (3h).** A single constraint for "this line or arc leaves the circle tangentially at this point". This replaces the tangent plus point-on-circle pair, which is a double root and converges slowly (see Known limits). Includes circle-to-circle and arc-to-line tangency, and a migration that spots the slow pair in old files and offers the replacement.

## Stage 3: Sketching feel (9 hours)

- [ ] **Snapping and inferred constraints (4h).** While drawing, snap to existing points, to the grid, and to level and upright directions, showing a marker for each. When a snap is used, add the matching constraint (coincident, point on line, horizontal, vertical) automatically. A toolbar switch turns inference off.
- [ ] **Movable dimensions (2.5h).** Drag a dimension label to place it. Positions are stored in the file as an offset from the measured geometry, so they survive solving.
- [ ] **Selection tools (1.5h).** Drag a box to select everything inside it. Shift-click to add, plain click to replace, with the current toggle behaviour kept on touch. Select all. Clicking a badge selects its constraint.
- [ ] **Badge layout (1h).** Place constraint badges so they avoid dimension text and each other.

## Stage 4: Solver depth (11 hours)

- [ ] **Independent groups (4h).** Split the sketch into groups of entities that share no constraints, and solve only the groups a change touches. This makes large sketches of small parts fast, and stops a conflict in one corner from freezing the rest. The analysis reports state per group.
- [ ] **Sparse solving (3h).** Within a group, replace the dense Cholesky factorisation with a sparse one (or conjugate gradients on the normal equations). Target: a drag step under 16 ms at 500 parameters, measured by the benchmark from Stage 7.
- [ ] **Sturdier rank decisions (2h).** The freedom count currently uses Gram-Schmidt with a fixed tolerance, evaluated at the solved geometry. Replace it with a pivoted QR factorisation, and add tests on near-singular arrangements such as three points almost in a line.
- [ ] **Smallest conflicting sets (2h).** When several separate conflicts exist, report each as its own smallest group of constraints rather than one combined list, using a deletion filter over the solver.

## Stage 5: Files and export (7 hours)

- [ ] **DXF export (3h).** Write lines, circles and arcs as an ASCII DXF that laser cutter and CAM software can read. Tested by parsing the output back.
- [ ] **Drawing export (2h).** An SVG that includes the dimensions and the title block, laid out for printing on A4.
- [ ] **Autosave (1h).** Keep the current sketch in the browser's local storage and restore it on reload, with a clear way to discard it. Nothing leaves the device.
- [ ] **Units and format version 2 (1h).** A millimetres or inches setting stored in the file. Version 1 files migrate on load, with tests for the migration.

## Stage 6: Touch and access (7 hours)

- [ ] **Touch gestures (2.5h).** Pinch to zoom and two-finger pan. A long press starts a drag so that a short touch can scroll the page.
- [ ] **Keyboard sketching (2.5h).** An entity list in the panel so shapes can be selected without a pointer, arrow keys to nudge a selected point through the solver, and typed coordinates for placing points.
- [ ] **Screen reader pass (1h).** Announce the result of each edit ("Parallel added. 3 degrees of freedom."), and check every control's name with a screen reader.
- [ ] **Theme switch (1h).** A manual light or dark setting that overrides the system preference.

## Stage 7: Quality and release (6 hours)

- [ ] **Browser tests in CI (3h).** Automate the flows that were checked by hand for version 0.1: dragging a linkage, adding and removing constraints, each drawing tool, save and reopen, and the phone layout. Run them headless in the CI workflow.
- [ ] **Benchmarks (1h).** A script that times solving and dragging at several sketch sizes and prints a table, so solver changes can be compared.
- [ ] **Guides (2h).** A user guide that walks through constraining a bracket from scratch, and an illustrated explanation of the solver for people reading the code.

## Not planned

To keep the scope honest, these are deliberately out:

- **3D.** Trammel is a sketcher, not a modeller.
- **Accounts, sharing links or cloud storage.** Files are yours and stay on your machine.
- **Automatic constraint guessing by machine learning.** Inference in Stage 3 is plain geometry: snap distances and angles.

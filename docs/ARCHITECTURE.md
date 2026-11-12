# Architecture

This document explains how Trammel is put together and why. It is meant to be read alongside the code in `src/core/`, which is about 1,800 lines including comments.

## The shape of the program

```
            edits                    numbers                  answers
  UI  ───────────────▶  Sketch  ───────────────▶  Solver  ───────────────▶  Sketch
(React)   sketch.ts   (plain data)   params.ts    solver.ts    params.ts   (new geometry)
                           │         equations.ts
                           │
                           └──────────────▶  Analysis  ──▶  freedom, free parts,
                                             analysis.ts     redundant, conflicting
```

There are two halves with a hard wall between them.

- **`src/core/`** is the engine. It is plain TypeScript with no dependencies and no knowledge of the browser. Everything in it is a function from data to data.
- **`src/ui/`** is the interface. It holds the current sketch, turns pointer input into calls on the core, and draws the result as SVG.

The wall matters for testing. The whole engine runs under Node in a few hundred milliseconds, so the tests can afford to check thousands of random cases.

## The data model

A sketch is two lists.

- **Entities** are what you draw. A point has an x and a y. A line names two points. A circle names a centre point and has a radius.
- **Constraints** are the rules. Each has a kind and the ids of the entities it applies to, and some carry a number.

Lines own no numbers of their own. Two lines that meet at a corner share one point entity, so they stay joined without needing a constraint to hold them together.

Sketches are immutable. Every edit returns a new sketch that shares whatever did not change. Undo is therefore just a list of earlier sketches (`history.ts`), and a drag can be previewed and thrown away without ever touching the committed one.

## From sketch to equations

The solver does not see points and circles. It sees a flat list of numbers, the **parameters**: two per point and one per circle. `params.ts` builds the mapping in both directions.

`equations.ts` turns each constraint into one or two **equations**: functions of the parameters that equal zero exactly when the constraint holds. For example:

| Constraint      | Equation (zero when satisfied)                     |
| --------------- | -------------------------------------------------- |
| Horizontal      | `p.y - q.y`                                        |
| Distance `d`    | `length(p - q) - d`                                |
| Point on circle | `length(p - centre) - r`                           |
| Tangent         | `abs(signed distance from centre to line) - r`     |
| Parallel        | `angle between the lines`, folded into half a turn |
| Perpendicular   | the same angle, minus a quarter turn               |

Each equation also returns its **gradient**: how its value changes when each parameter it touches is nudged. The gradients are written out by hand rather than computed numerically or by automatic differentiation, because they are cheap, exact, and each row only touches a handful of parameters.

Two details are worth knowing.

**Angles use `atan2`, not a cross product.** The obvious equation for "parallel" is that the cross product of the two directions is zero. Its gradient vanishes when the lines start out exactly perpendicular, so the solver would sit there with no idea which way to turn. The angle itself has a gradient that never vanishes. The angle is folded into half a turn so that a line and its reverse count as the same direction.

**Every equation is in length units.** If one equation measured radians and another millimetres, a tolerance of "0.000001" would mean different things for each, and one kind would dominate the least-squares balance. Angle equations are multiplied by the length of the lines involved, measured once when the equations are compiled and then held constant so the gradient stays exact.

## The solver

`solver.ts` has to find parameters that zero every equation. Three things make this harder than textbook root-finding.

1. **There are usually fewer equations than parameters.** A half-constrained sketch has infinitely many valid shapes. The solver must pick the one a person expects, which is the one closest to what they drew.
2. **Some equations may be redundant.** A rectangle with four right angles has one more than it needs. The method must not fall over when equations repeat each other.
3. **Some sketches have no solution.** The method must fail gracefully and say something useful.

The method is **Levenberg-Marquardt**. Write `r` for the vector of equation values and `J` for the matrix of gradients (one row per equation, one column per parameter). Each iteration solves

```
(JᵀJ + λ·s·W) · step = −Jᵀr
```

and moves the parameters by `step` if doing so reduces the total squared error. `λ` is a damping factor, `s` scales it to the problem, and `W` is a diagonal matrix of per-parameter weights.

- When `λ` is small, the step is very nearly the **smallest** step that fixes the linearised equations. That is what gives "moves the least" behaviour, and it also means parameters that no constraint mentions do not move at all. A test checks this exactly.
- When a step would make things worse, `λ` is raised tenfold and the step is recomputed. Large `λ` turns the step into cautious gradient descent. This is what makes it robust far from a solution.
- Because `λ` is never zero, the matrix is positive definite even when equations repeat each other, so it can be factorised by Cholesky's method. If rounding error spoils a factorisation, the damping is raised and the step is tried again.
- If no step improves the error, the solver has reached the best compromise available and reports that it did not converge.

`JᵀJ` is assembled directly from the sparse rows, so that part costs almost nothing. The Cholesky factorisation is dense and costs about `n³/3` operations for `n` parameters. That is the bottleneck: measured on a chain of rigid links, one drag step takes about 1 ms at 42 parameters, 5 ms at 122, and 124 ms at 242. The roadmap addresses this by solving independent groups separately and by using a sparse factorisation.

### Dragging

Dragging is solving with a preference. The dragged point is first placed at the cursor, which breaks some constraints. Then the solver runs with a large weight (in `W`) on the dragged point's parameters, making them a million times more reluctant to move than anything else. The rest of the sketch does the adjusting. If the constraints make the cursor position impossible (the point is on a rod pinned at the other end, say), the weight gives way and the point lands at the nearest position that works.

Each drag step starts from the previous step's result, not from where the drag began. That keeps the sketch on the same branch of solutions: a linkage does not suddenly flip to its mirror image.

### What "settle" does

After any edit that could break a constraint, the interface calls `settle`. It runs the solver and keeps the result only if it converged. If it did not, the geometry is left exactly as it was. A sketch with a contradiction therefore still shows the last valid shape, not a compromise in which every constraint is slightly wrong.

## Counting freedom

`analysis.ts` answers the questions the title block and the colours depend on.

Each equation's gradient is a direction in parameter space that the equation stops the sketch moving in. The number of **independent** gradients is the rank of `J`, and

```
degrees of freedom = parameters − rank
```

The rank is found by feeding the gradients, one at a time and in the order the constraints were added, into a Gram-Schmidt process that keeps an orthonormal basis of the directions seen so far (`Basis` in `linalg.ts`). A gradient that adds nothing new to the basis marks its constraint as **redundant**: the earlier constraints already imply it.

The same basis says which parts can still move. A parameter is pinned down exactly when its own axis lies entirely within the span of the gradients. If any part of that axis is left uncovered, the parameter is free, and so is every point, line or circle that depends on it. Those are the parts drawn blue.

## Finding conflicts

If the geometry breaks a constraint and the solver cannot fix it, something is contradictory. Finding out what takes two passes.

1. **Compromise.** Run the solver anyway and look at where it gave up. Every constraint that is still unmet at that best compromise is involved in the tug of war somehow.
2. **Narrow.** For each involved constraint, try the sketch without it. If the rest then solves, that constraint is a culprit: removing it would fix the problem. A pin that was merely dragged out of place by the fight is not a culprit, and drops out here.

In the "Impossible triangle" example, the compromise leaves the pinned corner slightly displaced as well as the three lengths unmet. The second pass correctly clears the pin and blames only the three lengths, any one of which could be changed to fix the sketch.

## The interface

`src/ui/` is a conventional React application.

- **`App.tsx`** owns the state: the undo history, the drag preview, the tool, the selection and the view. All edits go through a reducer.
- **`Canvas.tsx`** draws the sheet and handles the pointer. It converts sketch coordinates to pixels itself (`view.ts`) rather than using an SVG transform, so that line weights, point sizes and lettering stay constant at any zoom. Picking is done with `hitTest` from the core, not with DOM events on individual shapes, which keeps the drag logic in one place.
- **`Panel.tsx`** asks the catalogue which constraints fit the selection and lists the ones that exist.
- **`TitleBlock.tsx`** shows the analysis in words.

The rule for which constraints fit which selection lives in the core (`catalogue.ts`) as data, so it can be tested without a browser.

## Testing

There are 152 tests, in four styles.

- **Derivative checks.** Every hand-written gradient is compared with a numerical derivative on hundreds of random arrangements of geometry. A single wrong sign fails this immediately.
- **Exact answers.** Cases where the right geometry can be worked out by hand: a 3-4-5 triangle, a level line resting on a circle, a rod swung towards the cursor.
- **Properties.** Statements that must hold for any input, checked with fast-check: a valid sketch knocked out of place always solves back; parts no constraint mentions never move.
- **Tables.** One row per case for things like which constraints are offered for which selection and which malformed files are refused with which message.

The interface was checked by driving the production build in headless Chromium: dragging, each drawing tool, adding and removing constraints, the examples, save and reopen, zoom and pan, and tap input at phone width. Those checks are not yet part of the repository. Bringing them into CI is on the roadmap.

## Choices and their costs

| Choice                                | Why                                                 | Cost                                         |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| Hand-written gradients                | Exact, fast, easy to read next to the equation      | Each new constraint needs care, and the test |
| Dense Cholesky                        | Fifty lines, no dependency, always works            | Slows down past about 100 points             |
| Solve the whole sketch at once        | Simple and correct                                  | One conflict freezes all dragging            |
| Rank by Gram-Schmidt with a tolerance | Short, and gives redundancy per constraint for free | Can misjudge nearly singular arrangements    |
| Immutable sketches                    | Undo and drag preview are trivial                   | Allocates on every drag step                 |
| Rendering in pixel space              | Constant line weights and lettering at any zoom     | Positions are recomputed on every pan        |

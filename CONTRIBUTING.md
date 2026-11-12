# Contributing to Trammel

Thanks for taking an interest. This is a small project with a simple rule: the core stays pure, tested and readable.

## Getting set up

```sh
npm install
npm run dev
```

Before opening a pull request, run the same checks CI runs:

```sh
npm run format:check
npm run typecheck
npm test
npm run build
```

## Ground rules

- **The core has no dependencies and never touches the DOM.** Everything in `src/core/` is plain TypeScript that takes data and returns data. If a change to the core needs React or the browser, it belongs in `src/ui/`.
- **Sketches are immutable.** Editing functions return a new sketch. Undo depends on this.
- **Every derivative is tested.** The solver is only as good as its gradients, and a wrong one fails in ways that look like a flaky solver. `tests/equations.test.ts` checks each against a numerical derivative on random geometry. New equations must be added to that check.
- **Prefer exact answers in tests.** A 3-4-5 triangle has a right angle. A rod of length 10 dragged towards (30, 40) ends at (6, 8). Tests that assert known geometry catch far more than tests that assert "it converged".
- **Words in the interface are plain.** Say what a thing does, in sentence case, without jargon the user has not been shown.
- **No network, no storage of personal data, no telemetry.** Trammel works offline from a static folder and should stay that way.

## Adding a new kind of constraint

Adding a constraint touches six places. Using "midpoint" as the example:

1. **`src/core/types.ts`**: add the variant to the `Constraint` union and its entry to `CONSTRAINT_REFS`, which says what kind of entity each field must point at.
2. **`src/core/equations.ts`**: add a case to `compile` that returns the equations. Each row needs its value, the parameters it depends on, and the derivative with respect to each. Keep values in length units so no constraint dominates the others.
3. **`tests/equations.test.ts`**: add it to `ALL_KINDS` so its derivatives are checked, and add any kink (a place where the function is not smooth) to `isSmooth`.
4. **`tests/solver.test.ts`**: add a case with an answer you can work out by hand.
5. **`src/core/catalogue.ts`**: offer it for the right selection in `optionsFor`, and give it a title in `TITLES`. Add the selection to the table in `tests/catalogue.test.ts`.
6. **`src/ui/icons.tsx`** and **`src/ui/Canvas.tsx`**: draw its glyph on the 16 by 16 grid, and say where its badge sits on the sheet.

TypeScript will point out most of the places you have missed, because the `switch` statements over constraint kinds are exhaustive.

## Reporting a solver problem

The most useful bug report is a saved sketch. Use **Save**, attach the `.trammel.json` file, and say what you did next and what you expected. Sketch files contain only geometry and constraints.

## Style

Prettier decides formatting. Run `npm run format` and do not argue with it.

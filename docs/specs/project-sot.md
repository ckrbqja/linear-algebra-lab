# Project Source Of Truth

## Product Shape

Linear Algebra Lab is an interactive learning tool for linear algebra. The user
should feel like they are writing math in a notebook while the graph performs
that math as an animation.

The app has two main workflows:

1. Transform mode
   - Matrix input is the main control.
   - Presets fill or apply matrices.
   - History/current state explains determinant, rank, inverse, and matrix
     changes compactly.
   - Vectors, basis vectors, grids, relative grids, scalar constraints, dot
     products, areas, and volumes are visual overlays.

2. System/notebook mode
   - A single free-form notebook is the main input.
   - Each line can declare an equation, vector, matrix, measurement, transform,
     caption, or panel-only note.
   - The vertical scrubber controls how much of the notebook has been executed.
   - As the scrubber moves, variables appear, equations draw, matrices transform,
     and captions appear in the scene.

## UX Principles

- Dense, not decorative.
- The scene is the primary output.
- The right panel is an editor/control surface, not a marketing panel.
- Labels should be useful but not noisy.
- If a value is visible in an input, avoid duplicating it elsewhere unless it
  teaches something new.
- If a control can be inferred from hover or context, keep the always-visible UI
  minimal.
- Layout should not shift when values grow, vectors are added, or dimensions
  change.
- Fractions are preferred when they communicate exactness better than decimals.
- Decimal output should avoid trailing `.00` unless precision is necessary.

## Animation Principles

- Animation is not polish; it is the teaching medium.
- Direct input changes, matrix application, dimension changes, and camera view
  changes should feel smooth.
- When the notebook executes, variables should appear progressively.
- Matrix transformations should animate from the previous visible state to the
  next visible state.
- Scrubbing should be deterministic: the same scrub position produces the same
  visible state.
- If a new dimension appears, the camera should transition to the appropriate
  dimensional view smoothly.
- In system/notebook mode, auto camera should default to the current dimension:
  1D, 2D, or 3D.

## Scene Display Rules

- Basic grid and relative grid are separate toggles.
- Axes and basis vectors are separate concepts:
  - axes: coordinate frame orientation/reference;
  - basis vectors: editable vectors that can transform the grid.
- In system mode, display toggles should still apply. Basic grid, relative grid,
  axes, coordinates, vectors, and snapping must not silently stop working.
- Colors assigned to variables should avoid axis colors when possible so lines,
  vectors, and axes remain distinguishable.
- Measurement colors are shared semantic colors, not vector colors:
  - dot/length: gold/yellow family;
  - area: magenta family;
  - volume/determinant: warm orange/red family.

## URL And Share State

- User state that affects the visible scene should be shareable through the URL.
- Camera position/target should be included when the user manually changes view.
- URL state should not break if older links omit newer fields.
- Keep encoded state compact enough to copy and share.

## Internationalization

- User-facing text should go through the i18n dictionary.
- Supported locales: Korean, English, Japanese, Chinese.
- If a new label, button, status, toast, or instruction appears in UI, add it to
  all locale dictionaries.
- Math notation itself should stay compact and language-neutral where possible.

## Monetization Slots

- Ads should live outside the main interaction surface.
- Do not place ad boxes inside the scene overlay cluster or inside the notebook
  body.
- Donation UI should be visible but not obstruct math interaction.


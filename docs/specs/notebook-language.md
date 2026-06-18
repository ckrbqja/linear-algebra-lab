# Notebook Language Specification

This document is the source of truth for system/notebook parsing.

## Core Idea

The notebook is a loose math notebook, not a programming language. Users should
be able to paste math-like lines and see the graph update without ceremony.

Each non-empty line is parsed into one of these categories:

- equation/plane
- vector
- matrix row / matrix block
- calculation
- measurement
- caption
- note
- hidden line

The parser should prefer useful math interpretation over strict syntax errors.
Whitespace should almost never matter.

An empty notebook is a true empty state. Starter examples may appear as
placeholder or Tab completion text, but they must not create variables, rail
labels, scene labels, or solver geometry until the user accepts or types them.

## Variable Naming With `#`

`#name` assigns or renames the variable created by a line.

Examples:

```text
2x + 3y = 4  #L1
3, 4  #v1
1 0  #M1
0 2
```

Rules:

- If the user writes `#name`, keep that exact name after normalization.
- If the user does not write a name, prettier may add an automatic name.
- Automatic names:
  - equations in 2D: `L1`, `L2`, ...
  - equations/planes in 3D: `P1`, `P2`, ...
  - vectors: `v1`, `v2`, ...
  - matrices: `M1`, `M2`, ...
  - calculations/results: `r1`, `r2`, ...
- If the user writes `M1` later and only `M1` exists, do not silently coerce it
  to lowercase `m1`.
- Variable tags shown inside the editor should match the left rail labels.

## Execution Marker With `@`

Trailing `@` means "declare this line and execute/apply it during animation."

Examples:

```text
3, 4  #v1@
1 0  #M1@
0 2
```

Rules:

- Without `@`, a line usually declares a variable only.
- With `@`, the line participates in the animation at its notebook position.
- Vectors are special: vectors default to executed/visible because users expect
  a vector line to appear in the scene.
- Matrices are special: matrices default to declaration only because users often
  want to name a matrix before applying it.
- Prettier should automatically append `@` to vectors.
- Prettier should not automatically append `@` to matrix declarations.

## Standalone References, Duration, And Removal

After a variable has been declared, writing only its name on a later line
executes or reveals that existing variable at that point in the notebook.

Examples:

```text
1 0  #M1
0 2

M1
M1  3s
v1 -
```

Rules:

- `M1` applies the existing matrix `M1` during the animation, even if the matrix
  declaration itself did not use `@`.
- `v1` or `L1` reveals the existing vector or equation again at that point.
  Prettier should show this as `v1 +` or `L1 +` for non-matrix references so it
  reads as an explicit restore/reveal step.
- A trailing duration such as `3s`, `0.5s`, or `3/2s` controls only the line
  carrying that suffix while the rest of the notebook continues at the normal speed.
  In consecutive equation blocks, `#L1 3s` slows the `L1` reveal only; `L2`
  uses normal speed unless it has its own duration.
- A trailing `-` removes that variable from the visible scene from that point
  onward, but keeps its declaration available for later references and
  calculations.
- A trailing `+` restores or re-reveals an existing non-matrix variable. For
  example, `L1 -` hides/removes the line and `L1 + 3/2s` brings it back over
  1.5 seconds.
- Legacy lines that were accidentally prettified as `# M1` may still be read as
  a standalone reference when `M1` is already a known variable.

## Multiplication And Assignment

Multiplication is the main way to apply a matrix or compute a derived variable.

Examples:

```text
M1 * v1
M1 * v1  #v2
M2 * M1  #M3
L1 * M1
L1 * M1  #L4
```

Rules:

- If a multiplication line has no `#name`, it is an action:
  - matrix-vector multiplication transforms/updates the visual target;
  - matrix-equation multiplication transforms/updates the visual line or plane;
  - matrix-matrix multiplication transforms/updates the right-hand matrix
    variable. For example, `M1 * M2` changes `M2`, not the global scene matrix.
- Matrix-vector and matrix-equation actions should interpolate the existing
  visual target from its previous value to the transformed value over that
  line's scrub interval, not jump at the end.
- If a multiplication line has `#name`, it stores the result in that new variable
  instead of implicitly changing the original target.
- When multiplication stores a new vector or equation with `#name`, the new
  variable should reveal smoothly like any other notebook-created visual.
- Prettier should not add `#name` to multiplication by default.
- If the user wants a new variable, they write the `#name` explicitly.
- Matrix times matrix must work, not only matrix times vector.
- Multiplication lines execute by default because they describe an animation
  action, but prettier should not add a visible `@` unless the user wrote it.

## Hidden Lines With `!`

`!` is used after a `#name` to hide that declared variable from the scene while
keeping it available for calculations.

Example:

```text
3, 4  #helper!
```

Rules:

- The preferred hidden syntax is after the variable marker: `#name!`.
- Hidden variables still exist in the notebook environment.
- Hidden variables should be visibly muted in the editor.
- Hidden variables should not draw their normal scene object.

## Captions With `//`

`//` creates a simulation caption.

Example:

```text
// First we create two lines.
2x + 3y = 4  #L1
4x + 2y = 5  #L2
// Now the intersection becomes the solution. 2s
// -
```

Rules:

- Caption lines display in the scene while the notebook animation reaches that
  part of the script.
- Captions are for the viewer watching the simulation.
- Captions are not variable declarations.
- Captions should remain `//` after prettier.
- Captions may persist until the next caption line changes them.
- A trailing duration such as `2s` controls how long the caption step takes
  during playback.
- `// -` clears the current caption from the scene.
- Captions should not clutter the panel status cards.

## Notes With `#`

Plain natural language is panel-only explanation.

Rules:

- If a line is natural language and not a formula, prettier should convert it to
  `# note text`.
- `# note text` is for the user reading the notebook panel.
- `# note text` should not appear as a scene caption.
- Use `// note text` when the text should appear in the simulation.

## Equations And Planes

Accepted examples:

```text
x + y = 3
2x - y + 3z = 0
3x + 4y + 5z = 3
```

Rules:

- Spaces should not matter.
- Missing `=` may be interpreted when the expression is still clear.
- 2D equations draw lines.
- 3D equations draw planes.
- If any equation uses `z`, the notebook dimension should become 3D.
- If equations are 2D only, the scene should use a true 2D coordinate system.
- Solvers should show rank, augmented rank, solution dimension, and solution
  coordinate when available.
- The solution point should show readable coordinates in the scene.
- If the 2D solution is a whole line, the status readout should show a
  representative equation such as `3x + 2y = 3` when it can be derived;
  otherwise it may fall back to the generic solution-line label.

## Vectors

Accepted examples:

```text
1, 2
3, 4, 5
v1 = 2, 3
```

Rules:

- Comma-separated numeric values create vectors.
- Two values create a 2D vector.
- Three values create a 3D vector.
- A single number alone is not a vector and should not create a matrix.
- Vectors should appear in the scene as soon as their line is executed.
- Dragging a vector in the scene should update the corresponding notebook line.
- When auto-updating a dragged vector line, use the normal variable syntax:
  `x, y  #v1`, not `v1 = x, y`.

## Matrices

Accepted examples:

```text
1 0
0 2

1 0 0
0 1 0
0 0 1
```

Rules:

- A matrix row requires at least two numeric values separated by whitespace.
- One number alone should not be parsed as a matrix row.
- Matrix blocks are consecutive numeric rows with the same width.
- A matrix should be considered complete only when enough rows exist for the
  detected shape, or when the block is separated from following text.
- Avoid re-running animation on every partial keystroke. Re-run when the matrix
  becomes a complete block.
- Matrix execution should be smooth and scrubber-driven.

## Measurements

Accepted examples:

```text
dot(v1, v2)
v1 * v2
det(v1, v2)
det(v1, v2, v3)
```

Rules:

- `dot(a, b)` draws and stores a dot product relationship.
- `a * b` is also treated as a dot product when both `a` and `b` are known
  vectors. Matrix-vector, vector-matrix, matrix-matrix, and equation-matrix
  products remain calculations/transforms.
- `det(a, b)` draws area in 2D.
- `det(a, b, c)` draws volume in 3D.
- Measurements are scrubber-local: a `dot(...)` or `det(...)` line should not
  appear in the scene until the notebook scrubber reaches that line.
- Measurement UI and notebook text must stay synchronized:
  - creating through scene UI should add/update the notebook expression;
  - editing/removing the notebook expression should update/remove the scene UI.
- If a measurement line is deleted, the corresponding scene measurement should
  disappear.
- Measurement labels should not overlap vector labels.

## Prettier Rules

Prettier should help the user without hiding intent.

- Normalize equation spacing.
- Preserve trailing durations such as `#L1 3s` and caption durations such as
  `// caption 2s`.
- Keep equation durations line-local even when several equations are grouped
  into one visible notebook state.
- Add automatic `#name` for declarations.
- Add automatic `@` to vectors.
- Do not add automatic `#name` to multiplication actions.
- Keep `//` captions as `//`.
- Convert natural language to `#`.
- Preserve user-specified names and hidden markers.
- Add two spaces before inline variable tags when visually useful.

## Scrubber Semantics

- At 0%, nothing has executed yet.
- Slightly after 0%, the first executable line appears.
- Lines appear progressively as the scrubber passes them.
- Matrix transformations happen within the matrix block's time interval.
- The speed control label is authoritative: the default `0.5` slider value is
  shown and played as `1x`, so a `1s` suffix should take about one second at the
  default speed.
- Pressing run should animate the scrubber from its current meaningful point to
  100%.
- If a matrix changes while editing, replay from the relevant matrix segment and
  continue downward, not stop at the matrix.

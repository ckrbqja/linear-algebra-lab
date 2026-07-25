# Visual Lesson Failure Cases

These are minimal, repository-owned memories of failures that were only clear
after running the real app. Copy the principle, not the example names or values.

## CASE-STATE-1: Matrix Cards Are Not Graph Focus Targets

- **Symptom**: a board lesson using `focus A` or `focus U` can trigger repeated
  React updates or imply that a matrix has graph geometry.
- **Root cause**: matrices are presented as board/scene cards; `focus` is for
  visible spatial teaching objects and selected solution geometry.
- **Smallest fix**: remove matrix names from `focus`. Reveal the named matrix
  product with `#name@` and let the card itself be the evidence.
- **Verification**: replay in a fresh browser session and confirm the matrix
  card appears with no `Maximum update depth exceeded` console error.
- **Owning rules**: notebook matrix-card semantics and field rules in
  `docs/specs/notebook-language.md`.

## CASE-LAYOUT-1: Broad Child Selectors Can Collapse Lesson Copy

- **Symptom**: chapter lesson titles and section labels overlap or squeeze into
  a tiny badge even though the button grid has enough width.
- **Root cause**: a selector such as `button > span` styles both the lesson
  number and the nested title wrapper.
- **Smallest fix**: give the semantic number element its own class and style
  that class only. Keep the title/source wrapper on the flexible grid column.
- **Verification**: at the narrow control-panel width, measure a fixed number
  badge, a positive flexible copy width, zero rectangle overlap, and no console
  errors.
- **Owning rule**: dense course navigation must remain readable in
  `docs/specs/visual-interaction.md`.

## CASE-CAMERA-1: Textual Correctness Does Not Prove Framing

- **Symptom**: a derived vector or transformed grid is mathematically correct
  but its endpoint or label is outside the viewport.
- **Root cause**: the engine intentionally has no automatic camera framing.
- **Smallest fix**: simulate the final extent and author a smaller zoom before
  the expanding operation. Do not move the camera after the evidence has
  already clipped.
- **Verification**: replay at the normal control-panel width and confirm the
  primary endpoint plus label margin remain inside the scene.
- **Owning rules**: camera and framing sections in
  `docs/specs/notebook-language.md` and `docs/specs/visual-interaction.md`.

## CASE-BOARD-1: A Row Operation Is Not Three Independent Cards

- **Symptom**: `E * A #U@` correctly shows A, E, and U, but a learner cannot
  tell which row moved or which entry was eliminated.
- **Root cause**: matrix multiplication was evaluated, while the board renderer
  had no elementary-matrix interpretation or row/cell transition data.
- **Smallest fix**: keep the canonical product syntax; infer the elementary row
  operation in `rowOperationEngine.js` and feed its source row, target row,
  changed cells, and eliminated cells to the board card component. Stage the
  target row cell by cell and keep the arithmetic readout synchronized. Do not
  encode that motion separately in every lesson; use one public board mark only
  for a distinct before/after inspection claim.
- **Verification**: validate replace/swap/scale inference, replay the board
  product, and confirm operand movement, the affected-row accents, the
  ordered cell calculations, each genuine cancellation strike, the changed U
  entries, any authored row/staircase mark, and a clean console.
- **Owning rules**: multiplication semantics in `notebook-language.md` and the
  board choreography contract in `visual-interaction.md`.

## CASE-MEASURE-1: A Collapsed Volume Must Not Become Surviving Area

- **Symptom**: after `det(i,j,k)` and `A with view 2d`, the scene correctly
  flattens but the final measurement changes from volume zero to area one.
- **Root cause**: the measurement renderer dropped a transformed basis target
  when that target became the zero vector, then inferred measurement kind from
  the two surviving targets.
- **Smallest fix**: preserve zero-valued basis targets for determinant/volume
  measurements and derive area-versus-volume from the authored target arity,
  not from output rank or camera presentation.
- **Verification**: replay the rank-drop lesson at 100% and confirm the label is
  `volume i · j · k = 0` while the scene finishes in the planar view.
- **Owning rules**: determinant arity and rank-drop evidence in
  `visual-interaction.md` and `notebook-language.md`.

## CASE-SOLUTION-1: A No-Solution Trace Must Finish Its Search

- **Symptom**: markers on parallel or inconsistent equations descend only to
  the middle of the scene and disappear before visually completing the search.
- **Root cause**: the renderer interpolates only part of the clipped equation
  span while the playback engine assigns the shorter unique-solution duration.
- **Smallest fix**: move each marker to the opposite visible endpoint and give
  no-common-point `solution(...)` cells a proportionally longer default duration
  so their existing travel speed is preserved.
- **Verification**: replay a parallel-line lesson and confirm both markers stay
  separated, reach the far clipped endpoints, fade there, and create no solver
  point or console error.
- **Owning rule**: no-solution reveal choreography in
  `docs/specs/visual-interaction.md`.

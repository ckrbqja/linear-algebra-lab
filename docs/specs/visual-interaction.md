# Visual And Interaction Specification

## Camera

- View buttons change camera direction without unexpectedly changing zoom.
- The initial lab camera should start wide enough that the core working area is
  visible without immediate zooming.
- Automatic camera movement is off in transform and system/notebook modes.
  Content, rank, dimension, matrix, and playback changes never rotate, retarget,
  zoom, or fit the camera. Releasing manual orbit preserves the user's view.
- Because framing is authored rather than automatic, generated notebook stories
  calculate final visible bounds before each checkpoint and place an explicit
  absolute `zoom` before any operation whose result would otherwise be cropped.
  A checkpoint must not depend on manual learner zoom to discover its result.
- Notebook `view 1d` / `view 2d` / `view 3d` cells explicitly direct the camera
  for that part of the story, while `zoom n` sets an absolute, scrub-safe zoom
  factor. These commands animate over their own cell duration and remain
  deterministic under backward scrubbing.
- Notebook `orbit` is the one supported scripted rotation: it makes a slow,
  deterministic full circle around the current target and returns to the
  starting preset direction. It is authored explicitly and never inferred from
  scene geometry.
- Bare notebook `1d` / `2d` / `3d` cells change true ambient dimension, reset
  transformed space to that dimension's identity, and move to the matching
  camera. Camera-only `view` cells never change line/plane interpretation.
- A synchronized matrix/view cell such as `A with view 2d` interpolates the
  matrix deformation and the explicit camera preset from the same scrubbed
  progress value. At every cursor position, both effects are deterministic;
  neither transition finishes its cell earlier than the other. Unless the same
  scene transaction explicitly authors `zoom`, the camera keeps its current
  orbit target and distance for the whole view change. Different preset base
  distances must never create an implicit zoom at the start or end of the
  synchronized animation.
- Prompt-authored rank changes choose that synchronized view from the surviving
  output and the next teaching claim. An XY-plane result normally finishes
  head-on when the learner must compare planar outputs; a disappearing depth
  direction, oblique surviving subspace, or requested orbit keeps the 3D view.
  This conditional authored choice does not re-enable runtime auto-camera.
- Camera presets are calibrated scene contracts, not vague labels:
  - `view 2d` looks from `(0, 0, 14.5)` toward the origin along +Z;
  - `view 3d` looks from about `(9.5, 7.2, 11.8)` toward `(0.15, 0.15, 0.15)`,
    about 39 degrees around from +Z toward +X and 25 degrees above the XY plane;
  - `view 1d` looks from about `(0, 4.6, 12.2)` toward the origin, keeping the
    x-axis readable at about 21 degrees elevation.
- Notebook syntax does not expose arbitrary azimuth, elevation, orbit angle,
  pan, or camera-target commands. A story that needs learner-controlled rotation
  without conceptual review stops at `inspect`; a real understanding point uses
  `checkpoint`.
- `zoom n` is absolute, is clamped to `0.35..3`, and uses approximately
  `camera distance = preset distance / n`. It never compounds with the preceding
  zoom cell. The normal directing range is `0.75..1.6`; `1.8..2.2` is reserved
  for a compact focal object, while values above `2.2` risk cropping context and
  labels.
- Explicit notebook camera commands respect camera and zoom locks.
- Notebook examples rely on the documented base camera unless their opening
  scene differs from it. Loading an example clears stale camera-transition
  bookkeeping but does not auto-fit content; only authored camera deltas run.
- Starting notebook replay from 0% may reset stale transition bookkeeping, but
  it must not cancel the explicit camera move that an example just requested.
- A notebook camera transition exists only while an explicit `view`, `zoom`, or `orbit`
  cell is active. Its source and target stay stable for that cell and scrub
  deterministically in either direction.
- Notebook playback with no opening scene block starts from true `3d`, base
  camera `view 3d`, and absolute `zoom 9/10`. An explicit dimension/view in the
  leading scene-only block is applied before the first rendered frame and is
  restored before replay from 0%; therefore a purely 2D story that begins with
  bare `2d` is already 2D when it appears. A dimension/view command after the
  opening block remains a visible scrubbed transition; an extent change uses
  `zoom`.
- A named scene preset applies its listed view, zoom, and overlay changes as one
  scrubbed scene cell. View and zoom share that cell's progress; unlisted state
  remains unchanged. `use default` restores the complete base scene.
- Restarting playback from 0% clears stale explicit-camera transition state and
  restores the explicit opening scene state, or the documented 3D base when no
  opening block exists. It never infers dimension from geometry or automatically
  fits visible content.
- Camera lock modes are separate:
  - full lock;
  - zoom lock;
  - camera/orbit lock.
- Even when orbit is locked, zoom can remain available if only camera/orbit lock
  is active.
- The dense scene tool group (view presets, camera locks, space overlays, vector
  visibility, and measurement tools) is collapsed by default. A compact toggle
  at the scene's upper-right always shows the active view and smoothly expands
  or collapses the full group without moving the scene title. User changes made
  inside the group remain active after it is collapsed.

## Notebook Field Clear

- A notebook `clear` cell removes the current teaching objects together: visible
  vectors, equation/solution geometry, measurements, and the active caption.
- Clearing the field is a scene transition, not an environment reset. Previously
  declared values remain available to later calculations and reveal commands.
- `clear` hides matrix cards too. If the next caption depends on a matrix, the
  story restores its card with `A +` before the caption; an applying reference
  such as `A with view 2d` also reveals the card as part of that action.
- Camera direction, zoom, axes/grids/overlays, and the current transformed space
  remain stable across `clear` so the learner does not lose spatial context.
- No unchanged setup block is replayed after `clear`; only intentional state
  deltas appear in the notebook timeline.
- `space reset` is a separate scrubbed transition from the current transformed
  state to the identity of the current true dimension. It preserves declared
  values, dimension, camera, and overlays, and it must be
  used before replaying the same deformation after a `clear` boundary.
- Scrubbing backward across `clear` restores the earlier field deterministically.
- A scene waiting at a checkpoint is never cleared until the learner presses
  Next. Cleanup belongs to the resumed sequence, after stale caption content is
  cleared or replaced.

## Algebra Board And Graph Fields

- The graph field is the notebook default and owns coordinate geometry.
- The algebra board is a separate presentation layer for matrix-card and
  symbolic derivations. It covers coordinate geometry with a quiet ruled
  surface, keeps captions and playback controls visible, and moves all visible
  matrix cards into a centered, wrapping layout.
- Entering the board does not clear or mutate graph state. Returning to the
  graph reveals the same underlying camera, dimension, transformation, and
  graph objects unless the notebook explicitly changed or cleared them.
- Board and graph changes use a restrained fade. The board blocks invisible
  orbit interaction so the learner cannot accidentally rotate the hidden graph.
- A row-operation story should use the board while matrices are the evidence.
  If it later explains the system as intersecting lines or planes, it switches
  explicitly to the graph before revealing that geometry.
- When the board reaches a visible product `E * A #U@` and E encodes one valid
  elementary row operation, the three cards form one visual sentence. E moves
  from declaration order into the left-operand position beside A; an unobtrusive
  `E × A → U` header names the product; the source and target rows receive
  distinct restrained accents; and the target row is evaluated from left to
  right. The arithmetic readout follows the active cell, each entry that truly
  becomes zero receives its fine strike at that turn, and changed U cells settle
  in the same order. The final cards and row-operation notation remain readable
  through the following checkpoint.
- Row-operation accents are overlays on the matrix grid. They do not change
  entry sizing, bracket geometry, card dimensions, or matrix values. Row swap,
  nonzero row scale, and row replacement use the same component and deterministic
  scrub progress. A non-elementary left operand falls back to ordinary matrix
  product presentation.
- Authored board marks reuse the same non-layout overlay layer. Row marks span
  one row, cell marks use a small coordinate pointer, pivots use a restrained
  distinct ring, strikes animate across one entry, and staircase marks identify
  diagonal pivots plus the lower-left zero region. Only one authored mark is
  active; it never shifts entries, brackets, matrix cards, captions, or playback.

## Column-space deformation

- When narration says a matrix crushes or projects space, the scene must show the
  deformation itself: relative grid/axes visible before the bare matrix action,
  then their smooth collapse during that matrix cell.
- A card-only `A +` reveal is contextual UI and is never evidence of a spatial
  transform.
- For a rank-two 3D projection onto the XY plane, the final scene keeps the
  flattened relative grid and zero-volume measurement visible. Explicit
  `z=0` plane geometry is added only for a separate column-space claim.
  Nullspace vectors may support the explanation but cannot replace the visible
  output-space collapse.

## Nullspace deformation proof

- A nullspace conclusion that says a nonzero input disappears ends with a real
  matrix deformation from identity. The representative nullspace vector and
  relative grid visibly collapse during the matrix cell and remain in the final
  scene or inspection checkpoint; static solution geometry alone is not
  sufficient evidence.
- When the same conclusion claims that the complete output is the XY plane, the
  proof uses a relative-grid collapse and normally synchronizes the matrix with
  `view 2d`. A vector-only disappearance may remain in 3D when depth is useful;
  bare `2d` is not used as a substitute for the deformation.

## Dragging And Snapping

- Dragging vectors should feel direct.
- Shift-drag in 3D should snap toward visible axes when near them.
- Integer snapping should be toggleable.
- Snapping hints should not cover labels. Prefer highlighting existing coordinate
  values over adding bulky floating labels.
- When a vector is dragged, the corresponding notebook line should update using
  `values  #name`.
- Resolve that owning line once at drag start. While the pointer moves, patch
  only the changing coordinate range in the editor model and keep the live
  vector in render-owned refs. Do not parse or replace the full notebook,
  rebuild Monaco marks, or commit React document/vector state on every pointer
  event; commit the completed line and vector state once on pointer release.

## Labels

- Labels should not overlap when possible.
- Label collision resolution may nudge labels vertically in roughly 22-pixel
  steps with small lateral offsets for up to about ten placements. It is a
  safety net, not permission to overcrowd a scene.
- A wide determinant or length label first tries positions just outside the
  screen-space bounds of its measured construction, preferring the right side
  before flipping or moving above/below. Those candidates must also clear other
  scene labels and the viewport; the ordinary collision nudge remains the
  fallback. A collapsed 2D area keeps its explicit below-line placement.
- There is no notebook command for positioning a label. Authored stories must
  solve collisions through short names, fewer simultaneous objects, coordinate
  visibility, staged reveals, cleanup, camera preset, and restrained zoom.
- Coordinates are visible by default in notebook stories so a screen-only
  learner sees both the symbol and value. They may be hidden for a crowded
  overview, but the symbol (`i`, `j`, `k`, `v1`) must remain and coordinates
  should return for any value-reading step.
- Notebook focus is additive: non-selected geometry and labels keep their normal
  opacity and color. A selected vector shaft or equation line receives a narrow
  static accent in its own color. A vector accent follows the shaft and
  arrowhead silhouettes separately, fading toward their edges and endpoints;
  it must never read as a uniform rectangular band or blunt cap from an oblique
  view. A plane receives a modest fill/edge lift; a selected point grows
  slightly. The matching label gets a restrained glow and
  one short grow-and-settle animation that remains modestly larger while focus
  is active. The label text, padding, background, and border scale as one box;
  never enlarge only the text inside a fixed border. A one-line scene label
  sizes to its concise content within the viewport-safe maximum so glyphs never
  protrude through its border. Solver-owned solution labels follow the same
  focus treatment as ordinary object labels. Collision placement permanently
  reserves the animation's maximum scale envelope, so entering or leaving focus
  never moves the label anchor or makes the box jump sideways. Implement focus
  growth inside the label's final positioning transform; never apply an
  independent scale to the absolutely positioned outer label because that also
  scales its translated screen coordinate. Caption variable tags keep a stable
  hit box while pointing: hover may change glow, border, and background, but it
  must not translate or resize the tag under the pointer. Avoid pulsing,
  oversized neon bloom, thick overlay tubes, or recoloring selected objects to
  one shared color; emphasis must never erase context or change the mathematical
  endpoint.
- Notebook hard focus is isolating. A selected target keeps its identity color
  and receives a slightly stronger version of the same geometry-plus-label
  accent, while other visible mathematical objects are reduced to quiet,
  desaturated context rather than removed. Axes and grids remain stable spatial
  reference. Hard focus must transition quickly and smoothly, without endpoint
  motion, a full-scene blur, or game-like bloom. A notebook-authored
  `focus hard ...` starts its comparison immediately: the complete isolation
  strength eases from normal to hard focus and back to normal exactly twice over
  about 2.8 seconds. Target geometry and every dimmed context object share that
  comparison envelope. The target label settles into its hard-emphasis state
  once and keeps that state continuously across both comparison cycles, so its
  entry animation never restarts at an envelope trough. There is no initial hold
  and no terminal rapid blink. This authored
  comparison does not run for caption-pointer hover. A caption-pointer hard
  focus temporarily dims an existing authored focus without tearing down its
  settled presentation state. Pointer leave clears the locator immediately and
  begins a quick synchronized restore of every dimmed geometry and label to the
  exact prior authored state, with no dwell or hold, so neither one restores later,
  stalls at the dimmed value, or flickers near the end; pointer leaving must not
  replay focus growth, respawn geometry, or add an extra visual step.
- Matrix cards are algebra displays rather than graph labels and are not focus
  targets. Direct attention to a matrix through its visible identity-colored
  card and matching caption tag, not through a no-op `focus MatrixName` cell.
- In 2D, labels should show only two coordinates.
- In 1D, labels should show only one coordinate.
- A point-presented notebook value uses a compact endpoint marker in its own
  variable color, with no shaft or arrowhead from the origin. Focus enlarges the
  marker slightly and accents its label without adding a vector-like glow tube.
- A visible zero vector also uses a compact marker and label at the origin,
  because an arrow of length zero has no direction. This presentation does not
  change its vector semantics or turn it into `point(...)`.
- Row-picture and column-picture coordinates must not be visually conflated. In
  `Ax=b`, the row scene draws equations in x-y variable space and labels their
  intersection as the solution `x`; it does not draw the RHS tuple `b`. The same
  `b` may appear later as a point target after the column-picture transition.
- In a column picture, the solution tuple `x=(a,b,...)` is shown as coefficient
  algebra in the caption, not as an origin arrow. The columns, live sum, and
  optional point-only target carry the spatial explanation.
- Scene labels should use concise text and avoid repeating controls that already
  exist in the panel.
- Caption variable tags use the exact scene color of their referenced object in
  a compact, restrained badge. They must remain readable without neon bloom and
  should not alter caption layout when a checkpoint activates.
- A variable tag communicates object identity, not attention. Every semantic
  occurrence of the same declared object remains tagged with the same color,
  even when it repeats in one caption. Caption `**emphasis**` and scene `focus`
  remain independent channels and never replace the variable tag.
- Caption `**emphasis**` uses stronger text and a restrained underline rather
  than a badge, glow, pulse, or size jump. Scene captions wrap automatically
  inside a label-safe maximum width. A literal `\n` remains an author-stable
  semantic break for separating a short claim from its consequence. Neither
  feature may move the checkpoint button or cause a layout shift when playback
  stops.
- Scene-caption prose uses relaxed Korean-readable tracking rather than negative
  tracking. Inline math chips may remain compact, but surrounding explanation
  text must preserve enough horizontal separation for bold two-line captions to
  scan comfortably.
- The scene-caption card is directly draggable. On desktop its checkpoint review
  bar sits above the caption; at mobile widths the bar sits below the caption in
  a viewport-bound two-row grid so localized actions never compress into a
  clipped single row. It keeps one restrained, permanently visible icon-only grip
  so the affordance is discoverable. Dragging either the card or the grip uses the
  same motion. Its
  user-chosen position persists across later captions, `inspect`,
  checkpoints, and the completion message for the current lab session. Caption
  variable tags and review buttons use the button-style pointer cursor and never
  start a caption drag or scene orbit. When caption content, review controls, or the viewport changes
  size, the whole caption stack is clamped inside the scene instead of being
  reset to its default top-center anchor.
- Variable tags and inline math nested inside `**emphasis**` retain their own
  rendering and colors. Emphasis wraps those semantic tokens; it does not turn
  them back into raw `{{...}}` or backtick text.
- Caption `{{name:expr}}`/`{{name:value}}` renders the object's colored identity
  and its current declared expression/value in one compact math chip. It keeps
  the expression tied to the source of truth rather than duplicating prose.
- Caption backticks render a compact inline math chip for tuples and formulas.
  Korean prose uses the locally bundled Pretendard variable webfont, while the
  chip uses a compact mono math stack rather than mixing a serif math face into
  the surrounding sans-serif sentence. Display-only formatting normalizes
  spaces around binary `=`, `+`, `-`, and `*` and after tuple commas without
  changing unary negatives or the notebook source. One quiet boundary makes the
  expression read as a unit; tagged variables inside it retain their individual
  colors without becoming separate nested badges. Operator spacing must survive
  at both sides of a tagged-variable span; layout must not trim it at an inline
  child or flex-item boundary. The chip is distinct from both `**emphasis**` and
  scene `focus`.
- Scene-command/status marks are UI metadata, not mathematical variables, and
  cannot supply or override a caption variable tag's label or color.
- Variable color is identity across the notebook, scene, and captions. A
  standalone reveal/remove reference and an in-place calculation inherit the
  declaration color for vectors, equations, and matrices; those cells never
  allocate a new palette color. A newly named calculated result may receive a
  new color.
- Different named matrices receive different palette colors whenever possible.
  For `B * R #BR`, the cards, marks, and caption tags for `B`, `R`, and `BR`
  must be distinguishable; `BR` is not recolored as either operand. A matrix
  caption tag must match its own matrix card and notebook mark exactly.
- Every currently visible matrix card is rendered; the scene must not discard
  older cards merely because more than two matrices are visible. Cards stack
  downward and wrap into another compact column when vertical room runs out.
- In system/notebook mode, equation lines and planes should have scene labels
  like vectors. With coordinate display on, show the `L`/`P` name plus the
  compact equation; with coordinate numbers hidden, keep only the `L`/`P` name.
- When an equation has an authored `#name`, that exact name is its scene label;
  generated `L1`/`P1` names are only fallbacks for unnamed equations.
- Extracting `row(A,n)` or `col(A,n)` highlights that slice directly on A's
  matrix card in the extracted vector's color and attaches its name. The card
  highlight and the resulting vector must read as one relationship.
- Algebra-board cell, pivot, and strike marks keep the precise highlight on the
  target entry, but place their `rNcN` coordinate badge at the matrix-card edge.
  The badge never sits over another matrix value, and neither the badge nor its
  leader changes the numeric grid or bracket geometry.
- Row and column slice names stay inside the matrix card and its bracketed
  layout. Slice highlights are absolute translucent overlays behind the matrix
  values and never participate in grid sizing or move an entry. The card may
  reserve a non-layout edge gutter for the attached name, but the numeric grid
  and brackets keep exactly the same geometry as an unhighlighted matrix.
- Solution geometry should also be labeled: unique points, common lines, and
  common planes all need a visible scene label. A 3D intersection line must keep
  its label even when it is horizontal or passes near the origin.
- Common-plane scene labels should stay compact. Do not put the full parametric
  plane solution in the scene label; keep that detailed expression in the panel.
- 2D solution labels must use the visible 2D variables only. Solver internals may
  pad equations with a zero z-coordinate, but that hidden z freedom must not make
  a single 2D equation appear as a solution plane.

## AI-Authored Scene Readability

- Keep two to four primary math objects visible at once. More than about five
  simultaneous labels is a high-clutter scene.
- Important motion has an explicit cause visible in the scene. After operands
  appear and directly before an operation cell, a short caption announces the
  exact next action and stays visible during the animation. A section heading
  such as "matrix times vector" does not replace `now apply A to x`.
- An operation cue is predictive, not retrospective: it names the scalar or
  matrix action that will happen next and the visual feature to watch. The
  result/conclusion is captioned only after the motion has made it visible.
- The standard operation beat is `operands -> cue caption -> animated action ->
  checkpoint/result observation`. Unrelated captions, cleanup, camera changes,
  and other math actions do not separate a cue from the action it announces.
- Before every checkpoint, calculate the final displayed endpoints of all visible
  geometry, including scalar multiples, matrix-vector results, live sums and
  translated tips, determinant corners, and objects retained from earlier cells.
  Input coordinates alone are not a framing check.
- In the front 2D preset, derive the conservative label-safe half extent from the
  real camera distance and field of view; it is about `5.4` world units at
  `zoom 1`. With `R=max(|x|,|y|)` across displayed endpoints, reserve about `0.8`
  units for arrowheads and labels and choose
  `zoom <= 5.4 / (R + 0.8)`. Round down to a simple supported value. Thus an
  endpoint whose largest coordinate is `11` needs approximately `zoom 0.45`,
  not `zoom 0.8` or `zoom 1`.
- Matrix-vector stories must not accidentally apply the transformation twice.
  Choose one scene grammar:
  - transform-space: reveal `x`, then execute bare `A`; the existing arrow moves
    to `Ax`, so do not also create `A*x` in that transformed scene;
  - comparison: keep the space at identity and create `A*x #Ax` beside `x`,
    without executing bare `A` in the same scene.
  If both views are needed, separate them with `clear` and `space reset`.
- Composition stories keep that choice for the whole chain. In transform-space
  form, one visible vector moves continuously through `u -> Ru -> BRu` as bare
  `R` and bare `B` deform the scene. In comparison form, the scene stays at
  identity while separately named `Ru` and `BRu` appear. Showing both mechanisms
  in one scene is duplicate evidence and may render a double transformation.
- During each bare notebook matrix action, tracked vectors, basis directions,
  relative axes/grid, and transformed geometry use the same per-frame matrix
  and easing value. A tracked vector must remain rigidly attached to the
  deforming space instead of visually chasing or leading the grid.
- For `A=[[2,1],[1,1]]` and `x=(1,2)`, `Ax=(4,3)`. After bare `A`, `x` already
  appears at `(4,3)`. Adding another visible `A*x` in that transformed space
  makes it render at `A(Ax)=(11,7)` and is prohibited unless deliberate repeated
  transformation is the actual lesson.
- In a front 2D view, vector endpoints less than about `0.8` world units apart
  are likely to crowd; below `0.4` they are very likely to overlap.
- Vector directions within about 12 degrees, or within 12 degrees of opposite,
  should be treated as near-collinear. Exact scalar multiples cannot be visually
  separated by switching to 3D or changing zoom.
- The fixed 3D camera direction is approximately `(0.566, 0.427, 0.705)`. For
  endpoints `p` and `q`, projected separation may be estimated with
  `delta = p - q` and `|delta - (delta dot d)d|`; values below about `0.8` world
  units should trigger staging or cleanup.
- When example values are free to choose, prefer meaningful vector directions
  separated by at least 20-30 degrees and endpoints separated by at least 1.2
  world units. When values are fixed, preserve the mathematics and stage the
  reveal rather than changing coordinates for aesthetics.
- A statement about an entire line or plane must show that set as equation
  geometry at the inspection checkpoint; generating vectors alone are not a
  sufficient final picture.
- A contiguous scene-configuration block is one visual transaction. View and
  zoom animate on one shared progress; axes, grids, basis, coordinates, and
  vector visibility all switch together at its boundary instead of producing a
  row-by-row flicker. A toggle-only transaction receives one short shared settle
  before the next visual math reveal, rather than letting setup and result pop
  in as one unreadable flash. A checkpoint-owned caption gets a short one-second
  introduction before the checkpoint provides unlimited inspection.

## Axes, Basis, And Grids

- Absolute axes are the fixed reference axes.
- Relative axes are the transformed/current `i`, `j`, and `k` directions.
- Absolute and relative axes should use the same bidirectional visual grammar:
  each visible axis passes through the origin instead of only extending in one
  positive direction.
- Relative axes are controlled by the relative-axis toggle and per-axis
  visibility only. They must not depend on the vector/basis display toggle or
  on rank-independence filtering; nonzero transformed directions remain visible.
- Basis vectors are editable basis objects.
- Basis vectors are hidden by default on fresh load and reset. They should still
  be editable in the panel and can be revealed by the basis toggle or show-all
  controls.
- The basis display toggle controls basis arrows, labels, and basis measurement
  targets. It must not be wired to the relative-axis toggle.
- Absolute grid is the untransformed reference grid.
- Relative grid is the transformed/current grid.
- These toggles must work in both transform mode and system/notebook mode.
- Relative grid strength should be adjustable because strong transformed grids
  can overpower equations and planes.
- In a deformation-only scene, turn the absolute grid off when the relative
  grid alone provides the needed reference. Both grids stay on only when their
  before/after comparison is part of the lesson.
- In system mode, equations should not hijack the axis toggle.
- Automatic equation-solution display is a separate system-mode toggle and is
  off by default. It controls inferred intersections without hiding the source
  equations; a reached notebook `solution(...)` cell makes its selected solver
  geometry visible regardless of the toggle.

## Measurements

- Vector sums, dot products, areas, and volumes are selectable relationships.
- A vector-sum relationship should remain visually distinct from its target: the
  relationship owns the head-to-tail arrows and result arrow, while a target
  declared with `point(...)` supplies only the destination marker and label.
- A vector-sum relationship must be readable without opening the notebook: show
  the two translated parallelogram sides as restrained dashed guides in their
  corresponding operand colors, and the result arrow from the origin in the
  semantic sum color. Both helper sides omit arrowheads because they describe the
  same parallelogram construction rather than additional operand vectors. Its
  label uses colored operand tokens and the form `Sum a + b = (x, y[, z])`.
- Revealing a vector sum shows the construction in execution order. The two
  dashed helper sides grow simultaneously from the operand endpoints until they
  meet at the sum endpoint; that meeting settles one compact result marker, then
  the semantic result arrow and label complete. The sequence follows notebook
  cell progress exactly so replaying or scrubbing never changes its order.
- The sum label is anchored at the result endpoint and prefers the open side of
  that endpoint, normally the right. It flips left and tries restrained vertical
  alternatives when the viewport or other labels would cover it; it should not
  sit across the source arrows.
- Newly revealed measurement geometry and labels should fade/reveal smoothly,
  matching the way notebook vectors appear.
- Hovering a vector label can reveal measurement actions.
- Clicking a measurement action starts a connection gesture.
- Clicking another compatible object completes the measurement.
- Completing a measurement in notebook mode writes its formula at the current
  execution point, immediately after the active notebook cell. It never jumps
  to the document bottom merely because the action originated in scene UI.
- The scrubber advances through that inserted formula and stops there: the new
  relationship appears immediately, while later authored cells remain future
  state. Insertion never splits a multi-line matrix/equation cell.
- Clicking empty scene space cancels an unfinished connection.
- Existing measurements should expose delete/hide controls on hover.
- A zero-area determinant keeps its source vectors and `area = 0` label, but
  hides the degenerate fill and translated parallelogram boundary. The two
  source arrows already show collinearity; a coincident helper edge extending
  to `a + b` looks like an unrelated third ray. Place the zero-area label below
  the collapsed line so it remains clear of the top caption and endpoint labels.
- Measurement lines should use their semantic color:
  - sum result: teal; translated/helper edges retain operand colors;
  - dot/length: yellow/gold;
  - area: magenta;
  - volume: orange/red.

## System Solving

- 2D equations should render as lines.
- 3D equations should render as planes.
- Notebook progression should be controllable from both the right-panel vertical
  scrubber and the in-scene horizontal scrubber. Both controls must drive the
  same deterministic notebook cursor, and notebook variable marks should be
  clickable jump points.
- The right-panel vertical scrubber remains the whole-notebook timeline. The
  in-scene horizontal dock is instead a local segment player: its selector lists
  each `checkpoint`, each lighter `inspect` stop, and any trailing final segment.
  Selecting an item restores that segment's end scene, while the local track
  normalizes only that segment from 0 to 100 percent and shows only its event
  ticks. This keeps a checkpoint replay readable instead of compressing every
  notebook command into one crowded bar.
- The notebook speed control remains a full-width utility row below the authoring
  actions, but its compact height, small value chip, and restrained padding keep
  it secondary to the editor.
- The dock play button owns playback inside the selected segment. A checkpoint
  caption's Next action remains the distinct forward-story action.
  When the learner has cued a notebook row or paused partway through a segment,
  the dock resumes from that local cursor; at the segment end it replays from
  the segment beginning. In either case,
  replaying the dock segment never silently advances past the selected stop.
  The right-panel whole-notebook scrubber and local dock still map through the
  same deterministic notebook cursor.
- The compact current-operation HUD is embedded in the local dock's metadata
  row instead of floating separately above the scene. It appears only while an
  executable calculation, matrix application, measurement, or solution cell is
  in progress and shows the parsed operation such as `E × A → U`, not a generic
  spinner.
- The HUD fades and settles in without moving scene layout, keeps operand/result
  identity colors, then fades out after the active segment. It must remain
  subordinate to the upper teaching caption: the caption explains the intent,
  while the HUD answers what is being computed right now.
- The authored lab scene omits the persistent product-name and marketing
  subtitle block. The upper utility row begins directly with actionable
  controls, leaving the recovered corner available to the mathematical scene
  and its labels; the document title and scene `aria-label` retain the product
  identity for navigation and accessibility.
- The right-panel vertical scrubber needs a generous hit area and stable pointer
  capture so dragging its handle feels direct instead of sticky or jumpy. The
  track itself must not advertise a vertical resize cursor. A compact grip stays
  visible in the slim exterior rail immediately to the right of Monaco's native
  scrollbar and uses `grab`/`grabbing` feedback. The visible track is a quiet
  hairline inside that wider hit target, while the handle is a small rounded
  capsule with horizontal grip marks rather than a bright full-height bar;
  the numeric percentage appears beside it only on hover, keyboard focus, or
  drag so the idle editor has no protruding badge. Pressing within the grip keeps
  the grabbed point under the pointer instead of recentering the handle and
  jumping the notebook cursor; pressing elsewhere on the rail may jump directly
  to that position. The grip center maps the rail's first and last usable points
  to exactly 0 and 100 percent, so reaching either endpoint never requires
  dragging beyond the visible rail.
- Newly visible equation lines, planes, solution highlights, and solution points
  should reveal smoothly rather than popping into the scene.
- A unique `solution(...)` reveal makes the search legible before committing the
  answer: small markers in each participating equation color travel along the
  corresponding line or plane toward the common point, converge once, and fade
  into the compact solver point. The point and solution label begin only at that
  convergence and remain settled afterward. At normal speed the convergence gets
  about 1.4 seconds rather than reading as a sub-second dart. Its screen-space
  approach follows the narration: when the visible caption is above the solution
  point, markers start at the upper valid equation endpoints and descend toward
  the answer; a caption below the point selects the lower endpoints and an upward
  approach. A converging marker remains visible through its exact arrival at the
  common-point coordinate; only then may it fade into the solver point and label.
  Scrubbing deterministically reverses or replays the same path without a
  persistent pulse.
- A no-solution `solution(...)` keeps that same narrated approach instead of
  suppressing the trace because no common-point coordinate exists. Each marker
  stays on its own participating line or plane and travels from the caption-side
  visible endpoint through the shared reading region to the opposite visible
  endpoint. It remains visible through that full-span arrival, stays separated
  from the other markers, and only then fades without creating a solver point.
  The no-solution cell extends its default duration in proportion to the longer
  path so the marker keeps the same deliberate travel speed instead of racing
  or disappearing halfway down the scene. The following result caption names
  the empty solution; parallel or otherwise inconsistent equations must never
  fake a convergence at one equation's pairwise intersection.
- A cumulative equation reveal keeps every already visible line/plane and its
  label continuously mounted at settled opacity while the next equation fades
  in. Rebuilding the aggregate system must never insert a blank frame, hide old
  labels pre-emptively, or restart reveal timing for unchanged equations.
- Notebook panel marks, solver facts, and derived equation/matrix values should
  reveal smoothly instead of popping in abruptly.
- The single Monaco notebook surface uses custom glyph-margin widgets to keep
  variable/settings marks inside the editor's own line layout. Its native right
  scrollbar owns document scrolling, the active executed line receives one
  restrained teal row-band with horizontal edges instead of a cursor-like
  vertical stroke, and autoplay reveals that line without resetting the learner's
  text selection. Moving that row-band never restarts a whole-line opacity
  animation; execution progress must not make notebook text blink.
- The notebook editing field uses a restrained ruled-paper background aligned to
  Monaco's configured line height and top padding. The rules continue through
  empty editor space, remain quieter than syntax colors, and use a lower-contrast
  tint in both light and dark themes.
- The notebook header presents the title plus AI, share, and playback actions as
  one compact tool row. Playback uses a quiet tinted surface in every state;
  its control reserves one stable width across Run, Stop, Next, and Replay so
  changing playback state never moves the neighboring actions or editor edge.
  running changes its icon and restrained accent without turning the whole
  control into a saturated red stop block. Speed lives in its own slim,
  full-width row immediately below the header, where the slider keeps a useful
  drag range instead of being compressed between buttons. The header does not
  expose an editor-engine selector or allow the title to break into stacked
  syllables. Persistent action labels use short one-line verbs such as Copy
  prompt and Replay; their longer explanation belongs in the button title
  rather than a wrapped second line.
- Every AI-specific entry point uses the same static filled two-spark mark:
  the notebook `Create with AI` toolbar action, its guide dialog, and the AI
  steps or feature cards on the landing page. The mark uses the shared 16-by-16
  SVG geometry, inherits the surrounding control color, and has no sheen layer,
  glow sweep, pulsing, or repeating animation. The notebook identity uses the
  Lucide `NotebookPen` mark instead of a code-braces glyph.
- Toolbar controls never shrink their text through their own borders. The speed
  row preserves its label, useful slider travel, and numeric value independently
  of the action row; at narrow viewport breakpoints, AI/share/playback actions
  become accessible icon buttons. Desktop AI and share actions size to their
  content, while playback alone reserves its stable state width; all three remain
  separate compact controls rather than stretching inside one oversized pill.
- The notebook panel has no full-height colored left rail. Monaco's semantic
  gutter stays anchored directly to the neutral panel edge, while non-editor
  sections below it—saved notes, examples, and course chapters—keep a modest
  inset instead of placing headings and cards directly against that edge.
- Monaco omits line numbers and reserves the left gutter only for compact
  rounded-rectangle semantic marks. An unlabeled setup or command row stays
  visually quiet, then reveals a cue affordance in its glyph slot on hover.
  Clicking any gutter mark moves the caret there, restores the scene immediately
  before that row, and pauses; it never starts playback on the first click. The
  selected mark becomes a compact Play button with a geometrically centered
  triangle fully contained by the rounded rectangle. Clicking that same mark
  again, or using the notebook header Play action, begins at the cue and continues
  through the remainder of the selected checkpoint segment. Repeated or rapid
  mark clicks never open a rename dialog; names are edited directly in notebook
  text. Clicking anywhere other than a gutter mark clears the pending cue;
  clicking another mark moves the cue there.
- Playback has one persistent action in the notebook header. The editor does not
  repeat a floating play/check button in its upper-right corner.
- Monaco uses its native incremental tokenization, while plain Enter also runs
  the shared notebook prettier. The adapter applies only the smallest changed
  text range plus the newline to the live Monaco model, so automatic names and
  execution markers appear immediately without replacing the whole document or
  flashing comments and syntax colors through a second render state.
- Monaco suggestions are contextual rather than persistent. They may open for
  the first command/reference token, a variable operand being typed, a function
  argument; whitespace, caption editing, and ordinary prose never summon or
  keep the widget open. Manual `Ctrl+Space` remains available.
- An empty Monaco notebook shows a quiet, ruled-paper-aligned ghost starter at
  the first text column: `3,4`, then `0 1` / `1 0`, with the Tab affordance beside
  the first line. It stays readable without depending on the suggestion popup,
  disappears immediately on typing, and Tab accepts the canonical starter.
- Monaco's lazy-module fallback and its internal editor bootstrap use the same
  fixed-height ruled-paper shell and semantic gutter as the ready editor. A
  compact loading spinner appears only after a short delay, both loading phases
  share that one visual treatment, and the ready surface replaces it without a
  blank frame or layout change.
- Monaco owns its live model while the learner types. React receives content
  changes but must not feed the same controlled `value` back into Monaco on
  every keystroke, because a full-model echo moves the caret and selection.
- Rapid typing updates Monaco's local document immediately and cancels active
  playback once at the start of the edit burst. The live text stays in Monaco
  and a mutable revision ref without setting the top-level React notebook state
  on every keystroke; parent state, parser, gutter/decorations, and scene-cursor
  synchronization commit together after roughly 400 ms of editing inactivity,
  or immediately when plain Enter formats and commits the completed line. Only the
  newest document revision may update the runtime scene; intermediate React
  echoes are ignored while the editor owns text focus. Monaco caret movement
  and editor scrolling stay immediate rather than visually smoothing repeated
  Enter/newline input, and outer-panel caret clamping performs at most one
  layout measurement per animation frame.
- Playback keeps scene geometry and camera progress in mutable render refs at
  the display frame rate. React state mirrors only learner-facing controls and
  readouts at a coarser cadence (about 20 Hz), with a mandatory final sync at
  the end of each range. Scene labels cache their text and projected anchors;
  DOM content and collision placement run only after the text, anchor, camera,
  visibility, or viewport actually changes, never unconditionally every frame.
- Consecutive global scene reset/display commands appear as a native Monaco fold
  with a compact localized scene-setup summary. Initial load, paste, and a new
  externally supplied notebook collapse these utility ranges automatically;
  manual expansion stays open during normal editing, and mathematical content
  is never hidden by the setup-range classifier. Notebook gutter marks follow
  the same hidden ranges instead of remaining behind on unrelated visible rows.
  App-originated changes such as presets, drag updates, and
  cleanup synchronize only when their text actually differs from the live
  model, preserving the current caret offset and scroll position where valid.
- A colored variable token inside the scene caption is a scene pointer. Hovering
  or keyboard-focusing it gives the token a restrained locator accent and
  temporarily applies exclusive hard focus to the matching visible
  vector, equation, solution,
  measurement, basis object, or matrix card. Other visible math becomes quiet
  context while the pointer is active, even when another scripted focus already
  exists. Mathematical state never changes; pointer leave fades the locator out
  before restoring the authored focus state.
- Named notebook measurements preserve their declared alias from the parsed
  cell through the rendered measurement object. A caption pointer or authored
  focus for `sum(a, b) #out@` therefore focuses the visible sum geometry and its
  label as `out`; it must never dim the entire scene because the rendered
  measurement lost its name.
- Notebook operation overlays are explicit and operation-specific. A `sum(...)`
  cell shows the two operand-colored helper sides as matching thin dashed lines
  without arrowheads and its result arrow as the only solid derived path.
  Together the dashed sides close the operand parallelogram without competing
  with the solid result path. A `dot(...)`
  cell alone owns a perpendicular projection guide. The transform-workspace dot
  helper never leaks into a notebook sum scene merely because its toolbar state
  was previously enabled.
- Legacy notebook textarea styling targets only the adapter's direct textarea;
  it must never cascade into Monaco's internal input area. Pointer focus inside
  Monaco remains editor-native so browser keyboard extensions recognize the
  real textarea and suspend page-level shortcuts while the learner is typing.
  Monaco's experimental EditContext backend stays disabled for this surface:
  the focused keyboard target is a writable textarea, never a zero-width
  `div.native-edit-context` that extensions can mistake for page chrome.
- Monaco keeps its native document scrollbar inside the editor boundary and
  places the playback scrubber in one slim exterior rail immediately beside it.
  The native vertical scrollbar keeps a permanently reserved lane rather than
  appearing only after focus or document growth, so editing and playback never
  change the notebook text width.
  The scrubber never overlays notebook text or the native scrollbar, keeps a
  usable pointer target, and its percentage pill stays quiet until hover,
  keyboard focus, dragging, or playback. The existing hover play action stays
  inside the editor rather than covering either rail.
- While Monaco owns text focus, its caret remains visible inside both the editor
  viewport and its active outer authoring scroller: the desktop control panel or
  the mobile notebook pane. Adding lines, pasting, formatting, playback, and
  opening another notebook never changes the editor's outer height. Monaco keeps
  its own vertical scrollbar for document growth.
- The desktop authoring panel is a stable vertical split. A persistent horizontal
  separator between Monaco and the resource shelf changes the editor height
  directly, supports Up/Down and Home/End keys, and persists the chosen height.
  New desktop sessions give Monaco the clear majority of the available panel
  height. The separator uses pointer capture and may travel down until only the
  resource tabs plus a compact usable resource viewport remain; the lower shelf
  must not reserve a large empty block that makes the separator appear stuck.
  The resource shelf always owns the remaining panel height: its tab row stays
  fixed while only the selected resource panel scrolls. Content changes on
  either side never move the separator or cause the tab row to jump.
- Utility sections below the Monaco surface occupy the full system-panel width.
  They do not inherit or imitate Monaco's glyph-margin inset; the semantic gutter
  belongs only to editor rows. The former always-visible solver status/rank card
  is not repeated below the editor because the notebook scene and authored
  `solution(...)` steps own that explanation.
- `My notebooks` is a compact local library below the editor. A saved entry owns
  a title, the exact notebook source, and its last-updated time. Saving an open
  entry updates that entry; starting a new note detaches from it; deletion uses a
  deliberate two-press confirmation. Opening a saved entry restores it at 0%,
  pauses playback, and never auto-runs the story. The library persists in browser
  local storage on that device and does not imply account/cloud synchronization.
- Quick examples, the visual course, and `My notebooks` share one compact
  resource shelf below the editor. They are sibling tabs rather than three
  vertically stacked sections, and only the selected panel is rendered so
  opening the notebook library never pushes the quick examples and full course
  farther down. The shelf fills the space below the editor separator, keeps its
  tabs stationary, and gives the selected tab panel an independent vertical
  scrollbar when needed. Quick examples are the default tab; the notebook tab
  keeps a visible saved-count badge, and the course keeps its single-open
  chapter accordion inside its own panel.
- A scene matrix card fades and slides in subtly when first declared or restored.
  Its default reveal cell lasts about 1.6 seconds so the card can be read before
  the next mathematical object appears; the motion stays restrained and does
  not pulse or glow.
- The system panel places a numbered linear-algebra course directly below the
  compact quick-example bank. The quick bank uses one localized collection
  title and renders its preset data in the declared order instead of duplicating
  one button per example in `App.jsx`. Lesson buttons stay dense and tool-like,
  show their order and concept name at a glance, and load the notebook through
  the same clean-start playback path as every other example. The course follows
  concept prerequisites: coefficients and linear combinations precede
  independence and bases; bases precede matrix columns; and matrix columns are
  visibly connected to moving basis vectors and the deforming relative grid
  before later determinant, system, and subspace lessons.
- The quick bank includes a compact matrix-transformation example whose initial
  checkpoint visibly contains both standard basis arrows and the identity
  relative grid. Applying its shear matrix moves those arrows and the whole grid
  together, and the final one-line conclusion must not obscure either endpoint.
- Quick-example button labels stay on one line. When the panel narrows, the grid
  gives each localized label a safe minimum column width and moves a whole
  button to the next row instead of wrapping words inside it or overflowing the
  panel.
- Course navigation uses a compact single-open accordion. The outer rows read as
  numbered chapters (`1강`, `2강`, and localized equivalents), while the open
  chapter reveals smaller local steps such as `1.1` and `1.2`. This hierarchy
  must remain visually distinct from the flat equation-example button bank.
- In notebook/system mode, the displayed system dimension follows the current
  output rank after notebook matrix transforms. A 3D equation passing through a
  rank-1 matrix should present as 1D output, not stay labeled and framed as a
  full 3D plane.
- Animation focus mode should let the user hide panels, ads, and dense scene UI
  so only the scene plus the animation scrubber/playback controls remain. It
  must be reversible without losing the previous panel-open state.
- Solver-owned intersection points, lines, and planes use compact markers,
  narrow cores, and low-opacity halos. Overlapping equation geometry must not
  become an oversized dot or a thick glowing tube.
- A determinant measurement keeps the arity authored by its target list even
  when output rank or camera presentation changes. In particular,
  `det(i,j,k)` remains a volume measurement and reaches volume zero during a
  3D-to-2D collapse; it never silently turns into the surviving `det(i,j)` area
  merely because the final display is planar.
- With one plane, do not draw fake intersection/tangent lines.
- With exactly one equation, do not show a separate solution label/readout. The
  single line or plane is the object being studied; solution labels begin when
  there are enough equations to compare, overlap, or intersect and solution
  display has been requested.
- With two 3D planes, compute the intersection line when it exists, but keep it
  hidden until the automatic-solution toggle is on or a notebook
  `solution(...)` cell selects it.
- Coordinate-plane rendering follows ambient notebook dimension, not camera:
  `x=0` and `y=0` are planes under true `3d` even after `view 2d`, and their
  common z-axis is rendered as solution geometry; they are lines only after
  true `2d`.
- With three or more planes, compute the solution point/line/plane as
  appropriate and apply the same visibility rule.
- `solution(...)` reuses this existing solver-owned geometry. Selection changes
  the native solution label to the authored alias, gives the point a modest
  static size/color accent, smoothly reveals the result even when automatic
  display is off, and never overlays a duplicate point or second coordinate
  label.
- `focus -` ends only focus emphasis. The explicit solution remains until its
  selection is removed or the field is cleared.
- Solver status should clearly say whether the result is:
  - unique point;
  - same line;
  - parallel/no solution;
  - infinite plane/line family.

## Timeline And History

- Transform history belongs to transform mode.
- System/notebook progression belongs to system mode.
- Transform history should render as a narrow vertical rail inside the
  transform control panel, beside the current-space/matrix/vector stack. It
  must not add an extra outside column that makes transform mode wider than
  system/notebook mode.
- The transform timeline rail should be tight, stable, and not obscure panel
  content.
- Recent items should stack in the direction requested by the user for that
  screen state; preserve the current project behavior unless the user changes it.

## Learner-Controlled Playback

- A notebook `checkpoint` pauses autoplay without clearing the scene or caption.
- A notebook `inspect` pause is the weaker spatial-viewing stop. It preserves
  the scene and caption, keeps orbit/zoom active, and exposes only a neutral
  free-inspection hint plus Next; it does not expose checkpoint history,
  segment replay, or caption hiding.
- The caption belonging to that checkpoint appears for a short one-second
  introduction before its review controls appear; the checkpoint itself then
  becomes learner-controlled reading time. Explicit caption timing remains
  available when text must precede a different action.
- While paused, the learner can freely orbit and zoom the current scene.
- Both the in-scene playback control and the notebook-panel control expose a
  clear `Next` action, with a short instruction that the learner may inspect the
  scene before continuing. The scene caption additionally exposes compact
  `Previous`, `Replay`, and `Hide/Show explanation` review actions.
- The scene-caption card is the primary checkpoint affordance: it keeps the
  current caption visible and places a persistent review-action bar outside the
  card's own layout flow. Desktop uses its fixed slot above the card. Mobile
  places the local playback dock in the graph's bottom safe-area overlay and
  stacks the compact review-action bar immediately above it; neither control
  becomes a viewport footer. Previous, Next, and the active Continue/Replay
  action retain labels, while secondary review tools may compact to accessible
  icon buttons. The caption therefore keeps one stable upper-scene position and
  the mathematical canvas never reflows when the controls appear. When no
  caption exists, the card shows the checkpoint hint in the same stable
  position.
- Previous is visibly disabled at the first checkpoint. Hiding the explanation
  leaves the action bar in place, and replay temporarily returns to normal
  playback before settling on the same checkpoint again.
- Pressing `Next` advances to the next authored learner stop, not automatically
  through all remaining checkpoint or inspect stops.
- Reaching the natural final scene exposes the same review-action bar without
  requiring a trailing `checkpoint` in notebook syntax. It remains draggable
  with the caption on desktop and occupies the fixed review footer on mobile.
  The final scene supports Previous/Next review within its final segment,
  segment Replay, authored-view restore, and caption Hide/Show; it omits the
  forward-story Continue action and shows its completion badge only while the
  review cursor is at the actual segment end.
- The bottom playback dock can choose any checkpoint/inspect/final segment and
  replay that chosen segment independently. Its progress is local to the chosen
  segment; Previous/Next and the right-panel scrubber retain story-level
  navigation ownership.
- A copied student animation link reuses this same in-scene playback dock in a
  read-only presentation shell. It removes the editor-facing animation-view
  exit button as well as the entire control panel, so a learner cannot reveal
  authoring UI by toggling the dock. Playback still starts paused and remains
  learner-controlled rather than autoplaying on page load.
- Landing previews are explicit preview variants of that same read-only
  renderer, not decorative substitutes. The first hero view ends with one large,
  centered live product window using the localized examples `matrixTransform`,
  `rankDrop3d`, and `system-two-views`. A compact macOS-style tab strip in the
  window toolbar switches the same live frame between them and remains
  available in the expanded player. It preserves the original single-preview
  dimensions and spacing instead of becoming a moving card rail. Initial load and every tab
  replacement keep the iframe invisible behind a small dual-ring loader until
  the embedded renderer explicitly reports ready. Its two offset broken arcs use
  distinct tempos around a softly breathing core and one restrained orbit
  marker. The loader may inherit the active lesson's accent colors, but it does
  not depict mathematical geometry, labels, or a fake progress sequence. It
  masks the embedded app's own transient spinner and scrollbars.
- Landing section kickers pair a context-matched Lucide icon with a larger,
  readable overline. They do not use an unexplained decorative dash or tiny
  all-caps micro-label.
- Landing section headings remain visibly subordinate to the hero H1 at desktop
  and mobile widths. FAQ questions and expanded answers use normal reading-size
  text rather than compact metadata sizing.
- The landing Aurora remains animated on desktop, but at widths up to `760px`
  the WebGL Aurora component is not mounted. Mobile uses a static CSS background
  with the same mint, cyan-blue, and indigo palette; hiding an active canvas is
  insufficient because its animation loop would still consume mobile GPU time.
- The first revealed landing frame is already fully composed. The root remains
  behind the boot guard through the bounded UI-font wait and two layout frames,
  so header enhancement and font metrics do not appear as a staggered assembly.
  Desktop also paints the Aurora's matching CSS palette immediately; the live
  WebGL layer may initialize over that stable backdrop without exposing an empty
  hero. This boot rule does not delay or unmask the embedded preview renderer,
  which keeps its own loader until the scene reports ready.
- The fixed landing header uses the full React Bits glass displacement only
  above `760px`. Mobile does not mount `GlassSurface`; it uses a neutral,
  dark translucent backdrop with a visible blur, no teal, blue, or other
  chromatic fill, and no SVG displacement. A light neutral border and restrained
  shadow preserve the glass hierarchy without making the header read as a
  colored block.
- The landing explanation sections, audience block, FAQ, final call to action,
  and footer share one desktop outer content width. The footer divider starts
  and ends on that same grid instead of floating wider than the content above.
- The six landing feature cards form a filled `2 + 4` desktop grid, a balanced
  two-column tablet grid, and a single-column mobile stack. Each card owns a
  small visual token for its concept; card height, padding, borders, and visual
  placement stay systematic so a lone trailing card or an empty-looking card
  never breaks the section.
- At widths up to `760px`, the inline landing renderer is replaced by a compact
  three-tab demo card and its iframe is not mounted. Choosing a tab updates the
  lesson represented by the card; choosing the card opens the real read-only
  renderer in a fixed, nearly full-viewport player. Closing or minimizing the
  player returns to the compact card, so the tall simulation never crowds the
  mobile document flow.
- The mobile landing hero keeps distinct vertical bands between its fixed
  header, eyebrow, two-line headline, supporting copy, stacked actions,
  assurance, and compact demo. These gaps increase toward the demo and the
  headline uses relaxed mobile line height, preventing the first view from
  reading like one vertically compressed control stack. Desktop spacing remains
  unchanged.
- Selecting the product window's `Open this scene` action expands that lesson
  over the current viewport rather than inserting a section or changing the
  document scroll position. The preview-to-player transition scales into a fixed
  frame and locks background
  scrolling. The frame names the active lesson and uses its familiar red,
  yellow, and green window controls for close, minimize-to-preview, and
  maximize/restore. It hides only the duplicate scene topbar while preserving
  learner-visible captions, object labels, matrix cards, the operation HUD, and
  the bottom playback dock. Opening it pushes one same-URL history entry.
  Browser Back, Android system Back, Escape, backdrop selection, close, and
  minimize all dismiss that entry and return to the unchanged inline preview
  before any navigation away from the landing page; Forward restores the same
  selected lesson.
- The expanded desktop frame uses the wider landing content width and enough
  vertical scene space for the caption, completion badge, equation labels,
  matrix card, and dock to remain distinct; narrow landing widths retain extra
  scene height instead of compressing those overlays into the graph center. The
  preview caption occupies an upper scene slot so the completion badge and
  solution/equation labels remain readable below it. Inside landing preview
  frames specifically, that caption uses the upper-left safe corner, sizes to
  its actual wrapped text instead of filling the available width, and keeps
  compact padding so short lines do not create a large empty card. Before autoplay begins,
  every preview applies its lesson's leading scene-only setup block immediately
  and starts playback at the first mathematical cell, so a transient default 3D
  grid never reads as a different demo. During this autoplay-only preview,
  authored checkpoints become one-second pauses before playback continues;
  the editable source examples keep their learner-controlled checkpoints. With
  reduced motion enabled, the
  preview-to-demo expansion is removed and the preview renders the final state
  immediately. Ordinary copied student links keep the full learner-owned
  playback behavior above.
- In the nearly full-viewport mobile landing player, the redundant preview
  footer is omitted so the renderer receives that vertical space. Its scene
  keeps a compact mobile overlay density: caption cards, object labels, matrix
  cards, and operation notices reduce type, padding, and maximum width while the
  essential play and focus buttons remain directly operable. The bottom
  playback dock overrides desktop focus-mode insets and padding, using one
  shallow safe-area-aware band rather than covering the graph center.
- Pressing `Next` starts strictly after the active learner stop. The progress
  cursor must not jump backward, flash the old checkpoint state, or re-enter the
  same checkpoint before advancing.
- Stopping exactly at a checkpoint must not leak the following caption, vector,
  equation, or cleanup command because of cursor rounding.
- Moving focus from the notebook textarea to the in-scene Next button must not
  reveal future equations or clear the checkpoint during the intervening blur
  event. The click must remain attached to the active checkpoint.
- When checkpoint and playing state momentarily overlap, checkpoint resume wins:
  pressing Next must start the following range rather than entering the generic
  Stop/cancel branch.
- Reaching the final authored cell without another checkpoint shows a compact
  completion badge without replacing the final caption or scene. Playback
  controls become Replay; no extra Next click is required.
- The completion copy describes the learner-facing state as the `Final scene`
  rather than the technical event `Playback complete`; its helper invites the
  learner to inspect the final result, and Replay is phrased as starting again
  from the beginning.
- Entering a checkpoint or `inspect` stop captures its authored camera position
  and target. The learner may orbit and zoom freely while paused. Pressing Next
  first returns smoothly to that captured viewpoint and only then resumes the
  next authored range. This learner-triggered return is not automatic framing;
  no content or rank change may invoke it on its own.
- Checkpoint and `inspect` controls also expose an explicit `Original view`
  action. It smoothly restores the same captured position and target while
  remaining at the current stop, so the learner can compare a self-chosen angle
  with the authored view before continuing.
- Equation/solution geometry from a previous cursor state is cleared
  synchronously before the next state appears, so stale planes cannot flash
  during a checkpoint transition.
- The scene caption sits in the upper scene area below the view controls, with
  strong contrast. It must not be buried against the lower playback dock.
- Visible named notebook matrices appear as compact scene cards, normally at
  the upper-left, so screen-only viewers can read the matrix referenced by the
  caption without opening the editor.
- A bare matrix reference applies the transformation; a `matrix +` reference
  restores only that scene card. Row-picture explanations should use the latter
  when they need to display `A` without distorting the coordinate space.

## Responsive Layout

- Desktop: scene left, control panel right.
- The desktop notebook panel uses one unified authoring toolbar rather than a
  separate generic `Control panel` masthead above the notebook. The notebook
  identity, creation/share actions, and playback share one compact baseline with
  consistent control heights; speed occupies the slim row directly beneath it.
  The panel has no manual hide button. Its scene-facing boundary is a persistent
  accessible drag separator that resizes the desktop panel between 360 and 720
  pixels while preserving at least 360 pixels for the scene. The separator also
  responds to Left/Right and Home/End keys, and the chosen width persists in the
  browser. Its generous invisible hit target contains a narrow, quiet center
  capsule rather than a wide striped badge. During pointer drag, a thin
  compositor-only boundary preview follows the pointer while Monaco and the
  WebGL renderer keep their current dimensions. The actual width, React state,
  and local persistence commit together once on release, so neither layout nor
  the full scene/editor tree reruns for every pointer event. Playback remains
  the clear primary action; the remaining controls stay quiet and grouped.
- The authenticated account control sits beside the collapsed scene-tools
  trigger rather than inside the scrollable control panel, so it remains
  reachable when that panel is closed. It shows the user's avatar or initial
  and name at desktop widths, compacts to the avatar on mobile, and opens a
  bounded menu containing identity details and the sign-out action.
- Mobile authoring uses a stable vertical split instead of a modal notebook
  sheet. The upper 56 percent is the live 3D scene, including its top utilities
  and local playback dock, and the lower 44 percent is the independently
  scrollable notebook composer. The scene remains the largest single pane, and
  neither pane covers or reflows the other during ordinary playback.
- On mobile, language, support, and donation stay at the left of the first scene
  utility row while the collapsed scene-tools and account controls occupy its
  open right side. Every collapsed control in that row uses one consistent
  height, while the account avatar remains readable. Expanding scene tools may
  place their full panel below that row without moving the caption or
  mathematical canvas.
- The lower pane uses mobile-only compact density: the notebook title/actions
  and speed control stay in shallow rows, Monaco fills the remaining pane, and
  the three resource tabs stay against the bottom safe edge. No resource panel
  is open by default. Selecting Examples, Course, or My notebooks slides only
  that content upward as a gesture-driven, internally scrolling bottom sheet
  over the editor. The sheet has a visible drag handle, snaps between resource-
  specific heights, closes on a downward drag or backdrop selection, and keeps
  the three resource tabs in its fixed footer. Switching those tabs replaces
  the open content and animates the sheet to the new preferred height: Quick
  examples is moderate, My notebooks is taller, and Course is near full height.
  The handle is one static horizontal bar rather than a direction-morphing
  indicator. The open footer preserves the closed dock's exact height, padding,
  and border box; selection changes color without adding a border or shadow, so
  opening and switching never shifts the footer frame. The live WebGL scene is
  dimmed without backdrop blur, and sheet layers use one isolated, explicit
  stack to avoid compositing collisions.
  Course chapters 1–8 start collapsed; opening a chapter keeps the tall snap so
  its lessons remain easy to browse. Applying a lesson or opening/creating a
  notebook closes the sheet; selecting the active tab again also collapses it.
  The composer is flat and edge-to-edge with no mobile-only outer card padding.
  Starting, pausing, or resuming playback never hides the notebook or moves the
  split.
- Dark mode treats the complete mobile notebook pane as one dark surface.
  Toolbar, tabs, resource buttons, hover, focus, and post-tap states keep
  readable foreground contrast instead of mixing a pale mobile shell with a
  dark Monaco editor.
- While the visual viewport reports a software-keyboard height loss, the split
  temporarily favors the notebook so the editor remains usable. The scene stays
  attached above it, and restoring the visual viewport immediately restores the
  normal split even when Monaco retains text focus.
- Animation focus and read-only student animation viewing omit the notebook pane
  and return the scene to the full workspace.
- Panel controls must remain reachable without tiny tap targets.
- Avoid fixed widths that create horizontal clipping on mobile.
- A portrait scene preserves the same slightly-wider-than-square, label-safe
  mathematical extent as the desktop scene. The renderer widens its vertical
  projection field of view when the scene aspect ratio falls below that safe
  aspect, preserving the base horizontal extent without changing camera
  position, target, authored zoom, or orbit state. This responsive projection
  is layout containment, not automatic camera movement.
- Mobile scene overlays must preserve the mathematical evidence as the largest
  visual layer. Captions, object labels, matrix cards, operation notices, and
  playback metadata use the compact mobile density; primary playback buttons
  remain usable, the local playback dock floats in one shallow band at the
  graph's bottom edge, and checkpoint/final review actions float directly above
  it without changing scene layout. The caption starts at the upper-left,
  directly below the first utility row in the highest safe scene slot. In the
  graph field, visible matrix cards anchor to the lower-left above the playback
  dock instead of occupying the scene's left-center,
  the review-action band uses reduced vertical padding, and projected scene
  labels reserve the complete lower dock/review stack as a no-label area so no
  label is hidden at the scene-to-notebook boundary.
- The mobile lab reserves no top advertisement band. Its single bottom
  advertisement stays outside the workspace in a compact 50-pixel strip. It
  remains collapsed while provider fill is pending, expands only when filled,
  and transitions height and opacity smoothly when fill changes. The scene
  projection follows that gradual resize, and an unfilled slot finishes fully
  collapsed so advertising never compresses the primary scene into a narrow
  center band.

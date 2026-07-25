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

## Canonical Classification And Execution Model

The notebook is permissive at the text boundary, but its meaning must be
deterministic. Parsing and prettier must use the same top-to-bottom symbol table
and the same category priority.

Rules:

- Read cells from top to bottom. A calculation or standalone reference can use
  only variables declared earlier in the notebook.
- Classify captions, pauses, checkpoints, scene commands, and measurements
  before general calculations or equations.
- Classify comma-separated numeric input as a vector and consecutive
  whitespace-separated numeric rows as a matrix block.
- A calculation is accepted only when the previously known operand types support
  it. In particular, `v1 + v2` is a vector sum only when both names are known
  vectors. An otherwise ambiguous expression such as `x + y` is not silently
  treated as vector math; use an explicit equation such as `x + y = 0`.
- Prefer explicit `=` in authored and AI-generated equations. This keeps an
  equation visually and semantically distinct from vector addition.
- A declaration updates the notebook environment. Visibility is a separate
  scene concern: `#name!` declares without revealing, `name -` hides without
  deleting, and `name +` reveals the existing value again.
- Scrubbing rebuilds both the environment and visible scene from the start up to
  the selected cursor. Replaying the same cursor must therefore produce the same
  result regardless of earlier playback.
- Editing or blurring a checkpoint-based story must never push every equation in
  the full notebook into the live solver. Solver input is rebuilt only from
  equation cells reached by the current cursor. Mechanical prettier-on-blur may
  preserve the active checkpoint so clicking its Next button is not swallowed.
- Parser, prettier, autoplay, Tab completion, built-in examples, and replay after
  matrix edits must all use the same checkpoint-aware playback path.

An empty notebook is a true empty state. It shows a short, editor-owned ghost
example in the sequence `2d`, vector `3,4`, the two matrix rows `0 1` / `1 0`,
and bare matrix execution `A`; the example remains visible even when Monaco's
suggestion popup is closed. Pressing Tab accepts the example as canonical `2d`,
visible vector `3, 4  #v1@`, named matrix declaration `A`, and final bare `A`
execution. Until that acceptance, placeholder text must not create variables,
rail labels, scene labels, matrix cards, or solver geometry.

## Editor Surface

- Monaco is the notebook's single editor surface. The former compatibility
  textarea and its surface toggle are not part of the product UI.
- Monaco uses the shared parser, prettier, starter
  example, paste replay behavior, line-cue action, and blur formatting path. It
  is an editor adapter, not a second notebook implementation. Pasting into an
  empty notebook or replacing the complete document starts a new replay from
  zero; pasting into a selection inside an existing notebook is an ordinary
  local edit and must not set the full-document replay flag.
- Monaco completion includes canonical scene commands, dimensions, captions,
  vectors, points, matrices, measurements, solution/row/column helpers, setup
  presets, and every currently declared variable. Caption completion inserts a
  variable as `{{name}}`; code completion inserts its identifier.
- On the blank final code line, Monaco offers the latest declared but not yet
  executed matrix as an inline ghost completion at the caret. A typed identifier
  prefix narrows that same suggestion, and `Tab` accepts it as the bare matrix
  execution cell. The ghost text never mutates or executes the notebook before
  acceptance.
- On desktop lab entry, Monaco receives text focus at the document-end insertion
  point so the empty starter or contextual inline matrix execution can be
  accepted immediately with `Tab`.
- Automatic completion opens only while the learner types the first token of a
  code line, begins an operand identifier, or opens a function argument with
  `(`. A trailing space, `#`, ordinary caption prose, caption tags, and already
  completed numeric input do not open the suggestion widget. `Ctrl+Space`
  remains the explicit way to request suggestions at any other position, and
  document-word suggestions stay disabled so only Flow Math commands and
  declared variables appear. An empty candidate set does not open a
  `No suggestions` widget.
- Monaco variable tokens use the same identity colors as notebook marks, scene
  objects, matrix cards, and captions. Hover shows the parsed kind and current
  value/expression when available.
- Monaco tokenizes only actual paired delimiters as brackets. Vector/function
  commas and setup semicolons remain ordinary delimiters and must never produce
  Monarch bracket-definition errors.
- Monaco renders notebook marks as custom glyph-margin widgets inside the
  editor instead of maintaining a second external rail. Monaco therefore owns
  their line layout and vertical scroll position. Revealed/future animation
  state and mark cue/play behavior all stay within this one surface.
- Monaco uses its native right-side vertical and horizontal scrollbars. There
  is no parallel panel scrollbar for the editor document, and mouse-wheel input
  may bubble to the surrounding panel when the editor reaches its scroll edge.
- During playback, and while the learner drags the whole-notebook scrubber,
  Monaco follows the active executed line only when needed to keep it in view.
  Manual text editing remains a normal editor interaction and does not create a
  separate playback cursor.
- Ordinary typing stays local to Monaco until the 400 ms runtime debounce
  settles, so parser and scene work never blocks each keystroke. Pressing plain
  Enter runs the shared notebook prettier, inserts the newline as one minimal
  Monaco model edit, leaves the caret at the beginning of the new formatted
  line, and applies the latest notebook to the scene immediately. Thus `3,4`
  becomes the canonical named visible vector as soon as Enter is pressed,
  without waiting for blur. The editor must not replace or echo the complete
  Monaco model merely to apply this formatting.
- Clicking Monaco text, its gutter, or a notebook mark keeps keyboard focus in
  Monaco's text input. Gutter widgets must not leave focus on their button DOM,
  because subsequent typing must be handled by the editor rather than browser
  page shortcuts.
- Monaco recognizes consecutive global scene-preparation commands as native
  folding ranges. Dimension/view/zoom, field changes, overlay toggles,
  `focus -`, `mark -`, `clear`, and `space reset` may fold together across blank
  spacer lines; captions, checkpoints, declarations, calculations, matrix
  actions, and mathematical conclusions never enter that range. A range needs
  at least two actual setup commands.
- Scene-preparation ranges start folded when a notebook is first loaded, pasted,
  or externally replaced. Manually expanding a range remains stable while the
  learner types; ordinary controlled-value echoes must not repeatedly refold it.
  The collapsed placeholder uses a localized `Scene setup` summary and the
  native Monaco folding control. Custom gutter marks belonging to hidden lines
  hide with the fold and return when expanded, so they never drift onto the
  visible mathematical lines below.

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

- `@` remains the explicit execution marker, but visible object declarations
  reveal their own teaching representation at declaration time: vectors and
  points show geometry, equations show their line/plane, and matrices show a
  compact card. The matrix declaration does not deform space until bare `A` is
  executed.
- With `@`, the line participates in the animation at its notebook position.
- Vectors are special at initial authoring time: prettier appends both an
  automatic name and `@` to a still-unnamed shorthand vector because users
  normally expect a freshly entered vector to appear in the scene. Once a
  vector already has an authored or automatic name, an absent `@` is explicit
  declaration-only intent. Deleting `@` keeps the variable in the environment
  without revealing it, and later Enter/blur formatting must not restore the
  marker.
- Matrices are special: matrices default to declaration only because users often
  want to name a matrix before applying it.
- A visible declaration-only matrix block such as `0 1 #Swap` followed by
  `1 0` consumes the matrix-card reveal beat even without `@`; hidden matrix
  helpers remain untimed.
- Prettier should automatically append `@` only while it is also assigning the
  first automatic name to an unnamed shorthand vector.
- Prettier should not automatically append `@` to matrix declarations.
- A visible named matrix declaration also creates a compact scene matrix card.
  This lets animation-focus/screen-only viewers understand captions that refer
  to `A` without reopening the notebook panel. `A -` and `clear` hide the card;
  declarations and calculated values remain available as usual.
- A named matrix product follows the execution marker explicitly:
  `E * A #U` calculates and stores `U` without revealing its card, while
  `E * A #U@` calculates it and reveals the new `U` card at that notebook step.
  Use the latter whenever the product is the visible evidence for a claim.
- Each newly named matrix receives its own color from the matrix palette. The
  matrix card, notebook mark, and every caption tag for that matrix use the same
  assigned color. Thus `B`, `R`, and a newly named product `BR` are visually
  distinct. A later `A +`/`A -` reference or an in-place matrix calculation
  inherits the existing matrix's declaration color instead of allocating a new
  one.

## Standalone References, Duration, And Removal

After a variable has been declared, writing only its name on a later line
executes or reveals that existing variable at that point in the notebook.

Examples:

```text
1 0  #M1
0 2

M1
M1 +
M1  3s
v1 -
```

Rules:

- `M1` applies the existing matrix `M1` during the animation, even if the matrix
  declaration itself did not use `@`.
- `M1 +` restores only the named matrix's scene card. It does not apply the
  matrix or distort the current space. This is the correct form when a later
  caption needs the learner to read the matrix again after `clear`.
- `v1` or `L1` reveals the existing vector or equation again at that point.
  Prettier should show this as `v1 +` or `L1 +` for non-matrix references so it
  reads as an explicit restore/reveal step.
- A trailing duration such as `3s`, `0.5s`, or `3/2s` controls only the line
  carrying that suffix while the rest of the notebook continues at the normal speed.
  In consecutive equation blocks, `#L1 3s` slows the `L1` reveal only; `L2`
  uses normal speed unless it has its own duration.
- If a line has no trailing duration, playback uses type-specific defaults so
  the story is readable:
  - caption: about 2.8 seconds for a short sentence, increasing automatically
    with visible character/word count up to about 6.5 seconds for dense text
  - equation/plane: about 0.9 seconds per equation line
  - vector: about 0.9 seconds
  - executable matrix application/reference: about 1.15 seconds
  - visible matrix-card declaration or `M +` reveal: about 1.6 seconds
  - multiplication/calculation: about 1.2 seconds
  - unique-solution convergence: about 1.4 seconds
  - measurement/reference reveal: about 0.8-0.9 seconds
  - pause/rest: about 1.2 seconds
  - focus change: about 0.65 seconds
  - removal/clear steps: about 0.45 seconds
  - a contiguous scene-setup block gets one shared transition: `view`/`zoom`
    use one camera progress and adjacent overlay toggles switch together;
    a toggle-only block gets one settle of about 0.45 seconds before the next
    visual math reveal, and individual lines are not timed separately
- The playback builder must defensively apply these defaults to visible,
  executable cells even if the parser did not attach a duration field, so
  pasted notebooks still play as a readable sequence.
- Untimed declaration-only helpers are skipped during autoplay. A visible
  matrix declaration is the exception because its scene card is a teaching
  object and needs its reveal/readability beat.
- A trailing `-` removes that variable from the visible scene from that point
  onward, but keeps its declaration available for later references and
  calculations.
- A trailing `+` restores or re-reveals an existing non-matrix variable. For
  example, `L1 -` hides/removes the line and `L1 + 3/2s` brings it back over
  1.5 seconds. For a matrix, the same `+` restores its card without executing
  the transformation.
- A fresh visible declaration must not be followed by `name +`. The object is
  already visible. `+` is a restore operation and is valid only after the same
  object was hidden with `name -` or after `clear` hid the field.
- Visible declarations are staged just in time. A vector/equation/matrix needed
  only by a later contrast scene is declared in that later scene, because
  declaring it earlier would reveal it immediately and pollute the current
  claim. Use a hidden helper only when its value is genuinely required earlier.
- Legacy lines that were accidentally prettified as `# M1` may still be read as
  a standalone reference when `M1` is already a known variable.

## Pause / Rest Lines

Users can add a line that only lets time pass without adding a caption or
creating a variable.

Accepted forms:

```text
ns
ns 2s
rest 0.5s
pause 3/2s
쉬기 1s
```

Rules:

- `ns`, `rest`, `pause`, `wait`, `쉬기`, `쉼`, and `대기` are treated as pause
  cells.
- A pause cell does not draw anything in the scene and does not change solver
  state.
- If no duration is provided, a pause lasts about 1.2 seconds.
- Use pause cells when the story needs breathing room but no visible caption.
- A checkpoint already provides unlimited learner-controlled observation time,
  so do not add a pause immediately before the same checkpoint.

## Scene Direction Commands

Notebook stories may direct the camera and supporting scene overlays. These
commands are executable cells and participate in scrubbed playback.

Accepted forms:

```text
field board
field graph
2d
dimension 3d
space 2d
view 2d
view 3d 1.5s
view 1d
orbit 6s
A with view 2d
zoom 1.5
zoom 0.7 1s
axes on
relative-axes off
grid on
relative-grid on
coordinates off
basis on
vectors on
clear
space reset
setup proof = 2d; zoom 1; relative-grid on; coordinates off
use proof
use default
```

Rules:

- `field graph` is the default presentation field. It shows the coordinate
  canvas and its lines, planes, vectors, measurements, and solver geometry.
- `field board` places a quiet writing-board layer over the coordinate canvas
  and centers the currently visible matrix cards for row operations and
  symbolic derivations. Captions, checkpoints, playback controls, and matrix
  identity colors remain visible. The underlying graph, camera, dimension,
  declarations, and calculated values are preserved rather than destroyed.
- `field board` / `field graph` are explicit scene cells and fade between fields.
  Use the board for matrix-card-only algebra, then switch to the graph before
  revealing equations or spatial evidence. Do not approximate the board by
  turning axes, grids, and coordinates off separately.
- Bare `1d`, `2d`, and `3d` select the true ambient mathematical dimension.
  `dimension 2d`, `space 2d`, `차원 2d`, and `공간 2d` are accepted aliases;
  prettier normalizes them to bare `2d`. A dimension cell resets transformed
  space to that dimension's identity and moves to its matching camera preset.
- `view 1d`, `view 2d`, and `view 3d` choose an explicit camera direction.
  They never change mathematical dimension. For example, `view 2d` can look
  head-on at an existing 3D scene while `x=0` remains a plane.
- `orbit` makes one deterministic full circle around the current target and
  returns to the starting preset direction. Its normal authored form is
  `orbit 6s`; a duration changes pacing, not angle. Arbitrary orbit angles,
  pan, and camera-target syntax do not exist.
- `A with view 2d` applies the previously declared matrix `A` and changes the
  camera to the requested preset over the same cell interval. The matrix and
  camera share one progress value, so a rank-drop from 3D into a plane reads as
  one coordinated action instead of two consecutive transitions. This
  view-only synchronization preserves the current camera target and distance;
  it must not recompute distance from the destination preset or introduce an
  implicit zoom. The reversed input `view 2d with A` is accepted, but prettier
  normalizes it to the matrix-first form. Use a bare `A` when the camera should
  stay put, and a separate `view` when the camera change is a later teaching
  beat.
- `zoom n` is an absolute zoom factor relative to the normal view: values above
  `1` move closer, values below `1` move farther away, and `zoom 1` resets it.
  Valid factors are clamped to a safe `0.35` through `3` range.
- Notebook playback without an opening scene block begins from one deterministic
  base scene: true `3d`, `field graph`, `view 3d`, `zoom 9/10`, `axes on`,
  `relative-axes on`, `grid on`, `relative-grid off`, `coordinates on`,
  `basis off`, and `vectors on`. Authors omit commands that merely restate this
  base.
- Consecutive scene cells at the very beginning form the opening scene block.
  Its explicit dimension and camera view are installed before the first frame
  and before replay from 0%, so an opening bare `2d` starts in true 2D without a
  visible 3D-to-2D setup transition. Once a caption, declaration, calculation,
  focus, or other teaching cell has begun, later dimension/view commands remain
  normal scrubbed animations.
- The camera never follows or frames content automatically. A lesson made only
  from 2-coordinate vectors, 2x2 matrices, and 2-variable equations begins with
  one bare `2d`; `view 2d` is not a substitute. A later mathematical dimension
  change uses bare `1d` / `2d` / `3d`; `view` is emitted only for a camera-
  direction change, `zoom` only when visible extent changes materially, and
  `orbit` only when one fixed 3D view leaves depth or overlap ambiguous.
- `axes`, `relative-axes`, `grid`, `relative-grid`, `coordinates`, `basis`, and
  `vectors` accept `on` or `off`.
- Notebook scene defaults use `coordinates on`. Vector/equation values should
  normally remain readable in screen-only playback. Use `coordinates off` only
  for an overview where values are irrelevant or label density would otherwise
  obscure the geometry, and restore it for value-reading steps.
- Consecutive untimed `view`, `zoom`, and overlay-toggle lines are parsed as one
  scene configuration transaction. View and zoom share the same normally
  one-second camera progress, while all adjacent toggles switch together instead
  of flashing line by line. A toggle-only transaction consumes no narration per
  command and receives one shared short settle before the next visible vector,
  equation, matrix, calculation, solution, or measurement. A caption, math cell,
  pause, checkpoint, repeated setting name, or explicit duration ends the
  transaction. `orbit` is never batched and defaults to a slow six-second full
  circle.
- A reusable non-default setting bundle is declared on one line as
  `setup name = command; command; ...` and applied later with `use name`.
  Presets accept field mode, dimension, `view`, `zoom`, and overlay toggles;
  they cannot contain math actions, `clear`, or `space reset`. Listed settings apply together, with
  view and zoom sharing the same scrub progress. Unlisted settings remain
  unchanged. The built-in `use default` restores the complete base scene.
  Prefer direct delta commands for a one-off change; define a preset only when
  the same non-default bundle is reused at least twice.
- `clear` empties the visible notebook field in one step. It hides all currently
  visible vectors, lines/planes, solution geometry, measurements, and the active
  caption. It does not delete declarations or calculated values, reset the
  current matrix-transformed space, or change the current board/graph field,
  true dimension, camera, and overlay settings.
- In-place numeric changes also survive `clear` and `space reset`. If `c1 * 2`
  has run, a later `c1 +` reveals the already doubled value; another `c1 * 2`
  doubles it again. Authors must track the current value across scene changes,
  continue from it, explicitly undo it, or use a fresh declared object.
- Because `clear` preserves every scene setting, authors must not repeat an
  unchanged setup block after it. Write only settings that actually differ from
  the pre-clear state; `use default` is appropriate only when the story truly
  intends to restore the complete base.
- Because `clear` also hides matrix cards, a later scene whose caption mentions
  `{{A}}`, `Ax=0`, or another matrix-dependent claim must restore the card with
  `A +` before that caption/checkpoint unless the same beat executes bare `A` or
  `A with view ...`, which reveals the card as part of the transformation.
- `space reset` is the explicit transformed-space reset. It interpolates the
  current matrix state back to the identity of the current true dimension while
  preserving declarations, dimension, camera, overlays, and currently visible
  teaching objects. Use `clear` first when a new
  replay scene should not retain the old objects.
- A repeated deformation scene uses `clear -> space reset -> reveal inputs ->
  bare matrix name`. `A +` restores only the matrix card and must never be used
  when the narration claims that the grid or space is being transformed.
- A nullspace explanation that claims a nonzero input disappears must end with
  visual evidence, not a static vector beside the algebraic solution. After the
  solution checkpoint, stage a short proof scene from identity, reveal a
  representative nonzero nullspace vector, enable the relative grid if needed,
  execute the matrix, and checkpoint the actual collapse to the origin.
- That proof chooses its final view from the post-transform evidence. If it also
  claims that a 3D map removes z and leaves the whole XY plane, turn the absolute
  grid off, turn the relative grid on, and use `A with view 2d` so the environment
  and camera settle into the surviving plane together. If the claim is only the
  spatial disappearance of one nullspace vector, or depth/oblique geometry must
  remain inspectable, retaining `view 3d` is valid. Do not use bare `2d` merely
  because the matrix rank is two; it resets transformed space instead of showing
  the rank drop.
- Accepted clear aliases include `clear`, `clear field`, `field clear`,
  `필드 초기화`, `필드 비우기`, `장면 비우기`, and `전체 지우기`. Prettier
  normalizes all aliases to `clear`.
- After `clear`, later calculations may still use earlier hidden values and
  `name +` may reveal an earlier vector or equation again.
- Korean aliases such as `시점 3d`, `줌 1.5`, `축 끄기`, and `격자 켜기` may be
  entered, but prettier normalizes scene commands to the compact English form.
- Camera commands interpolate over their cell interval and must remain
  deterministic when scrubbing backward or jumping directly to a later cell.
- Scene view, zoom, and toggles use the stable notebook base before their first
  command so a replay does not inherit the final state of the previous run.
- Only explicit `view`/`zoom`/`orbit` commands or user controls move the camera.
  Camera and zoom locks still take precedence over notebook commands.

### Column-space transformation staging

- A column-space explanation prioritizes reachable outputs, not disappearing
  inputs. Show the columns or input basis, enable `relative-grid` or
  `relative-axes`, and execute the bare matrix so the learner sees the output
  geometry form.
- For `A = diag(1,1,0)`, begin from identity with `space reset`, show three input
  directions or the live basis volume, then execute `A` while the relative 3D
  grid collapses into the XY plane. The collapse itself does not require a
  `z = 0` overlay. Add `z = 0 #ColA@` only in a separate conclusion beat when
  explicitly naming the complete column space is the lesson.
- A brief nullspace contrast may explain why the z direction disappears, but a
  column-space request must not turn into a sequence of mostly kernel examples.

## Learner Checkpoints

Use a checkpoint when the learner should review a complete conceptual claim
before the notebook continues.

Accepted forms:

```text
checkpoint
confirm
확인
다음
```

Rules:

- A checkpoint stops autoplay after the preceding scene has been fully revealed.
- An implicit caption that belongs to the checkpoint's claim gets a short
  one-second introduction before checkpoint controls appear. The checkpoint then
  supplies unlimited reading time. An explicit caption duration is still honored
  when the learner must read before a distinct action begins.
- The caption and all visible math objects remain in place while stopped, and
  normal camera orbit and zoom controls remain available.
- Playback controls expose an explicit `Continue` action. Only that action
  leaves the active checkpoint and resumes toward the next checkpoint or end.
- The active scene-caption card keeps a compact review bar with `Previous step`,
  `Next step`, `Play`, `Original view`, `Hide/Show explanation`, and `Continue`
  while the checkpoint is waiting. `Original view` smoothly returns to the
  authored camera snapshot without leaving the stop or changing review state.
  If there is no active caption, the same card displays the checkpoint
  instruction instead of disappearing.
- `Previous` reverses one authored, visible action inside the active checkpoint
  segment. Repeated presses walk through that segment one action at a time,
  including captions, scene settings, geometry, operations, and focus changes;
  pauses and learner-stop commands are not review steps. The checkpoint identity
  and review bar stay active, `Continue` still resumes after that checkpoint, and
  `Previous` is disabled only when the segment start has been reached.
- `Next step` reapplies one action after a rewind and is disabled when the active
  checkpoint state has been reached.
- `Play` animates from the current rewound state back to the active checkpoint.
  When the learner has not rewound, it replays the authored segment from its
  start. In both cases it returns to the same waiting checkpoint.
- `Hide explanation` changes only caption presentation. The scene, checkpoint
  identity, progress cursor, and review bar remain unchanged, and `Show
  explanation` restores the same caption without a layout jump.
- Every object named by the active caption must already be visible when the
  checkpoint is reached; a checkpoint does not reveal hidden declarations.
- A caption-mentioned object must not be removed before its checkpoint.
  Checkpoint scene order is `caption -> reveal/operation -> optional focus ->
  checkpoint -> cleanup after Next`.
- `clear` must not erase the scene immediately before a checkpoint. Cleanup for
  a scene transition starts only after the learner presses Next; clear or
  replace stale caption text before presenting the next scene.
- Manually scrubbing or editing the notebook cancels the pending checkpoint.
- Checkpoints do not impose a time limit and do not add visible scene geometry.
- Prettier normalizes accepted aliases to `checkpoint`.
- AI-generated stories should place checkpoints at meaningful conceptual
  transitions, not after every individual command.
- AI-generated stories do not end with a checkpoint by default. The final
  caption and evidence remain visible while the player supplies a completion
  badge and replay action. A trailing checkpoint is reserved for an explicit
  request for unlimited final inspection.
- Resuming from a checkpoint is identity-based, not only percentage-based. The
  next run must start after that exact checkpoint and can never momentarily
  re-enter it, snap backward, or expose the same checkpoint again.
- A cursor exactly on a checkpoint line boundary belongs to the completed
  checkpoint, even if floating-point conversion produces a tiny overshoot. The
  first caption or object after that boundary must remain unrevealed until Next.
- A checkpoint also freezes the learner's camera. Reaching a checkpoint or
  pressing Next must not trigger an automatic reframe; only a later explicit
  `view`/`zoom`/`orbit` cell or manual camera input may change it.

## Free Scene Inspection

Use `inspect` when a 3D scene may need a learner-chosen viewing angle but the
moment is not a conceptual checkpoint.

Accepted forms:

```text
inspect
explore
둘러보기
살펴보기
```

Rules:

- `inspect` pauses at the fully revealed scene, preserves the current caption
  and geometry, and keeps manual orbit and zoom available.
- Its neutral fallback caption asks the learner to freely rotate and inspect
  the scene. The scene control offers `Original view` and `Next`; it does not
  enter checkpoint Previous/Replay/Hide review history.
- The caption before `inspect` uses the stop itself as unlimited viewing time,
  just like a checkpoint, so it does not add a redundant implicit dwell.
- Use `inspect` for spatial ambiguity or requested free viewing. Use
  `checkpoint` for conceptual review. Do not place both on the same beat.
- If a fixed view is already unambiguous, omit both. If motion is sufficient,
  prefer one authored `orbit 6s`; combine orbit and inspect only when the orbit
  demonstrates a relation and learner-controlled viewing still adds evidence.
- Prettier normalizes accepted aliases to `inspect`.

## Variable Focus Effects

Use focus when a caption refers to a small subset of the already-visible
vectors, equations, planes, or solver-owned solution and the learner needs to
find them immediately.

Accepted forms:

```text
focus c1 c2
focus hard c1 c2
focus -
강조 c1 c2
```

Rules:

- `focus name...` leaves every non-selected object fully visible and adds
  emphasis only to the selected objects. Vector shafts and equation lines
  receive a thin static same-color halo; plane fill/edges become modestly
  clearer; points enlarge slightly. Every matching label receives a restrained
  same-color accent and one short grow-and-settle animation.
  Do not dim context, pulse, add oversized neon bloom or thick replacement
  tubes, or use an unrelated highlight color. Label-only emphasis is
  insufficient.
- `focus hard name...` is the isolating form. It keeps the same identity colors
  and target treatment, strengthens the selected geometry and label together,
  and smoothly lowers the opacity and saturation of other visible math instead
  of snapping the scene into a dim state.
  The selected label performs its grow-and-settle treatment once, then remains
  continuously hard-emphasized for the full scripted comparison. It must not
  drop and restart its emphasis at the comparison envelope's low points.
  Use it when the named evidence would otherwise be genuinely ambiguous in a
  crowded scene; ordinary additive `focus` remains the default. Hard focus must
  not hide context completely, move an endpoint, recolor identities, or become
  a pulsing/neon effect.
- `focus -` ends the focus effect and restores normal emphasis.
- Focus is scene presentation state only. It does not declare, reveal, remove,
  rename, or calculate a variable.
- Matrix values are presented as scene cards rather than graph geometry, so
  `focus U` has no visible effect when `U` is a matrix. Keep the matrix card
  visible and refer to `{{U}}` in the caption; reserve `focus` for vectors,
  points, equations/planes, and solver-owned solution geometry.
- Unknown names may be retained in the script but produce no visual effect until
  a matching visible mathematical object exists.
- Ordinary `focus` persists through a checkpoint until `focus -` or `clear`.
  Scripted `focus hard` is a short locator cue: it fades in, remains isolated for
  about 2.8 seconds in real time even if the following checkpoint is waiting,
  then fades fully back to the normal scene without requiring `focus -`.
- Hovering or keyboard-focusing a tagged caption variable temporarily overrides
  every scripted focus with one exclusive hard-focus target. It stays isolated
  for the whole pointer/focus interaction, then fades out and restores the
  authored focus state; scripted and hover targets are never unioned.
- Prettier preserves canonical `focus hard ...` and normalizes `emphasize`,
  `highlight`, and `강조` to `focus`.

## Algebra Board Marks

Board marks direct the learner to a precise part of a visible matrix card. They
are separate from graph `focus` and never calculate or mutate matrix values.

Accepted forms use one-based indices:

```text
mark row(A, 1)
mark cell(A, 1, 3)
mark pivot(A, 1, 1)
mark strike(A, 2, 1)
mark staircase(U)
mark -
```

Rules:

- `row` highlights a complete row and labels it `R1`, `R2`, and so on.
- `cell` points to one entry; `pivot` gives that entry a distinct pivot marker;
  `strike` draws a fine animated cancellation line through it.
- `staircase` marks diagonal pivots and the lower-left zero region so an
  upper-triangular or row-echelon claim is visible without moving matrix cells.
- A mark persists through following captions and checkpoints until another mark,
  `mark -`, or `clear` replaces it. Only one authored board mark is active at a
  time, so a lesson does not accumulate decorative clutter.
- The referenced matrix must already be declared and visible for the mark to be
  useful. Row and column indices must fit its declared shape.
- During an inferred elementary product, automatic row-operation choreography
  owns its in-motion cell highlights and strikes. Authored marks support a
  separate before/after inspection claim and should not duplicate that motion.

## Multiplication And Assignment

Multiplication is the main way to apply a matrix or compute a derived variable.

Examples:

```text
M1 * v1
M1 * v1  #v2
M2 * M1  #M3
L1 * M1
L1 * M1  #L4
3 * v1
v1 * -1
3/2 * v1  #scaledV1
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
- When matrix multiplication stores a new matrix with `#name`, the result gets
  a new matrix identity color. An unnamed matrix product updates the right-hand
  matrix in place and retains that matrix's existing color.
- A stored named matrix result is environment-only until explicitly revealed.
  Use `E * A #U@` when the learner must inspect the result card immediately;
  `E * A #U` is appropriate only for an intentionally unrevealed helper.
- On `field board`, a visible named product `E * A #U@` receives automatic
  elementary-row-operation choreography when `E` is a valid single elementary
  matrix: one row swap, one nonzero row scaling, or one row replacement
  `R_target <- R_target + k R_source`. The engine verifies the product, moves
  the E and A cards into left-multiplication order, identifies source and target
  rows, visits changed target-row cells in column order, draws each genuine
  zero-producing strike at that cell's turn, updates the displayed arithmetic,
  and settles the corresponding U cells in the same order. It then keeps the
  final A/E/U comparison visible. A general matrix product keeps the normal card
  reveal and is never mislabeled as Gaussian elimination.
- Authors state the operation in the cue and write the ordinary product; the
  in-motion sequence needs no manual mark. For a multi-step elimination, use one
  elementary matrix and one visible named result per beat so every transition
  can be inferred independently. Use an authored board mark only for a distinct
  inspection claim before or after the product, never `focus U`, and never
  manually redeclare the calculated result.
- Sequential matrix-vector teaching uses one representation consistently:
  - transform-space form keeps one visible tracked vector `u`; bare `R` moves
    that same object to the state `Ru`, then bare `B` moves it to `BRu`. It does
    not also declare `R*u #Ru` or `B*Ru #BRu`;
  - comparison form keeps the space at identity and creates the named vectors
    with `R*u #Ru` followed by `B*Ru #BRu`. It does not execute bare `R` or `B`.
  A story may describe the moving `u` as being at the algebraic state `Ru` or
  `BRu`, but those names are not variables unless the comparison form actually
  declares them.
- Identity-space comparison preserves the declared source object. `A*x #Ax`
  leaves `x` unchanged and creates a separate `Ax`, so a later dot product,
  angle, distance, or before/after comparison can use both visible objects. A
  script must not mutate, hide, or replace the only `x` and then refer to an
  unavailable "original x". Bare `A` remains the separate transform-space form.
- A finite sample never proves a universal quantifier. A representative
  `dot(x, Ax)` may illustrate one positive quadratic energy, but a lesson that
  concludes positive definiteness for every nonzero vector must also provide a
  valid all-vector proof such as completing the quadratic form into positive
  squares or an equivalent eigenvalue/minor argument.
- Prettier should not add `#name` to multiplication by default.
- If the user wants a new variable, they write the `#name` explicitly.
- Matrix times matrix must work, not only matrix times vector.
- A numeric scalar may multiply a vector on either side. `3 * v1` and `v1 * 3`
  update the existing vector in place and animate continuously from its current
  coordinates to the scaled coordinates.
- Adding `#name` to a scalar-vector product keeps the source vector and creates
  a separately named result. For example, `3 * v1 #tripleV1` reveals a new
  scaled vector while `v1` remains available.
- Scalar values may be integers, decimals, negatives, or fractions. Multiplying
  by a negative scalar reverses the vector direction through the origin.
- AI-generated notebooks should use scalar multiplication syntax instead of
  redeclaring the scaled coordinates, because redeclaration hides the operation
  the learner is meant to see.
- AI-generated stories must also announce the operation after its operands are
  visible and immediately before the multiplication line. A concept heading is
  not enough. The canonical beat is `show operands -> operation-specific
  caption -> multiplication -> checkpoint/result observation`, for example:

  ```text
  1, 1  #v@
  // 이제 {{v}}에 3을 곱해 방향은 유지하고 길이를 3배로 늘린다
  3 * v
  checkpoint
  ```

  The cue caption remains visible while the vector changes, so a screen-only
  learner knows what caused the motion. Use a checkpoint before the operation
  only when the unchanged input itself needs learner-controlled inspection.
- Multiplication lines execute by default because they describe an animation
  action, but prettier should not add a visible `@` unless the user wrote it.

## Vector Addition And Linear Combinations

Accepted examples:

```text
v1 + v2  #sum
3 * column1 + column2  #b
2 * v1 - 1/2 * v2 + v3  #result
-v1 + 2 * v2  #reflected
```

Rules:

- A linear-combination line accepts two or more vector terms joined by `+` or
  `-`. Each term may have a scalar on either side of `*`; an omitted scalar is
  `1`, and a leading unary minus such as `-v1` is coefficient `-1` rather than
  a note or unsupported expression.
- With `#name`, the source vectors remain visible and the calculated result
  reveals from the origin under the new name.
- Without `#name`, the first vector is updated in place to the combination
  result.
- All terms must be known vectors. The output dimension is the largest vector
  dimension among the terms, with missing coordinates treated as zero.
- A reusable result is declared by the calculation alias itself, for example
  `b1 + b2 #bsum`. A `sum(b1, b2)` measurement is a live teaching overlay and
  does not declare a vector named `bsum`; later expressions such as
  `3/2 * bsum #scaled` therefore require the aliased calculation first.
- Prettier normalizes spacing and omits visible coefficient `1` where possible,
  including canonicalizing a leading coefficient `-1` as `-v1` rather than
  `-1 * v1` or a `#` note.
- AI-generated column-picture explanations should calculate the target vector
  with a linear-combination line instead of declaring its final coordinates in
  advance.
- In `Ax=b`, `b` is the given right-hand side and `x` is the unknown solution.
  A row picture lives in x-y variable space, so the components of `b` are line
  constants, not a vector or point to draw in that same plane. The only solution
  geometry there is the intersection `x`.
- A combined row/column story may stage one target declaration as
  `point(4, 1) #b!`. While the row picture is active, mention `b=(4,1)` only as
  ordinary caption prose and do not tag or reveal it. After the scene transition,
  `b +` reveals the same declaration as a point target for the column picture.
- When a conclusion names an entire span, column space, or null space that is a
  drawable line or plane, AI-authored notebooks must draw that set and keep it
  visible through the checkpoint. In 3D the XY plane is authored as
  `z = 0 #ColA@`; temporary axis equations such as `x = 0` and `y = 0` are not a
  substitute for the plane.
- The zero vector has no direction. Explanations should say that a zero column
  contributes no new direction rather than calling it a zero-vector direction.
- Matrix columns and input basis vectors must not be conflated. If `c3` names
  the third column, it equals `A * e3`; for `A = diag(1,1,0)`, `e3` is
  `(0,0,1)` while `c3` is `(0,0,0)`. AI visual QA must verify this relationship.
- Column vectors and the target vector are primary teaching geometry. They must
  be visible while the column picture is explained; only coefficient/solution
  helpers that the learner never needs to inspect may use `!`.
- In a column picture, a solution tuple such as `x=(1,2)` is coefficient data,
  not another vector to reveal from the origin. AI-authored notebooks state it
  as ordinary caption algebra without `{{x}}`, then show its effect through the
  columns and the live sum: `sum(c1, c2)`, checkpoint, and an in-place operation
  such as `c2 * 2`. They do not use `x +` to explain coefficients.
- This is a directing rule, not a reserved-name rule. A declared vector named
  `x` remains valid geometry in a lesson where `x` is actually the spatial
  vector being studied.

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
- `!` is reserved for never-inspected computational helpers. Do not apply it to
  a column vector, basis vector, target, transformation input, caption-named
  operand, or any geometry that carries the explanation.
- Visual clutter is not a reason to hide the primary teaching objects. Remove
  stale context, shorten labels, disable coordinates, stage reveals, or use
  `clear` instead.

## Captions With `//`

`//` creates a simulation caption.

Example:

```text
// First we create two lines.
2x + 3y = 4  #L1
4x + 2y = 5  #L2
// {{L1}}과 {{L2}}의 교점이 해가 된다. 2s
// -
```

Rules:

- Caption lines display in the scene while the notebook animation reaches that
  part of the script.
- Every viewer-facing narration line must begin with `//`. A deliberate
  two-line caption within one animation beat uses a literal `\n` after that one
  prefix, while two separate narration beats use two lines that each begin with
  `//`. A continuation sentence must never be left as bare natural language,
  because it is not caption syntax and may be interpreted as panel-only prose.
- Captions are for the viewer watching the simulation.
- Captions are not variable declarations.
- Captions should remain `//` after prettier.
- Captions may persist until the next caption line changes them.
- `{{name}}` is a semantic reference to a declared notebook variable inside a
  caption. The braces are not shown in the scene; the variable name appears as
  a compact tag using the same color as its vector, equation, matrix, or
  calculated result.
- `{{name:expr}}` and `{{name:value}}` render one inline math chip containing the
  colored identity and the declaration's actual equation/value, such as
  `R1 = 2x + y = 3`. Use this when the expression itself matters; do not write
  the tagged name and manually repeat a potentially stale copy of its value.
- Variable identity and emphasis are separate. Every caption occurrence that
  refers to a declared notebook object uses `{{name}}`, including repeated
  mentions and variables embedded in algebra such as `2 * {{c1}} + {{c2}}`. A
  variable reference must not lose its tag merely because it appeared earlier
  in the sentence.
- Caption-tag lookup only uses mathematical object declarations. Panel status
  abbreviations such as `B` for `basis` or `AX` for `axes` must never shadow a
  user variable with the same case-insensitive name.
- Caption tags are identity/presentation only. They do not emphasize, declare,
  reveal, focus, calculate, or otherwise execute the variable. The tagged
  object must still be declared and visible at the checkpoint.
- `**text**` adds restrained semantic emphasis inside a caption. It removes the
  marker characters in the scene and uses strong weight plus a quiet underline;
  it must not pulse, glow, resize the whole caption, or compete with variable
  color tags.
- AI-authored explanatory stories use that emphasis when a caption has a clear
  scan anchor: a concept name, changed matrix entry, pivot, rank, operation
  result, or final conclusion. Emphasize the shortest useful phrase, normally
  one per caption. Do not leave every important caption visually uniform, and
  do not bold an entire sentence merely to satisfy the rule.
- Emphasis may contain `{{name}}` references or backtick math. Those nested
  tokens keep their normal variable colors and math-chip rendering; the engine
  must never expose their braces or backticks as raw caption text.
- Backticks group symbolic text as one inline math chip. Use them for meaningful
  tuples, coefficient assignments, or formulas such as `` `x=(2,-1)` `` and
  `` `2 * {{c1}} - {{c2}}` ``. Declared-variable tags remain inside the chip and keep
  their scene colors. A math chip groups notation; it is not prose emphasis.
- Scalar-vector multiplication inside a caption math chip always uses an
  explicit spaced `*`, for example `` `a * {{v1}} + b * {{v2}} = 0` ``. Do not
  concatenate a scalar symbol directly against a colored variable tag because
  the result reads like one variable name rather than multiplication.
- Exact unit coefficients are simplified unless multiplication by `1` itself is
  the concept being taught. Write `` `{{c1}} + {{c2}}` `` rather than
  `` `1 * {{c1}} + 1 * {{c2}}` ``, and write `-{{c2}}` rather than
  `-1 * {{c2}}`. Non-unit and symbolic coefficients still use the explicit
  spaced `*` form.
- Important explanatory captions may use `**text**` for one short changed
  quantity or conclusion when that improves scanning. Variable tags, inline
  math, and semantic emphasis are three independent channels.
- Scene captions wrap automatically inside the renderer's label-safe maximum
  width. A literal `\n` inside one `//` line remains the way to request an exact,
  stable semantic break without creating another animation cell. Use it to
  separate a short claim from its consequence, not to micromanage ordinary line
  wrapping or turn captions into paragraphs.
- Unknown tags remain visible with a neutral dashed treatment so spelling/order
  mistakes are detectable instead of silently disappearing.
- AI-authored captions tag every semantic reference to a declared notebook
  object and leave ordinary prose or undeclared algebraic symbols untagged.
  Caption prose emphasis uses `**text**`; scene-object emphasis uses `focus`.
- A trailing duration such as `2s` controls how long the caption step takes
  during playback.
- Without an explicit duration, the engine increases caption dwell with visible
  text length. Long explanatory sentences must not flash by at the same speed
  as short callouts. A caption owned by a following `checkpoint` gets a short
  one-second introduction, then uses the checkpoint itself as unlimited reading
  time.
- `// -` clears the current caption from the scene.
- Captions should not clutter the panel status cards.

## Built-In Notebook Examples

The quick visual example buttons should populate the notebook with complete
mini stories, not only raw equation lists. Their scripts and lesson contracts
are owned together in `src/notebook/examplePresets.js`; `App.jsx` only renders
the returned collection and sends the selected script through the normal preset
path.

Rules:

- Each quick example has a five-part lesson contract: claim, visible evidence,
  representation, announced operation, and final state. The script is the
  shortest editable story that satisfies that contract.
- Intersection examples reveal equations first, announce the solve, and use an
  explicit `solution(...)` cell whenever the intersection point, coincident
  line, 3D point, or plane-intersection line is the evidence. They do not append
  unrelated vector measurements or matrix transforms after the system claim.
- Transformation examples stage live area or volume before a rank drop,
  announce the exact matrix action, and finish on the collapsed output. A
  dependent-vector example visibly creates the scalar multiple before claiming
  dependence.
- The compact matrix-transformation starter begins with the standard basis and
  identity relative grid already visible, then applies one shear matrix so the
  two basis arrows and the full grid move together. Its final caption stays
  short enough that both transformed basis endpoints remain readable.
- Examples may include equations, captions, vectors, matrices, references,
  durations, measurements, checkpoints, hard focus, and 3D inspect stops.
- Example coverage should include not only line/plane intersections, but also
  rank drop, null space, projection, dependent vectors, and area/volume
  collapse so users can see dimensions disappear as animation.
- A separate numbered visual course sits below the quick visual examples. Its
  eight outer lectures follow the curriculum in
  `docs/specs/visual-course.md`, while reusing the dependency-ordered
  foundation stories for vectors, combinations, bases, matrix columns,
  transformations, systems, subspaces, and eigenvectors. Matrix lessons must
  connect symbolic work to the matching visible evidence before moving on to
  area, systems, or subspaces. Each button loads a complete mini-lesson with a
  cue before the operation, concept-specific evidence, semantic caption
  emphasis, learner-paced checkpoints, and a final conclusion that remains on
  screen.
- The visual course is presented as a hierarchy rather than one flat preset
  list. Numbered lectures group related mini-lessons; opening one lecture shows
  its one-sentence summary and local lesson numbers such as `1.1`, `1.2`, while
  the others remain compact. Grouping changes navigation
  only: every inner lesson still loads the same editable notebook script
  through the normal example path.
- Clicking an example should load the notebook script and play it from the
  beginning so captions and animated changes are visible.
- Before loading an example, clear the previous notebook cursor, caption,
  visible vectors, measurements, and solver display. Example playback must start
  from a clean 0% state so the old notebook and the new notebook never appear
  mixed for a frame.
- Examples should demonstrate the existing notebook language instead of using a
  separate legacy equation-only path.
- Keep example scripts compact enough to edit after insertion.
- The full matrix-transformation story remains available in the quick examples.
  The empty-notebook placeholder and Tab completion instead use one compact
  direct-entry starter: `2d`, vector `3,4`, the 2x2 matrix rows `0 1` / `1 0`,
  then bare `A` so the declared matrix actually runs. This keeps the first
  action obvious without opening a large suggestion list or filling the editor
  with a whole lesson.

## AI Prompt Copy

- The notebook header provides a compact AI prompt copy action. Copying it
  includes the current notebook as editable context but never executes or
  mutates the notebook.
- The copied document assigns the AI the role of collaborative Flow Math visual
  lesson producer and the user the role of creative director. An explicitly
  empty request starts an intake turn: one short role introduction and one
  compact question asking for whichever concept, problem, equation, or rough
  visual direction the user already has. When a current notebook is included,
  that question asks what to change and what to preserve instead. A sufficiently
  concrete request skips intake and produces a draft immediately; clarification
  is reserved for an ambiguity that would materially change the mathematics or
  representation.
- Drafting and revision are one continuous workflow. A draft/revision response
  contains one complete paste-ready `text` block followed by one short feedback
  invitation in the user's language. Feedback edits the requested parts while
  preserving correct notebook work, reruns the complete policy QA, and returns
  the whole updated script rather than a patch. The invitation is conversation
  text and never becomes a notebook caption.
- Markdown specs remain the product source of truth. The concrete copied-prompt
  policy is assembled in `src/notebook/promptPolicy.js` from domain modules in
  `src/notebook/prompt/`; `buildPrompt.js` owns locale/request framing, while the
  thin `src/App.jsx` wrapper supplies the current notebook and runtime camera,
  zoom, timing, and label-collision values.

### Policy architecture

- Each behavioral rule has one stable ID and one authoritative definition.
  Other sections, precedent cases, and final QA refer to that ID instead of
  restating the complete rule.
- Rule levels are explicit: `[MUST]` prevents mathematical or engine errors,
  `[SHOULD]` is the normal directing choice, `[DEFAULT]` applies when the
  request is silent, and `[MAY]` is optional.
- Policy order is: priority and output contract, core invariants, engine state
  model, universal scene grammar, concept patterns, camera/framing,
  timing/checkpoints/ending, syntax forms, minimal precedents, generation
  algorithm, and ID-based final QA.
- Principle and exception stay in the same rule block. For example, the
  no-final-checkpoint default contains its explicit free-inspection exception.
- Final QA is a compact list of rule IDs. It must not duplicate the full policy
  prose.
- Precedents are intentionally retained because they encode real renderer and
  teaching failures. Keep one minimal representative case per failure family,
  label it with the governing rule ID, and say to copy the principle rather
  than the example numbers. Do not accumulate a second example when the same
  rule already covers it.
- Do not impose a rigid scene/checkpoint count. Prefer the shortest story that
  proves the requested claim, but add a separate beat whenever distinct
  concepts require different visible evidence.

### Required coverage

- The engine state model is the single prompt authority for base graph field,
  `field board` versus `field graph`, true dimension versus camera view,
  `clear`, `space reset`, bare matrix
  application, matrix-card reveal, visibility, focus, setup presets, and the
  absence of automatic camera movement.
- Core invariants cover declaration order, shape and dimension correctness,
  verified calculations, visible evidence, and the one-representation rule
  that separates transform-space from identity-space comparison.
- Matrix syntax is a core invariant, not a precedent: entries are separated by
  whitespace, the alias is attached to the first numeric row, and a standalone
  `#A` line or comma-separated rows must be rejected by prompt QA as a matrix
  declaration.
- Universal staging distinguishes a concept introduction from an adjacent
  operation cue and applies `operands -> cue -> action -> observation` only to
  important visible changes. Setup, focus, cleanup, and ordinary camera-only
  changes do not require a cue. The cue describes the exact upcoming action and
  what to watch; the observation after motion owns the conclusion.
- Concept patterns cover matrix-vector action, sequential transforms, row and
  column pictures, determinant, rank drop, column space, nullspace,
  linear independence/dependence, Gaussian elimination, and solver-owned intersections. These
  patterns preserve all current mathematical and visual requirements in their
  matching sections instead of repeating them in camera or QA sections.
- A 2D independence story uses nonzero determinant area as visible proof; it
  does not infer independence merely from two arrows looking different. A
  dependence contrast uses zero determinant and may then cue an in-place scalar
  change that lands one vector on the other. Only the current pair is declared
  visibly in each scene.
- Column-picture coefficient motion prefers a live `sum(...)` followed by
  in-place scaling when the moving combination is the lesson. Row-picture RHS
  data stays out of x-y solution geometry.
- Determinant scale uses a live basis determinant before and through the matrix
  action. A 3D rank drop uses that volume as collapse evidence, normally with
  the absolute grid off, the relative grid on, and synchronized
  `A with view 2d` when a head-on finish improves readability. `z=0` remains a
  separate column-space conclusion, not substitute motion.
- A nullspace disappearance claim ends with a real representative-vector
  collapse. The prompt offers a minimal visual proof by default and adds the
  algebraic solution scene only when requested or educationally necessary. Its
  camera QA evaluates the surviving output: an XY-plane conclusion normally
  finishes with synchronized `A with view 2d`, while a depth-dependent or
  oblique proof remains in 3D.
- Camera calibration remains detailed because the engine has no auto-framing,
  but all runtime-derived numbers live in a final reference block after the
  framing algorithm. Positions, angles, distances, field of view, zoom clamps,
  safe extents, and collision attempts come from renderer constants rather than
  a second hand-maintained set.
- Framing simulates final displayed and derived geometry, reserves label
  margin, and places zoom-out before the expanding operation. It uses current
  mutated values rather than original declarations. Smaller zoom values reveal
  more space; a zoom above `1` cannot fix impending clipping. A primary result
  that requires manual user zoom to discover fails QA.
- Captions use `{{name}}` for every semantic occurrence of a declared notebook
  object, including repeated mentions. Tags carry variable identity and color,
  while `**text**` and `focus` independently carry caption and scene emphasis.
  Undeclared future results and symbols that exist only as ordinary algebra are
  not tagged.
- Checkpoints preserve the full evidence until Next. The normal ending leaves
  the final mathematical conclusion and evidence visible without a trailing
  checkpoint, cleanup, or generic end caption. The runtime still presents that
  natural ending as a final review stop with Previous/Next review, segment
  Replay, view restore, and caption Hide/Show controls; authors must not add a
  checkpoint merely to obtain those controls.
- The syntax section documents forms only. Directing decisions belong to rule
  blocks, and the generated answer remains exactly one paste-ready `text` code
  block with no surrounding prose.

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
- The most recent explicit true-dimension command supplies ambient dimension for
  equations whose omitted coefficient is zero. Under true `3d`, `x=0`, `y=0`,
  and `z=0` are the YZ, XZ, and XY coordinate planes. Under true `2d`, `x=0`
  and `y=0` are lines. A camera-only `view 2d` does not alter this meaning.
- A 3D block containing `x=0` and `y=0` has z free, so its native solution is
  the entire z-axis. It must not be downgraded to a 2D origin point merely because
  neither equation contains a written `z` term.
- If any equation uses `z`, the notebook dimension should become 3D.
- If equations are 2D only, the scene should use a true 2D coordinate system.
- Solvers should show rank, augmented rank, solution dimension, and solution
  coordinate when available.
- Automatic solution geometry is a separate scene setting and defaults off.
  Declaring equations therefore draws their lines or planes without also
  drawing an inferred point, line, or common plane. Solver facts remain
  available in the panel.
- The equation solver owns solution geometry. `solution(R1, R2) #sol@` selects
  the native result of the currently visible named equations, assigns it a
  presentation alias, and smoothly reveals it even while automatic solution
  display is off. It does not create a new point or accept authored coordinates.
- `focus -` ends focus emphasis only. An explicitly selected solution remains
  visible until its selection is removed or `clear` hides the field.
- `solution(...)` accepts two or three declared equations. Use it only when those
  equations are the complete visible system whose result is being discussed.
  Depending on the solver result, the selection may target a unique point, a
  common line, or a common plane.
- AI-authored row pictures must use `solution(...)` instead of redeclaring the
  solver result as `point(x, y)`. Manual point syntax is reserved for independent
  targets or coordinates that are not already generated by the equation solver.
- If the 2D solution is a whole line, the status readout should show a
  representative equation such as `3x + 2y = 3` when it can be derived;
  otherwise it may fall back to the generic solution-line label.

## Vectors

Accepted examples:

```text
1, 2
3, 4, 5
v1 = 2, 3
point(4, 1)  #target@
```

Rules:

- Comma-separated numeric values create vectors.
- Two values create a 2D vector.
- Three values create a 3D vector.
- Vector dimension comes from the number of comma-separated values, not whether trailing values are zero. `1, 0, 0` is still a 3D vector.
- A visible zero vector renders as a compact colored marker and label at the
  origin because it has no arrow direction. It remains a vector value, not a
  point declaration. A hidden zero vector remains hidden as requested.
- A single number alone is not a vector and should not create a matrix.
- Vectors should appear in the scene as soon as their line is executed.
- `point(x, y)` and `point(x, y, z)` declare a vector-compatible coordinate
  value with point-only scene presentation. The named value may be referenced by
  calculations, captions, focus, removal, and later reveal exactly like a vector,
  but its normal scene geometry is an endpoint marker and label without an arrow
  from the origin.
- Use point presentation for a destination, target, or solution coordinate when
  the lesson should compare another construction against that endpoint. Do not
  use it for an operand whose direction and magnitude are being taught.
- Dragging a vector in the scene should update the corresponding notebook line.
- When auto-updating a dragged vector line, use the normal variable syntax:
  `x, y  #v1`, not `v1 = x, y`.

## Matrices

Accepted examples:

```text
1 0  #ScaleY
0 2

1 0 0  #A
0 1 0
0 0 1
```

Rules:

- A matrix row requires at least two numeric values separated by whitespace.
- Matrix entries use whitespace, never commas. Comma-separated numeric input is
  vector syntax and cannot serve as a matrix row.
- A matrix alias such as `#A` is a suffix on the first numeric row of the block.
  A standalone `#A` line is a panel note, not a declaration or a name for the
  following rows.
- One number alone should not be parsed as a matrix row.
- Matrix blocks are consecutive numeric rows with the same width.
- A matrix should be considered complete only when enough rows exist for the
  detected shape, when it reaches the end of the notebook, or when the block is
  separated from following text by a blank line. A square block is complete as
  soon as its row and column counts match; use a blank line after non-square
  blocks to make their boundary explicit.
- Avoid re-running animation on every partial keystroke. Re-run when the matrix
  becomes a complete block.
- Matrix execution should be smooth and scrubber-driven.

### Matrix Row And Column Extraction

Accepted examples:

```text
col(A, 1)  #c1@
row(A, 2)  #r2@
```

Rules:

- `row(A, n)` and `col(A, n)` use one-based indices and require `A` to be an
  already declared matrix.
- The result is a normal vector value: it can be focused, calculated, hidden,
  restored, or referenced by captions and measurements.
- Revealing the result also reveals A's card and outlines the source row or
  column in the new vector's color, with the vector name attached to that slice.
- Use extraction instead of manually copying a matrix row/column into a second
  coordinate declaration. This preserves the visible relationship to A.
- An extracted row is a coefficient vector, not a row-picture equation. An
  equation still needs a right-hand side, for example `2x + y = 3 #R1`.

## Measurements

Accepted examples:

```text
sum(v1, v2)
dot(v1, v2)
v1 * v2
det(v1, v2)
det(v1, v2, v3)
```

Rules:

- `sum(a, b)` draws the geometry of vector addition as a relationship: keep both
  source vectors at the origin, translate `b` to the tip of `a`, draw the muted
  parallel guide from the tip of `b`, and draw the result arrow from the origin
  to `a + b`. Use the original operand colors for the translated/helper edges
  and a separate semantic sum color for the result.
- A sum relationship remains live while either source vector changes. For a
  coefficient-focused story, show `sum(c1, c2)` at unit coefficients first,
  pause/checkpoint, then execute an in-place operation such as `c1 * 2`. The
  translated helper and result endpoint animate with `c1`, making the sum move
  from its initial endpoint to the target.
- Place the sum label outside the result geometry, preferring the right side of
  the result endpoint and flipping left when the viewport or another label
  blocks that side. Do not center the wide label over the source arrows.
- A coefficient tuple does not accompany this animation as a separate arrow.
  The caption gives the algebraic tuple and the moving sum endpoint is the
  geometric evidence of what those coefficients do.
- Use a named scaled result such as `2 * c1 #p1` followed by `sum(p1, c2)` only
  when the original and scaled vectors must remain visible simultaneously or be
  reused later. Do not introduce `p1`/`p2` when mutating the source in place is
  the intended lesson.
- A target may be declared as `point(4, 1) #b@` so the sum result arrow lands on
  a distinct target marker instead of being obscured by a second target arrow.
- `a + b #result` remains the calculation form when the result must become a
  named vector for later expressions. `sum(a, b)` is the teaching overlay.
- `dot(a, b)` draws and stores a dot product relationship.
- `a * b` is also treated as a dot product when both `a` and `b` are known
  vectors. Matrix-vector, vector-matrix, matrix-matrix, and equation-matrix
  products remain calculations/transforms.
- `det(a, b)` draws area in 2D.
- `det(a, b, c)` draws volume in 3D.
- `i`, `j`, and `k` are built-in live basis targets for measurements. They do
  not require notebook vector declarations. Authors turn `basis on` before
  measuring them so the learner can see the measured arrows.
- When a measurement uses built-in `i`, `j`, or `k`, the notebook syntax overlay
  colors those tokens with their basis identity colors and the rail shows the
  line as a semantic measurement cell rather than plain text.
- A determinant-as-scale story keeps one basis measurement alive across the
  transform. In 2D it shows `det(i, j)` at identity (area `1`), optionally
  checkpoints that input if it needs inspection, then executes the bare matrix
  and leaves the same measurement at its new area. In 3D the equivalent evidence
  is `det(i, j, k)` and volume `1` before transformation. `dot(i, j)` is not a
  substitute for determinant evidence; the final measurement may finish through
  the system completion state instead of another checkpoint.
- When `det(a, b)` is numerically zero, the source vectors and zero-area label
  remain visible, but the collapsed parallelogram face and its translated
  boundary are suppressed. Drawing those coincident helper edges as an
  extended ray misrepresents them as additional geometry.
- Measurements are scrubber-local: a `sum(...)`, `dot(...)`, or `det(...)` line should not
  appear in the scene until the notebook scrubber reaches that line.
- Measurement UI and notebook text must stay synchronized:
  - creating through scene UI should add/update the notebook expression;
  - editing/removing the notebook expression should update/remove the scene UI.
- A measurement created through scene UI is inserted immediately after the
  notebook cell at the current execution cursor, not appended to the end of the
  document. Multi-line cells such as matrix blocks remain intact; insertion is
  after the whole active cell.
- After that insertion, playback state advances only through the newly inserted
  measurement cell so it appears in the current scene immediately. Cells that
  were still ahead of the cursor remain unrevealed.
- If a measurement line is deleted, the corresponding scene measurement should
  disappear.
- Measurement labels should not overlap vector labels or cover the measured
  construction when an outside placement fits the viewport. A collapsed 2D
  area keeps its zero label below the collapsed line.

## Prettier Rules

Prettier should help the user without hiding intent.

- Normalize equation spacing.
- Preserve trailing durations such as `#L1 3s` and caption durations such as
  `// caption 2s`.
- Keep equation durations line-local even when several equations are grouped
  into one visible notebook state.
- Add automatic `#name` for declarations.
- Add automatic `@` when first assigning an automatic name to an unnamed
  shorthand vector. Preserve the absence of `@` on an already named vector so
  an explicitly declaration-only line stays declaration-only.
- Do not add automatic `#name` to multiplication actions.
- Keep `//` captions as `//`.
- Convert natural language to `#`.
- Preserve a syntactically recognizable calculation line when one of its
  operands has not yet been declared or has the wrong shape. Do not silently
  convert formula-shaped input into a panel note. If an older prettier pass
  produced `# expression #result`, restore it as a calculation once all named
  operands are known vectors or matrices.
- Preserve user-specified names and hidden markers.
- Add two spaces before inline variable tags when visually useful.

## Editor Mark Interaction (Not Notebook Syntax)

Notebook gutter marks are playback cue controls only. They never open a variable
rename dialog through double-click, repeated click, or `F2`; authors rename a
variable by editing its declaration and references directly in the notebook.

## Scrubber Semantics

- At 0%, nothing has executed yet.
- Restarting playback from 0% must clear stale playback/camera transition state
  before the first frame, so a second run is deterministic and does not reuse
  the previous run's active cell or camera transition.
- Slightly after 0%, the first executable line appears.
- Lines appear progressively as the scrubber passes them.
- During an executable calculation, matrix application, measurement, or solve
  segment, the scene derives one transient current-operation readout from the
  active parsed cell. This is playback feedback, not notebook syntax: authors do
  not add a marker for it, and direct scrubbing must reproduce the same readout
  for the same active segment.
- Clicking a notebook line/variable mark is a cue action, not a play action. It
  cancels active playback, moves the editor caret to that row, restores the
  deterministic scene immediately before that row, and remains paused. The
  row itself and every following row stay unrevealed until the learner presses
  Play. While paused, the selected gutter mark changes into a compact Play
  control whose centered triangle stays fully inside the mark: clicking the same
  mark a second time starts from that row. The header Play action does the same.
  Clicking a different mark moves the cue, while any
  non-gutter pointer action or notebook edit clears it. Playback then continues
  from that cued cursor to the selected segment's learner stop instead of
  restarting the segment from its beginning.
- Matrix transformations happen within the matrix block's time interval.
- The speed control label is authoritative: the default `0.5` slider value is
  shown and played as `1x`, so a `1s` suffix should take about one second at the
  default speed.
- Pressing run should animate the scrubber from its current meaningful point to
  100%.
- Playback should move the scrubber continuously through the notebook. Do not
  restart ease-in/ease-out at every line, because that makes the progress feel
  like repeated stop-and-go jumps.
- If a matrix changes while editing, including through a paste inside the
  existing matrix block, replay from the relevant matrix segment and continue
  downward, not from notebook zero and not only to the matrix declaration.
- Playback implementation should be driven by a single ordered list of cursor
  segments. Explicit durations create timed segments; declaration-only or
  untimed gaps use compact travel time so the scrubber keeps moving smoothly
  without spending teaching time on invisible setup lines.

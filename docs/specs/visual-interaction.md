# Visual And Interaction Specification

## Camera

- View buttons change camera direction without unexpectedly changing zoom.
- In notebook/system mode, auto camera is the default:
  - if the active content is 1D, settle into a 1D view;
  - if the active content is 2D, settle into a front 2D view;
  - if the active content is 3D, settle into the standard 3D view.
- Auto camera should allow manual dragging, then gently return to the dimensional
  view when the user releases.
- Camera lock modes are separate:
  - full lock;
  - zoom lock;
  - camera/orbit lock.
- Even when orbit is locked, zoom can remain available if only camera/orbit lock
  is active.

## Dragging And Snapping

- Dragging vectors should feel direct.
- Shift-drag in 3D should snap toward visible axes when near them.
- Integer snapping should be toggleable.
- Snapping hints should not cover labels. Prefer highlighting existing coordinate
  values over adding bulky floating labels.
- When a vector is dragged, the corresponding notebook line should update using
  `values  #name`.

## Labels

- Labels should not overlap when possible.
- Coordinates may be hidden, but the symbol (`i`, `j`, `k`, `v1`) should remain.
- In 2D, labels should show only two coordinates.
- In 1D, labels should show only one coordinate.
- Scene labels should use concise text and avoid repeating controls that already
  exist in the panel.
- In system/notebook mode, equation lines and planes should have scene labels
  like vectors. With coordinate display on, show the `L`/`P` name plus the
  compact equation; with coordinate numbers hidden, keep only the `L`/`P` name.
- Solution geometry should also be labeled: unique points, common lines, and
  common planes all need a visible scene label. A 3D intersection line must keep
  its label even when it is horizontal or passes near the origin.

## Axes, Basis, And Grids

- Absolute axes are the fixed reference axes.
- Relative axes are the transformed/current `i`, `j`, and `k` directions.
- Relative axes are controlled by the relative-axis toggle and per-axis
  visibility only. They must not depend on the vector/basis display toggle or
  on rank-independence filtering; nonzero transformed directions remain visible.
- Basis vectors are editable basis objects.
- Absolute grid is the untransformed reference grid.
- Relative grid is the transformed/current grid.
- These toggles must work in both transform mode and system/notebook mode.
- Relative grid strength should be adjustable because strong transformed grids
  can overpower equations and planes.
- In system mode, equations should not hijack the axis toggle.

## Measurements

- Dot products, areas, and volumes are selectable relationships.
- Newly revealed measurement geometry and labels should fade/reveal smoothly,
  matching the way notebook vectors appear.
- Hovering a vector label can reveal measurement actions.
- Clicking a measurement action starts a connection gesture.
- Clicking another compatible object completes the measurement.
- Clicking empty scene space cancels an unfinished connection.
- Existing measurements should expose delete/hide controls on hover.
- Measurement lines should use their semantic color:
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
- Newly visible equation lines, planes, solution highlights, and solution points
  should reveal smoothly rather than popping into the scene.
- Notebook panel marks, solver facts, and derived equation/matrix values should
  reveal smoothly instead of popping in abruptly.
- Animation focus mode should let the user hide panels, ads, and dense scene UI
  so only the scene plus the animation scrubber/playback controls remain. It
  must be reversible without losing the previous panel-open state.
- Plane intersections should be visible but not overly thick.
- With one plane, do not draw fake intersection/tangent lines.
- With two 3D planes, draw the intersection line when it exists.
- With three or more planes, show the solution point/line/plane as appropriate.
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

## Responsive Layout

- Desktop: scene left, control panel right.
- Mobile: keep the usable experience first, not a landing page.
- Panel controls must remain reachable without tiny tap targets.
- Avoid fixed widths that create horizontal clipping on mobile.

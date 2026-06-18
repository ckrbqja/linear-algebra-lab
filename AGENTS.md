# Linear Algebra Lab Agent Guide

This file is the entry point for any agent working on this project.
Before changing code, read this file and the linked source-of-truth specs.

## Required Reading Order

1. `docs/specs/project-sot.md`
2. `docs/specs/notebook-language.md`
3. `docs/specs/visual-interaction.md`
4. `docs/specs/development-workflow.md`

If a request touches only one narrow area, still skim `project-sot.md` first,
then read the matching detailed spec.

## Project Intent

This is not a plain calculator. It is an animation-first linear algebra lab.
Users should be able to write math casually, watch objects appear and transform,
scrub the process, and understand what changed without reading dense UI text.

The main design principle is:

> The notebook describes the story; the scene animates the story.

Keep edits aligned with that principle.

## Source Of Truth Policy

- The Markdown specs under `docs/specs/` are the source of truth.
- When implementing a new behavior, update the relevant spec in the same change.
- If code and spec disagree, do not guess silently. Prefer updating both so they
  match the user's newest direction.
- Preserve the user's existing worktree changes unless explicitly asked to revert.

## Engineering Defaults

- Use the existing React + Three.js + Vite structure.
- Keep UI dense, direct, and tool-like. Avoid landing-page patterns.
- Prefer small, local changes in `src/App.jsx`, `src/styles.css`,
  `src/linearAlgebra.js`, and `src/i18n.js` unless a split is clearly needed.
- Use `pnpm run build` as the default non-browser verification.
- Do not run heavy browser screenshot verification unless the user asks for it
  or the change is visual enough that code/build checks cannot catch breakage.

## Current Important Product Areas

- Transform mode: matrix input, history/current state, vectors, basis, grid,
  relative grid, measurements, camera controls, URL state.
- System/notebook mode: free-form notebook parsing, equation/line/plane solving,
  variable declaration, matrix transforms, captions, scrubbed animation.
- Shared scene: axes, grid, transformed grid, vectors, labels, measurements,
  scalar constraints, camera presets, snapping and dragging.

## Commit Hygiene

- Do not commit unless the user asks.
- When asked to commit/push, check `git status` first and explain unrelated
  changes instead of reverting them.
- Generated `dist/` files are build artifacts; only include them if the repo's
  deployment flow intentionally tracks them.


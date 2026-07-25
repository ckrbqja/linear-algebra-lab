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

## Notebook Prompt Governance

Prompt work is specification work, not ad hoc copy editing. For every request
about a generated notebook script:

1. Classify the failure as engine syntax, engine state, mathematics, universal
   directing, concept pattern, camera/framing, or playback/ending.
2. Read the matching rule module under `src/notebook/prompt/` and the relevant
   section of `docs/specs/notebook-language.md` before editing.
3. Fix a general, obvious requirement as one rule invariant plus its rule-ID QA
   reference. Do not add a precedent for basic syntax, declaration order, shape
   validation, or a behavior already derivable from an existing rule.
4. Add or retain one minimal precedent only when it captures a distinct renderer
   or teaching failure that the general rule does not make sufficiently concrete.
   A precedent references its governing rule ID and says to copy the principle,
   not the example numbers.
5. Before adding a precedent, try in order: strengthen the existing rule, move
   its exception beside it, clarify the canonical syntax form, and add the rule
   ID to Final QA. Add the precedent only if those steps still leave a realistic
   ambiguity.
6. Keep each rule defined once. Final QA references IDs and never restates the
   full rule. Search for an existing definition before creating a new ID.
7. Verify the assembled prompt directly, check duplicate rule definitions, and
   run `pnpm run build`. Report whether the fix was a rule change, precedent, or
   engine change.

Prompt file ownership:

- `src/notebook/prompt/coreRules.js`: mathematics, syntax invariants, engine
  state, universal scene grammar.
- `src/notebook/prompt/scenePatterns.js`: concept-specific animation patterns.
- `src/notebook/prompt/cameraRules.js`: camera and framing.
- `src/notebook/prompt/referenceRules.js`: timing, syntax forms, minimal
  precedents, generation algorithm, Final QA.
- `src/notebook/prompt/buildPrompt.js`: locale/request framing and final document
  assembly.
- `src/notebook/promptPolicy.js`: composition only; do not put rule prose here.
- `src/App.jsx`: runtime values and UI wiring only; do not put prompt prose here.

## Visual Lesson Agent Protocol

This protocol is repository-owned agent memory, not copied prompt content.
Whenever a request creates or changes a built-in example, visual lecture,
curriculum, or long notebook teaching script:

1. Read `docs/agent/visual-lesson-quality-loop.md`.
2. Check `docs/agent/visual-lesson-cases.md` for matching verified failures.
3. Write the lesson contract (claim, evidence, representation, operation, final
   state) before writing notebook cells.
4. Run `pnpm run validate:lessons`, then `pnpm run build`.
5. For any visual or behavioral change, replay the changed lesson in the real
   browser, inspect console output and the relevant scene/layout, repair the
   smallest owning layer, and replay after the repair.
6. Add a durable failure case only when execution reveals a new reusable lesson
   that is not already obvious from the specs. Do not log ordinary one-off typos.

Do not replace this loop with “ask the model to review itself.” The critic pass
must receive actual parser, build, browser, or screenshot evidence.

## Engineering Defaults

- Use the existing React + Three.js + Vite structure.
- Keep UI dense, direct, and tool-like. Avoid landing-page patterns.
- Prefer small, local changes in `src/App.jsx`, `src/styles.css`,
  `src/linearAlgebra.js`, and `src/i18n.js` unless a split is clearly needed.
- Use `pnpm run build` as the default non-browser verification.
- Use `pnpm run validate:lessons` before the build when course/example scripts
  change.
- Do not run heavy browser screenshot verification unless the user asks for it
  or the change is visual enough that code/build checks cannot catch breakage.

## Current Important Product Areas

- Transform mode: matrix input, history/current state, vectors, basis, grid,
  relative grid, measurements, camera controls, URL state.
- System/notebook mode: free-form notebook parsing, equation/line/plane solving,
  variable declaration, matrix transforms, captions, scrubbed animation.
- Shared scene: axes, grid, transformed grid, vectors, labels, measurements,
  scalar constraints, camera presets, snapping and dragging.

## Deployment Shorthand

- If the user says `배포`, `배포 ㄱ`, or `deploy` without naming another target,
  treat it as a frontend production deployment of the current working tree.
- Run `pnpm run deploy`. The package script builds the current source and deploys
  `dist` to the Cloudflare Pages project `linear-algebra-lab` on production
  branch `main`.
- After deployment, confirm the newest Pages deployment is `Production` on
  `main`, then verify both its generated `pages.dev` URL and
  `https://flow-math.com/` return HTTP 200 with the newly built index asset.
- Deploy the backend separately with `pnpm run backend:deploy` only when the user
  explicitly requests the API/backend or the requested release includes backend
  changes. A deployment request never implies a commit or push.

## Commit Hygiene

- Do not commit unless the user asks.
- When asked to commit/push, check `git status` first and explain unrelated
  changes instead of reverting them.
- Generated `dist/` files are build artifacts; only include them if the repo's
  deployment flow intentionally tracks them.

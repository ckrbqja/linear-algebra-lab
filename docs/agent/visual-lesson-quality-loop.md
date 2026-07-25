# Visual Lesson Agent Quality Loop

This is repository-owned operating memory for agents that create or revise
notebook examples, visual lectures, curricula, or long teaching scripts. It is
not part of the user-facing copied AI prompt. A fresh agent with no private
memory should be able to follow this file and reproduce the project's expected
quality process.

## Why This Exists

A plausible notebook script is not necessarily a good lesson. High-quality
work in this project comes from a closed loop:

> inspect -> design -> author -> execute -> observe -> repair -> re-execute

Merely asking a model to reconsider its own text is not a substitute for
running the actual engine. The second pass must receive concrete evidence from
the parser, build, browser, and final scene.

## Mandatory Scope

Use this loop when a request does any of the following:

- adds or changes a built-in notebook example;
- creates a lecture, chapter, curriculum, or built-in visual course;
- changes a concept-specific visual explanation;
- repairs a lesson whose screenshot, camera, focus, timing, or final evidence
  is wrong;
- asks an agent to make AI-authored notebook output approach hand-tuned quality.

Small wording-only edits may stop after static validation and build when they
cannot change parsing, timing, layout, or the visible scene.

## Pass 1: Author

Before writing notebook code, make a compact lesson contract:

1. **Claim**: the one mathematical fact the learner should understand.
2. **Evidence**: the visible object or motion that proves that claim.
3. **Representation**: graph field, board field, or an intentional transition
   between them.
4. **Operation**: the exact change that must be announced before it animates.
5. **Final state**: what remains visible when playback completes.

Then inspect the real implementation and specs that own those concepts. Do not
author from remembered syntax alone. Reuse existing lesson primitives when the
claim is already demonstrated elsewhere.

Author the shortest story that proves the claim. A normal visible beat is:

```text
operands -> operation cue -> action -> observation
```

Setup, cleanup, and camera-only changes do not need narration. Symbolic matrix
algebra belongs on `field board`; coordinate evidence belongs on `field graph`.

## Pass 2: Critic

The critic pass is mandatory for a visual or behavioral change. It may be the
same model, but it must start from execution evidence rather than the author's
intent.

Collect this feedback packet:

- the exact generated notebook script;
- parser/editor status and any normalization the engine performed;
- build result;
- browser console errors;
- one screenshot or targeted DOM/layout measurement of the relevant scene;
- the final visible objects, caption, camera/view, and checkpoint state.

Classify every failure before editing:

- syntax or declaration order;
- mathematics or shape/dimension;
- engine state or visibility;
- teaching sequence or representation;
- camera/framing or label collision;
- playback/checkpoint/ending;
- surrounding UI layout.

Repair the smallest owning layer. A lesson-data mistake stays in lesson data;
a reusable renderer failure belongs in engine code/specs; a broad CSS selector
bug stays in CSS. Do not compensate for an engine defect by making every lesson
more complicated.

## Verification Ladder

Run the cheapest sufficient levels in order:

1. `pnpm run validate:lessons`
   - course structure and locale parity;
   - unique lesson IDs;
   - captions and non-destructive endings;
   - invalid matrix-card focus.
   - when board row-operation behavior changed, run
     `pnpm run validate:row-ops` first to verify replace/swap/scale inference and
     rejection of general matrices.
2. `pnpm run build`
   - imports, JSX, and production bundling.
3. Browser replay
   - required for geometry, animation, field changes, focus, checkpoints,
     camera, label placement, or course layout;
   - inspect console errors as well as the visible result.
4. Repair and replay
   - required whenever level 3 found a problem;
   - use a fresh browser session when separating a new regression from stale
     playback state.

Do not report completion after only generating code when the request is visual.
Do not keep taking screenshots once the authoritative visible state and console
result are confirmed.

## Stop Conditions

A lesson is complete only when all of these are true:

- the mathematics and dimensions are verified;
- each important motion has visible operands and a preceding cue;
- the chosen field matches the evidence type;
- primary geometry and labels fit the authored camera framing;
- the final claim and its evidence remain visible;
- static validation and build pass;
- browser replay has no newly introduced console error.

## Durable Memory Policy

Stable rules live in `docs/specs/`. Distinct renderer or workflow failures live
in `docs/agent/visual-lesson-cases.md`. Add a case only when it teaches a fresh
agent something not obvious from the specs. Record the symptom, root cause,
smallest fix, and verification signal. Do not turn the case file into a diary of
every run.

If a new case reveals a universal product rule, update the owning spec and keep
the case as a short pointer to the concrete failure. If it is only a one-off
content typo, fix it without adding permanent memory.

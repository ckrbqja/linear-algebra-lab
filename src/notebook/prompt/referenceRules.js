import { promptSection } from './section.js';

export function buildReferencePromptSections({
  captionDuration,
  captionMaxDuration,
  checkpointCaptionDuration,
  matrixRevealDuration,
  pauseDuration,
  setupSettleDuration,
}) {
  return [
    promptSection('[TIMING, CHECKPOINTS, AND ENDING]', [
      `- [DEFAULT][TIME-1] Untimed explanatory captions use a human reading dwell: about ${captionDuration} for a short sentence and automatically longer, up to about ${captionMaxDuration}, as visible character/word count grows. Keep one caption to one claim; do not force a dense sentence through in 1s. A checkpoint-owned caption gets a short engine-provided introduction of about ${checkpointCaptionDuration}, then the checkpoint remains as unlimited dwell. Matrix-card reveal is about ${matrixRevealDuration}; untimed pause is about ${pauseDuration}. Keep adjacent \`view\`/\`zoom\` and overlay settings contiguous: the engine treats them as one scene transaction, shares camera progress, switches all toggles together, and gives a toggle-only transaction one settle of about ${setupSettleDuration} before the next visual math reveal. Do not time every setting or add a manual pause solely for this settle.`,
      '- [MUST][TIME-2] Keep a caption, its evidence, optional focus, and the following checkpoint in one beat. The engine supplies the short checkpoint-caption introduction and the checkpoint supplies unlimited reading time, so do not add an explicit duration merely to delay the checkpoint controls. Add one only when the learner must finish reading before a distinct action begins.',
      '- [MUST][CP-1] Use `checkpoint` for a real conceptual understanding point that benefits from Previous, segment Replay, caption Hide/Show, and Next. Order is `caption -> reveal/operation -> optional focus -> checkpoint -> cleanup after Next`. Never remove evidence first, place `clear` immediately before it, or pair a pause or `inspect` with the same checkpoint.',
      '- [MUST][INSPECT-1] Use `inspect` as a weaker learner-controlled viewing stop when a 3D scene may need manual orbit but no conceptual review history is warranted. It preserves the scene and caption, shows the neutral free-inspection hint plus Next, and does not offer Previous, segment Replay, or caption Hide/Show. Prefer `inspect` over `checkpoint` for “rotate and look” only; omit it when the fixed view or an authored `orbit 6s` already makes the evidence unambiguous.',
      '- [MUST][END-1] Default ending is `final operation/reveal -> final mathematical conclusion`, with evidence left visible. Do not append `checkpoint`, cleanup, `// end`, or `// done`. Exception: a final checkpoint is allowed only when the user explicitly requests unlimited free inspection at the end.',
    ]),
    promptSection('[CANONICAL SYNTAX REFERENCE — FORMS ONLY]', [
      '- Dimension/camera: `2d`, `3d`, `view 2d`, `view 3d 1.5s`, `zoom 0.7`, `orbit 6s`, `A with view 2d`',
      '- Scene state: `field board`, `field graph`, `axes on/off`, `relative-axes on/off`, `grid on/off`, `relative-grid on/off`, `coordinates on/off`, `basis on/off`, `vectors on/off`, `clear`, `space reset`',
      '- Reusable settings: `setup proof = 3d; view 2d; zoom 1; relative-grid on`, `use proof`, `use default`',
      '- Matrix block (spaces, never commas): `1 0 0 #A` / next line `0 1 0` / next line `0 0 0` / blank line. The alias is a suffix on the first numeric row; standalone `#A` is not a declaration. `A` applies it, `A +` reveals its card, and `A -` hides its card.',
      '- Vector/point: `3, 4 #v@`, `1, 2, 3 #u@`, `point(4, 1) #b@`; hidden helper: `3, 4 #h!`',
      '- Equation/solution: `x + y = 3 #R1`, `x + y + z = 3 #P1`, `solution(R1,R2) #sol@`',
      '- Matrix slices: `col(A, 1) #c1@`, `row(A, 2) #r2@` (one-based; returns a vector and highlights the source slice on A\'s card)',
      '- Calculation: `A * v #Av`, visible matrix product `B * A #BA@` (omit `@` only for a stored, unrevealed matrix helper), `3 * v`, `3/2 * v #scaled`, `2 * c1 - c2 #r`',
      '- Measurement: `sum(v1,v2)`, `dot(v1,v2)`, `det(v1,v2)`, `det(v1,v2,v3)`',
      '- Visibility/emphasis: `v -`, `v +`, additive `focus v1 v2`, isolating `focus hard v1 v2`, `focus -`',
      '- Algebra-board marks: `mark row(A, 1)`, `mark cell(A, 1, 3)`, `mark pivot(A, 1, 1)`, `mark strike(A, 2, 1)`, `mark staircase(U)`, then `mark -` (one-based; one deliberate inspection target at a time)',
      '- Narration/control: variable identity `// {{v}}와 {{Av}}를 비교한다`; expanded declaration `// 첫 행은 {{R1:expr}}이다`; inline math ``// 입력 `x = (2, -1)`에서 출력은 `2 * {{c1}} - {{c2}}`이다``; prose emphasis `// **방향은 유지된다**`; author-stable semantic break `// claim\\nconsequence`; then `// -`, `ns 2s`, `inspect`, or `checkpoint`. The renderer auto-wraps ordinary caption text within its safe width. Variable tags, value expansion, math grouping, and emphasis are independent. Optional duration suffixes accept `0.5s`, `2s`, or `3/2s`.',
    ]),
    promptSection('[MINIMAL PRECEDENTS — COPY THE PRINCIPLE, NOT THE NUMBERS]', [
      '- [CASE-1][REP-1] If bare `A` already moved `x` to Ax, adding `A*x #Ax` in that transformed scene displays A(Ax). Use one representation only.',
      '- [CASE-2][COL-1] To teach coefficients, show `sum(c1,c2)`, let the learner inspect the unit sum, cue the change, then run `c1 * 2`; the live sum moves. Do not reflexively create `p1`/`p2`.',
      '- [CASE-3][ROW-1] In a row picture for `Ax=b`, draw the row equations and their intersection `x`; keep `b` as RHS algebra. Reveal `point(...) #b@` only in the later column picture.',
      '- [CASE-4][RANK-1] For `diag(1,1,0)`, show live basis volume and the relative grid collapsing during `A with view 2d`; a later static `z=0` plane alone is not the animation.',
      '- [CASE-5][NULL-1] A static z-axis solution is algebraic evidence, not the final disappearance proof. Replay from identity with a nonzero z-axis vector and apply A.',
    ]),
    promptSection('[GENERATION ALGORITHM]', [
      '1. Identify the requested teaching claim and the minimum visual evidence it needs.',
      '2. Choose the evidence field (`board` for centered matrix/symbolic work, `graph` for coordinate geometry), true dimension, and exactly one applicable scene grammar.',
      '3. Declare only necessary values and verify all math and shapes.',
      '4. Simulate engine state, current mutable values, and visibility cell by cell, including every declaration\'s immediate reveal, `clear`, in-place calculations, and transformed space. Move future visible declarations to the beat where they first become evidence.',
      '5. Simulate final geometry, labels, and framing before each important action.',
      '6. Write adjacent operation cues, tag every declared-object reference with `{{name}}`, keep emphasis separate, and choose `checkpoint` only for conceptual review or `inspect` only for free spatial viewing.',
      '7. Remove redundant objects, already-visible `name +` lines, and unchanged settings without removing evidence; use graph `focus` or one BOARD-1 matrix mark only when the narration needs a precise visual target.',
      '8. Run the rule-ID QA below, then respond using the intake or draft/revision form required by FLOW-1 and OUT-1.',
    ]),
    promptSection('[FINAL QA — CHECK IDS, DO NOT REWRITE THE RULES]', [
      '- Correctness: MAT-1 through MAT-6, SYN-1, DIM-1, SOL-1.',
      '- State and representation: STATE-1 through STATE-10, REP-1.',
      '- Evidence and staging: EVD-1, TEACH-1, VIS-1 through VIS-3, OP-1, OP-2, CAP-1 through CAP-4, BOARD-1.',
      '- Selected pattern: MV-1 / SEQ-1 / ROW-1 / COL-1 / DET-1 / RANK-1 / CSPACE-1 / NULL-1 / IND-1 / GAUSS-1 as applicable.',
      '- Camera/readability: CAM-1 through CAM-3, FRAME-1, FRAME-2, LABEL-1.',
      '- Collaboration/playback/output: FLOW-1, TIME-1, TIME-2, CP-1, INSPECT-1, END-1, OUT-1 through OUT-3.',
    ]),
  ];
}

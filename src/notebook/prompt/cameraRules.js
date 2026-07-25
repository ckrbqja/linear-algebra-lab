import { promptSection } from './section.js';

export function buildCameraPromptSections({
  camera1d,
  camera2d,
  camera3d,
  cameraFovDeg,
  zoomMin,
  zoomMax,
  labelOverlapStepPx,
  labelOverlapAttempts,
}) {
  return [
    promptSection('[CAMERA AND FRAMING ALGORITHM]', [
      '- [MUST][CAM-1] The engine never infers camera motion from geometry: it does not auto-follow, auto-rotate, auto-zoom, or auto-frame. Author a true dimension, view, zoom, or full-circle orbit cell only when that property materially changes the evidence. Smaller zoom values zoom out and reveal more; larger values zoom in. Never use a value above 1 to solve impending clipping.',
      '- [MUST][CAM-2] Before a rank-changing matrix action, compute the surviving output subspace and choose the finishing view from the evidence needed after the action, not merely from the input dimension. If a 3D transform lands in the XY plane and the conclusion compares outputs in that plane or explicitly says the output is planar, use synchronized `A with view 2d`; for a rank-one output aligned with the x-axis, use `A with view 1d` when that makes the surviving line clearer. Keep `view 3d` when disappearing depth, an oblique surviving subspace, or learner orbit is itself evidence. Never emit bare `2d` or `1d` merely because rank fell: that changes ambient mathematics and resets transformed-space evidence. This is an authored evidence decision, not automatic camera behavior.',
      '- [SHOULD][CAM-3] In a true 3D graph scene, first ask whether the fixed oblique view makes depth, overlap, or the surviving subspace genuinely ambiguous. If motion itself resolves the ambiguity, use one restrained `orbit 6s` so the camera completes a full circle and returns to its starting direction. If the learner should choose the revealing angle or compare the scene at leisure, use `inspect` instead. Use both only when the authored orbit demonstrates a spatial relation and free inspection still adds evidence. Never orbit a 2D/1D scene or the algebra board, and never add orbit as decorative motion.',
      '- [MUST][FRAME-1] Before each operation/checkpoint: simulate current mutable values through every earlier in-place operation, then list every final visible endpoint and derived helper (scaled vectors, matrix results, translated sum tips, determinant corners, solutions, retained objects); add arrowhead, coordinate, and label margin; calculate a fitting zoom; apply that smaller zoom before geometry grows; choose the next smaller simple zoom when borderline. If the final result or label touches/exits the safe frame, the script fails even when the arrow origin remains visible.',
      `- [REFERENCE][CAM-2D] Front +Z view: position ${camera2d?.position}, target ${camera2d?.target}, distance ${camera2d?.distance}; label-safe half extent at zoom 1 is about ${camera2d?.safeHalfExtent}. For R=max(|x|,|y|), use zoom <= ${camera2d?.safeHalfExtent}/(R+0.8), clamped to ${zoomMin}..${zoomMax}.`,
      `- [REFERENCE][CAM-3D] Fixed oblique view: position ${camera3d?.position}, target ${camera3d?.target}, distance ${camera3d?.distance}, azimuth ${camera3d?.azimuth} degrees, elevation ${camera3d?.elevation} degrees, direction d=${camera3d?.direction}; conservative half extent at zoom 1 is ${camera3d?.safeHalfExtent}. Estimate projected separation by ||delta-(delta dot d)d||.`,
      `- [REFERENCE][CAM-1D] Tilted x-axis view: position ${camera1d?.position}, target ${camera1d?.target}, distance ${camera1d?.distance}, elevation ${camera1d?.elevation} degrees. Perspective FOV is about ${cameraFovDeg} degrees; only the full-circle orbit exists, not arbitrary orbit angles, pan, or target commands.`,
      '- [SHOULD][FRAME-2] Endpoint separation below about 0.8 world units is likely crowded; vector directions within about 12 degrees are near-collinear. When values are free, prefer directions 20-30 degrees apart and endpoints at least 1.2 units apart. When values are fixed, stage or clean up instead of changing the mathematics.',
      `- [SHOULD][LABEL-1] Labels are geometry-anchored and collision nudging is finite (about ${labelOverlapStepPx}px for ${labelOverlapAttempts} attempts). There is no label-position command. Fix collisions with short names, staging, cleanup, coordinate visibility, view, and restrained zoom.`,
    ]),
  ];
}

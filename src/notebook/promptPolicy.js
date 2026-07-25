import { buildCameraPromptSections } from './prompt/cameraRules.js';
import { buildCorePromptSections } from './prompt/coreRules.js';
import { buildReferencePromptSections } from './prompt/referenceRules.js';
import { buildScenePatternSections } from './prompt/scenePatterns.js';

export function buildNotebookPromptPolicy({
  camera1d,
  camera2d,
  camera3d,
  cameraFovDeg = 45,
  zoomMin = '0.35',
  zoomMax = '3',
  labelOverlapStepPx = 22,
  labelOverlapAttempts = 10,
  captionDuration = '2.8s',
  captionMaxDuration = '6.5s',
  checkpointCaptionDuration = '1s',
  matrixRevealDuration = '1.6s',
  pauseDuration = '1.2s',
  setupSettleDuration = '0.45s',
} = {}) {
  const sections = [
    ...buildCorePromptSections(),
    ...buildScenePatternSections(),
    ...buildCameraPromptSections({
      camera1d,
      camera2d,
      camera3d,
      cameraFovDeg,
      zoomMin,
      zoomMax,
      labelOverlapStepPx,
      labelOverlapAttempts,
    }),
    ...buildReferencePromptSections({
      captionDuration,
      captionMaxDuration,
      checkpointCaptionDuration,
      matrixRevealDuration,
      pauseDuration,
      setupSettleDuration,
    }),
  ];

  return sections.flat().slice(0, -1);
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowLeftRight,
  Box,
  Braces,
  Camera,
  Check,
  ClipboardPaste,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Grid3X3,
  GripHorizontal,
  History,
  LogOut,
  Lock,
  Magnet,
  Mail,
  NotebookPen,
  Play,
  Plus,
  RotateCcw,
  Sigma,
  SlidersHorizontal,
  User,
  VectorSquare,
  X,
  ZoomIn,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Sheet } from 'react-modal-sheet';
import posthog from 'posthog-js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  EPSILON,
  determinant3,
  identity3,
  inverse3,
  multiplyMatrix3,
  parseNumber,
  rank3,
  transformVector3,
} from './linearAlgebra.js';
import {
  detectLocale,
  localeMessages,
  localeOrder,
  normalizeLocale,
  presetLocaleNames,
  t,
} from './app/localization.js';
import {
  isFlowHomePathname,
  localeFromPathname,
  localizedHomeUrl,
} from './app/seoRoutes.js';
import {
  clampNotebookCaptionPosition,
  MOBILE_NOTEBOOK_MID_SNAP,
  MOBILE_NOTEBOOK_SNAP_POINTS,
  NOTEBOOK_CAPTION_EDGE_GAP,
  resolveMobileNotebookSnap,
  suggestedNotebookTitle,
  useMediaQuery,
} from './app/layoutRuntime.js';
import FlowMathLanding from './components/FlowMathLanding.jsx';
import FlowAuthDialog from './auth/FlowAuthDialog.jsx';
import { promptGoogleOneTap } from './auth/googleOneTap.js';
import {
  inverseForStep,
  matrixValuesForMode,
  modeForMatrix,
  rankForStep,
  viewKeyForMatrix,
} from './matrix/matrixAnalysis.js';
import { copyTextToClipboard } from './shared/clipboard.js';
import { formatMatrixNumber, formatNumber } from './shared/numberFormat.js';
import {
  buildAnimationViewerUrl,
  patchCameraStateInUrl,
  readAnimationViewerStateFromLocation,
  readShareStateFromLocation,
  writeFlowHomeToHistory,
  writeLabEntryToHistory,
  writeShareStateToUrl,
} from './urlState.js';
import {
  isDegenerateArea,
  setGeometryPositions,
  updateAreaGeometry,
  updateLengthGeometry,
  updateVolumeGeometry,
} from './notebook/measurementEngine.js';
import {
  notebookMatrixSliceText,
  notebookMatrixSliceValues,
  parseNotebookMatrixSliceExpression,
} from './notebook/matrixSlice.js';
import {
  NOTEBOOK_DEFAULT_DURATIONS,
  batchNotebookSceneSetupCells,
  buildNotebookPlaybackSegments,
  notebookActiveLineIndexForCursor,
  notebookCursorForSegmentProgress,
  notebookCursorForLineReveal,
  notebookCursorForLineStart,
  notebookDurationSec,
  notebookOpeningSceneState,
  notebookPlaybackSegments,
  notebookPlaybackStops,
  notebookPlaybackLineCount,
  notebookReviewSteps,
  notebookSegmentProgress,
} from './notebook/playbackEngine.js';
import { buildVisualLinearAlgebraCourse } from './notebook/visualCourse.js';
import { buildNotebookExamplePresets } from './notebook/examplePresets.js';
import { buildNotebookAiPromptDocument } from './notebook/prompt/buildPrompt.js';
import {
  analyzeElementaryRowProduct,
  multiplyNotebookMatrixData,
} from './notebook/rowOperationEngine.js';
import {
  notebookVectorExecutionState,
  splitNotebookLineMeta,
} from './notebook/syntaxMetadata.js';
import {
  NOTEBOOK_BASIS_MEASUREMENT_TARGETS,
  NOTEBOOK_FIELD_MODE_ALIASES as notebookFieldModeAliases,
  NOTEBOOK_SCENE_DEFAULTS,
  NOTEBOOK_SCENE_TOGGLE_ALIASES as notebookSceneToggleAliases,
} from './notebook/languageCore.js';
import NotebookEditorSurface from './notebook/editor/NotebookEditorSurface.jsx';
import NotebookAuthoringToolbar, {
  NotebookSpeedControl,
} from './notebook/editor/NotebookAuthoringToolbar.jsx';
import NotebookResourceShelf from './notebook/editor/NotebookResourceShelf.jsx';
import NotebookMatrixCards from './notebook/board/NotebookMatrixCards.jsx';
import {
  notebookBoardAnnotationText,
  parseNotebookBoardAnnotationExpression,
} from './notebook/board/boardAnnotation.js';
import NotebookSceneDock from './notebook/playback/NotebookSceneDock.jsx';
import { buildNotebookOperationPresentation } from './notebook/operationPresentation.js';
import {
  createNotebookLibraryId,
  readNotebookLibrary,
  writeNotebookLibrary,
} from './notebook/notebookLibrary.js';
import { AdBlockGate, AdSlot } from './components/AdChrome.jsx';
import { MatrixInput, MatrixMini } from './components/MatrixWidgets.jsx';
import TransformHistoryDetail from './components/TransformHistoryDetail.jsx';

export const ANIMATION_MS = 1001;
export const CAMERA_MOVE_MS = 850;
export const UI_SYNC_MS = 50;
export const NOTEBOOK_UI_SYNC_MS = 50;
export const CONTROL_PANEL_DEFAULT_WIDTH = 500;
export const CONTROL_PANEL_MIN_WIDTH = 360;
export const CONTROL_PANEL_MAX_WIDTH = 720;
export const CONTROL_PANEL_MIN_SCENE_WIDTH = 360;
export const CONTROL_PANEL_STORAGE_KEY = 'linearAlgebraControlPanelWidth';
export const NOTEBOOK_EDITOR_DEFAULT_HEIGHT = 440;
export const NOTEBOOK_EDITOR_MIN_HEIGHT = 220;
export const NOTEBOOK_EDITOR_MAX_HEIGHT = 680;
export const NOTEBOOK_COMPOSER_FIXED_HEIGHT = 180;
export const NOTEBOOK_EDITOR_HEIGHT_STORAGE_KEY = 'linearAlgebraNotebookEditorHeightV2';
export const NOTEBOOK_PROGRESS_HANDLE_CENTER_INSET = 11;
export const VECTOR_SPAWN_MS = 280;
export const SOLUTION_REVEAL_MS = 420;
export const NOTEBOOK_FOCUS_SETTLE_MS = 420;
export const NOTEBOOK_AUTHORED_HARD_FOCUS_COMPARE_MS = 2800;
export const NOTEBOOK_HARD_FOCUS_BLEND_IN_TAU_MS = 150;
export const NOTEBOOK_HARD_FOCUS_BLEND_OUT_TAU_MS = 130;
export const NOTEBOOK_CAPTION_HARD_FOCUS_BLEND_OUT_TAU_MS = 35;
export const SNAP_DISTANCE = 0.08;
export const DRAG_SNAP_DISTANCE = 0.12;
export const AXIS_LOCK_RATIO_3D = 0.045;
export const PLANE_LOCK_RATIO_3D = 0.018;
export const AXIS_LOCK_MAX_3D = 0.14;
export const PLANE_LOCK_MAX_3D = 0.07;
export const SHIFT_AXIS_LOCK_PX = 22;
export const MEASURE_DOT_HEX = 0xf1b434;
export const MEASURE_DOT_GUIDE_HEX = 0xffd66b;
export const MEASURE_SUM_HEX = 0x54e0c1;
export const MEASURE_SUM_GUIDE_HEX = 0xa7f3e3;
export const MEASURE_LENGTH_HEX = 0x8bd3ff;
export const MEASURE_AREA_HEX = 0xff4fd8;
export const MEASURE_AREA_EDGE_HEX = 0xff9bea;
export const MEASURE_VOLUME_HEX = 0xff7a59;
export const MEASURE_VOLUME_EDGE_HEX = 0xffb199;
export const NOTEBOOK_MATRIX_PALETTE = Object.freeze([
  0x5eead4,
  0xfbbf24,
  0xa78bfa,
  0xfb7185,
  0x38bdf8,
  0xa3e635,
]);
export const NOTEBOOK_MATRIX_HEX = NOTEBOOK_MATRIX_PALETTE[0];
export const NOTEBOOK_BASIS_TOKEN_STYLES = Object.freeze([
  { label: 'i', color: 0xe05263 },
  { label: 'j', color: 0x1f9d55 },
  { label: 'k', color: 0x3f7ee8 },
]);
export const NOTEBOOK_VARIABLE_MARK_KINDS = new Set(['equation', 'matrix', 'measurement', 'solution', 'vector']);
export const NOTEBOOK_MIN_VISIBLE_LINES = 10;
export const NOTEBOOK_EDITOR_RUNTIME_DEBOUNCE_MS = 400;
export const NOTEBOOK_NORMAL_SPEED = 0.5;
export const NOTEBOOK_ZOOM_MIN = 0.35;
export const NOTEBOOK_ZOOM_MAX = 3;
export const CAMERA_FOV_DEG = 45;
export const NOTEBOOK_PROMPT_SAFE_FRAME_RATIO = 0.9;
export const LABEL_OVERLAP_ATTEMPTS = 10;
export const LABEL_OVERLAP_STEP_PX = 22;
export const DEFAULT_NOTEBOOK_SPEED = NOTEBOOK_NORMAL_SPEED;
export const SCALAR_CONSTRAINT_LINE_RANGE = 5.6;
export const DEFAULT_RELATIVE_GRID_STRENGTH = 0.45;
export const TRANSFORM_WORKSPACE_ENABLED = false;

export function sameNotebookBoardProgressState(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  if (Math.abs(Number(left.progress) - Number(right.progress)) > 0.0005) return false;
  const leftState = { ...left };
  const rightState = { ...right };
  delete leftState.progress;
  delete rightState.progress;
  return JSON.stringify(leftState) === JSON.stringify(rightState);
}
export const monetizationConfig = {
  adProvider: import.meta.env.VITE_AD_PROVIDER || 'adsense',
  adClient: import.meta.env.VITE_AD_CLIENT || 'ca-pub-6291648771242114',
  topAdSlot: import.meta.env.VITE_AD_TOP_SLOT || import.meta.env.VITE_AD_SLOT_TOP || '6608804209',
  bottomAdSlot: import.meta.env.VITE_AD_BOTTOM_SLOT || import.meta.env.VITE_AD_SLOT_BOTTOM || '5742445090',
  admobAppId: import.meta.env.VITE_ADMOB_APP_ID || '',
  donationUrl: import.meta.env.VITE_DONATION_URL || '',
  donationLabel: import.meta.env.VITE_DONATION_LABEL || '',
};
export const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'privacy@flow-math.com';
export const configuredFlowMathApiBaseUrl = import.meta.env.VITE_FLOW_MATH_API_URL?.trim();
export const flowMathApiBaseUrl =
  configuredFlowMathApiBaseUrl ||
  (import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  isLoopbackHostname(window.location.hostname)
    ? 'http://localhost:8787'
    : 'https://api.flow-math.com');
export const seoBaseUrl = 'https://flow-math.com/';
export const seoKeywordList = [
  '선형대수',
  '선형대수 시각화',
  '행렬 변환',
  '행렬 변환 시각화',
  '3D 벡터 시각화',
  '가우스 소거법',
  '벡터',
  '기저',
  '내적',
  '행렬식',
  '행렬 랭크',
  '영공간',
  '연립방정식',
  'linear algebra',
  'linear algebra visualization',
  'linear algebra visualizer',
  'matrix transformation',
  'matrix transformation visualizer',
  'vectors',
  '3D vector visualizer',
  'basis vectors',
  'determinant',
  'matrix rank',
  'null space',
  'Gaussian elimination',
  'dot product',
  'systems of equations',
  '3D math lab',
  'Flow Math',
];
export const seoKeywords = seoKeywordList.join(', ');
export const CAMERA_HOME_POSITION = new THREE.Vector3(9.5, 7.2, 11.8);
export const CAMERA_HOME_TARGET = new THREE.Vector3(0.15, 0.15, 0.15);
export const CAMERA_AUTO_FRAME_MARGIN = 1.12;
export const CAMERA_AUTO_MIN_RADIUS = {
  '1d': 3.6,
  '2d': 6.2,
  '3d': 8.8,
};
export const CAMERA_AUTO_MAX_DISTANCE = 120;
export const EQUATION_PLANE_FRAME_SIZE = 6.8;
export const EQUATION_SOLUTION_FRAME_SIZE = 6.2;
export const CAMERA_VECTOR_COUNTER_MARGIN = 0.22;
export const CAMERA_FRAME_PADDING_MIN = 0.65;
export const CAMERA_FRAME_PADDING_RATIO = 0.12;

export const viewPresets = {
  '3d': {
    labelKey: 'view3d',
    position: CAMERA_HOME_POSITION,
    target: CAMERA_HOME_TARGET,
  },
  '2d': {
    labelKey: 'view2d',
    position: new THREE.Vector3(0, 0, 14.5),
    target: new THREE.Vector3(0, 0, 0),
  },
  '1d': {
    labelKey: 'view1d',
    position: new THREE.Vector3(0, 4.6, 12.2),
    target: new THREE.Vector3(0, 0, 0),
  },
};

export function viewDirectionForKey(viewKey) {
  const preset = viewPresets[viewKey] ?? viewPresets['3d'];
  const direction = preset.position.clone().sub(preset.target);
  if (direction.lengthSq() < EPSILON) return new THREE.Vector3(0, 0, 1);
  return direction.normalize();
}

export function cameraStateForView(viewKey, positionFrom, targetFrom, options = {}) {
  const preset = viewPresets[viewKey] ?? viewPresets['3d'];
  const target =
    options.target?.clone?.() ??
    (options.resetTarget ? preset.target.clone() : targetFrom?.clone?.() ?? preset.target.clone());
  const currentDistance =
    positionFrom && targetFrom
      ? Math.max(positionFrom.distanceTo(targetFrom), EPSILON)
      : 0;
  const presetDistance = preset.position.distanceTo(preset.target);
  const distance = Math.max(
    options.resetDistance || currentDistance <= EPSILON ? presetDistance : currentDistance,
    Number.isFinite(options.minDistance) ? options.minDistance : 0
  );
  const position = target.clone().addScaledVector(viewDirectionForKey(viewKey), distance);
  return { position, target };
}

export function notebookCameraDistanceForZoom(viewKey, zoomFactor) {
  const preset = viewPresets[viewKey] ?? viewPresets['3d'];
  const presetDistance = preset.position.distanceTo(preset.target);
  return presetDistance / Math.max(
    NOTEBOOK_ZOOM_MIN,
    Number(zoomFactor) || NOTEBOOK_SCENE_DEFAULTS.zoom
  );
}

export function notebookCameraPromptMetrics(viewKey) {
  const preset = viewPresets[viewKey] ?? viewPresets['3d'];
  const offset = preset.position.clone().sub(preset.target);
  const horizontalDistance = Math.sqrt(offset.x ** 2 + offset.z ** 2);
  const format = (value, digits = 2) => String(Number(value.toFixed(digits)));
  return {
    position: `(${preset.position.toArray().map((value) => format(value, 2)).join(', ')})`,
    target: `(${preset.target.toArray().map((value) => format(value, 2)).join(', ')})`,
    distance: format(offset.length(), 1),
    azimuth: format(THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)), 0),
    elevation: format(THREE.MathUtils.radToDeg(Math.atan2(offset.y, horizontalDistance)), 0),
    direction: `(${offset.clone().normalize().toArray().map((value) => format(value, 3)).join(', ')})`,
    safeHalfExtent: format(
      offset.length() * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG) / 2) * NOTEBOOK_PROMPT_SAFE_FRAME_RATIO,
      1
    ),
  };
}

export function cameraDistanceForFrame(camera, radius) {
  if (!Number.isFinite(radius) || radius <= EPSILON) return 0;
  const verticalFov = THREE.MathUtils.degToRad(camera?.fov ?? 45);
  const aspect = Math.max(camera?.aspect ?? 1, 0.25);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const fitFov = Math.max(0.1, Math.min(verticalFov, horizontalFov));
  return Math.min(
    CAMERA_AUTO_MAX_DISTANCE,
    (radius * CAMERA_AUTO_FRAME_MARGIN) / Math.sin(fitFov / 2)
  );
}

export function finiteFramePoint(point) {
  return isFiniteVector3(point) ? point : null;
}

export function planeFramePoints(plane, size = EQUATION_PLANE_FRAME_SIZE) {
  const normal = new THREE.Vector3(plane.a, plane.b, plane.c);
  const normalLengthSquared = normal.lengthSq();
  if (normalLengthSquared < EPSILON) return [];

  const anchor = normal.clone().multiplyScalar(plane.value / normalLengthSquared);
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(normal, helper).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  return [
    anchor,
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, size),
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, size),
  ].filter(finiteFramePoint);
}

export function solutionFramePoints(solution, size = EQUATION_SOLUTION_FRAME_SIZE) {
  if (!solution || solution.status === 'none' || solution.status === 'invalid') return [];
  if (solution.status === 'unique' && solution.solution) {
    return [new THREE.Vector3(solution.solution[0] ?? 0, solution.solution[1] ?? 0, solution.solution[2] ?? 0)]
      .filter(finiteFramePoint);
  }
  if (solution.status !== 'infinite' || !solution.nullspaceBasis?.length) return [];

  const center = closestSolutionCenter(solution.particular, solution.nullspaceBasis);
  const points = [center];
  const basis = solution.nullspaceBasis
    .map((values) => new THREE.Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0))
    .filter((vector) => vector.lengthSq() > EPSILON);
  if (basis.length === 1) {
    const direction = basis[0].clone().normalize();
    points.push(center.clone().addScaledVector(direction, -size));
    points.push(center.clone().addScaledVector(direction, size));
  } else if (basis.length >= 2) {
    const u = basis[0].clone().normalize();
    const v = basis[1].clone().normalize();
    points.push(center.clone().addScaledVector(u, -size).addScaledVector(v, -size));
    points.push(center.clone().addScaledVector(u, size).addScaledVector(v, -size));
    points.push(center.clone().addScaledVector(u, size).addScaledVector(v, size));
    points.push(center.clone().addScaledVector(u, -size).addScaledVector(v, size));
  }
  return points.filter(finiteFramePoint);
}

export function transformedFramePoint(matrix, point) {
  const transformed = transformVector3(matrix, [point.x, point.y, point.z]);
  return finiteFramePoint(new THREE.Vector3(transformed[0], transformed[1], transformed[2]));
}

export function frameFromPoints(points, viewKey, camera) {
  const validPoints = points.filter(finiteFramePoint);
  if (!validPoints.length) return null;

  const box = new THREE.Box3().setFromPoints(validPoints);
  const sizeBeforePadding = box.getSize(new THREE.Vector3());
  const padding = Math.max(
    CAMERA_FRAME_PADDING_MIN,
    Math.max(sizeBeforePadding.x, sizeBeforePadding.y, sizeBeforePadding.z) * CAMERA_FRAME_PADDING_RATIO
  );
  box.expandByScalar(padding);
  const center = box.getCenter(new THREE.Vector3());
  const paddedSize = box.getSize(new THREE.Vector3());
  const radius = Math.max(
    CAMERA_AUTO_MIN_RADIUS[viewKey] ?? CAMERA_AUTO_MIN_RADIUS['3d'],
    paddedSize.length() / 2,
    EPSILON
  );
  return {
    target: center,
    minDistance: cameraDistanceForFrame(camera, radius),
  };
}

export function systemSceneCameraFrame(lineSystem, vectors, matrix, vectorMatrix, viewKey, camera) {
  const points = [new THREE.Vector3(0, 0, 0)];
  const sceneMatrix = matrix?.length === 9 ? matrix : identity3;
  const sceneVectorMatrix = vectorMatrix?.length === 9 ? vectorMatrix : sceneMatrix;
  let hasFrameContent = false;

  if (lineSystem?.mode === '3d') {
    (lineSystem.planes ?? []).forEach((plane) => {
      planeFramePoints(plane).forEach((point) => {
        const transformed = transformedFramePoint(sceneMatrix, point);
        if (transformed) {
          hasFrameContent = true;
          points.push(transformed);
        }
      });
    });
  } else {
    (lineSystem?.lines ?? []).forEach((line) => {
      lineSegmentForEquation(line, 9).forEach((point) => {
        const transformed = transformedFramePoint(sceneMatrix, new THREE.Vector3(point[0], point[1], 0));
        if (transformed) {
          hasFrameContent = true;
          points.push(transformed);
        }
      });
    });
  }

  solutionFramePoints(lineSystem?.solution).forEach((point) => {
    const transformed = transformedFramePoint(sceneMatrix, point);
    if (transformed) {
      hasFrameContent = true;
      points.push(transformed);
    }
  });
  if (lineSystem?.point) {
    const transformed = transformedFramePoint(
      sceneMatrix,
      new THREE.Vector3(lineSystem.point[0] ?? 0, lineSystem.point[1] ?? 0, lineSystem.point[2] ?? 0)
    );
    if (transformed) {
      hasFrameContent = true;
      points.push(transformed);
    }
  }

  (vectors ?? []).forEach((item) => {
    if (item?.visible === false) return;
    const raw = [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)];
    const transformed = transformVector3(sceneVectorMatrix, raw);
    const point = finiteFramePoint(new THREE.Vector3(transformed[0], transformed[1], transformed[2]));
    if (point && point.length() > EPSILON) {
      hasFrameContent = true;
      points.push(point);
      points.push(point.clone().multiplyScalar(-CAMERA_VECTOR_COUNTER_MARGIN));
    }
  });

  if (!hasFrameContent) return null;
  return frameFromPoints(points, viewKey, camera);
}

export function arrayOfStrings(value, fallback, length) {
  if (!Array.isArray(value)) return fallback;
  const next = value.slice(0, length).map((item) => String(item ?? '0'));
  while (next.length < length) next.push(fallback[next.length] ?? '0');
  return next;
}

export function arrayOfNumbers(value, fallback, length) {
  if (!Array.isArray(value)) return fallback;
  const next = value.slice(0, length).map((item, index) => {
    const number = Number(item);
    return Number.isFinite(number) ? number : fallback[index];
  });
  while (next.length < length) next.push(fallback[next.length] ?? 0);
  return next;
}

export function cameraArray(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const next = value.slice(0, 3).map(Number);
  return next.every(Number.isFinite) ? next : null;
}

export function normalizeCameraState(value) {
  if (!value || typeof value !== 'object') return null;
  const position = cameraArray(value.position);
  const target = cameraArray(value.target);
  return position && target ? { position, target } : null;
}

export function cameraVectorToShareArray(vector) {
  return [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(4)));
}

export function cameraShareStateFromRefs(refs) {
  if (!refs?.camera || !refs?.controls) return null;
  return {
    position: cameraVectorToShareArray(refs.camera.position),
    target: cameraVectorToShareArray(refs.controls.target),
  };
}

export function cameraStatesAlmostEqual(left, right) {
  if (!left || !right) return false;
  const values = [...left.position, ...left.target];
  const otherValues = [...right.position, ...right.target];
  return values.every((value, index) => Math.abs(value - otherValues[index]) < 0.0001);
}

export function readSharedStateFromUrl() {
  if (typeof window === 'undefined') return null;
  const decoded = readShareStateFromLocation();
  if (!decoded || decoded.v !== 1) return null;
  const vectors = Array.isArray(decoded.vectors)
    ? decoded.vectors.slice(0, 8).map((item, index) =>
        createVectorState(index, {
          id: String(item.id ?? `v${index + 1}`),
          name: String(item.name ?? `v${index + 1}`),
          x: String(item.x ?? '0'),
          y: String(item.y ?? '0'),
          z: String(item.z ?? '0'),
          scalar: String(item.scalar ?? ''),
          scalarEnabled: !!item.scalarEnabled,
          scalarSpace: item.scalarSpace === 'output' ? 'output' : 'input',
          renderKind: item.renderKind === 'point' ? 'point' : 'arrow',
          visible: item.visible !== false,
        })
      )
    : null;

  return {
    locale: normalizeLocale(decoded.locale),
    workspaceMode: decoded.workspaceMode === 'transform' ? 'transform' : 'system',
    inputMode: ['3d', '2d', '1d'].includes(decoded.inputMode) ? decoded.inputMode : '3d',
    displayMatrix: arrayOfNumbers(decoded.displayMatrix, identity3, 9),
    matrix3: arrayOfStrings(decoded.matrix3, ['1', '0', '0', '0', '1', '0', '0', '0', '1'], 9),
    matrix2: arrayOfStrings(decoded.matrix2, ['1', '0', '0', '1'], 4),
    matrix1: arrayOfStrings(decoded.matrix1, ['1'], 1),
    vectors: vectors?.length ? vectors : null,
    showVolume: !!decoded.showVolume,
    showVector: decoded.showVector !== false,
    showBasis: decoded.showBasis === true,
    showGrid: decoded.showGrid !== false,
    showRelativeGrid: decoded.showRelativeGrid !== false,
    relativeGridStrength: normalizeRelativeGridStrength(decoded.relativeGridStrength),
    showCoordinates: decoded.showCoordinates !== false,
    showAutomaticSolution: decoded.showAutomaticSolution === true,
    showDot: !!decoded.showDot,
    showAxes: decoded.showAxes !== false,
    showRelativeAxes: decoded.showRelativeAxes !== false,
    snapToInteger: decoded.snapToInteger !== false,
    notebookSpeed: normalizeNotebookSpeed(decoded.notebookSpeed),
    camera: normalizeCameraState(decoded.camera),
  };
}

export function shouldShowFlowHome() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const hasSharedState = params.has('s') || params.has('state');
  const appTarget = String(params.get('app') ?? '').toLowerCase();
  const authTarget = String(params.get('auth') ?? '').toLowerCase();
  const viewTarget = String(params.get('view') ?? '').toLowerCase();
  if (authTarget === 'google') return false;
  if (hasSharedState || appTarget === 'linear' || viewTarget === 'lab') return false;
  return isFlowHomePathname(window.location.pathname);
}

export function googleLoginUrl() {
  const loginUrl = new URL(authApiUrl('/auth/google/login'));
  if (typeof window === 'undefined') return loginUrl.toString();

  const returnUrl = new URL(window.location.href);
  const apiUrl = new URL(flowMathApiBaseUrl);
  returnUrl.searchParams.delete('auth');

  if (
    isLoopbackHostname(returnUrl.hostname) &&
    isLoopbackHostname(apiUrl.hostname)
  ) {
    returnUrl.protocol = apiUrl.protocol;
    returnUrl.hostname = apiUrl.hostname;
  }

  loginUrl.searchParams.set('return_to', returnUrl.toString());
  return loginUrl.toString();
}

export function authApiUrl(path) {
  return new URL(path, flowMathApiBaseUrl).toString();
}

export function isLoopbackHostname(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(String(hostname).toLowerCase());
}

export function isPostHogReady() {
  return Boolean(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN);
}

export function captureAuthStarted(provider) {
  if (!isPostHogReady()) return;
  posthog.capture('flow_math_auth_started', { auth_provider: provider });
}

export function captureAuthCompleted(user, provider, action) {
  if (!isPostHogReady() || !user?.id) return;
  const properties = {
    email: user.email,
    name: user.name,
    role: user.role,
    auth_provider: provider || user.authProvider,
    is_operator: user.isOperator === true,
  };

  posthog.identify(user.id, properties);
  posthog.capture('flow_math_auth_completed', {
    ...properties,
    auth_action: action,
  });
}

export function notebookInsertionLineIndexForCursor(text, rawCursor) {
  const normalized = String(text ?? '').replace(/\r/g, '');
  const lines = normalized ? normalized.split('\n') : [];
  const parsed = parseNotebookScript(normalized);
  const lastLineFromCells = Math.max(
    0,
    ...parsed.cells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
  );
  const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, parsed.lineCount, lastLineFromCells + 1);
  const activeLine = notebookActiveLineIndexForCursor(rawCursor, lineCount);
  if (activeLine < 0) return 0;

  const activeCell = parsed.cells.find((cell) => {
    const lineStart = Number.isFinite(cell.lineStart) ? cell.lineStart : -1;
    const lineEnd = Number.isFinite(cell.lineEnd) ? cell.lineEnd : lineStart;
    return lineStart <= activeLine && activeLine <= lineEnd;
  });
  const afterCurrentCell = activeCell
    ? (Number.isFinite(activeCell.lineEnd) ? activeCell.lineEnd : activeLine) + 1
    : activeLine + 1;
  return Math.max(0, Math.min(lines.length, afterCurrentCell));
}

export function upsertMeta(selector, attributes, textContent = null) {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement(selector.startsWith('script') ? 'script' : attributes.rel ? 'link' : 'meta');
    document.head.appendChild(node);
  }
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (textContent !== null) node.textContent = textContent;
}

export function applySeo(locale) {
  if (typeof document === 'undefined') return;
  const message = localeMessages[locale] ?? localeMessages.ko;
  const canonicalUrl = localizedHomeUrl(locale, seoBaseUrl);
  const title = locale === 'ko'
    ? `Flow Math | ${message.title}`
    : `${message.title} | Flow Math`;
  const socialImageUrl = new URL('flow-math-og.png', seoBaseUrl).toString();
  document.documentElement.lang = message.code;
  document.title = title;
  upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow, max-image-preview:large' });
  upsertMeta('meta[name="application-name"]', { name: 'application-name', content: 'Flow Math' });
  upsertMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title', content: 'Flow Math' });
  upsertMeta('meta[name="description"]', { name: 'description', content: message.description });
  upsertMeta('meta[name="keywords"]', {
    name: 'keywords',
    content: seoKeywords,
  });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: message.description });
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl.toString() });
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Flow Math' });
  upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: message.code.replace('-', '_') });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: socialImageUrl });
  upsertMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '1200' });
  upsertMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '630' });
  upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: t(locale, 'landingHeroTitleAccent') });
  localeOrder
    .filter((key) => key !== locale)
    .forEach((key) => {
      upsertMeta(`meta[property="og:locale:alternate"][content="${localeMessages[key].code.replace('-', '_')}"]`, {
        property: 'og:locale:alternate',
        content: localeMessages[key].code.replace('-', '_'),
      });
    });
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: message.description });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: socialImageUrl });
  if (monetizationConfig.admobAppId) {
    upsertMeta('meta[name="admob-app-id"]', { name: 'admob-app-id', content: monetizationConfig.admobAppId });
  }
  upsertMeta('meta[name="geo.region"]', { name: 'geo.region', content: locale === 'ko' ? 'KR' : locale === 'ja' ? 'JP' : locale === 'zh' ? 'CN' : 'US' });
  upsertMeta('meta[name="geo.placename"]', { name: 'geo.placename', content: locale === 'ko' ? 'South Korea' : locale === 'ja' ? 'Japan' : locale === 'zh' ? 'China' : 'United States' });
  upsertMeta('link[rel="canonical"]', {
    rel: 'canonical',
    href: canonicalUrl.toString(),
  });
  localeOrder.forEach((key) => {
    const href = localizedHomeUrl(key, seoBaseUrl);
    upsertMeta(`link[rel="alternate"][hreflang="${localeMessages[key].code}"]`, {
      rel: 'alternate',
      hreflang: localeMessages[key].code,
      href: href.toString(),
    });
  });
  upsertMeta('link[rel="alternate"][hreflang="x-default"]', {
    rel: 'alternate',
    hreflang: 'x-default',
    href: seoBaseUrl,
  });
  const faqEntities = [1, 2, 3, 4, 5].map((index) => ({
    '@type': 'Question',
    name: t(locale, `landingFaq${index}Question`),
    acceptedAnswer: {
      '@type': 'Answer',
      text: t(locale, `landingFaq${index}Answer`),
    },
  }));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${seoBaseUrl}#organization`,
        name: 'Flow Math',
        url: seoBaseUrl,
        logo: new URL('pwa-icon-512.png', seoBaseUrl).toString(),
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: supportEmail,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${seoBaseUrl}#website`,
        name: 'Flow Math',
        url: seoBaseUrl,
        inLanguage: localeOrder.map((key) => localeMessages[key].code),
        description: message.description,
        publisher: { '@id': `${seoBaseUrl}#organization` },
      },
      {
        '@type': ['WebApplication', 'LearningResource'],
        '@id': `${seoBaseUrl}#application`,
        name: 'Flow Math',
        alternateName: ['선형대수 시각화 실험실', 'Interactive Linear Algebra Visualizer', message.title],
        url: seoBaseUrl,
        image: socialImageUrl,
        applicationCategory: 'EducationalApplication',
        applicationSubCategory: 'Linear Algebra Visualizer',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser with JavaScript and WebGL.',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        inLanguage: localeOrder.map((key) => localeMessages[key].code),
        learningResourceType: 'Interactive visualization',
        educationalUse: ['instruction', 'self study', 'classroom presentation'],
        audience: {
          '@type': 'EducationalAudience',
          educationalRole: ['student', 'teacher'],
        },
        description: message.description,
        keywords: seoKeywordList,
        publisher: { '@id': `${seoBaseUrl}#organization` },
        featureList: [
          t(locale, 'landingFeature1Title'),
          t(locale, 'landingFeature2Title'),
          t(locale, 'landingFeature3Title'),
          t(locale, 'landingFeature4Title'),
          t(locale, 'landingFeature5Title'),
          t(locale, 'landingFeature6Title'),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${seoBaseUrl}#faq`,
        inLanguage: message.code,
        mainEntity: faqEntities,
      },
    ],
  };
  upsertMeta('script[type="application/ld+json"][data-linear-lab-schema]', {
    type: 'application/ld+json',
    'data-linear-lab-schema': 'true',
  }, JSON.stringify(schema));
}

export function normalizeControlLocks(locks = {}) {
  if (typeof locks === 'boolean') {
    return { camera: locks, zoom: false };
  }
  return {
    camera: !!locks.camera,
    zoom: !!locks.zoom,
  };
}

export function configureControlsForView(controls, viewKey, locks = {}) {
  if (!controls) return;
  const lockState = normalizeControlLocks(locks);
  controls.enabled = true;
  controls.enableRotate = !lockState.camera;
  controls.enablePan = !lockState.camera;
  controls.enableZoom = !lockState.zoom;
  controls.screenSpacePanning = false;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
}

export function labelRectOverlaps(a, b, padding = 4) {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.bottom + padding < b.top ||
    a.top - padding > b.bottom
  );
}

export function estimatedLabelRect(label, x, y) {
  const text = label.querySelector('.axis-label-text')?.textContent ?? label.textContent ?? '';
  const focusEnvelopeScale = 1.12;
  const width = Math.max(42, Math.min(420, text.length * 8.2 + 18)) * focusEnvelopeScale;
  const height = (label.classList.contains('measurement-label') ? 27 : 24) * focusEnvelopeScale;
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
  };
}

export function labelRectFitsContainer(rect, width, height, padding = 8) {
  return (
    rect.left >= padding &&
    rect.right <= width - padding &&
    rect.top >= padding &&
    rect.bottom <= height - padding
  );
}

export function measurementPlacementPoints(targets) {
  return targets.reduce((points, target) => {
    const translated = points.map((point) => point.clone().add(target));
    return [...points, ...translated];
  }, [new THREE.Vector3()]);
}

export function projectedScreenBounds(points, camera, width, height) {
  const bounds = {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  };
  let projectedPointCount = 0;

  points.forEach((point) => {
    if (!isFiniteVector3(point)) return;
    const projected = point.clone().project(camera);
    if (!isFiniteVector3(projected) || projected.z < -1 || projected.z > 1) return;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (projected.y * -0.5 + 0.5) * height;
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
    projectedPointCount += 1;
  });

  return projectedPointCount > 0 ? bounds : null;
}

export function setSceneLabelTransform(label, x, y) {
  const nextTransform =
    `translate(-50%, -50%) translate(${x}px, ${y}px) scale(var(--axis-label-scale, 1))`;
  if (label.style.transform === nextTransform) return;
  label.style.transform = nextTransform;
}

export function resolveSceneLabelOverlaps(container, viewportWidth, viewportHeight) {
  if (!container) return;
  const labels = [...container.querySelectorAll('.axis-label')]
    .filter((label) => label.style.display !== 'none' && label.dataset.labelX && label.dataset.labelY);
  const placed = [];
  const containerWidth = Math.max(1, Number(viewportWidth) || container.clientWidth);
  const containerHeight = Math.max(1, Number(viewportHeight) || container.clientHeight);

  labels.forEach((label) => {
    const baseX = Number(label.dataset.labelX);
    const baseY = Number(label.dataset.labelY);
    if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;

    const isScalarLabel = label.dataset.dragKey?.startsWith('s:');
    const isSolutionLabel =
      label.classList.contains('scalar-solution-label') ||
      label.classList.contains('equation-solution-label');
    const preferredXOffset = isSolutionLabel ? 18 : 0;
    const preferredYOffset = isScalarLabel ? -20 : isSolutionLabel ? 6 : 0;
    const placement = label.dataset.labelPlacement;
    const anchorX = Number(label.dataset.labelAnchorX);
    const anchorY = Number(label.dataset.labelAnchorY);
    const baseRect = estimatedLabelRect(label, baseX, baseY);
    const labelWidth = baseRect.right - baseRect.left;
    const labelHeight = baseRect.bottom - baseRect.top;
    const avoidLeft = Number(label.dataset.labelAvoidLeft);
    const avoidRight = Number(label.dataset.labelAvoidRight);
    const avoidTop = Number(label.dataset.labelAvoidTop);
    const avoidBottom = Number(label.dataset.labelAvoidBottom);
    const hasAvoidanceBounds = [avoidLeft, avoidRight, avoidTop, avoidBottom].every(Number.isFinite);
    const outsideGap = 14;
    const avoidanceCenterX = (avoidLeft + avoidRight) / 2;
    const avoidanceCenterY = (avoidTop + avoidBottom) / 2;
    const placementCandidates = placement === 'outside-bounds' && hasAvoidanceBounds
      ? [
          [avoidRight + labelWidth / 2 + outsideGap, avoidanceCenterY],
          [avoidRight + labelWidth / 2 + outsideGap, avoidTop - labelHeight / 2 - outsideGap],
          [avoidRight + labelWidth / 2 + outsideGap, avoidBottom + labelHeight / 2 + outsideGap],
          [avoidLeft - labelWidth / 2 - outsideGap, avoidanceCenterY],
          [avoidLeft - labelWidth / 2 - outsideGap, avoidTop - labelHeight / 2 - outsideGap],
          [avoidLeft - labelWidth / 2 - outsideGap, avoidBottom + labelHeight / 2 + outsideGap],
          [avoidanceCenterX, avoidTop - labelHeight / 2 - outsideGap],
          [avoidanceCenterX, avoidBottom + labelHeight / 2 + outsideGap],
        ]
      : placement === 'result-side' && Number.isFinite(anchorX) && Number.isFinite(anchorY)
        ? [
          [anchorX + labelWidth / 2 + 14, anchorY - 24],
          [anchorX + labelWidth / 2 + 14, anchorY + 6],
          [anchorX + labelWidth / 2 + 14, anchorY - 50],
          [anchorX - labelWidth / 2 - 14, anchorY - 24],
          [anchorX - labelWidth / 2 - 14, anchorY + 6],
          [anchorX - labelWidth / 2 - 14, anchorY - 50],
        ]
        : null;

    if (placementCandidates) {
      for (const [x, y] of placementCandidates) {
        const rect = estimatedLabelRect(label, x, y);
        if (!labelRectFitsContainer(rect, containerWidth, containerHeight)) continue;
        if (placed.some((placedRect) => labelRectOverlaps(rect, placedRect))) continue;
        setSceneLabelTransform(label, x, y);
        placed.push(rect);
        return;
      }
    }

    for (let attempt = 0; attempt < LABEL_OVERLAP_ATTEMPTS; attempt += 1) {
      const direction = attempt % 2 === 0 ? 1 : -1;
      const step = Math.ceil(attempt / 2);
      const dy = preferredYOffset + direction * step * LABEL_OVERLAP_STEP_PX;
      const dx = preferredXOffset + (attempt > 4 ? (attempt % 2 === 0 ? 18 : -18) : 0);
      const x = baseX + dx;
      const y = baseY + dy;
      const rect = estimatedLabelRect(label, x, y);
      if (!labelRectFitsContainer(rect, containerWidth, containerHeight)) continue;
      if (!placed.some((placedRect) => labelRectOverlaps(rect, placedRect))) {
        setSceneLabelTransform(label, x, y);
        placed.push(rect);
        return;
      }
    }

    setSceneLabelTransform(label, baseX, baseY);
    placed.push(estimatedLabelRect(label, baseX, baseY));
  });
}

export const matrixPresetGroups = {
  '3d': [
    { id: '3d-identity', name: 'Identity matrix', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-rotate-x', name: 'Rotate X 90', matrix: [1, 0, 0, 0, 0, -1, 0, 1, 0], mode: '3d' },
    { id: '3d-rotate-y', name: 'Rotate Y 90', matrix: [0, 0, 1, 0, 1, 0, -1, 0, 0], mode: '3d' },
    { id: '3d-rotate-z', name: 'Rotate Z 90', matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-scale-up', name: 'Scale 1.5x', matrix: [1.5, 0, 0, 0, 1.5, 0, 0, 0, 1.5], mode: '3d' },
    { id: '3d-shear-xy', name: 'X-Y shear', matrix: [1, 1, 0, 0, 1, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-swap-xy', name: 'X/Y permutation', matrix: [0, 1, 0, 1, 0, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-compress-z', name: 'Compress Z', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 0.35], mode: '3d' },
    { id: '3d-project-xy', name: 'Project to XY plane', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 0], mode: '3d' },
  ],
  '2d': [
    { id: '2d-identity', name: 'Identity matrix', matrix: [1, 0, 0, 1], mode: '2d' },
    { id: '2d-permutation', name: 'Permutation matrix', matrix: [0, 1, 1, 0], mode: '2d' },
    { id: '2d-rotate', name: 'Rotate 90', matrix: [0, -1, 1, 0], mode: '2d' },
    { id: '2d-reflect-x', name: 'Reflect X axis', matrix: [1, 0, 0, -1], mode: '2d' },
    { id: '2d-reflect-y', name: 'Reflect Y axis', matrix: [-1, 0, 0, 1], mode: '2d' },
    { id: '2d-scale-up', name: 'Scale 2x', matrix: [2, 0, 0, 2], mode: '2d' },
    { id: '2d-scale-down', name: 'Scale 1/2', matrix: [0.5, 0, 0, 0.5], mode: '2d' },
    { id: '2d-shear-x', name: 'X shear', matrix: [1, 1, 0, 1], mode: '2d' },
    { id: '2d-shear-y', name: 'Y shear', matrix: [1, 0, 1, 1], mode: '2d' },
    { id: '2d-project-x', name: 'Project to X axis', matrix: [1, 0, 0, 0], mode: '2d' },
  ],
  '1d': [
    { id: '1d-identity', name: 'Identity', matrix: [1], mode: '1d' },
    { id: '1d-flip', name: 'Flip direction', matrix: [-1], mode: '1d' },
    { id: '1d-scale-up', name: 'Scale 2x', matrix: [2], mode: '1d' },
    { id: '1d-scale-down', name: 'Scale 1/2', matrix: [0.5], mode: '1d' },
    { id: '1d-zero', name: 'Project to origin', matrix: [0], mode: '1d' },
  ],
};

export function createGridGeometry(size = 5, step = 1) {
  const positions = [];
  const addLine = (x1, y1, z1, x2, y2, z2) => {
    positions.push(x1, y1, z1, x2, y2, z2);
  };

  for (let i = -size; i <= size; i += step) {
    addLine(-size, i, 0, size, i, 0);
    addLine(i, -size, 0, i, size, 0);
    addLine(-size, 0, i, size, 0, i);
    addLine(i, 0, -size, i, 0, size);
    addLine(0, -size, i, 0, size, i);
    addLine(0, i, -size, 0, i, size);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function createPlaneGridGeometry(size = 9, step = 1) {
  const positions = [];
  for (let i = -size; i <= size; i += step) {
    positions.push(-size, i, 0, size, i, 0);
    positions.push(i, -size, 0, i, size, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function effectiveVolumeTargetCount(targetCount) {
  return Math.min(Math.max(0, Number(targetCount) || 0), 3);
}

export function volumeMeasureKind(targetCount) {
  const count = effectiveVolumeTargetCount(targetCount);
  if (count >= 3) return 'volume';
  if (count === 2) return 'area';
  return 'length';
}

export function volumeMeasureValue(targets) {
  const count = effectiveVolumeTargetCount(targets.length);
  if (count <= 0) return null;
  const a = new THREE.Vector3(...targets[0].values);
  if (count === 1) return a.length();
  const b = new THREE.Vector3(...targets[1].values);
  if (count === 2) return a.clone().cross(b).length();
  const c = new THREE.Vector3(...targets[2].values);
  return Math.abs(a.clone().cross(b).dot(c));
}

export function setAxisLabelText(label, text) {
  if (!label) return false;
  const contentKey = Array.isArray(text)
    ? `parts:${text.map((part) => `${part.text ?? ''}\u001f${part.color ?? ''}\u001f${part.className ?? ''}`).join('\u001e')}`
    : `text:${text ?? ''}`;
  if (label.dataset.labelContentKey === contentKey) return false;
  label.dataset.labelContentKey = contentKey;
  const textNode = label.querySelector('.axis-label-text');
  const applyText = (target) => {
    if (Array.isArray(text)) {
      target.replaceChildren(...text.map((part) => {
        const span = document.createElement('span');
        span.textContent = part.text ?? '';
        if (part.color) span.style.color = part.color;
        if (part.className) span.className = part.className;
        return span;
      }));
      return;
    }
    target.textContent = text;
  };
  if (textNode) {
    applyText(textNode);
    return true;
  }
  if (Array.isArray(text)) {
    label.textContent = text.map((part) => part.text ?? '').join('');
    return true;
  }
  label.textContent = text;
  return true;
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function normalizeRelativeGridStrength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_RELATIVE_GRID_STRENGTH;
  return Math.min(1, Math.max(0.2, numeric));
}

export function normalizeNotebookSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_NOTEBOOK_SPEED;
  return Math.min(1.25, Math.max(0.35, numeric));
}

export function getNotebookPlaybackRate(value) {
  return normalizeNotebookSpeed(value) / NOTEBOOK_NORMAL_SPEED;
}

export function formatNotebookSpeedLabel(value) {
  return `${formatMatrixNumber(getNotebookPlaybackRate(value), 2)}x`;
}

export function maxControlPanelWidth(workspaceWidth) {
  const availableWidth = Number.isFinite(workspaceWidth)
    ? workspaceWidth
    : typeof window === 'undefined'
      ? CONTROL_PANEL_DEFAULT_WIDTH + CONTROL_PANEL_MIN_SCENE_WIDTH
      : window.innerWidth;
  return Math.max(
    CONTROL_PANEL_MIN_WIDTH,
    Math.min(CONTROL_PANEL_MAX_WIDTH, availableWidth - CONTROL_PANEL_MIN_SCENE_WIDTH)
  );
}

export function normalizeControlPanelWidth(value, workspaceWidth) {
  const numeric = Number(value);
  const fallback = Number.isFinite(numeric) ? numeric : CONTROL_PANEL_DEFAULT_WIDTH;
  return Math.round(
    Math.min(maxControlPanelWidth(workspaceWidth), Math.max(CONTROL_PANEL_MIN_WIDTH, fallback))
  );
}

export function readControlPanelWidth() {
  if (typeof window === 'undefined') return CONTROL_PANEL_DEFAULT_WIDTH;
  const storedWidth = window.localStorage?.getItem(CONTROL_PANEL_STORAGE_KEY);
  return normalizeControlPanelWidth(
    storedWidth == null ? CONTROL_PANEL_DEFAULT_WIDTH : storedWidth,
    window.innerWidth
  );
}

export function maxNotebookEditorHeight(composerHeight) {
  const availableHeight = Number.isFinite(composerHeight)
    ? composerHeight
    : typeof window === 'undefined'
      ? NOTEBOOK_EDITOR_DEFAULT_HEIGHT + NOTEBOOK_COMPOSER_FIXED_HEIGHT
      : window.innerHeight;
  return Math.max(
    NOTEBOOK_EDITOR_MIN_HEIGHT,
    Math.min(NOTEBOOK_EDITOR_MAX_HEIGHT, availableHeight - NOTEBOOK_COMPOSER_FIXED_HEIGHT)
  );
}

export function normalizeNotebookEditorHeight(value, composerHeight) {
  const numeric = Number(value);
  const fallback = Number.isFinite(numeric) ? numeric : NOTEBOOK_EDITOR_DEFAULT_HEIGHT;
  return Math.round(
    Math.min(
      maxNotebookEditorHeight(composerHeight),
      Math.max(NOTEBOOK_EDITOR_MIN_HEIGHT, fallback)
    )
  );
}

export function readNotebookEditorHeight() {
  if (typeof window === 'undefined') return NOTEBOOK_EDITOR_DEFAULT_HEIGHT;
  const storedHeight = window.localStorage?.getItem(NOTEBOOK_EDITOR_HEIGHT_STORAGE_KEY);
  return normalizeNotebookEditorHeight(
    storedHeight == null ? NOTEBOOK_EDITOR_DEFAULT_HEIGHT : storedHeight,
    window.innerHeight
  );
}

export function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

export function interpolateNumberValue(from, to, progress) {
  const start = parseNumber(from);
  const end = parseNumber(to);
  if (!Number.isFinite(start)) return Number.isFinite(end) ? end : 0;
  if (!Number.isFinite(end)) return start;
  return start + (end - start) * clamp01(progress);
}

export function interpolateValueStrings(fromValues = [], toValues = [], progress) {
  const size = Math.max(fromValues.length, toValues.length);
  return Array.from({ length: size }, (_, index) =>
    formatPresetInputValue(interpolateNumberValue(fromValues[index] ?? 0, toValues[index] ?? 0, progress))
  );
}

export function interpolateEquationEntry(fromEntry, toEntry, progress) {
  if (!fromEntry || !toEntry) return toEntry;
  const eased = clamp01(progress);
  const fromCoeffs = [...(fromEntry.coeffs ?? [0, 0, 0]), 0, 0, 0].slice(0, 3);
  const toCoeffs = [...(toEntry.coeffs ?? [0, 0, 0]), 0, 0, 0].slice(0, 3);
  const coeffs = fromCoeffs.map((value, index) =>
    interpolateNumberValue(value, toCoeffs[index], eased)
  );
  const value = interpolateNumberValue(fromEntry.value ?? 0, toEntry.value ?? 0, eased);
  return {
    ...toEntry,
    coeffs,
    value,
    text: formatEquationFromCoefficients(coeffs, value),
    dimension: Math.max(fromEntry.dimension ?? 2, toEntry.dimension ?? 2),
  };
}

export function setMaterialOpacity(material, opacity) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item) return;
    item.transparent = true;
    item.opacity = opacity;
  });
}

export function setObjectRevealOpacity(object, revealProgress) {
  const eased = easeOutCubic(revealProgress);
  object?.traverse?.((child) => {
    const material = child.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      if (!item) return;
      if (!Number.isFinite(item.userData.baseOpacity)) {
        item.userData.baseOpacity = Number.isFinite(item.opacity) ? item.opacity : 1;
      }
      item.transparent = true;
      item.opacity = item.userData.baseOpacity * eased;
    });
  });
}

export function scaleObjectOpacity(object, opacityScale) {
  object?.traverse?.((child) => {
    const material = child.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      if (!item) return;
      const baseOpacity = Number.isFinite(item.opacity) ? item.opacity : 1;
      item.transparent = true;
      item.opacity = baseOpacity * opacityScale;
    });
  });
}

export const VECTOR_ARROW_HEAD_LENGTH = 0.28;
export const VECTOR_ARROW_HEAD_WIDTH = 0.14;

export function setArrowVector(arrow, x, y, z, visible = true) {
  if (!arrow) return;
  const direction = new THREE.Vector3(x, y, z);
  const length = direction.length();

  if (!visible || length < EPSILON) {
    arrow.visible = false;
    return;
  }

  arrow.setDirection(direction.normalize());
  arrow.setLength(length, VECTOR_ARROW_HEAD_LENGTH, VECTOR_ARROW_HEAD_WIDTH);
  arrow.visible = true;
}

export function setArrowVectorAtProgress(arrow, vector, progress, visible = true) {
  if (!arrow) return;
  const target = vector?.isVector3
    ? vector
    : new THREE.Vector3(vector?.[0] ?? 0, vector?.[1] ?? 0, vector?.[2] ?? 0);
  const targetLength = target.length();
  const stagedLength = targetLength * clamp01(progress);

  if (!visible || targetLength < EPSILON || stagedLength < EPSILON) {
    arrow.visible = false;
    return;
  }

  arrow.setDirection(target.clone().normalize());
  arrow.setLength(
    stagedLength,
    Math.min(VECTOR_ARROW_HEAD_LENGTH, Math.max(0.018, stagedLength * 0.38)),
    Math.min(VECTOR_ARROW_HEAD_WIDTH, Math.max(0.012, stagedLength * 0.2))
  );
  arrow.visible = true;
}

export function createVectorFocusHaloMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      glowOpacity: { value: 0.28 },
    },
    vertexShader: `
      varying vec2 vGlowUv;
      varying vec3 vGlowNormal;
      varying vec3 vGlowViewDirection;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vGlowUv = uv;
        vGlowNormal = normalize(normalMatrix * normal);
        vGlowViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float glowOpacity;
      varying vec2 vGlowUv;
      varying vec3 vGlowNormal;
      varying vec3 vGlowViewDirection;

      void main() {
        float silhouetteFade = pow(
          clamp(abs(dot(normalize(vGlowNormal), normalize(vGlowViewDirection))), 0.0, 1.0),
          1.35
        );
        float startFade = smoothstep(0.0, 0.2, vGlowUv.y);
        float endFade = 1.0 - smoothstep(0.8, 1.0, vGlowUv.y);
        float alpha = glowOpacity * silhouetteFade * startFade * endFade;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export function setVectorFocusHalo(group, x, y, z, visible = true) {
  if (!group) return;
  const vector = new THREE.Vector3(x, y, z);
  const length = vector.length();
  if (!visible || length < EPSILON) {
    group.visible = false;
    return;
  }

  const direction = vector.clone().normalize();
  const shaft = group.userData.shaft;
  const head = group.userData.head;
  const focusHeadLength = Math.min(length, VECTOR_ARROW_HEAD_LENGTH * 1.22);
  const focusShaftLength = Math.max(0.0001, length - VECTOR_ARROW_HEAD_LENGTH * 0.64);

  group.position.set(0, 0, 0);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction
  );
  shaft.position.set(0, focusShaftLength * 0.5, 0);
  shaft.scale.set(1, focusShaftLength, 1);
  shaft.visible = focusShaftLength > 0.0001;
  head.position.set(0, length, 0);
  head.scale.set(
    VECTOR_ARROW_HEAD_WIDTH * 1.38,
    focusHeadLength,
    VECTOR_ARROW_HEAD_WIDTH * 1.38
  );
  head.visible = focusHeadLength > 0.0001;
  group.visible = true;
}

export function createAxisLine(color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)
  );
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.78,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 6;
  line.visible = false;
  return line;
}

export function setAxisLineVector(line, x, y, z, visible = true, length = 8) {
  if (!line) return;
  const direction = new THREE.Vector3(x, y, z);
  if (!visible || direction.lengthSq() < EPSILON) {
    line.visible = false;
    return;
  }
  const scaled = direction.normalize().multiplyScalar(length);
  const positions = line.geometry.attributes.position;
  positions.setXYZ(0, -scaled.x, -scaled.y, -scaled.z);
  positions.setXYZ(1, scaled.x, scaled.y, scaled.z);
  positions.needsUpdate = true;
  line.visible = true;
}

export function createSceneArrow(color) {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    color,
    VECTOR_ARROW_HEAD_LENGTH,
    VECTOR_ARROW_HEAD_WIDTH
  );
  arrow.line.material.depthTest = false;
  arrow.cone.material.depthTest = false;
  arrow.renderOrder = 10;
  return arrow;
}

export function createVectorVisual(scene, dragHandleGeometry, vector) {
  const arrow = createSceneArrow(vector.color);
  const focusHalo = new THREE.Group();
  const focusHaloGeometry = new THREE.CylinderGeometry(0.064, 0.064, 1, 24, 1, true);
  const focusHaloHeadGeometry = new THREE.ConeGeometry(0.5, 1, 24, 1, true);
  focusHaloHeadGeometry.translate(0, -0.5, 0);
  const focusHaloMaterial = createVectorFocusHaloMaterial(vector.color);
  const focusHaloShaft = new THREE.Mesh(focusHaloGeometry, focusHaloMaterial);
  const focusHaloHead = new THREE.Mesh(focusHaloHeadGeometry, focusHaloMaterial);
  focusHaloShaft.renderOrder = 9;
  focusHaloHead.renderOrder = 9;
  focusHalo.add(focusHaloShaft, focusHaloHead);
  focusHalo.userData.shaft = focusHaloShaft;
  focusHalo.userData.head = focusHaloHead;
  focusHalo.visible = false;
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
  );
  const dotMaterial = new THREE.LineBasicMaterial({
    color: vector.color,
    transparent: true,
    opacity: 0.86,
    depthTest: false,
    depthWrite: false,
  });
  const dotLine = new THREE.LineSegments(dotGeometry, dotMaterial);
  dotLine.renderOrder = 12;

  const dotPointGeometry = new THREE.SphereGeometry(0.055, 18, 12);
  const dotPointMaterial = new THREE.MeshBasicMaterial({
    color: vector.color,
    depthTest: false,
    depthWrite: false,
  });
  const dotPoint = new THREE.Mesh(dotPointGeometry, dotPointMaterial);
  dotPoint.renderOrder = 13;

  const handleMaterial = new THREE.MeshBasicMaterial({
    color: vector.color,
    transparent: true,
    opacity: 0.001,
    depthTest: false,
    depthWrite: false,
  });
  const handle = new THREE.Mesh(dragHandleGeometry, handleMaterial);
  handle.renderOrder = 30;
  handle.userData.dragKey = `v:${vector.id}`;
  handle.userData.color = vector.color;

  scene.add(focusHalo, arrow, dotLine, dotPoint, handle);
  return {
    arrow,
    focusHalo,
    focusHaloGeometry,
    focusHaloHeadGeometry,
    focusHaloMaterial,
    focusHaloShaft,
    focusHaloHead,
    dotLine,
    dotPoint,
    handle,
    dotGeometry,
    dotMaterial,
    dotPointGeometry,
    dotPointMaterial,
    handleMaterial,
  };
}

export function disposeVectorVisual(scene, visual) {
  if (!visual) return;
  scene.remove(visual.focusHalo, visual.arrow, visual.dotLine, visual.dotPoint, visual.handle);
  visual.focusHaloGeometry?.dispose?.();
  visual.focusHaloHeadGeometry?.dispose?.();
  visual.focusHaloMaterial?.dispose?.();
  visual.arrow.line.geometry?.dispose?.();
  visual.arrow.line.material?.dispose?.();
  visual.arrow.cone.geometry?.dispose?.();
  visual.arrow.cone.material?.dispose?.();
  visual.dotGeometry.dispose();
  visual.dotMaterial.dispose();
  visual.dotPointGeometry.dispose();
  visual.dotPointMaterial.dispose();
  visual.handleMaterial.dispose();
}

export function toMatrix4(m) {
  return new THREE.Matrix4().set(
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    0, 0, 0, 1
  );
}

export function shortNumber(value) {
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(1)).toString();
}

export function formatCoord(values, mode = '3d') {
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  return `(${values.slice(0, size).map((value) => formatMatrixNumber(value, 2)).join(', ')})`;
}

export function formatCompactCoord(values, mode = '3d', digits = 1) {
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  return `(${values.slice(0, size).map((value) => formatMatrixNumber(value, digits)).join(', ')})`;
}

export function coordLabelText(name, values, mode = '3d', showCoordinates = true, highlightIndices = []) {
  if (!showCoordinates) return `${name}\u2032`;
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  const highlightSet = new Set(highlightIndices.filter((index) => index >= 0 && index < size));
  if (!highlightSet.size) return `${name}\u2032 ${formatCoord(values, mode)}`;

  const parts = [{ text: `${name}\u2032 (` }];
  values.slice(0, size).forEach((value, index) => {
    parts.push({
      text: formatMatrixNumber(value, 2),
      className: highlightSet.has(index) ? 'axis-lock-value' : undefined,
    });
    if (index < size - 1) parts.push({ text: ', ' });
  });
  parts.push({ text: ')' });
  return parts;
}

export function scalarLockHighlightIndices(values, mode = '3d') {
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  const active = values
    .slice(0, size)
    .map((value, index) => ({ index, value: Math.abs(value) }))
    .filter((entry) => entry.value > EPSILON);
  if (!active.length) return [];
  const maxValue = Math.max(...active.map((entry) => entry.value));
  return active
    .filter((entry) => entry.value >= maxValue * 0.2)
    .map((entry) => entry.index);
}

export function dotValues(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

export function vectorLength(values) {
  return Math.sqrt(dotValues(values, values));
}

export function dotRelationText(dotValue, lengthA, lengthB) {
  if (lengthA < EPSILON || lengthB < EPSILON) return 'dotZeroVector';
  if (Math.abs(dotValue) < EPSILON) return 'dotOrthogonal';
  return dotValue > 0 ? 'dotAcute' : 'dotObtuse';
}

export function hasScalarText(value) {
  const text = String(value ?? '').trim();
  return text !== '' && text.toLowerCase() !== 'nan';
}

export function cleanScalarText(value) {
  const text = String(value ?? '');
  return text.trim().toLowerCase() === 'nan' ? '' : text;
}

export function formatInputValue(value) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(2)).toString();
}

export function isFiniteVector3(vector) {
  return (
    !!vector &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

export function formatPresetInputValue(value) {
  return formatMatrixNumber(value, 4);
}

export function formatVectorInputValue(value) {
  return formatInputValue(value);
}

export function snapValue(value, distance = SNAP_DISTANCE) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < distance ? rounded : value;
}

export function snapValuesFor3D(values, distance = SNAP_DISTANCE) {
  const snapped = values.map((value) => snapValue(value, distance));
  const absValues = snapped.map((value) => Math.abs(value));
  const maxAbs = Math.max(...absValues);
  if (maxAbs < EPSILON) return snapped;

  const ranked = absValues
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);
  const dominant = ranked[0];
  const second = ranked[1]?.value ?? 0;
  const axisLockDistance = Math.min(
    AXIS_LOCK_MAX_3D,
    Math.max(distance * 0.55, maxAbs * AXIS_LOCK_RATIO_3D)
  );
  if (dominant.value > EPSILON && second <= axisLockDistance) {
    return snapped.map((value, index) => (index === dominant.index ? value : 0));
  }

  const planeLockDistance = Math.min(
    PLANE_LOCK_MAX_3D,
    Math.max(distance * 0.38, maxAbs * PLANE_LOCK_RATIO_3D)
  );
  return snapped.map((value) => (Math.abs(value) <= planeLockDistance ? 0 : value));
}

export function constrainVectorForMode(vector, mode, options = {}) {
  const shouldSnap = options.snap !== false;
  const snapDistance = options.drag ? DRAG_SNAP_DISTANCE : SNAP_DISTANCE;
  const next = vector.clone();
  if (mode === '1d') {
    next.y = 0;
    next.z = 0;
  } else if (mode === '2d') {
    next.z = 0;
  }
  if (!shouldSnap) return next;
  if (mode === '3d') {
    const [x, y, z] = snapValuesFor3D([next.x, next.y, next.z], snapDistance);
    next.set(x, y, z);
  } else {
    next.set(
      snapValue(next.x, snapDistance),
      snapValue(next.y, snapDistance),
      snapValue(next.z, snapDistance)
    );
  }
  return next;
}

export function constrainInputValuesForMode(values, mode, shouldSnap = true, options = {}) {
  const next = [...values];
  if (mode === '1d') {
    next[1] = 0;
    next[2] = 0;
  } else if (mode === '2d') {
    next[2] = 0;
  }
  if (!shouldSnap) return next;
  const snapDistance = options.drag ? DRAG_SNAP_DISTANCE : SNAP_DISTANCE;
  if (mode === '3d') return snapValuesFor3D(next, snapDistance);
  return next.map((value) => snapValue(value, snapDistance));
}

export function solveVectorInputForWorld(matrix, worldVector, mode, options = {}) {
  const { snap = true } = options;
  if (!isFiniteVector3(worldVector)) return [0, 0, 0];

  if (mode === '2d') {
    const [a, b, c, d] = [matrix[0], matrix[1], matrix[3], matrix[4]];
    const det = a * d - b * c;
    if (Math.abs(det) > EPSILON) {
      return constrainInputValuesForMode(
        [
          (d * worldVector.x - b * worldVector.y) / det,
          (-c * worldVector.x + a * worldVector.y) / det,
          0,
        ],
        mode,
        snap
      );
    }
  }

  if (mode === '1d') {
    const axis = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
    const lengthSquared = axis.lengthSq();
    if (lengthSquared > EPSILON) {
      return constrainInputValuesForMode(
        [axis.dot(new THREE.Vector3(worldVector.x, worldVector.y, worldVector.z)) / lengthSquared, 0, 0],
        mode,
        snap
      );
    }
  }

  const lambda = 1e-5;
  const ata = [
    matrix[0] * matrix[0] + matrix[3] * matrix[3] + matrix[6] * matrix[6] + lambda,
    matrix[0] * matrix[1] + matrix[3] * matrix[4] + matrix[6] * matrix[7],
    matrix[0] * matrix[2] + matrix[3] * matrix[5] + matrix[6] * matrix[8],
    matrix[1] * matrix[0] + matrix[4] * matrix[3] + matrix[7] * matrix[6],
    matrix[1] * matrix[1] + matrix[4] * matrix[4] + matrix[7] * matrix[7] + lambda,
    matrix[1] * matrix[2] + matrix[4] * matrix[5] + matrix[7] * matrix[8],
    matrix[2] * matrix[0] + matrix[5] * matrix[3] + matrix[8] * matrix[6],
    matrix[2] * matrix[1] + matrix[5] * matrix[4] + matrix[8] * matrix[7],
    matrix[2] * matrix[2] + matrix[5] * matrix[5] + matrix[8] * matrix[8] + lambda,
  ];
  const atb = [
    matrix[0] * worldVector.x + matrix[3] * worldVector.y + matrix[6] * worldVector.z,
    matrix[1] * worldVector.x + matrix[4] * worldVector.y + matrix[7] * worldVector.z,
    matrix[2] * worldVector.x + matrix[5] * worldVector.y + matrix[8] * worldVector.z,
  ];
  const inverse = inverse3(ata);
  const solved = inverse ? transformVector3(inverse, atb) : [worldVector.x, worldVector.y, worldVector.z];
  return solved.every(Number.isFinite) ? constrainInputValuesForMode(solved, mode, snap) : [0, 0, 0];
}

export function scalarConstraintResidual(constraint, point) {
  return Math.abs(dotValues(constraint.normal, point) - constraint.scalar);
}

export function isScalarConstraintSolution(constraints, point, tolerance = 0.035) {
  return constraints.every((constraint) => scalarConstraintResidual(constraint, point) <= tolerance);
}

export function solveScalarConstraintPoint(constraints, mode) {
  if (!constraints.length) return null;

  if (mode === '1d') {
    const usable = constraints.filter((constraint) => Math.abs(constraint.normal[0]) > EPSILON);
    if (!usable.length) return null;
    const x = usable[0].scalar / usable[0].normal[0];
    const point = [x, 0, 0];
    return isScalarConstraintSolution(usable, point) ? point : null;
  }

  if (mode === '2d') {
    const usable = constraints.filter((constraint) =>
      Math.hypot(constraint.normal[0], constraint.normal[1]) > EPSILON
    );
    for (let leftIndex = 0; leftIndex < usable.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < usable.length; rightIndex += 1) {
        const left = usable[leftIndex];
        const right = usable[rightIndex];
        const [a, b] = left.normal;
        const [c, d] = right.normal;
        const det = a * d - b * c;
        if (Math.abs(det) < EPSILON) continue;
        const point = [
          (left.scalar * d - b * right.scalar) / det,
          (a * right.scalar - left.scalar * c) / det,
          0,
        ];
        if (isScalarConstraintSolution(usable, point)) return point;
      }
    }
    return null;
  }

  const usable = constraints.filter((constraint) => vectorLength(constraint.normal) > EPSILON);
  for (let aIndex = 0; aIndex < usable.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < usable.length; bIndex += 1) {
      for (let cIndex = bIndex + 1; cIndex < usable.length; cIndex += 1) {
        const matrix = [
          ...usable[aIndex].normal,
          ...usable[bIndex].normal,
          ...usable[cIndex].normal,
        ];
        const inverse = inverse3(matrix);
        if (!inverse) continue;
        const point = transformVector3(inverse, [
          usable[aIndex].scalar,
          usable[bIndex].scalar,
          usable[cIndex].scalar,
        ]);
        if (isScalarConstraintSolution(usable, point)) return point;
      }
    }
  }
  return null;
}

export function dimensionForMode(mode = '3d') {
  if (mode === '1d') return 1;
  if (mode === '2d') return 2;
  return 3;
}

export function modeForDimension(dimension = 3) {
  if (dimension <= 1) return '1d';
  if (dimension === 2) return '2d';
  return '3d';
}

export function operationMatrixFromPreset(preset) {
  const values = matrixValuesForMode(preset.matrix, preset.mode);
  if (preset.mode === '1d') return [values[0], 0, 0, 0, 0, 0, 0, 0, 0];
  if (preset.mode === '2d') return [values[0], values[1], 0, values[2], values[3], 0, 0, 0, 0];
  return values;
}

export function identityMatrixForMode(mode = '3d') {
  if (mode === '1d') return [1, 0, 0, 0, 0, 0, 0, 0, 0];
  if (mode === '2d') return [1, 0, 0, 0, 1, 0, 0, 0, 0];
  return [...identity3];
}

export function matrixInputValuesForShape(matrix, rows, columns) {
  const values = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values.push(matrix[row * 3 + column] ?? '0');
    }
  }
  return values;
}

export function patchMatrixInputShape(matrix, rows, columns, values) {
  const next = [...matrix];
  let valueIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      next[row * 3 + column] = values[valueIndex] ?? next[row * 3 + column] ?? '0';
      valueIndex += 1;
    }
  }
  return next;
}

export function operationMatrixFromInputValues(values, rows, columns) {
  const matrix = Array.from({ length: 9 }, () => 0);
  let valueIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      matrix[row * 3 + column] = parseNumber(values[valueIndex]);
      valueIndex += 1;
    }
  }
  return matrix;
}

export function operationModeForShape(rows, columns) {
  return rows === columns ? modeForDimension(rows) : '3d';
}

export function identityInputValuesForMode(mode = '2d') {
  const dimension = dimensionForMode(mode);
  return matrixInputValuesForShape(identity3, dimension, dimension).map(formatPresetInputValue);
}

export function matrixTextFromValues(values, dimension) {
  const rows = [];
  for (let row = 0; row < dimension; row += 1) {
    rows.push(values.slice(row * dimension, row * dimension + dimension).join(' '));
  }
  return rows.join('\n');
}

export function matrixTextFromShapeValues(values, rows, columns) {
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    lines.push(values.slice(row * columns, row * columns + columns).join(' '));
  }
  return lines.join('\n');
}


export function appendNotebookAlias(body, alias, hidden = false, execute = false, durationSec = null, remove = false, show = false) {
  const cleaned = normalizeNotebookVariableName(alias);
  let result = cleaned ? `${body}  #${cleaned}${hidden ? '!' : ''}` : body;
  if (execute) result = `${result}@`;
  if (remove) result = `${result} -`;
  else if (show) result = `${result} +`;
  if (Number.isFinite(durationSec) && durationSec > 0) {
    result = `${result} ${formatMatrixNumber(durationSec, 2)}s`;
  }
  return result;
}

export function appendNotebookLineMeta(body, meta = {}) {
  const aliased = appendNotebookAlias(body, meta.alias, meta.hidden, meta.execute, meta.durationSec, meta.remove, meta.show);
  return meta.hidden && !meta.alias ? `! ${aliased}` : aliased;
}

export const NOTEBOOK_IDENTIFIER_PATTERN = '[\\p{L}_][\\p{L}\\p{N}_]*';
export const NOTEBOOK_NUMBER_TOKEN_PATTERN = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:\s*\/\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))?$/u;

export function isNotebookNumberToken(value) {
  return NOTEBOOK_NUMBER_TOKEN_PATTERN.test(String(value ?? '').trim());
}

export function parseNotebookVectorLine(line) {
  const meta = splitNotebookLineMeta(line);
  const { body: sourceLine, alias, hidden, durationSec, remove } = meta;
  const trimmed = sourceLine.trim();
  if (!trimmed || !trimmed.includes(',')) return null;
  const assignment = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:=|:)\\s*(.+)$`, 'u'));
  const assignedName = assignment?.[1] ?? null;
  const name = alias ?? assignedName;
  const source = assignment?.[2] ?? trimmed;
  const body = trimmed
    ? source
    .replace(/^[([{<]\s*/, '')
    .replace(/\s*[)\]}>]$/, '')
    : '';
  const parts = body.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every(isNotebookNumberToken)) return null;
  const values = parts.map((part) => parseNumber(part));
  if (!values.every(Number.isFinite)) return null;
  const execution = notebookVectorExecutionState(meta, assignedName);
  return {
    name,
    alias,
    assignedName,
    hidden,
    execute: execution.execute,
    explicitExecute: execution.explicitExecute,
    remove,
    durationSec,
    dimension: parts.length,
    values: [
      formatPresetInputValue(values[0] ?? 0),
      formatPresetInputValue(values[1] ?? 0),
      formatPresetInputValue(values[2] ?? 0),
    ],
  };
}

export function parseNotebookPointLine(line) {
  const { body: sourceLine, alias, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed) return null;
  const assignment = trimmed.match(
    new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:=|:)\\s*point\\s*\\((.*)\\)$`, 'iu')
  );
  const direct = assignment ? null : trimmed.match(/^point\s*\((.*)\)$/iu);
  const assignedName = assignment?.[1] ?? null;
  const coordinateSource = assignment?.[2] ?? direct?.[1] ?? null;
  if (coordinateSource === null) return null;
  const parts = coordinateSource.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3 || !parts.every(isNotebookNumberToken)) return null;
  const values = parts.map((part) => parseNumber(part));
  if (!values.every(Number.isFinite)) return null;
  return {
    name: alias ?? assignedName,
    alias,
    assignedName,
    hidden,
    execute: true,
    explicitExecute: true,
    remove,
    durationSec,
    dimension: parts.length,
    visualKind: 'point',
    values: [
      formatPresetInputValue(values[0] ?? 0),
      formatPresetInputValue(values[1] ?? 0),
      formatPresetInputValue(values[2] ?? 0),
    ],
  };
}

export function parseNotebookMatrixSliceLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const { body: sourceLine, alias, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed) return null;
  const assignment = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:=|:)\\s*(.+)$`, 'u'));
  const assignedName = assignment?.[1] ?? null;
  const slice = parseNotebookMatrixSliceExpression(assignment?.[2] ?? trimmed);
  if (!slice) return null;
  const matrixName = resolveNotebookVariableName(slice.matrixName, knownNames);
  const matrixShape = knownShapes.get(notebookVariableKey(matrixName));
  if (matrixShape?.kind !== 'matrix') return null;
  const limit = slice.axis === 'row' ? matrixShape.rows : matrixShape.columns;
  if (slice.index < 0 || slice.index >= limit) return null;
  return {
    name: alias ?? assignedName,
    alias,
    assignedName,
    hidden,
    remove,
    durationSec,
    execute: true,
    matrixName,
    axis: slice.axis,
    index: slice.index,
    dimension: slice.axis === 'row' ? matrixShape.columns : matrixShape.rows,
  };
}

export function normalizeNotebookVariableName(value, fallback = '') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/^(\p{N})/u, '_$1');
  return cleaned || fallback;
}

export function notebookVariableKey(value) {
  return normalizeNotebookVariableName(value).toLowerCase();
}

export function resolveNotebookVariableName(value, knownNames) {
  const fallback = normalizeNotebookVariableName(value);
  if (!fallback) return fallback;
  return knownNames?.get?.(notebookVariableKey(fallback)) ?? fallback;
}

export function rememberNotebookVariableName(knownNames, value) {
  const normalized = normalizeNotebookVariableName(value);
  if (!normalized) return normalized;
  const key = notebookVariableKey(normalized);
  if (!knownNames.has(key)) knownNames.set(key, normalized);
  return knownNames.get(key) ?? normalized;
}

export function notebookVectorIdForName(name, index) {
  return `notebook-${normalizeNotebookVariableName(name, `v${index + 1}`)}`;
}

export function measurementStateKey(type, targets) {
  return `${type}:${[...targets].sort().join('|')}`;
}

export function parseNotebookMeasurementLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const { body: sourceLine, alias, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(dot|det|sum)\s*\((.*)\)\s*$/iu);
  if (match) {
    const kind = match[1].toLowerCase();
    const names = match[2]
      .split(',')
      .map((part) => resolveNotebookVariableName(part.trim(), knownNames))
      .filter(Boolean);
    if (kind === 'dot' && names.length < 2) return null;
    if (kind === 'det' && names.length < 2) return null;
    if (kind === 'sum' && names.length < 2) return null;
    return {
      type: kind === 'dot' ? 'dot' : kind === 'sum' ? 'sum' : 'volume',
      alias,
      hidden,
      remove,
      durationSec,
      execute: true,
      names: kind === 'det' ? names.slice(0, 3) : names.slice(0, 2),
    };
  }

  const product = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:\\*|횞)\\s*(${NOTEBOOK_IDENTIFIER_PATTERN})$`, 'u'));
  if (!product) return null;
  const leftName = resolveNotebookVariableName(product[1], knownNames);
  const rightName = resolveNotebookVariableName(product[2], knownNames);
  const leftShape = knownShapes.get(notebookVariableKey(leftName));
  const rightShape = knownShapes.get(notebookVariableKey(rightName));
  if (leftShape?.kind !== 'vector' || rightShape?.kind !== 'vector') return null;
  return {
    type: 'dot',
    alias,
    hidden,
    remove,
    durationSec,
    execute: true,
    notation: 'product',
    names: [leftName, rightName],
  };
}

export function parseNotebookCaptionLine(line) {
  const { body: sourceLine, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed.startsWith('//')) return null;
  const text = trimmed.replace(/^\/\/\s?/u, '').trim();
  if (!text && !remove) return null;
  return {
    text,
    hidden,
    remove,
    durationSec,
  };
}

export function parseNotebookPauseLine(line) {
  const { body: sourceLine, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim().toLowerCase();
  if (!/^(ns|rest|pause|wait|쉬기|쉼|대기)$/.test(trimmed)) return null;
  return {
    hidden,
    remove,
    durationSec,
  };
}

export function parseNotebookCheckpointLine(line) {
  const { body: sourceLine, hidden } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim().toLowerCase();
  if (!/^(checkpoint|confirm|next|확인|다음|계속)$/.test(trimmed)) return null;
  return { hidden };
}

export function parseNotebookInspectLine(line) {
  const { body: sourceLine, hidden } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim().toLowerCase();
  if (!/^(?:inspect|explore|look\s+around|둘러보기|살펴보기|자유\s*관찰)$/u.test(trimmed)) return null;
  return { hidden };
}

export function parseNotebookFocusLine(line, knownNames = new Map()) {
  const { body: sourceLine, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (remove && /^(?:focus|emphasize|highlight|강조)$/iu.test(trimmed)) {
    return { names: [], clear: true, mode: 'soft', hidden, durationSec };
  }
  const match = trimmed.match(/^(?:focus|emphasize|highlight|강조)\s+(.+)$/iu);
  if (!match) return null;
  const targetSource = match[1].trim();
  if (/^(?:-|off|clear|none)$/i.test(targetSource)) {
    return { names: [], clear: true, mode: 'soft', hidden, durationSec };
  }
  const hardMatch = targetSource.match(/^hard(?:\s+|$)(.*)$/iu);
  const mode = hardMatch ? 'hard' : 'soft';
  const names = (hardMatch ? hardMatch[1] : targetSource)
    .split(/[\s,]+/u)
    .map((name) => normalizeNotebookVariableName(name, ''))
    .filter(Boolean)
    .map((name) => resolveNotebookVariableName(name, knownNames));
  if (!names.length) return null;
  return { names: [...new Set(names)], clear: false, mode, hidden, durationSec };
}

export function notebookFocusText(focusLine) {
  return focusLine.clear
    ? 'focus -'
    : `focus ${focusLine.mode === 'hard' ? 'hard ' : ''}${focusLine.names.join(' ')}`;
}

export function parseNotebookBoardAnnotationLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const { body: sourceLine, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const source = remove && /^(?:mark|annotate)$/iu.test(sourceLine.trim())
    ? 'mark -'
    : sourceLine;
  const annotation = parseNotebookBoardAnnotationExpression(source);
  if (!annotation) return null;
  if (annotation.clear) return { ...annotation, hidden, durationSec };

  const matrixName = resolveNotebookVariableName(annotation.matrixName, knownNames);
  const matrixShape = knownShapes.get(notebookVariableKey(matrixName));
  if (matrixShape?.kind !== 'matrix') return null;
  if (Number.isInteger(annotation.row) && annotation.row >= matrixShape.rows) return null;
  if (Number.isInteger(annotation.column) && annotation.column >= matrixShape.columns) return null;
  return {
    ...annotation,
    matrixName,
    hidden,
    durationSec,
  };
}

export function parseNotebookSolutionLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const { body: sourceLine, alias, hidden, execute, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  const match = trimmed.match(/^(?:solution|solve|intersection)\s*\((.*)\)\s*$/iu);
  if (!match) return null;
  const names = match[1]
    .split(',')
    .map((part) => resolveNotebookVariableName(part.trim(), knownNames))
    .filter(Boolean)
    .slice(0, 3);
  if (names.length < 2) return null;
  if (names.some((name) => knownShapes.get(notebookVariableKey(name))?.kind !== 'equation')) return null;
  return {
    name: alias,
    alias,
    names,
    hidden,
    execute: true,
    explicitExecute: Boolean(execute),
    remove,
    durationSec,
  };
}

export function parseNotebookToggleValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (/^(on|show|true|켜기|켬|표시)$/.test(normalized)) return true;
  if (/^(off|hide|false|끄기|끔|숨김)$/.test(normalized)) return false;
  return null;
}

export function parseNotebookFieldMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  for (const [mode, aliases] of Object.entries(notebookFieldModeAliases)) {
    if (aliases.some((alias) => alias.toLowerCase() === normalized)) return mode;
  }
  return null;
}

export function parseNotebookSceneCommandLine(line) {
  const { body: sourceLine, hidden, durationSec } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (/^(?:space\s+reset|reset\s+space|공간\s*초기화|변환\s*초기화)$/i.test(trimmed)) {
    return {
      command: 'spaceReset',
      value: true,
      hidden,
      durationSec,
    };
  }
  if (/^(?:clear|clear\s+field|field\s+clear|필드\s*(?:초기화|비우기)|장면\s*비우기|전체\s*지우기|모두\s*지우기)$/i.test(trimmed)) {
    return {
      command: 'clear',
      value: true,
      hidden,
      durationSec,
    };
  }
  const fieldMatch = trimmed.match(/^(?:field|stage|필드|장면)\s+(.+)$/iu);
  if (fieldMatch) {
    const value = parseNotebookFieldMode(fieldMatch[1]);
    if (value) return { command: 'field', value, hidden, durationSec };
  }
  const dimensionMatch = trimmed.match(/^(?:(?:dimension|space|차원|공간)\s+)?(1d|2d|3d)$/i);
  if (dimensionMatch) {
    return {
      command: 'dimension',
      value: dimensionMatch[1].toLowerCase(),
      hidden,
      durationSec,
    };
  }
  const viewMatch = trimmed.match(/^(?:view|camera|시점|카메라)\s+(1d|2d|3d)$/i);
  if (viewMatch) {
    return {
      command: 'view',
      value: viewMatch[1].toLowerCase(),
      hidden,
      durationSec,
    };
  }

  if (/^(?:orbit|camera\s+orbit|카메라\s*회전|한\s*바퀴)$/iu.test(trimmed)) {
    return {
      command: 'orbit',
      value: true,
      hidden,
      durationSec,
    };
  }

  const zoomMatch = trimmed.match(/^(?:zoom|줌|확대)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/\d+(?:\.\d*)?)?)$/i);
  if (zoomMatch) {
    const value = parseNumber(zoomMatch[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      command: 'zoom',
      value: Math.max(NOTEBOOK_ZOOM_MIN, Math.min(NOTEBOOK_ZOOM_MAX, value)),
      hidden,
      durationSec,
    };
  }

  for (const [command, aliases] of Object.entries(notebookSceneToggleAliases)) {
    for (const alias of aliases) {
      const prefix = `${alias} `;
      if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      const value = parseNotebookToggleValue(trimmed.slice(prefix.length));
      if (value === null) continue;
      return { command, value, hidden, durationSec };
    }
  }
  return null;
}

export function notebookSceneCommandText(sceneLine) {
  if (sceneLine.command === 'spaceReset') return 'space reset';
  if (sceneLine.command === 'clear') return 'clear';
  if (sceneLine.command === 'field') return `field ${sceneLine.value}`;
  if (sceneLine.command === 'dimension') return sceneLine.value;
  if (sceneLine.command === 'view') return `view ${sceneLine.value}`;
  if (sceneLine.command === 'orbit') return 'orbit';
  if (sceneLine.command === 'zoom') return `zoom ${formatPresetInputValue(sceneLine.value)}`;
  const command = Object.entries(notebookSceneToggleAliases)
    .find(([key]) => key === sceneLine.command)?.[1]?.[0] ?? sceneLine.command;
  return `${command} ${sceneLine.value ? 'on' : 'off'}`;
}

export const NOTEBOOK_SCENE_PRESET_COMMANDS = new Set([
  'field',
  'dimension',
  'view',
  'zoom',
  ...Object.keys(notebookSceneToggleAliases),
]);

export function createNotebookScenePresetRegistry() {
  return new Map([
    ['default', {
      name: 'default',
      value: { ...NOTEBOOK_SCENE_DEFAULTS },
      commands: [
        { command: 'field', value: NOTEBOOK_SCENE_DEFAULTS.field },
        { command: 'dimension', value: NOTEBOOK_SCENE_DEFAULTS.dimension },
        { command: 'view', value: NOTEBOOK_SCENE_DEFAULTS.view },
        { command: 'zoom', value: NOTEBOOK_SCENE_DEFAULTS.zoom },
        ...Object.keys(notebookSceneToggleAliases).map((command) => ({
          command,
          value: NOTEBOOK_SCENE_DEFAULTS[command],
        })),
      ],
    }],
  ]);
}

export function parseNotebookScenePresetDefinitionLine(line) {
  const { body: sourceLine } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  const match = trimmed.match(new RegExp(
    `^(?:setup|scene\\s+preset|설정)\\s+(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*=\\s*(.+)$`,
    'iu'
  ));
  if (!match) return null;
  const commandSources = match[2].split(';').map((part) => part.trim()).filter(Boolean);
  if (!commandSources.length) return null;
  const commandMap = new Map();
  for (const commandSource of commandSources) {
    const sceneLine = parseNotebookSceneCommandLine(commandSource);
    if (!sceneLine || !NOTEBOOK_SCENE_PRESET_COMMANDS.has(sceneLine.command)) return null;
    commandMap.set(sceneLine.command, {
      command: sceneLine.command,
      value: sceneLine.value,
    });
  }
  const commands = [...commandMap.values()];
  return {
    name: match[1],
    commands,
    value: Object.fromEntries(commands.map((command) => [command.command, command.value])),
  };
}

export function notebookScenePresetDefinitionText(preset) {
  return `setup ${preset.name} = ${preset.commands.map(notebookSceneCommandText).join('; ')}`;
}

export function parseNotebookScenePresetUseLine(line, knownPresets = new Map()) {
  const { body: sourceLine, hidden, durationSec } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  const match = trimmed.match(new RegExp(
    `^(?:use|apply\\s+setup|설정\\s*적용)\\s+(${NOTEBOOK_IDENTIFIER_PATTERN})$`,
    'iu'
  ));
  if (!match) return null;
  const preset = knownPresets.get(notebookVariableKey(match[1]));
  if (!preset) return null;
  return {
    name: preset.name,
    value: { ...preset.value },
    hidden,
    durationSec,
  };
}

export const NOTEBOOK_SCALAR_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:\\/\\d+(?:\\.\\d*)?)?';

export function parseNotebookLinearCombinationTermAtStart(source) {
  const scalarFirst = source.match(new RegExp(`^(${NOTEBOOK_SCALAR_PATTERN})\\s*(?:\\*|×)\\s*(${NOTEBOOK_IDENTIFIER_PATTERN})`, 'u'));
  if (scalarFirst) {
    return {
      length: scalarFirst[0].length,
      name: scalarFirst[2],
      scalar: parseNumber(scalarFirst[1]),
    };
  }
  const scalarLast = source.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:\\*|×)\\s*(${NOTEBOOK_SCALAR_PATTERN})`, 'u'));
  if (scalarLast) {
    return {
      length: scalarLast[0].length,
      name: scalarLast[1],
      scalar: parseNumber(scalarLast[2]),
    };
  }
  const signedBareVector = source.match(new RegExp(`^([+-])\\s*(${NOTEBOOK_IDENTIFIER_PATTERN})`, 'u'));
  if (signedBareVector) {
    return {
      length: signedBareVector[0].length,
      name: signedBareVector[2],
      scalar: signedBareVector[1] === '-' ? -1 : 1,
    };
  }
  const bareVector = source.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})`, 'u'));
  if (!bareVector) return null;
  return { length: bareVector[0].length, name: bareVector[1], scalar: 1 };
}

export function parseNotebookLinearCombinationExpression(expression) {
  let rest = String(expression ?? '').trim();
  const first = parseNotebookLinearCombinationTermAtStart(rest);
  if (!first) return null;
  const terms = [{ name: first.name, scalar: first.scalar }];
  rest = rest.slice(first.length);

  while (rest.trim()) {
    const operator = rest.match(/^\s*([+-])\s*/u);
    if (!operator) return null;
    rest = rest.slice(operator[0].length);
    const next = parseNotebookLinearCombinationTermAtStart(rest);
    if (!next) return null;
    terms.push({
      name: next.name,
      scalar: operator[1] === '-' ? -next.scalar : next.scalar,
    });
    rest = rest.slice(next.length);
  }
  return terms.length >= 2 ? terms : null;
}

export function formatNotebookLinearCombination(terms = []) {
  return terms.map((term, index) => {
    const scalar = Number(term.scalar);
    const magnitude = Math.abs(scalar);
    const value = magnitude === 1
      ? term.name
      : `${formatPresetInputValue(magnitude)} * ${term.name}`;
    if (index === 0) {
      if (scalar >= 0) return value;
      return `-${value}`;
    }
    return `${scalar < 0 ? '-' : '+'} ${value}`;
  }).join(' ');
}

export function parseNotebookCalculationLine(line) {
  const { body: sourceLine, alias, hidden, execute, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed || !/[=+*×-]/.test(trimmed)) return null;
  const assignment = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*=\\s*(.+)$`, 'u'));
  const assignedTarget = assignment?.[1] ?? null;
  const target = alias ?? assignedTarget;
  const expression = (assignment?.[2] ?? trimmed).trim();
  const linearCombinationTerms = parseNotebookLinearCombinationExpression(expression);
  if (linearCombinationTerms) {
    return {
      operation: 'linearCombination',
      terms: linearCombinationTerms,
      target,
      alias,
      assignedTarget,
      hidden,
      execute: true,
      explicitExecute: Boolean(execute),
      remove,
      durationSec,
    };
  }
  const scalarPattern = NOTEBOOK_SCALAR_PATTERN;
  const operandPattern = `(?:${scalarPattern}|${NOTEBOOK_IDENTIFIER_PATTERN})`;
  const product = expression.match(new RegExp(`^(${operandPattern})\\s*(?:\\*|×)\\s*(${operandPattern})$`, 'u'));
  if (!product) return null;
  const scalarRegex = new RegExp(`^${scalarPattern}$`, 'u');
  const leftScalar = scalarRegex.test(product[1]) ? parseNumber(product[1]) : null;
  const rightScalar = scalarRegex.test(product[2]) ? parseNumber(product[2]) : null;
  if (leftScalar !== null && rightScalar !== null) return null;
  return {
    operation: 'product',
    target,
    alias,
    assignedTarget,
    hidden,
    execute: true,
    explicitExecute: Boolean(execute),
    remove,
    durationSec,
    left: product[1],
    right: product[2],
    leftScalar,
    rightScalar,
  };
}

export function isSupportedNotebookCalculation(calculationLine, knownNames, knownShapes) {
  if (!calculationLine) return false;
  if (calculationLine.operation === 'linearCombination') {
    return calculationLine.terms.every((term) => {
      const name = resolveNotebookVariableName(term.name, knownNames);
      return knownShapes.get(notebookVariableKey(name))?.kind === 'vector';
    });
  }

  const leftName = calculationLine.leftScalar !== null
    ? null
    : resolveNotebookVariableName(calculationLine.left, knownNames);
  const rightName = calculationLine.rightScalar !== null
    ? null
    : resolveNotebookVariableName(calculationLine.right, knownNames);
  const leftKind = calculationLine.leftScalar !== null
    ? 'scalar'
    : knownShapes.get(notebookVariableKey(leftName))?.kind;
  const rightKind = calculationLine.rightScalar !== null
    ? 'scalar'
    : knownShapes.get(notebookVariableKey(rightName))?.kind;
  return (
    (leftKind === 'matrix' && ['matrix', 'vector', 'equation'].includes(rightKind)) ||
    (rightKind === 'matrix' && ['vector', 'equation'].includes(leftKind)) ||
    (leftKind === 'scalar' && rightKind === 'vector') ||
    (leftKind === 'vector' && rightKind === 'scalar')
  );
}

export function multiplyNotebookMatrixVector(matrix, vectorValues) {
  const shapedMatrix = notebookMatrixShape(matrix);
  const matrixValues = Array.isArray(matrix) ? matrix : matrix?.values;
  return transformVector3(matrixValues, vectorValues.map((value) => parseNumber(value)))
    .map(formatPresetInputValue)
    .slice(0, Math.max(1, Math.min(3, shapedMatrix.rows)));
}

export function notebookMatrixShape(matrix) {
  const rows = Math.max(1, Math.min(3, Number(matrix?.rows) || 3));
  const columns = Math.max(1, Math.min(3, Number(matrix?.columns) || rows));
  const shapedValues = Array.isArray(matrix?.shapeValues)
    ? matrix.shapeValues
    : Array.isArray(matrix?.values)
      ? matrixInputValuesForShape(matrix.values, rows, columns)
      : [];
  const values = Array.from({ length: rows * columns }, (_, index) =>
    parseNumber(shapedValues[index] ?? (index % (columns + 1) === 0 ? '1' : '0'))
  );
  return { rows, columns, values };
}

export function multiplyNotebookMatrices(leftMatrix, rightMatrix) {
  const product = multiplyNotebookMatrixData(leftMatrix, rightMatrix);
  if (!product) return null;
  const shapeValues = product.values.map(formatPresetInputValue);

  return {
    type: 'matrix',
    rows: product.rows,
    columns: product.columns,
    mode: operationModeForShape(product.rows, product.columns),
    shapeValues,
    values: operationMatrixFromInputValues(shapeValues, product.rows, product.columns),
  };
}

export function formatEquationFromCoefficients(coeffs, value) {
  const terms = coeffs
    .map((coefficient, index) => ({ coefficient, variable: equationVariables[index] }))
    .filter((term) => Math.abs(term.coefficient) > EPSILON);
  if (!terms.length) return `0 = ${formatMatrixNumber(value, 3)}`;
  const left = terms
    .map((term, index) => `${formatEquationCoefficient(term.coefficient, index === 0)}${term.variable}`)
    .join('')
    .trim();
  return `${left} = ${formatMatrixNumber(value, 3)}`;
}

export function transformNotebookEquation(equation, matrixEntry) {
  if (!equation || !matrixEntry) return null;
  const coeffs = [...(equation.coeffs ?? [0, 0, 0]), 0, 0, 0].slice(0, 3);
  const value = Number(equation.value ?? 0);
  const equationDimension = Math.abs(coeffs[2]) > EPSILON ? 3 : 2;
  const matrixDimension = Math.max(matrixEntry.rows ?? 2, matrixEntry.columns ?? 2);
  const dimension = Math.max(equationDimension, matrixDimension >= 3 ? 3 : 2);

  if (dimension <= 2) {
    const [a, b, c, d] = matrixValuesForMode(matrixEntry.values, '2d');
    const det = a * d - b * c;
    if (Math.abs(det) < EPSILON) return null;
    const inverse = [d / det, -b / det, -c / det, a / det];
    const nextCoeffs = [
      inverse[0] * coeffs[0] + inverse[2] * coeffs[1],
      inverse[1] * coeffs[0] + inverse[3] * coeffs[1],
      0,
    ];
    return {
      type: 'equation',
      coeffs: nextCoeffs,
      value,
      text: formatEquationFromCoefficients(nextCoeffs, value),
      dimension: 2,
    };
  }

  const inverse = inverse3(matrixEntry.values);
  if (!inverse) return null;
  const nextCoeffs = [
    inverse[0] * coeffs[0] + inverse[3] * coeffs[1] + inverse[6] * coeffs[2],
    inverse[1] * coeffs[0] + inverse[4] * coeffs[1] + inverse[7] * coeffs[2],
    inverse[2] * coeffs[0] + inverse[5] * coeffs[1] + inverse[8] * coeffs[2],
  ];
  return {
    type: 'equation',
    coeffs: nextCoeffs,
    value,
    text: formatEquationFromCoefficients(nextCoeffs, value),
    dimension: 3,
  };
}

export function parseNotebookReferenceLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const meta = splitNotebookLineMeta(line);
  let trimmed = meta.body.trim().replace(/^#\s*/u, '');
  let synchronizedView = null;
  const matrixThenView = trimmed.match(new RegExp(
    `^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s+(?:with|alongside|동시에)\\s+(?:view|camera|시점|카메라)\\s+(1d|2d|3d)$`,
    'iu'
  ));
  const viewThenMatrix = trimmed.match(new RegExp(
    `^(?:view|camera|시점|카메라)\\s+(1d|2d|3d)\\s+(?:with|alongside|동시에)\\s+(${NOTEBOOK_IDENTIFIER_PATTERN})$`,
    'iu'
  ));
  if (matrixThenView) {
    trimmed = matrixThenView[1];
    synchronizedView = matrixThenView[2].toLowerCase();
  } else if (viewThenMatrix) {
    trimmed = viewThenMatrix[2];
    synchronizedView = viewThenMatrix[1].toLowerCase();
  }
  if (!new RegExp(`^${NOTEBOOK_IDENTIFIER_PATTERN}$`, 'u').test(trimmed)) return null;
  const name = resolveNotebookVariableName(trimmed, knownNames);
  const shape = knownShapes.get(notebookVariableKey(name));
  if (!shape) return null;
  if (synchronizedView && shape.kind !== 'matrix') return null;
  return {
    ...meta,
    name,
    refKind: shape.kind,
    shape,
    synchronizedView,
    execute: shape.kind === 'matrix' ? !meta.show || Boolean(meta.execute) : true,
    explicitExecute: Boolean(meta.execute),
  };
}

export function parseNotebookNumericRowLine(line) {
  const trimmed = splitNotebookLineMeta(line).body.trim();
  if (parseNotebookVectorLine(trimmed)) return null;
  if (!trimmed || /[a-zㄱ-ㅎㅏ-ㅣ가-힣一-龥ぁ-んァ-ン=]/i.test(trimmed)) return null;
  if (!/^[\d\s.,/+()-]+$/.test(trimmed)) return null;
  const numberPattern = /[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:\s*\/\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))?/g;
  const matches = trimmed.match(numberPattern) ?? [];
  if (matches.length < 2 || !/\S\s+\S/.test(trimmed)) return null;
  return matches;
}

export function notebookMatrixRowsFromText(text) {
  const source = String(text ?? '').replace(/\r/g, '');
  return source
    .split('\n')
    .map((line) => parseNotebookNumericRowLine(line) ?? [])
    .filter((row) => row.length > 0);
}

export function notebookMatrixModeFromText(text, fallbackMode = '2d') {
  const rows = notebookMatrixRowsFromText(text);
  if (rows.length >= 1 && rows.length <= 3 && rows.every((row) => row.length === rows.length)) {
    return modeForDimension(rows.length);
  }
  const valueCount = rows.reduce((total, row) => total + row.length, 0);
  const dimension = Math.sqrt(valueCount);
  if (Number.isInteger(dimension) && dimension >= 1 && dimension <= 3) return modeForDimension(dimension);
  return fallbackMode;
}

export function matrixValuesFromNotebookText(text, mode = '2d') {
  const resolvedMode = notebookMatrixModeFromText(text, mode);
  const dimension = dimensionForMode(resolvedMode);
  const rows = notebookMatrixRowsFromText(text);
  const rowValues = rows.flatMap((row) => row);
  const values = Array.from({ length: dimension * dimension }, (_, index) =>
    formatPresetInputValue(parseNumber(rowValues[index] ?? (index % (dimension + 1) === 0 ? '1' : '0')))
  );
  return values;
}

export function createNotebookEquationCell(text = '') {
  return {
    id: `equation-cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'equation',
    text,
  };
}

export function createNotebookMatrixCell(mode = '2d') {
  const dimension = dimensionForMode(mode);
  return {
    id: `matrix-cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'matrix',
    mode,
    text: matrixTextFromValues(identityInputValuesForMode(mode), dimension),
  };
}

export function createNotebookNoteCell(text = '') {
  return {
    id: `note-cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'note',
    text,
  };
}

export function multiplyMatrix2(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

export function operationBetweenMatrices(previousMatrix, nextMatrix) {
  const previousMode = modeForMatrix(previousMatrix);
  const nextMode = modeForMatrix(nextMatrix);

  if (previousMode === nextMode) {
    if (nextMode === '1d') {
      const [previousValue] = matrixValuesForMode(previousMatrix, '1d');
      const [nextValue] = matrixValuesForMode(nextMatrix, '1d');
      return {
        isDimensionDrop: false,
        operationMatrix: Math.abs(previousValue) > EPSILON ? [nextValue / previousValue] : [nextValue],
        operationMode: '1d',
      };
    }

    if (nextMode === '2d') {
      const previousValues = matrixValuesForMode(previousMatrix, '2d');
      const nextValues = matrixValuesForMode(nextMatrix, '2d');
      const previousInverse = inverseForStep(previousValues, '2d');
      return {
        isDimensionDrop: false,
        operationMatrix: previousInverse ? multiplyMatrix2(nextValues, previousInverse) : nextValues,
        operationMode: '2d',
      };
    }

    const previousInverse = inverse3(previousMatrix);
    return {
      isDimensionDrop: false,
      operationMatrix: previousInverse ? multiplyMatrix3(nextMatrix, previousInverse) : nextMatrix,
      operationMode: '3d',
    };
  }

  return {
    isDimensionDrop: rankForStep(nextMatrix, nextMode) < rankForStep(previousMatrix, previousMode),
    operationMatrix: nextMatrix,
    operationMode: nextMode,
  };
}

export function matricesAlmostEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(value - b[index]) < EPSILON);
}

export function dragHistoryName(key, locale = 'ko') {
  if (key === 'i') return t(locale, 'axisDragI');
  if (key === 'j') return t(locale, 'axisDragJ');
  if (key === 'k') return t(locale, 'axisDragK');
  return t(locale, 'axisDrag');
}

export function vectorIdFromDragKey(key) {
  return key?.startsWith('v:') ? key.slice(2) : null;
}

export function scalarIdFromDragKey(key) {
  return key?.startsWith('s:') ? key.slice(2) : null;
}

export const equationVariables = ['x', 'y', 'z'];
export const equationLineColors = [0xf59e0b, 0xa855f7, 0xec4899, 0xf97316, 0xd946ef, 0xeab308];
export const vectorPalette = [0x8b5cf6, 0xf59e0b, 0xec4899, 0xf97316, 0xd946ef, 0xeab308];
export const equationExamples = {
  unique: ['x + y = 3', '2x - y = 0'],
  infinite: ['2x + 2y = 4', 'x + y = 2'],
  none: ['x + y = 1', 'x + y = 3'],
  space3d: ['x + y + z = 3', '2x - y + z = 1', 'x + 2y - z = 2'],
  overlap3d: ['x + y + z = 3', '2x - y + z = 1'],
};

export function colorToHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function renderNotebookTaggedText(
  text,
  tokenStyles,
  className = 'scene-caption-variable',
  options = {}
) {
  const source = String(text ?? '');
  const parts = [];
  const allowMath = options.allowMath !== false;
  const tokenPattern = allowMath
    ? /\{\{\s*([\p{L}\p{N}_]+)(?::(expr|value))?\s*\}\}|\*\*([^*\n]+?)\*\*|`([^`\n]+?)`|\\n/giu
    : /\{\{\s*([\p{L}\p{N}_]+)(?::(expr|value))?\s*\}\}|\*\*([^*\n]+?)\*\*|\\n/giu;
  const isSceneCaption = className === 'scene-caption-variable';
  const hoveredVariable = notebookVariableKey(options.hoveredVariable ?? '');
  const canPointToVariable = isSceneCaption && typeof options.onVariableEnter === 'function';
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > cursor) parts.push(source.slice(cursor, match.index));
    if (match[1]) {
      const rawName = match[1];
      const tokenStyle = tokenStyles?.get?.(notebookVariableKey(rawName));
      const label = tokenStyle?.label ?? rawName;
      const variableKey = notebookVariableKey(rawName);
      const linkedToScene = canPointToVariable && Boolean(tokenStyle);
      const variableHovered = linkedToScene && hoveredVariable === variableKey;
      const variableNode = (
        <span
          className={`${className}${tokenStyle ? '' : ' unknown'}${linkedToScene ? ' scene-linked' : ''}${variableHovered ? ' scene-pointed' : ''}`}
          data-scene-variable={linkedToScene ? variableKey : undefined}
          key={`caption-variable-${match.index}-${rawName}`}
          onBlur={linkedToScene ? () => options.onVariableLeave?.(rawName) : undefined}
          onFocus={linkedToScene ? () => options.onVariableEnter(rawName) : undefined}
          onPointerEnter={linkedToScene ? () => options.onVariableEnter(rawName) : undefined}
          onPointerLeave={linkedToScene ? () => options.onVariableLeave?.(rawName) : undefined}
          style={tokenStyle ? { '--caption-variable-color': colorToHex(tokenStyle.color) } : undefined}
          tabIndex={linkedToScene ? 0 : undefined}
        >
          {label}
        </span>
      );
      if (match[2]) {
        const valueText = tokenStyle?.valueText;
        parts.push(
          <code
            className={`${isSceneCaption ? 'scene-caption-math' : 'smart-caption-math'} caption-value-expansion${valueText ? '' : ' unknown'}`}
            key={`caption-value-${match.index}-${rawName}`}
          >
            {variableNode}
            <span className="caption-value-separator">=</span>
            <span className="caption-value-text">{valueText ?? '?'}</span>
          </code>
        );
      } else {
        parts.push(variableNode);
      }
    } else if (match[3]) {
      parts.push(
        <strong
          className={isSceneCaption ? 'scene-caption-emphasis' : 'smart-caption-emphasis'}
          key={`caption-emphasis-${match.index}`}
        >
          {renderNotebookTaggedText(match[3], tokenStyles, className, { ...options, allowMath })}
        </strong>
      );
    } else if (allowMath && match[4]) {
      parts.push(
        <code
          className={isSceneCaption ? 'scene-caption-math' : 'smart-caption-math'}
          key={`caption-math-${match.index}`}
        >
          {renderNotebookTaggedText(
            formatNotebookCaptionMathText(match[4]),
            tokenStyles,
            className,
            { ...options, allowMath: false }
          )}
        </code>
      );
    } else {
      parts.push(isSceneCaption
        ? <br key={`caption-break-${match.index}`} />
        : <span className="smart-caption-break" key={`caption-break-${match.index}`}>\n</span>);
    }
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts.length ? parts : source;
}

export function formatNotebookCaptionMathText(text) {
  return String(text ?? '')
    .replace(/\s*,\s*/gu, ', ')
    .replace(/\s*([=+*×])\s*/gu, ' $1 ')
    .replace(/(?<=[\p{L}\p{N}_})\]])\s*-\s*(?=[\p{L}\p{N}_{([])/gu, ' - ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function equationSceneLabelName(item, mode, index) {
  const authoredName = normalizeNotebookVariableName(
    splitNotebookLineMeta(item?.text ?? '').alias,
    ''
  );
  if (authoredName) return authoredName;
  const prefix = mode === '3d' ? 'P' : 'L';
  return `${prefix}${(item?.index ?? index) + 1}`;
}

export function notebookEquationEntryText(item) {
  const meta = splitNotebookLineMeta(item?.text ?? '');
  return appendNotebookLineMeta(meta.body, { ...meta, alias: item?.name ?? meta.alias });
}

export function equationSceneLabelKey(item, mode, index) {
  return `${mode}:${item?.index ?? index}`;
}

export function equationRevealKey(item, mode, index) {
  return `equation:${mode === '3d' ? 'plane' : 'line'}:${item?.index ?? index}`;
}

export function equationAnchorPoint(item, mode) {
  if (!item) return null;
  const normal = mode === '3d'
    ? new THREE.Vector3(item.a, item.b, item.c)
    : new THREE.Vector3(item.a, item.b, 0);
  const lengthSquared = normal.lengthSq();
  if (lengthSquared < EPSILON) return null;
  return normal.multiplyScalar((Number(item.value) || 0) / lengthSquared);
}

export function equationSceneLabelText(item, mode, index, showCoordinates = true) {
  const name = equationSceneLabelName(item, mode, index);
  if (!showCoordinates) return `${name}\u2032`;
  const coeffs = mode === '3d' ? [item.a, item.b, item.c] : [item.a, item.b, 0];
  return `${name}\u2032 ${formatEquationFromCoefficients(coeffs, item.value)}`;
}

export function createVectorState(index, overrides = {}) {
  const id = overrides.id ?? `v${index + 1}`;
  return {
    id,
    name: overrides.name ?? `v${index + 1}`,
    color: overrides.color ?? vectorPalette[index % vectorPalette.length],
    dimension: overrides.dimension ?? 3,
    x: overrides.x ?? '2',
    y: overrides.y ?? '2',
    z: overrides.z ?? '2',
    visible: overrides.visible ?? true,
    scalarEnabled: overrides.scalarEnabled ?? false,
    scalar: overrides.scalar ?? '1',
    scalarSpace: overrides.scalarSpace === 'output' ? 'output' : 'input',
    renderKind: overrides.renderKind === 'point' ? 'point' : 'arrow',
  };
}

export function parseExpression(expression) {
  const coeffs = [0, 0, 0];
  let constant = 0;
  const compact = expression
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[−–—]/g, '-')
    .replace(/\*/g, '')
    .replace(/,/g, '.')
    .replace(/(\d)\s+([xyz])/gi, '$1$2')
    .replace(/([+\-])\s+([xyz])/gi, '$1$2')
    .replace(/([+\-])\s+/g, '$1')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-');

  if (!compact) return { coeffs, constant };

  const normalized = /^[+\-]/.test(compact) ? compact : `+${compact}`;
  const terms = normalized.match(/[+\-][^+\-]+/g) ?? [];
  if (!terms.length) throw new Error('term');

  terms.forEach((term) => {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.slice(1);
    const numberPattern = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:\\/(?:\\d+(?:\\.\\d*)?|\\.\\d+))?';
    const variableMatch = body.match(new RegExp(`^(${numberPattern})?([xyz])$`, 'i'));

    if (variableMatch) {
      const variableIndex = equationVariables.indexOf(variableMatch[2].toLowerCase());
      const coefficientText = variableMatch[1] ?? '';
      const coefficient = coefficientText ? parseNumber(coefficientText) : 1;
      if (!Number.isFinite(coefficient)) throw new Error('coefficient');
      coeffs[variableIndex] += sign * coefficient;
      return;
    }

    if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:\/(?:\d+(?:\.\d*)?|\.\d+))?$/.test(body)) {
      constant += sign * parseNumber(body);
      return;
    }

    throw new Error('term');
  });

  return { coeffs, constant };
}

export function parseEquation(text) {
  const source = splitNotebookLineMeta(text).body;
  const trimmed = source.normalize('NFKC').replace(/[＝]/g, '=').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('=');
  if (parts.length > 2) throw new Error('equals');

  const left = parseExpression(parts[0]);
  const right = parts.length === 2 ? parseExpression(parts[1]) : { coeffs: [0, 0, 0], constant: 0 };
  return {
    coeffs: left.coeffs.map((value, index) => value - right.coeffs[index]),
    value: right.constant - left.constant,
  };
}

export function formatEquationCoefficient(value, isFirst = false) {
  const sign = value < 0 ? '-' : '+';
  const absolute = Math.abs(value);
  const coefficient = Math.abs(absolute - 1) < EPSILON ? '' : formatMatrixNumber(absolute, 3);
  return `${isFirst ? (sign === '-' ? '- ' : '') : ` ${sign} `}${coefficient}`;
}

export function prettifyEquationLine(text) {
  const meta = splitNotebookLineMeta(text);
  const { body, alias, hidden } = meta;
  if (!body.trim()) return '';
  try {
    const parsed = parseEquation(body);
    if (!parsed) return '';
    const terms = parsed.coeffs
      .map((coefficient, index) => ({ coefficient, variable: equationVariables[index] }))
      .filter((term) => Math.abs(term.coefficient) > EPSILON);
    if (!terms.length) return appendNotebookLineMeta(`0 = ${formatMatrixNumber(parsed.value, 3)}`, meta);

    const left = terms
      .map((term, index) => `${formatEquationCoefficient(term.coefficient, index === 0)}${term.variable}`)
      .join('')
      .trim();
    return appendNotebookLineMeta(`${left} = ${formatMatrixNumber(parsed.value, 3)}`, meta);
  } catch {
    return appendNotebookLineMeta(body.trim().replace(/\s+/g, ' '), meta);
  }
}

export function prettifyEquationNoteText(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => prettifyEquationLine(line))
    .join('\n');
}

export function parsedEquationLine(text) {
  const trimmed = splitNotebookLineMeta(text).body.trim();
  if (!trimmed || !trimmed.includes('=')) return null;
  try {
    const parsed = parseEquation(trimmed);
    if (!parsed || !parsed.coeffs.some((coefficient) => Math.abs(coefficient) > EPSILON)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function prettifyNotebookScriptText(text) {
  let equationCount = 0;
  let vectorCount = 0;
  let matrixCount = 0;
  let calculationCount = 0;
  let solutionCount = 0;
  let sceneMode = NOTEBOOK_SCENE_DEFAULTS.dimension;
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const output = [];
  const knownNames = new Map();
  const knownShapes = new Map();
  const knownScenePresets = createNotebookScenePresetRegistry();

  const prettifyNoteLine = (sourceLine) => {
    const trimmed = String(sourceLine ?? '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('//')) return `// ${trimmed.replace(/^\/\/\s?/u, '').trim()}`;
    if (trimmed.startsWith('#')) return trimmed;
    return `# ${trimmed}`;
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      output.push('');
      index += 1;
      continue;
    }

      const scenePresetDefinition = parseNotebookScenePresetDefinitionLine(line);
      if (scenePresetDefinition) {
        knownScenePresets.set(notebookVariableKey(scenePresetDefinition.name), scenePresetDefinition);
        output.push(notebookScenePresetDefinitionText(scenePresetDefinition));
        index += 1;
        continue;
      }

      const scenePresetUse = parseNotebookScenePresetUseLine(line, knownScenePresets);
      if (scenePresetUse) {
        if (scenePresetUse.value.dimension) sceneMode = scenePresetUse.value.dimension;
        output.push(appendNotebookLineMeta(`use ${scenePresetUse.name}`, scenePresetUse));
        index += 1;
        continue;
      }

      const trimmedLine = line.trim();
      const commentedCalculationCandidate = /^#\s+/u.test(trimmedLine)
        ? parseNotebookCalculationLine(trimmedLine.replace(/^#\s+/u, ''))
        : null;
      const calculationCandidate = parseNotebookCalculationLine(line) ?? (
        commentedCalculationCandidate?.alias ? commentedCalculationCandidate : null
      );
      const calculationWasAutoCommented = calculationCandidate === commentedCalculationCandidate;
      const supportedCalculation = isSupportedNotebookCalculation(
        calculationCandidate,
        knownNames,
        knownShapes
      );
      const equationLine = supportedCalculation ? null : parsedEquationLine(line);
      if (equationLine) {
        equationCount += 1;
        const meta = splitNotebookLineMeta(line);
        const equationIs3d = sceneMode === '3d' || Math.abs(equationLine.coeffs[2]) > EPSILON || /\bz\b/i.test(meta.body);
        if (equationIs3d) sceneMode = '3d';
        const prefix = equationIs3d ? 'P' : 'L';
        const equationAlias = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(meta.alias, `${prefix}${equationCount}`)
        );
        const lineWithAlias = meta.alias
          ? line
          : appendNotebookLineMeta(meta.body, { ...meta, alias: equationAlias });
        knownShapes.set(notebookVariableKey(equationAlias), {
          kind: 'equation',
          coeffs: equationLine.coeffs,
          value: equationLine.value,
          dimension: equationIs3d ? 3 : 2,
        });
      output.push(prettifyEquationLine(lineWithAlias));
      index += 1;
      continue;
      }

      const captionLine = parseNotebookCaptionLine(line);
      if (captionLine) {
        output.push(appendNotebookLineMeta(captionLine.text ? `// ${captionLine.text}` : '//', captionLine));
        index += 1;
        continue;
      }

      const pauseLine = parseNotebookPauseLine(line);
      if (pauseLine) {
        output.push(appendNotebookLineMeta('ns', pauseLine));
        index += 1;
        continue;
      }

      const checkpointLine = parseNotebookCheckpointLine(line);
      if (checkpointLine) {
        output.push(checkpointLine.hidden ? '!checkpoint' : 'checkpoint');
        index += 1;
        continue;
      }

      const inspectLine = parseNotebookInspectLine(line);
      if (inspectLine) {
        output.push(inspectLine.hidden ? '!inspect' : 'inspect');
        index += 1;
        continue;
      }

      const boardAnnotationLine = parseNotebookBoardAnnotationLine(line, knownNames, knownShapes);
      if (boardAnnotationLine) {
        output.push(appendNotebookLineMeta(
          notebookBoardAnnotationText(boardAnnotationLine),
          boardAnnotationLine
        ));
        index += 1;
        continue;
      }

      const focusLine = parseNotebookFocusLine(line, knownNames);
      if (focusLine) {
        output.push(appendNotebookLineMeta(notebookFocusText(focusLine), focusLine));
        index += 1;
        continue;
      }

      const solutionLine = parseNotebookSolutionLine(line, knownNames, knownShapes);
      if (solutionLine) {
        solutionCount += 1;
        const solutionName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(solutionLine.name, `sol${solutionCount}`)
        );
        knownShapes.set(notebookVariableKey(solutionName), { kind: 'solution' });
        output.push(appendNotebookLineMeta(
          `solution(${solutionLine.names.join(', ')})`,
          { ...solutionLine, alias: solutionName }
        ));
        index += 1;
        continue;
      }

      const sceneLine = parseNotebookSceneCommandLine(line);
      if (sceneLine) {
        if (sceneLine.command === 'dimension') sceneMode = sceneLine.value;
        output.push(appendNotebookLineMeta(notebookSceneCommandText(sceneLine), sceneLine));
        index += 1;
        continue;
      }

      const pointLine = parseNotebookPointLine(line);
      if (pointLine) {
        vectorCount += 1;
        const pointName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(pointLine.name, `p${vectorCount}`)
        );
        if (pointLine.dimension >= 3) sceneMode = '3d';
        knownShapes.set(notebookVariableKey(pointName), {
          kind: 'vector',
          dimension: pointLine.dimension,
        });
        const pointText = `point(${pointLine.values.slice(0, pointLine.dimension).join(', ')})`;
        output.push(appendNotebookLineMeta(pointText, { ...pointLine, alias: pointName }));
        index += 1;
        continue;
      }

      const matrixSliceLine = parseNotebookMatrixSliceLine(line, knownNames, knownShapes);
      if (matrixSliceLine) {
        vectorCount += 1;
        const sliceName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(
            matrixSliceLine.name,
            `${matrixSliceLine.axis === 'row' ? 'row' : 'col'}${vectorCount}`
          )
        );
        knownShapes.set(notebookVariableKey(sliceName), {
          kind: 'vector',
          dimension: matrixSliceLine.dimension,
        });
        output.push(appendNotebookLineMeta(
          notebookMatrixSliceText(matrixSliceLine),
          { ...matrixSliceLine, alias: sliceName, execute: true }
        ));
        index += 1;
        continue;
      }

      const measurementLine = parseNotebookMeasurementLine(line, knownNames, knownShapes);
      if (measurementLine) {
        const expression = measurementLine.type === 'dot'
          ? measurementLine.notation === 'product'
            ? `${measurementLine.names[0]} * ${measurementLine.names[1]}`
            : `dot(${measurementLine.names[0]}, ${measurementLine.names[1]})`
          : measurementLine.type === 'sum'
            ? `sum(${measurementLine.names[0]}, ${measurementLine.names[1]})`
            : `det(${measurementLine.names.join(', ')})`;
        output.push(appendNotebookLineMeta(expression, measurementLine));
        index += 1;
        continue;
      }

      const vectorLine = parseNotebookVectorLine(line);
      if (vectorLine) {
      vectorCount += 1;
        if (vectorLine.dimension >= 3) sceneMode = '3d';
        const vectorText = vectorLine.values.slice(0, vectorLine.dimension).join(', ');
      if (vectorLine.alias) {
        rememberNotebookVariableName(knownNames, vectorLine.alias);
        knownShapes.set(notebookVariableKey(vectorLine.alias), {
          kind: 'vector',
          dimension: vectorLine.dimension,
        });
        output.push(appendNotebookLineMeta(vectorText, vectorLine));
        index += 1;
        continue;
      }
      const vectorAlias = normalizeNotebookVariableName(vectorLine.assignedName, `v${vectorCount}`);
      const resolvedVectorAlias = rememberNotebookVariableName(knownNames, vectorAlias);
        knownShapes.set(notebookVariableKey(resolvedVectorAlias), {
          kind: 'vector',
          dimension: vectorLine.dimension,
        });
        const next = vectorLine.assignedName ? `${resolvedVectorAlias} = ${vectorText}` : vectorText;
      output.push(appendNotebookLineMeta(next, { ...vectorLine, alias: resolvedVectorAlias }));
      index += 1;
      continue;
      }

      const calculationLine = calculationCandidate;
      if (calculationLine && supportedCalculation) {
      calculationCount += 1;
        if (calculationLine.operation === 'linearCombination') {
          const resolvedTerms = calculationLine.terms.map((term) => ({
            ...term,
            name: resolveNotebookVariableName(term.name, knownNames),
          }));
          const vectorShapes = resolvedTerms.map((term) =>
            knownShapes.get(notebookVariableKey(term.name))
          );
          const isVectorCombination = vectorShapes.every((shape) => shape?.kind === 'vector');
          const defaultTarget = isVectorCombination ? resolvedTerms[0]?.name : null;
          const expression = formatNotebookLinearCombination(resolvedTerms);
          const rememberCombinationShape = (targetName) => {
            if (!targetName || !isVectorCombination) return;
            const normalizedTarget = rememberNotebookVariableName(knownNames, targetName);
            knownShapes.set(notebookVariableKey(normalizedTarget), {
              kind: 'vector',
              dimension: Math.max(...vectorShapes.map((shape) => shape.dimension ?? 2)),
            });
          };
          if (calculationLine.alias) {
            rememberCombinationShape(calculationLine.alias);
            output.push(appendNotebookLineMeta(expression, {
              ...calculationLine,
              terms: resolvedTerms,
              execute: calculationLine.explicitExecute,
            }));
            index += 1;
            continue;
          }
          if (calculationLine.assignedTarget) {
            const calculationAlias = normalizeNotebookVariableName(calculationLine.assignedTarget, `r${calculationCount}`);
            const resolvedCalculationAlias = rememberNotebookVariableName(knownNames, calculationAlias);
            rememberCombinationShape(resolvedCalculationAlias);
            output.push(appendNotebookLineMeta(`${resolvedCalculationAlias} = ${expression}`, {
              ...calculationLine,
              terms: resolvedTerms,
              alias: undefined,
              execute: calculationLine.explicitExecute,
            }));
            index += 1;
            continue;
          }
          rememberCombinationShape(defaultTarget);
          output.push(appendNotebookLineMeta(expression, {
            ...calculationLine,
            terms: resolvedTerms,
            alias: undefined,
            execute: calculationLine.explicitExecute,
          }));
          index += 1;
          continue;
        }
        const leftName = calculationLine.leftScalar !== null
          ? formatPresetInputValue(calculationLine.leftScalar)
          : resolveNotebookVariableName(calculationLine.left, knownNames);
        const rightName = calculationLine.rightScalar !== null
          ? formatPresetInputValue(calculationLine.rightScalar)
          : resolveNotebookVariableName(calculationLine.right, knownNames);
        const leftShape = calculationLine.leftScalar !== null
          ? { kind: 'scalar' }
          : knownShapes.get(notebookVariableKey(leftName));
        const rightShape = calculationLine.rightScalar !== null
          ? { kind: 'scalar' }
          : knownShapes.get(notebookVariableKey(rightName));
        const isMatrixProduct = leftShape?.kind === 'matrix' && rightShape?.kind === 'matrix';
        const isVectorProduct =
          (leftShape?.kind === 'matrix' && rightShape?.kind === 'vector') ||
          (leftShape?.kind === 'vector' && rightShape?.kind === 'matrix');
        const isEquationProduct =
          (leftShape?.kind === 'matrix' && rightShape?.kind === 'equation') ||
          (leftShape?.kind === 'equation' && rightShape?.kind === 'matrix');
        const isScalarVectorProduct =
          (leftShape?.kind === 'scalar' && rightShape?.kind === 'vector') ||
          (leftShape?.kind === 'vector' && rightShape?.kind === 'scalar');
        const defaultTarget = isMatrixProduct
          ? rightName
          : isVectorProduct
            ? (leftShape?.kind === 'vector' ? leftName : rightName)
            : isEquationProduct
              ? (leftShape?.kind === 'equation' ? leftName : rightName)
              : isScalarVectorProduct
                ? (leftShape?.kind === 'vector' ? leftName : rightName)
              : null;
        const rememberCalculationShape = (targetName) => {
          if (!targetName) return;
          const normalizedTarget = rememberNotebookVariableName(knownNames, targetName);
          const shape = isMatrixProduct
            ? { kind: 'matrix', rows: leftShape.rows, columns: rightShape.columns }
            : isEquationProduct
              ? {
                  kind: 'equation',
                  coeffs: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.coeffs ?? [0, 0, 0],
                  value: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.value ?? 0,
                  dimension: Math.max(leftShape?.dimension ?? 2, rightShape?.dimension ?? 2),
                }
              : isVectorProduct || isScalarVectorProduct
                ? {
                    kind: 'vector',
                    dimension: leftShape?.kind === 'vector'
                      ? leftShape.dimension
                      : rightShape?.kind === 'vector'
                        ? rightShape.dimension
                        : leftShape?.rows ?? rightShape?.dimension ?? 3,
                  }
                : null;
          if (shape) knownShapes.set(notebookVariableKey(normalizedTarget), shape);
        };
        const expression = `${leftName} * ${rightName}`;
      if (calculationLine.alias) {
        rememberNotebookVariableName(knownNames, calculationLine.alias);
        rememberCalculationShape(calculationLine.alias);
        output.push(appendNotebookLineMeta(expression, {
          ...calculationLine,
          execute: calculationLine.explicitExecute,
        }));
        index += 1;
        continue;
      }
      if (calculationLine.assignedTarget) {
        const calculationAlias = normalizeNotebookVariableName(calculationLine.assignedTarget, `r${calculationCount}`);
        const resolvedCalculationAlias = rememberNotebookVariableName(knownNames, calculationAlias);
        rememberCalculationShape(resolvedCalculationAlias);
        output.push(appendNotebookLineMeta(`${resolvedCalculationAlias} = ${expression}`, {
          ...calculationLine,
          alias: undefined,
          execute: calculationLine.explicitExecute,
        }));
        index += 1;
        continue;
      }
      rememberCalculationShape(defaultTarget);
      output.push(appendNotebookLineMeta(expression, {
        ...calculationLine,
        alias: undefined,
        execute: calculationLine.explicitExecute,
      }));
      index += 1;
      continue;
      }

      if (calculationCandidate && !calculationWasAutoCommented) {
        output.push(line.trim());
        index += 1;
        continue;
      }

      const referenceLine = parseNotebookReferenceLine(line, knownNames, knownShapes);
      if (referenceLine) {
        const shouldShowReference = !referenceLine.remove && (
          referenceLine.show || referenceLine.refKind !== 'matrix'
        );
        const referenceText = referenceLine.synchronizedView
          ? `${referenceLine.name} with view ${referenceLine.synchronizedView}`
          : referenceLine.name;
        output.push(appendNotebookLineMeta(referenceText, {
          execute: referenceLine.explicitExecute,
          remove: referenceLine.remove,
          show: shouldShowReference,
          durationSec: referenceLine.durationSec,
        }));
        index += 1;
        continue;
      }

      const numericRow = parseNotebookNumericRowLine(line);
      if (numericRow) {
      const matrixRows = [];
      let rowIndex = index;
      while (rowIndex < lines.length) {
        const row = parseNotebookNumericRowLine(lines[rowIndex]);
        if (!row) break;
        const meta = splitNotebookLineMeta(lines[rowIndex]);
        matrixRows.push({ row, meta });
        rowIndex += 1;
      }

      const rows = matrixRows.length;
      const columns = matrixRows[0]?.row.length ?? 0;
      const hasMatrixBlockBreak = rowIndex >= lines.length || !lines[rowIndex].trim() || rows === columns;
      const isMatrixBlock =
        hasMatrixBlockBreak &&
        rows >= 2 &&
        rows <= 3 &&
        columns >= 1 &&
        columns <= 3 &&
        matrixRows.every((item) => item.row.length === columns);

      if (isMatrixBlock) {
        matrixCount += 1;
        const matrixAlias = matrixRows.map((item) => item.meta.alias).find(Boolean) ?? `M${matrixCount}`;
        const resolvedMatrixAlias = rememberNotebookVariableName(knownNames, matrixAlias);
        const matrixExecute = matrixRows.some((rowItem) => rowItem.meta.execute);
        const matrixRemove = matrixRows.some((rowItem) => rowItem.meta.remove);
        const matrixDurationSec = matrixRows.map((rowItem) => rowItem.meta.durationSec).find(Number.isFinite) ?? null;
        knownShapes.set(notebookVariableKey(resolvedMatrixAlias), {
          kind: 'matrix',
          rows,
          columns,
        });
        matrixRows.forEach((item, itemIndex) => {
          output.push(
            appendNotebookLineMeta(
              item.row.map((value) => formatPresetInputValue(parseNumber(value))).join(' '),
              {
                hidden: item.meta.hidden,
                alias: itemIndex === 0 ? resolvedMatrixAlias : undefined,
                execute: itemIndex === 0 && matrixExecute,
                remove: itemIndex === 0 && matrixRemove,
                durationSec: itemIndex === 0 ? matrixDurationSec : null,
              }
            )
          );
        });
        index = rowIndex;
        continue;
      }

      matrixRows.forEach((item) => {
        output.push(
          appendNotebookLineMeta(
            item.row.map((value) => formatPresetInputValue(parseNumber(value))).join(' '),
            item.meta
          )
        );
      });
      index = rowIndex;
      continue;
    }

    output.push(prettifyNoteLine(line));
    index += 1;
  }

  return output.join('\n');
}

export function buildNotebookAiPrompt(locale, currentNotebookText = '') {
  return buildNotebookAiPromptDocument({
    locale,
    currentNotebookText,
    policyOptions: {
      camera1d: notebookCameraPromptMetrics('1d'),
      camera2d: notebookCameraPromptMetrics('2d'),
      camera3d: notebookCameraPromptMetrics('3d'),
      cameraFovDeg: CAMERA_FOV_DEG,
      zoomMin: String(NOTEBOOK_ZOOM_MIN),
      zoomMax: String(NOTEBOOK_ZOOM_MAX),
      labelOverlapStepPx: LABEL_OVERLAP_STEP_PX,
      labelOverlapAttempts: LABEL_OVERLAP_ATTEMPTS,
      captionDuration: `${NOTEBOOK_DEFAULT_DURATIONS.caption}s`,
      captionMaxDuration: `${NOTEBOOK_DEFAULT_DURATIONS.captionMax}s`,
      checkpointCaptionDuration: `${NOTEBOOK_DEFAULT_DURATIONS.checkpointCaption}s`,
      matrixRevealDuration: `${NOTEBOOK_DEFAULT_DURATIONS.matrixReveal}s`,
      pauseDuration: `${NOTEBOOK_DEFAULT_DURATIONS.pause}s`,
      setupSettleDuration: `${NOTEBOOK_DEFAULT_DURATIONS.setupSettle}s`,
    },
  });
}

export function parseNotebookScript(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const cells = [];
  const marks = Array.from({ length: Math.max(1, lines.length) }, () => null);
  let equationCount = 0;
  let matrixCount = 0;
  let matrixColorCount = 0;
  let vectorCount = 0;
  let calculationCount = 0;
  let measurementCount = 0;
  let solutionCount = 0;
  let scriptMode = NOTEBOOK_SCENE_DEFAULTS.dimension;
  let sceneMode = NOTEBOOK_SCENE_DEFAULTS.dimension;
  let index = 0;
  const knownNames = new Map();
  const knownShapes = new Map();
  const knownScenePresets = createNotebookScenePresetRegistry();

  const flushEquationBlock = (block) => {
    if (!block.length) return;
    const visibleBlock = block.filter((item) => !item.hidden);
    const explicitly3d = block.some((item) => Math.abs(item.parsed.coeffs[2]) > EPSILON || /\bz\b/i.test(item.line));
    const is3d = sceneMode === '3d' || explicitly3d;
    if (is3d) scriptMode = '3d';
    if (explicitly3d) sceneMode = '3d';
    const prefix = is3d ? 'P' : 'L';
    const textBlock = visibleBlock.map((item) => item.body.trim()).join('\n');
    const equationLineDurations = block
      .map((item) => ({
        line: item.index,
        durationSec: notebookDurationSec(item.durationSec, 'equation', {
          hidden: item.hidden,
          remove: item.remove,
        }),
      }))
      .filter((item) => Number.isFinite(item.durationSec) && item.durationSec > 0);
    const equationItems = [];
    const environmentEquations = [];
      block.forEach((item) => {
        equationCount += 1;
        const defaultLabel = `${prefix}${equationCount}`;
        const equationName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(item.alias, defaultLabel)
        );
        const color = equationLineColors[(equationCount - 1) % equationLineColors.length];
        marks[item.index] = {
          kind: 'equation',
          label: equationName,
          color,
          hidden: item.hidden,
        };
        knownShapes.set(notebookVariableKey(equationName), {
          kind: 'equation',
          coeffs: item.parsed.coeffs,
          value: item.parsed.value,
          dimension: is3d ? 3 : 2,
          color,
        });
        const equationEntry = {
          name: equationName,
          text: item.body.trim(),
          coeffs: item.parsed.coeffs,
          value: item.parsed.value,
          color,
          dimension: is3d ? 3 : 2,
        };
        environmentEquations.push(equationEntry);
        if (!item.hidden) equationItems.push(equationEntry);
      });
    cells.push({
      id: `script-equation-${block[0].index}-${block[block.length - 1].index}`,
      type: 'equation',
      text: textBlock,
      equations: equationItems,
      environmentEquations,
      hidden: visibleBlock.length === 0,
      lineDurations: equationLineDurations,
      lineStart: block[0].index,
      lineEnd: block[block.length - 1].index,
    });
  };

  while (index < lines.length) {
    const line = lines[index];
    const lineMeta = splitNotebookLineMeta(line);
    const trimmed = lineMeta.body.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const scenePresetDefinition = parseNotebookScenePresetDefinitionLine(lines[index]);
    if (scenePresetDefinition) {
      knownScenePresets.set(notebookVariableKey(scenePresetDefinition.name), scenePresetDefinition);
      marks[index] = {
        kind: 'scene',
        label: 'SET',
        color: 0x64748b,
        hidden: false,
      };
      index += 1;
      continue;
    }

    const scenePresetUse = parseNotebookScenePresetUseLine(lines[index], knownScenePresets);
    if (scenePresetUse) {
      if (scenePresetUse.value.dimension) {
        sceneMode = scenePresetUse.value.dimension;
        scriptMode = sceneMode;
      }
      const hasCameraChange = Boolean(scenePresetUse.value.view) || Number.isFinite(scenePresetUse.value.zoom);
      marks[index] = {
        kind: 'scene',
        label: 'CFG',
        color: 0x0ea5e9,
        hidden: scenePresetUse.hidden,
      };
      cells.push({
        id: `script-scene-preset-${index}`,
        type: 'scene',
        command: 'preset',
        presetName: scenePresetUse.name,
        value: scenePresetUse.value,
        hidden: scenePresetUse.hidden,
        durationSec: notebookDurationSec(
          scenePresetUse.durationSec,
          hasCameraChange ? 'camera' : 'scene',
          { hidden: scenePresetUse.hidden }
        ),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const captionLine = parseNotebookCaptionLine(lines[index]);
    if (captionLine) {
      marks[index] = {
        kind: 'caption',
        label: 'CC',
        color: 0xf1b434,
        hidden: captionLine.hidden,
      };
      cells.push({
        id: `script-caption-${index}`,
        type: 'caption',
        text: captionLine.text,
        hidden: captionLine.hidden,
        remove: captionLine.remove,
        durationExplicit: Number.isFinite(captionLine.durationSec),
        durationSec: notebookDurationSec(captionLine.durationSec, 'caption', {
          hidden: captionLine.hidden,
          remove: captionLine.remove,
          text: captionLine.text,
        }),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const pauseLine = parseNotebookPauseLine(lines[index]);
    if (pauseLine) {
      marks[index] = {
        kind: 'pause',
        label: 'NS',
        color: 0x64748b,
        hidden: pauseLine.hidden,
      };
      cells.push({
        id: `script-pause-${index}`,
        type: 'pause',
        hidden: pauseLine.hidden,
        durationSec: notebookDurationSec(pauseLine.durationSec, 'pause', {
          hidden: pauseLine.hidden,
          remove: pauseLine.remove,
        }),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const checkpointLine = parseNotebookCheckpointLine(lines[index]);
    if (checkpointLine) {
      marks[index] = {
        kind: 'checkpoint',
        label: 'OK',
        color: 0x14b8a6,
        hidden: checkpointLine.hidden,
      };
      cells.push({
        id: `script-checkpoint-${index}`,
        type: 'checkpoint',
        hidden: checkpointLine.hidden,
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const inspectLine = parseNotebookInspectLine(lines[index]);
    if (inspectLine) {
      marks[index] = {
        kind: 'inspect',
        label: 'LOOK',
        color: 0x38bdf8,
        hidden: inspectLine.hidden,
      };
      cells.push({
        id: `script-inspect-${index}`,
        type: 'inspect',
        hidden: inspectLine.hidden,
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const focusLine = parseNotebookFocusLine(lines[index], knownNames);
    if (focusLine) {
      marks[index] = {
        kind: 'focus',
        label: focusLine.mode === 'hard' ? 'HFX' : 'FX',
        color: focusLine.mode === 'hard' ? 0xf59e0b : 0xfacc15,
        hidden: focusLine.hidden,
      };
      cells.push({
        id: `script-focus-${index}`,
        type: 'focus',
        names: focusLine.names,
        clear: focusLine.clear,
        mode: focusLine.mode,
        hidden: focusLine.hidden,
        durationSec: notebookDurationSec(focusLine.durationSec, 'focus', {
          hidden: focusLine.hidden,
        }),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const boardAnnotationLine = parseNotebookBoardAnnotationLine(lines[index], knownNames, knownShapes);
    if (boardAnnotationLine) {
      marks[index] = {
        kind: 'focus',
        label: 'MK',
        color: 0xfbbf24,
        hidden: boardAnnotationLine.hidden,
      };
      cells.push({
        id: `script-board-annotation-${index}`,
        type: 'boardAnnotation',
        ...boardAnnotationLine,
        durationSec: notebookDurationSec(boardAnnotationLine.durationSec, 'focus', {
          hidden: boardAnnotationLine.hidden,
        }),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const solutionLine = parseNotebookSolutionLine(lines[index], knownNames, knownShapes);
    if (solutionLine) {
      solutionCount += 1;
      const solutionShapes = solutionLine.names
        .map((name) => knownShapes.get(notebookVariableKey(name)))
        .filter((shape) => shape?.kind === 'equation');
      const solutionMode = solutionShapes.some((shape) => shape.dimension === 3) ? '3d' : '2d';
      const solutionAnalysis = analyzeEquationGeometry(
        solutionShapes.map((shape) => formatEquationFromCoefficients(shape.coeffs, shape.value)),
        solutionMode
      );
      const noCommonPoint = solutionTraceHasNoCommonPoint(solutionAnalysis);
      const solutionName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(solutionLine.name, `sol${solutionCount}`)
      );
      marks[index] = {
        kind: 'solution',
        label: solutionName,
        color: 0xf1b434,
        hidden: solutionLine.hidden,
      };
      cells.push({
        id: `script-solution-${index}`,
        type: 'solution',
        name: solutionName,
        names: solutionLine.names,
        hidden: solutionLine.hidden,
        remove: solutionLine.remove,
        durationSec: notebookDurationSec(solutionLine.durationSec, 'solution', {
          hidden: solutionLine.hidden,
          remove: solutionLine.remove,
          noCommonPoint,
        }),
        lineStart: index,
        lineEnd: index,
      });
      knownShapes.set(notebookVariableKey(solutionName), { kind: 'solution' });
      index += 1;
      continue;
    }

    const sceneLine = parseNotebookSceneCommandLine(lines[index]);
    if (sceneLine) {
      if (sceneLine.command === 'dimension') {
        sceneMode = sceneLine.value;
        scriptMode = sceneMode;
      }
      const markLabels = {
        field: 'FLD',
        spaceReset: 'RST',
        clear: 'CLR',
        dimension: 'DIM',
        view: 'CAM',
        orbit: 'ORB',
        zoom: 'ZOOM',
        axes: 'AX',
        relativeAxes: 'RAX',
        grid: 'GR',
        relativeGrid: 'RGR',
        coordinates: 'XYZ',
        basis: 'B',
        vectors: 'V',
      };
      marks[index] = {
        kind: 'scene',
        label: markLabels[sceneLine.command] ?? 'SCN',
        color: 0x0ea5e9,
        hidden: sceneLine.hidden,
      };
      cells.push({
        id: `script-scene-${index}`,
        type: 'scene',
        command: sceneLine.command,
        value: sceneLine.value,
        hidden: sceneLine.hidden,
        durationExplicit: Number.isFinite(sceneLine.durationSec),
        durationSec: notebookDurationSec(
          sceneLine.durationSec,
          sceneLine.command === 'orbit'
            ? 'orbit'
            : sceneLine.command === 'view' || sceneLine.command === 'zoom'
              ? 'camera'
            : sceneLine.command === 'spaceReset' || sceneLine.command === 'dimension'
              ? 'matrix'
              : 'scene',
          { hidden: sceneLine.hidden, remove: sceneLine.command === 'clear' }
        ),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const pointLine = parseNotebookPointLine(lines[index]);
    if (pointLine) {
      vectorCount += 1;
      const pointName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(pointLine.name, `p${vectorCount}`)
      );
      const pointColor = vectorPalette[(vectorCount - 1) % vectorPalette.length];
      if (pointLine.dimension >= 3) {
        scriptMode = '3d';
        sceneMode = '3d';
      }
      marks[index] = {
        kind: 'vector',
        label: pointName,
        color: pointColor,
        hidden: pointLine.hidden,
      };
      cells.push({
        id: `script-point-${index}`,
        type: 'vector',
        visualKind: 'point',
        name: pointName,
        values: pointLine.values,
        dimension: pointLine.dimension,
        color: pointColor,
        hidden: pointLine.hidden,
        remove: pointLine.remove,
        durationSec: notebookDurationSec(pointLine.durationSec, 'vector', {
          hidden: pointLine.hidden,
          remove: pointLine.remove,
        }),
        lineStart: index,
        lineEnd: index,
      });
      knownShapes.set(notebookVariableKey(pointName), {
        kind: 'vector',
        dimension: pointLine.dimension,
        color: pointColor,
      });
      index += 1;
      continue;
    }

    const matrixSliceLine = parseNotebookMatrixSliceLine(lines[index], knownNames, knownShapes);
    if (matrixSliceLine) {
      vectorCount += 1;
      const sliceName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(
          matrixSliceLine.name,
          `${matrixSliceLine.axis === 'row' ? 'row' : 'col'}${vectorCount}`
        )
      );
      const sliceColor = vectorPalette[(vectorCount - 1) % vectorPalette.length];
      marks[index] = {
        kind: 'vector',
        label: sliceName,
        color: sliceColor,
        hidden: matrixSliceLine.hidden,
      };
      cells.push({
        id: `script-matrix-slice-${index}`,
        type: 'slice',
        resultKind: 'vector',
        name: sliceName,
        matrixName: matrixSliceLine.matrixName,
        axis: matrixSliceLine.axis,
        sliceIndex: matrixSliceLine.index,
        dimension: matrixSliceLine.dimension,
        color: sliceColor,
        hidden: matrixSliceLine.hidden,
        remove: matrixSliceLine.remove,
        durationSec: notebookDurationSec(matrixSliceLine.durationSec, 'vector', {
          hidden: matrixSliceLine.hidden,
          remove: matrixSliceLine.remove,
        }),
        lineStart: index,
        lineEnd: index,
      });
      knownShapes.set(notebookVariableKey(sliceName), {
        kind: 'vector',
        dimension: matrixSliceLine.dimension,
        color: sliceColor,
      });
      index += 1;
      continue;
    }

    const measurementLine = parseNotebookMeasurementLine(lines[index], knownNames, knownShapes);
    if (measurementLine) {
      measurementCount += 1;
      const measurementPrefix = measurementLine.type === 'dot'
        ? 'dot'
        : measurementLine.type === 'sum'
          ? 'sum'
          : 'det';
      const defaultLabel = `${measurementPrefix}${measurementCount}`;
      const measurementName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(measurementLine.alias, defaultLabel)
      );
      marks[index] = {
        kind: 'measurement',
        label: measurementName,
        color: measurementLine.type === 'dot'
          ? MEASURE_DOT_HEX
          : measurementLine.type === 'sum'
            ? MEASURE_SUM_HEX
            : measurementLine.names.length >= 3
              ? MEASURE_VOLUME_HEX
              : MEASURE_AREA_HEX,
        hidden: measurementLine.hidden,
      };
      cells.push({
        id: `script-measure-${index}`,
        type: 'measurement',
        measureType: measurementLine.type,
        name: measurementName,
        names: measurementLine.names,
        hidden: measurementLine.hidden,
        durationSec: notebookDurationSec(measurementLine.durationSec, 'measurement', {
          hidden: measurementLine.hidden,
          remove: measurementLine.remove,
        }),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const vectorLine = parseNotebookVectorLine(lines[index]);
    if (vectorLine) {
      vectorCount += 1;
      const vectorName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(vectorLine.name, `v${vectorCount}`)
      );
      const vectorColor = vectorPalette[(vectorCount - 1) % vectorPalette.length];
      if (vectorLine.dimension >= 3) {
        scriptMode = '3d';
        sceneMode = '3d';
      }
      marks[index] = {
        kind: 'vector',
        label: vectorName,
        color: vectorColor,
        hidden: vectorLine.hidden,
      };
      cells.push({
        id: `script-vector-${index}`,
        type: 'vector',
        name: vectorName,
        values: vectorLine.values,
        dimension: vectorLine.dimension,
        color: vectorColor,
        hidden: vectorLine.hidden,
        execute: vectorLine.execute,
        remove: vectorLine.remove,
        durationSec: vectorLine.execute || vectorLine.remove
          ? notebookDurationSec(vectorLine.durationSec, 'vector', {
              hidden: vectorLine.hidden,
              remove: vectorLine.remove,
            })
          : null,
        lineStart: index,
        lineEnd: index,
      });
      knownShapes.set(notebookVariableKey(vectorName), {
        kind: 'vector',
        dimension: vectorLine.dimension,
        color: vectorColor,
      });
      index += 1;
      continue;
    }

    const calculationLine = parseNotebookCalculationLine(lines[index]);
    if (calculationLine && isSupportedNotebookCalculation(calculationLine, knownNames, knownShapes)) {
      calculationCount += 1;
      if (calculationLine.operation === 'linearCombination') {
        const resolvedTerms = calculationLine.terms.map((term) => ({
          ...term,
          name: resolveNotebookVariableName(term.name, knownNames),
        }));
        const vectorShapes = resolvedTerms.map((term) =>
          knownShapes.get(notebookVariableKey(term.name))
        );
        const isVectorCombination = vectorShapes.every((shape) => shape?.kind === 'vector');
        const defaultTarget = isVectorCombination ? resolvedTerms[0]?.name : null;
        const hasCalculationTarget = Boolean(calculationLine.target || defaultTarget);
        const calculationName = hasCalculationTarget
          ? rememberNotebookVariableName(
              knownNames,
              normalizeNotebookVariableName(calculationLine.target ?? defaultTarget, `r${calculationCount}`)
            )
          : null;
        const resultDimension = isVectorCombination
          ? Math.max(...vectorShapes.map((shape) => shape.dimension ?? 2))
          : 2;
        const existingTargetShape = hasCalculationTarget
          ? knownShapes.get(notebookVariableKey(calculationName))
          : null;
        const calculationColor = existingTargetShape?.color
          ?? vectorPalette[(vectorCount + calculationCount - 1) % vectorPalette.length];
        marks[index] = hasCalculationTarget
          ? {
              kind: 'vector',
              label: calculationName,
              color: calculationColor,
              hidden: calculationLine.hidden,
            }
          : { kind: 'note', label: '', color: calculationColor, hidden: calculationLine.hidden };
        cells.push({
          id: `script-calc-${index}`,
          type: 'calc',
          operation: 'linearCombination',
          resultKind: 'vector',
          dimension: resultDimension,
          execute: calculationLine.execute,
          name: calculationName,
          terms: resolvedTerms,
          color: calculationColor,
          hidden: calculationLine.hidden,
          remove: calculationLine.remove,
          durationSec: notebookDurationSec(calculationLine.durationSec, 'calculation', {
            hidden: calculationLine.hidden,
            remove: calculationLine.remove,
          }),
          lineStart: index,
          lineEnd: index,
        });
        if (hasCalculationTarget && isVectorCombination) {
          knownShapes.set(notebookVariableKey(calculationName), {
            kind: 'vector',
            dimension: resultDimension,
            color: calculationColor,
          });
        }
        index += 1;
        continue;
      }
      const leftName = calculationLine.leftScalar !== null
        ? formatPresetInputValue(calculationLine.leftScalar)
        : resolveNotebookVariableName(calculationLine.left, knownNames);
      const rightName = calculationLine.rightScalar !== null
        ? formatPresetInputValue(calculationLine.rightScalar)
        : resolveNotebookVariableName(calculationLine.right, knownNames);
      const leftShape = calculationLine.leftScalar !== null
        ? { kind: 'scalar' }
        : knownShapes.get(notebookVariableKey(leftName));
      const rightShape = calculationLine.rightScalar !== null
        ? { kind: 'scalar' }
        : knownShapes.get(notebookVariableKey(rightName));
      const isMatrixProduct = leftShape?.kind === 'matrix' && rightShape?.kind === 'matrix';
      const isVectorProduct =
        (leftShape?.kind === 'matrix' && rightShape?.kind === 'vector') ||
        (leftShape?.kind === 'vector' && rightShape?.kind === 'matrix');
      const isEquationProduct =
        (leftShape?.kind === 'matrix' && rightShape?.kind === 'equation') ||
        (leftShape?.kind === 'equation' && rightShape?.kind === 'matrix');
      const isScalarVectorProduct =
        (leftShape?.kind === 'scalar' && rightShape?.kind === 'vector') ||
        (leftShape?.kind === 'vector' && rightShape?.kind === 'scalar');
      const defaultTarget = isMatrixProduct
        ? rightName
        : isVectorProduct
          ? (leftShape?.kind === 'vector' ? leftName : rightName)
          : isEquationProduct
            ? (leftShape?.kind === 'equation' ? leftName : rightName)
            : isScalarVectorProduct
              ? (leftShape?.kind === 'vector' ? leftName : rightName)
            : null;
      const hasCalculationTarget = Boolean(calculationLine.target || defaultTarget);
      const calculationName = hasCalculationTarget
        ? rememberNotebookVariableName(
            knownNames,
            normalizeNotebookVariableName(calculationLine.target ?? defaultTarget, `r${calculationCount}`)
          )
        : null;
      const resultRows = isMatrixProduct ? leftShape.rows : null;
      const resultColumns = isMatrixProduct ? rightShape.columns : null;
      const resultKind = isMatrixProduct ? 'matrix' : isEquationProduct ? 'equation' : 'vector';
      const resultDimension = isMatrixProduct
        ? Math.max(resultRows ?? 1, resultColumns ?? 1)
        : isEquationProduct
          ? Math.max(leftShape?.dimension ?? 2, rightShape?.dimension ?? 2)
          : leftShape?.kind === 'vector'
            ? leftShape.dimension
            : rightShape?.kind === 'vector'
              ? rightShape.dimension
              : leftShape?.rows ?? rightShape?.dimension ?? 2;
      const existingTargetShape = hasCalculationTarget
        ? knownShapes.get(notebookVariableKey(calculationName))
        : null;
      const generatedCalculationColor = isMatrixProduct
        ? NOTEBOOK_MATRIX_PALETTE[matrixColorCount % NOTEBOOK_MATRIX_PALETTE.length]
        : isEquationProduct
          ? equationLineColors[(equationCount + calculationCount - 1) % equationLineColors.length]
          : vectorPalette[(vectorCount + calculationCount - 1) % vectorPalette.length];
      const calculationColor = existingTargetShape?.color ?? generatedCalculationColor;
      if (isMatrixProduct && !Number.isFinite(existingTargetShape?.color)) {
        matrixColorCount += 1;
      }
      marks[index] = hasCalculationTarget
        ? {
            kind: resultKind,
            label: calculationName,
            color: calculationColor,
            hidden: calculationLine.hidden,
          }
        : { kind: 'note', label: '', color: calculationColor, hidden: calculationLine.hidden };
      cells.push({
        id: `script-calc-${index}`,
        type: 'calc',
        resultKind,
        execute: calculationLine.execute,
        name: calculationName,
        left: leftName,
        right: rightName,
        leftScalar: calculationLine.leftScalar,
        rightScalar: calculationLine.rightScalar,
        rows: resultRows,
        columns: resultColumns,
        dimension: resultDimension,
        color: calculationColor,
        hidden: calculationLine.hidden,
        remove: calculationLine.remove,
        durationSec: notebookDurationSec(calculationLine.durationSec, 'calculation', {
          hidden: calculationLine.hidden,
          remove: calculationLine.remove,
        }),
        lineStart: index,
        lineEnd: index,
      });
      if (hasCalculationTarget) {
        knownShapes.set(notebookVariableKey(calculationName), isMatrixProduct
          ? { kind: 'matrix', rows: resultRows, columns: resultColumns, color: calculationColor }
          : isEquationProduct
            ? {
                kind: 'equation',
                coeffs: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.coeffs ?? [0, 0, 0],
                value: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.value ?? 0,
                dimension: resultDimension,
                color: calculationColor,
              }
            : {
                kind: 'vector',
                dimension: resultDimension,
                color: calculationColor,
              }
        );
      }
      index += 1;
      continue;
    }

    const referenceLine = parseNotebookReferenceLine(lines[index], knownNames, knownShapes);
    if (referenceLine) {
      const refColor = referenceLine.shape?.color ?? (referenceLine.refKind === 'matrix'
        ? NOTEBOOK_MATRIX_HEX
        : referenceLine.refKind === 'equation'
          ? equationLineColors[equationCount % equationLineColors.length]
          : vectorPalette[vectorCount % vectorPalette.length]);
      marks[index] = {
        kind: referenceLine.remove ? 'note' : referenceLine.refKind,
        label: referenceLine.remove ? '' : referenceLine.name,
        color: refColor,
        hidden: referenceLine.hidden,
      };
      cells.push({
        id: `script-ref-${index}`,
        type: 'ref',
        name: referenceLine.name,
        refKind: referenceLine.refKind,
        color: refColor,
        dimension: referenceLine.shape?.dimension ?? Math.max(
          referenceLine.shape?.rows ?? 1,
          referenceLine.shape?.columns ?? 1
        ),
        synchronizedView: referenceLine.synchronizedView,
        execute: referenceLine.execute,
        remove: referenceLine.remove,
        hidden: referenceLine.hidden,
        durationSec: notebookDurationSec(
          referenceLine.durationSec,
          referenceLine.refKind === 'matrix'
            ? referenceLine.execute === false
              ? 'matrixReveal'
              : 'matrix'
            : 'reference',
          {
          hidden: referenceLine.hidden,
          remove: referenceLine.remove,
          }
        ),
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const equationBlock = [];
    while (index < lines.length) {
      const parsed = parsedEquationLine(lines[index]);
      if (!parsed) break;
      const { body, alias, hidden, durationSec, remove } = splitNotebookLineMeta(lines[index]);
      equationBlock.push({ index, line: lines[index], body, alias, hidden, durationSec, remove, parsed });
      index += 1;
    }
    if (equationBlock.length) {
      flushEquationBlock(equationBlock);
      continue;
    }

    const matrixRows = [];
    const startIndex = index;
    while (index < lines.length) {
      const row = parseNotebookNumericRowLine(lines[index]);
      if (!row) break;
      const rowMeta = splitNotebookLineMeta(lines[index]);
      matrixRows.push({
        index,
        row,
        alias: rowMeta.alias,
        hidden: rowMeta.hidden,
        execute: rowMeta.execute,
        remove: rowMeta.remove,
        durationSec: rowMeta.durationSec,
      });
      index += 1;
    }
    if (matrixRows.length) {
      const rows = matrixRows.length;
      const columns = matrixRows[0]?.row.length ?? 0;
      const hasMatrixBlockBreak = index >= lines.length || !lines[index].trim() || rows === columns;
      if (
        hasMatrixBlockBreak &&
        rows >= 2 &&
        rows <= 3 &&
        columns >= 1 &&
        columns <= 3 &&
        matrixRows.every((item) => item.row.length === columns)
      ) {
        matrixCount += 1;
        const matrixAlias = matrixRows.map((item) => item.alias).find(Boolean);
        const matrixName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(matrixAlias, `M${matrixCount}`)
        );
        const existingMatrixShape = knownShapes.get(notebookVariableKey(matrixName));
        const matrixColor = Number.isFinite(existingMatrixShape?.color)
          ? existingMatrixShape.color
          : NOTEBOOK_MATRIX_PALETTE[matrixColorCount % NOTEBOOK_MATRIX_PALETTE.length];
        if (!Number.isFinite(existingMatrixShape?.color)) matrixColorCount += 1;
        const matrixHidden = matrixRows.some((item) => item.hidden);
        const matrixExecute = matrixRows.some((item) => item.execute);
        const matrixRemove = matrixRows.some((item) => item.remove);
        const explicitMatrixDurationSec = matrixRows.map((item) => item.durationSec).find(Number.isFinite) ?? null;
        const matrixDurationSec = notebookDurationSec(
          explicitMatrixDurationSec,
          matrixExecute ? 'matrix' : 'matrixReveal',
          {
            hidden: matrixHidden,
            remove: matrixRemove,
          }
        );
        const scriptDimension = dimensionForMode(sceneMode);
        const shouldEmbedSquare = rows === columns && rows < scriptDimension;
        const targetRows = shouldEmbedSquare ? scriptDimension : rows;
        const targetColumns = shouldEmbedSquare ? scriptDimension : columns;
        const mode = operationModeForShape(targetRows, targetColumns);
        const values = shouldEmbedSquare
          ? matrixInputValuesForShape(identity3, targetRows, targetColumns).map(formatPresetInputValue)
          : Array.from({ length: targetRows * targetColumns }, () => '0');
        matrixRows.forEach((item, rowIndex) => {
          item.row.forEach((value, columnIndex) => {
            values[rowIndex * targetColumns + columnIndex] = formatPresetInputValue(parseNumber(value));
          });
        });
        const matrixText = matrixTextFromShapeValues(values, targetRows, targetColumns);
        marks[startIndex] = {
          kind: 'matrix',
          label: matrixName,
          color: matrixColor,
          span: matrixRows.length,
          hidden: matrixHidden,
        };
        matrixRows.slice(1).forEach((item) => {
          marks[item.index] = { kind: 'matrix-row', label: '', color: matrixColor, hidden: matrixHidden };
        });
        cells.push({
          id: `script-matrix-${startIndex}-${matrixRows[matrixRows.length - 1].index}`,
          type: 'matrix',
          name: matrixName,
          execute: matrixExecute,
          mode,
          rows: targetRows,
          columns: targetColumns,
          values,
          text: matrixText,
          color: matrixColor,
          hidden: matrixHidden,
          remove: matrixRemove,
          durationSec: matrixDurationSec,
          lineStart: startIndex,
          lineEnd: matrixRows[matrixRows.length - 1].index,
        });
        knownShapes.set(notebookVariableKey(matrixName), {
          kind: 'matrix',
          rows: targetRows,
          columns: targetColumns,
          color: matrixColor,
        });
      }
      continue;
    }

    marks[index] = { kind: 'note', label: '', color: 0x8b5cf6, hidden: lineMeta.hidden };
    index += 1;
  }

  if (!cells.length) {
    cells.push({
      id: 'script-empty',
      type: 'equation',
      text: '',
      lineStart: 0,
      lineEnd: 0,
    });
  }

  return {
    cells: batchNotebookSceneSetupCells(cells),
    lineCount: Math.max(1, lines.length),
    marks,
    mode: scriptMode,
  };
}

export function notebookMatrixCellSignature(cell) {
  if (
    !cell ||
    (
      cell.type !== 'matrix' &&
      !(cell.type === 'calc' && cell.resultKind === 'matrix') &&
      !(cell.type === 'ref' && cell.refKind === 'matrix')
    )
  ) return '';
  const values = cell.type === 'calc'
    ? `${cell.left ?? ''}*${cell.right ?? ''}`
    : cell.type === 'ref'
      ? `${cell.name ?? ''}`
      : Array.isArray(cell.values)
      ? cell.values.join(',')
      : String(cell.text ?? '');
  return [
    cell.lineStart ?? 0,
    cell.lineEnd ?? cell.lineStart ?? 0,
    `${cell.rows ?? ''}x${cell.columns ?? ''}`,
    cell.execute === false ? 'declare' : 'execute',
    cell.durationSec ?? '',
    cell.synchronizedView ?? '',
    cell.matrixName ?? '',
    cell.axis ?? '',
    cell.sliceIndex ?? '',
    values,
  ].join(':');
}

export function notebookMatrixSignatures(cells) {
  return cells
    .filter((cell) =>
      !cell.hidden &&
      (
        cell.type === 'matrix' ||
        (cell.type === 'calc' && cell.resultKind === 'matrix') ||
        (cell.type === 'ref' && cell.refKind === 'matrix')
      )
    )
    .map(notebookMatrixCellSignature);
}

export function notebookModeForCells(cells, fallback = NOTEBOOK_SCENE_DEFAULTS.view) {
  return notebookOpeningSceneState(cells, {
    ...NOTEBOOK_SCENE_DEFAULTS,
    view: fallback,
  }).view;
}

export function notebookCellSignature(cell) {
  if (!cell) return '';
  const serializedValue = cell.value && typeof cell.value === 'object'
    ? JSON.stringify(cell.value)
    : cell.value ?? '';
  return [
    cell.type,
    cell.lineStart ?? '',
    cell.lineEnd ?? '',
    cell.name ?? '',
    cell.hidden ? 'hidden' : '',
    cell.execute === false ? 'declare' : 'execute',
    cell.remove ? 'remove' : '',
    cell.durationSec ?? '',
    Array.isArray(cell.lineDurations)
      ? cell.lineDurations.map((item) => `${item.line ?? ''}=${item.durationSec ?? ''}`).join(',')
      : '',
    cell.resultKind ?? '',
    cell.refKind ?? '',
    cell.visualKind ?? '',
    cell.command ?? '',
    cell.presetName ?? '',
    cell.kind ?? '',
    cell.matrixName ?? '',
    cell.row ?? '',
    cell.column ?? '',
    cell.clear ? 'clear' : '',
    serializedValue,
    cell.synchronizedView ?? '',
    cell.text ?? '',
    Array.isArray(cell.values) ? cell.values.join(',') : '',
    cell.left ?? '',
    cell.right ?? '',
    Array.isArray(cell.terms)
      ? cell.terms.map((term) => `${term.scalar ?? 1}*${term.name ?? ''}`).join('+')
      : '',
    Array.isArray(cell.names) ? cell.names.join(',') : '',
  ].join(':');
}

export function solveEquationSystem(equations) {
  const parsedRows = [];
  const errors = [];

  equations.forEach((equation, index) => {
    try {
      const parsed = parseEquation(equation);
      if (parsed) parsedRows.push({ ...parsed, sourceIndex: index });
    } catch {
      errors.push(index + 1);
    }
  });

  if (errors.length) return { status: 'invalid', errors };
  if (!parsedRows.length) return { status: 'empty' };

  const matrix = parsedRows.map((row) => [...row.coeffs, row.value]);
  const pivotColumns = [];
  let pivotRow = 0;

  for (let column = 0; column < equationVariables.length && pivotRow < matrix.length; column += 1) {
    let bestRow = pivotRow;
    for (let row = pivotRow + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[bestRow][column])) {
        bestRow = row;
      }
    }

    if (Math.abs(matrix[bestRow][column]) < EPSILON) continue;

    [matrix[pivotRow], matrix[bestRow]] = [matrix[bestRow], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    for (let col = column; col <= equationVariables.length; col += 1) {
      matrix[pivotRow][col] /= pivot;
    }

    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = matrix[row][column];
      if (Math.abs(factor) < EPSILON) continue;
      for (let col = column; col <= equationVariables.length; col += 1) {
        matrix[row][col] -= factor * matrix[pivotRow][col];
      }
    }

    pivotColumns.push(column);
    pivotRow += 1;
  }

  matrix.forEach((row) => {
    row.forEach((value, index) => {
      if (Math.abs(value) < EPSILON) row[index] = 0;
    });
  });

  const rankA = pivotColumns.length;
  const rankAugmented = matrix.filter((row) => row.some((value) => Math.abs(value) > EPSILON)).length;
  const inconsistent = matrix.some((row) =>
    row.slice(0, equationVariables.length).every((value) => Math.abs(value) < EPSILON) &&
    Math.abs(row[equationVariables.length]) > EPSILON
  );

  if (inconsistent) {
    return { status: 'none', rows: parsedRows, rref: matrix, rankA, rankAugmented };
  }

  const pivotRows = pivotColumns.map((column, row) => ({ column, row }));
  const particular = [0, 0, 0];
  pivotRows.forEach(({ column, row }) => {
    particular[column] = snapValue(matrix[row][equationVariables.length]);
  });

  if (rankA === equationVariables.length) {
    return {
      status: 'unique',
      rows: parsedRows,
      rref: matrix,
      rankA,
      rankAugmented,
      solution: particular,
      particular,
      nullspaceBasis: [],
    };
  }

  const freeColumns = equationVariables
    .map((_, index) => index)
    .filter((column) => !pivotColumns.includes(column));
  const nullspaceBasis = freeColumns.map((freeColumn) => {
    const basis = [0, 0, 0];
    basis[freeColumn] = 1;
    pivotRows.forEach(({ column, row }) => {
      basis[column] = snapValue(-matrix[row][freeColumn]);
    });
    return basis;
  });

  return {
    status: 'infinite',
    rows: parsedRows,
    rref: matrix,
    rankA,
    rankAugmented,
    solution: particular,
    particular,
    nullspaceBasis,
  };
}

export function solutionDisplayDimension(mode = '3d') {
  if (mode === '1d') return 1;
  return mode === '2d' ? 2 : 3;
}

export function solutionValuesForMode(values, mode = '3d') {
  return (values ?? []).slice(0, solutionDisplayDimension(mode));
}

export function formatSolutionTuple(values, mode = '3d') {
  return `(${solutionValuesForMode(values, mode).map((value) => formatNumber(value)).join(', ')})`;
}

export function solutionActiveNullspaceBasis(solution, mode = '3d') {
  const dimension = solutionDisplayDimension(mode);
  return (solution?.nullspaceBasis ?? []).filter((basis) =>
    solutionValuesForMode(basis, mode).some((value) => Math.abs(value) > EPSILON)
  ).map((basis) => basis.slice(0, dimension));
}

export function solutionGeometryDegrees(solution, mode = '3d') {
  return solutionActiveNullspaceBasis(solution, mode).length;
}

export function formatGeneralSolution(solution, mode = '3d') {
  if (!solution || solution.status !== 'infinite') return '';
  const parameters = ['s', 't', 'u'];
  const basisTerms = solutionActiveNullspaceBasis(solution, mode).map(
    (basis, index) => `${parameters[index]}${formatSolutionTuple(basis, mode)}`
  );
  return [formatSolutionTuple(solution.particular, mode), ...basisTerms].join(' + ');
}

export function formatLineSolutionEquation(line) {
  if (!line) return '';
  return formatEquationFromCoefficients([line.a, line.b, 0], line.value);
}

export function solutionGeometryLabelKey(solution, mode = '3d') {
  const degrees = solutionGeometryDegrees(solution, mode);
  if (degrees === 1) return 'solutionKindLine';
  if (degrees >= 2) return 'solutionKindPlane';
  return null;
}

export function formatSceneSolutionGeometryLabel(solution, locale, coordinatesVisible, mode = '3d') {
  const labelKindKey = solutionGeometryLabelKey(solution, mode);
  if (!labelKindKey) return '';
  const degrees = solutionGeometryDegrees(solution, mode);
  const baseLabel = `${t(locale, 'solution')} ${t(locale, labelKindKey)}`;
  if (!coordinatesVisible || degrees >= 2) return baseLabel;
  const generalSolution = formatGeneralSolution(solution, mode);
  return generalSolution ? `${baseLabel} ${generalSolution}` : baseLabel;
}

export function solutionLabelAnchor(solution, mode = '3d') {
  if (!solution || solution.status !== 'infinite' || !solution.nullspaceBasis?.length) return null;
  const activeBasis = solutionActiveNullspaceBasis(solution, mode);
  if (activeBasis.length === 1) {
    const anchor = closestSolutionCenter(solutionValuesForMode(solution.particular, mode), activeBasis).toArray();
    return mode === '2d' ? [anchor[0] ?? 0, anchor[1] ?? 0, 0] : anchor;
  }
  return [
    Number(solution.particular?.[0]) || 0,
    Number(solution.particular?.[1]) || 0,
    Number(solution.particular?.[2]) || 0,
  ];
}

export function parseLineEquation(text, index) {
  const parsed = parseEquation(text);
  if (!parsed) return null;
  const [a, b, z] = parsed.coeffs;
  if (Math.abs(a) < EPSILON && Math.abs(b) < EPSILON) {
    return { error: true, index };
  }
  return {
    a,
    b,
    z,
    value: parsed.value,
    color: equationLineColors[index % equationLineColors.length],
    index,
    text,
  };
}

export function relationBetweenLines(lineA, lineB) {
  const det = lineA.a * lineB.b - lineA.b * lineB.a;
  if (Math.abs(det) < EPSILON) {
    const sameA = lineA.a * lineB.value - lineB.a * lineA.value;
    const sameB = lineA.b * lineB.value - lineB.b * lineA.value;
    return {
      type: Math.abs(sameA) < EPSILON && Math.abs(sameB) < EPSILON ? 'same' : 'parallel',
    };
  }

  return {
    type: 'intersect',
    point: [
      (lineA.value * lineB.b - lineA.b * lineB.value) / det,
      (lineA.a * lineB.value - lineA.value * lineB.a) / det,
    ],
  };
}

export function satisfiesLine(line, point) {
  return Math.abs(line.a * point[0] + line.b * point[1] - line.value) < 0.015;
}

export function lineSegmentForEquation(line, range = 9) {
  const points = [];
  const pushPoint = (x, y) => {
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= -range - EPSILON &&
      x <= range + EPSILON &&
      y >= -range - EPSILON &&
      y <= range + EPSILON &&
      !points.some((point) => Math.abs(point[0] - x) < 0.001 && Math.abs(point[1] - y) < 0.001)
    ) {
      points.push([x, y]);
    }
  };

  if (Math.abs(line.b) > EPSILON) {
    pushPoint(-range, (line.value - line.a * -range) / line.b);
    pushPoint(range, (line.value - line.a * range) / line.b);
  }
  if (Math.abs(line.a) > EPSILON) {
    pushPoint((line.value - line.b * -range) / line.a, -range);
    pushPoint((line.value - line.b * range) / line.a, range);
  }

  return points.slice(0, 2);
}

export function scalarLineSegmentForEquation(line, range = SCALAR_CONSTRAINT_LINE_RANGE) {
  const normalLengthSquared = line.a * line.a + line.b * line.b;
  if (normalLengthSquared < EPSILON) return [];
  const anchorX = (line.a * line.value) / normalLengthSquared;
  const anchorY = (line.b * line.value) / normalLengthSquared;
  const tangentLength = Math.hypot(line.a, line.b);
  if (tangentLength < EPSILON) return [];
  const tangentX = -line.b / tangentLength;
  const tangentY = line.a / tangentLength;
  return [
    [anchorX - tangentX * range, anchorY - tangentY * range],
    [anchorX + tangentX * range, anchorY + tangentY * range],
  ];
}

export function disposeObject3D(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

export function clearEquationGroup(group) {
  if (!group) return;
  [...group.children].forEach((child) => {
    disposeObject3D(child);
    group.remove(child);
  });
}

export function createDotMeasurementVisual() {
  const group = new THREE.Group();
  const mainGeometry = new THREE.BufferGeometry();
  const guideGeometry = new THREE.BufferGeometry();
  const mainMaterial = new THREE.LineBasicMaterial({
    color: MEASURE_DOT_HEX,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  });
  const guideMaterial = new THREE.LineDashedMaterial({
    color: MEASURE_DOT_GUIDE_HEX,
    transparent: true,
    opacity: 0.32,
    dashSize: 0.12,
    gapSize: 0.08,
    depthTest: false,
    depthWrite: false,
  });
  const pointGeometry = new THREE.SphereGeometry(0.055, 18, 12);
  const pointMaterial = new THREE.MeshBasicMaterial({
    color: MEASURE_DOT_HEX,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const mainLine = new THREE.LineSegments(mainGeometry, mainMaterial);
  const guideLine = new THREE.LineSegments(guideGeometry, guideMaterial);
  const point = new THREE.Mesh(pointGeometry, pointMaterial);
  group.add(mainLine, guideLine, point);
  return { kind: 'dot', group, mainLine, guideLine, point };
}

export function createSumGuideLine() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineDashedMaterial({
    color: MEASURE_SUM_GUIDE_HEX,
    transparent: true,
    opacity: 0.42,
    dashSize: 0.14,
    gapSize: 0.1,
    depthTest: false,
    depthWrite: false,
  });
  return new THREE.Line(geometry, material);
}

export function createSumMeasurementVisual() {
  const group = new THREE.Group();
  const resultArrow = createSceneArrow(MEASURE_SUM_HEX);
  const translatedGuide = createSumGuideLine();
  const parallelGuide = createSumGuideLine();
  const pointGeometry = new THREE.SphereGeometry(0.065, 18, 12);
  const pointMaterial = new THREE.MeshBasicMaterial({
    color: MEASURE_SUM_HEX,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const point = new THREE.Mesh(pointGeometry, pointMaterial);

  resultArrow.line.material.transparent = true;
  resultArrow.cone.material.transparent = true;
  resultArrow.line.material.depthWrite = false;
  resultArrow.cone.material.depthWrite = false;
  group.add(parallelGuide, translatedGuide, resultArrow, point);
  return {
    kind: 'sum',
    group,
    resultArrow,
    translatedGuide,
    parallelGuide,
    point,
  };
}

export function createVolumeMeasurementVisual() {
  const group = new THREE.Group();
  const meshGeometry = new THREE.BufferGeometry();
  const edgeGeometry = new THREE.BufferGeometry();
  const meshMaterial = new THREE.MeshBasicMaterial({
    color: MEASURE_AREA_HEX,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: MEASURE_AREA_EDGE_HEX,
    transparent: true,
    opacity: 0.86,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  group.add(mesh, edges);
  return { kind: 'volume', group, mesh, edges };
}

export function disposeMeasurementVisual(visual) {
  if (!visual) return;
  visual.group.parent?.remove(visual.group);
  disposeObject3D(visual.group);
}

export function getMeasurementVisual(refs, item, kind) {
  if (!refs.measurementVisuals) refs.measurementVisuals = new Map();
  let visual = refs.measurementVisuals.get(item.id);
  if (!visual || visual.kind !== kind) {
    disposeMeasurementVisual(visual);
    visual = kind === 'dot'
      ? createDotMeasurementVisual()
      : kind === 'sum'
        ? createSumMeasurementVisual()
        : createVolumeMeasurementVisual();
    refs.measurementGroup.add(visual.group);
    refs.measurementVisuals.set(item.id, visual);
  }
  visual.group.visible = true;
  return visual;
}

export function parseEquationRows(equations) {
  const rows = [];
  const errors = [];

  equations.forEach((equation, index) => {
    try {
      const parsed = parseEquation(equation);
      if (parsed) rows.push({ ...parsed, sourceIndex: index, text: equation });
    } catch {
      errors.push(index + 1);
    }
  });

  return { rows, errors };
}

export function analyzeLineSystem(equations) {
  const errors = [];
  const lines = [];

  equations.forEach((equation, index) => {
    try {
      const line = parseLineEquation(equation, index);
      if (!line) return;
      if (line.error) errors.push(index + 1);
      else lines.push(line);
    } catch {
      errors.push(index + 1);
    }
  });

  if (errors.length) return { status: 'invalid', errors, lines, relations: [] };
  if (!lines.length) return { status: 'empty', lines, relations: [] };
  if (lines.length === 1) return { status: 'single', lines, relations: [] };

  const relations = [];
  let candidate = null;
  let hasParallelConflict = false;

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const relation = relationBetweenLines(lines[i], lines[j]);
      relations.push({ ...relation, a: i, b: j });
      if (relation.type === 'intersect' && !candidate) candidate = relation.point;
      if (relation.type === 'parallel') hasParallelConflict = true;
    }
  }

  if (candidate) {
    const isCommonPoint = lines.every((line) => satisfiesLine(line, candidate));
    return {
      status: isCommonPoint ? 'unique' : 'none',
      lines,
      relations,
      point: candidate,
    };
  }

  return {
    status: hasParallelConflict ? 'parallel' : 'same',
    lines,
    relations,
  };
}

export function analyzeEquationGeometry(equations, modeHint = null) {
  const { rows, errors } = parseEquationRows(equations);
  const base = {
    mode: '2d',
    lines: [],
    planes: [],
    relations: [],
    errors,
  };

  if (errors.length) return { ...base, status: 'invalid' };
  if (!rows.length) return { ...base, status: 'empty' };

  const hasZ = rows.some((row) => Math.abs(row.coeffs[2]) > EPSILON);
  const use3d = modeHint === '3d' || hasZ;
  if (!use3d) {
    return {
      ...analyzeLineSystem(equations),
      mode: '2d',
      planes: [],
      solution: solveEquationSystem(equations),
    };
  }

  const solution = solveEquationSystem(equations);
  const planes = rows
    .filter((row) => row.coeffs.some((value) => Math.abs(value) > EPSILON))
    .map((row) => ({
      a: row.coeffs[0],
      b: row.coeffs[1],
      c: row.coeffs[2],
      value: row.value,
      color: equationLineColors[row.sourceIndex % equationLineColors.length],
      index: row.sourceIndex,
      text: row.text,
    }));

  let status = solution.status;
  if (solution.status === 'unique') status = 'unique3d';
  if (solution.status === 'infinite') status = planes.length === 1 ? 'single3d' : 'infinite3d';
  if (solution.status === 'none') status = 'none3d';

  return {
    ...base,
    mode: '3d',
    status,
    planes,
    point: solution.status === 'unique' ? solution.solution : null,
    solution,
    rankA: solution.rankA,
    rankAugmented: solution.rankAugmented,
  };
}

export function statusKeyForLineSystem(status) {
  if (status === 'single') return 'solutionStatusSingle';
  if (status === 'unique') return 'solutionStatusUnique';
  if (status === 'same') return 'solutionStatusSame';
  if (status === 'parallel') return 'solutionStatusParallel';
  if (status === 'none') return 'solutionStatusNone';
  if (status === 'single3d') return 'solutionStatusSingle3d';
  if (status === 'unique3d') return 'solutionStatusUnique';
  if (status === 'infinite3d') return 'solutionStatusInfinite3d';
  if (status === 'none3d') return 'solutionStatusNone';
  if (status === 'invalid') return 'invalidFormat';
  return 'waitingInput';
}

export function modeForSolutionDimension(dimension = 3) {
  if (dimension <= 1) return '1d';
  if (dimension === 2) return '2d';
  return '3d';
}

export function outputModeForSystemMode(sourceMode = '2d', matrix = identity3) {
  const sourceDimension = solutionDisplayDimension(sourceMode);
  const outputRank = rank3(matrix);
  const outputDimension = Math.max(1, Math.min(sourceDimension, outputRank || 1));
  return modeForSolutionDimension(outputDimension);
}

export function sourceSolutionDimensionForLineSystem(lineSystem) {
  if (!lineSystem) return null;
  if (lineSystem.status === 'unique' || lineSystem.status === 'unique3d') return 0;
  if (lineSystem.status === 'single') return 1;
  if (lineSystem.status === 'same') return 1;
  if (lineSystem.status === 'single3d') return 2;
  if (lineSystem.status === 'infinite3d') {
    return lineSystem.solution?.nullspaceBasis?.length ?? null;
  }
  return null;
}

export function displaySolutionDimensionForLineSystem(lineSystem, displayMode = lineSystem?.mode ?? '2d') {
  const sourceDimension = sourceSolutionDimensionForLineSystem(lineSystem);
  if (sourceDimension === null) return null;
  return Math.min(sourceDimension, solutionDisplayDimension(displayMode));
}

export function statusKeyForLineSystemDisplay(lineSystem, displayMode = lineSystem?.mode ?? '2d') {
  const projectedDimension = displaySolutionDimensionForLineSystem(lineSystem, displayMode);
  if (lineSystem?.status === 'single3d' && projectedDimension === 1) return 'solutionStatusSingle';
  return statusKeyForLineSystem(lineSystem?.status);
}

export function buildLineSystemInfo(lineSystem, displayMode = lineSystem.mode) {
  const displayDimension = solutionDisplayDimension(displayMode);
  const variableCount = Math.min(lineSystem.mode === '3d' ? 3 : 2, displayDimension);
  const equationCount = lineSystem.mode === '3d' ? lineSystem.planes.length : lineSystem.lines.length;
  const rankA = lineSystem.solution?.rankA ?? lineSystem.rankA;
  const rankAugmented = lineSystem.solution?.rankAugmented ?? lineSystem.rankAugmented;
  const sourceSolutionDimension = sourceSolutionDimensionForLineSystem(lineSystem);
  const projectedSolutionDimension = displaySolutionDimensionForLineSystem(lineSystem, displayMode);
  const freeCount = projectedSolutionDimension ?? (typeof rankA === 'number' ? Math.max(0, variableCount - rankA) : null);

  let solutionDimension = projectedSolutionDimension;

  let kindKey = null;
  const shouldShowKind =
    lineSystem.status !== 'single' &&
    !(lineSystem.status === 'single3d' && projectedSolutionDimension === sourceSolutionDimension);
  if (shouldShowKind && solutionDimension === 0) kindKey = 'solutionKindPoint';
  if (shouldShowKind && solutionDimension === 1) kindKey = 'solutionKindLine';
  if (shouldShowKind && solutionDimension === 2) kindKey = 'solutionKindPlane';
  if (lineSystem.status === 'none' || lineSystem.status === 'parallel' || lineSystem.status === 'none3d') {
    kindKey = 'solutionKindEmpty';
  }

  let noteKey = 'solutionEducationWaiting';
  if (lineSystem.status === 'invalid') noteKey = 'solutionEducationInvalid';
  else if (lineSystem.status === 'unique' || lineSystem.status === 'unique3d') noteKey = 'solutionEducationPoint';
  else if (lineSystem.status === 'single' || lineSystem.status === 'single3d') {
    noteKey = solutionDimension === 1 ? 'solutionEducationLine' : 'solutionEducationWaiting';
  }
  else if (lineSystem.status === 'same') noteKey = 'solutionEducationLine';
  else if (lineSystem.status === 'infinite3d') {
    noteKey = solutionDimension === 1 ? 'solutionEducationLine' : 'solutionEducationPlane';
  } else if (lineSystem.status === 'none' || lineSystem.status === 'parallel' || lineSystem.status === 'none3d') {
    noteKey = 'solutionEducationNone';
  }

  let solutionText = '';
  if (lineSystem.point) {
    solutionText = formatCoord(lineSystem.point, displayMode);
  } else if (lineSystem.mode === '2d' && lineSystem.status === 'same') {
    solutionText = formatLineSolutionEquation(lineSystem.lines[0]);
  } else if (lineSystem.status === 'infinite3d') {
    solutionText = formatGeneralSolution(lineSystem.solution, displayMode);
  }

  return {
    equationCount,
    freeCount,
    kindKey,
    noteKey,
    rankA,
    rankAugmented,
    solutionDimension,
    solutionText,
    variableCount,
  };
}

export function relationText(relation, lines) {
  const left = `L${lines[relation.a].index + 1}`;
  const right = `L${lines[relation.b].index + 1}`;
  if (relation.type === 'same') return `${left} = ${right}`;
  if (relation.type === 'parallel') return `${left} ∥ ${right}`;
  return `${left} × ${right} ${formatCoord([relation.point[0], relation.point[1]], '2d')}`;
}

export function createPlaneObjects(plane, size = 6.5, muted = false) {
  const normal = new THREE.Vector3(plane.a, plane.b, plane.c);
  const normalLengthSquared = normal.lengthSq();
  if (normalLengthSquared < EPSILON) return [];

  const anchor = normal.clone().multiplyScalar(plane.value / normalLengthSquared);
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(normal, helper).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  const corners = [
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, size),
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, size),
  ];
  const positions = corners.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.055 : 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  mesh.renderOrder = 30;

  const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
    corners[0], corners[1],
    corners[1], corners[2],
    corners[2], corners[3],
    corners[3], corners[0],
  ]);
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.34 : 0.72,
      depthTest: false,
      depthWrite: false,
    })
  );
  edges.renderOrder = 31;

  return [mesh, edges];
}

export function transformedPointForMatrix(matrix, point) {
  const [x, y, z] = transformVector3(matrix, [point.x, point.y, point.z]);
  return new THREE.Vector3(x, y, z);
}

export function createTransformedPlaneObjects(plane, matrix, size = 5.8, muted = false) {
  const normal = new THREE.Vector3(plane.a, plane.b, plane.c);
  const normalLengthSquared = normal.lengthSq();
  if (normalLengthSquared < EPSILON) return [];

  const anchor = normal.clone().multiplyScalar(plane.value / normalLengthSquared);
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(normal, helper).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  const inputCorners = [
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, size),
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, size),
  ];
  const corners = inputCorners.map((point) => transformedPointForMatrix(matrix, point));
  const positions = corners.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.07 : 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  mesh.renderOrder = 30;

  const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
    corners[0], corners[1],
    corners[1], corners[2],
    corners[2], corners[3],
    corners[3], corners[0],
  ]);
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.42 : 0.88,
      depthTest: false,
      depthWrite: false,
    })
  );
  edges.renderOrder = 31;

  return [mesh, edges];
}

export function createLineObjects(line, range = SCALAR_CONSTRAINT_LINE_RANGE) {
  const segment = scalarLineSegmentForEquation(line, range);
  if (segment.length < 2) return [];
  const start = new THREE.Vector3(segment[0][0], segment[0][1], 0.024);
  const end = new THREE.Vector3(segment[1][0], segment[1][1], 0.024);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const lineMesh = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    })
  );
  lineMesh.renderOrder = 34;

  const glowCurve = new THREE.LineCurve3(start, end);
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(glowCurve, 28, 0.045, 10, false),
    new THREE.MeshBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
    })
  );
  glow.renderOrder = 33;
  return [glow, lineMesh];
}

export function createTransformedLineObjects(line, matrix, range = SCALAR_CONSTRAINT_LINE_RANGE) {
  const segment = scalarLineSegmentForEquation(line, range);
  if (segment.length < 2) return [];

  const start = transformedPointForMatrix(matrix, new THREE.Vector3(segment[0][0], segment[0][1], 0.024));
  const end = transformedPointForMatrix(matrix, new THREE.Vector3(segment[1][0], segment[1][1], 0.024));

  if (start.distanceToSquared(end) < EPSILON) {
    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 12),
      new THREE.MeshBasicMaterial({
        color: line.color,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false,
      })
    );
    point.position.copy(start);
    point.renderOrder = 35;
    return [point];
  }

  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const lineMesh = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    })
  );
  lineMesh.renderOrder = 34;

  const glowCurve = new THREE.LineCurve3(start, end);
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(glowCurve, 28, 0.045, 10, false),
    new THREE.MeshBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
    })
  );
  glow.renderOrder = 33;
  return [glow, lineMesh];
}

export function createScalarPointObjects(point, color) {
  const tickStart = point.clone().add(new THREE.Vector3(0, -0.38, 0.024));
  const tickEnd = point.clone().add(new THREE.Vector3(0, 0.38, 0.024));
  const tickGeometry = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
  const tick = new THREE.Line(
    tickGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
    })
  );
  tick.renderOrder = 34;

  const pointMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
    })
  );
  pointMesh.position.copy(point);
  pointMesh.renderOrder = 35;
  return [tick, pointMesh];
}

export function closestSolutionCenter(particular, basisVectors) {
  const anchor = new THREE.Vector3(...particular);
  const basis = basisVectors
    .map((values) => new THREE.Vector3(...values))
    .filter((vector) => vector.lengthSq() > EPSILON);

  if (basis.length === 1) {
    const direction = basis[0].clone().normalize();
    return anchor.addScaledVector(direction, -anchor.dot(direction));
  }

  if (basis.length >= 2) {
    const u = basis[0];
    const v = basis[1];
    const uu = u.dot(u);
    const uv = u.dot(v);
    const vv = v.dot(v);
    const det = uu * vv - uv * uv;

    if (Math.abs(det) > EPSILON) {
      const bp = -u.dot(anchor);
      const cp = -v.dot(anchor);
      const s = (bp * vv - cp * uv) / det;
      const t = (uu * cp - uv * bp) / det;
      return anchor.addScaledVector(u, s).addScaledVector(v, t);
    }
  }

  return anchor;
}

export function createSolutionHighlightObjects(solution, color = 0xf1b434, size = 5.8) {
  if (!solution || solution.status !== 'infinite' || !solution.nullspaceBasis?.length) return [];
  if (solution.nullspaceBasis.length !== 1) return [];

  const center = closestSolutionCenter(solution.particular, solution.nullspaceBasis);
  const objects = [];

  solution.nullspaceBasis.slice(0, 2).forEach((basis) => {
    const direction = new THREE.Vector3(...basis);
    if (direction.lengthSq() < EPSILON) return;
    direction.normalize();
    const start = center.clone().addScaledVector(direction, -size);
    const end = center.clone().addScaledVector(direction, size);
    const curve = new THREE.LineCurve3(start, end);

    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.04, 10, false),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
      })
    );
    glow.renderOrder = 36;

    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.014, 8, false),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.84,
        depthTest: false,
        depthWrite: false,
      })
    );
    core.renderOrder = 37;

    objects.push(glow, core);
  });

  const centerDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 20, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
    })
  );
  centerDot.position.copy(center);
  centerDot.renderOrder = 38;
  objects.push(centerDot);

  return objects;
}

export function createSolutionTraceVisual(markerCount = 3) {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.visible = false;
  const markers = Array.from({ length: markerCount }, (_, index) => {
    const marker = new THREE.Group();
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xf1b434,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xf1b434,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      })
    );
    halo.renderOrder = 39 + index * 2;
    core.renderOrder = 40 + index * 2;
    marker.visible = false;
    marker.add(halo, core);
    group.add(marker);
    return { marker, halo, core };
  });
  return { group, markers };
}

export function solutionTraceStartPoint(item, mode, target, options = {}) {
  const {
    camera = null,
    sceneMatrix = null,
    startFromAbove = false,
  } = options;
  const verticalScore = (point) => {
    if (!camera) return point.y;
    const projected = point.clone();
    if (sceneMatrix) projected.applyMatrix4(sceneMatrix);
    projected.project(camera);
    return Number.isFinite(projected.y) ? projected.y : point.y;
  };
  const chooseCandidate = (candidates) => {
    candidates.sort((left, right) => {
      const leftScore = verticalScore(left);
      const rightScore = verticalScore(right);
      const verticalOrder = startFromAbove
        ? rightScore - leftScore
        : leftScore - rightScore;
      return (
        verticalOrder ||
        right.distanceToSquared(target) - left.distanceToSquared(target)
      );
    });
    return candidates[0];
  };

  if (mode === '2d') {
    const segment = lineSegmentForEquation(item);
    if (segment.length >= 2) {
      const candidates = segment.map(
        ([x, y]) => new THREE.Vector3(x, y, target.z)
      );
      return chooseCandidate(candidates);
    }
  }

  const normal = new THREE.Vector3(item?.a ?? 0, item?.b ?? 0, item?.c ?? 0);
  if (normal.lengthSq() < EPSILON) {
    return chooseCandidate([
      target.clone().add(new THREE.Vector3(0, -3.8, 0)),
      target.clone().add(new THREE.Vector3(0, 3.8, 0)),
    ]);
  }
  normal.normalize();
  const reference = Math.abs(normal.z) < 0.86
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(normal, reference);
  if (tangent.lengthSq() < EPSILON) tangent.set(0, -1, 0);
  tangent.normalize();
  return chooseCandidate([
    target.clone().addScaledVector(tangent, 3.8),
    target.clone().addScaledVector(tangent, -3.8),
  ]);
}

export function solutionTraceHasNoCommonPoint(lineSystem) {
  return ['none', 'none3d', 'parallel'].includes(lineSystem?.status);
}

export function solutionTraceReferencePoint(item, mode) {
  const normal = new THREE.Vector3(
    item?.a ?? 0,
    item?.b ?? 0,
    mode === '3d' ? item?.c ?? 0 : 0
  );
  const lengthSquared = normal.lengthSq();
  if (lengthSquared < EPSILON) {
    return new THREE.Vector3(0, 0, mode === '3d' ? 0 : 0.055);
  }
  return normal
    .multiplyScalar((item?.value ?? 0) / lengthSquared)
    .setZ(mode === '3d' ? normal.z : 0.055);
}

export function solutionTraceItems(lineSystem, selection, limit = Infinity) {
  const mode = lineSystem?.mode === '3d' ? '3d' : '2d';
  const sourceItems = mode === '3d' ? lineSystem?.planes ?? [] : lineSystem?.lines ?? [];
  const selectedKeys = new Set((selection?.names ?? []).map(notebookVariableKey));
  const matchedItems = sourceItems.filter((item, index) =>
    selectedKeys.has(notebookVariableKey(equationSceneLabelName(item, mode, index)))
  );
  return (matchedItems.length ? matchedItems : sourceItems).slice(0, limit);
}

export function solutionTraceAnchor(lineSystem, selection) {
  const mode = lineSystem?.mode === '3d' ? '3d' : '2d';
  const items = solutionTraceItems(lineSystem, selection);
  if (!items.length) return new THREE.Vector3(0, 0, mode === '3d' ? 0 : 0.055);
  const anchor = items.reduce(
    (sum, item) => sum.add(solutionTraceReferencePoint(item, mode)),
    new THREE.Vector3()
  );
  return anchor.multiplyScalar(1 / items.length);
}

export function solutionTraceStartsNearCaption(caption, renderer, camera, target, sceneMatrix) {
  if (!caption || caption.classList.contains('caption-hidden')) return false;
  const canvas = renderer?.domElement;
  if (!canvas || !camera) return false;
  const captionRect = caption.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  if (captionRect.height <= 0 || canvasRect.height <= 0) return false;

  const projectedTarget = target.clone();
  if (sceneMatrix) projectedTarget.applyMatrix4(sceneMatrix);
  projectedTarget.project(camera);
  if (!Number.isFinite(projectedTarget.y)) return false;

  const targetScreenY =
    canvasRect.top + (1 - projectedTarget.y) * canvasRect.height * 0.5;
  const captionCenterY = captionRect.top + captionRect.height * 0.5;
  return captionCenterY < targetScreenY;
}

export const SOLUTION_TRACE_TRAVEL_END = 0.82;
export const SOLUTION_TRACE_FADE_END = 0.97;
export const SOLUTION_TRACE_HIDE_AT = 0.985;

export function updateSolutionTraceVisual(visual, lineSystem, selection, progress, options = {}) {
  if (!visual) return;
  const targetValues = lineSystem?.point;
  const rawProgress = clamp01(progress);
  const convergesToPoint = Boolean(
    targetValues &&
    (lineSystem?.status === 'unique' || lineSystem?.status === 'unique3d')
  );
  const hasNoCommonPoint = solutionTraceHasNoCommonPoint(lineSystem);
  if (
    !selection ||
    (!convergesToPoint && !hasNoCommonPoint) ||
    rawProgress <= 0 ||
    rawProgress >= SOLUTION_TRACE_HIDE_AT
  ) {
    visual.group.visible = false;
    visual.markers.forEach(({ marker }) => {
      marker.visible = false;
    });
    return;
  }

  const mode = lineSystem.mode === '3d' ? '3d' : '2d';
  const items = solutionTraceItems(lineSystem, selection, visual.markers.length);
  if (!items.length) {
    visual.group.visible = false;
    return;
  }

  const target = convergesToPoint
    ? new THREE.Vector3(
        targetValues[0] ?? 0,
        targetValues[1] ?? 0,
        mode === '3d' ? targetValues[2] ?? 0 : 0.055
      )
    : null;
  const travelProgress = easeInOut(
    clamp01(rawProgress / SOLUTION_TRACE_TRAVEL_END)
  );
  const appearProgress = easeOutCubic(clamp01(rawProgress / 0.12));
  const mergeFade = 1 - easeInOut(clamp01(
    (rawProgress - SOLUTION_TRACE_TRAVEL_END) /
      (SOLUTION_TRACE_FADE_END - SOLUTION_TRACE_TRAVEL_END)
  ));
  const markerOpacity = appearProgress * mergeFade;

  visual.group.visible = markerOpacity > 0.004;
  visual.markers.forEach(({ marker, halo, core }, index) => {
    const item = items[index];
    if (!item) {
      marker.visible = false;
      return;
    }
    const referenceTarget = target ?? solutionTraceReferencePoint(item, mode);
    const start = solutionTraceStartPoint(item, mode, referenceTarget, options);
    const destination = hasNoCommonPoint
      ? solutionTraceStartPoint(item, mode, referenceTarget, {
          ...options,
          startFromAbove: !options.startFromAbove,
        })
      : target;
    marker.position.lerpVectors(start, destination, travelProgress);
    marker.scale.setScalar(0.88 + easeOutCubic(clamp01((rawProgress - 0.5) / 0.2)) * 0.16);
    marker.visible = markerOpacity > 0.004;
    halo.material.color.set(item.color ?? 0xf1b434);
    core.material.color.set(item.color ?? 0xf1b434);
    halo.material.opacity = 0.22 * markerOpacity;
    core.material.opacity = 0.96 * markerOpacity;
  });
}

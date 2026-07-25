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
  localeOrderWithPreferredFirst,
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
  NOTEBOOK_CAPTION_EDGE_GAP,
  sceneVerticalFovForViewport,
  startControlPanelResize,
  suggestedNotebookTitle,
  useMediaQuery,
  useMobileKeyboardOpen,
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

import {
  ANIMATION_MS,
  CAMERA_MOVE_MS,
  UI_SYNC_MS,
  NOTEBOOK_UI_SYNC_MS,
  CONTROL_PANEL_DEFAULT_WIDTH,
  CONTROL_PANEL_MIN_WIDTH,
  CONTROL_PANEL_MAX_WIDTH,
  CONTROL_PANEL_MIN_SCENE_WIDTH,
  CONTROL_PANEL_STORAGE_KEY,
  NOTEBOOK_EDITOR_DEFAULT_HEIGHT,
  NOTEBOOK_EDITOR_MIN_HEIGHT,
  NOTEBOOK_EDITOR_MAX_HEIGHT,
  NOTEBOOK_COMPOSER_FIXED_HEIGHT,
  NOTEBOOK_EDITOR_HEIGHT_STORAGE_KEY,
  NOTEBOOK_PROGRESS_HANDLE_CENTER_INSET,
  VECTOR_SPAWN_MS,
  SOLUTION_REVEAL_MS,
  NOTEBOOK_FOCUS_SETTLE_MS,
  NOTEBOOK_AUTHORED_HARD_FOCUS_COMPARE_MS,
  NOTEBOOK_HARD_FOCUS_BLEND_IN_TAU_MS,
  NOTEBOOK_HARD_FOCUS_BLEND_OUT_TAU_MS,
  NOTEBOOK_CAPTION_HARD_FOCUS_BLEND_OUT_TAU_MS,
  SNAP_DISTANCE,
  DRAG_SNAP_DISTANCE,
  AXIS_LOCK_RATIO_3D,
  PLANE_LOCK_RATIO_3D,
  AXIS_LOCK_MAX_3D,
  PLANE_LOCK_MAX_3D,
  SHIFT_AXIS_LOCK_PX,
  MEASURE_DOT_HEX,
  MEASURE_DOT_GUIDE_HEX,
  MEASURE_SUM_HEX,
  MEASURE_SUM_GUIDE_HEX,
  MEASURE_LENGTH_HEX,
  MEASURE_AREA_HEX,
  MEASURE_AREA_EDGE_HEX,
  MEASURE_VOLUME_HEX,
  MEASURE_VOLUME_EDGE_HEX,
  NOTEBOOK_MATRIX_PALETTE,
  NOTEBOOK_MATRIX_HEX,
  NOTEBOOK_BASIS_TOKEN_STYLES,
  NOTEBOOK_VARIABLE_MARK_KINDS,
  NOTEBOOK_MIN_VISIBLE_LINES,
  NOTEBOOK_EDITOR_RUNTIME_DEBOUNCE_MS,
  NOTEBOOK_NORMAL_SPEED,
  NOTEBOOK_ZOOM_MIN,
  NOTEBOOK_ZOOM_MAX,
  CAMERA_FOV_DEG,
  NOTEBOOK_PROMPT_SAFE_FRAME_RATIO,
  LABEL_OVERLAP_ATTEMPTS,
  LABEL_OVERLAP_STEP_PX,
  DEFAULT_NOTEBOOK_SPEED,
  SCALAR_CONSTRAINT_LINE_RANGE,
  DEFAULT_RELATIVE_GRID_STRENGTH,
  TRANSFORM_WORKSPACE_ENABLED,
  sameNotebookBoardProgressState,
  monetizationConfig,
  supportEmail,
  configuredFlowMathApiBaseUrl,
  flowMathApiBaseUrl,
  seoBaseUrl,
  seoKeywordList,
  seoKeywords,
  CAMERA_HOME_POSITION,
  CAMERA_HOME_TARGET,
  CAMERA_AUTO_FRAME_MARGIN,
  CAMERA_AUTO_MIN_RADIUS,
  CAMERA_AUTO_MAX_DISTANCE,
  EQUATION_PLANE_FRAME_SIZE,
  EQUATION_SOLUTION_FRAME_SIZE,
  CAMERA_VECTOR_COUNTER_MARGIN,
  CAMERA_FRAME_PADDING_MIN,
  CAMERA_FRAME_PADDING_RATIO,
  viewPresets,
  viewDirectionForKey,
  cameraStateForView,
  notebookCameraDistanceForZoom,
  notebookCameraPromptMetrics,
  cameraDistanceForFrame,
  finiteFramePoint,
  planeFramePoints,
  solutionFramePoints,
  transformedFramePoint,
  frameFromPoints,
  systemSceneCameraFrame,
  arrayOfStrings,
  arrayOfNumbers,
  cameraArray,
  normalizeCameraState,
  cameraVectorToShareArray,
  cameraShareStateFromRefs,
  cameraStatesAlmostEqual,
  readSharedStateFromUrl,
  shouldShowFlowHome,
  googleLoginUrl,
  authApiUrl,
  isLoopbackHostname,
  isPostHogReady,
  captureAuthStarted,
  captureAuthCompleted,
  notebookInsertionLineIndexForCursor,
  upsertMeta,
  applySeo,
  normalizeControlLocks,
  configureControlsForView,
  labelRectOverlaps,
  estimatedLabelRect,
  labelRectFitsContainer,
  measurementPlacementPoints,
  projectedScreenBounds,
  setSceneLabelTransform,
  resolveSceneLabelOverlaps,
  matrixPresetGroups,
  createGridGeometry,
  createPlaneGridGeometry,
  effectiveVolumeTargetCount,
  volumeMeasureKind,
  volumeMeasureValue,
  setAxisLabelText,
  easeInOut,
  clamp01,
  normalizeRelativeGridStrength,
  normalizeNotebookSpeed,
  getNotebookPlaybackRate,
  formatNotebookSpeedLabel,
  maxControlPanelWidth,
  normalizeControlPanelWidth,
  readControlPanelWidth,
  maxNotebookEditorHeight,
  normalizeNotebookEditorHeight,
  readNotebookEditorHeight,
  easeOutCubic,
  interpolateNumberValue,
  interpolateValueStrings,
  interpolateEquationEntry,
  setMaterialOpacity,
  setObjectRevealOpacity,
  scaleObjectOpacity,
  VECTOR_ARROW_HEAD_LENGTH,
  VECTOR_ARROW_HEAD_WIDTH,
  setArrowVector,
  setArrowVectorAtProgress,
  createVectorFocusHaloMaterial,
  setVectorFocusHalo,
  createAxisLine,
  setAxisLineVector,
  createSceneArrow,
  createVectorVisual,
  disposeVectorVisual,
  toMatrix4,
  shortNumber,
  formatCoord,
  formatCompactCoord,
  coordLabelText,
  scalarLockHighlightIndices,
  dotValues,
  vectorLength,
  dotRelationText,
  hasScalarText,
  cleanScalarText,
  formatInputValue,
  isFiniteVector3,
  formatPresetInputValue,
  formatVectorInputValue,
  snapValue,
  snapValuesFor3D,
  constrainVectorForMode,
  constrainInputValuesForMode,
  solveVectorInputForWorld,
  scalarConstraintResidual,
  isScalarConstraintSolution,
  solveScalarConstraintPoint,
  dimensionForMode,
  modeForDimension,
  operationMatrixFromPreset,
  identityMatrixForMode,
  matrixInputValuesForShape,
  patchMatrixInputShape,
  operationMatrixFromInputValues,
  operationModeForShape,
  identityInputValuesForMode,
  matrixTextFromValues,
  matrixTextFromShapeValues,
  appendNotebookAlias,
  appendNotebookLineMeta,
  NOTEBOOK_IDENTIFIER_PATTERN,
  NOTEBOOK_NUMBER_TOKEN_PATTERN,
  isNotebookNumberToken,
  parseNotebookVectorLine,
  parseNotebookPointLine,
  parseNotebookMatrixSliceLine,
  normalizeNotebookVariableName,
  notebookVariableKey,
  resolveNotebookVariableName,
  rememberNotebookVariableName,
  notebookVectorIdForName,
  measurementStateKey,
  parseNotebookMeasurementLine,
  parseNotebookCaptionLine,
  parseNotebookPauseLine,
  parseNotebookCheckpointLine,
  parseNotebookInspectLine,
  parseNotebookFocusLine,
  notebookFocusText,
  parseNotebookBoardAnnotationLine,
  parseNotebookSolutionLine,
  parseNotebookToggleValue,
  parseNotebookFieldMode,
  parseNotebookSceneCommandLine,
  notebookSceneCommandText,
  NOTEBOOK_SCENE_PRESET_COMMANDS,
  createNotebookScenePresetRegistry,
  parseNotebookScenePresetDefinitionLine,
  notebookScenePresetDefinitionText,
  parseNotebookScenePresetUseLine,
  NOTEBOOK_SCALAR_PATTERN,
  parseNotebookLinearCombinationTermAtStart,
  parseNotebookLinearCombinationExpression,
  formatNotebookLinearCombination,
  parseNotebookCalculationLine,
  isSupportedNotebookCalculation,
  multiplyNotebookMatrixVector,
  notebookMatrixShape,
  multiplyNotebookMatrices,
  formatEquationFromCoefficients,
  transformNotebookEquation,
  parseNotebookReferenceLine,
  parseNotebookNumericRowLine,
  notebookMatrixRowsFromText,
  notebookMatrixModeFromText,
  matrixValuesFromNotebookText,
  createNotebookEquationCell,
  createNotebookMatrixCell,
  createNotebookNoteCell,
  multiplyMatrix2,
  operationBetweenMatrices,
  matricesAlmostEqual,
  dragHistoryName,
  vectorIdFromDragKey,
  scalarIdFromDragKey,
  equationVariables,
  equationLineColors,
  vectorPalette,
  equationExamples,
  colorToHex,
  renderNotebookTaggedText,
  formatNotebookCaptionMathText,
  equationSceneLabelName,
  notebookEquationEntryText,
  equationSceneLabelKey,
  equationRevealKey,
  equationAnchorPoint,
  equationSceneLabelText,
  createVectorState,
  parseExpression,
  parseEquation,
  formatEquationCoefficient,
  prettifyEquationLine,
  prettifyEquationNoteText,
  parsedEquationLine,
  prettifyNotebookScriptText,
  parseNotebookScript,
  notebookMatrixCellSignature,
  notebookMatrixSignatures,
  notebookModeForCells,
  notebookCellSignature,
  solveEquationSystem,
  solutionDisplayDimension,
  solutionValuesForMode,
  formatSolutionTuple,
  solutionActiveNullspaceBasis,
  solutionGeometryDegrees,
  formatGeneralSolution,
  formatLineSolutionEquation,
  solutionGeometryLabelKey,
  formatSceneSolutionGeometryLabel,
  solutionLabelAnchor,
  parseLineEquation,
  relationBetweenLines,
  satisfiesLine,
  lineSegmentForEquation,
  scalarLineSegmentForEquation,
  disposeObject3D,
  clearEquationGroup,
  createDotMeasurementVisual,
  createSumGuideLine,
  createSumMeasurementVisual,
  createVolumeMeasurementVisual,
  disposeMeasurementVisual,
  getMeasurementVisual,
  parseEquationRows,
  analyzeLineSystem,
  analyzeEquationGeometry,
  statusKeyForLineSystem,
  modeForSolutionDimension,
  outputModeForSystemMode,
  sourceSolutionDimensionForLineSystem,
  displaySolutionDimensionForLineSystem,
  statusKeyForLineSystemDisplay,
  buildLineSystemInfo,
  relationText,
  createPlaneObjects,
  transformedPointForMatrix,
  createTransformedPlaneObjects,
  createLineObjects,
  createTransformedLineObjects,
  createScalarPointObjects,
  closestSolutionCenter,
  createSolutionHighlightObjects,
  createSolutionTraceVisual,
  solutionTraceStartPoint,
  solutionTraceHasNoCommonPoint,
  solutionTraceReferencePoint,
  solutionTraceItems,
  solutionTraceAnchor,
  solutionTraceStartsNearCaption,
  SOLUTION_TRACE_TRAVEL_END,
  SOLUTION_TRACE_FADE_END,
  SOLUTION_TRACE_HIDE_AT,
  updateSolutionTraceVisual,
} from './AppRuntime.jsx';
import {
  notebookStarterPreviewText,
  notebookStarterText,
} from './notebook/editor/notebookStarter.js';

export default function App() {
  const initialAnimationViewerRef = useRef(null);
  if (initialAnimationViewerRef.current === null) {
    initialAnimationViewerRef.current = readAnimationViewerStateFromLocation() ?? false;
  }
  const initialAnimationViewer = initialAnimationViewerRef.current || null;
  const isAnimationViewer = !!initialAnimationViewer;
  const isAnimationPreview = initialAnimationViewer?.preview === true;
  const initialShareRef = useRef(null);
  if (initialShareRef.current === null) {
    initialShareRef.current = readSharedStateFromUrl() ?? false;
  }
  const initialShare = initialShareRef.current || {};
  const initialWorkspaceMode =
    TRANSFORM_WORKSPACE_ENABLED && !isAnimationViewer && initialShare.workspaceMode === 'transform'
      ? 'transform'
      : 'system';
  const urlLocale =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('lang');
  const pathLocale = typeof window === 'undefined' ? null : localeFromPathname(window.location.pathname);
  const initialLocale = urlLocale
    ? normalizeLocale(urlLocale)
    : pathLocale ?? initialShare.locale ?? detectLocale();

  const containerRef = useRef(null);
  const notebookCaptionRef = useRef(null);
  const notebookCaptionDragRef = useRef(null);
  const matrixPresetRefs = useRef({});
  const iLabelRef = useRef(null);
  const jLabelRef = useRef(null);
  const kLabelRef = useRef(null);
  const equationSolutionLabelRef = useRef(null);
  const scalarSolutionLabelRef = useRef(null);
  const equationLabelRefs = useRef(new Map());
  const vectorLabelRefs = useRef(new Map());
  const vectorDotLabelRefs = useRef(new Map());
  const measurementLabelRefs = useRef(new Map());
  const vectorVolumeLabelRef = useRef(null);
  const scrubTrackRef = useRef(null);
  const notebookProgressRef = useRef(null);
  const notebookProgressDragRef = useRef(null);
  const notebookSceneProgressRef = useRef(null);
  const notebookPlaybackFrameRef = useRef(null);
  const pendingNotebookUiInsertionRef = useRef(null);
  const notebookEditorRef = useRef(null);
  const notebookVectorDragSyncRef = useRef(null);
  const notebookEquationVisualKeyRef = useRef('');
  const notebookMatrixSignatureRef = useRef(null);
  const notebookVisualSignatureRef = useRef(null);
  const notebookReplayFromStartRef = useRef(false);
  const notebookEditorRuntimeTimerRef = useRef(null);
  const notebookEditorTypingRef = useRef(false);
  const animationViewerInitializedRef = useRef(false);
  const animationPreviewStartTimerRef = useRef(null);
  const historyStripRef = useRef(null);
  const panelScrollRef = useRef(null);
  const workspaceShellRef = useRef(null);
  const controlPanelResizeRef = useRef(null);
  const notebookComposerRef = useRef(null);
  const notebookSectionResizeRef = useRef(null);
  const previousMobileViewportRef = useRef(null);
  const flowHomeReplayRequestedRef = useRef(false);
  const flowViewTransitionRef = useRef(null);
  const arrowDragRef = useRef({
    active: false,
    hovered: null,
    key: null,
    snapped: false,
    startMatrix: [...identity3],
    startClientX: 0,
    startClientY: 0,
    startIntersection: new THREE.Vector3(),
    startInputVector: [0, 0, 0],
    startVector: new THREE.Vector3(),
    screenDown: new THREE.Vector3(),
    screenRight: new THREE.Vector3(),
    plane: new THREE.Plane(),
  });
  const dragActionsRef = useRef({
    commitBasisDrag: null,
    updateBasisVectorFromDrag: null,
    updateScalarConstraintFromDrag: null,
    updateUserVectorFromDrag: null,
  });
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const threeRef = useRef(null);
  const frameIdRef = useRef(null);
  const initialCameraPositionRef = useRef(
    initialShare.camera?.position ? new THREE.Vector3(...initialShare.camera.position) : CAMERA_HOME_POSITION.clone()
  );
  const initialCameraTargetRef = useRef(
    initialShare.camera?.target ? new THREE.Vector3(...initialShare.camera.target) : CAMERA_HOME_TARGET.clone()
  );
  const cameraShareTimerRef = useRef(null);
  const googleOneTapPromptedRef = useRef(false);

  const currentMatrixRef = useRef([...(initialShare.displayMatrix ?? identity3)]);
  const startMatrixRef = useRef([...(initialShare.displayMatrix ?? identity3)]);
  const targetMatrixRef = useRef([...(initialShare.displayMatrix ?? identity3)]);
  const vectorRenderValuesRef = useRef(new Map());
  const dragSnapEnabledRef = useRef(initialShare.snapToInteger !== false);
  const animationViewFromRef = useRef('3d');
  const animationViewToRef = useRef('3d');
  const animationStartRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const lastUiSyncRef = useRef(0);
  const lastNotebookUiSyncRef = useRef(0);
  const cameraMoveRef = useRef({
    active: false,
    startTime: null,
    duration: CAMERA_MOVE_MS,
    onComplete: null,
    positionFrom: initialCameraPositionRef.current.clone(),
    targetFrom: initialCameraTargetRef.current.clone(),
    positionTo: initialCameraPositionRef.current.clone(),
    targetTo: initialCameraTargetRef.current.clone(),
  });
  const notebookStopCameraRef = useRef(null);
  const notebookStopCameraRestorePendingRef = useRef(false);
  const cameraProgressOverrideRef = useRef(null);
  const notebookCameraTransitionRef = useRef(null);
  const cameraLockedRef = useRef(false);
  const zoomLockedRef = useRef(false);
  const autoCameraTargetViewRef = useRef(initialWorkspaceMode === 'system' ? '2d' : '3d');
  const notebookAutoCameraViewRef = useRef(null);
  const userVectorRef = useRef(
    initialShare.vectors?.[0]
      ? [parseNumber(initialShare.vectors[0].x), parseNumber(initialShare.vectors[0].y), parseNumber(initialShare.vectors[0].z)]
      : [2, 2, 2]
  );
  const vectorsRef = useRef([]);
  const measurementsRef = useRef([]);
  const scalarSolutionRef = useRef(null);
  const notebookHasVisualVectorsRef = useRef(false);
  const notebookHasMatrixCellsRef = useRef(false);
  const notebookVectorTransformRef = useRef([...identity3]);
  const activeVectorIdRef = useRef(initialShare.vectors?.[0]?.id ?? 'v1');
  const nextVectorIndexRef = useRef(2);
  const nextMeasurementIndexRef = useRef(1);
  const measureModeRef = useRef(null);
  const measureDraftRef = useRef([]);
  const vectorToolModeRef = useRef('vector');
  const uiStateRef = useRef({
    showVolume: false,
    showVector: true,
    showBasis: false,
    basisVisibility: { i: true, j: true, k: true },
    showGrid: true,
    showRelativeGrid: true,
    relativeGridStrength: DEFAULT_RELATIVE_GRID_STRENGTH,
    showCoordinates: true,
    showCoordinateNumbers: true,
    showAutomaticSolution: false,
    showDot: false,
    showAxes: true,
    showRelativeAxes: true,
    notebookSolutionSelection: null,
    notebookCaptionHoverName: null,
    notebookHardFocusSourceId: null,
    notebookHardFocusExpiresAt: 0,
    notebookActiveCellId: null,
    notebookActiveCellProgress: 1,
  });
  const workspaceModeRef = useRef(initialWorkspaceMode);
  const systemDimensionRef = useRef('2d');
  const lineSystemRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const isMobileViewport = useMediaQuery('(max-width: 760px)');
  const isMobileKeyboardOpen = useMobileKeyboardOpen(isMobileViewport);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (isAnimationViewer) return false;
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 760px)').matches;
  });
  const [controlPanelWidth, setControlPanelWidth] = useState(readControlPanelWidth);
  const [notebookEditorHeight, setNotebookEditorHeight] = useState(readNotebookEditorHeight);
  const [isNotebookSectionResizing, setIsNotebookSectionResizing] = useState(false);
  const [showFlowHome, setShowFlowHome] = useState(() => !isAnimationViewer && shouldShowFlowHome());
  const [isAnimationFocus, setIsAnimationFocus] = useState(isAnimationViewer);
  const [sceneToolsExpanded, setSceneToolsExpanded] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState(initialWorkspaceMode);
  const [inputMode, setInputMode] = useState(initialShare.inputMode ?? '3d');
  const [displayMatrix, setDisplayMatrix] = useState([...(initialShare.displayMatrix ?? identity3)]);
  const [basisControlMatrix, setBasisControlMatrix] = useState([...(initialShare.displayMatrix ?? identity3)]);
  const [matrix3, setMatrix3] = useState(initialShare.matrix3 ?? ['1', '0', '0', '0', '1', '0', '0', '0', '1']);
  const [matrix2, setMatrix2] = useState(initialShare.matrix2 ?? ['1', '0', '0', '1']);
  const [matrix1, setMatrix1] = useState(initialShare.matrix1 ?? ['1']);
  const [vectors, setVectors] = useState(initialShare.vectors ?? [createVectorState(0, { id: 'v1', name: 'v1' })]);
  const [activeVectorId, setActiveVectorId] = useState(initialShare.vectors?.[0]?.id ?? 'v1');
  const [vectorToolMode, setVectorToolMode] = useState('vector');
  const [equations, setEquations] = useState(['']);
  const [notebookEquationModeHint, setNotebookEquationModeHint] = useState(null);
  const [notebookText, setNotebookText] = useState(initialAnimationViewer?.notebookText ?? '');
  const [notebookRuntimeText, setNotebookRuntimeText] = useState(
    initialAnimationViewer?.notebookText ?? ''
  );
  const notebookTextRef = useRef(notebookText);
  if (!notebookEditorTypingRef.current && !notebookVectorDragSyncRef.current) {
    notebookTextRef.current = notebookText;
  }
  const [savedNotebooks, setSavedNotebooks] = useState(readNotebookLibrary);
  const [activeSavedNotebookId, setActiveSavedNotebookId] = useState(null);
  const [savedNotebookTitle, setSavedNotebookTitle] = useState('');
  const [pendingNotebookDeleteId, setPendingNotebookDeleteId] = useState(null);
  const [notebookCells, setNotebookCells] = useState(() => [
    createNotebookEquationCell(''),
  ]);
  const [activeNotebookCellId, setActiveNotebookCellId] = useState(null);
  const [notebookCursor, setNotebookCursor] = useState(0);
  const [notebookProgressDragging, setNotebookProgressDragging] = useState(false);
  const [activeNotebookCaption, setActiveNotebookCaption] = useState('');
  const [notebookCaptionPosition, setNotebookCaptionPosition] = useState({ x: 0, y: 0 });
  const [notebookCaptionDragging, setNotebookCaptionDragging] = useState(false);
  const [hoveredNotebookCaptionVariable, setHoveredNotebookCaptionVariable] = useState(null);
  const [notebookFieldMode, setNotebookFieldMode] = useState(NOTEBOOK_SCENE_DEFAULTS.field);
  const [notebookSceneMatrices, setNotebookSceneMatrices] = useState([]);
  const [notebookBoardOperation, setNotebookBoardOperation] = useState(null);
  const [notebookBoardAnnotation, setNotebookBoardAnnotation] = useState(null);
  const [history, setHistory] = useState([
    {
      name: t(initialLocale, 'initialSpace'),
      matrix: [...(initialShare.displayMatrix ?? identity3)],
      previousMatrix: [...(initialShare.displayMatrix ?? identity3)],
      previousStateMode: '3d',
      operationMatrix: [...identity3],
      operationMode: '3d',
      stateMode: '3d',
    },
  ]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(0);
  const [hoveredHistoryIndex, setHoveredHistoryIndex] = useState(null);
  const [, setClipboardStatus] = useState('');
  const [progress, setProgress] = useState(1);
  const [activeView, setActiveView] = useState(initialShare.camera ? null : '3d');
  const [cameraLocked, setCameraLocked] = useState(false);
  const [zoomLocked, setZoomLocked] = useState(false);
  const [cameraState, setCameraState] = useState(initialShare.camera ?? null);
  const [locale, setLocale] = useState(initialLocale);
  const [localeOptions] = useState(() => localeOrderWithPreferredFirst(initialLocale));
  const translate = useCallback((key, values) => t(locale, key, values), [locale]);
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authErrorField, setAuthErrorField] = useState('');
  const [authResolved, setAuthResolved] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const authDialogRef = useRef(null);
  const authEmailInputRef = useRef(null);
  const authPasswordInputRef = useRef(null);
  const authPasswordConfirmInputRef = useRef(null);
  const authReturnFocusRef = useRef(null);
  const accountMenuRef = useRef(null);
  const [showVolume, setShowVolume] = useState(initialShare.showVolume ?? false);
  const [showVector, setShowVector] = useState(initialShare.showVector ?? true);
  const [showBasis, setShowBasis] = useState(initialShare.showBasis ?? false);
  const [basisVisibility, setBasisVisibility] = useState({ i: true, j: true, k: true });
  const [showGrid, setShowGrid] = useState(initialShare.showGrid ?? true);
  const [showRelativeGrid, setShowRelativeGrid] = useState(initialShare.showRelativeGrid ?? true);
  const [relativeGridStrength, setRelativeGridStrength] = useState(
    normalizeRelativeGridStrength(initialShare.relativeGridStrength)
  );
  const [showCoordinates, setShowCoordinates] = useState(initialShare.showCoordinates ?? true);
  const [showAutomaticSolution, setShowAutomaticSolution] = useState(
    initialShare.showAutomaticSolution === true
  );
  const [showDot, setShowDot] = useState(initialShare.showDot ?? false);
  const [showAxes, setShowAxes] = useState(initialShare.showAxes ?? true);
  const [showRelativeAxes, setShowRelativeAxes] = useState(initialShare.showRelativeAxes ?? true);
  const [snapToInteger, setSnapToInteger] = useState(initialShare.snapToInteger ?? true);
  const [notebookSpeed, setNotebookSpeed] = useState(
    normalizeNotebookSpeed(initialAnimationViewer?.notebookSpeed ?? initialShare.notebookSpeed)
  );
  const [notebookPlaying, setNotebookPlaying] = useState(false);
  const [notebookCheckpoint, setNotebookCheckpoint] = useState(null);
  const [notebookCheckpointCaptionHidden, setNotebookCheckpointCaptionHidden] = useState(false);
  const [notebookCompleted, setNotebookCompleted] = useState(false);
  const [notebookCuedLineIndex, setNotebookCuedLineIndex] = useState(null);
  const notebookInspectionActive = notebookCheckpoint?.kind === 'inspect';
  const notebookActiveReviewStopId = notebookCheckpoint?.cellId
    ?? (notebookCompleted ? 'notebook-final-scene' : null);

  useEffect(() => {
    if (notebookEditorTypingRef.current) return;
    setNotebookRuntimeText((current) => current === notebookText ? current : notebookText);
  }, [notebookText]);

  useEffect(() => () => {
    if (notebookEditorRuntimeTimerRef.current) {
      window.clearTimeout(notebookEditorRuntimeTimerRef.current);
      notebookEditorRuntimeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!notebookActiveReviewStopId) {
      notebookStopCameraRef.current = null;
      if (notebookStopCameraRestorePendingRef.current) {
        cameraMoveRef.current.active = false;
        cameraMoveRef.current.onComplete = null;
        notebookStopCameraRestorePendingRef.current = false;
      }
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const refs = threeRef.current;
      if (!refs || notebookStopCameraRef.current?.cellId === notebookActiveReviewStopId) return;
      notebookStopCameraRef.current = {
        cellId: notebookActiveReviewStopId,
        position: refs.camera.position.clone(),
        target: refs.controls.target.clone(),
        view: activeView,
      };
    });

    return () => window.cancelAnimationFrame(frameId);
    // Capture once when a learner stop becomes active. A later manual orbit
    // intentionally must not replace the authored stop camera snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookActiveReviewStopId]);
  const notebookExamples = useMemo(() => buildNotebookExamplePresets(locale), [locale]);
  const notebookCourse = useMemo(() => buildVisualLinearAlgebraCourse(locale), [locale]);
  const notebookPlaybackLabelKey = notebookPlaying
    ? 'stopNotebookCell'
    : notebookCheckpoint
      ? 'nextNotebookCheckpoint'
      : notebookCompleted
        ? 'replayNotebook'
        : 'runNotebookCell';
  const notebookScenePlaybackLabelKey = notebookPlaying
    ? 'stopNotebookCell'
    : notebookCheckpoint || notebookCompleted
      ? 'replayNotebookSegment'
      : 'runNotebookCell';
  const [measureMode, setMeasureMode] = useState(null);
  const [measureDraft, setMeasureDraft] = useState([]);
  const [measureAnchorId, setMeasureAnchorId] = useState(null);
  const [measurePointer, setMeasurePointer] = useState(null);
  const dragSnapGuideRef = useRef(null);
  const dragSnapGuideLineRef = useRef(null);
  const dragSnapGuidePointRef = useRef(null);
  const setDragSnapGuide = useCallback((guide) => {
    const guideNode = dragSnapGuideRef.current;
    const lineNode = dragSnapGuideLineRef.current;
    const pointNode = dragSnapGuidePointRef.current;
    if (!guideNode || !lineNode || !pointNode) return;
    if (!guide) {
      guideNode.style.display = 'none';
      return;
    }
    lineNode.setAttribute('x1', String(guide.x1));
    lineNode.setAttribute('y1', String(guide.y1));
    lineNode.setAttribute('x2', String(guide.x2));
    lineNode.setAttribute('y2', String(guide.y2));
    pointNode.setAttribute('cx', String(guide.x2));
    pointNode.setAttribute('cy', String(guide.y2));
    guideNode.style.display = '';
  }, []);
  const [hoveredMeasureTargetId, setHoveredMeasureTargetId] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [hoveredMatrixPresetId, setHoveredMatrixPresetId] = useState(null);

  const stopPanelPointerPropagation = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const clearNotebookCueOnOutsidePointerDown = useCallback((event) => {
    if (notebookCuedLineIndex === null) return;
    if (event.target instanceof Element && event.target.closest('.notebook-gutter-widget')) return;
    setNotebookCuedLineIndex(null);
  }, [notebookCuedLineIndex]);

  const pointToNotebookCaptionVariable = useCallback((name) => {
    const key = notebookVariableKey(name);
    uiStateRef.current.notebookCaptionHoverName = key;
    setHoveredNotebookCaptionVariable(key);
  }, []);

  const stopPointingToNotebookCaptionVariable = useCallback((name) => {
    const key = notebookVariableKey(name);
    if (uiStateRef.current.notebookCaptionHoverName === key) {
      uiStateRef.current.notebookCaptionHoverName = null;
    }
    setHoveredNotebookCaptionVariable((current) => current === key ? null : current);
  }, []);

  useEffect(() => {
    uiStateRef.current.notebookCaptionHoverName = null;
    setHoveredNotebookCaptionVariable(null);
  }, [activeNotebookCaption, workspaceMode]);

  const keepNotebookCaptionInScene = useCallback(() => {
    const caption = notebookCaptionRef.current;
    const scene = containerRef.current;
    if (!caption || !scene) return;
    const captionRect = caption.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    setNotebookCaptionPosition((current) => {
      const next = clampNotebookCaptionPosition(current, captionRect, sceneRect);
      return Math.abs(next.x - current.x) < 0.05 && Math.abs(next.y - current.y) < 0.05
        ? current
        : next;
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(keepNotebookCaptionInScene);
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeNotebookCaption,
    keepNotebookCaptionInScene,
    notebookCheckpoint?.cellId,
    notebookCheckpointCaptionHidden,
    notebookCompleted,
  ]);

  useEffect(() => {
    window.addEventListener('resize', keepNotebookCaptionInScene);
    return () => window.removeEventListener('resize', keepNotebookCaptionInScene);
  }, [keepNotebookCaptionInScene]);

  const handleNotebookCaptionPointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const dragAffordance = event.target instanceof Element
      ? event.target.closest('.scene-caption-drag-affordance')
      : null;
    if (
      !dragAffordance &&
      event.target instanceof Element &&
      event.target.closest('button, a, input, .scene-caption-variable')
    ) return;
    const caption = notebookCaptionRef.current;
    const scene = containerRef.current;
    if (!caption || !scene) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const captionRect = caption.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const start = { ...notebookCaptionPosition };
    notebookCaptionDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      start,
      minX: start.x + sceneRect.left + NOTEBOOK_CAPTION_EDGE_GAP - captionRect.left,
      maxX: start.x + sceneRect.right - NOTEBOOK_CAPTION_EDGE_GAP - captionRect.right,
      minY: start.y + sceneRect.top + NOTEBOOK_CAPTION_EDGE_GAP - captionRect.top,
      maxY: start.y + sceneRect.bottom - NOTEBOOK_CAPTION_EDGE_GAP - captionRect.bottom,
    };
    setNotebookCaptionDragging(true);
  }, [notebookCaptionPosition]);

  const handleNotebookCaptionPointerMove = useCallback((event) => {
    const drag = notebookCaptionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const rawX = drag.start.x + event.clientX - drag.startClientX;
    const rawY = drag.start.y + event.clientY - drag.startClientY;
    const minX = Math.min(drag.minX, drag.maxX);
    const maxX = Math.max(drag.minX, drag.maxX);
    const minY = Math.min(drag.minY, drag.maxY);
    const maxY = Math.max(drag.minY, drag.maxY);
    setNotebookCaptionPosition({
      x: Math.max(minX, Math.min(maxX, rawX)),
      y: Math.max(minY, Math.min(maxY, rawY)),
    });
  }, []);

  const finishNotebookCaptionDrag = useCallback((event) => {
    const drag = notebookCaptionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    notebookCaptionDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setNotebookCaptionDragging(false);
    window.requestAnimationFrame(keepNotebookCaptionInScene);
  }, [keepNotebookCaptionInScene]);

  const handlePanelPointerDown = useCallback((event) => {
    event.stopPropagation();
    arrowDragRef.current.active = false;
    arrowDragRef.current.key = null;
    arrowDragRef.current.snapped = false;
    setDragSnapGuide(null);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
  }, []);

  const preventPanelNativeDrag = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const allLocked = cameraLocked && zoomLocked;
  const displayMode = viewKeyForMatrix(displayMatrix);
  const inputColumns = dimensionForMode(displayMode);
  const outputRows = dimensionForMode(inputMode);
  const matrixInputValues = useMemo(
    () => matrixInputValuesForShape(matrix3, outputRows, inputColumns),
    [inputColumns, matrix3, outputRows]
  );
  const visibleMatrixPresets = useMemo(
    () =>
      inputMode === displayMode
        ? (matrixPresetGroups[inputMode] ?? matrixPresetGroups['3d']).map((preset) => ({
            ...preset,
            name: presetLocaleNames[locale]?.[preset.id] ?? presetLocaleNames.ko?.[preset.id] ?? preset.name,
          }))
        : [],
    [displayMode, inputMode, locale]
  );
  const activeMatrixPresetId = useMemo(() => {
    const parsed = matrixInputValues.map(parseNumber);
    return visibleMatrixPresets.find((preset) =>
      matricesAlmostEqual(
        matrixInputValuesForShape(operationMatrixFromPreset(preset), outputRows, inputColumns),
        parsed
      )
    )?.id ?? null;
  }, [inputColumns, matrixInputValues, outputRows, visibleMatrixPresets]);
  const activeMatrixPresetName = useMemo(() => (
    visibleMatrixPresets.find((preset) => preset.id === activeMatrixPresetId)?.name ?? null
  ), [activeMatrixPresetId, visibleMatrixPresets]);
  const hoveredMatrixPreset = useMemo(
    () => visibleMatrixPresets.find((preset) => preset.id === hoveredMatrixPresetId) ?? null,
    [hoveredMatrixPresetId, visibleMatrixPresets]
  );
  const previewMatrixInputValues = useMemo(
    () =>
      hoveredMatrixPreset
        ? matrixInputValuesForShape(operationMatrixFromPreset(hoveredMatrixPreset), outputRows, inputColumns).map(formatPresetInputValue)
        : matrixInputValues,
    [hoveredMatrixPreset, inputColumns, matrixInputValues, outputRows]
  );

  const previewIndex = hoveredHistoryIndex ?? activeHistoryIndex;
  const previewHistory = history[previewIndex] ?? history[activeHistoryIndex] ?? history.at(-1);
  const currentHistory = history[activeHistoryIndex] ?? history.at(-1);
  const displayedHistoryEntries = useMemo(
    () => history.map((step, index) => ({ step, index })).reverse(),
    [history]
  );
  const activeVector = useMemo(
    () => vectors.find((item) => item.id === activeVectorId) ?? vectors[0] ?? createVectorState(0, { id: 'v1', name: 'v1' }),
    [activeVectorId, vectors]
  );
  const vectorItems = useMemo(
    () =>
      vectors.map((item) => ({
        ...item,
        visible: item.visible !== false,
        colorHex: colorToHex(item.color),
        values: [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)],
        scalarValue: parseNumber(item.scalar),
      })),
    [vectors]
  );
  const transformedVectorItems = useMemo(
    () =>
      vectorItems.map((item) => {
        const transformed = transformVector3(displayMatrix, item.values);
        const length = vectorLength(transformed);
        const lengthSquared = dotValues(transformed, transformed);
        const scalarSpace = item.scalarSpace === 'input' ? 'input' : 'output';
        const scalarNormal = scalarSpace === 'input' ? item.values : transformed;
        const scalarLength = vectorLength(scalarNormal);
        const scalarLengthSquared = dotValues(scalarNormal, scalarNormal);
        const scalarAuto = !hasScalarText(item.scalar);
        return {
          ...item,
          scalarSpace,
          scalarNormal,
          scalarLength,
          scalarLengthSquared,
          transformed,
          length,
          lengthSquared,
          scalarAuto,
          scalarResolved: scalarAuto ? scalarLengthSquared : item.scalarValue,
        };
      }),
    [displayMatrix, vectorItems]
  );
  const dotVectorItems = useMemo(
    () => transformedVectorItems.filter((item) => item.visible && !item.scalarEnabled),
    [transformedVectorItems]
  );
  const basisItems = useMemo(() => {
    const basis = [
      { id: 'i', name: 'i′', color: 0xe05263, values: [basisControlMatrix[0], basisControlMatrix[3], basisControlMatrix[6]] },
      { id: 'j', name: 'j′', color: 0x1f9d55, values: [basisControlMatrix[1], basisControlMatrix[4], basisControlMatrix[7]] },
      { id: 'k', name: 'k′', color: 0x3f7ee8, values: [basisControlMatrix[2], basisControlMatrix[5], basisControlMatrix[8]] },
    ];
    return basis.map((item) => ({
      ...item,
      colorHex: colorToHex(item.color),
      length: vectorLength(item.values),
      lengthSquared: dotValues(item.values, item.values),
      enabled: vectorLength(item.values) > EPSILON,
    }));
  }, [basisControlMatrix]);
  const visibleBasisItems = useMemo(
    () => basisItems.filter((item) => item.enabled),
    [basisItems]
  );
  const currentRank = useMemo(() => rank3(displayMatrix), [displayMatrix]);
  const vectorDotPairs = useMemo(() => {
    const pairs = [];
    for (let rowIndex = 0; rowIndex < dotVectorItems.length; rowIndex += 1) {
      for (let colIndex = rowIndex + 1; colIndex < dotVectorItems.length; colIndex += 1) {
        const left = dotVectorItems[rowIndex];
        const right = dotVectorItems[colIndex];
        const value = dotValues(left.transformed, right.transformed);
        const denominator = left.length * right.length;
        pairs.push({
          id: `${left.id}-${right.id}`,
          left,
          right,
          value,
          cosine: denominator > EPSILON ? value / denominator : null,
          relation: dotRelationText(value, left.length, right.length),
        });
      }
    }
    return pairs;
  }, [dotVectorItems]);
  const vectorVolumeMeasure = useMemo(() => {
    if (dotVectorItems.length < 2) return null;
    const [first, second, third] = dotVectorItems;
    const a = new THREE.Vector3(...first.transformed);
    const b = new THREE.Vector3(...second.transformed);
    const area = a.clone().cross(b).length();
    if (!third) {
      return {
        type: 'area',
        names: [first.name, second.name],
        value: area,
      };
    }
    const c = new THREE.Vector3(...third.transformed);
    return {
      type: 'volume',
      names: [first.name, second.name, third.name],
      value: Math.abs(a.clone().cross(b).dot(c)),
    };
  }, [dotVectorItems]);
  const measureTargetMap = useMemo(() => {
    const entries = new Map();
    basisItems.forEach((item) => {
      entries.set(`b:${item.id}`, {
        id: `b:${item.id}`,
        name: item.name,
        color: item.color,
        colorHex: item.colorHex,
        visible: showBasis && item.enabled && basisVisibility[item.id] !== false,
        values: item.values,
      });
    });
    transformedVectorItems.forEach((item) => {
      entries.set(`v:${item.id}`, {
        id: `v:${item.id}`,
        name: item.name,
        color: item.color,
        colorHex: item.colorHex,
        visible: item.visible,
        values: item.transformed,
      });
    });
    return entries;
  }, [basisItems, basisVisibility, showBasis, transformedVectorItems]);
  const measurementSummaries = useMemo(
    () =>
      measurements.map((item) => {
        const targets = item.targets.map((id) => measureTargetMap.get(id)).filter(Boolean);
        let value = null;
        let valueText = null;
        if (item.type === 'dot' && targets.length >= 2) {
          value = dotValues(targets[0].values, targets[1].values);
        } else if (item.type === 'sum' && targets.length >= 2) {
          value = targets[0].values.map((entry, index) => entry + (targets[1].values[index] ?? 0));
          valueText = formatCompactCoord(value, displayMode, 2);
        } else if (item.type === 'volume' && targets.length >= 1) {
          value = volumeMeasureValue(targets);
        }
        const measureKind = item.type === 'volume'
          ? volumeMeasureKind(targets.length)
          : item.type;
        const labelTargets = item.type === 'volume'
          ? targets.slice(0, effectiveVolumeTargetCount(targets.length))
          : targets;
        const labelSeparator = item.type === 'sum' ? ' + ' : ' · ';
        return {
          ...item,
          targetIds: item.targets,
          targets,
          measureKind,
          label: labelTargets
            .map((target) => item.type === 'sum' ? target.name : `A${target.name}`)
            .join(labelSeparator),
          value,
          valueText,
        };
      }),
    [displayMode, measureTargetMap, measurements]
  );
  const dotMeasurementSummaries = useMemo(
    () => measurementSummaries.filter((item) => item.type === 'dot'),
    [measurementSummaries]
  );
  const volumeMeasurementSummaries = useMemo(
    () => measurementSummaries.filter((item) => item.type === 'volume'),
    [measurementSummaries]
  );
  const vectorScalarConstraints = useMemo(
    () =>
      transformedVectorItems
        .filter((item) => item.visible && item.scalarEnabled && item.scalarLength > EPSILON)
        .map((item, index) => ({
          id: item.id,
          name: item.name,
          scalarSpace: item.scalarSpace,
          color: item.color,
          colorHex: item.colorHex,
          normal: item.scalarNormal,
          scalar: item.scalarResolved,
          scalarAuto: item.scalarAuto,
          index,
        })),
    [transformedVectorItems]
  );
  const scalarConstraintSolution = useMemo(
    () => solveScalarConstraintPoint(vectorScalarConstraints, viewKeyForMatrix(displayMatrix)),
    [displayMatrix, vectorScalarConstraints]
  );
  const parsedVector = useMemo(
    () => [parseNumber(activeVector.x), parseNumber(activeVector.y), parseNumber(activeVector.z)],
    [activeVector]
  );
  const transformedVector = useMemo(
    () => transformVector3(displayMatrix, parsedVector),
    [displayMatrix, parsedVector]
  );
  const currentModeLabel = displayMode.toUpperCase();
  const equationSolution = useMemo(() => solveEquationSystem(equations), [equations]);
  const lineSystem = useMemo(
    () => analyzeEquationGeometry(
      equations,
      workspaceMode === 'system' ? notebookEquationModeHint : null
    ),
    [equations, notebookEquationModeHint, workspaceMode]
  );
  lineSystemRef.current = lineSystem;
  const notebookScript = useMemo(
    () => parseNotebookScript(notebookRuntimeText),
    [notebookRuntimeText]
  );
  const notebookPlaybackSegmentsList = useMemo(
    () => notebookPlaybackSegments(
      notebookScript.cells,
      notebookScript.lineCount,
      NOTEBOOK_MIN_VISIBLE_LINES
    ),
    [notebookScript.cells, notebookScript.lineCount]
  );
  const activeNotebookSegment = useMemo(() => {
    if (!notebookPlaybackSegmentsList.length) return null;
    if (notebookCheckpoint?.cellId) {
      const stoppedSegment = notebookPlaybackSegmentsList.find(
        (segment) => segment.stop?.cell.id === notebookCheckpoint.cellId
      );
      if (stoppedSegment) return stoppedSegment;
    }
    if (notebookCompleted) {
      return notebookPlaybackSegmentsList.find((segment) => segment.kind === 'final')
        ?? notebookPlaybackSegmentsList.at(-1);
    }
    const cursor = Math.max(0, Math.min(100, Number(notebookCursor) || 0));
    const forwardSegment = notebookPlaybackSegmentsList.find((segment, index) => (
      cursor >= segment.startCursor - 0.0001 &&
      (cursor < segment.endCursor - 0.0001 || index === notebookPlaybackSegmentsList.length - 1)
    ));
    if (forwardSegment) return forwardSegment;
    return notebookPlaybackSegmentsList.find((segment, index) => (
      cursor <= segment.endCursor + 0.0001 &&
      (index === 0 || cursor > segment.startCursor + 0.0001)
    )) ?? notebookPlaybackSegmentsList.at(-1);
  }, [
    notebookCheckpoint?.cellId,
    notebookCompleted,
    notebookCursor,
    notebookPlaybackSegmentsList,
    notebookPlaying,
  ]);
  const activeNotebookSegmentProgress = notebookSegmentProgress(notebookCursor, activeNotebookSegment);
  const activeNotebookReviewSteps = useMemo(
    () => notebookReviewSteps(
      notebookScript.cells,
      notebookScript.lineCount,
      activeNotebookSegment,
      NOTEBOOK_MIN_VISIBLE_LINES
    ),
    [activeNotebookSegment, notebookScript.cells, notebookScript.lineCount]
  );
  const previousNotebookReviewStep = useMemo(
    () => [...activeNotebookReviewSteps]
      .reverse()
      .find((step) => step.cursor < notebookCursor - 0.0001) ?? null,
    [activeNotebookReviewSteps, notebookCursor]
  );
  const notebookStopReviewing = Boolean(
    (notebookCheckpoint || notebookCompleted) &&
    activeNotebookSegment &&
    notebookCursor < activeNotebookSegment.endCursor - 0.0001
  );
  const nextNotebookReviewCursor = useMemo(() => {
    if (!notebookStopReviewing || !activeNotebookSegment) return null;
    return activeNotebookReviewSteps.find((step) => step.cursor > notebookCursor + 0.0001)?.cursor
      ?? activeNotebookSegment.endCursor;
  }, [
    activeNotebookReviewSteps,
    activeNotebookSegment,
    notebookStopReviewing,
    notebookCursor,
  ]);
  const sourceSystemMode = lineSystem.mode === '3d' || notebookScript.mode === '3d' ? '3d' : '2d';
  const effectiveSystemMode = outputModeForSystemMode(sourceSystemMode, displayMatrix);
  const equationLabelItems = useMemo(() => {
    const mode = lineSystem.mode === '3d' ? '3d' : '2d';
    const items = mode === '3d' ? lineSystem.planes : lineSystem.lines;
    return items.map((item, index) => ({
      key: equationSceneLabelKey(item, mode, index),
      name: equationSceneLabelName(item, mode, index),
      color: item.color ?? equationLineColors[index % equationLineColors.length],
    }));
  }, [lineSystem]);
  const systemMatrixMode = effectiveSystemMode;
  const systemMatrixDimension = dimensionForMode(systemMatrixMode);
  const notebookMatrixSignatureList = useMemo(() => notebookMatrixSignatures(notebookScript.cells), [notebookScript.cells]);
  const notebookMatrixSignatureKey = notebookMatrixSignatureList.join('\n');
  const notebookVisualSignatureKey = useMemo(
    () => notebookScript.cells.map(notebookCellSignature).join('\n'),
    [notebookScript.cells]
  );
  const notebookOperationPresentation = useMemo(() => {
    if (!notebookPlaying || !activeNotebookCellId) return null;
    const activeCell = notebookScript.cells.find((cell) => cell.id === activeNotebookCellId);
    return buildNotebookOperationPresentation(activeCell);
  }, [activeNotebookCellId, notebookPlaying, notebookScript.cells]);
  const notebookTokenStyles = useMemo(() => {
    const styles = new Map();
    notebookScript.marks.forEach((mark) => {
      if (!mark?.label || !NOTEBOOK_VARIABLE_MARK_KINDS.has(mark.kind)) return;
      const key = notebookVariableKey(mark.label);
      if (styles.has(key)) return;
      styles.set(key, {
        label: mark.label,
        kind: mark.kind,
        color: mark.color ?? 0x8b5cf6,
        executable: mark.kind === 'matrix',
        hidden: Boolean(mark.hidden),
      });
    });
    notebookScript.cells.forEach((cell) => {
      if (!cell?.name) return;
      const key = notebookVariableKey(cell.name);
      if (styles.has(key)) return;
      styles.set(key, {
        label: cell.name,
        kind: cell.type,
        color: cell.color ?? (cell.type === 'matrix' || cell.refKind === 'matrix' ? NOTEBOOK_MATRIX_HEX : 0x8b5cf6),
        executable: cell.type === 'matrix' || cell.refKind === 'matrix',
        hidden: Boolean(cell.hidden),
      });
    });
    const measuredBasisNames = new Set(
      notebookScript.cells
        .filter((cell) => cell?.type === 'measurement')
        .flatMap((cell) => cell.names ?? [])
        .map(notebookVariableKey)
    );
    NOTEBOOK_BASIS_TOKEN_STYLES.forEach((item) => {
      const key = notebookVariableKey(item.label);
      if (!measuredBasisNames.has(key) || styles.has(key)) return;
      styles.set(key, {
        label: item.label,
        kind: 'basis',
        color: item.color,
        hidden: false,
      });
    });
    const matrixValuesByName = new Map();
    const attachValueText = (name, valueText) => {
      const key = notebookVariableKey(name);
      const current = styles.get(key);
      if (!current || !valueText) return;
      styles.set(key, { ...current, valueText });
    };
    notebookScript.cells.forEach((cell) => {
      if (cell.type === 'matrix' && cell.name) {
        matrixValuesByName.set(notebookVariableKey(cell.name), cell);
        const rows = Array.from({ length: cell.rows }, (_, row) =>
          cell.values
            .slice(row * cell.columns, row * cell.columns + cell.columns)
            .map((value) => formatMatrixNumber(parseNumber(value)))
            .join(' ')
        );
        attachValueText(cell.name, `[${rows.join('; ')}]`);
      }
      if (cell.type === 'equation') {
        (cell.environmentEquations ?? cell.equations ?? []).forEach((entry) => {
          attachValueText(entry.name, splitNotebookLineMeta(entry.text ?? '').body.trim());
        });
      }
      if (cell.type === 'vector' && cell.name) {
        attachValueText(
          cell.name,
          `(${(cell.values ?? []).slice(0, cell.dimension ?? 3).map((value) => formatMatrixNumber(parseNumber(value))).join(', ')})`
        );
      }
      if (cell.type === 'slice' && cell.name) {
        const matrixCell = matrixValuesByName.get(notebookVariableKey(cell.matrixName));
        const values = notebookMatrixSliceValues(matrixCell, cell.axis, cell.sliceIndex);
        if (values) {
          attachValueText(
            cell.name,
            `(${values.slice(0, cell.dimension ?? values.length).map((value) => formatMatrixNumber(parseNumber(value))).join(', ')})`
          );
        }
      }
    });
    return styles;
  }, [notebookScript.cells, notebookScript.marks]);

  const notebookMeasurementItems = useMemo(() => {
    const clampedCursor = Math.max(0, Math.min(100, Number(notebookCursor) || 0));
    const lastLineFromCells = Math.max(
      0,
      ...notebookScript.cells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
    );
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, lastLineFromCells + 1);
    const linePosition = (clampedCursor / 100) * lineCount;
    const hasReachedLine = (lineStart) => {
      const start = Number.isFinite(lineStart) ? lineStart : 0;
      return clampedCursor >= 100 || linePosition > start;
    };
    const lastClearLine = notebookScript.cells.reduce((latest, cell) => (
      cell.type === 'scene' &&
      cell.command === 'clear' &&
      !cell.hidden &&
      hasReachedLine(cell.lineStart)
        ? Math.max(latest, Number(cell.lineStart) || 0)
        : latest
    ), -1);
    const targetByName = new Map(Object.entries(NOTEBOOK_BASIS_MEASUREMENT_TARGETS));
    measureTargetMap.forEach((target) => {
      if (target?.name) targetByName.set(notebookVariableKey(target.name), target.id);
    });
    notebookScript.cells.forEach((cell) => {
      if (
        (
          cell.type === 'vector' ||
          cell.type === 'slice' ||
          (cell.type === 'calc' && cell.resultKind === 'vector') ||
          (cell.type === 'ref' && cell.refKind === 'vector' && !cell.remove)
        ) &&
        !cell.remove &&
        cell.name
      ) {
        const targetId = `v:${notebookVectorIdForName(cell.name, 0)}`;
        targetByName.set(notebookVariableKey(cell.name), targetId);
      }
    });

    return notebookScript.cells
      .filter((cell) => (
        cell.type === 'measurement' &&
        !cell.hidden &&
        hasReachedLine(cell.lineStart) &&
        (Number(cell.lineStart) || 0) > lastClearLine
      ))
      .map((cell) => {
        const targets = cell.names
          .map((name) => targetByName.get(notebookVariableKey(name)))
          .filter((targetId) => targetId && measureTargetMap.has(targetId));
        if (cell.measureType === 'dot' && targets.length < 2) return null;
        if (cell.measureType === 'sum' && targets.length < 2) return null;
        if (cell.measureType === 'volume' && targets.length < 2) return null;
        const pickedTargets = cell.measureType === 'volume' ? targets.slice(0, 3) : targets.slice(0, 2);
        return {
          id: `notebook-measure-${cell.lineStart}-${cell.measureType}`,
          name: cell.name,
          type: cell.measureType,
          targets: pickedTargets,
          visible: true,
          source: 'notebook',
          cellId: cell.id,
          lineStart: cell.lineStart,
        };
      })
      .filter(Boolean);
  }, [measureTargetMap, notebookCursor, notebookScript.cells, notebookScript.lineCount]);
  const notebookMeasurementItemsKey = notebookMeasurementItems
    .map((item) => [item.id, item.cellId, item.name, item.type, item.lineStart, ...item.targets].join(':'))
    .join('|');

  useEffect(() => {
    if (workspaceMode !== 'system') {
      setMeasurements((previous) => {
        const next = previous.filter((item) => item.source !== 'notebook');
        return next.length === previous.length ? previous : next;
      });
      return;
    }

    setMeasurements((previous) => {
      const notebookKeys = new Set(notebookMeasurementItems.map((item) => measurementStateKey(item.type, item.targets)));
      const previousVisibility = new Map(
        previous.map((item) => [measurementStateKey(item.type, item.targets), item.visible !== false])
      );
      const manualItems = previous.filter(
        (item) => item.source !== 'notebook' && !notebookKeys.has(measurementStateKey(item.type, item.targets))
      );
      const syncedItems = notebookMeasurementItems.map((item) => ({
        ...item,
        visible: previousVisibility.get(measurementStateKey(item.type, item.targets)) ?? true,
      }));
      const next = [...manualItems, ...syncedItems];
      const isSame =
        previous.length === next.length &&
        previous.every((item, index) => {
          const other = next[index];
          return (
            other &&
            item.id === other.id &&
            item.name === other.name &&
            item.type === other.type &&
            item.source === other.source &&
            item.cellId === other.cellId &&
            item.visible === other.visible &&
            item.lineStart === other.lineStart &&
            item.targets.join('|') === other.targets.join('|')
          );
        });
      return isSame ? previous : next;
    });
  }, [notebookMeasurementItemsKey, workspaceMode]);

  const notebookProgressRatio = Math.max(0, Math.min(1, notebookCursor / 100));
  const notebookLineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount);
  const notebookActiveLineIndex = notebookActiveLineIndexForCursor(notebookCursor, notebookLineCount);
  const notebookTimelineMarks = useMemo(() => {
    const seen = new Set();
    const sourceLines = String(notebookText ?? '').replace(/\r/g, '').split('\n');
    return notebookScript.marks
      .map((mark, lineIndex) => ({ ...mark, lineIndex }))
      .filter((mark) => mark?.label && !mark.hidden && mark.kind !== 'blank' && mark.kind !== 'note')
      .filter((mark) => {
        const key = `${mark.lineIndex}:${mark.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((mark) => ({
        ...mark,
        percent: notebookCursorForLineReveal(mark.lineIndex, notebookLineCount),
        detail: String(sourceLines[mark.lineIndex] ?? mark.label)
          .replace(/^\s*!?\s*\/\/\s*/u, '')
          .replace(/\{\{\s*([^}]+?)\s*\}\}/gu, '$1')
          .replace(/\*\*([^*]+)\*\*/gu, '$1')
          .replace(/\\n/gu, ' · ')
          .trim() || mark.label,
      }));
  }, [notebookLineCount, notebookScript.marks, notebookText]);
  const notebookSegmentTimelineMarks = useMemo(() => {
    if (!activeNotebookSegment) return [];
    const start = activeNotebookSegment.startCursor;
    const end = activeNotebookSegment.endCursor;
    return notebookTimelineMarks
      .filter((mark) => mark.percent >= start - 0.0001 && mark.percent <= end + 0.0001)
      .map((mark) => ({
        ...mark,
        globalPercent: mark.percent,
        percent: notebookSegmentProgress(mark.percent, activeNotebookSegment),
      }));
  }, [activeNotebookSegment, notebookTimelineMarks]);

  useEffect(() => {
    notebookHasVisualVectorsRef.current = notebookScript.cells.some(
      (cell) =>
        ((cell.type === 'vector' || cell.type === 'slice') && cell.execute !== false && !cell.remove) ||
        (cell.type === 'calc' && cell.resultKind === 'vector' && cell.execute === true) ||
        (cell.type === 'ref' && cell.refKind === 'vector' && !cell.remove)
    );
    notebookHasMatrixCellsRef.current = notebookScript.cells.some(
      (cell) =>
        cell.type === 'matrix' ||
        (cell.type === 'calc' && cell.resultKind === 'matrix') ||
        (cell.type === 'ref' && cell.refKind === 'matrix')
    );
  }, [notebookScript.cells]);

  useEffect(() => {
    setNotebookCells((previous) =>
      previous.map((cell) =>
        cell.type !== 'matrix'
          ? cell
          : cell.mode === systemMatrixMode
          ? cell
          : {
              ...cell,
              mode: systemMatrixMode,
              text: matrixTextFromValues(identityInputValuesForMode(systemMatrixMode), systemMatrixDimension),
            }
      )
    );
  }, [systemMatrixDimension, systemMatrixMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const theme = mediaQuery.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      const themeColor = theme === 'dark' ? '#10110f' : '#f5f4ef';
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', themeColor);
    };
    applyTheme();
    mediaQuery.addEventListener?.('change', applyTheme);
    return () => {
      mediaQuery.removeEventListener?.('change', applyTheme);
    };
  }, []);

  useEffect(() => {
    systemDimensionRef.current = effectiveSystemMode;
  }, [effectiveSystemMode]);

  useEffect(() => {
    vectorToolModeRef.current = vectorToolMode;
  }, [vectorToolMode]);

  useEffect(() => {
    workspaceModeRef.current = workspaceMode;
    if (workspaceMode === 'system') {
      setShowGrid(true);
      setShowRelativeGrid(false);
      setShowCoordinates(false);
      setVectorToolMode('vector');
    } else {
      setShowRelativeGrid(true);
      setShowCoordinates(true);
      setVectorToolMode('vector');
    }
  }, [workspaceMode]);

  useEffect(() => {
    userVectorRef.current = parsedVector;
    vectorsRef.current = vectorItems;
    activeVectorIdRef.current = activeVector.id;
  }, [activeVector.id, parsedVector, vectorItems]);

  useEffect(() => {
    scalarSolutionRef.current = scalarConstraintSolution;
  }, [scalarConstraintSolution]);

  useEffect(() => {
    measurementsRef.current = measurements;
  }, [measurements]);

  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

  useEffect(() => {
    measureDraftRef.current = measureDraft;
  }, [measureDraft]);

  useEffect(() => {
    dragSnapEnabledRef.current = snapToInteger;
    if (!snapToInteger) setDragSnapGuide(null);
  }, [setDragSnapGuide, snapToInteger]);

  useEffect(() => {
    uiStateRef.current = {
      showVolume,
      showVector,
      showBasis,
      basisVisibility,
      showGrid,
      showRelativeGrid,
      relativeGridStrength,
      showCoordinates: true,
      showCoordinateNumbers: showCoordinates,
      showAutomaticSolution,
      showDot,
      showAxes,
      showRelativeAxes,
      notebookSolutionSelection: uiStateRef.current.notebookSolutionSelection ?? null,
    };
  }, [
    showVolume,
    showVector,
    showBasis,
    basisVisibility,
    showGrid,
    showRelativeGrid,
    relativeGridStrength,
    showCoordinates,
    showAutomaticSolution,
    showDot,
    showAxes,
    showRelativeAxes,
  ]);

  useEffect(() => {
    if (!threeRef.current) return;

    const mode = viewKeyForMatrix(displayMatrix);
    const labelWithCoord = (name, values, coordMode = mode, highlightIndices = []) =>
      coordLabelText(name, values, coordMode, showCoordinates, highlightIndices);
    const showLabel = (label, text, visible) => {
      if (!label) return;
      const contentChanged = setAxisLabelText(label, text);
      const nextDisplay = visible ? 'block' : 'none';
      const visibilityChanged = label.style.display !== nextDisplay;
      if (visibilityChanged) label.style.display = nextDisplay;
      if (contentChanged || visibilityChanged) threeRef.current.labelLayoutDirty = true;
    };

    const basisVectors = {
      i: [displayMatrix[0], displayMatrix[3], displayMatrix[6]],
      j: [displayMatrix[1], displayMatrix[4], displayMatrix[7]],
      k: [displayMatrix[2], displayMatrix[5], displayMatrix[8]],
    };

    showLabel(
      iLabelRef.current,
      labelWithCoord('i', basisVectors.i),
      showBasis && basisVisibility.i !== false && vectorLength(basisVectors.i) > EPSILON
    );
    showLabel(
      jLabelRef.current,
      labelWithCoord('j', basisVectors.j),
      showBasis && basisVisibility.j !== false && vectorLength(basisVectors.j) > EPSILON
    );
    showLabel(
      kLabelRef.current,
      labelWithCoord('k', basisVectors.k, '3d'),
      showBasis && basisVisibility.k !== false && vectorLength(basisVectors.k) > 0.08
    );

    vectors.forEach((item) => {
      const label = vectorLabelRefs.current.get(item.id);
      const values = [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)];
      const transformed = transformVector3(displayMatrix, values);
      const scalarSpace = item.scalarSpace === 'input' ? 'input' : 'output';
      const scalarNormal = scalarSpace === 'input' ? values : transformed;
      const highlightIndices = item.scalarEnabled ? scalarLockHighlightIndices(scalarNormal, mode) : [];
      showLabel(
        label,
        labelWithCoord(item.name, transformed, mode, highlightIndices),
        showVector && item.visible !== false
      );
    });
  }, [basisVisibility, displayMatrix, showBasis, showCoordinates, showVector, vectors]);

  useEffect(() => {
    cameraLockedRef.current = cameraLocked;
    zoomLockedRef.current = zoomLocked;
    if (workspaceMode === 'system') {
      autoCameraTargetViewRef.current = notebookAutoCameraViewRef.current ?? effectiveSystemMode;
    } else {
      notebookAutoCameraViewRef.current = null;
      autoCameraTargetViewRef.current = displayMode;
    }
    if (cameraLocked) {
      cameraMoveRef.current.active = false;
    }

    const refs = threeRef.current;
    if (refs?.controls) {
      configureControlsForView(refs.controls, activeView ?? displayMode, {
        camera: cameraLocked,
        zoom: zoomLocked,
      });
      refs.controls.update();
    }
  }, [activeView, cameraLocked, displayMode, effectiveSystemMode, workspaceMode, zoomLocked]);

  const updateVectorValue = useCallback((id, axis, value) => {
    setVectors((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, [axis]: value.replace(/^0+(?=\d)/, '') } : item
      )
    );
  }, []);

  const updateVectorScalar = useCallback((id, value) => {
    const nextValue = cleanScalarText(value);
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalar: nextValue.replace(/^0+(?=\d)/, '') } : item))
    );
  }, []);

  const updateVectorScalarSpace = useCallback((id, scalarSpace) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalarSpace } : item))
    );
  }, []);

  const restorePanelScrollTop = useCallback((scrollTop, vectorId = null) => {
    if (!Number.isFinite(scrollTop) || typeof window === 'undefined') return;

    const restore = () => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = scrollTop;
    };
    const keepVectorBottomVisible = () => {
      const scroller = panelScrollRef.current;
      if (!scroller || !vectorId) return;
      const escapedId = window.CSS?.escape ? window.CSS.escape(vectorId) : vectorId.replace(/"/g, '\\"');
      const card = scroller.querySelector(`[data-vector-id="${escapedId}"]`);
      if (!card) return;
      const nextCard = card.nextElementSibling?.classList.contains('vector-card')
        ? card.nextElementSibling
        : null;
      const scrollerRect = scroller.getBoundingClientRect();
      const bottomRect = (nextCard ?? card).getBoundingClientRect();
      const bottomOverflow = bottomRect.bottom - scrollerRect.bottom + 8;
      if (bottomOverflow > 0) scroller.scrollTop += bottomOverflow;
    };

    window.requestAnimationFrame(() => {
      restore();
      keepVectorBottomVisible();
      window.requestAnimationFrame(() => {
        restore();
        keepVectorBottomVisible();
      });
    });
    window.setTimeout(() => {
      restore();
      keepVectorBottomVisible();
    }, 120);
  }, []);

  const toggleVectorScalar = useCallback((id, checked) => {
    const scrollTop = panelScrollRef.current?.scrollTop;
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalarEnabled: checked } : item))
    );
    restorePanelScrollTop(scrollTop, id);
  }, [restorePanelScrollTop]);

  const toggleVectorVisible = useCallback((id) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: item.visible === false } : item))
    );
  }, []);

  const toggleBasisVisible = useCallback((id) => {
    setBasisVisibility((previous) => ({ ...previous, [id]: previous[id] === false }));
  }, []);

  const toggleMeasureMode = useCallback((mode) => {
    setMeasureMode((previous) => {
      const next = previous === mode ? null : mode;
      setMeasureDraft([]);
      setMeasureAnchorId(null);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
      return next;
    });
  }, []);

  const startMeasurementFrom = useCallback((mode, targetId, event = null) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setMeasureMode(mode);
    setMeasureDraft([targetId]);
    setMeasureAnchorId(null);
    setMeasurePointer(
      event && rect
        ? {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }
        : null
    );
    setHoveredMeasureTargetId(null);
    setShowVector(true);
    if (targetId.startsWith('v:')) {
      setActiveVectorId(targetId.slice(2));
    }
  }, []);

  const toggleMeasurementVisible = useCallback((id) => {
    setMeasurements((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: item.visible === false } : item))
    );
  }, []);

  const notebookNameForMeasureTarget = useCallback((targetId) => {
    if (targetId === 'b:i') return 'i';
    if (targetId === 'b:j') return 'j';
    if (targetId === 'b:k') return 'k';
    if (targetId?.startsWith('v:')) {
      const vectorId = targetId.slice(2);
      return vectorsRef.current.find((item) => item.id === vectorId)?.name ?? vectorId;
    }
    return null;
  }, []);

  const notebookMeasurementExpressionForTargets = useCallback((type, targetIds) => {
    const names = targetIds.map(notebookNameForMeasureTarget).filter(Boolean);
    if (type === 'dot') return names.length >= 2 ? `dot(${names[0]}, ${names[1]})` : null;
    if (type === 'sum') return names.length >= 2 ? `sum(${names[0]}, ${names[1]})` : null;
    if (type === 'volume') return names.length >= 2 ? `det(${names.join(', ')})` : null;
    return null;
  }, [notebookNameForMeasureTarget]);

  const nextNotebookMeasurementAlias = useCallback((lines, prefix) => {
    const aliasPattern = new RegExp(`#${prefix}(\\d+)\\b`, 'gi');
    const nextIndex = [...String(lines.join('\n')).matchAll(aliasPattern)]
      .reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0) + 1;
    return `${prefix}${nextIndex}`;
  }, []);

  const resolveNotebookMeasurementAlias = useCallback((lines, currentAlias, nextType) => {
    const normalized = normalizeNotebookVariableName(currentAlias ?? '');
    const generated = /^(?:dot|det|sum)\d+$/iu.test(normalized);
    if (normalized && !generated) return normalized;
    const prefix = nextType === 'dot' ? 'dot' : nextType === 'sum' ? 'sum' : 'det';
    if (normalized && notebookVariableKey(normalized).startsWith(prefix)) return normalized;
    return nextNotebookMeasurementAlias(lines, prefix);
  }, [nextNotebookMeasurementAlias]);

  const updateNotebookMeasurementFormula = useCallback((source, nextType, nextTargets) => {
    if (workspaceModeRef.current !== 'system' || source?.source !== 'notebook') return false;
    const expression = notebookMeasurementExpressionForTargets(nextType, nextTargets);
    if (!expression) return false;

    setNotebookText((previous) => {
      const normalized = String(previous ?? '').replace(/\r/g, '');
      const lines = normalized.split('\n');
      let index = Number.isInteger(source.lineStart) ? source.lineStart : -1;
      if (index < 0 || index >= lines.length) {
        const previousExpression = notebookMeasurementExpressionForTargets(source.type, source.targets);
        index = previousExpression
          ? lines.findIndex((line) => splitNotebookLineMeta(line).body.trim() === previousExpression)
          : -1;
      }
      if (index < 0 || index >= lines.length) return previous;

      const meta = splitNotebookLineMeta(lines[index]);
      const alias = resolveNotebookMeasurementAlias(lines, meta.alias, nextType);
      lines[index] = appendNotebookLineMeta(expression, { alias, hidden: meta.hidden });
      return lines.join('\n');
    });
    return true;
  }, [notebookMeasurementExpressionForTargets, resolveNotebookMeasurementAlias]);

  const removeMeasurement = useCallback((id) => {
    const source = measurementsRef.current.find((item) => item.id === id);
    if (workspaceModeRef.current === 'system' && source?.source === 'notebook') {
      setNotebookText((previous) => {
        const lines = String(previous ?? '').replace(/\r/g, '').split('\n');
        if (Number.isInteger(source.lineStart) && lines[source.lineStart]) {
          return lines.filter((_, index) => index !== source.lineStart).join('\n');
        }

        const expression = notebookMeasurementExpressionForTargets(source.type, source.targets);
        if (!expression) return previous;
        return lines
          .filter((line) => splitNotebookLineMeta(line).body.trim() !== expression)
          .join('\n');
      });
    }
    setMeasurements((previous) => previous.filter((item) => item.id !== id));
  }, [notebookMeasurementExpressionForTargets]);

  const reverseMeasurementOrder = useCallback((id) => {
    const source = measurementsRef.current.find((item) => item.id === id);
    if ((source?.type === 'dot' || source?.type === 'sum') && source.targets.length >= 2) {
      updateNotebookMeasurementFormula(source, source.type, [...source.targets].reverse());
    }
    setMeasurements((previous) =>
      previous.map((item) => (
        item.id === id && (item.type === 'dot' || item.type === 'sum') && item.targets.length >= 2
          ? { ...item, targets: [...item.targets].reverse() }
          : item
      ))
    );
  }, [updateNotebookMeasurementFormula]);

  const convertMeasurementType = useCallback((id) => {
    const sourceSnapshot = measurementsRef.current.find((item) => item.id === id);
    if (sourceSnapshot && sourceSnapshot.targets.length >= 2) {
      const nextType = sourceSnapshot.type === 'dot' ? 'volume' : 'dot';
      updateNotebookMeasurementFormula(sourceSnapshot, nextType, sourceSnapshot.targets.slice(0, 2));
    }
    setMeasurements((previous) => {
      const source = previous.find((item) => item.id === id);
      if (!source || source.targets.length < 2) return previous;
      const nextType = source.type === 'dot' ? 'volume' : 'dot';
      const nextTargets = source.type === 'dot' ? source.targets.slice(0, 2) : source.targets.slice(0, 2);
      const nextKey = measurementStateKey(nextType, nextTargets);
      return previous
        .filter((item) => item.id === id || measurementStateKey(item.type, item.targets) !== nextKey)
        .map((item) => (
          item.id === id
            ? { ...item, type: nextType, targets: nextTargets, visible: true }
            : item
        ));
    });
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    setMeasurePointer(null);
  }, [updateNotebookMeasurementFormula]);

  const continueMeasurement = useCallback((item) => {
    const targetIds = item?.targetIds ?? item?.targets;
    if (!item || item.type !== 'volume' || !Array.isArray(targetIds) || targetIds.length < 2) return;
    setMeasureMode('volume');
    setMeasureDraft(targetIds.slice(0, 2));
    setMeasureAnchorId(item.id);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
  }, []);

  const continueDotMeasurement = useCallback((item, event = null) => {
    const targetIds = item?.targetIds ?? item?.targets;
    if (!item || item.type !== 'dot' || !Array.isArray(targetIds) || targetIds.length < 2) return;
    startMeasurementFrom('dot', targetIds[targetIds.length - 1], event);
  }, [startMeasurementFrom]);

  const appendNotebookMeasurementFormula = useCallback((type, targetIds) => {
    if (workspaceModeRef.current !== 'system') return;
    const expression = notebookMeasurementExpressionForTargets(type, targetIds);
    if (!expression) return;
    const aliasPrefix = type === 'dot' ? 'dot' : type === 'sum' ? 'sum' : 'det';

    setNotebookText((previous) => {
      const normalized = String(previous ?? '').replace(/\r/g, '');
      const lines = normalized ? normalized.split('\n') : [];
      const alreadyExists = lines
        .some((line) => splitNotebookLineMeta(line).body.trim() === expression);
      if (alreadyExists) return previous;

      const aliasPattern = new RegExp(`#${aliasPrefix}(\\d+)\\b`, 'gi');
      const nextIndex = [...normalized.matchAll(aliasPattern)]
        .reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0) + 1;
      const insertionLineIndex = notebookInsertionLineIndexForCursor(normalized, notebookCursor);
      lines.splice(insertionLineIndex, 0, `${expression}  #${aliasPrefix}${nextIndex}`);
      pendingNotebookUiInsertionRef.current = { lineIndex: insertionLineIndex };
      return lines.join('\n');
    });
  }, [notebookCursor, notebookMeasurementExpressionForTargets]);

  const pickMeasureTarget = useCallback((targetId) => {
    if (!measureMode || measureDraft.length === 0) return false;
    if (measureDraft.includes(targetId)) {
      setMeasureDraft([]);
      setMeasureAnchorId(null);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
      setMeasureMode(null);
      return true;
    }
    const withoutDuplicate = measureDraft.filter((id) => id !== targetId);
    const next = [...withoutDuplicate, targetId];
    const addMeasurement = (type, targets, replaceTargets = null) => {
      const id = `m${nextMeasurementIndexRef.current}`;
      nextMeasurementIndexRef.current += 1;
      const source = workspaceModeRef.current === 'system' ? 'notebook' : 'manual';
      const replaceSource = replaceTargets
        ? measurementsRef.current.find((item) => (
          measurementStateKey(item.type, item.targets) === measurementStateKey(type, replaceTargets)
        ))
        : null;
      const updatedNotebookFormula = updateNotebookMeasurementFormula(replaceSource, type, targets);
      setMeasurements((items) => [
        ...items.filter((item) => {
          const itemKey = measurementStateKey(item.type, item.targets);
          if (itemKey === measurementStateKey(type, targets)) return false;
          if (replaceTargets && itemKey === measurementStateKey(type, replaceTargets)) return false;
          return true;
        }),
        { id, type, targets, visible: true, source },
      ]);
      if (!updatedNotebookFormula) appendNotebookMeasurementFormula(type, targets);
    };

    if (next.length < 2) {
      setMeasureDraft(next);
      return true;
    }

    const targetLimit = measureMode === 'volume' && displayMode === '3d' ? 3 : 2;
    addMeasurement(measureMode, next.slice(0, targetLimit), measureDraft.length >= 2 ? measureDraft : null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
    setMeasureMode(null);
    return true;
  }, [appendNotebookMeasurementFormula, displayMode, measureDraft, measureMode, updateNotebookMeasurementFormula]);

  const handleBasisLegendClick = useCallback((id) => {
    if (measureMode && measureDraft.length === 0) {
      startMeasurementFrom(measureMode, `b:${id}`);
      return;
    }
    if (pickMeasureTarget(`b:${id}`)) return;
    toggleBasisVisible(id);
  }, [measureDraft.length, measureMode, pickMeasureTarget, startMeasurementFrom, toggleBasisVisible]);

  const handleVectorLegendClick = useCallback((id) => {
    if (measureMode && measureDraft.length === 0) {
      startMeasurementFrom(measureMode, `v:${id}`);
      return;
    }
    if (pickMeasureTarget(`v:${id}`)) return;
    toggleVectorVisible(id);
  }, [measureDraft.length, measureMode, pickMeasureTarget, startMeasurementFrom, toggleVectorVisible]);

  const showAllVectorTargets = useCallback(() => {
    setShowVector(true);
    setShowBasis(true);
    setBasisVisibility({ i: true, j: true, k: true });
    setVectors((previous) => previous.map((item) => ({ ...item, visible: true })));
  }, []);

  const hideAllVectorTargets = useCallback(() => {
    setBasisVisibility({ i: false, j: false, k: false });
    setVectors((previous) => previous.map((item) => ({ ...item, visible: false })));
  }, []);

  const getMeasureTargetLabelNode = useCallback((targetId) => {
    if (targetId === 'b:i') return iLabelRef.current;
    if (targetId === 'b:j') return jLabelRef.current;
    if (targetId === 'b:k') return kLabelRef.current;
    if (targetId?.startsWith('v:')) return vectorLabelRefs.current.get(targetId.slice(2)) ?? null;
    return null;
  }, []);

  const renderLabelMeasureTools = useCallback((targetId) => (
    <span
      className="label-measure-menu"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <button
        className={measureMode === 'sum' && measureDraft.includes(targetId) ? 'active' : ''}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startMeasurementFrom('sum', targetId, event);
        }}
        title={t(locale, 'sumConnect')}
        type="button"
      >
        <Plus size={13} />
      </button>
      <button
        className={measureMode === 'dot' && measureDraft.includes(targetId) ? 'active' : ''}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startMeasurementFrom('dot', targetId, event);
        }}
        title={t(locale, 'dotConnect')}
        type="button"
      >
        <Sigma size={12} />
      </button>
      <button
        className={measureMode === 'volume' && measureDraft.includes(targetId) ? 'active' : ''}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startMeasurementFrom('volume', targetId, event);
        }}
        title={t(locale, 'areaVolumeConnect')}
        type="button"
      >
        <Box size={12} />
      </button>
      <button
        className="label-hide-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (targetId.startsWith('b:')) {
            toggleBasisVisible(targetId.slice(2));
            return;
          }
          if (targetId.startsWith('v:')) {
            toggleVectorVisible(targetId.slice(2));
          }
        }}
        title={t(locale, 'hideTarget')}
        type="button"
      >
        <EyeOff size={12} />
      </button>
    </span>
  ), [locale, measureDraft, measureMode, startMeasurementFrom, toggleBasisVisible, toggleVectorVisible]);

  const renderMeasurementLabelTools = useCallback((item) => {
    const targetIds = item?.targetIds ?? item?.targets ?? [];
    const canContinueDot = item?.type === 'dot' && targetIds.length >= 2;
    const canReverseOrder = (item?.type === 'dot' || item?.type === 'sum') && targetIds.length >= 2;
    const canConvertMeasurement = (item?.type === 'dot' || item?.type === 'volume') && targetIds.length >= 2;
    const canContinueVolume = item?.type === 'volume' && targetIds.length === 2 && displayMode === '3d';

    return (
      <span
        className="measurement-label-menu"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        {canContinueDot && (
          <button
            className="measurement-label-add measurement-label-add-dot"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              continueDotMeasurement(item, event);
            }}
            title={t(locale, 'continueDot')}
            type="button"
          >
            <span className="measurement-add-icon">
              <Sigma size={12} />
              <Plus size={8} />
            </span>
          </button>
        )}
        {canReverseOrder && (
          <button
            className="measurement-label-reverse"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              reverseMeasurementOrder(item.id);
            }}
            title={t(locale, 'reverseDirection')}
            type="button"
          >
            <ArrowLeftRight size={12} />
          </button>
        )}
        {canConvertMeasurement && (
          <button
            className={`measurement-label-convert ${item.type === 'dot' ? 'to-volume' : 'to-dot'}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              convertMeasurementType(item.id);
            }}
            title={item.type === 'dot' ? t(locale, 'convertToVolume') : t(locale, 'convertToDot')}
            type="button"
          >
            {item.type === 'dot' ? <Box size={12} /> : <Sigma size={12} />}
          </button>
        )}
        {canContinueVolume && (
          <button
            className="measurement-label-add measurement-label-add-volume"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              continueMeasurement(item);
            }}
            title={t(locale, 'extendVolume')}
            type="button"
          >
            <span className="measurement-add-icon">
              <Box size={12} />
              <Plus size={8} />
            </span>
          </button>
        )}
        <button
          className="measurement-label-delete"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            removeMeasurement(item.id);
          }}
          title={t(locale, 'deleteMeasurement')}
          type="button"
        >
          <X size={12} />
        </button>
      </span>
    );
  }, [continueDotMeasurement, continueMeasurement, convertMeasurementType, displayMode, locale, removeMeasurement, reverseMeasurementOrder]);

  const renderMeasurementChip = useCallback((item) => (
    <div
      className={`measure-chip measure-${item.measureKind ?? item.type} ${item.visible === false ? 'muted' : ''}`}
      key={item.id}
    >
      <button
        onClick={() => toggleMeasurementVisible(item.id)}
        title={t(locale, 'toggleMeasurement', {
          type: item.type === 'dot' ? t(locale, 'dot') : item.type === 'sum' ? t(locale, 'sum') : t(locale, 'volume'),
        })}
        type="button"
      >
        <span>{item.type === 'dot' ? 'Σ' : item.type === 'sum' ? '+' : '□'}</span>
        <strong>{item.label}</strong>
        {item.value !== null && <em>{item.valueText ?? formatNumber(item.value)}</em>}
      </button>
      {(item.type === 'dot' || item.type === 'volume') && item.targetIds?.length >= 2 && (
        <button
          className={`measure-convert ${item.type === 'dot' ? 'to-volume' : 'to-dot'}`}
          onClick={() => convertMeasurementType(item.id)}
          title={item.type === 'dot' ? t(locale, 'convertToVolume') : t(locale, 'convertToDot')}
          type="button"
        >
          {item.type === 'dot' ? <Box size={11} /> : <Sigma size={11} />}
        </button>
      )}
      {item.type === 'volume' && item.targetIds?.length === 2 && displayMode === '3d' && (
        <button
          className="measure-extend"
          onClick={() => continueMeasurement(item)}
          title={t(locale, 'extendVolume')}
          type="button"
        >
          <Plus size={11} />
        </button>
      )}
      <button
        className="measure-remove"
        onClick={() => removeMeasurement(item.id)}
        title={t(locale, 'removeMeasurement')}
        type="button"
      >
        <X size={11} />
      </button>
    </div>
  ), [continueMeasurement, convertMeasurementType, displayMode, locale, removeMeasurement, toggleMeasurementVisible]);

  const updateMeasurePointer = useCallback((event) => {
    if (!measureMode || measureDraft.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMeasurePointer({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, [measureDraft.length, measureMode]);

  const measureDraftGuide = useMemo(() => {
    if (!measureMode || measureDraft.length === 0 || !measurePointer) return null;
    const anchorTargetNode = measureAnchorId
      ? measurementLabelRefs.current.get(measureAnchorId)
      : getMeasureTargetLabelNode(measureDraft[measureDraft.length - 1]);
    const sceneNode = containerRef.current;
    if (!anchorTargetNode || !sceneNode) return null;
    const targetRect = anchorTargetNode.getBoundingClientRect();
    const sceneRect = sceneNode.getBoundingClientRect();
    return {
      x1: targetRect.left + targetRect.width / 2 - sceneRect.left,
      y1: targetRect.top + targetRect.height / 2 - sceneRect.top,
      x2: measurePointer.x,
      y2: measurePointer.y,
      snapped: !!hoveredMeasureTargetId && !measureDraft.includes(hoveredMeasureTargetId),
    };
  }, [getMeasureTargetLabelNode, hoveredMeasureTargetId, measureAnchorId, measureDraft, measureMode, measurePointer]);

  const focusVectorDot = useCallback((id) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: true, scalarEnabled: false } : item))
    );
    setActiveVectorId(id);
    setShowVector(true);
    setShowDot(true);
  }, []);

  const addVector = useCallback(() => {
    const index = nextVectorIndexRef.current;
    nextVectorIndexRef.current += 1;
    const next = createVectorState(index - 1, {
      id: `v${index}`,
      name: `v${index}`,
      x: String(index),
      y: '1',
      z: '0',
    });
    setVectors((previous) => [...previous, next]);
    setActiveVectorId(next.id);
  }, []);

  const removeVector = useCallback((id) => {
    setMeasurements((current) => current.filter((item) => !item.targets.includes(`v:${id}`)));
    setVectors((previous) => {
      const next = previous.filter((item) => item.id !== id);
      if (activeVectorIdRef.current === id) {
        const fallback = next[0]?.id ?? '';
        activeVectorIdRef.current = fallback;
        setActiveVectorId(fallback);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const refs = threeRef.current;
    if (!refs) return undefined;

    clearEquationGroup(refs.equationGroup);
    refs.equationPoint.userData.visible = false;
    refs.equationPoint.userData.inputPoint = null;
    refs.equationPoint.userData.revealKey = null;
    refs.equationPoint.visible = false;

    if (workspaceMode !== 'system' && vectorToolMode !== 'system') {
      refs.equationGroup.visible = false;
      return undefined;
    }

    refs.equationGroup.visible = true;

    if (lineSystem.mode === '3d') {
      lineSystem.planes.forEach((plane, index) => {
        const focusName = equationSceneLabelName(plane, '3d', index);
        createPlaneObjects(plane, 6.5, false).forEach((object, objectIndex) => {
          object.userData.revealKey = `equation:plane:${plane.index}`;
          object.userData.focusName = focusName;
          object.userData.focusRole = objectIndex === 0 ? 'surface' : 'edge';
          refs.equationGroup.add(object);
        });
      });
      createSolutionHighlightObjects(lineSystem.solution, 0xf1b434).forEach((object, objectIndex) => {
        object.userData.revealKey = `equation:solution:${lineSystem.solution?.status ?? 'none'}`;
        object.userData.solutionGeometry = true;
        object.userData.focusRole = objectIndex === 0
          ? 'solution-glow'
          : objectIndex === 1 ? 'solution-core' : 'solution-point';
        refs.equationGroup.add(object);
      });
    } else {
      lineSystem.lines.forEach((line, index) => {
        const segment = lineSegmentForEquation(line);
        if (segment.length < 2) return;
        const start = new THREE.Vector3(segment[0][0], segment[0][1], 0.018);
        const end = new THREE.Vector3(segment[1][0], segment[1][1], 0.018);
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({
          color: line.color,
          transparent: true,
          opacity: 0.96,
          depthTest: false,
          depthWrite: false,
        });
        const lineMesh = new THREE.Line(geometry, material);
        lineMesh.renderOrder = 32;
        lineMesh.userData.revealKey = `equation:line:${line.index}`;
        lineMesh.userData.focusName = equationSceneLabelName(line, '2d', index);
        lineMesh.userData.focusRole = 'line';

        const focusHalo = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 32, 0.028, 8, false),
          new THREE.MeshBasicMaterial({
            color: line.color,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        focusHalo.position.z = -0.012;
        focusHalo.renderOrder = 31;
        focusHalo.visible = false;
        focusHalo.userData.focusName = equationSceneLabelName(line, '2d', index);
        focusHalo.userData.focusRole = 'halo';
        refs.equationGroup.add(focusHalo, lineMesh);
      });
    }

    if (lineSystem.point) {
      refs.equationPoint.userData.inputPoint = [
        lineSystem.point[0],
        lineSystem.point[1],
        lineSystem.mode === '3d' ? lineSystem.point[2] : 0.055,
      ];
      refs.equationPoint.userData.solutionPoint = [...lineSystem.point];
      refs.equationPoint.userData.mode = lineSystem.mode;
      refs.equationPoint.position.set(
        refs.equationPoint.userData.inputPoint[0],
        refs.equationPoint.userData.inputPoint[1],
        refs.equationPoint.userData.inputPoint[2]
      );
      refs.equationPoint.userData.visible = true;
      refs.equationPoint.userData.revealKey = `equation:point:${lineSystem.mode}`;
      refs.equationPoint.visible = true;
    }

    return () => {
      clearEquationGroup(refs.equationGroup);
    };
  }, [lineSystem, workspaceMode, vectorToolMode]);

  const previewDraggedMatrix = useCallback((matrix) => {
    const next = [...matrix];
    currentMatrixRef.current = next;
    startMatrixRef.current = next;
    targetMatrixRef.current = next;
    isAnimatingRef.current = false;
    setProgress(1);
    setDisplayMatrix(next);
    setBasisControlMatrix(next);
  }, []);

  const updateBasisInputValue = useCallback((basisId, axis, value) => {
    const columnIndex = basisId === 'i' ? 0 : basisId === 'j' ? 1 : 2;
    const rowOffset = axis === 'x' ? 0 : axis === 'y' ? 3 : 6;
    const next = [...targetMatrixRef.current];
    next[columnIndex + rowOffset] = parseNumber(value);
    setBasisControlMatrix(next);
    startMatrixRef.current = [...currentMatrixRef.current];
    targetMatrixRef.current = next;
    animationViewFromRef.current = viewKeyForMatrix(currentMatrixRef.current);
    animationViewToRef.current = viewKeyForMatrix(next);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    isAnimatingRef.current = true;
    setProgress(0);
    const nextView = viewKeyForMatrix(next);
    const refs = threeRef.current;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(nextView);
    if (refs) {
      configureControlsForView(refs.controls, nextView, controlLocksFromRefs());
      const destination = cameraStateForView(nextView, refs.camera.position, refs.controls.target);
      cameraMoveRef.current = {
        active: true,
        startTime: null,
        positionFrom: refs.camera.position.clone(),
        targetFrom: refs.controls.target.clone(),
        positionTo: destination.position,
        targetTo: destination.target,
      };
    }
  }, []);

  const resetBasisVector = useCallback((basisId) => {
    const columnIndex = basisId === 'i' ? 0 : basisId === 'j' ? 1 : 2;
    const next = [...targetMatrixRef.current];
    [0, 3, 6].forEach((rowOffset, rowIndex) => {
      next[columnIndex + rowOffset] = rowIndex === columnIndex ? 1 : 0;
    });
    setBasisControlMatrix(next);
    startMatrixRef.current = [...currentMatrixRef.current];
    targetMatrixRef.current = next;
    animationViewFromRef.current = viewKeyForMatrix(currentMatrixRef.current);
    animationViewToRef.current = viewKeyForMatrix(next);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    isAnimatingRef.current = true;
    setProgress(0);
    const nextView = viewKeyForMatrix(next);
    const refs = threeRef.current;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(nextView);
    if (refs) {
      configureControlsForView(refs.controls, nextView, controlLocksFromRefs());
      const destination = cameraStateForView(nextView, refs.camera.position, refs.controls.target);
      cameraMoveRef.current = {
        active: true,
        startTime: null,
        positionFrom: refs.camera.position.clone(),
        targetFrom: refs.controls.target.clone(),
        positionTo: destination.position,
        targetTo: destination.target,
      };
    }
  }, []);

  const commitBasisDrag = useCallback((startMatrix, endMatrix, dragKey) => {
    if (!startMatrix || !endMatrix || matricesAlmostEqual(startMatrix, endMatrix)) return;

    const stateMode = modeForMatrix(endMatrix);
    const previousStateMode = modeForMatrix(startMatrix);
    const operation = operationBetweenMatrices(startMatrix, endMatrix);
    const entry = {
      name: dragHistoryName(dragKey, locale),
      matrix: [...endMatrix],
      previousMatrix: [...startMatrix],
      previousStateMode,
      operationMatrix: [...operation.operationMatrix],
      operationMode: operation.operationMode,
      isDimensionDrop: operation.isDimensionDrop,
      stateMode,
    };

    setHistory((previous) => {
      const next = [...previous, entry];
      setActiveHistoryIndex(next.length - 1);
      setHoveredHistoryIndex(null);
      return next;
    });
  }, [locale]);

  const updateBasisVectorFromDrag = useCallback((dragKey, worldVector) => {
    if (!['i', 'j', 'k'].includes(dragKey)) return worldVector;
    const mode = viewKeyForMatrix(currentMatrixRef.current);
    const adjusted = constrainVectorForMode(
      worldVector,
      mode,
      snapToInteger ? { drag: true } : { snap: false }
    );
    const next = [...currentMatrixRef.current];
    const columnIndex = dragKey === 'i' ? 0 : dragKey === 'j' ? 1 : 2;
    next[columnIndex] = adjusted.x;
    next[columnIndex + 3] = adjusted.y;
    next[columnIndex + 6] = adjusted.z;
    previewDraggedMatrix(next);
    return adjusted;
  }, [previewDraggedMatrix]);

  const beginNotebookVectorLineDrag = useCallback((vectorId) => {
    if (workspaceModeRef.current !== 'system' || !vectorId?.startsWith('notebook-')) return;
    const normalized = String(notebookTextRef.current ?? '').replace(/\r/g, '');
    const parsed = parseNotebookScript(normalized);
    const visualIndexByName = new Map();
    let targetCell = null;

    parsed.cells.forEach((cell) => {
      if (cell.type !== 'vector' && cell.type !== 'calc') return;
      const key = notebookVariableKey(cell.name);
      if (!visualIndexByName.has(key)) {
        visualIndexByName.set(key, visualIndexByName.size);
      }
      const candidateId = notebookVectorIdForName(cell.name, visualIndexByName.get(key));
      if (candidateId === vectorId) targetCell = cell;
    });

    if (!targetCell || !Number.isFinite(targetCell.lineStart)) return;
    const sourceLine = normalized.split('\n')[targetCell.lineStart] ?? '';
    const sourceVector = parseNotebookVectorLine(sourceLine);
    if (notebookEditorRuntimeTimerRef.current) {
      window.clearTimeout(notebookEditorRuntimeTimerRef.current);
      notebookEditorRuntimeTimerRef.current = null;
    }
    notebookEditorTypingRef.current = true;
    notebookVectorDragSyncRef.current = {
      vectorId,
      lineIndex: targetCell.lineStart,
      name: targetCell.name,
      sourceDimension: sourceVector?.dimension ?? targetCell.dimension,
      sourceMeta: splitNotebookLineMeta(sourceLine),
      lastLine: sourceLine,
      lastText: normalized,
    };
  }, []);

  const syncNotebookVectorLineFromDrag = useCallback((vectorId, solved) => {
    if (!Array.isArray(solved) || !solved.every(Number.isFinite)) return;
    if (notebookVectorDragSyncRef.current?.vectorId !== vectorId) {
      beginNotebookVectorLineDrag(vectorId);
    }
    const dragSync = notebookVectorDragSyncRef.current;
    if (!dragSync || dragSync.vectorId !== vectorId) return;

    const dimension =
      dragSync.sourceDimension >= 3 || Math.abs(solved[2] ?? 0) > 0.001 ? 3 : 2;
    const vectorText = solved
      .slice(0, dimension)
      .map((value) => formatVectorInputValue(value))
      .join(', ');
    const nextLine = appendNotebookLineMeta(vectorText, {
      ...dragSync.sourceMeta,
      alias: dragSync.name,
    });
    if (nextLine === dragSync.lastLine) return;

    const editorValue = notebookEditorRef.current?.replaceLine?.(
      dragSync.lineIndex,
      nextLine
    );
    if (typeof editorValue === 'string') {
      dragSync.lastText = editorValue;
    } else {
      const lines = dragSync.lastText.split('\n');
      lines[dragSync.lineIndex] = nextLine;
      dragSync.lastText = lines.join('\n');
    }
    dragSync.lastLine = nextLine;
    notebookTextRef.current = dragSync.lastText;
  }, [beginNotebookVectorLineDrag]);

  const commitNotebookVectorLineDrag = useCallback(() => {
    const dragSync = notebookVectorDragSyncRef.current;
    notebookVectorDragSyncRef.current = null;
    notebookEditorTypingRef.current = false;
    if (!dragSync || dragSync.lastText === notebookText) return;
    notebookTextRef.current = dragSync.lastText;
    setNotebookText(dragSync.lastText);
    setNotebookRuntimeText(dragSync.lastText);
  }, [notebookText]);

  const updateUserVectorFromDrag = useCallback((worldVector, dragState = null) => {
    const vectorId = vectorIdFromDragKey(dragState?.key) ?? activeVectorIdRef.current;
    const matrix = dragState?.startMatrix ?? currentMatrixRef.current;
    const mode = viewKeyForMatrix(matrix);
    const startInput =
      dragState?.startInputVector ??
      vectorsRef.current.find((item) => item.id === vectorId)?.values ??
      userVectorRef.current;
    const inputDelta = dragState
      ? solveVectorInputForWorld(
          matrix,
          worldVector.clone().sub(dragState.startVector),
          mode,
          { snap: false }
        )
      : null;
    const solved = dragState
      ? constrainInputValuesForMode(
          startInput.map((value, index) => value + inputDelta[index]),
          mode,
          snapToInteger,
          { drag: true }
        )
      : solveVectorInputForWorld(currentMatrixRef.current, constrainVectorForMode(worldVector, mode), mode);
    const adjustedWorld = transformVector3(currentMatrixRef.current, solved);
    const nextVector = {
      x: formatVectorInputValue(solved[0]),
      y: formatVectorInputValue(solved[1]),
      z: formatVectorInputValue(solved[2]),
    };
    if (activeVectorIdRef.current === vectorId) {
      userVectorRef.current = [solved[0], solved[1], solved[2]];
    }
    if (dragState) dragState.latestInputVector = [...solved];
    syncNotebookVectorLineFromDrag(vectorId, solved);
    vectorsRef.current = vectorsRef.current.map((item) =>
      item.id === vectorId
        ? { ...item, ...nextVector, values: [...solved] }
        : item
    );
    return new THREE.Vector3(adjustedWorld[0], adjustedWorld[1], adjustedWorld[2]);
  }, [snapToInteger, syncNotebookVectorLineFromDrag]);

  const commitUserVectorDrag = useCallback((dragState) => {
    const vectorId = vectorIdFromDragKey(dragState?.key);
    const solved = dragState?.latestInputVector;
    if (vectorId && Array.isArray(solved) && solved.every(Number.isFinite)) {
      const nextVector = {
        x: formatVectorInputValue(solved[0]),
        y: formatVectorInputValue(solved[1]),
        z: formatVectorInputValue(solved[2]),
      };
      setVectors((previous) =>
        previous.map((item) => (item.id === vectorId ? { ...item, ...nextVector } : item))
      );
    }
    commitNotebookVectorLineDrag();
  }, [commitNotebookVectorLineDrag]);

  const updateScalarConstraintFromDrag = useCallback((worldVector, dragState = null) => {
    const vectorId = scalarIdFromDragKey(dragState?.key);
    const normal = dragState?.scalarNormal;
    if (!vectorId || !normal || normal.lengthSq() < EPSILON || !isFiniteVector3(worldVector) || !isFiniteVector3(normal)) {
      return worldVector;
    }

    const scalarSpace = dragState?.scalarSpace === 'input' ? 'input' : 'output';
    const mode = viewKeyForMatrix(dragState?.startMatrix ?? currentMatrixRef.current);
    const inputVector =
      scalarSpace === 'input'
        ? solveVectorInputForWorld(dragState?.startMatrix ?? currentMatrixRef.current, worldVector, mode, { snap: false })
        : null;
    const scalarValue = scalarSpace === 'input'
      ? normal.dot(inputVector)
      : normal.dot(worldVector);
    if (!Number.isFinite(scalarValue)) return worldVector;
    const anchorInput = normal.clone().multiplyScalar(scalarValue / normal.lengthSq());
    const anchor = scalarSpace === 'input'
      ? new THREE.Vector3(...transformVector3(dragState?.startMatrix ?? currentMatrixRef.current, [anchorInput.x, anchorInput.y, anchorInput.z]))
      : anchorInput;
    if (!isFiniteVector3(anchor)) return worldVector;
    setVectors((previous) =>
      previous.map((item) =>
        item.id === vectorId ? { ...item, scalar: formatInputValue(scalarValue), scalarEnabled: true } : item
      )
    );
    return anchor;
  }, []);

  useEffect(() => {
    dragActionsRef.current = {
      beginNotebookVectorLineDrag,
      commitBasisDrag,
      commitUserVectorDrag,
      updateBasisVectorFromDrag,
      updateScalarConstraintFromDrag,
      updateUserVectorFromDrag,
    };
  }, [
    beginNotebookVectorLineDrag,
    commitBasisDrag,
    commitUserVectorDrag,
    updateBasisVectorFromDrag,
    updateScalarConstraintFromDrag,
    updateUserVectorFromDrag,
  ]);

  const controlLocksFromRefs = useCallback(() => ({
    camera: cameraLockedRef.current,
    zoom: zoomLockedRef.current,
  }), []);

  useEffect(() => {
    const strip = historyStripRef.current;
    if (!strip) return;
    const item = strip.querySelector(`[data-history-index="${activeHistoryIndex}"]`);
    item?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, [activeHistoryIndex, history.length]);

  useEffect(() => {
    if (!activeMatrixPresetId) return;
    matrixPresetRefs.current[activeMatrixPresetId]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, [activeMatrixPresetId]);

  const setCameraAtProgress = useCallback((rawProgress) => {
    const refs = threeRef.current;
    if (!refs) return;
    refs.controls.update();
  }, []);

  const setNotebookCameraDirective = useCallback((directive, { syncUi = true } = {}) => {
    const refs = threeRef.current;
    if (!refs || cameraLockedRef.current || !directive) return;
    const hasView = Boolean(directive.viewFrom && directive.viewTo);
    const hasZoom = Boolean(directive.hasZoom);
    const hasOrbit = Boolean(directive.hasOrbit);
    if (!hasView && !hasZoom && !hasOrbit) return;

    cameraMoveRef.current.active = false;
    const target = refs.controls.target.clone();
    const currentOffset = refs.camera.position.clone().sub(target);
    let direction = currentOffset.lengthSq() > EPSILON
      ? currentOffset.normalize()
      : viewDirectionForKey(directive.viewTo ?? '3d');

    if (hasView) {
      const viewProgress = clamp01(directive.viewProgress ?? 1);
      const easedView = easeInOut(viewProgress);
      direction = viewDirectionForKey(directive.viewFrom)
        .lerp(viewDirectionForKey(directive.viewTo), easedView);
      if (direction.lengthSq() < EPSILON) direction.copy(viewDirectionForKey(directive.viewTo));
      direction.normalize();
      if (viewProgress >= 0.999) {
        configureControlsForView(refs.controls, directive.viewTo, controlLocksFromRefs());
        if (syncUi) setActiveView(directive.viewTo);
      } else if (syncUi) {
        setActiveView(null);
      }
    }

    if (hasOrbit) {
      const orbitView = directive.orbitView ?? directive.viewTo ?? '3d';
      const orbitProgress = clamp01(directive.orbitProgress ?? 0);
      const orbitAngle = easeInOut(orbitProgress) * Math.PI * 2;
      direction = viewDirectionForKey(orbitView)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitAngle)
        .normalize();
      if (orbitProgress >= 0.999) {
        configureControlsForView(refs.controls, orbitView, controlLocksFromRefs());
        if (syncUi) setActiveView(orbitView);
      } else if (syncUi) {
        setActiveView(null);
      }
    }

    let distance = Math.max(refs.camera.position.distanceTo(target), EPSILON);
    if (hasZoom && !zoomLockedRef.current) {
      const zoomProgress = clamp01(directive.zoomProgress ?? 1);
      const easedZoom = easeInOut(zoomProgress);
      const zoomFrom = Math.max(NOTEBOOK_ZOOM_MIN, Number(directive.zoomFrom) || NOTEBOOK_SCENE_DEFAULTS.zoom);
      const zoomTo = Math.max(NOTEBOOK_ZOOM_MIN, Number(directive.zoomTo) || zoomFrom);
      const zoomReferenceViewFrom =
        directive.zoomReferenceViewFrom ??
        directive.viewTo ??
        autoCameraTargetViewRef.current ??
        '3d';
      const zoomReferenceViewTo =
        directive.zoomReferenceViewTo ??
        zoomReferenceViewFrom;
      const distanceFrom = notebookCameraDistanceForZoom(zoomReferenceViewFrom, zoomFrom);
      const distanceTo = notebookCameraDistanceForZoom(zoomReferenceViewTo, zoomTo);
      distance = distanceFrom + (distanceTo - distanceFrom) * easedZoom;
    }

    refs.controls.target.copy(target);
    refs.camera.position.copy(target).addScaledVector(direction, distance);
    refs.controls.update();
  }, [controlLocksFromRefs]);

  const setMatrixAtProgress = useCallback((rawProgress, { syncUi = true } = {}) => {
    const clamped = Math.max(0, Math.min(1, rawProgress));
    const eased = easeInOut(clamped);

    for (let i = 0; i < 9; i += 1) {
      currentMatrixRef.current[i] =
        startMatrixRef.current[i] +
        eased * (targetMatrixRef.current[i] - startMatrixRef.current[i]);
    }

    if (clamped >= 1) {
      currentMatrixRef.current = [...targetMatrixRef.current];
    }

    if (syncUi) {
      setProgress(clamped);
      setDisplayMatrix([...currentMatrixRef.current]);
      setBasisControlMatrix([...currentMatrixRef.current]);
    }
    setCameraAtProgress(clamped);
  }, [setCameraAtProgress]);

  const stopAutoAnimation = useCallback(() => {
    isAnimatingRef.current = false;
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
  }, [setMatrixAtProgress]);

  const scrubToClientX = useCallback((clientX) => {
    const track = scrubTrackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const rawProgress = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    setMatrixAtProgress(rawProgress);
  }, [setMatrixAtProgress]);

  const handleProgressPointerDown = useCallback((event) => {
    event.preventDefault();
    stopAutoAnimation();
    scrubToClientX(event.clientX);

    const handlePointerMove = (moveEvent) => {
      scrubToClientX(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [scrubToClientX, stopAutoAnimation]);

  const handleProgressKeyDown = useCallback((event) => {
    const keySteps = {
      ArrowLeft: -0.02,
      ArrowDown: -0.02,
      ArrowRight: 0.02,
      ArrowUp: 0.02,
    };

    if (event.key === 'Home') {
      event.preventDefault();
      stopAutoAnimation();
      setMatrixAtProgress(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      stopAutoAnimation();
      setMatrixAtProgress(1);
      return;
    }

    if (event.key in keySteps) {
      event.preventDefault();
      stopAutoAnimation();
      setMatrixAtProgress(progress + keySteps[event.key]);
    }
  }, [progress, setMatrixAtProgress, stopAutoAnimation]);

  const updateLabel = useCallback((labelRef, vector3, text, visible = true, offset = [0, -16], options = {}) => {
    const refs = threeRef.current;
    const label = labelRef?.current ?? labelRef;
    const allowOrigin = options.allowOrigin ?? false;
    const hideLabel = () => {
      if (!label || label.style.display === 'none') return;
      label.style.display = 'none';
      if (refs) refs.labelLayoutDirty = true;
    };
    if (!refs || !label || !visible || !isFiniteVector3(vector3) || (!allowOrigin && vector3.length() < EPSILON)) {
      hideLabel();
      return;
    }

    const projected = vector3.clone().project(refs.camera);
    if (projected.z > 1 || projected.z < -1) {
      hideLabel();
      return;
    }

    const width = refs.viewportSize.width;
    const height = refs.viewportSize.height;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (projected.y * -0.5 + 0.5) * height;
    const labelX = x + offset[0];
    const labelY = y + offset[1];
    if (!Number.isFinite(labelX) || !Number.isFinite(labelY)) {
      hideLabel();
      return;
    }
    let changed = setAxisLabelText(label, text);
    const setLabelData = (key, value) => {
      const nextValue = String(value);
      if (label.dataset[key] === nextValue) return;
      label.dataset[key] = nextValue;
      changed = true;
    };
    const clearLabelData = (key) => {
      if (!(key in label.dataset)) return;
      delete label.dataset[key];
      changed = true;
    };
    setLabelData('labelX', labelX);
    setLabelData('labelY', labelY);
    setLabelData('labelAnchorX', x);
    setLabelData('labelAnchorY', y);
    if (options.placement) setLabelData('labelPlacement', options.placement);
    else clearLabelData('labelPlacement');
    const avoidanceBounds = Array.isArray(options.avoidancePoints)
      ? projectedScreenBounds(options.avoidancePoints, refs.camera, width, height)
      : null;
    if (avoidanceBounds) {
      setLabelData('labelAvoidLeft', avoidanceBounds.left);
      setLabelData('labelAvoidRight', avoidanceBounds.right);
      setLabelData('labelAvoidTop', avoidanceBounds.top);
      setLabelData('labelAvoidBottom', avoidanceBounds.bottom);
    } else {
      clearLabelData('labelAvoidLeft');
      clearLabelData('labelAvoidRight');
      clearLabelData('labelAvoidTop');
      clearLabelData('labelAvoidBottom');
    }
    if (label.style.display !== 'block') {
      label.style.display = 'block';
      changed = true;
    }
    if (changed) refs.labelLayoutDirty = true;
  }, []);

  const queueCameraShareUpdate = useCallback((delay = 180) => {
    if (typeof window === 'undefined') return;
    if (cameraShareTimerRef.current) {
      window.clearTimeout(cameraShareTimerRef.current);
    }
    cameraShareTimerRef.current = window.setTimeout(() => {
      cameraShareTimerRef.current = null;
      const next = cameraShareStateFromRefs(threeRef.current);
      if (!next) return;
      setCameraState((previous) => (cameraStatesAlmostEqual(previous, next) ? previous : next));
      if (delay <= 0) patchCameraStateInUrl(next, { locale, title: t(locale, 'title') });
    }, delay);
  }, [locale]);

  const animate = useCallback((time) => {
    frameIdRef.current = requestAnimationFrame(animate);
    const refs = threeRef.current;
    if (!refs) return;

    const cameraMove = cameraMoveRef.current;
    if (cameraMove.active) {
      if (cameraLockedRef.current) {
        cameraMove.active = false;
        cameraMove.onComplete = null;
      } else {
        if (cameraMove.startTime === null) cameraMove.startTime = time;
        const raw = Math.min(
          (time - cameraMove.startTime) / Math.max(1, cameraMove.duration ?? CAMERA_MOVE_MS),
          1
        );
        const eased = easeInOut(raw);
        refs.camera.position.lerpVectors(cameraMove.positionFrom, cameraMove.positionTo, eased);
        refs.controls.target.lerpVectors(cameraMove.targetFrom, cameraMove.targetTo, eased);
        if (raw >= 1) {
          cameraMove.active = false;
          const onComplete = cameraMove.onComplete;
          cameraMove.onComplete = null;
          onComplete?.();
        }
      }
    }

    refs.controls.update();

    if (isAnimatingRef.current) {
      if (animationStartRef.current === null) animationStartRef.current = time;

      const raw = Math.min((time - animationStartRef.current) / ANIMATION_MS, 1);
      const eased = easeInOut(raw);

      for (let i = 0; i < 9; i += 1) {
        currentMatrixRef.current[i] =
          startMatrixRef.current[i] +
          eased * (targetMatrixRef.current[i] - startMatrixRef.current[i]);
      }

      if (raw >= 1) {
        isAnimatingRef.current = false;
        currentMatrixRef.current = [...targetMatrixRef.current];
      }

      if (raw >= 1 || time - lastUiSyncRef.current > UI_SYNC_MS) {
        lastUiSyncRef.current = time;
        setProgress(raw >= 1 ? 1 : raw);
        setDisplayMatrix([...currentMatrixRef.current]);
      }
    }

    const matrix = currentMatrixRef.current;
    const coordMode = viewKeyForMatrix(matrix);
    const isSystemMode = workspaceModeRef.current === 'system' || vectorToolModeRef.current === 'system';
    const vectorSceneAllowed = !isSystemMode || notebookHasVisualVectorsRef.current;
    const vectorMatrix =
      isSystemMode && notebookHasVisualVectorsRef.current
        ? notebookVectorTransformRef.current
        : matrix;
    const isSystem3D = isSystemMode && systemDimensionRef.current === '3d';
    const kAxisBlend = clamp01(new THREE.Vector3(matrix[2], matrix[5], matrix[8]).length());
    const flatBlend = 1 - kAxisBlend;
    const matrix4 = toMatrix4(matrix);
    refs.dynamicGrid.matrix.copy(matrix4);
    refs.dynamicPlaneGrid.matrix.copy(matrix4);
    refs.boxMesh.matrix.copy(matrix4);
    refs.boxEdges.matrix.copy(matrix4);
    refs.areaMesh.matrix.copy(matrix4);
    refs.areaEdges.matrix.copy(matrix4);

    const currentDet = determinant3(matrix);
    const detMagnitude = Math.abs(currentDet);
    const volumeColor =
      detMagnitude < EPSILON
        ? 0x9ca3af
        : currentDet < 0
          ? 0xe05263
          : 0xf1b434;
    const volumeOpacity = Math.min(0.34, Math.max(0, (detMagnitude - 0.035) * 1.8));
    const iVector = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
    const jVector = new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
    const areaMagnitude = iVector.clone().cross(jVector).length();
    const heightRatio = areaMagnitude > EPSILON ? detMagnitude / areaMagnitude : 0;
    const areaBlend = Math.max(0, Math.min(1, (0.42 - heightRatio) / 0.42));
    const areaOpacity = Math.min(0.34, Math.max(0.14, areaMagnitude * 0.16)) * areaBlend;
    const showVolumeShape = uiStateRef.current.showVolume && !isSystemMode;
    const volumeVisible = showVolumeShape && volumeOpacity > 0.005;
    const areaVisible = showVolumeShape && areaMagnitude > EPSILON && areaOpacity > 0.005;

    refs.boxMaterial.color.setHex(volumeColor);
    refs.edgeMaterial.color.setHex(volumeColor);
    refs.boxMaterial.opacity = volumeOpacity;
    refs.edgeMaterial.opacity = Math.min(0.85, volumeOpacity * 2.4);
    refs.boxMesh.visible = volumeVisible;
    refs.boxEdges.visible = volumeVisible;
    refs.areaMaterial.opacity = areaOpacity;
    refs.areaEdgeMaterial.opacity = Math.min(0.86, areaOpacity * 2.5);
    refs.areaMesh.visible = areaVisible;
    refs.areaEdges.visible = areaVisible;
    const showBaseGrid = uiStateRef.current.showGrid;
    const showRelativeGrid = uiStateRef.current.showRelativeGrid;
    const relativeGridStrength = normalizeRelativeGridStrength(uiStateRef.current.relativeGridStrength);
    const showStaticGrid = showBaseGrid && ((!isSystemMode && (coordMode === '3d' || kAxisBlend > 0.04)) || isSystem3D);
    const showReferenceGrid =
      showBaseGrid &&
      ((!isSystemMode && (coordMode !== '3d' || flatBlend > 0.02)) || (isSystemMode && !isSystem3D));
    const relativeGridMode = coordMode === '3d' || (isSystemMode && isSystem3D) ? '3d' : 'plane';
    const showDynamicGrid3D =
      showRelativeGrid &&
      relativeGridMode === '3d' &&
      (isSystemMode || kAxisBlend > 0.04);
    const showDynamicGrid2D =
      showRelativeGrid &&
      relativeGridMode === 'plane' &&
      (iVector.lengthSq() > EPSILON || jVector.lengthSq() > EPSILON);
    refs.staticGrid.visible = showStaticGrid;
    refs.referenceGrid.visible = showReferenceGrid;
    refs.dynamicGrid.visible = showDynamicGrid3D;
    refs.dynamicPlaneGrid.visible = showDynamicGrid2D;
    setMaterialOpacity(refs.staticGrid.material, isSystem3D ? 0.22 : 0.07 + kAxisBlend * 0.14);
    refs.referenceGrid.material.color.setHex(isSystemMode ? 0x6b7280 : 0x22c1b6);
    refs.dynamicGrid.material.color.setHex(isSystemMode ? 0x22d3c6 : 0x22c1b6);
    refs.dynamicPlaneGrid.material.color.setHex(isSystemMode ? 0x22d3c6 : 0x22c1b6);
    refs.referenceGrid.material.opacity = isSystemMode ? 0.18 : Math.max(0.04, flatBlend * 0.14);
    refs.dynamicGrid.material.opacity =
      (isSystemMode ? 0.46 : 0.06 + kAxisBlend * 0.22) * relativeGridStrength;
    refs.dynamicPlaneGrid.material.opacity =
      (isSystemMode ? 0.58 : coordMode === '2d' ? 0.38 : 0.24) * relativeGridStrength;
    refs.equationGroup.visible = isSystemMode;
    if (isSystemMode) {
      refs.equationGroup.matrix.copy(matrix4);
      refs.solutionTraceVisual.group.matrix.copy(matrix4);
    } else {
      refs.equationGroup.matrix.identity();
      refs.solutionTraceVisual.group.matrix.identity();
    }
    refs.equationGroup.matrixWorldNeedsUpdate = true;
    refs.solutionTraceVisual.group.matrixWorldNeedsUpdate = true;
    const notebookSolutionSelection = uiStateRef.current.notebookSolutionSelection;
    const notebookSolutionProgress = notebookSolutionSelection
      ? clamp01(notebookSolutionSelection.progress ?? 1)
      : 1;
    const notebookSolutionCommitProgress = notebookSolutionSelection
      ? easeOutCubic(
          clamp01(
            (notebookSolutionProgress - SOLUTION_TRACE_TRAVEL_END) /
              (SOLUTION_TRACE_FADE_END - SOLUTION_TRACE_TRAVEL_END)
          )
        )
      : 1;
    const showEquationSolution = Boolean(
      uiStateRef.current.showAutomaticSolution || notebookSolutionSelection
    );
    const solutionLineSystem = lineSystemRef.current;
    const solutionTargetValues = solutionLineSystem?.point;
    const solutionConvergesToPoint = Boolean(
      solutionTargetValues &&
      (solutionLineSystem?.status === 'unique' || solutionLineSystem?.status === 'unique3d')
    );
    const solutionTarget = solutionConvergesToPoint
      ? new THREE.Vector3(
          solutionTargetValues[0] ?? 0,
          solutionTargetValues[1] ?? 0,
          solutionLineSystem?.mode === '3d' ? solutionTargetValues[2] ?? 0 : 0.055
        )
      : solutionTraceHasNoCommonPoint(solutionLineSystem)
        ? solutionTraceAnchor(solutionLineSystem, notebookSolutionSelection)
        : null;
    let solutionTraceStartsAbove = false;
    if (notebookSolutionSelection && solutionTarget) {
      const directionKey = [
        uiStateRef.current.notebookActiveCellId ?? 'solution',
        solutionLineSystem?.status ?? 'unknown',
        ...(notebookSolutionSelection.names ?? []),
        ...solutionTarget.toArray(),
      ].join(':');
      if (refs.solutionTraceVisual.directionKey !== directionKey) {
        refs.solutionTraceVisual.directionKey = directionKey;
        refs.solutionTraceVisual.startFromAbove = solutionTraceStartsNearCaption(
          notebookCaptionRef.current,
          refs.renderer,
          refs.camera,
          solutionTarget,
          matrix4
        );
      }
      solutionTraceStartsAbove = refs.solutionTraceVisual.startFromAbove;
    } else {
      refs.solutionTraceVisual.directionKey = null;
      refs.solutionTraceVisual.startFromAbove = false;
    }
    updateSolutionTraceVisual(
      refs.solutionTraceVisual,
      lineSystemRef.current,
      isSystemMode ? notebookSolutionSelection : null,
      notebookSolutionProgress,
      {
        camera: refs.camera,
        sceneMatrix: matrix4,
        startFromAbove: solutionTraceStartsAbove,
      }
    );
    refs.equationPoint.visible =
      isSystemMode &&
      showEquationSolution &&
      refs.equationPoint.userData.visible &&
      notebookSolutionCommitProgress > 0.002;
    if (refs.equationPoint.visible && refs.equationPoint.userData.inputPoint) {
      const transformedPoint = transformVector3(matrix, refs.equationPoint.userData.inputPoint);
      refs.equationPoint.position.set(transformedPoint[0], transformedPoint[1], transformedPoint[2]);
    }

    const equationSpawnTimes = refs.equationSpawnTimes ?? new Map();
    refs.equationSpawnTimes = equationSpawnTimes;
    const activeEquationRevealKeys = new Set();
    if (isSystemMode) {
      refs.equationGroup.traverse((object) => {
        if (object.userData?.solutionGeometry) {
          object.visible = showEquationSolution;
          if (!showEquationSolution) return;
        }
        const revealKey = object.userData?.revealKey;
        if (!revealKey) return;
        activeEquationRevealKeys.add(revealKey);
        if (!equationSpawnTimes.has(revealKey)) equationSpawnTimes.set(revealKey, time);
        const revealDuration = object.userData?.solutionGeometry
          ? SOLUTION_REVEAL_MS
          : VECTOR_SPAWN_MS;
        setObjectRevealOpacity(
          object,
          (time - (equationSpawnTimes.get(revealKey) ?? time)) / revealDuration
        );
      });
      const pointRevealKey = refs.equationPoint.userData.revealKey;
      if (refs.equationPoint.visible && pointRevealKey) {
        activeEquationRevealKeys.add(pointRevealKey);
        if (!equationSpawnTimes.has(pointRevealKey)) equationSpawnTimes.set(pointRevealKey, time);
        setObjectRevealOpacity(
          refs.equationPoint,
          (time - (equationSpawnTimes.get(pointRevealKey) ?? time)) / SOLUTION_REVEAL_MS
        );
      }
    }
    equationSpawnTimes.forEach((_, revealKey) => {
      if (!activeEquationRevealKeys.has(revealKey)) equationSpawnTimes.delete(revealKey);
    });

    const authoredNotebookFocusedNames = new Set(uiStateRef.current.notebookFocusedNames ?? []);
    const captionHoverName = uiStateRef.current.notebookCaptionHoverName;
    const authoredHardFocusRequested =
      uiStateRef.current.notebookFocusMode === 'hard' && authoredNotebookFocusedNames.size > 0;
    const authoredHardFocusExpiresAt =
      Number(uiStateRef.current.notebookHardFocusExpiresAt ?? 0);
    const authoredHardFocusStartsAt =
      authoredHardFocusExpiresAt - NOTEBOOK_AUTHORED_HARD_FOCUS_COMPARE_MS;
    const authoredHardFocusLive = authoredHardFocusRequested &&
      time >= authoredHardFocusStartsAt &&
      time < authoredHardFocusExpiresAt;
    const authoredHardFocusProgress = authoredHardFocusLive
      ? clamp01(
          (time - authoredHardFocusStartsAt) /
            NOTEBOOK_AUTHORED_HARD_FOCUS_COMPARE_MS
        )
      : 0;
    const authoredHardFocusAccentStrength = authoredHardFocusLive
      ? 0.5 - 0.5 * Math.cos(authoredHardFocusProgress * Math.PI * 4)
      : 0;
    const hardFocusTargetNames = captionHoverName
      ? new Set([captionHoverName])
      : authoredHardFocusLive
        ? authoredNotebookFocusedNames
        : null;
    const hardFocusAccentStrength = captionHoverName
      ? 1
      : authoredHardFocusAccentStrength;
    const authoredHardFocusComparing = !captionHoverName && authoredHardFocusLive;
    const hardFocusTarget = captionHoverName
      ? 1
      : authoredHardFocusComparing
        ? authoredHardFocusAccentStrength
        : 0;
    const previousHardFocusBlend = Number.isFinite(refs.notebookHardFocusBlend)
      ? refs.notebookHardFocusBlend
      : 0;
    const previousHardFocusTime = Number.isFinite(refs.notebookHardFocusTime)
      ? refs.notebookHardFocusTime
      : time - 16;
    const hardFocusElapsed = Math.max(0, Math.min(64, time - previousHardFocusTime));
    const pointerHardFocusReleasing =
      !captionHoverName && Boolean(refs.notebookPointerHardFocusActive);
    const hardFocusTau = hardFocusTarget > previousHardFocusBlend
      ? NOTEBOOK_HARD_FOCUS_BLEND_IN_TAU_MS
      : pointerHardFocusReleasing
        ? NOTEBOOK_CAPTION_HARD_FOCUS_BLEND_OUT_TAU_MS
        : NOTEBOOK_HARD_FOCUS_BLEND_OUT_TAU_MS;
    const hardFocusBlendStep = 1 - Math.exp(-hardFocusElapsed / hardFocusTau);
    let notebookHardFocusBlend = authoredHardFocusComparing
      ? hardFocusTarget
      : previousHardFocusBlend +
        (hardFocusTarget - previousHardFocusBlend) * hardFocusBlendStep;
    if (Math.abs(notebookHardFocusBlend - hardFocusTarget) < 0.004) {
      notebookHardFocusBlend = hardFocusTarget;
    }
    refs.notebookHardFocusBlend = notebookHardFocusBlend;
    refs.notebookHardFocusTime = time;
    if (captionHoverName) {
      refs.notebookPointerHardFocusActive = true;
    } else if (notebookHardFocusBlend <= 0.01) {
      refs.notebookPointerHardFocusActive = false;
    }
    if (hardFocusTargetNames?.size) {
      refs.notebookHardFocusDisplayNames = new Set(hardFocusTargetNames);
    }
    const releasingHardFocusNames = notebookHardFocusBlend > 0.01
      ? new Set(refs.notebookHardFocusDisplayNames ?? [])
      : null;
    const notebookFocusedNames = hardFocusTargetNames
      ?? releasingHardFocusNames
      ?? (authoredHardFocusRequested ? new Set() : authoredNotebookFocusedNames);
    const notebookHardFocusActive = notebookHardFocusBlend > 0.01 && notebookFocusedNames.size > 0;
    const preserveAuthoredFocusPresentation = Boolean(refs.notebookPointerHardFocusActive);
    const hardFocusHasLiveTarget = Boolean(hardFocusTargetNames?.size);
    const hardFocusAccentVisible = hardFocusAccentStrength > 0.3;
    const hardFocusPresentationVisible = captionHoverName
      ? true
      : hardFocusAccentStrength > 0.02;
    const hardFocusVisibilityFactor = 1 - notebookHardFocusBlend * 0.84;
    const hardFocusGeometryOpacityFactor = hardFocusVisibilityFactor;
    const hardFocusLabelOpacityFactor = hardFocusVisibilityFactor;
    const notebookObjectFocusState = (name) => {
      const key = notebookVariableKey(name);
      const focused = notebookFocusedNames.has(key);
      const authoredFocused = authoredNotebookFocusedNames.has(key);
      return {
        focused,
        presentationFocused:
          (hardFocusHasLiveTarget && hardFocusPresentationVisible && focused) ||
          (preserveAuthoredFocusPresentation && authoredFocused) ||
          (!authoredHardFocusComparing && !notebookHardFocusActive && focused),
        hardFocused: hardFocusAccentVisible && focused,
        labelPresentationFocused:
          (hardFocusHasLiveTarget && focused) ||
          (preserveAuthoredFocusPresentation && authoredFocused) ||
          (!authoredHardFocusComparing && !notebookHardFocusActive && focused),
        labelHardFocused:
          (captionHoverName ? hardFocusAccentVisible : authoredHardFocusComparing) && focused,
        hardDimmed: notebookHardFocusActive && !focused,
        hardAccentStrength: focused ? hardFocusAccentStrength : 0,
      };
    };
    const syncNotebookLabelFocusState = (label, focusState, baseOpacity = 1) => {
      if (!label) return;
      const normalizedBaseOpacity = Number.isFinite(baseOpacity) ? baseOpacity : 1;
      label.classList.toggle(
        'notebook-focused',
        focusState.labelPresentationFocused ?? focusState.presentationFocused
      );
      label.classList.toggle(
        'notebook-hard-focused',
        focusState.labelHardFocused ?? focusState.hardFocused
      );
      label.classList.toggle('notebook-hard-dimmed', focusState.hardDimmed);
      label.style.setProperty(
        '--notebook-hard-focus-opacity',
        String(normalizedBaseOpacity * (focusState.hardDimmed ? hardFocusLabelOpacityFactor : 1))
      );
      label.style.setProperty(
        '--notebook-hard-focus-saturation',
        String(1 - notebookHardFocusBlend * 0.65)
      );
      label.style.setProperty(
        '--notebook-hard-focus-brightness',
        String(1 - notebookHardFocusBlend * 0.32)
      );
      label.style.setProperty(
        '--notebook-hard-focus-blur',
        `${notebookHardFocusBlend * 0.25}px`
      );
    };
    [
      ['i', iLabelRef.current],
      ['j', jLabelRef.current],
      ['k', kLabelRef.current],
    ].forEach(([name, label]) => {
      const focusState = notebookObjectFocusState(name);
      syncNotebookLabelFocusState(label, focusState);
    });
    const equationFocusStartTimes = refs.equationFocusStartTimes ?? new Map();
    refs.equationFocusStartTimes = equationFocusStartTimes;
    const activeEquationFocusNames = new Set();
    if (isSystemMode) {
      refs.equationGroup.traverse((object) => {
        const focusName = object.userData?.solutionGeometry
          ? notebookSolutionSelection?.name
          : object.userData?.focusName;
        if (!focusName) return;
        const focusKey = notebookVariableKey(focusName);
        const focusState = notebookObjectFocusState(focusName);
        const focused = focusState.presentationFocused;
        const hardDimmed = focusState.hardDimmed;
        const hardAccentStrength = focusState.hardAccentStrength;
        const solutionRevealFactor =
          object.userData?.solutionGeometry && notebookSolutionSelection
            ? notebookSolutionCommitProgress
            : 1;
        if (focused) {
          activeEquationFocusNames.add(focusKey);
          if (!equationFocusStartTimes.has(focusKey)) equationFocusStartTimes.set(focusKey, time);
        }
        const settle = focused
          ? easeOutCubic((time - (equationFocusStartTimes.get(focusKey) ?? time)) / NOTEBOOK_FOCUS_SETTLE_MS)
          : 0;
        const role = object.userData?.focusRole;
        const material = object.material;
        if (role === 'halo') {
          object.visible = focused;
          const haloOpacity = authoredHardFocusComparing
            ? 0.42 * hardAccentStrength
            : (notebookHardFocusActive ? 0.42 : 0.32);
          setMaterialOpacity(
            material,
            focused
              ? haloOpacity * settle *
                (hardDimmed ? hardFocusGeometryOpacityFactor : 1)
              : 0
          );
          return;
        }
        const materials = Array.isArray(material) ? material : [material];
        materials.forEach((item) => {
          if (!item) return;
          const baseOpacity = Number.isFinite(item.userData.baseOpacity)
            ? item.userData.baseOpacity
            : Number.isFinite(item.opacity) ? item.opacity : 1;
          const focusOpacity = role === 'surface'
            ? Math.max(baseOpacity, 0.24)
            : role === 'solution-glow'
              ? Math.max(baseOpacity, 0.2)
              : Math.max(baseOpacity, 0.96);
          item.transparent = true;
          item.opacity = (hardDimmed
            ? baseOpacity * hardFocusGeometryOpacityFactor
            : baseOpacity + (focusOpacity - baseOpacity) * settle) * solutionRevealFactor;
        });
      });
    }
    equationFocusStartTimes.forEach((_, focusKey) => {
      if (!activeEquationFocusNames.has(focusKey)) equationFocusStartTimes.delete(focusKey);
    });

    const absoluteAxisVisible = uiStateRef.current.showAxes;
    const relativeAxisVisible = uiStateRef.current.showRelativeAxes;
    const basisVisible = uiStateRef.current.showBasis;
    const basisVisibility = uiStateRef.current.basisVisibility ?? { i: true, j: true, k: true };
    const basisLengthByKey = {
      i: Math.hypot(matrix[0], matrix[3], matrix[6]),
      j: Math.hypot(matrix[1], matrix[4], matrix[7]),
      k: Math.hypot(matrix[2], matrix[5], matrix[8]),
    };
    const relativeAxisVisibleByKey = {
      i: relativeAxisVisible && basisVisibility.i !== false && basisLengthByKey.i > EPSILON,
      j: relativeAxisVisible && basisVisibility.j !== false && basisLengthByKey.j > EPSILON,
      k: relativeAxisVisible && basisVisibility.k !== false && basisLengthByKey.k > EPSILON,
    };
    const basisVisibleByKey = {
      i: basisVisible && basisVisibility.i !== false && basisLengthByKey.i > EPSILON,
      j: basisVisible && basisVisibility.j !== false && basisLengthByKey.j > EPSILON,
      k: basisVisible && basisVisibility.k !== false && basisLengthByKey.k > EPSILON,
    };
    setAxisLineVector(refs.iAbsoluteAxis, 1, 0, 0, absoluteAxisVisible);
    setAxisLineVector(refs.jAbsoluteAxis, 0, 1, 0, absoluteAxisVisible);
    setAxisLineVector(refs.kAbsoluteAxis, 0, 0, 1, absoluteAxisVisible && (coordMode === '3d' || isSystem3D));
    setAxisLineVector(refs.iRelativeAxis, matrix[0], matrix[3], matrix[6], relativeAxisVisibleByKey.i);
    setAxisLineVector(refs.jRelativeAxis, matrix[1], matrix[4], matrix[7], relativeAxisVisibleByKey.j);
    setAxisLineVector(
      refs.kRelativeAxis,
      matrix[2],
      matrix[5],
      matrix[8],
      relativeAxisVisibleByKey.k && (coordMode === '3d' || isSystem3D)
    );
    setArrowVector(refs.iArrow, matrix[0], matrix[3], matrix[6], basisVisibleByKey.i);
    setArrowVector(refs.jArrow, matrix[1], matrix[4], matrix[7], basisVisibleByKey.j);
    setArrowVector(refs.kArrow, matrix[2], matrix[5], matrix[8], basisVisibleByKey.k);
    [
      ['i', refs.iArrow],
      ['j', refs.jArrow],
      ['k', refs.kArrow],
    ].forEach(([name, arrow]) => {
      const { hardDimmed } = notebookObjectFocusState(name);
      [arrow?.line?.material, arrow?.cone?.material].forEach((material) => {
        if (!material) return;
        material.transparent = true;
        material.opacity = hardDimmed ? hardFocusGeometryOpacityFactor : 1;
      });
    });

    const activeDragKey = arrowDragRef.current.active ? arrowDragRef.current.key : null;
    const activeDragVectorId = vectorIdFromDragKey(activeDragKey) ?? scalarIdFromDragKey(activeDragKey);
    const renderedVectorValues = new Map();
    const vectorRenderValues = vectorRenderValuesRef.current;
    vectorsRef.current.forEach((vectorItem) => {
      const targetValues = vectorItem.values;
      const cachedValues = vectorRenderValues.get(vectorItem.id);
      const previousValues = Array.isArray(cachedValues) && cachedValues.length === targetValues.length
        ? cachedValues
        : targetValues;
      const shouldSnap = activeDragVectorId === vectorItem.id || vectorItem.scalarEnabled;
      const nextValues = shouldSnap
        ? [...targetValues]
        : previousValues.map((value, index) => {
            const target = targetValues[index];
            const nextValue = value + (target - value) * 0.22;
            return Math.abs(nextValue - target) < 0.002 ? target : nextValue;
          });
      vectorRenderValues.set(vectorItem.id, nextValues);
      renderedVectorValues.set(vectorItem.id, nextValues);
    });
    vectorRenderValues.forEach((_, id) => {
      if (!vectorsRef.current.some((item) => item.id === id)) {
        vectorRenderValues.delete(id);
      }
    });

    const vectorSpawnTimes = refs.vectorSpawnTimes ?? new Map();
    refs.vectorSpawnTimes = vectorSpawnTimes;
    const liveVectorIds = new Set(vectorsRef.current.map((item) => item.id));
    vectorsRef.current.forEach((item) => {
      if (!vectorSpawnTimes.has(item.id)) vectorSpawnTimes.set(item.id, time);
    });
    vectorSpawnTimes.forEach((_, id) => {
      if (!liveVectorIds.has(id)) vectorSpawnTimes.delete(id);
    });
    const vectorSpawnEase = (id) =>
      easeOutCubic((time - (vectorSpawnTimes.get(id) ?? time)) / VECTOR_SPAWN_MS);

    const scalarSpawnTimes = refs.scalarSpawnTimes ?? new Map();
    refs.scalarSpawnTimes = scalarSpawnTimes;
    const liveScalarIds = new Set(
      vectorsRef.current
        .filter((item) => item.visible !== false && item.scalarEnabled)
        .map((item) => item.id)
    );
    liveScalarIds.forEach((id) => {
      if (!scalarSpawnTimes.has(id)) scalarSpawnTimes.set(id, time);
    });
    scalarSpawnTimes.forEach((_, id) => {
      if (!liveScalarIds.has(id)) scalarSpawnTimes.delete(id);
    });
    const scalarSpawnEase = (id) =>
      easeOutCubic((time - (scalarSpawnTimes.get(id) ?? time)) / VECTOR_SPAWN_MS);

    let frameScalarSolution = null;
    if (refs.vectorScalarGroup) {
      clearEquationGroup(refs.vectorScalarGroup);
      const scalarGroupVisible = vectorSceneAllowed && uiStateRef.current.showVector;
      refs.vectorScalarGroup.visible = scalarGroupVisible;
      if (scalarGroupVisible) {
        const scalarConstraints = vectorsRef.current
          .filter((item) => item.visible !== false && item.scalarEnabled)
          .map((item) => {
            const values = renderedVectorValues.get(item.id) ?? item.values;
            const transformed = transformVector3(vectorMatrix, values);
            const scalarSpace = item.scalarSpace === 'input' ? 'input' : 'output';
            const normal = scalarSpace === 'input' ? values : transformed;
            const lengthSquared = dotValues(normal, normal);
            return {
              color: item.color,
              lengthSquared,
              normal,
              spawnEase: scalarSpawnEase(item.id),
              scalar: hasScalarText(item.scalar) ? parseNumber(item.scalar) : lengthSquared,
              scalarSpace,
            };
          })
          .filter((constraint) =>
            constraint.lengthSquared > EPSILON &&
            Number.isFinite(constraint.scalar) &&
            constraint.normal.every(Number.isFinite)
          );

        const rawScalarSolution = solveScalarConstraintPoint(scalarConstraints, coordMode);
        frameScalarSolution =
          rawScalarSolution && scalarConstraints.every((constraint) => constraint.scalarSpace === 'input')
            ? transformVector3(vectorMatrix, rawScalarSolution)
            : rawScalarSolution;
        scalarConstraints.forEach((constraint) => {
          if (coordMode === '1d') {
            if (Math.abs(constraint.normal[0]) < EPSILON) return;
            const anchorInput = new THREE.Vector3(constraint.scalar / constraint.normal[0], 0, 0);
            const anchor =
              constraint.scalarSpace === 'input'
                ? transformedPointForMatrix(vectorMatrix, anchorInput)
                : anchorInput;
            createScalarPointObjects(anchor, constraint.color).forEach((object) => {
              scaleObjectOpacity(object, constraint.spawnEase);
              refs.vectorScalarGroup.add(object);
            });
            return;
          }

          if (coordMode === '2d') {
            const line = {
              a: constraint.normal[0],
              b: constraint.normal[1],
              value: constraint.scalar,
              color: constraint.color,
            };
            const objects =
              constraint.scalarSpace === 'input'
                ? createTransformedLineObjects(line, vectorMatrix, SCALAR_CONSTRAINT_LINE_RANGE)
                : createLineObjects(line, SCALAR_CONSTRAINT_LINE_RANGE);
            objects.forEach((object) => {
              scaleObjectOpacity(object, constraint.spawnEase);
              refs.vectorScalarGroup.add(object);
            });
            return;
          }

          const plane = {
            a: constraint.normal[0],
            b: constraint.normal[1],
            c: constraint.normal[2],
            value: constraint.scalar,
            color: constraint.color,
          };
          const objects =
            constraint.scalarSpace === 'input'
              ? createTransformedPlaneObjects(plane, vectorMatrix, 5.8, scalarConstraints.length > 1)
              : createPlaneObjects(plane, 5.8, scalarConstraints.length > 1);
          objects.forEach((object) => {
            scaleObjectOpacity(object, constraint.spawnEase);
            refs.vectorScalarGroup.add(object);
          });
        });
      }
    }

    const activeVectorItem = vectorsRef.current.find(
      (item) => item.id === activeVectorIdRef.current && item.visible !== false && !item.scalarEnabled
    );
    const activeVectorWorld = activeVectorItem
      ? new THREE.Vector3(...transformVector3(vectorMatrix, renderedVectorValues.get(activeVectorItem.id) ?? activeVectorItem.values))
      : null;
    refs.userArrow.visible = false;
    refs.dotLine.visible = false;
    refs.dotPoint.visible = false;

    const coordinatesVisible = uiStateRef.current.showCoordinateNumbers;
    const labelsVisible = true;
    const vectorLabelsVisible = true;
    const frameLineSystem = lineSystemRef.current;
    const frameEquationSolution = frameLineSystem?.solution;
    const equationSolutionInputPoint = refs.equationPoint.userData.inputPoint;
    const equationSolutionPoint = refs.equationPoint.userData.solutionPoint ?? equationSolutionInputPoint;
    const equationSolutionMode = refs.equationPoint.userData.mode ?? systemDimensionRef.current;
    let equationSolutionWorld =
      refs.equationPoint.visible && equationSolutionInputPoint
        ? new THREE.Vector3(...transformVector3(matrix, equationSolutionInputPoint))
        : new THREE.Vector3();
    let equationSolutionText = equationSolutionPoint
      ? `${t(locale, 'solution')} x = ${formatCoord(equationSolutionPoint, equationSolutionMode)}`
      : '';
    let equationSolutionVisible = showEquationSolution && refs.equationPoint.visible && labelsVisible;

    if (
      showEquationSolution &&
      !equationSolutionVisible &&
      isSystemMode &&
      frameEquationSolution?.status === 'infinite' &&
      frameLineSystem?.status !== 'single' &&
      frameLineSystem?.status !== 'single3d'
    ) {
      const frameSolutionMode = frameLineSystem?.mode ?? systemDimensionRef.current;
      const anchor = solutionLabelAnchor(frameEquationSolution, frameSolutionMode);
      const sceneSolutionLabel = formatSceneSolutionGeometryLabel(
        frameEquationSolution,
        locale,
        coordinatesVisible,
        frameSolutionMode
      );
      if (anchor && sceneSolutionLabel) {
        equationSolutionWorld = new THREE.Vector3(...transformVector3(matrix, anchor));
        equationSolutionText = sceneSolutionLabel;
        equationSolutionVisible = true;
      }
    }

    const notebookSolutionSelected = Boolean(notebookSolutionSelection && equationSolutionVisible);
    const notebookSolutionFocusState = notebookSolutionSelection
      ? notebookObjectFocusState(notebookSolutionSelection.name)
      : { focused: false, presentationFocused: false, hardFocused: false, hardDimmed: false };
    const notebookSolutionFocused = notebookSolutionFocusState.presentationFocused;
    const notebookSolutionHardDimmed = notebookSolutionFocusState.hardDimmed;
    const notebookSolutionHardAccentStrength =
      notebookSolutionFocusState.hardAccentStrength ?? 0;
    if (notebookSolutionSelected) {
      equationSolutionText = equationSolutionPoint
        ? `${notebookSolutionSelection.name} = ${formatCoord(equationSolutionPoint, equationSolutionMode)}`
        : `${notebookSolutionSelection.name} · ${equationSolutionText}`;
    }
    refs.equationPoint.material.color.setHex(notebookSolutionSelected ? 0xf1b434 : 0xffffff);
    refs.equationPoint.material.transparent = true;
    refs.equationPoint.material.opacity =
      (notebookSolutionHardDimmed ? hardFocusGeometryOpacityFactor : 1) *
      (notebookSolutionSelection ? notebookSolutionCommitProgress : 1);
    const equationPointRevealScale = notebookSolutionSelection
      ? 0.78 + notebookSolutionCommitProgress * 0.22
      : 1;
    refs.equationPoint.scale.setScalar(
      (
        notebookSolutionSelected
          ? notebookSolutionFocused
            ? authoredHardFocusComparing
              ? 1.16 + notebookSolutionHardAccentStrength * 0.2
              : 1.36
            : 1.16
          : 1
      ) *
      equationPointRevealScale
    );

    updateLabel(
      equationSolutionLabelRef,
      equationSolutionWorld,
      equationSolutionText,
      equationSolutionVisible && labelsVisible,
      [38, -20],
      { allowOrigin: true }
    );
    if (equationSolutionLabelRef.current) {
      const equationSolutionLabelOpacity = notebookSolutionSelection
        ? notebookSolutionCommitProgress
        : 1;
      equationSolutionLabelRef.current.style.opacity = String(equationSolutionLabelOpacity);
      syncNotebookLabelFocusState(
        equationSolutionLabelRef.current,
        notebookSolutionFocusState,
        equationSolutionLabelOpacity
      );
      equationSolutionLabelRef.current.classList.toggle('solution-selected', notebookSolutionSelected);
    }

    const equationLabels = isSystemMode
      ? (frameLineSystem?.mode === '3d'
          ? frameLineSystem?.planes ?? []
          : frameLineSystem?.lines ?? [])
      : [];
    const equationLabelMode = frameLineSystem?.mode === '3d' ? '3d' : '2d';
    const activeEquationLabelKeys = new Set();
    equationLabels.forEach((item, index) => {
      const key = equationSceneLabelKey(item, equationLabelMode, index);
      const labelNode = equationLabelRefs.current.get(key);
      if (!labelNode) return;
      const anchor = equationAnchorPoint(item, equationLabelMode);
      activeEquationLabelKeys.add(key);
      if (!anchor) {
        labelNode.style.display = 'none';
        return;
      }
      const [x, y, z] = transformVector3(matrix, [anchor.x, anchor.y, anchor.z]);
      const revealKey = equationRevealKey(item, equationLabelMode, index);
      const revealStart = equationSpawnTimes.get(revealKey);
      const revealEase = revealStart ? easeOutCubic((time - revealStart) / VECTOR_SPAWN_MS) : 1;
      updateLabel(
        labelNode,
        new THREE.Vector3(x, y, z),
        equationSceneLabelText(item, equationLabelMode, index, coordinatesVisible),
        labelsVisible,
        equationLabelMode === '3d'
          ? [34, -22 - (index % 3) * 12]
          : [28, -20 - (index % 3) * 10],
        { allowOrigin: true, keepNameWhenCoordinatesHidden: true }
      );
      const equationName = equationSceneLabelName(item, equationLabelMode, index);
      const equationFocusState = notebookObjectFocusState(equationName);
      const equationLabelOpacity = 0.18 + revealEase * 0.82;
      labelNode.style.opacity = String(equationLabelOpacity);
      syncNotebookLabelFocusState(labelNode, equationFocusState, equationLabelOpacity);
    });
    equationLabelRefs.current.forEach((labelNode, key) => {
      if (activeEquationLabelKeys.has(key)) return;
      labelNode.style.display = 'none';
      labelNode.style.opacity = '1';
      labelNode.classList.remove('notebook-focused');
      labelNode.classList.remove('notebook-hard-focused', 'notebook-hard-dimmed');
    });

    const dragHandles = refs.dragHandles ?? {};
    const handleTargets = {
      i: new THREE.Vector3(matrix[0], matrix[3], matrix[6]),
      j: new THREE.Vector3(matrix[1], matrix[4], matrix[7]),
      k: new THREE.Vector3(matrix[2], matrix[5], matrix[8]),
    };
    const visibleMeasureVectors = vectorsRef.current
      .filter((item) => item.visible !== false && !item.scalarEnabled)
      .slice(0, 3)
      .map((item) => {
        const values = renderedVectorValues.get(item.id) ?? item.values;
        return {
          ...item,
          world: new THREE.Vector3(...transformVector3(vectorMatrix, values)),
        };
      });
    const vectorMeasureVisible = false && visibleMeasureVectors.length >= 2;
    let vectorMeasureLabelPosition = new THREE.Vector3();
    let vectorMeasureLabel = '';
    refs.vectorAreaMesh.visible = false;
    refs.vectorAreaEdges.visible = false;
    refs.vectorVolumeMesh.visible = false;
    refs.vectorVolumeEdges.visible = false;
    if (vectorMeasureVisible) {
      const [first, second, third] = visibleMeasureVectors;
      const a = first.world;
      const b = second.world;
      const areaValue = a.clone().cross(b).length();
      if (third) {
        const c = third.world;
        const volumeValue = Math.abs(a.clone().cross(b).dot(c));
        updateVolumeGeometry(refs.vectorVolumeMesh.geometry, refs.vectorVolumeEdges.geometry, a, b, c);
        refs.vectorVolumeMaterial.opacity = Math.min(0.3, Math.max(0.08, volumeValue * 0.035));
        refs.vectorVolumeEdgeMaterial.opacity = 0.86;
        refs.vectorVolumeMesh.visible = true;
        refs.vectorVolumeEdges.visible = true;
        vectorMeasureLabelPosition = a.clone().add(b).add(c).multiplyScalar(0.5);
        vectorMeasureLabel = `${t(locale, 'volume')} A${first.name},A${second.name},A${third.name} = ${formatNumber(volumeValue)}`;
      } else {
        updateAreaGeometry(refs.vectorAreaMesh.geometry, refs.vectorAreaEdges.geometry, a, b);
        refs.vectorAreaMaterial.opacity = Math.min(0.28, Math.max(0.08, areaValue * 0.045));
        refs.vectorAreaEdgeMaterial.opacity = 0.84;
        refs.vectorAreaMesh.visible = true;
        refs.vectorAreaEdges.visible = true;
        vectorMeasureLabelPosition = a.clone().add(b).multiplyScalar(0.5);
        vectorMeasureLabel = `${t(locale, 'area')} A${first.name},A${second.name} = ${formatNumber(areaValue)}`;
      }
    }
    updateLabel(
      vectorVolumeLabelRef,
      vectorMeasureLabelPosition,
      vectorMeasureLabel,
      vectorMeasureVisible && labelsVisible,
      [0, -24],
      { allowOrigin: true }
    );

    const activeMeasurementLabels = new Set();
    const activeMeasurementVisuals = new Set();
    const measurementSpawnTimes = refs.measurementSpawnTimes ?? new Map();
    refs.measurementSpawnTimes = measurementSpawnTimes;
    const measurementRevealProgress = (item) => {
      if (item?.source === 'notebook') {
        return uiStateRef.current.notebookActiveCellId === item.cellId
          ? clamp01(uiStateRef.current.notebookActiveCellProgress)
          : 1;
      }
      if (!measurementSpawnTimes.has(item.id)) measurementSpawnTimes.set(item.id, time);
      return clamp01((time - (measurementSpawnTimes.get(item.id) ?? time)) / VECTOR_SPAWN_MS);
    };
    const measurementRevealEase = (item) => easeOutCubic(measurementRevealProgress(item));
    refs.measurementVisuals?.forEach((visual) => {
      visual.group.visible = false;
    });
    const getMeasureTargetName = (targetId) => {
      if (targetId === 'b:i') return 'i′';
      if (targetId === 'b:j') return 'j′';
      if (targetId === 'b:k') return 'k′';
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      return vectorsRef.current.find((item) => item.id === vectorId)?.name ?? vectorId ?? '';
    };
    const getMeasureTargetColor = (targetId) => {
      if (targetId === 'b:i') return '#ff6575';
      if (targetId === 'b:j') return '#41cf76';
      if (targetId === 'b:k') return '#78a5ff';
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      const vectorItem = vectorsRef.current.find((item) => item.id === vectorId);
      return vectorItem ? colorToHex(vectorItem.color) : undefined;
    };
    const measureTargetToken = (targetId) => ({
      text: getMeasureTargetName(targetId),
      color: getMeasureTargetColor(targetId),
      className: 'measurement-target-token',
    });
    const joinMeasureTargetTokens = (targetIds) => targetIds.flatMap((targetId, index) => (
      index === 0
        ? [measureTargetToken(targetId)]
        : [{ text: ' · ', className: 'measurement-operator' }, measureTargetToken(targetId)]
    ));
    const getMeasureTargetWorld = (targetId, allowZero = false) => {
      if (targetId === 'b:i') {
        if (!uiStateRef.current.showBasis || uiStateRef.current.basisVisibility?.i === false) return null;
        const vector = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
        return allowZero || vector.lengthSq() > EPSILON ? vector : null;
      }
      if (targetId === 'b:j') {
        if (!uiStateRef.current.showBasis || uiStateRef.current.basisVisibility?.j === false) return null;
        const vector = new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
        return allowZero || vector.lengthSq() > EPSILON ? vector : null;
      }
      if (targetId === 'b:k') {
        if (!uiStateRef.current.showBasis || uiStateRef.current.basisVisibility?.k === false) return null;
        const vector = new THREE.Vector3(matrix[2], matrix[5], matrix[8]);
        return allowZero || vector.lengthSq() > EPSILON ? vector : null;
      }
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      const vectorItem = vectorsRef.current.find((item) => item.id === vectorId);
      if (!vectorItem || vectorItem.visible === false || vectorItem.scalarEnabled || !uiStateRef.current.showVector) return null;
      const values = renderedVectorValues.get(vectorItem.id) ?? vectorItem.values;
      return new THREE.Vector3(...transformVector3(vectorMatrix, values));
    };

    measurementsRef.current
      .filter((item) => item.visible !== false)
      .forEach((item, index) => {
          const targetEntries = item.targets
            .map((targetId) => ({
              id: targetId,
              vector: getMeasureTargetWorld(targetId, item.type === 'volume'),
            }))
            .filter((entry) => entry.vector);
          const targets = targetEntries.map((entry) => entry.vector);
          const visibleTargetIds = targetEntries.map((entry) => entry.id);
          if (item.type === 'sum' && targets.length >= 2) {
            const [first, second] = targets;
            const sum = first.clone().add(second);
            const visual = getMeasurementVisual(refs, item, 'sum');
            activeMeasurementVisuals.add(item.id);
            const revealProgress = measurementRevealProgress(item);
            const guideProgress = easeInOut(clamp01(revealProgress / 0.68));
            const guideOpacity = easeOutCubic(clamp01(revealProgress / 0.16));
            const meetProgress = easeOutCubic(clamp01((revealProgress - 0.5) / 0.2));
            const resultProgress = easeOutCubic(clamp01((revealProgress - 0.56) / 0.44));
            const firstColor = getMeasureTargetColor(visibleTargetIds[0]) ?? '#8b5cf6';
            const secondColor = getMeasureTargetColor(visibleTargetIds[1]) ?? '#a7f3e3';

            visual.resultArrow.position.set(0, 0, 0);
            setArrowVectorAtProgress(visual.resultArrow, sum, resultProgress, true);
            visual.resultArrow.line.material.color.set(MEASURE_SUM_HEX);
            visual.resultArrow.cone.material.color.set(MEASURE_SUM_HEX);
            visual.resultArrow.line.material.opacity = 0.96 * resultProgress;
            visual.resultArrow.cone.material.opacity = resultProgress;
            visual.resultArrow.renderOrder = 23 + index;
            visual.resultArrow.line.renderOrder = 23 + index;
            visual.resultArrow.cone.renderOrder = 24 + index;

            const translatedGuideEnd = first.clone().lerp(sum, guideProgress);
            setGeometryPositions(visual.translatedGuide.geometry, [
              first.x, first.y, first.z,
              translatedGuideEnd.x, translatedGuideEnd.y, translatedGuideEnd.z,
            ]);
            visual.translatedGuide.material.color.set(secondColor);
            visual.translatedGuide.computeLineDistances();
            visual.translatedGuide.material.opacity = 0.42 * guideOpacity;
            visual.translatedGuide.renderOrder = 21 + index;

            const parallelGuideEnd = second.clone().lerp(sum, guideProgress);
            setGeometryPositions(visual.parallelGuide.geometry, [
              second.x, second.y, second.z,
              parallelGuideEnd.x, parallelGuideEnd.y, parallelGuideEnd.z,
            ]);
            visual.parallelGuide.material.color.set(firstColor);
            visual.parallelGuide.computeLineDistances();
            visual.parallelGuide.material.opacity = 0.42 * guideOpacity;
            visual.parallelGuide.renderOrder = 20 + index;

            visual.point.position.copy(sum);
            visual.point.visible = meetProgress > 0.002;
            visual.point.material.opacity = meetProgress;
            const meetSettle = Math.sin(
              Math.PI * clamp01((revealProgress - 0.58) / 0.42)
            );
            visual.point.scale.setScalar(0.76 + meetProgress * 0.24 + meetSettle * 0.16);
            visual.point.renderOrder = 25 + index;

            const labelPosition = sum.lengthSq() > EPSILON
              ? sum.clone()
              : first.clone().multiplyScalar(0.5);
            activeMeasurementLabels.add(item.id);
            const labelNode = measurementLabelRefs.current.get(item.id);
            updateLabel(
              labelNode,
              labelPosition,
              [
                { text: `${t(locale, 'sum')} `, className: 'measurement-symbol' },
                measureTargetToken(visibleTargetIds[0]),
                { text: ' + ', className: 'measurement-operator' },
                measureTargetToken(visibleTargetIds[1]),
                {
                  text: ` = ${formatCoord([sum.x, sum.y, sum.z], coordMode)}`,
                  className: 'measurement-value-token',
                },
              ],
              labelsVisible,
              [48, -24 - (index % 3) * 10],
              { allowOrigin: true, placement: 'result-side' }
            );
            if (labelNode) labelNode.style.opacity = String(resultProgress);
          }
          if (item.type === 'dot' && targets.length >= 2) {
            const [secondary, primary] = targets;
            const visual = getMeasurementVisual(refs, item, 'dot');
            activeMeasurementVisuals.add(item.id);
            const revealEase = measurementRevealEase(item);
            const dotValue = primary.dot(secondary);
            const projection = primary.lengthSq() > EPSILON
              ? primary.clone().multiplyScalar(dotValue / primary.lengthSq())
              : new THREE.Vector3();
            setGeometryPositions(visual.mainLine.geometry, [
              primary.x, primary.y, primary.z, secondary.x, secondary.y, secondary.z,
            ]);
            setGeometryPositions(visual.guideLine.geometry, [
              projection.x, projection.y, projection.z, secondary.x, secondary.y, secondary.z,
            ]);
            visual.mainLine.renderOrder = 19 + index;
            visual.mainLine.material.opacity = 0.96 * revealEase;
            visual.guideLine.computeLineDistances();
            visual.guideLine.renderOrder = 18 + index;
            visual.guideLine.material.opacity = 0.32 * revealEase;
            visual.point.position.copy(projection);
            visual.point.renderOrder = 19 + index;
            visual.point.material.opacity = revealEase;
            const labelPosition = primary.clone().lerp(secondary, 0.46).lerp(projection, 0.18);
            activeMeasurementLabels.add(item.id);
            const labelNode = measurementLabelRefs.current.get(item.id);
            updateLabel(
              labelNode,
              labelPosition,
              [
                { text: 'Σ ', className: 'measurement-symbol' },
                measureTargetToken(visibleTargetIds[1]),
                { text: ' · ', className: 'measurement-operator' },
                measureTargetToken(visibleTargetIds[0]),
                { text: ` = ${formatNumber(dotValue)}`, className: 'measurement-value-token' },
              ],
              labelsVisible,
              [0, -30 - (index % 3) * 10],
              { allowOrigin: true }
            );
            if (labelNode) labelNode.style.opacity = String(0.18 + revealEase * 0.82);
          }
          if (item.type === 'volume' && targets.length >= 1) {
            const targetCount = effectiveVolumeTargetCount(targets.length);
            const measureTargets = targets.slice(0, targetCount);
            const measureTargetIds = visibleTargetIds.slice(0, targetCount);
            const [a, b, c] = measureTargets;
            const visual = getMeasurementVisual(refs, item, 'volume');
            activeMeasurementVisuals.add(item.id);
            const revealEase = measurementRevealEase(item);
            const isVolume3D = targetCount >= 3;
            const isArea2D = targetCount === 2;
            const degenerateArea = isArea2D && isDegenerateArea(a, b);
            if (isVolume3D) {
              updateVolumeGeometry(visual.mesh.geometry, visual.edges.geometry, a, b, c);
            } else if (isArea2D) {
              updateAreaGeometry(visual.mesh.geometry, visual.edges.geometry, a, b);
            } else {
              updateLengthGeometry(visual.mesh.geometry, visual.edges.geometry, a);
            }
            visual.mesh.visible = (isArea2D || isVolume3D) && !degenerateArea;
            visual.edges.visible = !degenerateArea;
            visual.mesh.material.color.setHex(isVolume3D ? MEASURE_VOLUME_HEX : MEASURE_AREA_HEX);
            visual.mesh.material.opacity = (isVolume3D ? 0.23 : 0.2) * revealEase;
            visual.mesh.renderOrder = 16 + index;
            visual.edges.material.color.setHex(
              isVolume3D ? MEASURE_VOLUME_EDGE_HEX : isArea2D ? MEASURE_AREA_EDGE_HEX : MEASURE_LENGTH_HEX
            );
            visual.edges.material.opacity = 0.86 * revealEase;
            visual.edges.renderOrder = 17 + index;
            const value = isVolume3D
              ? Math.abs(a.clone().cross(b).dot(c))
              : isArea2D
                ? a.clone().cross(b).length()
                : a.length();
            const labelPosition = (targetCount === 1
              ? a.clone().multiplyScalar(0.5)
              : measureTargets
              .reduce((sum, vector) => sum.add(vector), new THREE.Vector3())
              .multiplyScalar(1 / measureTargets.length));
            const labelPrefix = t(locale, isVolume3D ? 'volume' : isArea2D ? 'area' : 'length');
            const avoidancePoints = measurementPlacementPoints(measureTargets);
            activeMeasurementLabels.add(item.id);
            const labelNode = measurementLabelRefs.current.get(item.id);
            updateLabel(
              labelNode,
              labelPosition,
              [
                { text: `${labelPrefix} `, className: 'measurement-symbol' },
                ...joinMeasureTargetTokens(measureTargetIds),
                { text: ` = ${formatNumber(value)}`, className: 'measurement-value-token' },
              ],
              labelsVisible,
              degenerateArea
                ? [0, 34 + (index % 3) * 10]
                : [0, -32 - (index % 3) * 10],
              degenerateArea
                ? { allowOrigin: true }
                : { allowOrigin: true, placement: 'outside-bounds', avoidancePoints }
            );
            if (labelNode) labelNode.style.opacity = String(0.18 + revealEase * 0.82);
          }
      });
    refs.measurementVisuals?.forEach((visual, id) => {
      if (!activeMeasurementVisuals.has(id)) {
        disposeMeasurementVisual(visual);
        refs.measurementVisuals.delete(id);
        return;
      }
      const item = measurementsRef.current.find((candidate) => candidate.id === id);
      const { hardDimmed } = notebookObjectFocusState(item?.name);
      if (hardDimmed) {
        visual.group.traverse((object) => {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (!material || !Number.isFinite(material.opacity)) return;
            material.transparent = true;
            material.opacity *= hardFocusGeometryOpacityFactor;
          });
        });
      }
    });
    measurementSpawnTimes.forEach((_, id) => {
      if (!activeMeasurementVisuals.has(id)) measurementSpawnTimes.delete(id);
    });
    measurementLabelRefs.current.forEach((label, id) => {
      const item = measurementsRef.current.find((candidate) => candidate.id === id);
      const focusState = notebookObjectFocusState(item?.name);
      const measurementLabelOpacity = Number.parseFloat(label.style.opacity || '1');
      syncNotebookLabelFocusState(label, focusState, measurementLabelOpacity);
      if (!activeMeasurementLabels.has(id)) {
        label.style.display = 'none';
        label.style.opacity = '1';
      }
    });

    const activeVectorKeys = new Set();
    const vectorVisuals = refs.vectorVisuals ?? new Map();
    vectorsRef.current.forEach((vectorItem, vectorRenderIndex) => {
      const vectorFocusState = notebookObjectFocusState(vectorItem.name);
      const vectorFocused = vectorFocusState.presentationFocused;
      const vectorHardFocused = vectorFocusState.hardFocused;
      const vectorHardDimmed = vectorFocusState.hardDimmed;
      const vectorHardAccentStrength = vectorFocusState.hardAccentStrength ?? 0;
      const vectorFocusOpacity = vectorHardDimmed ? hardFocusGeometryOpacityFactor : 1;
      activeVectorKeys.add(vectorItem.id);
      let visual = vectorVisuals.get(vectorItem.id);
      if (!visual) {
        visual = createVectorVisual(refs.scene, refs.dragHandleGeometry, vectorItem);
        vectorVisuals.set(vectorItem.id, visual);
      }

      const vectorRenderOrder = 20 + vectorRenderIndex * 3;
      visual.arrow.renderOrder = vectorRenderOrder;
      visual.arrow.line.renderOrder = vectorRenderOrder;
      visual.arrow.cone.renderOrder = vectorRenderOrder + 1;
      visual.dotLine.renderOrder = vectorRenderOrder + 2;
      visual.dotPoint.renderOrder = vectorRenderOrder + 2;
      visual.handle.renderOrder = vectorRenderOrder + 10;

      visual.arrow.line.material.color.setHex(vectorItem.color);
      visual.arrow.cone.material.color.setHex(vectorItem.color);
      visual.dotMaterial.color.setHex(vectorItem.color);
      visual.dotPointMaterial.color.setHex(vectorItem.color);
      visual.handleMaterial.color.setHex(vectorItem.color);
      visual.handle.userData.color = vectorItem.color;
      const scalarEnabled = !!vectorItem.scalarEnabled;
      const vectorDragKey = scalarEnabled ? `s:${vectorItem.id}` : `v:${vectorItem.id}`;
      delete dragHandles[`v:${vectorItem.id}`];
      delete dragHandles[`s:${vectorItem.id}`];
      dragHandles[vectorDragKey] = visual.handle;
      visual.handle.userData.dragKey = vectorDragKey;

      const renderValues = renderedVectorValues.get(vectorItem.id) ?? vectorItem.values;
      const [vx, vy, vz] = transformVector3(vectorMatrix, renderValues);
      const userVector = new THREE.Vector3(vx, vy, vz);
      const spawnEase = vectorSpawnEase(vectorItem.id);
      const vectorItemVisible = vectorItem.visible !== false;
      const pointOnly = vectorItem.renderKind === 'point';
      const isActiveVector = vectorItem.id === activeVectorIdRef.current;
      const baseLengthSquared = userVector.lengthSq();
      const activeLengthSquared = activeVectorWorld?.lengthSq() ?? 0;
      const scalarSpace = vectorItem.scalarSpace === 'input' ? 'input' : 'output';
      const scalarNormal = scalarSpace === 'input'
        ? new THREE.Vector3(renderValues[0], renderValues[1], renderValues[2])
        : userVector;
      const scalarBaseLengthSquared = scalarNormal.lengthSq();
      const scalarValue = hasScalarText(vectorItem.scalar)
        ? parseNumber(vectorItem.scalar)
        : scalarBaseLengthSquared;
      const scalarAnchorInput =
        scalarBaseLengthSquared > EPSILON
          ? scalarNormal.clone().multiplyScalar(scalarValue / scalarBaseLengthSquared)
          : new THREE.Vector3(0, 0, 0);
      const scalarAnchor = scalarSpace === 'input'
        ? new THREE.Vector3(...transformVector3(vectorMatrix, [scalarAnchorInput.x, scalarAnchorInput.y, scalarAnchorInput.z]))
        : scalarAnchorInput;
      const projection =
        activeVectorWorld && baseLengthSquared > EPSILON
          ? userVector.clone().multiplyScalar(activeVectorWorld.dot(userVector) / baseLengthSquared)
          : new THREE.Vector3(0, 0, 0);
      const vectorVisible = uiStateRef.current.showVector && vectorItemVisible && vectorSceneAllowed;
      const arrowVisible = vectorVisible && !scalarEnabled && !pointOnly;
      const pointOnlyVisible = vectorVisible && !scalarEnabled && pointOnly;
      const zeroVectorVisible = vectorVisible && !scalarEnabled && !pointOnly && baseLengthSquared <= EPSILON;
      const dotDisplayVisible = !isSystemMode && uiStateRef.current.showDot && vectorItemVisible;
      setArrowVector(visual.arrow, vx, vy, vz, arrowVisible);
      setVectorFocusHalo(
        visual.focusHalo,
        vx,
        vy,
        vz,
        arrowVisible && vectorFocused
      );
      if (visual.focusHaloMaterial) {
        visual.focusHaloMaterial.uniforms.glowColor.value.setHex(vectorItem.color);
        const vectorFocusGlowOpacity = authoredHardFocusComparing && vectorFocused
          ? 0.4 * vectorHardAccentStrength
          : vectorHardFocused
            ? 0.28 + notebookHardFocusBlend * 0.12
            : 0.28;
        visual.focusHaloMaterial.uniforms.glowOpacity.value =
          spawnEase * vectorFocusGlowOpacity * vectorFocusOpacity;
      }
      visual.arrow.line.material.transparent = true;
      visual.arrow.cone.material.transparent = true;
      visual.arrow.line.material.color.setHex(vectorItem.color);
      visual.arrow.cone.material.color.setHex(vectorItem.color);
      visual.arrow.line.material.linewidth = vectorFocused
        ? authoredHardFocusComparing
          ? 1 + vectorHardAccentStrength
          : 2
        : 1;
      visual.arrow.line.material.opacity = spawnEase * vectorFocusOpacity;
      visual.arrow.cone.material.opacity = spawnEase * vectorFocusOpacity;
      if (vectorFocused && visual.arrow.cone.visible) {
        visual.arrow.cone.scale.multiplyScalar(
          authoredHardFocusComparing
            ? 1 + vectorHardAccentStrength * 0.08
            : 1.08
        );
      }
      const dotVisible =
        dotDisplayVisible &&
        arrowVisible &&
        !!activeVectorWorld &&
        !isActiveVector &&
        !scalarEnabled &&
        !pointOnly &&
        baseLengthSquared > EPSILON &&
        activeLengthSquared > EPSILON;
      const dotScalar = activeVectorWorld ? activeVectorWorld.dot(userVector) : 0;
      const dotPositions = visual.dotLine.geometry.attributes.position;
      dotPositions.setXYZ(0, 0, 0, 0);
      dotPositions.setXYZ(1, projection.x, projection.y, projection.z);
      dotPositions.setXYZ(2, projection.x, projection.y, projection.z);
      dotPositions.setXYZ(3, activeVectorWorld?.x ?? 0, activeVectorWorld?.y ?? 0, activeVectorWorld?.z ?? 0);
      dotPositions.needsUpdate = true;
      visual.dotLine.visible = dotVisible;
      visual.dotMaterial.opacity = 0.86 * spawnEase * vectorFocusOpacity;
      visual.dotPoint.position.copy(pointOnly || zeroVectorVisible ? userVector : projection);
      visual.dotPoint.visible = pointOnlyVisible || zeroVectorVisible || dotVisible;
      visual.dotPoint.scale.setScalar(
        pointOnly
          ? (vectorFocused ? 1.9 : 1.45)
          : zeroVectorVisible
            ? (vectorFocused ? 1.75 : 1.3)
            : 1
      );
      setMaterialOpacity(visual.dotPointMaterial, spawnEase * vectorFocusOpacity);
      handleTargets[vectorDragKey] = scalarEnabled ? scalarAnchor : userVector;
      const scalarHighlightIndices = scalarEnabled
        ? scalarLockHighlightIndices(
            [scalarNormal.x, scalarNormal.y, scalarNormal.z],
            coordMode
          )
        : [];
      const vectorLabelText = coordLabelText(
        vectorItem.name,
        [vx, vy, vz],
        coordMode,
        coordinatesVisible,
        scalarHighlightIndices
      );

      const vectorLabel = vectorLabelRefs.current.get(vectorItem.id);
      updateLabel(
        vectorLabel,
        new THREE.Vector3(vx * 1.06, vy * 1.06, vz * 1.06),
        vectorLabelText,
        vectorLabelsVisible && vectorVisible,
        zeroVectorVisible ? [22, -22] : [0, -18],
        { keepNameWhenCoordinatesHidden: true, allowOrigin: zeroVectorVisible }
      );
      if (vectorLabel) {
        vectorLabel.classList.remove('notebook-dimmed');
        const vectorLabelOpacity = 0.18 + spawnEase * 0.82;
        vectorLabel.style.opacity = vectorLabelsVisible && vectorVisible
          ? String(vectorLabelOpacity)
          : '';
        syncNotebookLabelFocusState(vectorLabel, vectorFocusState, vectorLabelOpacity);
      }
      updateLabel(
        vectorDotLabelRefs.current.get(vectorItem.id),
        projection.clone().lerp(activeVectorWorld ?? userVector, 0.22),
        `A${activeVectorItem?.name ?? 'v'}·A${vectorItem.name} = ${formatNumber(dotScalar)}`,
        dotVisible && labelsVisible,
        [16, 26 + (Math.max(0, vectorsRef.current.findIndex((item) => item.id === vectorItem.id)) % 3) * 13]
      );
      if (!dotVisible) {
        const dotLabel = vectorDotLabelRefs.current.get(vectorItem.id);
        if (dotLabel) dotLabel.textContent = '';
      }
    });

    vectorVisuals.forEach((visual, id) => {
      if (activeVectorKeys.has(id)) return;
      delete dragHandles[`v:${id}`];
      delete dragHandles[`s:${id}`];
      disposeVectorVisual(refs.scene, visual);
      vectorVisuals.delete(id);
      const label = vectorLabelRefs.current.get(id);
      const dotLabel = vectorDotLabelRefs.current.get(id);
      if (label) label.style.display = 'none';
      if (dotLabel) dotLabel.style.display = 'none';
    });

    const scalarSolution = frameScalarSolution ?? scalarSolutionRef.current;
    const scalarSolutionVisible = !!scalarSolution && uiStateRef.current.showVector && vectorSceneAllowed;
    const scalarSolutionVector = scalarSolution
      ? new THREE.Vector3(scalarSolution[0], scalarSolution[1], scalarSolution[2])
      : new THREE.Vector3();
    if (refs.scalarSolutionPoint) {
      refs.scalarSolutionPoint.visible = scalarSolutionVisible;
      if (scalarSolution) refs.scalarSolutionPoint.position.copy(scalarSolutionVector);
    }
    updateLabel(
      scalarSolutionLabelRef,
      scalarSolutionVector,
      scalarSolution ? `${t(locale, 'solution')} x = ${formatCoord(scalarSolution, coordMode)}` : '',
      scalarSolutionVisible && labelsVisible,
      [30, -10],
      { allowOrigin: true }
    );

    Object.entries(dragHandles).forEach(([key, handle]) => {
      const target = handleTargets[key];
      const isVectorHandle = !!vectorIdFromDragKey(key) || !!scalarIdFromDragKey(key);
      const dragVectorId = vectorIdFromDragKey(key) ?? scalarIdFromDragKey(key);
      const dragVectorVisible = dragVectorId
        ? vectorsRef.current.find((item) => item.id === dragVectorId)?.visible !== false
        : true;
      const isAvailable =
        !!target &&
        target.length() > EPSILON &&
        (isVectorHandle
          ? vectorSceneAllowed && uiStateRef.current.showVector && dragVectorVisible
          : !isSystemMode && basisVisibleByKey[key] && (key !== 'k' || coordMode === '3d'));
      const isHot = arrowDragRef.current.hovered === key || arrowDragRef.current.key === key;
      if (target) handle.position.copy(target);
      handle.visible = isAvailable;
      handle.scale.setScalar(isHot ? 1.15 : 1);
      handle.material.opacity = 0.001;
      handle.material.color.setHex(
        arrowDragRef.current.key === key && arrowDragRef.current.snapped
          ? 0xfff4b0
          : handle.userData.color
      );
    });
    updateLabel(
      iLabelRef,
      new THREE.Vector3(matrix[0] * 1.16, matrix[3] * 1.16, matrix[6] * 1.16),
      `i′${coordinatesVisible ? ` ${formatCoord([matrix[0], matrix[3], matrix[6]], coordMode)}` : ''}`,
      basisVisibleByKey.i,
      [18, 12],
      { keepNameWhenCoordinatesHidden: true }
    );
    updateLabel(
      jLabelRef,
      new THREE.Vector3(matrix[1] * 1.12, matrix[4] * 1.12, matrix[7] * 1.12),
      `j′${coordinatesVisible ? ` ${formatCoord([matrix[1], matrix[4], matrix[7]], coordMode)}` : ''}`,
      basisVisibleByKey.j,
      [-14, -16],
      { keepNameWhenCoordinatesHidden: true }
    );
    updateLabel(
      kLabelRef,
      new THREE.Vector3(matrix[2] * 1.12, matrix[5] * 1.12, matrix[8] * 1.12),
      `k′${coordinatesVisible ? ` ${formatCoord([matrix[2], matrix[5], matrix[8]], '3d')}` : ''}`,
      basisVisibleByKey.k && kAxisBlend > 0.08,
      [10, -18],
      { keepNameWhenCoordinatesHidden: true }
    );
    if (refs.labelLayoutDirty) {
      const mobileLabelSafeArea =
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 760px)').matches;
      const labelViewportHeight = mobileLabelSafeArea
        ? Math.max(1, refs.viewportSize.height - 116)
        : refs.viewportSize.height;
      resolveSceneLabelOverlaps(
        containerRef.current,
        refs.viewportSize.width,
        labelViewportHeight
      );
      refs.labelLayoutDirty = false;
    }
    refs.renderer.render(refs.scene, refs.camera);
  }, [locale, updateLabel]);

  useEffect(() => {
    if (showFlowHome) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const viewportSize = {
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
    };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#121210');

    const camera = new THREE.PerspectiveCamera(
      sceneVerticalFovForViewport(
        viewportSize.width,
        viewportSize.height,
        CAMERA_FOV_DEG
      ),
      viewportSize.width / viewportSize.height,
      0.1,
      1000
    );
    camera.position.copy(initialCameraPositionRef.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(viewportSize.width, viewportSize.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.copy(initialCameraTargetRef.current);
    configureControlsForView(controls, '3d', controlLocksFromRefs());
    controls.update();
    const handleControlsStart = () => {
      cameraMoveRef.current.active = false;
      cameraMoveRef.current.onComplete = null;
      notebookStopCameraRestorePendingRef.current = false;
      setActiveView(null);
    };
    const handleControlsChange = () => {
      queueCameraShareUpdate(220);
    };
    const handleControlsEnd = () => {
      queueCameraShareUpdate(0);
    };
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);
    controls.addEventListener('end', handleControlsEnd);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.86);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xf1b434, 0.35);
    rimLight.position.set(-7, 4, -8);
    scene.add(rimLight);

    const staticGridMaterial = new THREE.LineBasicMaterial({
      color: 0x6b7280,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
    });
    const staticGrid = new THREE.LineSegments(createGridGeometry(9, 1), staticGridMaterial);
    staticGrid.renderOrder = 0;
    scene.add(staticGrid);

    const referenceGridMaterial = new THREE.LineBasicMaterial({
      color: 0x22c1b6,
      transparent: true,
      opacity: 0.34,
      depthTest: false,
      depthWrite: false,
    });
    const referenceGrid = new THREE.LineSegments(createPlaneGridGeometry(), referenceGridMaterial);
    referenceGrid.renderOrder = 1;
    referenceGrid.visible = false;
    scene.add(referenceGrid);

    const iAbsoluteAxis = createAxisLine(0xe05263);
    const jAbsoluteAxis = createAxisLine(0x1f9d55);
    const kAbsoluteAxis = createAxisLine(0x3f7ee8);
    const iRelativeAxis = createAxisLine(0xe05263);
    const jRelativeAxis = createAxisLine(0x1f9d55);
    const kRelativeAxis = createAxisLine(0x3f7ee8);
    scene.add(iAbsoluteAxis, jAbsoluteAxis, kAbsoluteAxis, iRelativeAxis, jRelativeAxis, kRelativeAxis);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x22c1b6,
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
    });
    const dynamicGrid = new THREE.LineSegments(createGridGeometry(9, 1), gridMaterial);
    dynamicGrid.matrixAutoUpdate = false;
    dynamicGrid.renderOrder = 4;
    dynamicGroup.add(dynamicGrid);

    const dynamicPlaneGridMaterial = new THREE.LineBasicMaterial({
      color: 0x22c1b6,
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
    });
    const dynamicPlaneGrid = new THREE.LineSegments(createPlaneGridGeometry(), dynamicPlaneGridMaterial);
    dynamicPlaneGrid.matrixAutoUpdate = false;
    dynamicPlaneGrid.renderOrder = 4;
    dynamicPlaneGrid.visible = false;
    dynamicGroup.add(dynamicPlaneGrid);

    const createArrow = (color) => {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        color,
        0.28,
        0.14
      );
      arrow.line.material.depthTest = false;
      arrow.cone.material.depthTest = false;
      arrow.renderOrder = 10;
      return arrow;
    };

    const iArrow = createArrow(0xe05263);
    const jArrow = createArrow(0x1f9d55);
    const kArrow = createArrow(0x3f7ee8);
    const userArrow = createArrow(0x8b5cf6);
    scene.add(iArrow, jArrow, kArrow, userArrow);

    const dotGeometry = new THREE.BufferGeometry();
    dotGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
    );
    const dotMaterial = new THREE.LineBasicMaterial({
      color: MEASURE_DOT_HEX,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    const dotLine = new THREE.LineSegments(dotGeometry, dotMaterial);
    dotLine.renderOrder = 12;
    scene.add(dotLine);

    const dotPointGeometry = new THREE.SphereGeometry(0.055, 18, 12);
    const dotPointMaterial = new THREE.MeshBasicMaterial({
      color: MEASURE_DOT_HEX,
      depthTest: false,
      depthWrite: false,
    });
    const dotPoint = new THREE.Mesh(dotPointGeometry, dotPointMaterial);
    dotPoint.renderOrder = 13;
    scene.add(dotPoint);

    const equationGroup = new THREE.Group();
    equationGroup.matrixAutoUpdate = false;
    equationGroup.visible = false;
    scene.add(equationGroup);

    const solutionTraceVisual = createSolutionTraceVisual();
    scene.add(solutionTraceVisual.group);

    const vectorScalarGroup = new THREE.Group();
    vectorScalarGroup.visible = false;
    scene.add(vectorScalarGroup);

    const measurementGroup = new THREE.Group();
    measurementGroup.visible = true;
    scene.add(measurementGroup);

    const scalarSolutionPointGeometry = new THREE.SphereGeometry(0.085, 24, 16);
    const scalarSolutionPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1b434,
      depthTest: false,
      depthWrite: false,
    });
    const scalarSolutionPoint = new THREE.Mesh(scalarSolutionPointGeometry, scalarSolutionPointMaterial);
    scalarSolutionPoint.renderOrder = 36;
    scalarSolutionPoint.visible = false;
    scene.add(scalarSolutionPoint);

    const equationPointGeometry = new THREE.SphereGeometry(0.075, 24, 16);
    const equationPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    });
    const equationPoint = new THREE.Mesh(equationPointGeometry, equationPointMaterial);
    equationPoint.renderOrder = 35;
    equationPoint.userData.visible = false;
    equationPoint.visible = false;
    scene.add(equationPoint);

    const dragHandleGeometry = new THREE.SphereGeometry(0.13, 22, 14);
    const createDragHandle = (key, color) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.001,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(dragHandleGeometry, material);
      mesh.renderOrder = 30;
      mesh.userData.dragKey = key;
      mesh.userData.color = color;
      scene.add(mesh);
      return mesh;
    };
    const dragHandles = {
      i: createDragHandle('i', 0xe05263),
      j: createDragHandle('j', 0x1f9d55),
      k: createDragHandle('k', 0x3f7ee8),
    };

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    boxGeometry.translate(0.5, 0.5, 0.5);
    const boxMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    boxMesh.matrixAutoUpdate = false;
    boxMesh.renderOrder = 2;
    scene.add(boxMesh);

    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    const boxEdges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
    boxEdges.matrixAutoUpdate = false;
    boxEdges.renderOrder = 3;
    scene.add(boxEdges);

    const areaGeometry = new THREE.PlaneGeometry(1, 1);
    areaGeometry.translate(0.5, 0.5, 0);
    const areaMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const areaMesh = new THREE.Mesh(areaGeometry, areaMaterial);
    areaMesh.matrixAutoUpdate = false;
    areaMesh.renderOrder = 2;
    scene.add(areaMesh);

    const areaEdgesGeometry = new THREE.EdgesGeometry(areaGeometry);
    const areaEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.76,
      depthTest: false,
      depthWrite: false,
    });
    const areaEdges = new THREE.LineSegments(areaEdgesGeometry, areaEdgeMaterial);
    areaEdges.matrixAutoUpdate = false;
    areaEdges.renderOrder = 3;
    scene.add(areaEdges);

    const vectorAreaGeometry = new THREE.BufferGeometry();
    const vectorAreaEdgeGeometry = new THREE.BufferGeometry();
    updateAreaGeometry(
      vectorAreaGeometry,
      vectorAreaEdgeGeometry,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0)
    );
    const vectorVolumeGeometry = new THREE.BufferGeometry();
    const vectorVolumeEdgeGeometry = new THREE.BufferGeometry();
    updateVolumeGeometry(
      vectorVolumeGeometry,
      vectorVolumeEdgeGeometry,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    );
    const vectorVolumeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const vectorVolumeEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xc4b5fd,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
    });
    const vectorAreaMesh = new THREE.Mesh(vectorAreaGeometry, vectorVolumeMaterial.clone());
    vectorAreaMesh.renderOrder = 6;
    vectorAreaMesh.visible = false;
    scene.add(vectorAreaMesh);
    const vectorAreaEdges = new THREE.LineSegments(vectorAreaEdgeGeometry, vectorVolumeEdgeMaterial.clone());
    vectorAreaEdges.renderOrder = 7;
    vectorAreaEdges.visible = false;
    scene.add(vectorAreaEdges);
    const vectorVolumeMesh = new THREE.Mesh(vectorVolumeGeometry, vectorVolumeMaterial);
    vectorVolumeMesh.renderOrder = 6;
    vectorVolumeMesh.visible = false;
    scene.add(vectorVolumeMesh);
    const vectorVolumeEdges = new THREE.LineSegments(vectorVolumeEdgeGeometry, vectorVolumeEdgeMaterial);
    vectorVolumeEdges.renderOrder = 7;
    vectorVolumeEdges.visible = false;
    scene.add(vectorVolumeEdges);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      viewportSize.width = width;
      viewportSize.height = height;
      camera.aspect = width / height;
      camera.fov = sceneVerticalFovForViewport(width, height, CAMERA_FOV_DEG);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      if (threeRef.current) threeRef.current.labelLayoutDirty = true;
    });
    resizeObserver.observe(container);

    threeRef.current = {
      renderer,
      scene,
      camera,
      controls,
      viewportSize,
      labelLayoutDirty: true,
      staticGrid,
      referenceGrid,
      iAbsoluteAxis,
      jAbsoluteAxis,
      kAbsoluteAxis,
      iRelativeAxis,
      jRelativeAxis,
      kRelativeAxis,
      dynamicGrid,
      dynamicPlaneGrid,
      iArrow,
      jArrow,
      kArrow,
      userArrow,
      dotLine,
      dotPoint,
      equationGroup,
      solutionTraceVisual,
      vectorScalarGroup,
      measurementGroup,
      measurementVisuals: new Map(),
      measurementSpawnTimes: new Map(),
      equationSpawnTimes: new Map(),
      scalarSolutionPoint,
      equationPoint,
      dragHandles,
      dragHandleGeometry,
      vectorVisuals: new Map(),
      boxMesh,
      boxEdges,
      boxMaterial,
      edgeMaterial,
      areaMesh,
      areaEdges,
      areaMaterial,
      areaEdgeMaterial,
      vectorAreaMesh,
      vectorAreaEdges,
      vectorAreaMaterial: vectorAreaMesh.material,
      vectorAreaEdgeMaterial: vectorAreaEdges.material,
      vectorVolumeMesh,
      vectorVolumeEdges,
      vectorVolumeMaterial,
      vectorVolumeEdgeMaterial,
      disposable: [
        staticGrid.geometry,
        staticGridMaterial,
        iAbsoluteAxis.geometry,
        iAbsoluteAxis.material,
        jAbsoluteAxis.geometry,
        jAbsoluteAxis.material,
        kAbsoluteAxis.geometry,
        kAbsoluteAxis.material,
        iRelativeAxis.geometry,
        iRelativeAxis.material,
        jRelativeAxis.geometry,
        jRelativeAxis.material,
        kRelativeAxis.geometry,
        kRelativeAxis.material,
        gridMaterial,
        referenceGrid.geometry,
        referenceGridMaterial,
        dynamicGrid.geometry,
        dynamicPlaneGrid.geometry,
        dynamicPlaneGridMaterial,
        dotGeometry,
        dotMaterial,
        dotPointGeometry,
        dotPointMaterial,
        scalarSolutionPointGeometry,
        scalarSolutionPointMaterial,
        equationPointGeometry,
        equationPointMaterial,
        dragHandleGeometry,
        ...Object.values(dragHandles).map((handle) => handle.material),
        boxGeometry,
        boxMaterial,
        edgesGeometry,
        edgeMaterial,
        areaGeometry,
        areaMaterial,
        areaEdgesGeometry,
        areaEdgeMaterial,
        vectorAreaGeometry,
        vectorAreaMesh.material,
        vectorAreaEdgeGeometry,
        vectorAreaEdges.material,
        vectorVolumeGeometry,
        vectorVolumeMaterial,
        vectorVolumeEdgeGeometry,
        vectorVolumeEdgeMaterial,
      ],
    };

    const setPointerFromEvent = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.set(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
      );
    };

    const intersectDragPlaneAtClient = (clientX, clientY, plane, target) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.set(
        ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
      );
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      return raycasterRef.current.ray.intersectPlane(plane, target);
    };

    const setDragCursor = (value) => {
      container.style.cursor = value;
      renderer.domElement.style.cursor = value;
    };

    const projectDragPoint = (vector) => {
      const projected = vector.clone().project(camera);
      if (projected.z > 1 || projected.z < -1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
        y: (projected.y * -0.5 + 0.5) * renderer.domElement.clientHeight,
      };
    };

    const updateDragSnapGuide = (rawWorld, snappedWorld, mode) => {
      const distance = rawWorld.distanceTo(snappedWorld);
      if (distance <= 0.002) {
        setDragSnapGuide(null);
        return;
      }
      const rawPoint = projectDragPoint(rawWorld);
      const snappedPoint = projectDragPoint(snappedWorld);
      if (!rawPoint || !snappedPoint) {
        setDragSnapGuide(null);
        return;
      }
      setDragSnapGuide({
        x1: rawPoint.x,
        y1: rawPoint.y,
        x2: snappedPoint.x,
        y2: snappedPoint.y,
      });
    };

    const distanceToScreenLine = (point, start, end) => {
      const vx = end.x - start.x;
      const vy = end.y - start.y;
      const wx = point.x - start.x;
      const wy = point.y - start.y;
      const lengthSquared = vx * vx + vy * vy;
      if (lengthSquared < EPSILON) return Infinity;
      return Math.abs(vx * wy - vy * wx) / Math.sqrt(lengthSquared);
    };

    const shiftAxisLockedWorld = (rawWorld, mode) => {
      if (mode === '1d') {
        return new THREE.Vector3(rawWorld.x, 0, 0);
      }

      const rawPoint = projectDragPoint(rawWorld);
      const originPoint = projectDragPoint(new THREE.Vector3(0, 0, 0));
      if (!rawPoint || !originPoint) return null;

      const axisItems = [
        { key: 'x', axis: new THREE.Vector3(1, 0, 0) },
        { key: 'y', axis: new THREE.Vector3(0, 1, 0) },
        ...(mode === '3d' ? [{ key: 'z', axis: new THREE.Vector3(0, 0, 1) }] : []),
      ];

      let best = null;
      axisItems.forEach((item) => {
        const plus = projectDragPoint(item.axis.clone().multiplyScalar(8));
        const minus = projectDragPoint(item.axis.clone().multiplyScalar(-8));
        const start = minus ?? originPoint;
        const end = plus ?? originPoint;
        if (!plus && !minus) return;
        const distance = distanceToScreenLine(rawPoint, start, end);
        if (!best || distance < best.distance) {
          best = { ...item, distance };
        }
      });

      if (!best || best.distance > SHIFT_AXIS_LOCK_PX) return null;
      return best.axis.multiplyScalar(rawWorld.dot(best.axis));
    };

    const setHoveredDragKey = (key, isDragging = false) => {
      arrowDragRef.current.hovered = key;
      container.querySelectorAll('[data-drag-key]').forEach((label) => {
        const isActiveLabel = label.dataset.dragKey === key;
        label.classList.toggle('is-drag-hot', isActiveLabel);
        label.classList.toggle('is-dragging', isActiveLabel && isDragging);
      });
      setDragCursor(key ? (isDragging ? 'grabbing' : 'grab') : '');
    };

    const getLabelDragKey = (event) => {
      if (!(event.target instanceof Element)) return null;
      if (event.target.closest('.label-measure-menu')) return null;
      if (measureModeRef.current && event.target.closest('.measure-target-label')) {
        return null;
      }
      return event.target.closest('[data-drag-key]')?.dataset.dragKey ?? null;
    };

    const getDragTargetVector = (key) => {
      const matrix = currentMatrixRef.current;
      if (key === 'i') return new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
      if (key === 'j') return new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
      if (key === 'k') return new THREE.Vector3(matrix[2], matrix[5], matrix[8]);
      const scalarId = scalarIdFromDragKey(key);
      if (scalarId) {
        const sourceVector = vectorsRef.current.find((item) => item.id === scalarId);
        if (!sourceVector) return new THREE.Vector3(0, 0, 0);
        const scalarSpace = sourceVector.scalarSpace === 'input' ? 'input' : 'output';
        const normal = scalarSpace === 'input'
          ? new THREE.Vector3(...sourceVector.values)
          : new THREE.Vector3(...transformVector3(matrix, sourceVector.values));
        const lengthSquared = normal.lengthSq();
        if (lengthSquared < EPSILON) return new THREE.Vector3(0, 0, 0);
        const scalarValue = hasScalarText(sourceVector.scalar)
          ? parseNumber(sourceVector.scalar)
          : lengthSquared;
        const anchor = normal.multiplyScalar(scalarValue / lengthSquared);
        return scalarSpace === 'input'
          ? new THREE.Vector3(...transformVector3(matrix, [anchor.x, anchor.y, anchor.z]))
          : anchor;
      }
      const vectorId = vectorIdFromDragKey(key);
      const sourceVector =
        vectorsRef.current.find((item) => item.id === vectorId)?.values ??
        userVectorRef.current;
      const [vx, vy, vz] = transformVector3(matrix, sourceVector);
      return new THREE.Vector3(vx, vy, vz);
    };

    const pickDragHandle = (event) => {
      setPointerFromEvent(event);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const activeVectorKey = `v:${activeVectorIdRef.current}`;
      const hitScore = (hit) => {
        const key = hit.object?.userData?.dragKey;
        if (!hit.object?.visible) return 99;
        if (key === activeVectorKey) return 0;
        if (scalarIdFromDragKey(key)) return 0.5;
        if (vectorIdFromDragKey(key)) return 1;
        return 2;
      };
      const hits = raycasterRef.current
        .intersectObjects(Object.values(dragHandles), false)
        .filter((hit) => hit.object?.visible)
        .sort((a, b) => hitScore(a) - hitScore(b) || a.distance - b.distance);
      return hits[0]?.object ?? null;
    };

    const isSceneChromeTarget = (event) => (
      event.target instanceof Element &&
      !!event.target.closest(
        'button, input, select, textarea, .axis-label, .scene-control-dock, .measure-draft-guide, .ad-slot'
      )
    );

    const cancelMeasurementPick = () => {
      setMeasureMode(null);
      setMeasureDraft([]);
      setMeasureAnchorId(null);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
    };

    const handleArrowPointerMove = (event) => {
      const dragState = arrowDragRef.current;
      if (dragState.active) {
        event.preventDefault();
        const dx = event.clientX - dragState.startClientX;
        const dy = event.clientY - dragState.startClientY;
        const nextWorld = dragState.startVector
          .clone()
          .addScaledVector(dragState.screenRight, dx)
          .addScaledVector(dragState.screenDown, dy);
        const mode = viewKeyForMatrix(currentMatrixRef.current);
        const snapEnabled = dragSnapEnabledRef.current;
        const shiftLockedWorld =
          event.shiftKey && !scalarIdFromDragKey(dragState.key)
            ? shiftAxisLockedWorld(nextWorld, mode)
            : null;
        const dragWorld = shiftLockedWorld ?? nextWorld;
        const snappedWorld = constrainVectorForMode(
          dragWorld,
          mode,
          snapEnabled ? { drag: true } : { snap: false }
        );
        let adjustedWorld = snappedWorld;
        if (scalarIdFromDragKey(dragState.key)) {
          adjustedWorld =
            dragActionsRef.current.updateScalarConstraintFromDrag?.(dragWorld, dragState) ?? snappedWorld;
        } else if (vectorIdFromDragKey(dragState.key)) {
          adjustedWorld =
            dragActionsRef.current.updateUserVectorFromDrag?.(dragWorld, dragState) ?? snappedWorld;
        } else {
          adjustedWorld =
            dragActionsRef.current.updateBasisVectorFromDrag?.(dragState.key, dragWorld) ?? snappedWorld;
        }
        dragState.snapped = adjustedWorld.distanceTo(nextWorld) > EPSILON;
        if ((snapEnabled || shiftLockedWorld) && dragState.snapped && !scalarIdFromDragKey(dragState.key)) {
          updateDragSnapGuide(nextWorld, adjustedWorld, mode);
        } else {
          setDragSnapGuide(null);
        }
        setHoveredDragKey(dragState.key, true);
        return;
      }

      const labelKey = getLabelDragKey(event);
      const hit = labelKey ? null : pickDragHandle(event);
      const nextHovered = labelKey ?? hit?.userData.dragKey ?? null;
      if (arrowDragRef.current.hovered !== nextHovered) {
        setHoveredDragKey(nextHovered);
      }
      setDragSnapGuide(null);
    };

    const handleArrowPointerDown = (event) => {
      const labelKey = getLabelDragKey(event);
      const hit = labelKey ? null : pickDragHandle(event);
      const dragKey = labelKey ?? hit?.userData.dragKey ?? null;
      if (!dragKey) {
        if (
          (measureModeRef.current || measureDraftRef.current.length > 0) &&
          !isSceneChromeTarget(event)
        ) {
          cancelMeasurementPick();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDragSnapGuide(null);
      cameraMoveRef.current.active = false;
      isAnimatingRef.current = false;
      setActiveView(null);
      controls.enabled = false;
      container.setPointerCapture?.(event.pointerId);
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const startVector = getDragTargetVector(dragKey);
      const draggedVectorId = vectorIdFromDragKey(dragKey);
      const draggedScalarId = scalarIdFromDragKey(dragKey);
      const draggedAnyVectorId = draggedVectorId ?? draggedScalarId;
      if (draggedAnyVectorId) setActiveVectorId(draggedAnyVectorId);
      if (draggedVectorId) {
        dragActionsRef.current.beginNotebookVectorLineDrag?.(draggedVectorId);
      }
      const startInputVector =
        vectorsRef.current.find((item) => item.id === draggedAnyVectorId)?.values ??
        userVectorRef.current;
      const draggedScalarSpace =
        draggedScalarId
          ? vectorsRef.current.find((item) => item.id === draggedScalarId)?.scalarSpace ?? 'input'
          : null;
      const scalarNormal =
        draggedScalarId
          ? (
              draggedScalarSpace === 'input'
                ? new THREE.Vector3(...startInputVector)
                : new THREE.Vector3(...transformVector3(currentMatrixRef.current, startInputVector))
            )
          : null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), startVector);
      const startIntersection = new THREE.Vector3();
      const rightIntersection = new THREE.Vector3();
      const downIntersection = new THREE.Vector3();
      const hasStartIntersection = intersectDragPlaneAtClient(event.clientX, event.clientY, plane, startIntersection);
      if (!hasStartIntersection) startIntersection.copy(startVector);
      const hasRightIntersection = intersectDragPlaneAtClient(event.clientX + 1, event.clientY, plane, rightIntersection);
      if (!hasRightIntersection) {
        rightIntersection
          .copy(startIntersection)
          .add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.01));
      }
      const hasDownIntersection = intersectDragPlaneAtClient(event.clientX, event.clientY + 1, plane, downIntersection);
      if (!hasDownIntersection) {
        downIntersection
          .copy(startIntersection)
          .add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-0.01));
      }
      arrowDragRef.current = {
        active: true,
        hovered: dragKey,
        key: dragKey,
        snapped: false,
        startMatrix: [...currentMatrixRef.current],
        startClientX: event.clientX,
        startClientY: event.clientY,
        startIntersection: startIntersection.clone(),
        startInputVector: [...startInputVector],
        startVector: startVector.clone(),
        scalarNormal,
        scalarSpace: draggedScalarSpace,
        screenDown: downIntersection.sub(startIntersection),
        screenRight: rightIntersection.sub(startIntersection),
        plane,
      };
      setHoveredDragKey(dragKey, true);
    };

    const finishArrowDrag = (event) => {
      if (!arrowDragRef.current.active) return;
      const dragState = arrowDragRef.current;
      const finalMatrix = [...currentMatrixRef.current];
      controls.enabled = true;
      try {
        container.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture can already be gone when the browser ends a drag outside the canvas.
      }
      if (dragState.key && !vectorIdFromDragKey(dragState.key) && !scalarIdFromDragKey(dragState.key)) {
        dragActionsRef.current.commitBasisDrag?.(dragState.startMatrix, finalMatrix, dragState.key);
      }
      if (vectorIdFromDragKey(dragState.key)) {
        dragActionsRef.current.commitUserVectorDrag?.(dragState);
      }
      arrowDragRef.current.active = false;
      arrowDragRef.current.key = null;
      arrowDragRef.current.snapped = false;
      setDragSnapGuide(null);
      setHoveredDragKey(arrowDragRef.current.hovered);
    };

    const clearArrowHover = () => {
      if (arrowDragRef.current.active) return;
      setDragSnapGuide(null);
      setHoveredDragKey(null);
    };

    container.addEventListener('pointermove', handleArrowPointerMove);
    container.addEventListener('pointerdown', handleArrowPointerDown);
    container.addEventListener('pointerup', finishArrowDrag);
    container.addEventListener('pointerleave', clearArrowHover);

    setIsLoaded(true);
    frameIdRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', handleArrowPointerMove);
      container.removeEventListener('pointerdown', handleArrowPointerDown);
      container.removeEventListener('pointerup', finishArrowDrag);
      container.removeEventListener('pointerleave', clearArrowHover);
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      controls.removeEventListener('end', handleControlsEnd);
      controls.dispose();
      clearEquationGroup(equationGroup);
      disposeObject3D(solutionTraceVisual.group);
      scene.remove(solutionTraceVisual.group);
      clearEquationGroup(vectorScalarGroup);
      threeRef.current?.measurementVisuals?.forEach(disposeMeasurementVisual);
      threeRef.current?.vectorVisuals?.forEach((visual) => disposeVectorVisual(scene, visual));
      threeRef.current?.disposable.forEach((item) => item.dispose?.());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
    };
  }, [animate, queueCameraShareUpdate, showFlowHome]);

  const moveCameraToView = useCallback((viewKey, options = {}) => {
    const refs = threeRef.current;
    const preset = viewPresets[viewKey];
    if (!preset) return;
    const resetLocks = Boolean(options.resetLocks);
    if (resetLocks) {
      cameraLockedRef.current = false;
      zoomLockedRef.current = false;
      setCameraLocked(false);
      setZoomLocked(false);
    }
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(viewKey);
    const cameraOptions = {
      resetDistance: Boolean(options.resetDistance),
      resetTarget: Boolean(options.resetTarget),
    };
    const destination = refs
      ? cameraStateForView(viewKey, refs.camera.position, refs.controls.target, cameraOptions)
      : cameraStateForView(viewKey, undefined, undefined, cameraOptions);
    setCameraState({
      position: cameraVectorToShareArray(destination.position),
      target: cameraVectorToShareArray(destination.target),
    });
    if (!refs) return;
    configureControlsForView(
      refs.controls,
      viewKey,
      resetLocks ? { camera: false, zoom: false } : controlLocksFromRefs()
    );
    cameraMoveRef.current = {
      active: true,
      startTime: null,
      positionFrom: refs.camera.position.clone(),
      targetFrom: refs.controls.target.clone(),
      positionTo: destination.position,
      targetTo: destination.target,
    };
  }, [controlLocksFromRefs]);

  const switchWorkspaceMode = useCallback((mode) => {
    const nextMode = TRANSFORM_WORKSPACE_ENABLED && mode === 'transform' ? 'transform' : 'system';
    setWorkspaceMode(nextMode);
    cameraMoveRef.current.active = false;
    cameraProgressOverrideRef.current = null;
    notebookCameraTransitionRef.current = null;
    const baseView = nextMode === 'system' ? NOTEBOOK_SCENE_DEFAULTS.view : '3d';
    notebookAutoCameraViewRef.current = baseView;
    autoCameraTargetViewRef.current = baseView;
    animationViewFromRef.current = baseView;
    animationViewToRef.current = baseView;
  }, []);

  useEffect(() => {
    systemDimensionRef.current = effectiveSystemMode;
  }, [effectiveSystemMode]);

  const startAnimationTo = useCallback((matrix, historyName, options = {}) => {
    const {
      operationMatrix = matrix,
      operationMode = '3d',
      isDimensionDrop = false,
      previousMatrix,
      replaceHistory = false,
      stateMode = modeForMatrix(matrix),
    } = options;
    const animationStartMatrix = [...currentMatrixRef.current];
    startMatrixRef.current = animationStartMatrix;
    targetMatrixRef.current = [...matrix];
    setBasisControlMatrix([...matrix]);
    animationViewFromRef.current = viewKeyForMatrix(animationStartMatrix);
    animationViewToRef.current = viewKeyForMatrix(matrix);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    isAnimatingRef.current = true;
    setProgress(0);

    if (historyName) {
      const entry = {
        name: historyName,
        matrix: [...matrix],
        previousMatrix: [...(previousMatrix ?? animationStartMatrix)],
        previousStateMode: modeForMatrix(previousMatrix ?? animationStartMatrix),
        operationMatrix: [...operationMatrix],
        operationMode,
        isDimensionDrop,
        stateMode,
      };
      setHistory((previous) => {
        const next = replaceHistory ? [entry] : [...previous, entry];
        setActiveHistoryIndex(next.length - 1);
        setHoveredHistoryIndex(null);
        return next;
      });
    }
  }, []);

  const applyTransformation = useCallback((matrix, name, operationMode = '3d') => {
    const previousRank = rank3(currentMatrixRef.current);
    const next = multiplyMatrix3(matrix, currentMatrixRef.current);
    const nextRank = rank3(next);
    startAnimationTo(next, name, {
      operationMatrix: matrix,
      operationMode,
      isDimensionDrop: nextRank < previousRank,
    });
  }, [startAnimationTo]);

  const applyNotebookCursor = useCallback((rawCursor, sourceCells = notebookScript.cells, options = {}) => {
    const syncUi = options.syncUi !== false;
    if (syncUi && options.preserveCompletion !== true) setNotebookCompleted(false);
    const cells = sourceCells.length ? sourceCells : [];
    const openingSceneState = notebookOpeningSceneState(cells, NOTEBOOK_SCENE_DEFAULTS);
    const clamped = Math.max(0, Math.min(100, Number(rawCursor) || 0));
    if (clamped <= 0.001) {
      cameraProgressOverrideRef.current = null;
      notebookCameraTransitionRef.current = null;
      if (workspaceModeRef.current === 'system') {
        notebookAutoCameraViewRef.current = openingSceneState.view;
        autoCameraTargetViewRef.current = openingSceneState.view;
        animationViewFromRef.current = openingSceneState.view;
        animationViewToRef.current = openingSceneState.view;
      }
    }
    const hasLineMetadata = cells.some(
      (cell) => Number.isFinite(cell.lineStart) && Number.isFinite(cell.lineEnd)
    );
    let activeCell = clamped <= 0 ? null : cells[0];
    let equationText = '';
    let hasEquationText = false;
    let captionText = '';
    let currentDimensionMode = openingSceneState.dimension;
    let currentDimensionIdentity = identityMatrixForMode(currentDimensionMode);
    let startMatrix = [...currentDimensionIdentity];
    let targetMatrix = [...currentDimensionIdentity];
    let progressWithinCell = 1;
    let activeCellProgress = clamped <= 0 ? 0 : 1;
    const scriptHasVectorCells = hasLineMetadata && cells.some(
      (cell) =>
        !cell.hidden &&
        (((cell.type === 'vector' || cell.type === 'slice') && cell.execute !== false && !cell.remove) ||
          (cell.type === 'calc' && cell.resultKind === 'vector' && cell.execute === true) ||
          (cell.type === 'ref' && cell.refKind === 'vector' && !cell.remove))
    );
    const revealedVectors = [];
    const notebookVectorEnv = new Map();
    const notebookMatrixEnv = new Map();
    const visibleNotebookMatrices = new Map();
    const notebookEquationEnv = new Map();
    const equationLineItems = [];
    const sceneCells = cells.filter((cell) => cell.type === 'scene' && !cell.hidden);
    const sceneCommandKinds = new Set(sceneCells.map((cell) => cell.command));
    const scenePresets = sceneCells
      .filter((cell) => cell.command === 'preset' && cell.value && typeof cell.value === 'object')
      .map((cell) => cell.value);
    const scriptHasViewCommand = Boolean(NOTEBOOK_SCENE_DEFAULTS.view) || sceneCommandKinds.has('view') || scenePresets.some(
      (preset) => Boolean(preset.view)
    ) || cells.some(
      (cell) => !cell.hidden && cell.type === 'ref' && Boolean(cell.synchronizedView)
    );
    const scriptHasZoomCommand = Number.isFinite(NOTEBOOK_SCENE_DEFAULTS.zoom) || sceneCommandKinds.has('zoom') || scenePresets.some(
      (preset) => Number.isFinite(preset.zoom)
    );
    const sceneToggleState = { ...NOTEBOOK_SCENE_DEFAULTS };
    let sceneViewOverride = openingSceneState.view;
    let sceneViewTransition = null;
    let sceneOrbitTransition = null;
    let sceneZoomFactor = NOTEBOOK_SCENE_DEFAULTS.zoom;
    // A view-only cell rotates around the existing orbit radius. The reference
    // view changes only when zoom is explicitly authored.
    let sceneZoomReferenceView = openingSceneState.view;
    let sceneZoomTransition = null;
    let sceneFieldMode = NOTEBOOK_SCENE_DEFAULTS.field;
    let focusedNames = new Set();
    let focusMode = 'soft';
    let hardFocusSourceId = null;
    let solutionSelection = null;
    let boardRowOperation = null;
    let boardAnnotation = null;

    const setBoardAnnotationFromCell = (cell, progress = 1) => {
      boardAnnotation = cell?.clear
        ? null
        : {
            kind: cell.kind,
            matrixName: cell.matrixName,
            row: cell.row,
            column: cell.column,
            progress: clamp01(progress),
          };
    };

    const setFocusFromCell = (cell) => {
      focusedNames = cell?.clear
        ? new Set()
        : new Set((cell?.names ?? []).map(notebookVariableKey));
      focusMode = cell?.clear ? 'soft' : (cell?.mode === 'hard' ? 'hard' : 'soft');
      hardFocusSourceId = focusMode === 'hard' && focusedNames.size
        ? String(cell?.id ?? `${cell?.lineStart ?? 'focus'}:${[...focusedNames].join(',')}`)
        : null;
    };

    const applyNotebookDimension = (value, localProgress = 1, animate = false) => {
      const nextMode = ['1d', '2d', '3d'].includes(value) ? value : currentDimensionMode;
      const nextIdentity = identityMatrixForMode(nextMode);
      const previousView = sceneViewOverride;
      const progress = clamp01(localProgress);
      currentDimensionMode = nextMode;
      currentDimensionIdentity = nextIdentity;
      sceneViewOverride = nextMode;
      if (animate && progress < 1) {
        sceneViewTransition = {
          from: previousView,
          to: nextMode,
          progress,
        };
        targetMatrix = [...nextIdentity];
        progressWithinCell = progress;
        return true;
      }
      startMatrix = [...nextIdentity];
      targetMatrix = [...nextIdentity];
      return false;
    };

    const applyNotebookScenePreset = (preset, localProgress = 1, animateCamera = false) => {
      if (!preset || typeof preset !== 'object') return;
      const progress = clamp01(localProgress);
      const previousPresetView = sceneViewOverride;
      if (preset.field === 'board' || preset.field === 'graph') {
        sceneFieldMode = preset.field;
      }
      const hasDimensionTransition = preset.dimension
        ? applyNotebookDimension(preset.dimension, progress, animateCamera)
        : false;
      if (preset.view) {
        sceneViewOverride = preset.view;
        if (animateCamera && progress < 1) {
          sceneViewTransition = {
            from: previousPresetView,
            to: preset.view,
            progress,
          };
        }
      }
      if (Number.isFinite(preset.zoom)) {
        const previousZoom = sceneZoomFactor;
        const previousZoomReferenceView = sceneZoomReferenceView;
        const nextZoomReferenceView = sceneViewOverride ?? currentDimensionMode;
        sceneZoomFactor = preset.zoom;
        sceneZoomReferenceView = nextZoomReferenceView;
        if (animateCamera && progress < 1) {
          sceneZoomTransition = {
            from: previousZoom,
            to: preset.zoom,
            referenceViewFrom: previousZoomReferenceView,
            referenceViewTo: nextZoomReferenceView,
            progress,
          };
        }
      }
      Object.keys(notebookSceneToggleAliases).forEach((command) => {
        if (Object.hasOwn(preset, command)) sceneToggleState[command] = Boolean(preset[command]);
      });
      return hasDimensionTransition;
    };

    const showNotebookMatrix = (entry) => {
      if (!entry?.name) return;
      const key = notebookVariableKey(entry.name);
      const previous = visibleNotebookMatrices.get(key);
      visibleNotebookMatrices.set(notebookVariableKey(entry.name), {
        name: entry.name,
        color: entry.color ?? NOTEBOOK_MATRIX_HEX,
        rows: entry.rows,
        columns: entry.columns,
        shapeValues: [...(entry.shapeValues ?? [])],
        slices: [...(previous?.slices ?? [])],
      });
    };

    const hideNotebookMatrix = (name) => {
      visibleNotebookMatrices.delete(notebookVariableKey(name));
    };

    const upsertNotebookEquation = (entry, options = {}) => {
      if (!entry?.name && options.allowAnonymous !== true) return null;
      const equationName = normalizeNotebookVariableName(entry.name, `L${equationLineItems.length + 1}`);
      if (!equationName) return null;
      const parsed = entry.coeffs
        ? entry
        : parsedEquationLine(entry.text ?? '');
      if (!parsed) return null;
      const nextEntry = {
        name: equationName,
        text: entry.text ?? formatEquationFromCoefficients(parsed.coeffs, parsed.value),
        coeffs: parsed.coeffs,
        value: parsed.value,
        color: entry.color ?? equationLineColors[equationLineItems.length % equationLineColors.length],
        dimension: entry.dimension ?? (Math.abs(parsed.coeffs[2]) > EPSILON ? 3 : 2),
      };
      const key = notebookVariableKey(equationName);
      notebookEquationEnv.set(key, nextEntry);
      if (options.reveal !== false) {
        const existingIndex = equationLineItems.findIndex((item) => notebookVariableKey(item.name) === key);
        if (existingIndex >= 0) equationLineItems[existingIndex] = nextEntry;
        else equationLineItems.push(nextEntry);
      }
      return nextEntry;
    };

    const removeNotebookEquation = (name) => {
      const key = notebookVariableKey(name);
      const index = equationLineItems.findIndex((item) => notebookVariableKey(item.name) === key);
      if (index >= 0) equationLineItems.splice(index, 1);
    };

    const upsertNotebookVector = (name, values, color, options = {}) => {
      if (!name && options.allowAnonymous !== true) return null;
      const vectorName = normalizeNotebookVariableName(name, `v${revealedVectors.length + 1}`);
      if (!vectorName) return null;
      const reveal = options.reveal ?? true;
      const key = notebookVariableKey(vectorName);
      const existingIndex = revealedVectors.findIndex((item) => notebookVariableKey(item.name) === key);
      const vectorIndex = existingIndex >= 0 ? existingIndex : revealedVectors.length;
      const previousVector = existingIndex >= 0
        ? revealedVectors[existingIndex]
        : notebookVectorEnv.get(key);
      const previousDimension = existingIndex >= 0
        ? revealedVectors[existingIndex]?.dimension
        : notebookVectorEnv.get(key)?.dimension;
      const visualKind = options.visualKind ?? previousVector?.visualKind ?? previousVector?.renderKind ?? 'arrow';
      const vectorDimension = Math.max(
        1,
        Math.min(3, Number(options.dimension ?? previousDimension ?? values.length ?? 3) || 3)
      );
      const nextVector = createVectorState(vectorIndex, {
        id: notebookVectorIdForName(vectorName, vectorIndex),
        name: vectorName,
        color: color ?? vectorPalette[vectorIndex % vectorPalette.length],
        dimension: vectorDimension,
        x: values[0] ?? '0',
        y: values[1] ?? '0',
        z: values[2] ?? '0',
        visible: true,
        renderKind: visualKind,
      });
      if (reveal) {
        if (existingIndex >= 0) revealedVectors[existingIndex] = nextVector;
        else revealedVectors.push(nextVector);
      }
      notebookVectorEnv.set(key, {
        name: vectorName,
        values: [nextVector.x, nextVector.y, nextVector.z],
        color: nextVector.color,
        dimension: vectorDimension,
        visualKind: nextVector.renderKind,
      });
      return nextVector;
    };

    const removeNotebookVector = (name) => {
      const key = notebookVariableKey(name);
      const index = revealedVectors.findIndex((item) => notebookVariableKey(item.name) === key);
      if (index >= 0) revealedVectors.splice(index, 1);
    };

    const revealNotebookMatrixSlice = (cell, options = {}) => {
      const matrixEntry = notebookMatrixEnv.get(notebookVariableKey(cell.matrixName));
      if (!matrixEntry) return null;
      const values = notebookMatrixSliceValues(matrixEntry, cell.axis, cell.sliceIndex);
      if (!values) return null;
      showNotebookMatrix(matrixEntry);
      const matrixKey = notebookVariableKey(matrixEntry.name);
      const visibleMatrix = visibleNotebookMatrices.get(matrixKey);
      if (visibleMatrix) {
        const sliceKey = `${cell.axis}:${cell.sliceIndex}:${notebookVariableKey(cell.name)}`;
        const slices = (visibleMatrix.slices ?? []).filter((item) => item.key !== sliceKey);
        slices.push({
          key: sliceKey,
          name: cell.name,
          axis: cell.axis,
          index: cell.sliceIndex,
          color: cell.color,
        });
        visibleNotebookMatrices.set(matrixKey, { ...visibleMatrix, slices });
      }
      return upsertNotebookVector(
        cell.name,
        values.map((value) => formatPresetInputValue(parseNumber(value))),
        cell.color,
        { reveal: options.reveal ?? true, dimension: cell.dimension }
      );
    };

    const evaluateNotebookCalculation = (cell) => {
      if (cell.operation === 'linearCombination') {
        const entries = (cell.terms ?? []).map((term) => ({
          term,
          vector: notebookVectorEnv.get(notebookVariableKey(term.name)),
        }));
        if (entries.length < 2 || entries.some((entry) => !entry.vector)) return null;
        const dimension = Math.max(...entries.map((entry) => entry.vector.dimension ?? 2));
        const sums = Array.from({ length: dimension }, (_, coordinateIndex) =>
          entries.reduce(
            (sum, entry) => sum + Number(entry.term.scalar ?? 1) * parseNumber(entry.vector.values[coordinateIndex] ?? 0),
            0
          )
        );
        const firstVector = entries[0].vector;
        const updatesFirst = notebookVariableKey(cell.name) === notebookVariableKey(firstVector.name);
        return {
          type: 'vector',
          values: sums.map(formatPresetInputValue),
          fromValues: updatesFirst
            ? firstVector.values
            : Array.from({ length: dimension }, () => '0'),
          dimension,
          color: updatesFirst ? firstVector.color : cell.color ?? firstVector.color,
        };
      }
      const leftKey = notebookVariableKey(cell.left);
      const rightKey = notebookVariableKey(cell.right);
      const leftMatrix = notebookMatrixEnv.get(leftKey);
      const rightMatrix = notebookMatrixEnv.get(rightKey);
      const leftVector = notebookVectorEnv.get(leftKey);
      const rightVector = notebookVectorEnv.get(rightKey);
      const leftEquation = notebookEquationEnv.get(leftKey);
      const rightEquation = notebookEquationEnv.get(rightKey);
      if (Number.isFinite(cell.leftScalar) && rightVector) {
        const updatesSource = notebookVariableKey(cell.name) === notebookVariableKey(rightVector.name);
        return {
          type: 'vector',
          values: rightVector.values.map((value) =>
            formatPresetInputValue(cell.leftScalar * parseNumber(value))
          ),
          fromValues: rightVector.values,
          dimension: rightVector.dimension,
          color: updatesSource ? rightVector.color : cell.color ?? rightVector.color,
        };
      }
      if (Number.isFinite(cell.rightScalar) && leftVector) {
        const updatesSource = notebookVariableKey(cell.name) === notebookVariableKey(leftVector.name);
        return {
          type: 'vector',
          values: leftVector.values.map((value) =>
            formatPresetInputValue(cell.rightScalar * parseNumber(value))
          ),
          fromValues: leftVector.values,
          dimension: leftVector.dimension,
          color: updatesSource ? leftVector.color : cell.color ?? leftVector.color,
        };
      }
      if (leftMatrix && rightVector) {
        return {
          type: 'vector',
          values: multiplyNotebookMatrixVector(leftMatrix, rightVector.values),
          dimension: notebookMatrixShape(leftMatrix).rows,
          color: cell.color ?? rightVector.color,
        };
      }
      if (leftMatrix && rightMatrix) {
        return multiplyNotebookMatrices(leftMatrix, rightMatrix);
      }
      if (rightMatrix && leftVector) {
        return {
          type: 'vector',
          values: multiplyNotebookMatrixVector(rightMatrix, leftVector.values),
          dimension: notebookMatrixShape(rightMatrix).rows,
          color: cell.color ?? leftVector.color,
        };
      }
      if (leftMatrix && rightEquation) {
        const result = transformNotebookEquation(rightEquation, leftMatrix);
        return result ? { ...result, color: cell.color ?? rightEquation.color } : null;
      }
      if (rightMatrix && leftEquation) {
        const result = transformNotebookEquation(leftEquation, rightMatrix);
        return result ? { ...result, color: cell.color ?? leftEquation.color } : null;
      }
      return null;
    };

    const matrixEntryForCell = (cell) => {
      const matrixMode = notebookMatrixModeFromText(cell.text, cell.mode);
      const rows = cell.rows ?? dimensionForMode(matrixMode);
      const columns = cell.columns ?? rows;
      const values = cell.values ?? matrixValuesFromNotebookText(cell.text, matrixMode);
      const shapeValues = Array.from({ length: rows * columns }, (_, index) =>
        formatPresetInputValue(parseNumber(values[index] ?? (index % (columns + 1) === 0 ? '1' : '0')))
      );
      return {
        name: cell.name,
        color: cell.color ?? NOTEBOOK_MATRIX_HEX,
        rows,
        columns,
        mode: operationModeForShape(rows, columns),
        shapeValues,
        values: operationMatrixFromInputValues(shapeValues, rows, columns),
      };
    };

    const setMatrixCalculation = (cell, result) => {
      if (result?.type !== 'matrix') return null;
      const entry = {
        name: cell.name,
        color: cell.color ?? result.color ?? NOTEBOOK_MATRIX_HEX,
        rows: result.rows,
        columns: result.columns,
        mode: result.mode,
        shapeValues: result.shapeValues,
        values: result.values,
      };
      if (cell.name) notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
      return entry;
    };

    const stageBoardRowOperation = (cell, resultEntry, localProgress = 1) => {
      const leftMatrix = notebookMatrixEnv.get(notebookVariableKey(cell.left));
      const rightMatrix = notebookMatrixEnv.get(notebookVariableKey(cell.right));
      const analysis = analyzeElementaryRowProduct(leftMatrix, rightMatrix, resultEntry);
      boardRowOperation = analysis
        ? {
            ...analysis,
            leftName: leftMatrix.name,
            rightName: rightMatrix.name,
            resultName: resultEntry.name,
            progress: clamp01(localProgress),
          }
        : null;
    };

    const upsertNotebookCalculationResult = (cell, result, options = {}) => {
      const localProgress = Number.isFinite(options.localProgress) ? clamp01(options.localProgress) : 1;
      const easedProgress = easeInOut(localProgress);
      if (result?.type === 'vector') {
        const key = cell.name ? notebookVariableKey(cell.name) : '';
        const previous = key ? notebookVectorEnv.get(key) : null;
        const fromValues = previous?.values ?? result.fromValues;
        const values = fromValues && localProgress < 1
          ? interpolateValueStrings(fromValues, result.values, easedProgress)
          : result.values;
        return upsertNotebookVector(cell.name, values, result.color, {
          reveal: cell.execute === true,
          dimension: result.dimension,
        });
      }
      if (result?.type === 'equation') {
        const key = cell.name ? notebookVariableKey(cell.name) : '';
        const previous = key ? notebookEquationEnv.get(key) : null;
        const target = { ...result, name: cell.name };
        const entry = previous && localProgress < 1
          ? interpolateEquationEntry(previous, target, easedProgress)
          : target;
        return upsertNotebookEquation(entry, { reveal: cell.execute === true });
      }
      if (result?.type === 'matrix') return setMatrixCalculation(cell, result);
      return null;
    };

    const seedNotebookEnvironmentCell = (cell) => {
      if (!cell || cell.remove) return;
      if (cell.type === 'equation') {
        (cell.environmentEquations ?? cell.equations ?? []).forEach((entry) =>
          upsertNotebookEquation(entry, { reveal: false })
        );
        return;
      }
      if (cell.type === 'vector') {
        upsertNotebookVector(cell.name, cell.values ?? ['0', '0', '0'], cell.color, {
          reveal: false,
          dimension: cell.dimension,
          visualKind: cell.visualKind,
        });
        return;
      }
      if (cell.type === 'slice') {
        revealNotebookMatrixSlice(cell, { reveal: false });
        return;
      }
      if (cell.type === 'matrix') {
        const entry = matrixEntryForCell(cell);
        notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
        return;
      }
      if (cell.type === 'calc') {
        const result = evaluateNotebookCalculation(cell);
        if (result?.type === 'vector' || result?.type === 'equation') {
          upsertNotebookCalculationResult({ ...cell, execute: false }, result, { localProgress: 1 });
        }
        if (result?.type === 'matrix') setMatrixCalculation(cell, result);
      }
    };

    if (hasLineMetadata) {
      const lastLineFromCells = Math.max(
        0,
        ...cells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
      );
      const sourceLineCount = Number.isFinite(options.lineCount)
        ? options.lineCount
        : notebookScript.lineCount;
      const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, sourceLineCount, lastLineFromCells + 1);
      const linePosition = (clamped / 100) * lineCount;
      const activeLine = notebookActiveLineIndexForCursor(clamped, lineCount);
      const activeByLine = activeLine < 0
        ? null
        : cells.find((cell, index) => {
            const start = Number.isFinite(cell.lineStart) ? cell.lineStart : index;
            const end = Number.isFinite(cell.lineEnd) ? cell.lineEnd : start;
            return activeLine >= start && activeLine <= end;
          });
      activeCell = activeByLine
        ?? [...cells].reverse().find((cell, reverseIndex) => {
          const originalIndex = cells.length - 1 - reverseIndex;
          const start = Number.isFinite(cell.lineStart) ? cell.lineStart : originalIndex;
          return activeLine >= 0 && start <= activeLine;
        })
        ?? null;

      let isInsidePartialMatrix = false;

      for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        const lineStart = Number.isFinite(cell.lineStart) ? cell.lineStart : index;
        const lineEnd = Number.isFinite(cell.lineEnd) ? cell.lineEnd : lineStart;
        const span = Math.max(1, lineEnd - lineStart + 1);
        const cellProgress = clamp01((linePosition - lineStart) / span);
        if (activeCell?.id === cell.id) activeCellProgress = cellProgress;
        // Cursor percentages often land a few floating-point ulps past an exact
        // line boundary. Do not let that reveal the first line after a checkpoint.
        const hasReachedCell = clamped >= 100 || linePosition > lineStart + 0.000001;
        if (!hasReachedCell) continue;
        if (cell.type === 'equation') seedNotebookEnvironmentCell(cell);
        if (cell.hidden) {
          seedNotebookEnvironmentCell(cell);
          continue;
        }

        if (cell.type === 'caption') {
          captionText = cell.remove ? '' : cell.text ?? '';
          continue;
        }

        if (cell.type === 'focus') {
          setFocusFromCell(cell);
          continue;
        }

        if (cell.type === 'boardAnnotation') {
          setBoardAnnotationFromCell(cell);
          continue;
        }

        if (cell.type === 'solution') {
          solutionSelection = cell.remove
            ? null
            : {
                name: cell.name,
                names: [...(cell.names ?? [])],
                progress: activeCell?.id === cell.id ? cellProgress : 1,
              };
          continue;
        }

          if (cell.type === 'scene') {
          if (cell.command === 'clear') {
            revealedVectors.splice(0, revealedVectors.length);
            equationLineItems.splice(0, equationLineItems.length);
            visibleNotebookMatrices.clear();
            captionText = '';
            focusedNames = new Set();
            focusMode = 'soft';
            hardFocusSourceId = null;
            solutionSelection = null;
            boardRowOperation = null;
            boardAnnotation = null;
          } else if (cell.command === 'dimension') {
            const isComplete = cellProgress >= 1 || clamped >= 100;
            const isTransitioning = applyNotebookDimension(cell.value, cellProgress, !isComplete);
            if (isTransitioning) {
              activeCell = cell;
              isInsidePartialMatrix = true;
              break;
            }
          } else if (cell.command === 'spaceReset') {
            const isComplete = cellProgress >= 1 || clamped >= 100;
            if (isComplete) {
              startMatrix = [...currentDimensionIdentity];
              targetMatrix = [...currentDimensionIdentity];
            } else {
              targetMatrix = [...currentDimensionIdentity];
              progressWithinCell = cellProgress;
              activeCell = cell;
              isInsidePartialMatrix = true;
              break;
            }
          } else if (cell.command === 'view') {
            const previousView = sceneViewOverride;
            sceneViewOverride = cell.value;
            if (activeCell?.id === cell.id && cellProgress < 1) {
              sceneViewTransition = {
                from: previousView,
                to: cell.value,
                progress: cellProgress,
              };
            }
          } else if (cell.command === 'orbit') {
            if (activeCell?.id === cell.id && cellProgress < 1) {
              sceneOrbitTransition = {
                view: sceneViewOverride ?? currentDimensionMode,
                progress: cellProgress,
              };
            }
          } else if (cell.command === 'zoom') {
            const previousZoom = sceneZoomFactor;
            const previousZoomReferenceView = sceneZoomReferenceView;
            const nextZoomReferenceView = sceneViewOverride ?? currentDimensionMode;
            sceneZoomFactor = cell.value;
            sceneZoomReferenceView = nextZoomReferenceView;
            if (activeCell?.id === cell.id && cellProgress < 1) {
              sceneZoomTransition = {
                from: previousZoom,
                to: cell.value,
                referenceViewFrom: previousZoomReferenceView,
                referenceViewTo: nextZoomReferenceView,
                progress: cellProgress,
              };
            }
          } else if (cell.command === 'field') {
            sceneFieldMode = cell.value === 'board' ? 'board' : 'graph';
          } else if (cell.command === 'preset') {
            const isTransitioning = applyNotebookScenePreset(
              cell.value,
              cellProgress,
              activeCell?.id === cell.id
            );
            if (isTransitioning) {
              activeCell = cell;
              isInsidePartialMatrix = true;
              break;
            }
          } else if (Object.hasOwn(sceneToggleState, cell.command)) {
            sceneToggleState[cell.command] = Boolean(cell.value);
          }
          continue;
        }

        if (cell.type === 'equation') {
          const sourceLines = cell.text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
          const lineLimit = clamped >= 100
            ? sourceLines.length
            : Math.max(1, Math.min(sourceLines.length, Math.floor(linePosition - lineStart) + 1));
          const equationItems = cell.equations?.length
            ? cell.equations
            : sourceLines.map((text, itemIndex) => {
                const parsed = parsedEquationLine(text);
                return parsed
                  ? {
                      name: `L${itemIndex + 1}`,
                      text,
                      coeffs: parsed.coeffs,
                      value: parsed.value,
                      color: equationLineColors[itemIndex % equationLineColors.length],
                    }
                  : null;
              }).filter(Boolean);
          equationItems.slice(0, lineLimit).forEach((item) => upsertNotebookEquation(item));
          continue;
        }

      if (cell.type === 'vector') {
        const values = cell.values ?? ['0', '0', '0'];
          if (cell.remove) {
            removeNotebookVector(cell.name);
            continue;
          }
          upsertNotebookVector(cell.name, values, cell.color, {
            reveal: cell.execute !== false,
            dimension: cell.dimension,
            visualKind: cell.visualKind,
          });
          continue;
        }

        if (cell.type === 'slice') {
          if (cell.remove) {
            removeNotebookVector(cell.name);
            continue;
          }
          revealNotebookMatrixSlice(cell);
          continue;
        }

        if (cell.type === 'calc') {
          if (cell.remove) {
            if (cell.resultKind === 'vector') removeNotebookVector(cell.name);
            if (cell.resultKind === 'equation') removeNotebookEquation(cell.name);
            continue;
          }
          const result = evaluateNotebookCalculation(cell);
          const localProgress = clamp01((linePosition - lineStart) / span);
          if (result?.type === 'vector') {
            upsertNotebookCalculationResult(cell, result, { localProgress });
          }
          if (result?.type === 'equation') {
            upsertNotebookCalculationResult(cell, result, { localProgress });
          }
          if (result?.type === 'matrix') {
            const entry = setMatrixCalculation(cell, result);
            if (entry && cell.execute === true) {
              showNotebookMatrix(entry);
              stageBoardRowOperation(cell, entry, localProgress);
            }
          }
          continue;
        }

        if (cell.type === 'ref') {
          if (cell.remove) {
            if (cell.refKind === 'vector') removeNotebookVector(cell.name);
            if (cell.refKind === 'equation') removeNotebookEquation(cell.name);
            if (cell.refKind === 'matrix') hideNotebookMatrix(cell.name);
            continue;
          }
          if (cell.refKind === 'matrix') {
            const previousView = sceneViewOverride;
            if (cell.synchronizedView) {
              sceneViewOverride = cell.synchronizedView;
              if (activeCell?.id === cell.id && cellProgress < 1) {
                sceneViewTransition = {
                  from: previousView,
                  to: cell.synchronizedView,
                  progress: cellProgress,
                };
              }
            }
            const entry = notebookMatrixEnv.get(notebookVariableKey(cell.name));
            if (entry) showNotebookMatrix(entry);
            if (cell.execute === false) continue;
            const localProgress = clamp01(linePosition - lineStart);
            const isComplete = localProgress >= 1 || clamped >= 100;
            if (entry && isComplete) {
              startMatrix = multiplyMatrix3(entry.values, startMatrix);
              targetMatrix = [...startMatrix];
            } else if (entry) {
              targetMatrix = multiplyMatrix3(entry.values, startMatrix);
              progressWithinCell = localProgress;
              activeCell = cell;
              isInsidePartialMatrix = true;
              break;
            }
          }
          if (cell.refKind === 'vector') {
            const entry = notebookVectorEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookVector(entry.name, entry.values, entry.color, {
              dimension: entry.dimension,
              visualKind: entry.visualKind,
            });
          }
          if (cell.refKind === 'equation') {
            const entry = notebookEquationEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookEquation(entry);
          }
          continue;
        }

        if (cell.type === 'matrix') {
          const entry = matrixEntryForCell(cell);
          const matrix = entry.values;
          const localProgress = clamp01((linePosition - lineStart) / span);
          const isComplete = localProgress >= 1 || clamped >= 100;
          if (cell.remove) {
            hideNotebookMatrix(cell.name);
            if (isComplete) notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
            continue;
          }
          showNotebookMatrix(entry);
          if (isComplete) {
            notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
          }
          if (cell.execute === true && isComplete) {
            startMatrix = multiplyMatrix3(matrix, startMatrix);
            targetMatrix = [...startMatrix];
          } else if (cell.execute === true) {
            targetMatrix = multiplyMatrix3(matrix, startMatrix);
            progressWithinCell = localProgress;
            activeCell = cell;
            isInsidePartialMatrix = true;
            break;
          }
        }
      }

      if (!isInsidePartialMatrix) {
        targetMatrix = [...startMatrix];
        progressWithinCell = 1;
      }
      equationText = equationLineItems.map(notebookEquationEntryText).join('\n');
      hasEquationText = equationLineItems.length > 0;
    } else {
      const scaled = (clamped / 100) * cells.length;
      const roundedBoundary = Math.round(scaled);
      const isCellBoundary = clamped > 0 && Math.abs(scaled - roundedBoundary) < 0.0001;
      const activeIndex = Math.min(
        cells.length - 1,
        Math.max(0, isCellBoundary ? roundedBoundary - 1 : Math.floor(scaled))
      );
      const localProgress = isCellBoundary
        ? 1
        : activeIndex === cells.length - 1
          ? Math.min(1, scaled - activeIndex)
          : scaled - activeIndex;
      activeCell = cells[activeIndex];
      activeCellProgress = clamp01(localProgress);

      for (let index = 0; index < activeIndex; index += 1) {
        const cell = cells[index];
        if (cell.hidden) continue;
        if (cell.type === 'scene' && cell.command === 'dimension') {
          applyNotebookDimension(cell.value);
          continue;
        }
        if (cell.type === 'scene' && cell.command === 'spaceReset') {
          startMatrix = [...currentDimensionIdentity];
          continue;
        }
        if (cell.type === 'scene' && cell.command === 'field') {
          sceneFieldMode = cell.value === 'board' ? 'board' : 'graph';
          continue;
        }
        if (cell.type === 'scene' && cell.command === 'preset') {
          applyNotebookScenePreset(cell.value);
          continue;
        }
        if (cell.type === 'focus') {
          setFocusFromCell(cell);
          continue;
        }
        if (cell.type === 'boardAnnotation') {
          setBoardAnnotationFromCell(cell);
          continue;
        }
        if (cell.type === 'solution') {
          solutionSelection = cell.remove
            ? null
            : { name: cell.name, names: [...(cell.names ?? [])], progress: 1 };
          continue;
        }
        if (cell.type === 'scene' && cell.command === 'clear') {
          focusedNames = new Set();
          focusMode = 'soft';
          hardFocusSourceId = null;
          solutionSelection = null;
          boardRowOperation = null;
          boardAnnotation = null;
        }
        if (cell.type === 'caption') {
          captionText = cell.remove ? '' : cell.text ?? '';
        }
        if (cell.type === 'equation') {
          const sourceLines = cell.text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
          const equationItems = cell.equations?.length
            ? cell.equations
            : sourceLines.map((text, itemIndex) => {
                const parsed = parsedEquationLine(text);
                return parsed
                  ? {
                      name: `L${itemIndex + 1}`,
                      text,
                      coeffs: parsed.coeffs,
                      value: parsed.value,
                      color: equationLineColors[itemIndex % equationLineColors.length],
                    }
                  : null;
              }).filter(Boolean);
          equationItems.forEach((item) => upsertNotebookEquation(item));
        }
        if (cell.type === 'matrix') {
          const entry = matrixEntryForCell(cell);
          if (cell.remove) {
            hideNotebookMatrix(cell.name);
            notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
            continue;
          }
          showNotebookMatrix(entry);
          notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
          if (cell.execute === true) startMatrix = multiplyMatrix3(entry.values, startMatrix);
        }
        if (cell.type === 'vector') {
          if (cell.remove) {
            removeNotebookVector(cell.name);
            continue;
          }
          upsertNotebookVector(cell.name, cell.values ?? ['0', '0', '0'], cell.color, {
            reveal: cell.execute !== false,
            dimension: cell.dimension,
            visualKind: cell.visualKind,
          });
        }
        if (cell.type === 'slice') {
          if (cell.remove) removeNotebookVector(cell.name);
          else revealNotebookMatrixSlice(cell);
        }
        if (cell.type === 'calc') {
          if (cell.remove) {
            if (cell.resultKind === 'vector') removeNotebookVector(cell.name);
            if (cell.resultKind === 'equation') removeNotebookEquation(cell.name);
            continue;
          }
          const result = evaluateNotebookCalculation(cell);
          if (result?.type === 'vector') {
            upsertNotebookCalculationResult(cell, result, { localProgress: 1 });
          }
          if (result?.type === 'equation') {
            upsertNotebookCalculationResult(cell, result, { localProgress: 1 });
          }
          if (result?.type === 'matrix') {
            const entry = setMatrixCalculation(cell, result);
            if (entry && cell.execute === true) {
              showNotebookMatrix(entry);
              stageBoardRowOperation(cell, entry, 1);
            }
          }
        }
        if (cell.type === 'ref') {
          if (cell.remove) {
            if (cell.refKind === 'vector') removeNotebookVector(cell.name);
            if (cell.refKind === 'equation') removeNotebookEquation(cell.name);
            if (cell.refKind === 'matrix') hideNotebookMatrix(cell.name);
          } else if (cell.refKind === 'matrix') {
            if (cell.synchronizedView) sceneViewOverride = cell.synchronizedView;
            const entry = notebookMatrixEnv.get(notebookVariableKey(cell.name));
            if (entry) {
              showNotebookMatrix(entry);
              if (cell.execute !== false) {
                startMatrix = multiplyMatrix3(entry.values, startMatrix);
              }
            }
          } else if (cell.refKind === 'vector') {
            const entry = notebookVectorEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookVector(entry.name, entry.values, entry.color, {
              dimension: entry.dimension,
              visualKind: entry.visualKind,
            });
          } else if (cell.refKind === 'equation') {
            const entry = notebookEquationEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookEquation(entry);
          }
        }
      }

      targetMatrix = [...startMatrix];
      if (!activeCell || activeCell.hidden) {
        progressWithinCell = 1;
      } else if (activeCell.type === 'focus') {
        setFocusFromCell(activeCell);
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'boardAnnotation') {
        setBoardAnnotationFromCell(activeCell, localProgress);
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'solution') {
        solutionSelection = activeCell.remove
          ? null
          : {
              name: activeCell.name,
              names: [...(activeCell.names ?? [])],
              progress: localProgress,
            };
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'scene' && activeCell.command === 'dimension') {
        applyNotebookDimension(activeCell.value, localProgress, true);
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'scene' && activeCell.command === 'spaceReset') {
        targetMatrix = [...currentDimensionIdentity];
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'scene' && activeCell.command === 'field') {
        sceneFieldMode = activeCell.value === 'board' ? 'board' : 'graph';
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'scene' && activeCell.command === 'orbit') {
        sceneOrbitTransition = {
          view: sceneViewOverride ?? currentDimensionMode,
          progress: localProgress,
        };
        progressWithinCell = localProgress;
      } else if (activeCell.type === 'scene' && activeCell.command === 'preset') {
        applyNotebookScenePreset(activeCell.value, localProgress, true);
      } else if (activeCell.type === 'equation') {
        const sourceLines = activeCell.text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
        const equationItems = activeCell.equations?.length
          ? activeCell.equations
          : sourceLines.map((text, itemIndex) => {
              const parsed = parsedEquationLine(text);
              return parsed
                ? {
                    name: `L${itemIndex + 1}`,
                    text,
                    coeffs: parsed.coeffs,
                    value: parsed.value,
                    color: equationLineColors[itemIndex % equationLineColors.length],
                  }
                : null;
            }).filter(Boolean);
        equationItems.forEach((item) => upsertNotebookEquation(item));
      } else if (activeCell.type === 'caption') {
        captionText = activeCell.remove ? '' : activeCell.text ?? '';
      }
      if (activeCell?.type === 'vector') {
        const values = activeCell.values ?? ['0', '0', '0'];
        if (activeCell.remove) removeNotebookVector(activeCell.name);
        else upsertNotebookVector(activeCell.name, values, activeCell.color, {
          reveal: activeCell.execute !== false,
          dimension: activeCell.dimension,
          visualKind: activeCell.visualKind,
        });
      }
      if (activeCell?.type === 'slice') {
        if (activeCell.remove) removeNotebookVector(activeCell.name);
        else revealNotebookMatrixSlice(activeCell);
      }
      if (activeCell?.type === 'calc') {
        if (activeCell.remove) {
          if (activeCell.resultKind === 'vector') removeNotebookVector(activeCell.name);
          if (activeCell.resultKind === 'equation') removeNotebookEquation(activeCell.name);
        } else {
        const result = evaluateNotebookCalculation(activeCell);
        if (result?.type === 'vector') {
          upsertNotebookCalculationResult(activeCell, result, { localProgress });
        }
        if (result?.type === 'equation') {
          upsertNotebookCalculationResult(activeCell, result, { localProgress });
        }
        if (result?.type === 'matrix') {
          const entry = setMatrixCalculation(activeCell, result);
          if (entry && activeCell.execute === true) {
            showNotebookMatrix(entry);
            stageBoardRowOperation(activeCell, entry, localProgress);
          }
        }
        }
      }
      if (activeCell?.type === 'matrix') {
        const entry = matrixEntryForCell(activeCell);
        if (activeCell.remove) {
          hideNotebookMatrix(activeCell.name);
          notebookMatrixEnv.set(notebookVariableKey(activeCell.name), entry);
        } else {
          showNotebookMatrix(entry);
          notebookMatrixEnv.set(notebookVariableKey(activeCell.name), entry);
        if (activeCell.execute === true) {
          targetMatrix = multiplyMatrix3(entry.values, startMatrix);
          progressWithinCell = localProgress;
        }
        }
      }
      if (activeCell?.type === 'ref') {
        if (activeCell.remove) {
          if (activeCell.refKind === 'vector') removeNotebookVector(activeCell.name);
          if (activeCell.refKind === 'equation') removeNotebookEquation(activeCell.name);
          if (activeCell.refKind === 'matrix') hideNotebookMatrix(activeCell.name);
        } else if (activeCell.refKind === 'matrix') {
          const previousView = sceneViewOverride;
          if (activeCell.synchronizedView) {
            sceneViewOverride = activeCell.synchronizedView;
            if (localProgress < 1) {
              sceneViewTransition = {
                from: previousView,
                to: activeCell.synchronizedView,
                progress: localProgress,
              };
            }
          }
          const entry = notebookMatrixEnv.get(notebookVariableKey(activeCell.name));
          if (entry) {
            showNotebookMatrix(entry);
            if (activeCell.execute !== false) {
              targetMatrix = multiplyMatrix3(entry.values, startMatrix);
              progressWithinCell = localProgress;
            }
          }
        } else if (activeCell.refKind === 'vector') {
          const entry = notebookVectorEnv.get(notebookVariableKey(activeCell.name));
          if (entry) upsertNotebookVector(entry.name, entry.values, entry.color, {
            dimension: entry.dimension,
            visualKind: entry.visualKind,
          });
        } else if (activeCell.refKind === 'equation') {
          const entry = notebookEquationEnv.get(notebookVariableKey(activeCell.name));
          if (entry) upsertNotebookEquation(entry);
        }
      }
    }

    if (syncUi) setNotebookFieldMode(sceneFieldMode);
    if (workspaceModeRef.current === 'system') {
      if (syncUi) setShowAxes(sceneToggleState.axes);
      uiStateRef.current.showAxes = sceneToggleState.axes;
      if (syncUi) setShowRelativeAxes(sceneToggleState.relativeAxes);
      uiStateRef.current.showRelativeAxes = sceneToggleState.relativeAxes;
      if (syncUi) setShowGrid(sceneToggleState.grid);
      uiStateRef.current.showGrid = sceneToggleState.grid;
      if (syncUi) setShowRelativeGrid(sceneToggleState.relativeGrid);
      uiStateRef.current.showRelativeGrid = sceneToggleState.relativeGrid;
      if (syncUi) setShowCoordinates(sceneToggleState.coordinates);
      uiStateRef.current.showCoordinateNumbers = sceneToggleState.coordinates;
      if (syncUi) setShowBasis(sceneToggleState.basis);
      uiStateRef.current.showBasis = sceneToggleState.basis;
      if (syncUi) setShowVector(sceneToggleState.vectors);
      uiStateRef.current.showVector = sceneToggleState.vectors;
    }
    uiStateRef.current.notebookActiveCellId = activeCell?.id ?? null;
    uiStateRef.current.notebookActiveCellProgress = activeCellProgress;
    uiStateRef.current.notebookSolutionSelection = solutionSelection;
    const nextHardFocusSourceId = focusMode === 'hard' && focusedNames.size
      ? hardFocusSourceId
      : null;
    if (nextHardFocusSourceId) {
      if (uiStateRef.current.notebookHardFocusSourceId !== nextHardFocusSourceId) {
        uiStateRef.current.notebookHardFocusExpiresAt =
          (globalThis.performance?.now?.() ?? Date.now()) +
          NOTEBOOK_AUTHORED_HARD_FOCUS_COMPARE_MS;
      }
    } else {
      uiStateRef.current.notebookHardFocusExpiresAt = 0;
    }
    uiStateRef.current.notebookHardFocusSourceId = nextHardFocusSourceId;
    uiStateRef.current.notebookFocusedNames = new Set(focusedNames);
    uiStateRef.current.notebookFocusMode = focusMode;

    equationText = equationLineItems.map(notebookEquationEntryText).join('\n');
    hasEquationText = equationLineItems.length > 0;
    revealedVectors.forEach((item) => {
      const focused = focusedNames.has(notebookVariableKey(item.name));
      item.focused = focused;
      item.dimmed = false;
    });
    const visibleSourceMode = currentDimensionMode;
    const contentAutoCameraView = outputModeForSystemMode(visibleSourceMode, targetMatrix);
    const nextAutoCameraView = sceneViewOverride ?? contentAutoCameraView;
    const matrixCameraViewFrom = outputModeForSystemMode(visibleSourceMode, startMatrix);
    const matrixCameraViewTo = nextAutoCameraView;
    const previousAutoCameraView = autoCameraTargetViewRef.current;
    let cameraViewFrom = matrixCameraViewFrom;
    let cameraViewTo = matrixCameraViewTo;
    let cameraProgressOverride = null;
    const activeCameraCellId = activeCell?.id ?? 'none';
    if (
      workspaceModeRef.current === 'system' &&
      matrixCameraViewFrom === matrixCameraViewTo &&
      previousAutoCameraView
    ) {
      const existingTransition = notebookCameraTransitionRef.current;
      if (
        existingTransition &&
        existingTransition.cellId === activeCameraCellId &&
        existingTransition.to === nextAutoCameraView
      ) {
        cameraViewFrom = existingTransition.from;
        cameraViewTo = existingTransition.to;
        cameraProgressOverride = activeCellProgress;
      } else if (previousAutoCameraView !== nextAutoCameraView) {
        notebookCameraTransitionRef.current = {
          cellId: activeCameraCellId,
          from: previousAutoCameraView,
          to: nextAutoCameraView,
        };
        cameraViewFrom = previousAutoCameraView;
        cameraViewTo = nextAutoCameraView;
        cameraProgressOverride = activeCellProgress;
      } else {
        notebookCameraTransitionRef.current = null;
      }
    } else if (matrixCameraViewFrom !== matrixCameraViewTo) {
      notebookCameraTransitionRef.current = null;
    }
    if (scriptHasViewCommand) {
      cameraViewFrom = sceneViewTransition?.from ?? sceneViewOverride ?? contentAutoCameraView;
      cameraViewTo = sceneViewTransition?.to ?? sceneViewOverride ?? contentAutoCameraView;
      cameraProgressOverride = sceneViewTransition?.progress ?? 1;
      notebookCameraTransitionRef.current = null;
    }
    notebookAutoCameraViewRef.current = nextAutoCameraView;
    autoCameraTargetViewRef.current = nextAutoCameraView;

    const normalizedEquationText = equationText.replace(/\r/g, '');
    const nextEquationLines = normalizedEquationText === '' ? [''] : normalizedEquationText.split('\n');
    const nextEquationModeHint = equationLineItems.some((item) => (item.dimension ?? 2) >= 3)
      ? '3d'
      : null;
    const nextEquationVisualKey = `${nextEquationModeHint ?? 'auto'}:${normalizedEquationText}`;
    if (notebookEquationVisualKeyRef.current !== nextEquationVisualKey) {
      notebookEquationVisualKeyRef.current = nextEquationVisualKey;
      lineSystemRef.current = analyzeEquationGeometry(nextEquationLines, nextEquationModeHint);
      // Keep the last committed equation scene mounted until the React-owned
      // line system replaces it. Clearing a non-empty scene here creates an
      // observable blank frame and drops the settled reveal time of equations
      // that remain present while a later equation is entering.
      if (equationLineItems.length === 0) {
        const refs = threeRef.current;
        if (refs?.equationGroup) clearEquationGroup(refs.equationGroup);
        if (refs?.equationPoint) {
          refs.equationPoint.userData.visible = false;
          refs.equationPoint.visible = false;
        }
        equationLabelRefs.current.forEach((label) => {
          if (label) label.style.display = 'none';
        });
        if (equationSolutionLabelRef.current) equationSolutionLabelRef.current.style.display = 'none';
      }
    }

    const nextSceneMatrices = [...visibleNotebookMatrices.values()];
    if (syncUi) {
      setNotebookCursor(clamped);
      setActiveNotebookCellId(activeCell?.id ?? null);
      setActiveNotebookCaption(captionText);
      if (hasLineMetadata || hasEquationText) {
        setNotebookEquationModeHint(nextEquationModeHint);
        setEquations(nextEquationLines);
      }
      setNotebookSceneMatrices((previous) => {
        const same = previous.length === nextSceneMatrices.length && previous.every((item, index) => {
          const next = nextSceneMatrices[index];
          return next &&
            item.name === next.name &&
            item.color === next.color &&
            item.rows === next.rows &&
            item.columns === next.columns &&
            item.shapeValues.length === next.shapeValues.length &&
            item.shapeValues.every((value, valueIndex) => value === next.shapeValues[valueIndex]) &&
            (item.slices?.length ?? 0) === (next.slices?.length ?? 0) &&
            (item.slices ?? []).every((slice, sliceIndex) => {
              const nextSlice = next.slices?.[sliceIndex];
              return nextSlice &&
                slice.key === nextSlice.key &&
                slice.color === nextSlice.color;
            });
        });
        return same ? previous : nextSceneMatrices;
      });
      setNotebookBoardOperation((previous) =>
        sameNotebookBoardProgressState(previous, boardRowOperation) ? previous : boardRowOperation
      );
      setNotebookBoardAnnotation((previous) =>
        sameNotebookBoardProgressState(previous, boardAnnotation) ? previous : boardAnnotation
      );
    }
    if (scriptHasVectorCells) {
      // A bare notebook matrix action deforms the grid, basis, and tracked
      // vectors as one space. Keep every object on the exact eased matrix
      // progress used by setMatrixAtProgress; linear vector progress makes the
      // arrow visibly chase the grid near the start and end of the cell.
      const easedMatrixProgress = easeInOut(progressWithinCell);
      const notebookVectorMatrix = startMatrix.map((value, matrixIndex) =>
        value + easedMatrixProgress * (targetMatrix[matrixIndex] - value)
      );
      notebookVectorTransformRef.current = [...notebookVectorMatrix];
      vectorsRef.current = revealedVectors.map((item) => ({
        ...item,
        colorHex: colorToHex(item.color),
        values: [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)],
        scalarValue: parseNumber(item.scalar),
      }));
      activeVectorIdRef.current = revealedVectors.at(-1)?.id ?? null;
      if (syncUi) {
        setVectors((previous) => {
          const same = previous.length === revealedVectors.length && previous.every((item, index) => {
            const next = revealedVectors[index];
            return (
              next &&
              item.id === next.id &&
              item.name === next.name &&
              item.color === next.color &&
              item.x === next.x &&
              item.y === next.y &&
              item.z === next.z &&
              item.renderKind === next.renderKind &&
              item.visible === next.visible &&
              item.focused === next.focused &&
              item.dimmed === next.dimmed
            );
          });
          return same ? previous : revealedVectors;
        });
        setActiveVectorId(revealedVectors.at(-1)?.id ?? null);
      }
    } else {
      notebookVectorTransformRef.current = [...currentDimensionIdentity];
    }

    if (options.animate) {
      const easedLocal = easeInOut(progressWithinCell);
      const desiredMatrix = startMatrix.map((value, matrixIndex) =>
        value + easedLocal * (targetMatrix[matrixIndex] - value)
      );
      startMatrixRef.current = [...currentMatrixRef.current];
      targetMatrixRef.current = desiredMatrix;
      animationViewFromRef.current =
        workspaceModeRef.current === 'system'
          ? outputModeForSystemMode(visibleSourceMode, currentMatrixRef.current)
          : viewKeyForMatrix(currentMatrixRef.current);
      animationViewToRef.current =
        workspaceModeRef.current === 'system'
          ? outputModeForSystemMode(visibleSourceMode, desiredMatrix)
          : viewKeyForMatrix(desiredMatrix);
      animationStartRef.current = null;
      lastUiSyncRef.current = 0;
      isAnimatingRef.current = true;
      if (syncUi) {
        setProgress(0);
        setBasisControlMatrix(desiredMatrix);
      }
      return;
    }

    stopAutoAnimation();
    startMatrixRef.current = [...startMatrix];
    targetMatrixRef.current = [...targetMatrix];
    animationViewFromRef.current =
      workspaceModeRef.current === 'system' ? cameraViewFrom : viewKeyForMatrix(startMatrix);
    animationViewToRef.current =
      workspaceModeRef.current === 'system' ? cameraViewTo : viewKeyForMatrix(targetMatrix);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    cameraProgressOverrideRef.current = cameraProgressOverride;
    setMatrixAtProgress(progressWithinCell, { syncUi });
    cameraProgressOverrideRef.current = null;
    const activeCellHasExplicitCamera = Boolean(
      activeCell?.type === 'scene' && (
        ['dimension', 'view', 'zoom', 'orbit'].includes(activeCell.command) ||
        (
          activeCell.command === 'preset' &&
          (activeCell.value?.dimension || activeCell.value?.view || Number.isFinite(activeCell.value?.zoom))
        )
      )
    ) || Boolean(activeCell?.type === 'ref' && activeCell.synchronizedView);
    if (!options.preserveCameraUntilExplicit || activeCellHasExplicitCamera) {
      setNotebookCameraDirective({
        viewFrom: scriptHasViewCommand
          ? sceneViewTransition?.from ?? sceneViewOverride ?? contentAutoCameraView
          : null,
        viewTo: scriptHasViewCommand
          ? sceneViewTransition?.to ?? sceneViewOverride ?? contentAutoCameraView
          : null,
        viewProgress: sceneViewTransition?.progress ?? 1,
        hasZoom: scriptHasZoomCommand,
        zoomFrom: sceneZoomTransition?.from ?? sceneZoomFactor,
        zoomTo: sceneZoomTransition?.to ?? sceneZoomFactor,
        zoomReferenceViewFrom:
          sceneZoomTransition?.referenceViewFrom ?? sceneZoomReferenceView,
        zoomReferenceViewTo:
          sceneZoomTransition?.referenceViewTo ?? sceneZoomReferenceView,
        zoomProgress: sceneZoomTransition?.progress ?? 1,
        hasOrbit: Boolean(sceneOrbitTransition),
        orbitView: sceneOrbitTransition?.view,
        orbitProgress: sceneOrbitTransition?.progress ?? 0,
      }, { syncUi });
    }
  }, [notebookScript.cells, notebookScript.lineCount, notebookScript.mode, setMatrixAtProgress, setNotebookCameraDirective, stopAutoAnimation]);

  const runNotebookCell = useCallback((cellId) => {
    const index = notebookCells.findIndex((cell) => cell.id === cellId);
    if (index < 0) return;
    const cursor = ((index + 1) / notebookCells.length) * 100;
    applyNotebookCursor(cursor, notebookCells);
  }, [applyNotebookCursor, notebookCells]);

  const cancelNotebookPlayback = useCallback(() => {
    if (notebookPlaybackFrameRef.current) {
      window.cancelAnimationFrame(notebookPlaybackFrameRef.current);
      notebookPlaybackFrameRef.current = null;
    }
    cameraProgressOverrideRef.current = null;
    notebookCameraTransitionRef.current = null;
    lastNotebookUiSyncRef.current = 0;
    setNotebookPlaying(false);
  }, []);

  useEffect(() => {
    const pendingInsertion = pendingNotebookUiInsertionRef.current;
    if (!pendingInsertion) return;
    pendingNotebookUiInsertionRef.current = null;

    cancelNotebookPlayback();
    setNotebookCheckpoint(null);
    const parsed = parseNotebookScript(notebookText);
    const lastLineFromCells = Math.max(
      0,
      ...parsed.cells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
    );
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, parsed.lineCount, lastLineFromCells + 1);
    const insertedLineIndex = Math.max(
      0,
      Math.min(lineCount - 1, Number(pendingInsertion.lineIndex) || 0)
    );
    const cursorAfterInsertedCell = Math.min(100, ((insertedLineIndex + 1) / lineCount) * 100);
    applyNotebookCursor(cursorAfterInsertedCell, parsed.cells, { lineCount: parsed.lineCount });
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookText]);

  const playNotebookCursorRange = useCallback((
    startCursor,
    endCursor,
    sourceCells = notebookScript.cells,
    duration = 900,
    onComplete,
    sourceLineCount = notebookScript.lineCount,
    playbackOptions = {}
  ) => {
    cancelNotebookPlayback();
    setNotebookCuedLineIndex(null);
    const startValue = Math.max(0, Math.min(100, Number(startCursor) || 0));
    if (startValue <= 0.001 && workspaceModeRef.current === 'system') {
      cameraProgressOverrideRef.current = null;
      notebookCameraTransitionRef.current = null;
      notebookAutoCameraViewRef.current = NOTEBOOK_SCENE_DEFAULTS.view;
      autoCameraTargetViewRef.current = NOTEBOOK_SCENE_DEFAULTS.view;
      animationViewFromRef.current = NOTEBOOK_SCENE_DEFAULTS.view;
      animationViewToRef.current = NOTEBOOK_SCENE_DEFAULTS.view;
    }
    const lastLineFromCells = Math.max(
      0,
      ...sourceCells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
    );
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, sourceLineCount, lastLineFromCells + 1);
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const effectiveSegments = buildNotebookPlaybackSegments({
      startCursor: startValue,
      endCursor,
      sourceCells,
      lineCount,
      duration,
      speed,
    });
    const totalDuration = effectiveSegments.reduce((sum, segment) => sum + segment.duration, 0);
    let startTime = null;
    const cursorOptions = {
      lineCount,
      preserveCameraUntilExplicit: playbackOptions.preserveCameraUntilExplicit === true,
    };
    applyNotebookCursor(startValue, sourceCells, cursorOptions);
    lastNotebookUiSyncRef.current = globalThis.performance?.now?.() ?? Date.now();
    setNotebookPlaying(true);

    const tick = (time) => {
      if (startTime === null) startTime = time;
      const elapsed = Math.min(totalDuration, time - startTime);
      let passed = 0;
      let currentSegment = effectiveSegments[effectiveSegments.length - 1];
      for (const segment of effectiveSegments) {
        if (elapsed <= passed + segment.duration) {
          currentSegment = segment;
          break;
        }
        passed += segment.duration;
      }
      const segmentRatio = currentSegment.duration > 0
        ? Math.min(1, Math.max(0, (elapsed - passed) / currentSegment.duration))
        : 1;
      const syncUi = elapsed >= totalDuration || time - lastNotebookUiSyncRef.current >= NOTEBOOK_UI_SYNC_MS;
      if (syncUi) lastNotebookUiSyncRef.current = time;
      applyNotebookCursor(
        currentSegment.from + segmentRatio * (currentSegment.to - currentSegment.from),
        sourceCells,
        syncUi ? cursorOptions : { ...cursorOptions, syncUi: false }
      );
      if (elapsed < totalDuration) {
        notebookPlaybackFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        notebookPlaybackFrameRef.current = null;
        cameraProgressOverrideRef.current = null;
        notebookCameraTransitionRef.current = null;
        // Finish the current run before exposing a checkpoint. If the callback
        // starts another range, that new run will set this back to true.
        setNotebookPlaying(false);
        onComplete?.();
      }
    };

    notebookPlaybackFrameRef.current = window.requestAnimationFrame(tick);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells, notebookScript.lineCount, notebookSpeed]);

  const playNotebookToNextStop = useCallback((
    rawStartCursor,
    sourceCells,
    sourceLineCount,
    options = {}
  ) => {
    const lineCount = notebookPlaybackLineCount(
      sourceCells,
      sourceLineCount,
      NOTEBOOK_MIN_VISIBLE_LINES
    );
    const playbackStops = notebookPlaybackStops(
      sourceCells,
      sourceLineCount,
      NOTEBOOK_MIN_VISIBLE_LINES
    );
    const afterStopIndex = options.afterStopId
      ? sourceCells.findIndex((cell) => cell.id === options.afterStopId)
      : -1;
    const stopCursor = playbackStops.find(
      (item) => item.cell.id === options.afterStopId
    )?.cursor ?? null;
    const rawClampedCursor = Math.max(0, Math.min(100, Number(rawStartCursor) || 0));
    const startCursor = afterStopIndex >= 0
      ? Math.min(100, Math.max(rawClampedCursor, (stopCursor ?? rawClampedCursor) + 0.001))
      : rawClampedCursor >= 99.8
        ? 0
        : rawClampedCursor;
    const nextStop = options.targetStopId
      ? playbackStops.find((item) => item.cell.id === options.targetStopId)
      : playbackStops.find((item) => afterStopIndex >= 0
          ? item.index > afterStopIndex
          : item.cursor > startCursor + 0.01);
    const endCursor = nextStop?.cursor ?? 100;
    const remainingRatio = Math.max(0.08, (endCursor - startCursor) / 100);
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const duration = (Math.max(900, Math.min(5600, sourceLineCount * 420)) * remainingRatio) / speed;
    playNotebookCursorRange(
      startCursor,
      endCursor,
      sourceCells,
      duration,
      nextStop
        ? () => setNotebookCheckpoint({
            cellId: nextStop.cell.id,
            cursor: nextStop.cursor,
            kind: nextStop.cell.type,
          })
        : () => {
            setNotebookCheckpoint(null);
            setNotebookCompleted(true);
          },
      sourceLineCount,
      { preserveCameraUntilExplicit: afterStopIndex >= 0 }
    );
  }, [notebookSpeed, playNotebookCursorRange]);

  const runSmartNotebook = useCallback((options = {}) => {
    const rawStartCursor = Number.isFinite(options.startCursor)
      ? options.startCursor
      : notebookCursor;
    playNotebookToNextStop(
      rawStartCursor,
      notebookScript.cells,
      notebookScript.lineCount,
      { afterStopId: options.afterStopId }
    );
  }, [notebookCursor, notebookScript.cells, notebookScript.lineCount, playNotebookToNextStop]);

  const restoreNotebookStopCamera = useCallback((onRestored) => {
    const refs = threeRef.current;
    const snapshot = notebookStopCameraRef.current;
    if (
      !refs ||
      !snapshot ||
      snapshot.cellId !== notebookActiveReviewStopId ||
      cameraLockedRef.current
    ) {
      onRestored?.();
      return;
    }

    const alreadyRestored = (
      refs.camera.position.distanceToSquared(snapshot.position) < 0.000001 &&
      refs.controls.target.distanceToSquared(snapshot.target) < 0.000001
    );
    if (alreadyRestored) {
      if (snapshot.view) {
        configureControlsForView(refs.controls, snapshot.view, controlLocksFromRefs());
        setActiveView(snapshot.view);
      }
      onRestored?.();
      return;
    }

    notebookStopCameraRestorePendingRef.current = true;
    cameraMoveRef.current = {
      active: true,
      startTime: null,
      duration: 560,
      positionFrom: refs.camera.position.clone(),
      targetFrom: refs.controls.target.clone(),
      positionTo: snapshot.position.clone(),
      targetTo: snapshot.target.clone(),
      onComplete: () => {
        notebookStopCameraRestorePendingRef.current = false;
        if (snapshot.view) {
          configureControlsForView(refs.controls, snapshot.view, controlLocksFromRefs());
          setActiveView(snapshot.view);
        }
        queueCameraShareUpdate(0);
        onRestored?.();
      },
    };
  }, [controlLocksFromRefs, notebookActiveReviewStopId, queueCameraShareUpdate]);

  const playNotebookMatrixCell = useCallback((cell, options = {}) => {
    if (
      !cell ||
      (
        cell.type !== 'matrix' &&
        !(cell.type === 'calc' && cell.resultKind === 'matrix') &&
        !(cell.type === 'ref' && cell.refKind === 'matrix')
      )
    ) return;
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, (cell.lineEnd ?? 0) + 1);
    const startCursor = ((cell.lineStart ?? 0) / lineCount) * 100;
    const endCursor = (((cell.lineEnd ?? cell.lineStart ?? 0) + 1) / lineCount) * 100;
    const span = Math.max(1, (cell.lineEnd ?? cell.lineStart ?? 0) - (cell.lineStart ?? 0) + 1);
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const duration = Math.max(520, Math.min(2600, span * 420)) / speed;
    const continueToEnd = Boolean(options.continueToEnd);
    const playRestOfNotebook = () => {
      if (!continueToEnd || endCursor >= 99.8) return;
      playNotebookToNextStop(endCursor, notebookScript.cells, notebookScript.lineCount);
    };
    playNotebookCursorRange(startCursor, endCursor, notebookScript.cells, duration, playRestOfNotebook);
  }, [notebookScript.cells, notebookScript.lineCount, notebookSpeed, playNotebookCursorRange, playNotebookToNextStop]);

  const cueSmartNotebookAtLine = useCallback((lineIndex) => {
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, lineIndex + 1);
    const startCursor = notebookCursorForLineStart(lineIndex, lineCount);
    if (notebookCuedLineIndex === lineIndex) {
      setNotebookCuedLineIndex(null);
      setNotebookCheckpoint(null);
      setNotebookCompleted(false);
      runSmartNotebook({ startCursor });
      return;
    }
    cancelNotebookPlayback();
    setNotebookCuedLineIndex(lineIndex);
    setNotebookCheckpoint(null);
    setNotebookCompleted(false);
    applyNotebookCursor(
      startCursor,
      notebookScript.cells,
      { lineCount: notebookScript.lineCount }
    );
  }, [
    applyNotebookCursor,
    cancelNotebookPlayback,
    notebookCuedLineIndex,
    notebookScript.cells,
    notebookScript.lineCount,
    runSmartNotebook,
  ]);

  const toggleSmartNotebookPlayback = useCallback(() => {
    setNotebookCuedLineIndex(null);
    if (notebookCheckpoint) {
      if (notebookStopCameraRestorePendingRef.current) return;
      const resumeCursor = notebookCheckpoint.cursor;
      const resumeStopId = notebookCheckpoint.cellId;
      restoreNotebookStopCamera(() => {
        setNotebookCheckpoint(null);
        runSmartNotebook({
          startCursor: resumeCursor,
          afterStopId: resumeStopId,
        });
      });
      return;
    }
    if (notebookPlaying) {
      cancelNotebookPlayback();
      return;
    }
    runSmartNotebook();
  }, [
    cancelNotebookPlayback,
    notebookCheckpoint,
    notebookPlaying,
    restoreNotebookStopCamera,
    runSmartNotebook,
  ]);

  const returnToPreviousNotebookStep = useCallback(() => {
    if ((!notebookCheckpoint && !notebookCompleted) || !previousNotebookReviewStep) return;
    cancelNotebookPlayback();
    applyNotebookCursor(
      previousNotebookReviewStep.cursor,
      notebookScript.cells,
      {
        lineCount: notebookScript.lineCount,
        preserveCompletion: notebookCompleted,
      }
    );
  }, [
    applyNotebookCursor,
    cancelNotebookPlayback,
    notebookCheckpoint,
    notebookCompleted,
    notebookScript.cells,
    notebookScript.lineCount,
    previousNotebookReviewStep,
  ]);

  const advanceToNextNotebookStep = useCallback(() => {
    if (
      (!notebookCheckpoint && !notebookCompleted) ||
      !Number.isFinite(nextNotebookReviewCursor)
    ) return;
    cancelNotebookPlayback();
    applyNotebookCursor(
      nextNotebookReviewCursor,
      notebookScript.cells,
      {
        lineCount: notebookScript.lineCount,
        preserveCompletion: notebookCompleted,
      }
    );
  }, [
    applyNotebookCursor,
    cancelNotebookPlayback,
    nextNotebookReviewCursor,
    notebookCheckpoint,
    notebookCompleted,
    notebookScript.cells,
    notebookScript.lineCount,
  ]);

  const playCurrentNotebookCheckpoint = useCallback(() => {
    if (!notebookCheckpoint || !activeNotebookSegment) return;
    const startCursor = notebookStopReviewing
      ? notebookCursor
      : activeNotebookSegment.startCursor;
    setNotebookCheckpoint(null);
    setNotebookCompleted(false);
    playNotebookToNextStop(
      startCursor,
      notebookScript.cells,
      notebookScript.lineCount,
      {
        afterStopId: activeNotebookSegment.previousStopId,
        targetStopId: notebookCheckpoint.cellId,
      }
    );
  }, [
    activeNotebookSegment,
    notebookCheckpoint,
    notebookStopReviewing,
    notebookCursor,
    notebookScript.cells,
    notebookScript.lineCount,
    playNotebookToNextStop,
  ]);

  const selectNotebookPlaybackSegment = useCallback((segmentId) => {
    const segment = notebookPlaybackSegmentsList.find((item) => item.id === segmentId);
    if (!segment) return;
    cancelNotebookPlayback();
    applyNotebookCursor(
      segment.endCursor,
      notebookScript.cells,
      { lineCount: notebookScript.lineCount }
    );
    setNotebookCompleted(segment.kind === 'final');
    setNotebookCheckpoint(segment.stop
      ? {
          cellId: segment.stop.cell.id,
          cursor: segment.stop.cursor,
          kind: segment.stop.cell.type,
        }
      : null);
  }, [
    applyNotebookCursor,
    cancelNotebookPlayback,
    notebookPlaybackSegmentsList,
    notebookScript.cells,
    notebookScript.lineCount,
  ]);

  const playActiveNotebookSegment = useCallback((segmentId = null) => {
    const segment = notebookPlaybackSegmentsList.find((item) => item.id === segmentId)
      ?? activeNotebookSegment;
    if (!segment) return;
    const reachedSegmentEnd = notebookCursor >= segment.endCursor - 0.0001;
    const startCursor = reachedSegmentEnd
      ? segment.startCursor
      : Math.max(segment.startCursor, notebookCursor);
    setNotebookCheckpoint(null);
    setNotebookCompleted(false);
    if (segment.stop) {
      playNotebookToNextStop(
        startCursor,
        notebookScript.cells,
        notebookScript.lineCount,
        {
          afterStopId: segment.previousStopId,
          targetStopId: segment.stop.cell.id,
        }
      );
      return;
    }

    const spanRatio = Math.max(
      0.08,
      (segment.endCursor - startCursor) / 100
    );
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const duration = (
      Math.max(900, Math.min(5600, notebookScript.lineCount * 420)) * spanRatio
    ) / speed;
    playNotebookCursorRange(
      startCursor,
      segment.endCursor,
      notebookScript.cells,
      duration,
      () => {
        setNotebookCheckpoint(null);
        setNotebookCompleted(true);
      },
      notebookScript.lineCount,
      { preserveCameraUntilExplicit: Boolean(segment.previousStopId) }
    );
  }, [
    activeNotebookSegment,
    notebookCursor,
    notebookPlaybackSegmentsList,
    notebookScript.cells,
    notebookScript.lineCount,
    notebookSpeed,
    playNotebookCursorRange,
    playNotebookToNextStop,
  ]);

  const toggleNotebookSceneSegmentPlayback = useCallback((segmentId = null) => {
    if (notebookPlaying) {
      cancelNotebookPlayback();
      return;
    }
    playActiveNotebookSegment(segmentId);
  }, [
    cancelNotebookPlayback,
    notebookPlaying,
    playActiveNotebookSegment,
  ]);

  useEffect(() => {
    setNotebookCheckpointCaptionHidden(false);
  }, [notebookActiveReviewStopId]);

  const scrubNotebookToClientY = useCallback((clientY, dragRect = null, pointerOffsetY = 0) => {
    const track = notebookProgressRef.current;
    const rect = dragRect ?? track?.getBoundingClientRect();
    if (!rect) return;
    setNotebookCheckpoint(null);
    const trackTop = rect.top + NOTEBOOK_PROGRESS_HANDLE_CENTER_INSET;
    const trackHeight = Math.max(
      1,
      rect.height - NOTEBOOK_PROGRESS_HANDLE_CENTER_INSET * 2
    );
    const raw = trackHeight > 0
      ? ((clientY - pointerOffsetY - trackTop) / trackHeight) * 100
      : 0;
    applyNotebookCursor(raw, notebookScript.cells);
  }, [applyNotebookCursor, notebookScript.cells]);

  const scrubNotebookToClientX = useCallback((clientX, track = notebookSceneProgressRef.current) => {
    cancelNotebookPlayback();
    setNotebookCheckpoint(null);
    setNotebookCompleted(false);
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const localProgress = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 0;
    applyNotebookCursor(
      notebookCursorForSegmentProgress(localProgress, activeNotebookSegment),
      notebookScript.cells
    );
  }, [activeNotebookSegment, applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells]);

  const stepNotebookCursor = useCallback((delta) => {
    cancelNotebookPlayback();
    setNotebookCheckpoint(null);
    applyNotebookCursor(notebookCursor + delta, notebookScript.cells);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookCursor, notebookScript.cells]);

  const handleNotebookProgressKeyDown = useCallback((event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      cancelNotebookPlayback();
      setNotebookCheckpoint(null);
      applyNotebookCursor(0, notebookScript.cells);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      cancelNotebookPlayback();
      setNotebookCheckpoint(null);
      applyNotebookCursor(100, notebookScript.cells);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      stepNotebookCursor(event.shiftKey ? -10 : -2);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepNotebookCursor(event.shiftKey ? 10 : 2);
    }
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells, stepNotebookCursor]);

  useEffect(() => () => cancelNotebookPlayback(), [cancelNotebookPlayback]);

  const handleNotebookProgressPointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelNotebookPlayback();
    const input = event.currentTarget;
    const rect = input.getBoundingClientRect();
    const trackHeight = Math.max(
      1,
      rect.height - NOTEBOOK_PROGRESS_HANDLE_CENTER_INSET * 2
    );
    const logicalHandleY =
      rect.top +
      NOTEBOOK_PROGRESS_HANDLE_CENTER_INSET +
      (Math.max(0, Math.min(100, notebookCursor)) / 100) * trackHeight;
    const handleRect = input.querySelector('span')?.getBoundingClientRect();
    const pressedNearHandle = handleRect
      ? event.clientY >= handleRect.top - 16 && event.clientY <= handleRect.bottom + 16
      : Math.abs(event.clientY - logicalHandleY) <= 18;
    const pointerOffsetY = pressedNearHandle
      ? event.clientY - logicalHandleY
      : 0;
    notebookProgressDragRef.current = { pointerId: event.pointerId, rect, pointerOffsetY };
    setNotebookProgressDragging(true);
    input.focus?.({ preventScroll: true });
    input.setPointerCapture?.(event.pointerId);
    scrubNotebookToClientY(event.clientY, rect, pointerOffsetY);
  }, [cancelNotebookPlayback, notebookCursor, scrubNotebookToClientY]);

  const handleNotebookProgressPointerMove = useCallback((event) => {
    const drag = notebookProgressDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    scrubNotebookToClientY(event.clientY, drag.rect, drag.pointerOffsetY);
  }, [scrubNotebookToClientY]);

  const finishNotebookProgressDrag = useCallback((event) => {
    const drag = notebookProgressDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    scrubNotebookToClientY(event.clientY, drag.rect, drag.pointerOffsetY);
    notebookProgressDragRef.current = null;
    setNotebookProgressDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, [scrubNotebookToClientY]);

  const handleNotebookSceneProgressPointerDown = useCallback((event) => {
    event.preventDefault();
    const track = event.currentTarget;
    track.setPointerCapture?.(event.pointerId);
    scrubNotebookToClientX(event.clientX, track);

    const handleMove = (moveEvent) => scrubNotebookToClientX(moveEvent.clientX, track);
    const handleUp = (upEvent) => {
      scrubNotebookToClientX(upEvent.clientX, track);
      track.releasePointerCapture?.(event.pointerId);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }, [scrubNotebookToClientX]);

  const handleNotebookSceneProgressKeyDown = useCallback((event) => {
    if (!activeNotebookSegment) return;
    const localStep = event.shiftKey ? 10 : 2;
    let nextProgress = null;
    if (event.key === 'Home') nextProgress = 0;
    if (event.key === 'End') nextProgress = 100;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextProgress = activeNotebookSegmentProgress - localStep;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextProgress = activeNotebookSegmentProgress + localStep;
    }
    if (nextProgress === null) return;
    event.preventDefault();
    cancelNotebookPlayback();
    setNotebookCheckpoint(null);
    setNotebookCompleted(false);
    applyNotebookCursor(
      notebookCursorForSegmentProgress(nextProgress, activeNotebookSegment),
      notebookScript.cells
    );
  }, [
    activeNotebookSegment,
    activeNotebookSegmentProgress,
    applyNotebookCursor,
    cancelNotebookPlayback,
    notebookScript.cells,
  ]);

  const jumpNotebookToLine = useCallback((lineIndex) => {
    cancelNotebookPlayback();
    const cursor = notebookCursorForLineReveal(lineIndex, notebookLineCount);
    applyNotebookCursor(cursor, notebookScript.cells);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookLineCount, notebookScript.cells]);

  useEffect(() => {
    if (
      !isAnimationViewer ||
      !isLoaded ||
      animationViewerInitializedRef.current ||
      !notebookScript.cells.length
    ) {
      return;
    }
    animationViewerInitializedRef.current = true;
    cameraProgressOverrideRef.current = null;
    notebookCameraTransitionRef.current = null;
    const previewStartCell = isAnimationPreview
      ? notebookScript.cells.find((cell) => !cell.hidden && cell.type !== 'scene')
      : null;
    const previewStartCursor = previewStartCell
      ? notebookCursorForLineStart(previewStartCell.lineStart ?? 0, notebookScript.lineCount)
      : 0;
    applyNotebookCursor(
      previewStartCursor,
      notebookScript.cells,
      { lineCount: notebookScript.lineCount }
    );
    if (!isAnimationPreview) return undefined;
    if (prefersReducedMotion) {
      applyNotebookCursor(100, notebookScript.cells, { lineCount: notebookScript.lineCount });
      return undefined;
    }
    animationPreviewStartTimerRef.current = window.setTimeout(() => {
      animationPreviewStartTimerRef.current = null;
      runSmartNotebook({ startCursor: previewStartCursor });
    }, 320);
    return undefined;
  }, [
    applyNotebookCursor,
    isAnimationPreview,
    isAnimationViewer,
    isLoaded,
    notebookScript.cells,
    notebookScript.lineCount,
    prefersReducedMotion,
    runSmartNotebook,
  ]);

  useEffect(() => () => {
    if (animationPreviewStartTimerRef.current) {
      window.clearTimeout(animationPreviewStartTimerRef.current);
      animationPreviewStartTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAnimationPreview || !isLoaded || !notebookScript.cells.length) return undefined;

    let cancelled = false;
    let firstFrame = null;
    let secondFrame = null;
    let readyTimer = null;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();

    Promise.resolve(fontsReady)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        firstFrame = window.requestAnimationFrame(() => {
          secondFrame = window.requestAnimationFrame(() => {
            readyTimer = window.setTimeout(() => {
              if (cancelled || window.parent === window) return;
              window.parent.postMessage(
                { type: 'flow-math-preview-ready' },
                window.location.origin
              );
            }, 120);
          });
        });
      });

    return () => {
      cancelled = true;
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      if (readyTimer !== null) window.clearTimeout(readyTimer);
    };
  }, [isAnimationPreview, isLoaded, notebookScript.cells.length]);

  useEffect(() => {
    const previousVisualKey = notebookVisualSignatureRef.current;
    notebookVisualSignatureRef.current = notebookVisualSignatureKey;
    const previousKey = notebookMatrixSignatureRef.current;
    notebookMatrixSignatureRef.current = notebookMatrixSignatureKey;
    const didVisualChange = previousVisualKey !== null && previousVisualKey !== notebookVisualSignatureKey;

    if (notebookReplayFromStartRef.current) {
      notebookReplayFromStartRef.current = false;
      if (workspaceMode !== 'system') return undefined;
      const timer = window.setTimeout(() => {
        runSmartNotebook({ startCursor: 0 });
      }, 70);
      return () => window.clearTimeout(timer);
    }

    if (workspaceMode !== 'system' || !didVisualChange) {
      return undefined;
    }

    if (previousKey === null || previousKey === notebookMatrixSignatureKey) {
      const timer = window.setTimeout(() => {
        applyNotebookCursor(notebookCursor, notebookScript.cells);
      }, 50);
      return () => window.clearTimeout(timer);
    }

    const previousSignatures = previousKey ? previousKey.split('\n') : [];
    const changedMatrixIndex = notebookMatrixSignatureList.findIndex(
      (signature, index) => signature !== previousSignatures[index]
    );
    const matrixCells = notebookScript.cells.filter((cell) =>
      !cell.hidden &&
      (
        cell.type === 'matrix' ||
        (cell.type === 'calc' && cell.resultKind === 'matrix') ||
        (cell.type === 'ref' && cell.refKind === 'matrix')
      )
    );
    const targetCell = matrixCells[
      changedMatrixIndex >= 0 ? changedMatrixIndex : Math.max(0, matrixCells.length - 1)
    ];
    if (!targetCell) return undefined;

    const timer = window.setTimeout(() => {
      playNotebookMatrixCell(targetCell, { continueToEnd: true });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [
    notebookMatrixSignatureKey,
    notebookMatrixSignatureList,
    notebookScript.cells,
    notebookVisualSignatureKey,
    applyNotebookCursor,
    notebookCursor,
    playNotebookMatrixCell,
    runSmartNotebook,
    workspaceMode,
  ]);

  const updateMatrixInputValues = useCallback((values) => {
    setHoveredMatrixPresetId(null);
    setMatrix3((previous) => patchMatrixInputShape(previous, outputRows, inputColumns, values));
    if (outputRows === 2 && inputColumns === 2) setMatrix2(values);
    if (outputRows === 1 && inputColumns === 1) setMatrix1(values);
  }, [inputColumns, outputRows]);

  const applyCurrentInput = useCallback(() => {
    const matrix = operationMatrixFromInputValues(matrixInputValues, outputRows, inputColumns);
    const operationMode = operationModeForShape(outputRows, inputColumns);
    const name = activeMatrixPresetName ?? `${outputRows}x${inputColumns} ${t(locale, 'matrix')}`;

    applyTransformation(matrix, name, operationMode);
  }, [activeMatrixPresetName, applyTransformation, inputColumns, locale, matrixInputValues, outputRows]);

  const loadPresetToMatrixInput = useCallback((preset) => {
    const rows = dimensionForMode(preset.mode);
    const columns = rows;
    const values = matrixInputValuesForShape(operationMatrixFromPreset(preset), rows, columns).map(formatPresetInputValue);
    setHoveredMatrixPresetId(null);
    setInputMode(preset.mode);
    setMatrix3((previous) => patchMatrixInputShape(previous, rows, columns, values));
    if (preset.mode === '2d') setMatrix2(values);
    if (preset.mode === '1d') setMatrix1(values);
  }, []);

  const applyMatrixPresetDirectly = useCallback((preset, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setHoveredMatrixPresetId(null);
    const values = matrixValuesForMode(preset.matrix, preset.mode);
    const matrix =
      preset.mode === '2d'
        ? [values[0], values[1], 0, values[2], values[3], 0, 0, 0, 0]
        : preset.mode === '1d'
          ? [values[0], 0, 0, 0, 0, 0, 0, 0, 0]
          : values;
    applyTransformation(matrix, preset.name, preset.mode);
  }, [applyTransformation]);

  const jumpToHistory = useCallback((index) => {
    const target = history[index];
    if (!target) return;
    startAnimationTo(target.matrix, null);
    setActiveHistoryIndex(index);
    setHoveredHistoryIndex(null);
  }, [history, startAnimationTo]);

  const deleteHistoryEntry = useCallback((index, event) => {
    event.stopPropagation();
    if (history.length <= 1) return;

    const next = history.filter((_, entryIndex) => entryIndex !== index);
    let nextActiveIndex = activeHistoryIndex;

    if (index < activeHistoryIndex) {
      nextActiveIndex = activeHistoryIndex - 1;
    } else if (index === activeHistoryIndex) {
      nextActiveIndex = Math.min(index, next.length - 1);
    }

    const target = next[nextActiveIndex];
    setHistory(next);
    setActiveHistoryIndex(nextActiveIndex);
    setHoveredHistoryIndex(null);

    if (index === activeHistoryIndex && target) {
      startAnimationTo(target.matrix, null);
    }
  }, [activeHistoryIndex, history, startAnimationTo]);

  const getMatrixInputValues = useCallback(() => {
    return { values: matrixInputValues, columns: inputColumns };
  }, [inputColumns, matrixInputValues]);

  const copyMatrixInput = useCallback(async () => {
    try {
      const { values, columns } = getMatrixInputValues();
      const rows = [];
      for (let i = 0; i < values.length; i += columns) {
        rows.push(values.slice(i, i + columns).join(' '));
      }

      const text = rows.join('\n');
      if (typeof window !== 'undefined') {
        window.__linearAlgebraMatrixClipboard = text;
      }
      await navigator.clipboard.writeText(text);
      toast.success(t(locale, 'copied'));
      setClipboardStatus(t(locale, 'copied'));
    } catch {
      setClipboardStatus(t(locale, 'copyFailed'));
    }
    window.setTimeout(() => setClipboardStatus(''), 1200);
  }, [getMatrixInputValues, locale]);

  const pasteMatrixInput = useCallback(async () => {
    try {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = window.__linearAlgebraMatrixClipboard ?? '';
      }
      if (!text.trim() && window.__linearAlgebraMatrixClipboard) {
        text = window.__linearAlgebraMatrixClipboard;
      }
      const numbers = text.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:\s*\/\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?/gi) ?? [];
      const normalized = numbers.map((value) => value.replace(/\s+/g, ''));

      if (normalized.length) {
        const rows = Math.min(3, Math.max(1, Math.ceil(normalized.length / inputColumns)));
        const nextValues = Array.from(
          { length: rows * inputColumns },
          (_, index) => normalized[index] ?? matrixInputValues[index] ?? '0'
        );
        setHoveredMatrixPresetId(null);
        setInputMode(modeForDimension(rows));
        setMatrix3((previous) => patchMatrixInputShape(previous, rows, inputColumns, nextValues));
        if (rows === 2 && inputColumns === 2) setMatrix2(nextValues);
        if (rows === 1 && inputColumns === 1) setMatrix1(nextValues);
      }

      if (numbers.length) {
        toast.success(t(locale, 'pasted'));
      } else {
        toast.warning(t(locale, 'pasteNoNumbers'));
      }

      setClipboardStatus(numbers.length ? t(locale, 'pasted') : t(locale, 'pasteNoNumbers'));
    } catch {
      setClipboardStatus(t(locale, 'pasteFailed'));
    }
    window.setTimeout(() => setClipboardStatus(''), 1200);
  }, [inputColumns, locale, matrixInputValues]);

  const renderSmartNotebookSyntaxLine = useCallback((line, lineIndex) => {
    const source = String(line ?? '');
    const pieces = [];
    let cursor = 0;
    const lineMark = notebookScript.marks[lineIndex];
    const muteMatch = source.match(/^(\s*)!(\s*)/u);

    if (muteMatch) {
      const prefix = muteMatch[1] ?? '';
      if (prefix) pieces.push(prefix);
      pieces.push(
        <span className="smart-inline-mute" key={`mute-${lineIndex}`}>
          !
        </span>
      );
      if (muteMatch[2]) pieces.push(muteMatch[2]);
      cursor = muteMatch[0].length;
    }

    const captionSource = source.slice(cursor);
    const captionMatch = captionSource.match(/^(\s*)(\/\/.*)$/u);
    if (captionMatch) {
      if (captionMatch[1]) pieces.push(captionMatch[1]);
      pieces.push(
        <span className="smart-inline-caption" key={`caption-${lineIndex}`}>
          {renderNotebookTaggedText(captionMatch[2], notebookTokenStyles, 'smart-caption-variable')}
        </span>
      );
      return pieces;
    }

    const tokenPattern = new RegExp(`#${NOTEBOOK_IDENTIFIER_PATTERN}(?:!@?|@)?|${NOTEBOOK_IDENTIFIER_PATTERN}`, 'gu');
    tokenPattern.lastIndex = cursor;

    let match;
    while ((match = tokenPattern.exec(source))) {
      const token = match[0];
      const start = match.index;
      const end = start + token.length;
      if (start > cursor) pieces.push(source.slice(cursor, start));

      const isAlias = token.startsWith('#');
      let aliasToken = isAlias ? token.slice(1) : token;
      const aliasExecute = isAlias && aliasToken.endsWith('@');
      if (aliasExecute) aliasToken = aliasToken.slice(0, -1);
      const aliasHidden = isAlias && aliasToken.endsWith('!');
      if (aliasHidden) aliasToken = aliasToken.slice(0, -1);
      const tokenName = aliasToken;
      const lineMarkMatches =
        lineMark?.label &&
        notebookVariableKey(lineMark.label) === notebookVariableKey(tokenName);
      const tokenStyle = lineMarkMatches
        ? {
            label: lineMark.label,
            kind: lineMark.kind,
            color: lineMark.color ?? 0x8b5cf6,
            hidden: Boolean(lineMark.hidden),
          }
        : notebookTokenStyles.get(notebookVariableKey(tokenName));

      if (tokenStyle) {
        pieces.push(
          <span
            className={`smart-inline-token ${tokenStyle.kind} ${tokenStyle.hidden ? 'hidden' : ''}`}
            key={`token-${lineIndex}-${start}`}
            style={{ '--line-color': colorToHex(tokenStyle.color) }}
          >
            {`${isAlias ? '#' : ''}${tokenStyle.label}${aliasHidden ? '!' : ''}${aliasExecute ? '@' : ''}`}
          </span>
        );
      } else {
        pieces.push(token);
      }

      cursor = end;
    }

    if (cursor < source.length) pieces.push(source.slice(cursor));
    return pieces.length ? pieces : ' ';
  }, [notebookScript.marks, notebookTokenStyles]);

  const updateEquation = useCallback((index, value) => {
    setNotebookEquationModeHint(null);
    setEquations((previous) => previous.map((equation, equationIndex) =>
      equationIndex === index ? value : equation
    ));
  }, []);

  const updateEquationNote = useCallback((value) => {
    const normalized = value.replace(/\r/g, '');
    setNotebookEquationModeHint(null);
    setEquations(normalized === '' ? [''] : normalized.split('\n'));
  }, []);

  const updateSmartNotebookText = useCallback((value, options = {}) => {
    const normalized = String(value ?? '').replace(/\r/g, '');
    const textChanged = normalized !== notebookTextRef.current;
    if (notebookEditorRuntimeTimerRef.current) {
      window.clearTimeout(notebookEditorRuntimeTimerRef.current);
      notebookEditorRuntimeTimerRef.current = null;
    }
    notebookEditorTypingRef.current = false;
    notebookTextRef.current = normalized;
    if (textChanged) {
      setNotebookCuedLineIndex(null);
      if (!options.preserveCheckpoint) setNotebookCheckpoint(null);
    }
    setNotebookText(normalized);
    setNotebookRuntimeText(normalized);
    const parsed = parseNotebookScript(normalized);
    const hasCheckpoint = parsed.cells.some((cell) => cell.type === 'checkpoint' && !cell.hidden);
    const targetCursor = notebookReplayFromStartRef.current
      ? 0
      : options.revealAll && !hasCheckpoint
        ? 100
        : notebookCursor;
    applyNotebookCursor(targetCursor, parsed.cells, { lineCount: parsed.lineCount });
  }, [applyNotebookCursor, notebookCursor]);

  const handleNotebookEditorChange = useCallback((value, options = {}) => {
    const normalized = String(value ?? '').replace(/\r/g, '');
    if (normalized === notebookTextRef.current) return;

    const wasTyping = notebookEditorTypingRef.current;
    notebookEditorTypingRef.current = true;
    notebookTextRef.current = normalized;
    if (!wasTyping) {
      cancelNotebookPlayback();
      setNotebookCuedLineIndex(null);
      setNotebookCheckpoint(null);
    }

    if (notebookEditorRuntimeTimerRef.current) {
      window.clearTimeout(notebookEditorRuntimeTimerRef.current);
    }
    const commitRuntime = () => {
      notebookEditorRuntimeTimerRef.current = null;
      notebookEditorTypingRef.current = false;

      const latestText = notebookTextRef.current;
      setNotebookText(latestText);
      setNotebookRuntimeText(latestText);
      const parsed = parseNotebookScript(latestText);
      const hasCheckpoint = parsed.cells.some(
        (cell) => cell.type === 'checkpoint' && !cell.hidden
      );
      const targetCursor = notebookReplayFromStartRef.current
        ? 0
        : hasCheckpoint
          ? notebookCursor
          : 100;
      applyNotebookCursor(targetCursor, parsed.cells, { lineCount: parsed.lineCount });
    };

    if (options.commitNow) {
      commitRuntime();
      return;
    }

    notebookEditorRuntimeTimerRef.current = window.setTimeout(
      commitRuntime,
      NOTEBOOK_EDITOR_RUNTIME_DEBOUNCE_MS
    );
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookCursor]);

  const handleNotebookEditorBlur = useCallback((value) => {
    updateSmartNotebookText(prettifyNotebookScriptText(value), { preserveCheckpoint: true });
  }, [updateSmartNotebookText]);

  const handleNotebookEditorPaste = useCallback((options = {}) => {
    notebookReplayFromStartRef.current = options.replayFromStart === true;
  }, []);

  const acceptSmartNotebookStarter = useCallback((source = notebookStarterText()) => {
    const next = String(source ?? notebookStarterText());
    const parsed = parseNotebookScript(next);
    notebookReplayFromStartRef.current = false;
    updateSmartNotebookText(next);
    window.requestAnimationFrame(() => {
      playNotebookToNextStop(0, parsed.cells, parsed.lineCount);
    });
    return next;
  }, [playNotebookToNextStop, updateSmartNotebookText]);

  const handleEquationNoteKeyDown = useCallback((event) => {
    const textarea = event.currentTarget;
    const current = textarea.value;
    const placeholder = t(locale, 'equationNotePlaceholder');

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? start;
      const lineIndex = current.slice(0, start).split('\n').length - 1;
      const next = prettifyEquationNoteText(`${current.slice(0, start)}\n${current.slice(end)}`);
      const nextLines = next.split('\n');
      const cursor = nextLines.slice(0, lineIndex + 1).join('\n').length + 1;
      updateEquationNote(next);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();

    if (!current.trim()) {
      updateEquationNote(placeholder);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = placeholder.length;
        textarea.selectionEnd = placeholder.length;
      });
      return;
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${current.slice(0, start)}  ${current.slice(end)}`;
    updateEquationNote(next);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  }, [locale, updateEquationNote]);

  const addEquation = useCallback(() => {
    setNotebookEquationModeHint(null);
    setEquations((previous) => [...previous, '']);
  }, []);

  const removeEquation = useCallback((index) => {
    setNotebookEquationModeHint(null);
    setEquations((previous) => previous.filter((_, equationIndex) => equationIndex !== index));
  }, []);

  const insertNotebookCell = useCallback((afterId, type) => {
    const nextCell =
      type === 'matrix'
        ? createNotebookMatrixCell(systemMatrixMode)
        : type === 'note'
          ? createNotebookNoteCell('')
          : createNotebookEquationCell('');
    setNotebookCells((previous) => {
      const insertIndex = Math.max(0, previous.findIndex((cell) => cell.id === afterId));
      const next = [...previous];
      next.splice(insertIndex + 1, 0, nextCell);
      return next;
    });
    setActiveNotebookCellId(nextCell.id);
  }, [systemMatrixMode]);

  const addNotebookCellToEnd = useCallback((type) => {
    const nextCell =
      type === 'matrix'
        ? createNotebookMatrixCell(systemMatrixMode)
        : type === 'note'
          ? createNotebookNoteCell('')
          : createNotebookEquationCell('');
    setNotebookCells((previous) => [...previous, nextCell]);
    setActiveNotebookCellId(nextCell.id);
  }, [systemMatrixMode]);

  const updateNotebookCellText = useCallback((cellId, text) => {
    setNotebookCells((previous) =>
      previous.map((cell) => (cell.id === cellId ? { ...cell, text } : cell))
    );
    if (cellId === activeNotebookCellId) {
      const cell = notebookCells.find((item) => item.id === cellId);
      if (cell?.type === 'equation') updateEquationNote(text);
    }
  }, [activeNotebookCellId, notebookCells, updateEquationNote]);

  const prettifyNotebookEquationCell = useCallback((cellId) => {
    const sourceCell = notebookCells.find((cell) => cell.id === cellId && cell.type === 'equation');
    if (!sourceCell) return;
    const nextText = prettifyEquationNoteText(sourceCell.text);
    setNotebookCells((previous) =>
      previous.map((cell) => (cell.id === cellId ? { ...cell, text: nextText } : cell))
    );
    if (cellId === activeNotebookCellId) updateEquationNote(nextText);
  }, [activeNotebookCellId, notebookCells, updateEquationNote]);

  const applyPresetToNotebook = useCallback((preset) => {
    const text = Array.isArray(preset) ? preset.join('\n') : String(preset ?? '');
    const parsed = parseNotebookScript(text);
    const presetView = notebookModeForCells(parsed.cells, parsed.mode);
    cancelNotebookPlayback();
    setNotebookCheckpoint(null);
    cameraProgressOverrideRef.current = null;
    notebookCameraTransitionRef.current = null;
    notebookReplayFromStartRef.current = false;
    cameraMoveRef.current.active = false;
    notebookAutoCameraViewRef.current = presetView;
    autoCameraTargetViewRef.current = presetView;
    setActiveSavedNotebookId(null);
    setSavedNotebookTitle('');
    setPendingNotebookDeleteId(null);
    setNotebookText('');
    setNotebookCells([createNotebookEquationCell('')]);
    setActiveNotebookCellId(null);
    setActiveNotebookCaption('');
    setNotebookCursor(0);
    setEquations(['']);
    setVectors([]);
    setMeasurements([]);
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    applyNotebookCursor(0, parsed.cells, { lineCount: parsed.lineCount });

    const startPlayback = () => {
      const nextCell = createNotebookEquationCell(text);
      setNotebookText(text);
      setNotebookCells([nextCell]);
      setActiveNotebookCellId(null);
      applyNotebookCursor(0, parsed.cells, { lineCount: parsed.lineCount });
      const play = () => playNotebookToNextStop(0, parsed.cells, parsed.lineCount);
      if (typeof window !== 'undefined') window.requestAnimationFrame(play);
      else play();
    };
    if (typeof window !== 'undefined') window.requestAnimationFrame(startPlayback);
    else startPlayback();
  }, [applyNotebookCursor, cancelNotebookPlayback, playNotebookToNextStop]);

  const replaceNotebookDocument = useCallback((source) => {
    const text = String(source ?? '').replace(/\r/g, '');
    const parsed = parseNotebookScript(text);
    const documentView = notebookModeForCells(parsed.cells, parsed.mode);
    cancelNotebookPlayback();
    setNotebookCheckpoint(null);
    cameraProgressOverrideRef.current = null;
    notebookCameraTransitionRef.current = null;
    notebookReplayFromStartRef.current = false;
    cameraMoveRef.current.active = false;
    notebookAutoCameraViewRef.current = documentView;
    autoCameraTargetViewRef.current = documentView;
    setNotebookText(text);
    setNotebookCells([createNotebookEquationCell(text)]);
    setActiveNotebookCellId(null);
    setActiveNotebookCaption('');
    setNotebookCursor(0);
    setEquations(['']);
    setVectors([]);
    setMeasurements([]);
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    applyNotebookCursor(0, parsed.cells, { lineCount: parsed.lineCount });
  }, [applyNotebookCursor, cancelNotebookPlayback]);

  const saveCurrentNotebook = useCallback(() => {
    const text = String(notebookText ?? '').replace(/\r/g, '');
    if (!text.trim()) {
      toast.warning(t(locale, 'notebookSaveEmpty'));
      return;
    }

    const existing = savedNotebooks.find((note) => note.id === activeSavedNotebookId);
    const id = existing?.id ?? createNotebookLibraryId();
    const title = savedNotebookTitle.trim()
      || suggestedNotebookTitle(text)
      || t(locale, 'untitledNotebook', { index: savedNotebooks.length + 1 });
    const entry = { id, title, text, updatedAt: Date.now() };
    const next = [entry, ...savedNotebooks.filter((note) => note.id !== id)]
      .sort((left, right) => right.updatedAt - left.updatedAt);
    if (!writeNotebookLibrary(next)) {
      toast.error(t(locale, 'notebookSaveFailed'));
      return;
    }
    setSavedNotebooks(next);
    setActiveSavedNotebookId(id);
    setSavedNotebookTitle(title);
    setPendingNotebookDeleteId(null);
    toast.success(t(locale, existing ? 'notebookUpdated' : 'notebookSaved'));
  }, [activeSavedNotebookId, locale, notebookText, savedNotebookTitle, savedNotebooks]);

  const openSavedNotebook = useCallback((noteId) => {
    const note = savedNotebooks.find((candidate) => candidate.id === noteId);
    if (!note) return;
    replaceNotebookDocument(note.text);
    setActiveSavedNotebookId(note.id);
    setSavedNotebookTitle(note.title);
    setPendingNotebookDeleteId(null);
  }, [replaceNotebookDocument, savedNotebooks]);

  const startNewNotebook = useCallback(() => {
    replaceNotebookDocument('');
    setActiveSavedNotebookId(null);
    setSavedNotebookTitle('');
    setPendingNotebookDeleteId(null);
  }, [replaceNotebookDocument]);

  const deleteSavedNotebook = useCallback((noteId) => {
    if (pendingNotebookDeleteId !== noteId) {
      setPendingNotebookDeleteId(noteId);
      return;
    }
    const next = savedNotebooks.filter((note) => note.id !== noteId);
    if (!writeNotebookLibrary(next)) {
      toast.error(t(locale, 'notebookSaveFailed'));
      return;
    }
    setSavedNotebooks(next);
    setPendingNotebookDeleteId(null);
    if (activeSavedNotebookId === noteId) {
      setActiveSavedNotebookId(null);
      setSavedNotebookTitle('');
    }
    toast.success(t(locale, 'notebookDeleted'));
  }, [activeSavedNotebookId, locale, pendingNotebookDeleteId, savedNotebooks]);

  const formatSavedNotebookTime = useCallback((value) => {
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return '';
    const dateLocale = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }[locale] ?? locale;
    return new Intl.DateTimeFormat(dateLocale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, [locale]);

  const removeNotebookCell = useCallback((cellId) => {
    setNotebookCells((previous) => {
      if (previous.length <= 1) return previous;
      const next = previous.filter((cell) => cell.id !== cellId);
      if (cellId === activeNotebookCellId) setActiveNotebookCellId(next[0]?.id ?? null);
      return next;
    });
  }, [activeNotebookCellId]);

  const handleNotebookEquationKeyDown = useCallback((cellId, event) => {
    const textarea = event.currentTarget;
    const current = textarea.value;
    const placeholder = t(locale, 'equationNotePlaceholder');

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? start;
      const lineIndex = current.slice(0, start).split('\n').length - 1;
      const next = prettifyEquationNoteText(`${current.slice(0, start)}\n${current.slice(end)}`);
      const nextLines = next.split('\n');
      const cursor = nextLines.slice(0, lineIndex + 1).join('\n').length + 1;
      updateNotebookCellText(cellId, next);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const next = current.trim()
      ? `${current.slice(0, start)}  ${current.slice(end)}`
      : placeholder;
    const cursor = current.trim() ? start + 2 : placeholder.length;

    updateNotebookCellText(cellId, next);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }, [locale, updateNotebookCellText]);

  const notebookCellCursor = useCallback((index, cell) => {
    if (!notebookCells.length) return 0;
    return ((index + 1) / notebookCells.length) * 100;
  }, [notebookCells.length]);

  const applyEquationSolutionToVector = useCallback(() => {
    const solution = equationSolution.solution;
    if (!solution) return;
    const nextVector = {
      x: formatInputValue(solution[0]),
      y: formatInputValue(solution[1]),
      z: formatInputValue(solution[2]),
    };
    const targetId = activeVectorIdRef.current;
    setVectors((previous) =>
      previous.map((item) => (item.id === targetId ? { ...item, ...nextVector } : item))
    );
    setShowVector(true);
  }, [equationSolution]);

  const applyLineSystemPointToVector = useCallback(() => {
    if (!lineSystem.point) return;
    const point = lineSystem.mode === '3d'
      ? lineSystem.point
      : [lineSystem.point[0], lineSystem.point[1], 0];
    const nextVector = {
      x: formatInputValue(point[0]),
      y: formatInputValue(point[1]),
      z: formatInputValue(point[2]),
    };
    const targetId = activeVectorIdRef.current;
    setVectors((previous) =>
      previous.map((item) => (item.id === targetId ? { ...item, ...nextVector } : item))
    );
    setShowVector(true);
    setWorkspaceMode(TRANSFORM_WORKSPACE_ENABLED ? 'transform' : 'system');
  }, [lineSystem.mode, lineSystem.point]);

  const buildShareState = useCallback(() => ({
    v: 1,
    locale,
    workspaceMode,
    inputMode,
    displayMatrix: currentMatrixRef.current.map((value) => Number(value.toFixed(5))),
    matrix3,
    matrix2,
    matrix1,
    vectors: vectors.map((item) => ({
      id: item.id,
      name: item.name,
      x: item.x,
      y: item.y,
      z: item.z,
      scalar: item.scalar,
      scalarEnabled: !!item.scalarEnabled,
      scalarSpace: item.scalarSpace === 'input' ? 'input' : 'output',
      renderKind: item.renderKind === 'point' ? 'point' : 'arrow',
      visible: item.visible !== false,
    })),
    showVolume,
    showVector,
    showBasis,
    showGrid,
    showRelativeGrid,
    relativeGridStrength,
    showCoordinates,
    showAutomaticSolution,
    showDot,
    showAxes,
    showRelativeAxes,
    snapToInteger,
    notebookSpeed,
    camera: cameraState,
  }), [
    cameraState,
    inputMode,
    locale,
    matrix1,
    matrix2,
    matrix3,
    showAxes,
    showBasis,
    showCoordinates,
    showAutomaticSolution,
    showDot,
    showGrid,
    showRelativeGrid,
    showRelativeAxes,
    relativeGridStrength,
    showVector,
    showVolume,
    snapToInteger,
    notebookSpeed,
    vectors,
    workspaceMode,
  ]);

  const copyNotebookAiPrompt = useCallback(async () => {
    try {
      await copyTextToClipboard(buildNotebookAiPrompt(locale, notebookText));
      toast.success(t(locale, 'notebookAiPromptCopied'));
    } catch {
      toast.error(t(locale, 'copyFailed'));
    }
  }, [locale, notebookText]);

  const copyNotebookAnimationLink = useCallback(async () => {
    const url = buildAnimationViewerUrl({ locale, notebookSpeed, notebookText });
    if (!url) {
      toast.warning(t(locale, 'notebookAnimationShareEmpty'));
      return;
    }
    try {
      await copyTextToClipboard(url);
      toast.success(t(locale, 'notebookAnimationShareCopied'));
    } catch {
      toast.error(t(locale, 'copyFailed'));
    }
  }, [locale, notebookSpeed, notebookText]);

  const supportMailHref = useMemo(() => {
    const currentUrl = typeof window === 'undefined' ? 'flow-math.com' : window.location.href;
    const subject = encodeURIComponent(t(locale, 'supportReportSubject'));
    const bodyText = t(locale, 'supportReportBody', { url: currentUrl }).replaceAll('\\n', '\n');
    const body = encodeURIComponent(bodyText);
    return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  }, [locale]);

  const isOperator = authUser?.isOperator === true || ['admin', 'operator'].includes(authUser?.role);
  const authUserDisplayName =
    authUser?.name?.trim() || authUser?.email?.split('@')[0] || t(locale, 'accountMenuLabel');
  const authUserInitial = Array.from(authUserDisplayName)[0]?.toUpperCase() || '';

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    const closeAccountMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (
        event.type === 'pointerdown' &&
        accountMenuRef.current?.contains(event.target)
      ) {
        return;
      }
      setAccountMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeAccountMenu);
    window.addEventListener('keydown', closeAccountMenu);
    return () => {
      document.removeEventListener('pointerdown', closeAccountMenu);
      window.removeEventListener('keydown', closeAccountMenu);
    };
  }, [accountMenuOpen]);

  const focusAuthField = useCallback((field) => {
    window.requestAnimationFrame(() => {
      if (field === 'email') authEmailInputRef.current?.focus();
      if (field === 'password') authPasswordInputRef.current?.focus();
      if (field === 'confirm') authPasswordConfirmInputRef.current?.focus();
    });
  }, []);

  const closeLoginDialog = useCallback(() => {
    if (authBusy) return;
    setShowLoginDialog(false);
    setAuthError('');
    setAuthErrorField('');
    window.requestAnimationFrame(() => authReturnFocusRef.current?.focus?.());
  }, [authBusy]);

  const transitionFlowView = useCallback((nextShowFlowHome, direction) => {
    const commit = () => setShowFlowHome(nextShowFlowHome);
    const root = document.documentElement;
    const canAnimate =
      !prefersReducedMotion &&
      typeof document.startViewTransition === 'function' &&
      !flowViewTransitionRef.current;

    if (!canAnimate) {
      commit();
      return;
    }

    root.dataset.flowViewTransition = direction;
    const transition = document.startViewTransition(() => {
      flushSync(commit);
    });
    flowViewTransitionRef.current = transition;
    transition.finished
      .catch(() => {})
      .finally(() => {
        if (flowViewTransitionRef.current === transition) {
          flowViewTransitionRef.current = null;
        }
        if (root.dataset.flowViewTransition === direction) {
          delete root.dataset.flowViewTransition;
        }
      });
  }, [prefersReducedMotion]);

  const enterAuthenticatedLab = useCallback((user = null, { animate = true } = {}) => {
    if (user) setAuthUser(user);
    flowHomeReplayRequestedRef.current = false;
    setShowLoginDialog(false);
    if (animate) {
      transitionFlowView(false, 'to-lab');
    } else {
      setShowFlowHome(false);
    }
    writeLabEntryToHistory(locale);
  }, [locale, transitionFlowView]);

  const replayFlowIntroduction = useCallback(() => {
    flowHomeReplayRequestedRef.current = true;
    setAccountMenuOpen(false);
    writeFlowHomeToHistory(locale);
    transitionFlowView(true, 'to-home');
  }, [locale, transitionFlowView]);

  const handleGoogleLogin = useCallback(() => {
    setAuthBusy(true);
    captureAuthStarted('google');
    window.location.assign(googleLoginUrl());
  }, []);

  const handleGoogleOneTapCredential = useCallback(async (credential) => {
    setAuthBusy(true);
    try {
      const response = await fetch(authApiUrl('/auth/google/one-tap'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.authenticated) {
        toast.error(t(locale, 'flowHomeLoginFailed'));
        return;
      }

      captureAuthCompleted(data.user, 'google', 'one_tap');
      enterAuthenticatedLab(data.user ?? null);
    } catch {
      toast.error(t(locale, 'flowHomeLoginFailed'));
    } finally {
      setAuthBusy(false);
    }
  }, [enterAuthenticatedLab, locale]);

  const handleEmailAuth = useCallback(async (mode) => {
    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    if (!email) {
      setAuthError(t(locale, 'flowHomeLoginEmailRequired'));
      setAuthErrorField('email');
      focusAuthField('email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError(t(locale, 'flowAuthEmailInvalid'));
      setAuthErrorField('email');
      focusAuthField('email');
      return;
    }
    if (!password) {
      setAuthError(t(locale, 'flowHomeLoginPasswordRequired'));
      setAuthErrorField('password');
      focusAuthField('password');
      return;
    }
    if (password.length < 8) {
      setAuthError(t(locale, 'flowHomeLoginPasswordShort'));
      setAuthErrorField('password');
      focusAuthField('password');
      return;
    }
    if (mode === 'signup' && password !== authPasswordConfirm) {
      setAuthError(t(locale, 'flowAuthPasswordMismatch'));
      setAuthErrorField('confirm');
      focusAuthField('confirm');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    setAuthErrorField('');
    captureAuthStarted(mode === 'signup' ? 'email_signup' : 'email');

    try {
      const response = await fetch(authApiUrl(`/auth/email/${mode}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorKey =
          data?.error === 'email_already_exists'
            ? 'flowHomeLoginEmailExists'
            : data?.error === 'email_not_found'
              ? 'flowHomeLoginEmailMissing'
              : data?.error === 'invalid_email'
                ? 'flowAuthEmailInvalid'
              : data?.error === 'invalid_password'
                ? 'flowHomeLoginPasswordShort'
                : data?.error === 'invalid_credentials' || data?.error === 'password_not_set'
                  ? 'flowHomeLoginPasswordInvalid'
                  : 'flowHomeLoginFailed';
        const errorField =
          data?.error === 'email_already_exists' ||
          data?.error === 'email_not_found' ||
          data?.error === 'invalid_email'
            ? 'email'
            : data?.error === 'invalid_password' ||
                data?.error === 'invalid_credentials' ||
                data?.error === 'password_not_set'
              ? 'password'
              : 'form';
        setAuthError(t(locale, errorKey));
        setAuthErrorField(errorField);
        focusAuthField(errorField);
        return;
      }

      captureAuthCompleted(data.user, 'email', mode === 'signup' ? 'signup' : 'login');
      setAuthPassword('');
      setAuthPasswordConfirm('');
      enterAuthenticatedLab(data.user ?? null);
    } catch {
      setAuthError(t(locale, 'flowHomeLoginFailed'));
      setAuthErrorField('form');
    } finally {
      setAuthBusy(false);
    }
  }, [
    authEmail,
    authPassword,
    authPasswordConfirm,
    enterAuthenticatedLab,
    focusAuthField,
    locale,
  ]);

  const handleLogout = useCallback(async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);

    try {
      const response = await fetch(authApiUrl('/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('logout_failed');

      if (isPostHogReady()) {
        posthog.capture('flow_math_auth_logout');
        posthog.reset();
      }
      googleOneTapPromptedRef.current = true;
      flowHomeReplayRequestedRef.current = false;
      setAuthUser(null);
      setAccountMenuOpen(false);
      setAuthPassword('');
      setAuthPasswordConfirm('');
      writeFlowHomeToHistory(locale);
      setShowFlowHome(true);
    } catch {
      toast.error(t(locale, 'accountLogoutFailed'));
    } finally {
      setLogoutBusy(false);
    }
  }, [locale, logoutBusy]);

  useEffect(() => () => {
    if (cameraShareTimerRef.current) {
      window.clearTimeout(cameraShareTimerRef.current);
      cameraShareTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(authApiUrl('/me'), {
      credentials: 'include',
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data?.authenticated) {
          if (showFlowHome && !flowHomeReplayRequestedRef.current) {
            enterAuthenticatedLab(data.user ?? null, { animate: false });
          } else {
            setAuthUser(data.user ?? null);
          }
          const authTarget = new URLSearchParams(window.location.search).get('auth');
          if (String(authTarget).toLowerCase() === 'google') {
            captureAuthCompleted(data.user, 'google', 'login');
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enterAuthenticatedLab, showFlowHome]);

  useEffect(() => {
    if (
      !showFlowHome ||
      !authResolved ||
      authUser ||
      showLoginDialog ||
      googleOneTapPromptedRef.current
    ) {
      return undefined;
    }

    let disposed = false;
    let cancelPrompt = () => {};

    fetch(authApiUrl('/auth/google/one-tap/config'), { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.clientId || !data?.nonce || disposed) return;

        captureAuthStarted('google_one_tap');
        cancelPrompt = await promptGoogleOneTap({
          clientId: data.clientId,
          nonce: data.nonce,
          onCredential: handleGoogleOneTapCredential,
        });
        googleOneTapPromptedRef.current = true;
        if (disposed) cancelPrompt();
      })
      .catch(() => {
        googleOneTapPromptedRef.current = false;
      });

    return () => {
      disposed = true;
      cancelPrompt();
    };
  }, [authResolved, authUser, handleGoogleOneTapCredential, showFlowHome, showLoginDialog]);

  useEffect(() => {
    window.localStorage?.setItem('linearAlgebraLocale', locale);
    applySeo(locale);
  }, [locale]);

  useEffect(() => {
    const onPopState = () => setShowFlowHome(shouldShowFlowHome());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const enterLinearLab = useCallback(() => {
    if (authUser) {
      enterAuthenticatedLab(authUser);
      return;
    }
    authReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthMode('login');
    setAuthError('');
    setAuthErrorField('');
    setAuthPasswordConfirm('');
    setAuthPasswordVisible(false);
    setShowLoginDialog(true);
  }, [authUser, enterAuthenticatedLab]);

  useEffect(() => {
    if (!showLoginDialog) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => authEmailInputRef.current?.focus(), 0);
    const handleAuthKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLoginDialog();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = authDialogRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled)'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleAuthKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleAuthKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [closeLoginDialog, showLoginDialog]);

  useEffect(() => {
    if (showFlowHome) return undefined;
    const timer = window.setTimeout(() => {
      const state = buildShareState();
      writeShareStateToUrl(state, { locale, title: t(locale, 'title') });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [buildShareState, locale, showFlowHome]);

  const resetTransformation = useCallback(() => {
    startAnimationTo([...identity3], t(locale, 'initialSpace'), {
      operationMatrix: [...identity3],
      operationMode: '3d',
      previousMatrix: [...identity3],
      previousStateMode: '3d',
      replaceHistory: true,
      stateMode: '3d',
    });
    moveCameraToView('3d');
    setMatrix3(['1', '0', '0', '0', '1', '0', '0', '0', '1']);
    setMatrix2(['1', '0', '0', '1']);
    setMatrix1(['1']);
    setShowVolume(false);
    setShowGrid(true);
    setShowRelativeGrid(true);
    setRelativeGridStrength(DEFAULT_RELATIVE_GRID_STRENGTH);
    setShowCoordinates(true);
    setShowVector(true);
    setShowBasis(false);
    setBasisVisibility({ i: true, j: true, k: true });
    setShowDot(false);
    setShowAxes(true);
    setShowRelativeAxes(true);
    setSnapToInteger(true);
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    setMeasurements([]);
    setEquations(['']);
    setActiveSavedNotebookId(null);
    setSavedNotebookTitle('');
    setPendingNotebookDeleteId(null);
    setNotebookText('');
    setNotebookCells([createNotebookEquationCell('')]);
    setActiveNotebookCellId(null);
    setNotebookCursor(0);
    setWorkspaceMode(TRANSFORM_WORKSPACE_ENABLED ? 'transform' : 'system');
    setVectorToolMode('vector');
    const initialVector = createVectorState(0, { id: 'v1', name: 'v1' });
    setVectors([initialVector]);
    setActiveVectorId('v1');
    activeVectorIdRef.current = 'v1';
    userVectorRef.current = [parseNumber(initialVector.x), parseNumber(initialVector.y), parseNumber(initialVector.z)];
    vectorRenderValuesRef.current = new Map([['v1', [...userVectorRef.current]]]);
    nextVectorIndexRef.current = 2;
  }, [locale, moveCameraToView, startAnimationTo]);

  useEffect(() => {
    if (previousMobileViewportRef.current === null) {
      previousMobileViewportRef.current = isMobileViewport;
      return;
    }
    if (previousMobileViewportRef.current === isMobileViewport) return;
    previousMobileViewportRef.current = isMobileViewport;
    setIsSidebarOpen(!isMobileViewport);
  }, [isMobileViewport]);

  const resolveControlPanelWidth = useCallback((value) => {
    const workspaceWidth =
      workspaceShellRef.current?.getBoundingClientRect().width ??
      (typeof window === 'undefined' ? undefined : window.innerWidth);
    return normalizeControlPanelWidth(value, workspaceWidth);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(CONTROL_PANEL_STORAGE_KEY, String(controlPanelWidth));
  }, [controlPanelWidth]);

  useEffect(() => {
    if (isMobileViewport || typeof window === 'undefined') return undefined;
    const handleViewportResize = () => {
      if (controlPanelResizeRef.current) return;
      setControlPanelWidth((currentWidth) => resolveControlPanelWidth(currentWidth));
    };
    handleViewportResize();
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [isMobileViewport, resolveControlPanelWidth]);

  const handleControlPanelResizePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    controlPanelResizeRef.current?.();
    controlPanelResizeRef.current = startControlPanelResize({
      event,
      normalizeWidth: normalizeControlPanelWidth,
      onCommit: (width) => {
        controlPanelResizeRef.current = null;
        setControlPanelWidth(width);
      },
      startWidth: controlPanelWidth,
      workspace: workspaceShellRef.current,
    });
  }, [controlPanelWidth]);

  const handleControlPanelResizeKeyDown = useCallback((event) => {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    setControlPanelWidth((currentWidth) => {
      if (key === 'Home') return CONTROL_PANEL_MIN_WIDTH;
      if (key === 'End') return resolveControlPanelWidth(CONTROL_PANEL_MAX_WIDTH);
      return resolveControlPanelWidth(
        currentWidth + (key === 'ArrowLeft' ? 24 : -24)
      );
    });
  }, [resolveControlPanelWidth]);

  useEffect(() => () => controlPanelResizeRef.current?.(), []);

  const resolveNotebookEditorHeight = useCallback((value) => {
    const composerHeight =
      notebookComposerRef.current?.getBoundingClientRect().height ??
      (typeof window === 'undefined' ? undefined : window.innerHeight);
    return normalizeNotebookEditorHeight(value, composerHeight);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(
      NOTEBOOK_EDITOR_HEIGHT_STORAGE_KEY,
      String(notebookEditorHeight)
    );
  }, [notebookEditorHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleNotebookComposerResize = () => {
      setNotebookEditorHeight((currentHeight) =>
        resolveNotebookEditorHeight(currentHeight)
      );
    };
    window.addEventListener('resize', handleNotebookComposerResize);
    return () => window.removeEventListener('resize', handleNotebookComposerResize);
  }, [resolveNotebookEditorHeight]);

  const resizeNotebookSectionToClientY = useCallback((clientY) => {
    const resize = notebookSectionResizeRef.current;
    if (
      !resize ||
      !Number.isFinite(clientY) ||
      resize.lastClientY === clientY
    ) {
      return;
    }
    resize.lastClientY = clientY;
    setNotebookEditorHeight(
      resolveNotebookEditorHeight(
        resize.startHeight + clientY - resize.startClientY
      )
    );
  }, [resolveNotebookEditorHeight]);

  const handleNotebookSectionResizePointerMove = useCallback((event) => {
    if (!notebookSectionResizeRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    resizeNotebookSectionToClientY(event.clientY);
  }, [resizeNotebookSectionToClientY]);

  const finishNotebookSectionResize = useCallback((event) => {
    const resize = notebookSectionResizeRef.current;
    if (!resize) return;
    if (
      Number.isFinite(event?.pointerId) &&
      event.pointerId !== resize.pointerId
    ) {
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (
      (event?.type === 'pointerup' || event?.type === 'mouseup') &&
      Number.isFinite(event.clientY)
    ) {
      resizeNotebookSectionToClientY(event.clientY);
    }
    resize.cleanup?.();
    notebookSectionResizeRef.current = null;
    setIsNotebookSectionResizing(false);
    if (resize.target?.hasPointerCapture?.(resize.pointerId)) {
      resize.target.releasePointerCapture(resize.pointerId);
    }
  }, [resizeNotebookSectionToClientY]);

  const handleNotebookSectionResizePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    finishNotebookSectionResize();

    const resizeTarget = event.currentTarget;
    const handleWindowMove = (moveEvent) => {
      if (!notebookSectionResizeRef.current) return;
      moveEvent.preventDefault();
      resizeNotebookSectionToClientY(moveEvent.clientY);
    };
    const handleWindowUp = (upEvent) => finishNotebookSectionResize(upEvent);
    const cleanup = () => {
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
      window.removeEventListener('pointercancel', handleWindowUp);
      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);
    };
    notebookSectionResizeRef.current = {
      cleanup,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: notebookEditorHeight,
      target: resizeTarget,
    };
    resizeTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', handleWindowMove, { passive: false });
    window.addEventListener('pointerup', handleWindowUp);
    window.addEventListener('pointercancel', handleWindowUp);
    window.addEventListener('mousemove', handleWindowMove, { passive: false });
    window.addEventListener('mouseup', handleWindowUp);
    setIsNotebookSectionResizing(true);
  }, [
    finishNotebookSectionResize,
    notebookEditorHeight,
    resizeNotebookSectionToClientY,
  ]);

  const handleNotebookSectionResizeKeyDown = useCallback((event) => {
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    setNotebookEditorHeight((currentHeight) => {
      if (key === 'Home') return NOTEBOOK_EDITOR_MIN_HEIGHT;
      if (key === 'End') return resolveNotebookEditorHeight(NOTEBOOK_EDITOR_MAX_HEIGHT);
      return resolveNotebookEditorHeight(
        currentHeight + (key === 'ArrowDown' ? 24 : -24)
      );
    });
  }, [resolveNotebookEditorHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('blur', finishNotebookSectionResize);
    return () => {
      window.removeEventListener('blur', finishNotebookSectionResize);
      const resize = notebookSectionResizeRef.current;
      resize?.cleanup?.();
      if (resize?.target?.hasPointerCapture?.(resize.pointerId)) {
        resize.target.releasePointerCapture(resize.pointerId);
      }
      notebookSectionResizeRef.current = null;
    };
  }, [finishNotebookSectionResize]);

  const lineSystemInfo = buildLineSystemInfo(lineSystem, effectiveSystemMode);
  const resolvedActiveNotebookCellId = activeNotebookCellId ?? notebookCells[0]?.id ?? null;
  const isPanelVisible = isSidebarOpen && !isAnimationFocus;
  const notebookEditorSurfaceHeight = isMobileViewport
    ? Math.min(notebookEditorHeight, 180)
    : notebookEditorHeight;
  const renderNotebookComposer = (onTogglePlayback, className = '') => (
    <div
      className={[
        'notebook-composer',
        className,
        isNotebookSectionResizing ? 'section-resizing' : '',
      ].filter(Boolean).join(' ')}
      ref={notebookComposerRef}
      style={{ '--notebook-editor-height': `${notebookEditorSurfaceHeight}px` }}
    >
      <div className="section-heading spread">
        <span className="heading-left">
          <NotebookPen aria-hidden="true" size={17} strokeWidth={2.1} />
          <h3>{t(locale, 'notebook')}</h3>
        </span>
        <NotebookAuthoringToolbar
          checkpoint={notebookCheckpoint}
          completed={notebookCompleted}
          onCopyAnimationLink={copyNotebookAnimationLink}
          onCopyPrompt={copyNotebookAiPrompt}
          onTogglePlayback={onTogglePlayback}
          playbackLabelKey={notebookPlaybackLabelKey}
          playing={notebookPlaying}
          translate={translate}
        />
      </div>
      <NotebookSpeedControl
        formatSpeed={formatNotebookSpeedLabel}
        onSpeedChange={(value) => setNotebookSpeed(normalizeNotebookSpeed(value))}
        speed={notebookSpeed}
        translate={translate}
      />

      <div
        className="notebook-runner notebook-runner-monaco"
        style={{
          '--notebook-progress': notebookProgressRatio,
          '--notebook-progress-y': `${Math.max(0, Math.min(100, notebookCursor))}%`,
        }}
      >
        <div
          aria-label={t(locale, 'notebookProgress')}
          aria-valuemax="100"
          aria-valuemin="0"
          aria-valuenow={Math.round(notebookCursor)}
          className={[
            'notebook-vertical-progress',
            notebookProgressDragging ? 'dragging' : '',
            notebookPlaying ? 'playing' : '',
          ].filter(Boolean).join(' ')}
          onKeyDown={handleNotebookProgressKeyDown}
          onPointerCancel={finishNotebookProgressDrag}
          onPointerDown={handleNotebookProgressPointerDown}
          onPointerMove={handleNotebookProgressPointerMove}
          onPointerUp={finishNotebookProgressDrag}
          ref={notebookProgressRef}
          role="slider"
          tabIndex={0}
        >
          <span
            aria-hidden="true"
            data-progress={`${Math.round(notebookCursor)}%`}
          />
        </div>
        <div className="notebook-flow-stack">
          <div className="notebook-cell notebook-smart active">
            <div className="notebook-cell-index">*</div>
            <div className="notebook-cell-main">
              <NotebookEditorSurface
                ref={notebookEditorRef}
                activeLineIndex={notebookActiveLineIndex}
                autoFocus={!isMobileViewport}
                autocompleteLabel={t(locale, 'notebookAutocomplete')}
                commandDetail={t(locale, 'notebookCompletionCommand')}
                cuedLineIndex={notebookCuedLineIndex}
                foldLabel={t(locale, 'notebookSceneSetupFold')}
                followActiveLine={notebookPlaying || notebookProgressDragging}
                fill={isMobileViewport}
                height={notebookEditorSurfaceHeight}
                loadingLabel={t(locale, 'notebookEditorLoading')}
                marks={notebookScript.marks}
                matrixTitle={t(locale, 'notebookMatrixCell')}
                notebookLabel={t(locale, 'notebook')}
                onAcceptStarter={acceptSmartNotebookStarter}
                onBlurFormat={handleNotebookEditorBlur}
                onChange={handleNotebookEditorChange}
                onFormat={prettifyNotebookScriptText}
                onPaste={handleNotebookEditorPaste}
                cueLabel={t(locale, 'cueNotebookLine')}
                onCueLine={cueSmartNotebookAtLine}
                playCueLabel={t(locale, 'playCuedNotebookLine')}
                progressLabel={t(locale, 'notebookProgress')}
                renderSyntaxLine={renderSmartNotebookSyntaxLine}
                starterDetail={t(locale, 'notebookCompletionStarterDetail')}
                starterLabel={t(locale, 'notebookCompletionStarter')}
                starterPreviewText={notebookStarterPreviewText()}
                starterText={notebookStarterText()}
                tokenStyles={notebookTokenStyles}
                value={notebookText}
                variableDetail={t(locale, 'notebookCompletionVariable')}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        aria-label={t(locale, 'notebookEditorResize')}
        aria-orientation="horizontal"
        aria-valuemax={maxNotebookEditorHeight(
          notebookComposerRef.current?.getBoundingClientRect().height
        )}
        aria-valuemin={NOTEBOOK_EDITOR_MIN_HEIGHT}
        aria-valuenow={notebookEditorHeight}
        aria-valuetext={`${notebookEditorHeight}px`}
        className={`notebook-section-resizer ${isNotebookSectionResizing ? 'dragging' : ''}`}
        onKeyDown={handleNotebookSectionResizeKeyDown}
        onLostPointerCapture={finishNotebookSectionResize}
        onPointerCancel={finishNotebookSectionResize}
        onPointerDown={handleNotebookSectionResizePointerDown}
        onPointerMove={handleNotebookSectionResizePointerMove}
        onPointerUp={finishNotebookSectionResize}
        role="separator"
        tabIndex={0}
        title={t(locale, 'notebookEditorResize')}
      >
        <span aria-hidden="true" />
      </div>

      <NotebookResourceShelf
        activeSavedNotebookId={activeSavedNotebookId}
        applyPresetToNotebook={applyPresetToNotebook}
        collapsible={isMobileViewport}
        deleteSavedNotebook={deleteSavedNotebook}
        formatSavedNotebookTime={formatSavedNotebookTime}
        locale={locale}
        notebookCourse={notebookCourse}
        notebookExamples={notebookExamples}
        openSavedNotebook={openSavedNotebook}
        pendingNotebookDeleteId={pendingNotebookDeleteId}
        saveCurrentNotebook={saveCurrentNotebook}
        savedNotebookTitle={savedNotebookTitle}
        savedNotebooks={savedNotebooks}
        setSavedNotebookTitle={setSavedNotebookTitle}
        startNewNotebook={startNewNotebook}
      />
    </div>
  );

  if (showFlowHome) {
    return (
      <main className="app-shell flow-home-shell">
        <Toaster
          duration={1600}
          gap={10}
          offset={18}
          position="bottom-center"
          style={{ '--width': 'min(288px, calc(100vw - 32px))' }}
          toastOptions={{
            className: 'app-toast',
          }}
        />
        <FlowMathLanding
          locale={locale}
          onEnter={enterLinearLab}
          setLocale={setLocale}
          supportMailHref={supportMailHref}
        />
        <AdSlot config={monetizationConfig} placement="bottom" translate={translate} />
        {showLoginDialog && (
          <FlowAuthDialog
            auth={{
              busy: authBusy,
              email: authEmail,
              error: authError,
              errorField: authErrorField,
              mode: authMode,
              password: authPassword,
              passwordConfirm: authPasswordConfirm,
              passwordVisible: authPasswordVisible,
            }}
            dialogRef={authDialogRef}
            emailInputRef={authEmailInputRef}
            onClose={closeLoginDialog}
            onEmailAuth={handleEmailAuth}
            onEmailChange={(value) => {
              setAuthEmail(value);
              if (authErrorField === 'email') {
                setAuthError('');
                setAuthErrorField('');
              }
            }}
            onGoogleLogin={handleGoogleLogin}
            onModeChange={(mode) => {
              setAuthMode(mode);
              setAuthError('');
              setAuthErrorField('');
              setAuthPasswordConfirm('');
            }}
            onPasswordChange={(value) => {
              setAuthPassword(value);
              if (authErrorField === 'password') {
                setAuthError('');
                setAuthErrorField('');
              }
            }}
            onPasswordConfirmChange={(value) => {
              setAuthPasswordConfirm(value);
              if (authErrorField === 'confirm') {
                setAuthError('');
                setAuthErrorField('');
              }
            }}
            onTogglePasswordVisibility={() => (
              setAuthPasswordVisible((visible) => !visible)
            )}
            passwordConfirmInputRef={authPasswordConfirmInputRef}
            passwordInputRef={authPasswordInputRef}
            translate={translate}
          />
        )}
      </main>
    );
  }

  return (
    <main
      className={`app-shell ${isAnimationFocus ? 'animation-focus' : ''} ${isAnimationViewer ? 'animation-viewer' : ''} ${isAnimationPreview ? 'animation-preview' : ''}`}
      onPointerDownCapture={clearNotebookCueOnOutsidePointerDown}
    >
      <Toaster
        duration={1600}
        gap={10}
        offset={18}
        position="bottom-center"
        style={{ '--width': 'min(288px, calc(100vw - 32px))' }}
        toastOptions={{
          className: 'app-toast',
        }}
      />
      <AdBlockGate disabled={!authResolved || isOperator} translate={translate} />
      {!isMobileViewport && (
        <AdSlot config={monetizationConfig} placement="top" translate={translate} />
      )}
      <div
        className={[
          'workspace-shell',
          isMobileViewport && !isAnimationViewer && !isAnimationFocus
            ? 'mobile-split-workspace'
            : '',
          isMobileKeyboardOpen ? 'mobile-keyboard-open' : '',
        ].filter(Boolean).join(' ')}
        ref={workspaceShellRef}
        style={{ '--control-panel-width': `${controlPanelWidth}px` }}
      >
      <section
        className={`scene-area ${workspaceMode === 'system' && notebookFieldMode === 'board' ? 'notebook-field-board' : 'notebook-field-graph'}`}
        aria-label={t(locale, 'title')}
      >
        {!isLoaded && (
          <div className="loader">
            <div className="spinner" />
            <span>{t(locale, 'loader')}</span>
          </div>
        )}

        <div className="scene-topbar">
          <div className="scene-utility-row">
            <label className="locale-switcher" title={t(locale, 'language')}>
              <span>{t(locale, 'language')}</span>
              <select
                onChange={(event) => setLocale(normalizeLocale(event.target.value))}
                value={locale}
              >
                {localeOptions.map((key) => (
                  <option key={key} value={key}>{localeMessages[key].name}</option>
                ))}
              </select>
            </label>
            <a
              className="utility-pill support-pill"
              href={supportMailHref}
              title={t(locale, 'supportReportTitle')}
            >
              <Mail size={13} />
              <span>{t(locale, 'supportReport')}</span>
            </a>
            <a
              className={`donation-pill ${monetizationConfig.donationUrl ? '' : 'disabled'}`}
              href={monetizationConfig.donationUrl || undefined}
              onClick={(event) => {
                if (!monetizationConfig.donationUrl) event.preventDefault();
              }}
              rel="noreferrer"
              target="_blank"
              title={t(locale, 'donationText')}
            >
              <span>{monetizationConfig.donationLabel || t(locale, 'donation')}</span>
            </a>
          </div>
          <div
            className={`scene-actions ${sceneToolsExpanded ? 'expanded' : 'collapsed'} ${
              authUser ? 'has-account' : ''
            }`}
          >
            <div className="scene-action-row">
            <button
              aria-controls="scene-tools-panel"
              aria-expanded={sceneToolsExpanded}
              className="scene-tools-toggle"
              onClick={() => setSceneToolsExpanded((expanded) => !expanded)}
              title={t(locale, sceneToolsExpanded ? 'collapseSceneTools' : 'expandSceneTools')}
              type="button"
            >
              <SlidersHorizontal size={14} />
              <strong>{String(activeView ?? autoCameraTargetViewRef.current ?? NOTEBOOK_SCENE_DEFAULTS.view).toUpperCase()}</strong>
              <span>{t(locale, 'sceneTools')}</span>
              <ChevronDown aria-hidden="true" className="scene-tools-toggle-chevron" size={14} />
            </button>
            {authUser && (
              <div className={`account-menu ${accountMenuOpen ? 'open' : ''}`} ref={accountMenuRef}>
                <button
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="dialog"
                  className="account-trigger"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  title={t(locale, 'accountMenuLabel')}
                  type="button"
                >
                  <span className="account-avatar" aria-hidden="true">
                    {authUser.pictureUrl ? (
                      <img alt="" referrerPolicy="no-referrer" src={authUser.pictureUrl} />
                    ) : authUserInitial ? (
                      authUserInitial
                    ) : (
                      <User size={15} />
                    )}
                  </span>
                  <span className="account-trigger-copy">
                    <strong>{authUserDisplayName}</strong>
                    <small>{t(locale, 'accountMenuLabel')}</small>
                  </span>
                  <ChevronDown aria-hidden="true" className="account-trigger-chevron" size={13} />
                </button>

                {accountMenuOpen && (
                  <div
                    aria-label={t(locale, 'accountMenuLabel')}
                    className="account-popover"
                    role="dialog"
                  >
                    <span className="account-popover-label">{t(locale, 'accountMenuLabel')}</span>
                    <div className="account-identity">
                      <span className="account-avatar large" aria-hidden="true">
                        {authUser.pictureUrl ? (
                          <img alt="" referrerPolicy="no-referrer" src={authUser.pictureUrl} />
                        ) : authUserInitial ? (
                          authUserInitial
                        ) : (
                          <User size={18} />
                        )}
                      </span>
                      <span>
                        <strong>{authUserDisplayName}</strong>
                        <small>{authUser.email}</small>
                      </span>
                    </div>
                    <button
                      className="account-intro-replay"
                      onClick={replayFlowIntroduction}
                      type="button"
                    >
                      <RotateCcw size={15} />
                      <span>{t(locale, 'accountReplayIntroduction')}</span>
                    </button>
                    <button
                      className="account-logout"
                      disabled={logoutBusy}
                      onClick={handleLogout}
                      type="button"
                    >
                      {logoutBusy ? (
                        <span aria-hidden="true" className="flow-auth-spinner" />
                      ) : (
                        <LogOut size={15} />
                      )}
                      <span>
                        {t(locale, logoutBusy ? 'accountLoggingOut' : 'accountLogout')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
            <div
              aria-hidden={!sceneToolsExpanded}
              className="scene-tools-panel"
              id="scene-tools-panel"
            >
            <div className="view-actions">
              {Object.entries(viewPresets).map(([viewKey, preset]) => {
                const viewLabel = t(locale, preset.labelKey);
                return (
                  <button
                    className={`view-button ${activeView === viewKey ? 'active' : ''}`}
                    key={viewKey}
                    onClick={() => moveCameraToView(viewKey)}
                    title={t(locale, 'viewTitle', { label: viewLabel })}
                  >
                    {viewLabel}
                  </button>
                );
              })}
              <div className="camera-lock-group" aria-label={t(locale, 'lockControls')}>
                <button
                  aria-pressed={allLocked}
                  className={`camera-lock-button ${allLocked ? 'active' : ''}`}
                  onClick={() => {
                    const next = !allLocked;
                    setCameraLocked(next);
                    setZoomLocked(next);
                  }}
                  title={allLocked ? t(locale, 'unlockAllTitle') : t(locale, 'lockAllTitle')}
                  type="button"
                >
                  <Lock size={13} />
                  <span>{t(locale, 'lockAll')}</span>
                </button>
                <button
                  aria-pressed={zoomLocked}
                  className={`camera-lock-button ${zoomLocked ? 'active' : ''}`}
                  onClick={() => setZoomLocked((value) => !value)}
                  title={zoomLocked ? t(locale, 'unlockZoomTitle') : t(locale, 'lockZoomTitle')}
                  type="button"
                >
                  <ZoomIn size={13} />
                  <span>{t(locale, 'lockZoom')}</span>
                </button>
                <button
                  aria-pressed={cameraLocked}
                  className={`camera-lock-button ${cameraLocked ? 'active' : ''}`}
                  onClick={() => setCameraLocked((value) => !value)}
                  title={cameraLocked ? t(locale, 'unlockCameraTitle') : t(locale, 'lockCameraTitle')}
                  type="button"
                >
                  <Camera size={13} />
                  <span>{t(locale, 'lockCamera')}</span>
                </button>
              </div>
            </div>
            <div className="scene-control-dock" aria-label={t(locale, 'graphControls')}>
              <div className="rank-chip" title={t(locale, 'rankTitle')}>
                <span>{t(locale, 'rankLabel')}</span>
                <strong>{currentRank}</strong>
                <em>{currentModeLabel}</em>
              </div>
              <div className="control-cluster space-cluster">
                <span className="cluster-label">{t(locale, 'space')}</span>
                <div className="scene-display-toggles compact-group" aria-label={t(locale, 'spaceDisplay')}>
                  <label className={showGrid ? 'active' : ''} title={t(locale, 'baseGridTitle')}>
                    <input
                      checked={showGrid}
                      onChange={(event) => setShowGrid(event.target.checked)}
                      type="checkbox"
                    />
                    <Grid3X3 size={14} />
                    <span>{t(locale, 'baseGrid')}</span>
                  </label>
                  <label className={showRelativeGrid ? 'active' : ''} title={t(locale, 'relativeGridTitle')}>
                    <input
                      checked={showRelativeGrid}
                      onChange={(event) => setShowRelativeGrid(event.target.checked)}
                      type="checkbox"
                    />
                    <Grid3X3 size={14} />
                    <span>{t(locale, 'relativeGrid')}</span>
                  </label>
                  <label
                    className="scene-strength-control"
                    title={t(locale, 'relativeGridStrengthTitle')}
                  >
                    <SlidersHorizontal size={13} />
                    <span>{t(locale, 'strength')}</span>
                    <input
                      aria-label={t(locale, 'relativeGridStrengthTitle')}
                      max="1"
                      min="0.2"
                      onChange={(event) => setRelativeGridStrength(normalizeRelativeGridStrength(event.target.value))}
                      step="0.05"
                      type="range"
                      value={relativeGridStrength}
                    />
                    <em>{Math.round(relativeGridStrength * 100)}</em>
                  </label>
                  <label className={showAxes ? 'active' : ''} title={t(locale, 'axesTitle')}>
                    <input
                      checked={showAxes}
                      onChange={(event) => setShowAxes(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'axes')}</span>
                  </label>
                  <label className={showRelativeAxes ? 'active' : ''} title={t(locale, 'relativeAxesTitle')}>
                    <input
                      checked={showRelativeAxes}
                      onChange={(event) => setShowRelativeAxes(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'relativeAxes')}</span>
                  </label>
                  <label className={showCoordinates ? 'active' : ''} title={t(locale, 'coordinatesTitle')}>
                    <input
                      checked={showCoordinates}
                      onChange={(event) => setShowCoordinates(event.target.checked)}
                      type="checkbox"
                    />
                    <Braces size={14} />
                    <span>{t(locale, 'coordinates')}</span>
                  </label>
                  {workspaceMode === 'system' && (
                    <label
                      className={showAutomaticSolution ? 'active' : ''}
                      title={t(locale, 'automaticSolutionTitle')}
                    >
                      <input
                        checked={showAutomaticSolution}
                        onChange={(event) => setShowAutomaticSolution(event.target.checked)}
                        type="checkbox"
                      />
                      <Sigma size={14} />
                      <span>{t(locale, 'automaticSolution')}</span>
                    </label>
                  )}
                  <label className={snapToInteger ? 'active' : ''} title={t(locale, 'snapDragTitle')}>
                    <input
                      checked={snapToInteger}
                      onChange={(event) => setSnapToInteger(event.target.checked)}
                      type="checkbox"
                    />
                    <Magnet size={14} />
                    <span>{t(locale, 'snapDrag')}</span>
                  </label>
                </div>
              </div>

              <div className="control-cluster vector-cluster">
                <span className="cluster-label">{t(locale, 'vector')}</span>
                <div className="scene-display-toggles compact-group" aria-label={t(locale, 'vectorDisplay')}>
                  <label className={showVector ? 'active' : ''} title={t(locale, 'vectorDisplay')}>
                    <input
                      checked={showVector}
                      onChange={(event) => setShowVector(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'vector')}</span>
                  </label>
                  <label className={showBasis ? 'active' : ''} title={t(locale, 'basisDisplay')}>
                    <input
                      checked={showBasis}
                      onChange={(event) => setShowBasis(event.target.checked)}
                      type="checkbox"
                    />
                    <Braces size={14} />
                    <span>{t(locale, 'basis')}</span>
                  </label>
                </div>

                {workspaceMode === 'transform' && (
                  <div className="scene-vector-legend vector-chip-row" aria-label={t(locale, 'vectorLegend')}>
                    <div className="legend-tools vector-visibility-tools" aria-label={t(locale, 'vectorAllDisplay')}>
                      <button
                        className="legend-tool"
                        onClick={hideAllVectorTargets}
                        title={t(locale, 'hideAll')}
                        type="button"
                      >
                        <EyeOff size={12} />
                      </button>
                      <button
                        className="legend-tool"
                        onClick={showAllVectorTargets}
                        title={t(locale, 'showAll')}
                        type="button"
                      >
                        <Eye size={12} />
                      </button>
                    </div>
                    {visibleBasisItems.map((item) => {
                      const targetId = `b:${item.id}`;
                      const itemVisible = basisVisibility[item.id] !== false;
                      return (
                        <div
                          className={`legend-vector basis-legend ${itemVisible ? 'active' : 'muted'} ${measureDraft.includes(targetId) ? 'selected' : ''}`}
                          key={targetId}
                          style={{ '--vector-color': item.colorHex }}
                        >
                          <button
                            aria-pressed={itemVisible}
                            className="legend-toggle"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleBasisLegendClick(item.id);
                            }}
                            title={`${item.name} ${measureMode ? t(locale, 'chooseForMeasure') : itemVisible ? t(locale, 'hide') : t(locale, 'show')}`}
                            type="button"
                          >
                            <span className="legend-swatch" />
                            <span>{item.name}</span>
                          </button>
                        </div>
                      );
                    })}
                    {transformedVectorItems.map((item) => (
                      <div
                        className={`legend-vector ${item.visible ? 'active' : 'muted'} ${
                          item.id === activeVectorId || measureDraft.includes(`v:${item.id}`) ? 'selected' : ''
                        }`}
                        key={item.id}
                        style={{ '--vector-color': item.colorHex }}
                      >
                        <button
                          aria-pressed={item.visible}
                          className="legend-toggle"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleVectorLegendClick(item.id);
                          }}
                          title={`${item.name} ${measureMode ? t(locale, 'chooseForMeasure') : item.visible ? t(locale, 'hide') : t(locale, 'show')} · ${formatCompactCoord(item.transformed, displayMode, 1)}`}
                          type="button"
                        >
                          <span className="legend-swatch" />
                          <span>{item.name}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {workspaceMode === 'transform' && (
                <div className="control-cluster measure-cluster">
                  <span className="cluster-label">{t(locale, 'measurement')}</span>
                  <div className="scene-vector-legend measure-chip-row" aria-label={t(locale, 'makeMeasurement')}>
                    <div className="legend-tools" aria-label={t(locale, 'makeMeasurement')}>
                      <button
                        className={`legend-tool ${measureMode === 'sum' ? 'active' : ''}`}
                        onClick={() => toggleMeasureMode('sum')}
                        title={t(locale, 'sumMakeTitle')}
                        type="button"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        className={`legend-tool ${measureMode === 'dot' ? 'active' : ''}`}
                        onClick={() => toggleMeasureMode('dot')}
                        title={t(locale, 'dotMakeTitle')}
                        type="button"
                      >
                        <Sigma size={12} />
                      </button>
                      <button
                        className={`legend-tool ${measureMode === 'volume' ? 'active' : ''}`}
                        onClick={() => toggleMeasureMode('volume')}
                        title={t(locale, 'volumeMakeTitle')}
                        type="button"
                      >
                        <Box size={12} />
                      </button>
                    </div>
                    {measureMode && (
                      <span className="measure-draft-chip">
                        {measureMode === 'sum'
                          ? t(locale, 'sum')
                          : measureMode === 'dot'
                          ? t(locale, 'dot')
                          : displayMode === '3d'
                            ? t(locale, 'volume')
                            : displayMode === '2d'
                              ? t(locale, 'area')
                              : t(locale, 'length')}
                        <strong>
                          {measureDraft
                            .map((id) => measureTargetMap.get(id)?.name)
                            .filter(Boolean)
                            .join(' → ') || t(locale, 'targetSelect')}
                        </strong>
                      </span>
                    )}
                    {measurementSummaries.map((item) => (
                      <div
                        className={`measure-chip measure-${item.type} ${item.type === 'volume' && item.targetIds?.length === 2 ? 'measure-area' : ''} ${item.visible === false ? 'muted' : ''}`}
                        key={item.id}
                      >
                        <button
                          onClick={() => toggleMeasurementVisible(item.id)}
                          title={t(locale, 'toggleMeasurement', {
                            type: item.type === 'dot' ? t(locale, 'dot') : item.type === 'sum' ? t(locale, 'sum') : t(locale, 'volume'),
                          })}
                          type="button"
                        >
                          <span>{item.type === 'dot' ? '∑' : item.type === 'sum' ? '+' : '□'}</span>
                          <strong>{item.label}</strong>
                          {item.value !== null && <em>{item.valueText ?? formatNumber(item.value)}</em>}
                        </button>
                        <button
                          className="measure-remove"
                          onClick={() => removeMeasurement(item.id)}
                          title={t(locale, 'removeMeasurement')}
                          type="button"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        <div
          className="scene-canvas"
          onPointerLeave={() => {
            setMeasurePointer(null);
            setHoveredMeasureTargetId(null);
          }}
          onPointerMove={updateMeasurePointer}
          ref={containerRef}
        >
          {measureDraftGuide && (
            <svg
              aria-hidden="true"
              className={`measure-draft-guide ${measureDraftGuide.snapped ? 'snapped' : ''}`}
            >
              <line
                x1={measureDraftGuide.x1}
                y1={measureDraftGuide.y1}
                x2={measureDraftGuide.x2}
                y2={measureDraftGuide.y2}
              />
              <circle cx={measureDraftGuide.x2} cy={measureDraftGuide.y2} r="4" />
            </svg>
          )}
          <svg
            aria-hidden="true"
            className="drag-snap-guide"
            ref={dragSnapGuideRef}
            style={{ display: 'none' }}
          >
            <line ref={dragSnapGuideLineRef} />
            <circle ref={dragSnapGuidePointRef} r="4" />
          </svg>
          {workspaceMode === 'system' && notebookSceneMatrices.length > 0 && (
            <NotebookMatrixCards
              boardMode={notebookFieldMode === 'board'}
              formatValue={(value) => formatMatrixNumber(parseNumber(value))}
              items={notebookSceneMatrices}
              matrixWord={t(locale, 'matrix')}
              annotation={notebookBoardAnnotation}
              operation={notebookBoardOperation}
              highlightedName={hoveredNotebookCaptionVariable}
            />
          )}
          {workspaceMode === 'system' && (activeNotebookCaption || notebookCheckpoint || notebookCompleted) && (
            <div
              className={`scene-caption ${notebookCaptionDragging ? 'dragging' : ''} ${notebookCheckpoint ? 'checkpoint' : ''} ${notebookInspectionActive ? 'inspect' : ''} ${notebookCompleted ? 'completed' : ''} ${notebookCheckpointCaptionHidden ? 'caption-hidden' : ''}`}
              aria-live="polite"
              ref={notebookCaptionRef}
              style={{
                '--scene-caption-x': `${notebookCaptionPosition.x}px`,
                '--scene-caption-y': `${notebookCaptionPosition.y}px`,
              }}
            >
              <div
                className="scene-caption-card"
                aria-hidden={notebookCheckpointCaptionHidden ? 'true' : undefined}
                onLostPointerCapture={() => {
                  notebookCaptionDragRef.current = null;
                  setNotebookCaptionDragging(false);
                }}
                onPointerCancelCapture={finishNotebookCaptionDrag}
                onPointerDownCapture={handleNotebookCaptionPointerDown}
                onPointerMoveCapture={handleNotebookCaptionPointerMove}
                onPointerUpCapture={finishNotebookCaptionDrag}
                title={t(locale, 'dragNotebookCaption')}
              >
                <span className="scene-caption-text">
                  {renderNotebookTaggedText(
                    activeNotebookCaption || t(
                      locale,
                      notebookInspectionActive
                        ? 'notebookInspectionHint'
                        : notebookCheckpoint
                          ? 'notebookCheckpointHint'
                          : 'notebookCompleteHint'
                    ),
                    notebookTokenStyles,
                    'scene-caption-variable',
                    {
                      hoveredVariable: hoveredNotebookCaptionVariable,
                      onVariableEnter: pointToNotebookCaptionVariable,
                      onVariableLeave: stopPointingToNotebookCaptionVariable,
                    }
                  )}
                </span>
              </div>
              {notebookCompleted && activeNotebookSegmentProgress >= 99.999 && (
                <div className="scene-caption-complete">
                  <Check size={14} />
                  <span>{t(locale, 'notebookComplete')}</span>
                </div>
              )}
            </div>
          )}
          {workspaceMode === 'system' && (notebookCheckpoint || notebookCompleted) && (
            <div
              className={`scene-caption-actions ${notebookCaptionDragging ? 'dragging' : ''} ${notebookInspectionActive ? 'inspect' : ''}`}
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                '--scene-caption-x': `${notebookCaptionPosition.x}px`,
                '--scene-caption-y': `${notebookCaptionPosition.y}px`,
              }}
            >
              <button
                aria-label={t(locale, 'dragNotebookCaption')}
                className="scene-caption-drag-affordance"
                onLostPointerCapture={() => {
                  notebookCaptionDragRef.current = null;
                  setNotebookCaptionDragging(false);
                }}
                onPointerCancelCapture={finishNotebookCaptionDrag}
                onPointerDownCapture={handleNotebookCaptionPointerDown}
                onPointerMoveCapture={handleNotebookCaptionPointerMove}
                onPointerUpCapture={finishNotebookCaptionDrag}
                title={t(locale, 'dragNotebookCaption')}
                type="button"
              >
                <GripHorizontal size={14} />
              </button>
              {notebookInspectionActive ? (
                <>
                  <button
                    className="scene-caption-action"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (notebookStopCameraRestorePendingRef.current) return;
                      restoreNotebookStopCamera();
                    }}
                    title={t(locale, 'restoreNotebookCheckpointView')}
                    type="button"
                  >
                    <RotateCcw size={13} />
                    <span>{t(locale, 'restoreNotebookCheckpointView')}</span>
                  </button>
                  <button
                    className="scene-caption-action primary mobile-essential"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleSmartNotebookPlayback();
                    }}
                    title={t(locale, 'nextNotebookCheckpoint')}
                    type="button"
                  >
                    <Play size={14} />
                    <span>{t(locale, 'nextNotebookCheckpoint')}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="scene-caption-action mobile-essential"
                    disabled={!previousNotebookReviewStep}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      returnToPreviousNotebookStep();
                    }}
                    title={t(locale, 'previousNotebookCheckpoint')}
                    type="button"
                  >
                    <ChevronLeft size={14} />
                    <span>{t(locale, 'previousNotebookCheckpoint')}</span>
                  </button>
                  <button
                    className="scene-caption-action mobile-essential"
                    disabled={!Number.isFinite(nextNotebookReviewCursor)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      advanceToNextNotebookStep();
                    }}
                    title={t(locale, 'nextNotebookReviewStep')}
                    type="button"
                  >
                    <ChevronRight size={14} />
                    <span>{t(locale, 'nextNotebookReviewStep')}</span>
                  </button>
                  <button
                    className={`scene-caption-action ${notebookCompleted ? 'primary mobile-essential' : ''}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (notebookCompleted) {
                        toggleNotebookSceneSegmentPlayback(activeNotebookSegment?.id);
                        return;
                      }
                      playCurrentNotebookCheckpoint();
                    }}
                    title={t(locale, 'playNotebookCheckpoint')}
                    type="button"
                  >
                    <Play size={13} />
                    <span>{t(locale, 'playNotebookCheckpoint')}</span>
                  </button>
                  <button
                    className="scene-caption-action"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (notebookStopCameraRestorePendingRef.current) return;
                      restoreNotebookStopCamera();
                    }}
                    title={t(locale, 'restoreNotebookCheckpointView')}
                    type="button"
                  >
                    <RotateCcw size={13} />
                    <span>{t(locale, 'restoreNotebookCheckpointView')}</span>
                  </button>
                  <button
                    className="scene-caption-action"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setHoveredNotebookCaptionVariable(null);
                      setNotebookCheckpointCaptionHidden((hidden) => !hidden);
                    }}
                    title={t(
                      locale,
                      notebookCheckpointCaptionHidden
                        ? 'showNotebookCheckpointCaption'
                        : 'hideNotebookCheckpointCaption'
                    )}
                    type="button"
                  >
                    {notebookCheckpointCaptionHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span>
                      {t(
                        locale,
                        notebookCheckpointCaptionHidden
                          ? 'showNotebookCheckpointCaption'
                          : 'hideNotebookCheckpointCaption'
                      )}
                    </span>
                  </button>
                  {notebookCheckpoint && (
                    <button
                      className="scene-caption-action primary mobile-essential"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleSmartNotebookPlayback();
                      }}
                      title={t(locale, 'continueNotebookCheckpoint')}
                      type="button"
                    >
                      <Play size={14} />
                      <span>{t(locale, 'continueNotebookCheckpoint')}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <span ref={vectorVolumeLabelRef} className="axis-label vector-volume-label">
            {t(locale, 'volume')} = 0
          </span>
          <span
            ref={iLabelRef}
            className={`axis-label axis-i draggable-axis measure-target-label ${measureDraft.includes('b:i') ? 'selected' : ''} ${hoveredMeasureTargetId === 'b:i' ? 'hovered' : ''}`}
            data-drag-key="i"
            onClick={(event) => {
              if (!measureMode) return;
              event.stopPropagation();
              if (measureDraft.length === 0) {
                startMeasurementFrom(measureMode, 'b:i', event);
                return;
              }
              pickMeasureTarget('b:i');
            }}
            onPointerEnter={() => setHoveredMeasureTargetId('b:i')}
            onPointerLeave={() => setHoveredMeasureTargetId(null)}
          >
            <span className="axis-label-text">i′</span>
            {renderLabelMeasureTools('b:i')}
          </span>
          <span
            ref={jLabelRef}
            className={`axis-label axis-j draggable-axis measure-target-label ${measureDraft.includes('b:j') ? 'selected' : ''} ${hoveredMeasureTargetId === 'b:j' ? 'hovered' : ''}`}
            data-drag-key="j"
            onClick={(event) => {
              if (!measureMode) return;
              event.stopPropagation();
              if (measureDraft.length === 0) {
                startMeasurementFrom(measureMode, 'b:j', event);
                return;
              }
              pickMeasureTarget('b:j');
            }}
            onPointerEnter={() => setHoveredMeasureTargetId('b:j')}
            onPointerLeave={() => setHoveredMeasureTargetId(null)}
          >
            <span className="axis-label-text">j′</span>
            {renderLabelMeasureTools('b:j')}
          </span>
          <span
            ref={kLabelRef}
            className={`axis-label axis-k draggable-axis measure-target-label ${measureDraft.includes('b:k') ? 'selected' : ''} ${hoveredMeasureTargetId === 'b:k' ? 'hovered' : ''}`}
            data-drag-key="k"
            onClick={(event) => {
              if (!measureMode) return;
              event.stopPropagation();
              if (measureDraft.length === 0) {
                startMeasurementFrom(measureMode, 'b:k', event);
                return;
              }
              pickMeasureTarget('b:k');
            }}
            onPointerEnter={() => setHoveredMeasureTargetId('b:k')}
            onPointerLeave={() => setHoveredMeasureTargetId(null)}
          >
            <span className="axis-label-text">k′</span>
            {renderLabelMeasureTools('b:k')}
          </span>
          {vectors.map((item) => (
            <span
              className={`axis-label axis-v draggable-axis measure-target-label ${measureDraft.includes(`v:${item.id}`) ? 'selected' : ''} ${hoveredMeasureTargetId === `v:${item.id}` ? 'hovered' : ''}`}
              data-drag-key={item.scalarEnabled ? `s:${item.id}` : `v:${item.id}`}
              key={`label-${item.id}`}
              onClick={(event) => {
                if (!measureMode) return;
                event.stopPropagation();
                if (measureDraft.length === 0) {
                  startMeasurementFrom(measureMode, `v:${item.id}`, event);
                  return;
                }
                pickMeasureTarget(`v:${item.id}`);
              }}
              onPointerEnter={() => setHoveredMeasureTargetId(`v:${item.id}`)}
              onPointerLeave={() => setHoveredMeasureTargetId(null)}
              ref={(node) => {
                if (node) vectorLabelRefs.current.set(item.id, node);
                else vectorLabelRefs.current.delete(item.id);
              }}
              style={{ color: colorToHex(item.color) }}
            >
              <span className="axis-label-text">{item.name}′</span>
              {renderLabelMeasureTools(`v:${item.id}`)}
            </span>
          ))}
          {vectors.map((item) => (
            <span
              className="axis-label axis-dot"
              key={`dot-${item.id}`}
              ref={(node) => {
                if (node) vectorDotLabelRefs.current.set(item.id, node);
                else vectorDotLabelRefs.current.delete(item.id);
              }}
              style={{ color: colorToHex(item.color) }}
            >
              A{activeVector.name}·A{item.name}
            </span>
          ))}
          {measurements.map((item) => {
            const measureKind = item.type === 'volume'
              ? volumeMeasureKind(item.targets?.length ?? 0)
              : item.type;
            return (
              <span
                className={`axis-label measurement-label measurement-${measureKind}`}
                key={`measurement-${item.id}`}
                ref={(node) => {
                  if (node) measurementLabelRefs.current.set(item.id, node);
                  else measurementLabelRefs.current.delete(item.id);
                }}
              >
                <span className="axis-label-text">
                  {item.type === 'dot' ? t(locale, 'dot') : item.type === 'sum' ? t(locale, 'sum') : t(locale, measureKind)}
                </span>
                {renderMeasurementLabelTools(item)}
              </span>
            );
          })}
          {equationLabelItems.map((item) => (
            <span
              className="axis-label equation-schema-label"
              key={`equation-label-${item.key}`}
              ref={(node) => {
                if (node) equationLabelRefs.current.set(item.key, node);
                else equationLabelRefs.current.delete(item.key);
              }}
              style={{ color: colorToHex(item.color) }}
            >
              <span className="axis-label-text">{item.name}</span>
            </span>
          ))}
          <span ref={scalarSolutionLabelRef} className="axis-label scalar-solution-label">
            <span className="axis-label-text">{t(locale, 'solution')} x = (0, 0, 0)</span>
          </span>
          <span ref={equationSolutionLabelRef} className="axis-label equation-solution-label">
            <span className="axis-label-text">{t(locale, 'solution')} x = (0, 0)</span>
          </span>
        </div>

        {workspaceMode === 'transform' && (
        <div className="progress-dock">
          <button
            className="icon-text-button danger"
            onClick={resetTransformation}
            title={t(locale, 'resetSpace')}
          >
            <RotateCcw size={18} />
            <span>{t(locale, 'reset')}</span>
          </button>
          <div className="progress-block">
            <div className="progress-meta">
              <span>{t(locale, 'animationLabel')}</span>
              <strong>{Math.round(progress * 100)}%</strong>
            </div>
            <div
              aria-label={t(locale, 'animationProgress')}
              aria-valuemax="100"
              aria-valuemin="0"
              aria-valuenow={Math.round(progress * 100)}
              className="progress-scrubber"
              onKeyDown={handleProgressKeyDown}
              onPointerDown={handleProgressPointerDown}
              ref={scrubTrackRef}
              role="slider"
              tabIndex={0}
            >
              <span className="progress-scrubber-fill" style={{ width: `${progress * 100}%` }} />
              <span className="progress-scrubber-thumb" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
          <button
            aria-pressed={isAnimationFocus}
            className={`icon-text-button animation-focus-button ${isAnimationFocus ? 'active' : ''}`}
            onClick={() => setIsAnimationFocus((value) => !value)}
            title={t(locale, isAnimationFocus ? 'animationFocusExitTitle' : 'animationFocusTitle')}
            type="button"
          >
            {isAnimationFocus ? <EyeOff size={17} /> : <Eye size={17} />}
            <span>{t(locale, isAnimationFocus ? 'animationFocusExit' : 'animationFocus')}</span>
          </button>
        </div>
        )}

        {workspaceMode === 'system' && (
          <NotebookSceneDock
            activeLineIndex={notebookActiveLineIndex}
            activeSegment={activeNotebookSegment}
            activeSegmentProgress={activeNotebookSegmentProgress}
            checkpoint={notebookCheckpoint}
            colorToHex={colorToHex}
            completed={notebookCompleted}
            isAnimationFocus={isAnimationFocus}
            isAnimationViewer={isAnimationViewer}
            marks={notebookSegmentTimelineMarks}
            onFocusToggle={() => setIsAnimationFocus((value) => !value)}
            onJumpToLine={jumpNotebookToLine}
            onProgressKeyDown={handleNotebookSceneProgressKeyDown}
            onProgressPointerDown={handleNotebookSceneProgressPointerDown}
            onSelectSegment={selectNotebookPlaybackSegment}
            onTogglePlayback={toggleNotebookSceneSegmentPlayback}
            operationPresentation={notebookOperationPresentation}
            playbackLabelKey={notebookScenePlaybackLabelKey}
            playing={notebookPlaying}
            progressRef={notebookSceneProgressRef}
            renderMath={(math) => renderNotebookTaggedText(`\`${math}\``, notebookTokenStyles)}
            segments={notebookPlaybackSegmentsList}
            translate={translate}
          />
        )}
        {workspaceMode === 'system' && (
          <div
            aria-hidden="true"
            className={`notebook-board-field ${notebookFieldMode === 'board' ? 'active' : ''}`}
          />
        )}
      </section>

      {!isAnimationViewer && isMobileViewport && !isAnimationFocus && (
        <aside
          aria-label={t(locale, 'mobileNotebookTitle')}
          className="mobile-notebook-pane"
          ref={panelScrollRef}
        >
          <section className="mobile-notebook-workspace">
            {renderNotebookComposer(toggleSmartNotebookPlayback, 'mobile-notebook-composer')}
          </section>
        </aside>
      )}

      {!isAnimationViewer && !isMobileViewport && isPanelVisible && (
        <div
          aria-label={t(locale, 'panelResize')}
          aria-orientation="vertical"
          aria-valuemax={maxControlPanelWidth(
            workspaceShellRef.current?.getBoundingClientRect().width
          )}
          aria-valuemin={CONTROL_PANEL_MIN_WIDTH}
          aria-valuenow={controlPanelWidth}
          aria-valuetext={`${controlPanelWidth}px`}
          className="control-panel-resizer"
          onKeyDown={handleControlPanelResizeKeyDown}
          onPointerDown={handleControlPanelResizePointerDown}
          role="separator"
          tabIndex={0}
          title={t(locale, 'panelResize')}
        >
          <span aria-hidden="true" />
        </div>
      )}

      {!isAnimationViewer && !isMobileViewport && (
      <aside
        className={`control-panel ${isPanelVisible ? 'open' : 'closed'}`}
        onDragStart={preventPanelNativeDrag}
        onPointerCancel={stopPanelPointerPropagation}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={stopPanelPointerPropagation}
        onPointerUp={stopPanelPointerPropagation}
        onWheel={stopPanelPointerPropagation}
        style={{
          bottom: '0px',
          clipPath: isPanelVisible ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)',
          opacity: isPanelVisible ? 1 : 0,
          pointerEvents: isPanelVisible ? 'auto' : 'none',
          transform: 'none',
          '--panel-mobile-clip': isPanelVisible ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)',
          '--panel-mobile-opacity': isPanelVisible ? 1 : 0,
          '--panel-mobile-pointer': isPanelVisible ? 'auto' : 'none',
        }}
      >
        {/* Transform workspace is retained in code but temporarily hidden behind the feature flag. */}
        {TRANSFORM_WORKSPACE_ENABLED && (
          <div className="workspace-tabs" role="tablist" aria-label={t(locale, 'workspaceMode')}>
            <button
              className={workspaceMode === 'system' ? 'active' : ''}
              onClick={() => switchWorkspaceMode('system')}
            >
              {t(locale, 'system')}
            </button>
            <button
              className={workspaceMode === 'transform' ? 'active' : ''}
              onClick={() => switchWorkspaceMode('transform')}
            >
              {t(locale, 'transform')}
            </button>
          </div>
        )}

        <div className={`panel-scroll mode-${workspaceMode}`} ref={panelScrollRef}>
          {workspaceMode === 'transform' && (
            <section className="panel transform-inline-timeline" aria-label={t(locale, 'spaceTimeline')}>
              <div
                className="drawer-history-list"
                aria-label={t(locale, 'transformHistory')}
                ref={historyStripRef}
              >
                {displayedHistoryEntries.map(({ step, index }) => (
                  <div
                    className={`history-item ${index === activeHistoryIndex ? 'active' : ''} ${
                      index === previewIndex && index !== activeHistoryIndex ? 'preview' : ''
                    }`}
                    data-history-index={index}
                    key={`${step.name}-${index}`}
                    onFocus={() => setHoveredHistoryIndex(index)}
                    onMouseEnter={() => setHoveredHistoryIndex(index)}
                    onMouseMove={() => setHoveredHistoryIndex(index)}
                    onMouseLeave={() => setHoveredHistoryIndex(null)}
                    onPointerEnter={() => setHoveredHistoryIndex(index)}
                    onPointerMove={() => setHoveredHistoryIndex(index)}
                    onPointerLeave={() => setHoveredHistoryIndex(null)}
                  >
                    <button
                      className="history-pill"
                      onBlur={() => setHoveredHistoryIndex(null)}
                      onClick={() => jumpToHistory(index)}
                      title={step.name}
                    >
                      <span className="history-index">{index}</span>
                      <strong>{step.name}</strong>
                      <MatrixMini
                        matrix={step.matrix}
                        mode={step.stateMode ?? modeForMatrix(step.matrix)}
                        className="compact"
                      />
                    </button>
                    {history.length > 1 && (
                      <button
                        className="history-delete"
                        onClick={(event) => deleteHistoryEntry(index, event)}
                        onPointerDown={(event) => event.stopPropagation()}
                        title={t(locale, 'deleteHistory')}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel system-main-panel">
            {renderNotebookComposer(toggleSmartNotebookPlayback)}

            <div
              className="equation-note-editor"
              style={{ '--note-lines': Math.max(5, equations.length) }}
            >
              <div className="equation-note-rail" aria-hidden="true">
                {equations.map((equation, index) => {
                  const item =
                    lineSystem.mode === '3d'
                      ? lineSystem.planes.find((plane) => plane.index === index)
                      : lineSystem.lines.find((line) => line.index === index);
                  const color = item?.color ?? equationLineColors[index % equationLineColors.length];
                  const prefix = lineSystem.mode === '3d' ? 'P' : 'L';
                  const invalid = lineSystem.errors?.includes(index + 1);
                  return (
                    <span
                      className={invalid ? 'invalid' : ''}
                      key={index}
                      style={{ '--line-color': `#${color.toString(16).padStart(6, '0')}` }}
                    >
                      {prefix}{index + 1}
                    </span>
                  );
                })}
              </div>
              <textarea
                aria-label={t(locale, 'equationNote')}
                spellCheck="false"
                wrap="off"
                value={equations.join('\n')}
                placeholder={t(locale, 'equationNotePlaceholder')}
                onKeyDown={handleEquationNoteKeyDown}
                onBlur={(event) => updateEquationNote(prettifyEquationNoteText(event.target.value))}
                onChange={(event) => updateEquationNote(event.target.value)}
              />
            </div>

            <div className={`line-status-card ${lineSystem.status}`}>
              <div className="solver-topline">
                <span>{t(locale, 'status')}</span>
                <strong>{t(locale, statusKeyForLineSystemDisplay(lineSystem, effectiveSystemMode))}</strong>
              </div>
              {lineSystemInfo.kindKey && (
                <div className="system-solution-readout">
                  <span>{t(locale, 'solution')}</span>
                  <strong>{t(locale, lineSystemInfo.kindKey)}</strong>
                  {lineSystemInfo.solutionText && <code>{lineSystemInfo.solutionText}</code>}
                </div>
              )}
              {typeof lineSystemInfo.rankA === 'number' && (
                <div className="system-fact-grid">
                  <span>
                    <em>{t(locale, 'systemFactRank')}</em>
                    <strong>{lineSystemInfo.rankA} → {lineSystemInfo.rankAugmented}</strong>
                  </span>
                  <span>
                    <em>{t(locale, 'systemFactDimension')}</em>
                    <strong>{lineSystemInfo.solutionDimension === null ? '-' : `${lineSystemInfo.solutionDimension}D`}</strong>
                  </span>
                  <span>
                    <em>{t(locale, 'systemFactFree')}</em>
                    <strong>{lineSystemInfo.freeCount}</strong>
                  </span>
                  <span>
                    <em>{t(locale, 'systemFactEquations')}</em>
                    <strong>{lineSystemInfo.equationCount}/{lineSystemInfo.variableCount}</strong>
                  </span>
                </div>
              )}
              {lineSystem.status === 'invalid' && (
                <p className="solver-note">{t(locale, 'invalidLineNote', { items: lineSystem.errors.join(', L') })}</p>
              )}
              {lineSystem.status === 'same' && (
                <p className="line-note">{t(locale, 'sameLineNote')}</p>
              )}
              {lineSystem.status === 'parallel' && (
                <p className="line-note">{t(locale, 'parallelLineNote')}</p>
              )}
              {lineSystem.status === 'none' && (
                <p className="line-note">{t(locale, 'noCommonLineNote')}</p>
              )}
              {lineSystem.status === 'single3d' && effectiveSystemMode === '3d' && (
                <p className="line-note">{t(locale, 'single3dNote')}</p>
              )}
              {lineSystem.status === 'infinite3d' && (
                <>
                  <p className="line-note">{t(locale, 'infinite3dNote')}</p>
                </>
              )}
              {lineSystem.status === 'none3d' && (
                <p className="line-note">{t(locale, 'no3dNote')}</p>
              )}
              <p className="system-education-note">{t(locale, lineSystemInfo.noteKey)}</p>
              {!!lineSystem.relations.length && (
                <div className="relation-list">
                  {lineSystem.relations.map((relation, index) => (
                    <span key={index}>{relationText(relation, lineSystem.lines)}</span>
                  ))}
                </div>
              )}
              {lineSystem.point && (
                <button className="secondary-action compact-action" onClick={applyLineSystemPointToVector}>
                  {t(locale, 'applyPointToVector', { name: activeVector.name })}
                </button>
              )}
            </div>

            {false && (
            <div className="notebook-cell-stack">
              <div className="notebook-cell-head">
                <span>{t(locale, 'notebook')}</span>
                <button className="tiny-add-button" onClick={addNotebookMatrixCell} title={t(locale, 'addNotebookCell')} type="button">
                  <Plus size={14} />
                </button>
              </div>
              {notebookCells.map((cell, index) => (
                <div className="notebook-matrix-cell" key={cell.id}>
                  <div className="notebook-cell-index">{index + 1}</div>
                  <div className="notebook-cell-main">
                    <div className="notebook-cell-title">
                      <strong>{t(locale, 'notebookMatrixCell')}</strong>
                      <span>{notebookMatrixModeFromText(cell.text, cell.mode).toUpperCase()}</span>
                    </div>
                    <MatrixInput
                      values={cell.values}
                      columns={systemMatrixDimension}
                      accent={cell.mode === '3d' ? 'teal' : 'red'}
                      onChange={(values) => updateNotebookCellValues(cell.id, values)}
                      onEnter={() => runNotebookMatrixCell(cell)}
                      translate={translate}
                    />
                  </div>
                  <div className="notebook-cell-actions">
                    <button className="notebook-run-button" onClick={() => runNotebookMatrixCell(cell)} type="button">
                      <Play size={13} />
                      <span>{t(locale, 'runNotebookCell')}</span>
                    </button>
                    <label className="notebook-progress-control">
                      <span>{Math.round(progress * 100)}%</span>
                      <input
                        aria-label={t(locale, 'notebookProgress')}
                        max="100"
                        min="0"
                        onChange={(event) => scrubNotebookProgress(event.target.value)}
                        type="range"
                        value={Math.round(progress * 100)}
                      />
                    </label>
                    <button
                      className="notebook-remove-button"
                      disabled={notebookCells.length <= 1}
                      onClick={() => removeNotebookCell(cell.id)}
                      title={t(locale, 'deleteEquation')}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>

          <section className="panel current-space-panel">
            <div className="section-heading spread current-space-heading">
              <span className="heading-left">
                <Grid3X3 size={17} />
                <h3>{t(locale, 'currentSpace')}</h3>
              </span>
              <button
                aria-expanded="true"
                className="timeline-open-button"
                onClick={() => historyStripRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
                type="button"
              >
                {t(locale, 'timeline')}
                <span>{history.length}</span>
              </button>
            </div>
            {previewHistory && (
              <TransformHistoryDetail
                entry={previewHistory}
                index={previewIndex}
                isActive={previewIndex === activeHistoryIndex}
                translate={translate}
              />
            )}
          </section>

          <section className="panel matrix-panel">
            <div className="section-heading spread">
              <span className="heading-left">
                <Braces size={17} />
                <h3>{t(locale, 'matrixInput')}</h3>
              </span>
              <div className="matrix-header-tools">
                <div className="matrix-clipboard">
                  <button aria-label={t(locale, 'matrixCopy')} onClick={copyMatrixInput} title={t(locale, 'matrixCopy')}>
                    <Copy size={14} />
                  </button>
                  <button
                    aria-label={t(locale, 'matrixPaste')}
                    onClick={pasteMatrixInput}
                    title={t(locale, 'matrixPaste')}
                  >
                    <ClipboardPaste size={14} />
                  </button>
                </div>
                <div className="segmented" role="tablist" aria-label={t(locale, 'matrixDimension')}>
                  <button className={inputMode === '3d' ? 'active' : ''} onClick={() => setInputMode('3d')}>3x{inputColumns}</button>
                  <button className={inputMode === '2d' ? 'active' : ''} onClick={() => setInputMode('2d')}>2x{inputColumns}</button>
                  <button className={inputMode === '1d' ? 'active' : ''} onClick={() => setInputMode('1d')}>1x{inputColumns}</button>
                </div>
              </div>
            </div>
            <div className="matrix-workspace">
              <div className="matrix-input-column">
                <div className="matrix-input-zone">
                  <MatrixInput
                    values={previewMatrixInputValues}
                    columns={inputColumns}
                    accent={
                      hoveredMatrixPreset
                        ? 'preview'
                        : inputMode === '3d'
                          ? 'teal'
                          : inputMode === '2d'
                            ? 'red'
                            : 'gold'
                    }
                    onChange={updateMatrixInputValues}
                    onEnter={applyCurrentInput}
                    translate={translate}
                  />
                </div>

                <button className="primary-action" onClick={applyCurrentInput}>
              {t(locale, 'applyMatrix')}
            </button>
              </div>
              <div className="matrix-preset-dock">
              <div className="preset-dock-head">
                <RotateCcw size={14} />
                <span>{t(locale, 'matrixPresets')}</span>
              </div>
              <div className="matrix-presets">
                {visibleMatrixPresets.map((preset) => (
                  <div className="matrix-preset-item" key={preset.id}>
                  <button
                    className={`${activeMatrixPresetId === preset.id ? 'active' : ''} ${hoveredMatrixPresetId === preset.id ? 'previewing' : ''}`}
                    onClick={() => loadPresetToMatrixInput(preset)}
                    onBlur={() => setHoveredMatrixPresetId(null)}
                    onFocus={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseLeave={() => setHoveredMatrixPresetId(null)}
                    onPointerEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onPointerLeave={() => setHoveredMatrixPresetId(null)}
                    ref={(node) => {
                      if (node) {
                        matrixPresetRefs.current[preset.id] = node;
                      } else {
                        delete matrixPresetRefs.current[preset.id];
                      }
                    }}
                    title={t(locale, 'presetLoadTitle', { name: preset.name })}
                    type="button"
                  >
                    <strong>{preset.name}</strong>
                  </button>
                  <button
                    aria-label={t(locale, 'presetApplyTitle', { name: preset.name })}
                    className="matrix-preset-apply"
                    onBlur={() => setHoveredMatrixPresetId(null)}
                    onClick={(event) => applyMatrixPresetDirectly(preset, event)}
                    onFocus={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseLeave={() => setHoveredMatrixPresetId(null)}
                    onPointerEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onPointerLeave={() => setHoveredMatrixPresetId(null)}
                    title={t(locale, 'presetApplyNow')}
                    type="button"
                  >
                    <Play size={12} />
                  </button>
                  </div>
                ))}
              </div>
              </div>
            </div>
          </section>

          <section className="panel vector-panel vector-solver-panel">
            <div className="section-heading spread">
              <span className="heading-left">
                <VectorSquare size={17} />
                <h3>{t(locale, 'vectorTracking')}</h3>
              </span>
              <div className="vector-heading-tools">
                <button className="tiny-add-button" onClick={addVector} title={t(locale, 'addVector')} type="button">
                  <Plus size={14} />
                </button>
              </div>
              <div className="segmented compact" role="tablist" aria-label={t(locale, 'vectorTools')}>
                <button
                  className={vectorToolMode === 'vector' ? 'active' : ''}
                  onClick={() => setVectorToolMode('vector')}
                >
                  {t(locale, 'vector')}
                </button>
                <button
                  className={vectorToolMode === 'system' ? 'active' : ''}
                  onClick={() => setVectorToolMode('system')}
                >
                  {t(locale, 'system')}
                </button>
              </div>
            </div>

            {vectorToolMode === 'vector' && (
              <div className="vector-stack">
                <div className={`basis-stack mode-${displayMode}`}>
                  <div className="vector-subhead">
                    <strong>{t(locale, 'baseBasis')}</strong>
                    <span>{t(locale, 'fixed')}</span>
                  </div>
                  <div className="basis-compact-card">
                    {visibleBasisItems.map((item) => {
                      const itemVisible = basisVisibility[item.id] !== false;
                      return (
                      <div
                        className={`basis-compact-row ${itemVisible ? '' : 'scene-hidden'}`}
                        key={item.id}
                        style={{ '--vector-color': item.colorHex }}
                      >
                        <span className="vector-chip locked-chip basis-chip">
                          <span className="vector-swatch" />
                          {item.name}
                        </span>
                        <div className={`basis-compact-inputs mode-${displayMode}`}>
                          {(displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z']).map((axis) => {
                            const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
                            return (
                            <input
                              aria-label={`${item.name} ${axis}`}
                              key={axis}
                              value={formatInputValue(item.values[axisIndex])}
                              inputMode="decimal"
                              onChange={(event) => updateBasisInputValue(item.id, axis, event.target.value)}
                            />
                            );
                          })}
                        </div>
                        <span className="basis-compact-meta">
                          {formatCompactCoord(item.values, '3d', 1)} · {formatNumber(item.lengthSquared, 1)}
                        </span>
                        <button
                          aria-label={`${item.name} ${itemVisible ? t(locale, 'hide') : t(locale, 'show')}`}
                          className={`visibility-toggle-button ${itemVisible ? '' : 'muted'}`}
                          onClick={() => toggleBasisVisible(item.id)}
                          title={`${item.name} ${itemVisible ? t(locale, 'hide') : t(locale, 'show')}`}
                          type="button"
                        >
                          {itemVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          aria-label={t(locale, 'resetBasisAria', { name: item.name })}
                          className="basis-reset-button"
                          onClick={() => resetBasisVector(item.id)}
                          title={t(locale, 'resetBasis', { name: item.name })}
                          type="button"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
                {transformedVectorItems.map((item) => {
                  const axes = displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z'];
                  return (
                    <div
                      className={`vector-card ${item.id === activeVectorId ? 'active' : ''} ${measureDraft.includes(`v:${item.id}`) ? 'measuring' : ''} ${showVector ? '' : 'muted'} ${item.visible ? '' : 'scene-hidden'} ${item.scalarEnabled ? 'scalar-active' : ''}`}
                      data-vector-id={item.id}
                      key={item.id}
                      style={{ '--vector-color': item.colorHex }}
                    >
                      <div className="vector-card-head">
                        <div className="vector-chip-wrap">
                          <button
                            className="vector-chip"
                            aria-pressed={item.visible}
                            onClick={() => {
                              setActiveVectorId(item.id);
                              toggleVectorVisible(item.id);
                            }}
                            title={`${item.name} ${item.visible ? t(locale, 'hide') : t(locale, 'show')}`}
                            type="button"
                          >
                            <span className="vector-swatch" />
                            {item.name}
                          </button>
                        </div>
                        <div className={`vector-inline-inputs mode-${displayMode} has-scalar ${item.scalarEnabled ? '' : 'scalar-off'}`}>
                          {axes.map((axis) => (
                            <label className="vector-inline-field" key={axis}>
                              <span>{axis}</span>
                              <input
                                value={item[axis]}
                                inputMode="decimal"
                                onChange={(event) => updateVectorValue(item.id, axis, event.target.value)}
                                onFocus={() => setActiveVectorId(item.id)}
                              />
                            </label>
                          ))}
                          {item.scalarEnabled && (
                            <label className="vector-inline-field scalar-inline-field">
                              <span>=</span>
                              <input
                                aria-label={t(locale, 'scalarValue', { name: item.name })}
                                inputMode="decimal"
                                placeholder={t(locale, 'auto')}
                                value={cleanScalarText(item.scalar)}
                                onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                                onFocus={() => setActiveVectorId(item.id)}
                              />
                            </label>
                          )}
                        </div>
                        <label className={`scalar-mini-toggle ${item.scalarEnabled ? 'active' : ''}`} title={t(locale, 'scalarConstraint')}>
                          <input
                            checked={item.scalarEnabled}
                            onChange={(event) => toggleVectorScalar(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          <span>{t(locale, 'scalar')}</span>
                        </label>
                        <button
                          aria-label={`${item.name} ${item.visible ? t(locale, 'hide') : t(locale, 'show')}`}
                          className={`visibility-toggle-button ${item.visible ? '' : 'muted'}`}
                          onClick={() => toggleVectorVisible(item.id)}
                          title={`${item.name} ${item.visible ? t(locale, 'hide') : t(locale, 'show')}`}
                          type="button"
                        >
                          {item.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          className="line-remove"
                          onClick={() => removeVector(item.id)}
                          title={t(locale, 'vectorDelete')}
                          type="button"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className={`scalar-control ${item.scalarEnabled ? 'active' : ''}`}>
                        <label className="compact-check scalar-toggle">
                          <input
                            checked={item.scalarEnabled}
                            onChange={(event) => toggleVectorScalar(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          {t(locale, 'scalar')}
                        </label>
                        <input
                          aria-label={t(locale, 'scalarValue', { name: item.name })}
                          className="scalar-input"
                          disabled={!item.scalarEnabled}
                          inputMode="decimal"
                          placeholder={t(locale, 'auto')}
                          value={cleanScalarText(item.scalar)}
                          onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                        />
                        <span className="scalar-equation">
                          {item.scalarSpace === 'input' ? '' : 'A'}{item.name} · x =
                        </span>
                        <span className="scalar-auto">
                          {item.scalarAuto ? `${t(locale, 'auto')} ${formatNumber(item.scalarResolved)}` : formatNumber(item.scalarResolved)}
                        </span>
                        <div className="scalar-space-toggle" aria-label={t(locale, 'scalarSpace')}>
                          <button
                            className={item.scalarSpace === 'input' ? 'active' : ''}
                            onClick={() => updateVectorScalarSpace(item.id, 'input')}
                            title={t(locale, 'scalarInputTitle')}
                            type="button"
                          >
                            {t(locale, 'inputSpaceShort')}
                          </button>
                          <button
                            className={item.scalarSpace === 'output' ? 'active' : ''}
                            onClick={() => updateVectorScalarSpace(item.id, 'output')}
                            title={t(locale, 'scalarOutputTitle')}
                            type="button"
                          >
                            {t(locale, 'outputSpaceShort')}
                          </button>
                        </div>
                        <input
                          aria-label={t(locale, 'scalarDrag', { name: item.name })}
                          className="scalar-slider"
                          disabled={!item.scalarEnabled}
                          max="20"
                          min="-20"
                          step="0.1"
                          type="range"
                          value={Math.max(-20, Math.min(20, item.scalarResolved))}
                          onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
                {showDot && dotVectorItems.length > 1 && (
                  <div className="dot-matrix-card">
                    <div className="dot-card-head">
                      <strong><span className="dot-badge">{t(locale, 'dot')}</span> {t(locale, 'dotBetweenVectors')}</strong>
                      <span>{dotVectorItems.length}×{dotVectorItems.length}</span>
                    </div>
                    {dotVectorItems.length > 0 ? (
                      <div
                        className="dot-grid"
                        style={{ gridTemplateColumns: `46px repeat(${dotVectorItems.length}, minmax(48px, 1fr))` }}
                      >
                        <span className="dot-grid-corner" />
                        {dotVectorItems.map((item) => (
                          <span className="dot-grid-head" key={`col-${item.id}`} style={{ '--vector-color': item.colorHex }}>
                            {item.name}
                          </span>
                        ))}
                        {dotVectorItems.map((row) => (
                          <Fragment key={`row-${row.id}`}>
                            <span className="dot-grid-head row-head" style={{ '--vector-color': row.colorHex }}>
                              {row.name}
                            </span>
                            {dotVectorItems.map((col) => (
                              <span className="dot-grid-cell" key={`${row.id}-${col.id}`}>
                                {formatNumber(dotValues(row.transformed, col.transformed))}
                              </span>
                            ))}
                          </Fragment>
                        ))}
                      </div>
                    ) : (
                      <div className="dot-empty">{t(locale, 'noDotVectors')}</div>
                    )}
                    {vectorDotPairs.length > 0 && (
                      <div className="dot-pair-list">
                        {vectorDotPairs.map((pair) => (
                          <div className="dot-pair-row" key={pair.id}>
                            <span><span className="dot-badge subtle">{t(locale, 'dot')}</span> A{pair.left.name} · A{pair.right.name}</span>
                            <strong>{formatNumber(pair.value)}</strong>
                            <em>
                              {t(locale, pair.relation)}
                              {pair.cosine !== null ? ` / cos ${formatNumber(pair.cosine)}` : ''}
                            </em>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {showVolume && vectorVolumeMeasure && (
                  <div className="dot-matrix-card vector-volume-card">
                    <div className="dot-card-head">
                      <strong>
                        <span className="dot-badge subtle">{t(locale, 'volume')}</span>
                        {vectorVolumeMeasure.type === 'volume' ? ` ${t(locale, 'vectorVolume')}` : ` ${t(locale, 'vectorArea')}`}
                      </strong>
                      <span>{vectorVolumeMeasure.names.map((name) => `A${name}`).join(' · ')}</span>
                    </div>
                    <div className="dot-pair-row">
                      <span>{vectorVolumeMeasure.type === 'volume' ? t(locale, 'parallelepiped') : t(locale, 'parallelogram')}</span>
                      <strong>{formatNumber(vectorVolumeMeasure.value)}</strong>
                      <em>{vectorVolumeMeasure.type === 'volume' ? t(locale, 'tripleProduct') : t(locale, 'crossLength')}</em>
                    </div>
                  </div>
                )}
              </div>
            )}

            {vectorToolMode === 'system' && (
              <div className="system-solver">
                <div className="equation-presets" aria-label={t(locale, 'systemExamples')}>
                  <button onClick={() => setEquations(equationExamples.unique)}>{t(locale, 'unique')}</button>
                  <button onClick={() => setEquations(equationExamples.infinite)}>{t(locale, 'infinite')}</button>
                  <button onClick={() => setEquations(equationExamples.none)}>{t(locale, 'noSolution')}</button>
                </div>

                <div className="equation-list">
                  {equations.map((equation, index) => (
                    <label key={index}>
                      <span>E{index + 1}</span>
                      <input
                        value={equation}
                        placeholder={index === 0 ? '2x + 3y + 4z = 5' : 'x - y = 1'}
                        onChange={(event) => updateEquation(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>

                <div className={`solver-card ${equationSolution.status}`}>
                  <div className="solver-topline">
                    <span>{t(locale, 'status')}</span>
                    <strong>
                      {equationSolution.status === 'unique' && t(locale, 'unique')}
                      {equationSolution.status === 'infinite' && t(locale, 'infiniteMany')}
                      {equationSolution.status === 'none' && t(locale, 'noSolution')}
                      {equationSolution.status === 'invalid' && t(locale, 'invalidFormat')}
                      {equationSolution.status === 'empty' && t(locale, 'waitingInput')}
                    </strong>
                  </div>

                  {equationSolution.status !== 'empty' && equationSolution.status !== 'invalid' && (
                    <div className="solver-rank-row">
                      <span>rank(A) <strong>{equationSolution.rankA}</strong></span>
                      <span>rank([A|b]) <strong>{equationSolution.rankAugmented}</strong></span>
                    </div>
                  )}

                  {equationSolution.status === 'invalid' && (
                    <p className="solver-note">{t(locale, 'invalidEquationNote', { items: equationSolution.errors.join(', E') })}</p>
                  )}

                  {equationSolution.status === 'unique' && (
                    <div className="solution-stack">
                      <span>{t(locale, 'solution')}</span>
                      <strong>{formatSolutionTuple(equationSolution.solution)}</strong>
                      <small>
                        x={formatNumber(equationSolution.solution[0])}, y={formatNumber(equationSolution.solution[1])}, z={formatNumber(equationSolution.solution[2])}
                      </small>
                    </div>
                  )}

                  {equationSolution.status === 'infinite' && (
                    <div className="solution-stack">
                      <span>{t(locale, 'generalSolution')}</span>
                      <strong>{formatGeneralSolution(equationSolution)}</strong>
                      <small>Null(A): {equationSolution.nullspaceBasis.map(formatSolutionTuple).join(', ')}</small>
                    </div>
                  )}

                  {equationSolution.status === 'none' && (
                    <p className="solver-note">{t(locale, 'contradictionNote')}</p>
                  )}
                </div>

                <button
                  className="secondary-action"
                  disabled={!equationSolution.solution}
                  onClick={applyEquationSolutionToVector}
                >
                  {t(locale, 'applySolutionToVector')}
                </button>
              </div>
            )}
          </section>

          <section className="panel vector-panel legacy-vector-panel" aria-hidden="true">
            <div className="section-heading">
              <VectorSquare size={17} />
              <h3>{t(locale, 'vectorTracking')}</h3>
            </div>
            <div
              className={`vector-inputs mode-${displayMode} ${showVector ? '' : 'muted'}`}
            >
              {(displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z']).map((axis) => (
                <label key={axis}>
                  <span>{axis}</span>
                  <input
                    value={activeVector[axis]}
                    inputMode="decimal"
                    onChange={(event) => updateVectorValue(activeVector.id, axis, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="vector-result">
              <span>Av</span>
              <strong>{formatCoord(transformedVector, displayMode)}</strong>
            </div>
            <div className="vector-result dot-result">
              <span>Av · Av</span>
              <strong>{formatNumber(dotValues(transformedVector, transformedVector))}</strong>
            </div>
          </section>
        </div>
      </aside>
      )}

      </div>
      <AdSlot config={monetizationConfig} placement="bottom" translate={translate} />
    </main>
  );
}

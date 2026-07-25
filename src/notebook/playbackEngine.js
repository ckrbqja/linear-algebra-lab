export const NOTEBOOK_DEFAULT_DURATIONS = Object.freeze({
  caption: 2.8,
  captionMax: 6.5,
  checkpointCaption: 1,
  captionClear: 0.45,
  pause: 1.2,
  camera: 1,
  orbit: 6,
  scene: null,
  focus: 0.65,
  solution: 1.4,
  solutionNoCommonPoint: 3.35,
  equation: 0.9,
  vector: 0.9,
  matrix: 1.15,
  matrixReveal: 1.6,
  calculation: 1.2,
  measurement: 0.9,
  reference: 0.8,
  remove: 0.45,
  setupSettle: 0.45,
});

const NOTEBOOK_UNTIMED_MIN_MS_PER_PERCENT = 6;
const NOTEBOOK_LINE_REVEAL_OFFSET = 0.16;
const NOTEBOOK_SETUP_COMMANDS = new Set([
  'axes',
  'relativeAxes',
  'grid',
  'relativeGrid',
  'coordinates',
  'basis',
  'vectors',
]);
const NOTEBOOK_BATCHABLE_SCENE_COMMANDS = new Set([
  'view',
  'zoom',
  ...NOTEBOOK_SETUP_COMMANDS,
]);
const NOTEBOOK_VISUAL_REVEAL_TYPES = new Set([
  'equation',
  'vector',
  'matrix',
  'slice',
  'calc',
  'measurement',
  'solution',
  'ref',
]);
const NOTEBOOK_LEARNER_STOP_TYPES = new Set(['checkpoint', 'inspect']);
const NOTEBOOK_REVIEW_SKIP_TYPES = new Set(['checkpoint', 'inspect', 'pause']);

const NOTEBOOK_SCENE_DIMENSIONS = new Set(['1d', '2d', '3d']);

function notebookSceneBatchCell(run) {
  if (run.length < 2) return run;
  const first = run[0];
  const last = run.at(-1);
  const value = Object.fromEntries(run.map((cell) => [cell.command, cell.value]));
  const durationSec = run
    .map((cell) => cell.durationSec)
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .reduce((maximum, duration) => Math.max(maximum, duration), 0) || null;
  return [{
    id: `script-scene-batch-${first.lineStart}-${last.lineEnd}`,
    type: 'scene',
    command: 'preset',
    value,
    implicitBatch: true,
    hidden: false,
    durationSec,
    lineStart: first.lineStart,
    lineEnd: last.lineEnd,
  }];
}

export function batchNotebookSceneSetupCells(sourceCells) {
  const cells = Array.isArray(sourceCells) ? sourceCells : [];
  const batched = [];
  let run = [];
  let commands = new Set();

  const flush = () => {
    batched.push(...notebookSceneBatchCell(run));
    run = [];
    commands = new Set();
  };

  cells.forEach((cell) => {
    const batchable = Boolean(
      cell &&
      cell.type === 'scene' &&
      NOTEBOOK_BATCHABLE_SCENE_COMMANDS.has(cell.command) &&
      !cell.hidden &&
      !cell.durationExplicit
    );
    if (!batchable || commands.has(cell.command)) {
      flush();
      if (!batchable) {
        batched.push(cell);
        return;
      }
    }
    run.push(cell);
    commands.add(cell.command);
  });
  flush();

  return batched;
}

export function notebookOpeningSceneState(sourceCells, defaults = {}) {
  const cells = Array.isArray(sourceCells) ? sourceCells : [];
  const fallbackDimension = NOTEBOOK_SCENE_DIMENSIONS.has(defaults.dimension)
    ? defaults.dimension
    : '3d';
  const fallbackView = NOTEBOOK_SCENE_DIMENSIONS.has(defaults.view)
    ? defaults.view
    : fallbackDimension;
  const state = {
    dimension: fallbackDimension,
    view: fallbackView,
  };

  for (const cell of cells) {
    if (!cell || cell.hidden) continue;
    if (cell.type !== 'scene') break;

    if (cell.command === 'dimension' && NOTEBOOK_SCENE_DIMENSIONS.has(cell.value)) {
      state.dimension = cell.value;
      state.view = cell.value;
      continue;
    }
    if (cell.command === 'view' && NOTEBOOK_SCENE_DIMENSIONS.has(cell.value)) {
      state.view = cell.value;
      continue;
    }
    if (cell.command === 'preset' && cell.value && typeof cell.value === 'object') {
      if (NOTEBOOK_SCENE_DIMENSIONS.has(cell.value.dimension)) {
        state.dimension = cell.value.dimension;
        state.view = cell.value.dimension;
      }
      if (NOTEBOOK_SCENE_DIMENSIONS.has(cell.value.view)) state.view = cell.value.view;
    }
  }

  return state;
}

export function notebookActiveLineIndexForCursor(rawCursor, lineCount) {
  const count = Math.max(1, Number(lineCount) || 1);
  const cursor = Math.max(0, Math.min(100, Number(rawCursor) || 0));
  if (cursor <= 0) return -1;
  const linePosition = (cursor / 100) * count;
  return Math.min(count - 1, Math.max(0, Math.ceil(Math.max(0, linePosition - 0.000001)) - 1));
}

export function notebookCursorForLineReveal(lineIndex, lineCount) {
  const count = Math.max(1, Number(lineCount) || 1);
  const index = Math.max(0, Math.min(count - 1, Number(lineIndex) || 0));
  return Math.max(0, Math.min(100, ((index + NOTEBOOK_LINE_REVEAL_OFFSET) / count) * 100));
}

export function notebookCursorForLineStart(lineIndex, lineCount) {
  const count = Math.max(1, Number(lineCount) || 1);
  const index = Math.max(0, Math.min(count - 1, Number(lineIndex) || 0));
  return Math.max(0, Math.min(100, (index / count) * 100));
}

export function notebookPlaybackLineCount(sourceCells, sourceLineCount, minimumLineCount = 1) {
  const cells = Array.isArray(sourceCells) ? sourceCells : [];
  const lastLineFromCells = Math.max(
    0,
    ...cells.map((cell, index) => (
      Number.isFinite(cell?.lineEnd)
        ? cell.lineEnd
        : Number.isFinite(cell?.lineStart)
          ? cell.lineStart
          : index
    ))
  );
  return Math.max(
    1,
    Number(minimumLineCount) || 1,
    Number(sourceLineCount) || 0,
    lastLineFromCells + 1
  );
}

export function notebookCheckpointStops(sourceCells, sourceLineCount, minimumLineCount = 1) {
  return notebookPlaybackStops(sourceCells, sourceLineCount, minimumLineCount)
    .filter((item) => item.cell.type === 'checkpoint');
}

export function notebookPlaybackStops(sourceCells, sourceLineCount, minimumLineCount = 1) {
  const cells = Array.isArray(sourceCells) ? sourceCells : [];
  const lineCount = notebookPlaybackLineCount(cells, sourceLineCount, minimumLineCount);
  return cells
    .map((cell, index) => ({
      cell,
      index,
      cursor: (((cell?.lineEnd ?? cell?.lineStart ?? index) + 1) / lineCount) * 100,
    }))
    .filter((item) => NOTEBOOK_LEARNER_STOP_TYPES.has(item.cell?.type) && !item.cell.hidden);
}

export function notebookPlaybackSegments(sourceCells, sourceLineCount, minimumLineCount = 1) {
  const stops = notebookPlaybackStops(sourceCells, sourceLineCount, minimumLineCount);
  const ordinals = { checkpoint: 0, inspect: 0 };
  let startCursor = 0;
  let previousStopId = null;
  const segments = stops.map((stop) => {
    const kind = stop.cell.type === 'inspect' ? 'inspect' : 'checkpoint';
    ordinals[kind] += 1;
    const segment = {
      id: `stop:${stop.cell.id}`,
      kind,
      ordinal: ordinals[kind],
      startCursor,
      endCursor: stop.cursor,
      previousStopId,
      stop,
    };
    startCursor = stop.cursor;
    previousStopId = stop.cell.id;
    return segment;
  });

  if (!segments.length || startCursor < 99.999) {
    segments.push({
      id: 'final',
      kind: 'final',
      ordinal: 1,
      startCursor,
      endCursor: 100,
      previousStopId,
      stop: null,
    });
  }

  return segments;
}

export function notebookReviewSteps(sourceCells, sourceLineCount, segment, minimumLineCount = 1) {
  if (!segment) return [];
  const cells = Array.isArray(sourceCells) ? sourceCells : [];
  const lineCount = notebookPlaybackLineCount(cells, sourceLineCount, minimumLineCount);
  const segmentStart = Math.max(0, Math.min(100, Number(segment.startCursor) || 0));
  const segmentEnd = Math.max(segmentStart, Math.min(100, Number(segment.endCursor) || segmentStart));
  const seenCursors = new Set();

  return cells
    .map((cell, index) => {
      const lineStart = Number.isFinite(cell?.lineStart) ? cell.lineStart : index;
      return {
        cell,
        cursor: (lineStart / lineCount) * 100,
      };
    })
    .filter(({ cell, cursor }) => {
      if (!cell || cell.hidden || NOTEBOOK_REVIEW_SKIP_TYPES.has(cell.type)) return false;
      if (cursor < segmentStart - 0.0001 || cursor >= segmentEnd - 0.0001) return false;
      const key = cursor.toFixed(6);
      if (seenCursors.has(key)) return false;
      seenCursors.add(key);
      return true;
    })
    .sort((left, right) => left.cursor - right.cursor);
}

export function notebookSegmentProgress(rawCursor, segment) {
  if (!segment) return 0;
  const start = Number(segment.startCursor) || 0;
  const end = Number(segment.endCursor) || start;
  const span = Math.max(0.000001, end - start);
  return Math.max(0, Math.min(100, ((Number(rawCursor) - start) / span) * 100));
}

export function notebookCursorForSegmentProgress(rawProgress, segment) {
  if (!segment) return Math.max(0, Math.min(100, Number(rawProgress) || 0));
  const start = Number(segment.startCursor) || 0;
  const end = Number(segment.endCursor) || start;
  const progress = Math.max(0, Math.min(100, Number(rawProgress) || 0)) / 100;
  return start + (end - start) * progress;
}

export function notebookCaptionDurationSec(text) {
  const visibleText = String(text ?? '')
    .replace(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/gu, '$1')
    .replace(/`([^`\n]+?)`/gu, '$1')
    .replace(/\\n/gu, ' ')
    .trim();
  if (!visibleText) return NOTEBOOK_DEFAULT_DURATIONS.caption;
  const characterCount = [...visibleText].filter((character) => !/\s/u.test(character)).length;
  const wordCount = visibleText.split(/\s+/u).filter(Boolean).length;
  const readingDuration = Math.max(
    NOTEBOOK_DEFAULT_DURATIONS.caption,
    1.1 + characterCount * 0.07,
    1.2 + wordCount * 0.32
  );
  return Math.min(NOTEBOOK_DEFAULT_DURATIONS.captionMax, readingDuration);
}

export function notebookDurationSec(explicitDurationSec, kind, options = {}) {
  if (Number.isFinite(explicitDurationSec) && explicitDurationSec > 0) return explicitDurationSec;
  if (options.hidden) return null;
  if (kind === 'caption' && options.remove) return NOTEBOOK_DEFAULT_DURATIONS.captionClear;
  if (options.remove) return NOTEBOOK_DEFAULT_DURATIONS.remove;
  if (kind === 'caption') return notebookCaptionDurationSec(options.text);
  if (kind === 'solution' && options.noCommonPoint) {
    return NOTEBOOK_DEFAULT_DURATIONS.solutionNoCommonPoint;
  }
  return NOTEBOOK_DEFAULT_DURATIONS[kind] ?? null;
}

function captionLearnerStopType(sourceCells, cellIndex) {
  const cell = sourceCells[cellIndex];
  if (!cell || cell.type !== 'caption' || cell.remove || cell.durationExplicit) return null;
  for (let index = cellIndex + 1; index < sourceCells.length; index += 1) {
    const next = sourceCells[index];
    if (!next || next.hidden) continue;
    if (next.type === 'caption' || next.type === 'pause') return null;
    if (NOTEBOOK_LEARNER_STOP_TYPES.has(next.type)) return next.type;
  }
  return null;
}

function notebookCellPlaybackDurationSec(cell) {
  if (!cell || cell.hidden) return null;
  if (Number.isFinite(cell.durationSec) && cell.durationSec > 0) return cell.durationSec;
  if (cell.remove) {
    return cell.type === 'caption'
      ? NOTEBOOK_DEFAULT_DURATIONS.captionClear
      : NOTEBOOK_DEFAULT_DURATIONS.remove;
  }
  if (cell.type === 'matrix') {
    return cell.execute ? NOTEBOOK_DEFAULT_DURATIONS.matrix : NOTEBOOK_DEFAULT_DURATIONS.matrixReveal;
  }
  if (cell.type === 'ref' && cell.refKind === 'matrix') {
    return cell.execute === false
      ? NOTEBOOK_DEFAULT_DURATIONS.matrixReveal
      : NOTEBOOK_DEFAULT_DURATIONS.matrix;
  }
  if (cell.type === 'vector' && cell.execute === false) return null;
  if (cell.type === 'equation') return NOTEBOOK_DEFAULT_DURATIONS.equation;
  if (cell.type === 'calc') return NOTEBOOK_DEFAULT_DURATIONS.calculation;
  return NOTEBOOK_DEFAULT_DURATIONS[cell.type] ?? null;
}

function notebookSetupSettleSegments(sourceCells, lineCount, startValue, endValue, speed) {
  const playbackSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const segments = [];
  let setupRun = [];

  const nextSetupConsumer = (startIndex) => {
    for (let index = startIndex; index < sourceCells.length; index += 1) {
      const cell = sourceCells[index];
      if (!cell || cell.hidden) continue;
      if (NOTEBOOK_VISUAL_REVEAL_TYPES.has(cell.type)) return cell;
      if (cell.type === 'caption' && captionLearnerStopType(sourceCells, index)) continue;
      return cell;
    }
    return null;
  };

  const flush = (nextVisibleCell = null) => {
    if (!setupRun.length) return;
    const lastSetup = setupRun.at(-1);
    if (nextVisibleCell && NOTEBOOK_VISUAL_REVEAL_TYPES.has(nextVisibleCell.type)) {
      const startLine = Number.isFinite(lastSetup.lineStart) ? lastSetup.lineStart : 0;
      const endLine = Number.isFinite(lastSetup.lineEnd) ? lastSetup.lineEnd : startLine;
      const segment = {
        start: clampNotebookSegmentPercent(notebookLinePercent(startLine, lineCount), startValue, endValue),
        end: clampNotebookSegmentPercent(notebookLinePercent(endLine + 1, lineCount), startValue, endValue),
        duration: Math.max(120, NOTEBOOK_DEFAULT_DURATIONS.setupSettle * 1000 / playbackSpeed),
      };
      if (segment.end - segment.start > 0.001) segments.push(segment);
    }
    setupRun = [];
  };

  sourceCells.forEach((cell, index) => {
    if (!cell || cell.hidden) return;
    const isUntimedSetup = cell.type === 'scene' && !Number.isFinite(cell.durationSec) && (
      NOTEBOOK_SETUP_COMMANDS.has(cell.command) || cell.implicitBatch === true
    );
    if (isUntimedSetup) {
      setupRun.push(cell);
      return;
    }
    flush(nextSetupConsumer(index));
  });
  flush(null);
  return segments;
}

function notebookLinePercent(line, lineCount) {
  return (line / Math.max(1, lineCount)) * 100;
}

function clampNotebookSegmentPercent(value, startValue, endValue) {
  return Math.max(startValue, Math.min(endValue, value));
}

function notebookTimedSegmentsForCells(sourceCells, lineCount, startValue, endValue, speed) {
  return [...sourceCells]
    .flatMap((cell, index) => {
      const lineDurations = Array.isArray(cell.lineDurations) ? cell.lineDurations : [];
      if (lineDurations.length) {
        return lineDurations
          .filter((item) => Number.isFinite(item.durationSec) && item.durationSec > 0)
          .map((item) => {
            const line = Number.isFinite(item.line)
              ? item.line
              : (Number.isFinite(cell.lineStart) ? cell.lineStart : index);
            return {
              start: clampNotebookSegmentPercent(notebookLinePercent(line, lineCount), startValue, endValue),
              end: clampNotebookSegmentPercent(notebookLinePercent(line + 1, lineCount), startValue, endValue),
              duration: Math.max(120, item.durationSec * 1000 / speed),
            };
          });
      }
      const learnerStopType = captionLearnerStopType(sourceCells, index);
      const durationSec = learnerStopType === 'checkpoint'
        ? NOTEBOOK_DEFAULT_DURATIONS.checkpointCaption
        : learnerStopType
          ? null
          : notebookCellPlaybackDurationSec(cell);
      if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
      const startLine = Number.isFinite(cell.lineStart) ? cell.lineStart : index;
      const endLine = Number.isFinite(cell.lineEnd) ? cell.lineEnd : startLine;
      return [{
        start: clampNotebookSegmentPercent(notebookLinePercent(startLine, lineCount), startValue, endValue),
        end: clampNotebookSegmentPercent(notebookLinePercent(endLine + 1, lineCount), startValue, endValue),
        duration: Math.max(120, durationSec * 1000 / speed),
      }];
    })
    .filter((segment) => segment.end - segment.start > 0.001)
    .sort((a, b) => a.start - b.start);
}

export function buildNotebookPlaybackSegments({
  startCursor,
  endCursor,
  sourceCells,
  lineCount,
  duration,
  speed,
}) {
  const startValue = Math.max(0, Math.min(100, Number(startCursor) || 0));
  const endValue = Math.max(0, Math.min(100, Number(endCursor) || 0));
  const direction = Math.sign(endValue - startValue) || 1;
  if (direction < 0) {
    return [{ from: startValue, to: endValue, duration: Math.max(1, Number(duration) || 1) }];
  }

  const timedCells = [
    ...notebookTimedSegmentsForCells(sourceCells, lineCount, startValue, endValue, speed),
    ...notebookSetupSettleSegments(sourceCells, lineCount, startValue, endValue, speed),
  ].sort((a, b) => a.start - b.start);
  const requestedDuration = Math.max(1, Number(duration) || 1);
  const timedDuration = timedCells.reduce((sum, segment) => sum + segment.duration, 0);
  const learnerStopOwnsCaptionDwell = sourceCells.some((cell, index) => (
    captionLearnerStopType(sourceCells, index)
  ));
  let untimedSpan = 0;
  let spanCursor = startValue;
  timedCells.forEach((cellSegment) => {
    if (cellSegment.start > spanCursor + 0.001) {
      untimedSpan += cellSegment.start - spanCursor;
    }
    spanCursor = Math.max(spanCursor, cellSegment.end);
  });
  if (endValue > spanCursor + 0.001) untimedSpan += endValue - spanCursor;

  const playbackSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const fallbackTravelMsPerPercent = NOTEBOOK_UNTIMED_MIN_MS_PER_PERCENT / playbackSpeed;
  const budgetTravelMsPerPercent = untimedSpan > 0
      ? (learnerStopOwnsCaptionDwell ? 0 : Math.max(0, requestedDuration - timedDuration) / untimedSpan)
    : 0;
  const untimedMsPerPercent = Math.max(fallbackTravelMsPerPercent, budgetTravelMsPerPercent);
  const segments = [];
  let cursor = startValue;

  timedCells.forEach((cellSegment) => {
    if (cellSegment.start > cursor + 0.001) {
      segments.push({
        from: cursor,
        to: cellSegment.start,
        duration: Math.max(1, (cellSegment.start - cursor) * untimedMsPerPercent),
      });
    }
    segments.push({
      from: cellSegment.start,
      to: cellSegment.end,
      duration: cellSegment.duration,
    });
    cursor = Math.max(cursor, cellSegment.end);
  });
  if (endValue > cursor + 0.001) {
    segments.push({
      from: cursor,
      to: endValue,
      duration: Math.max(1, (endValue - cursor) * untimedMsPerPercent),
    });
  }

  return segments.length
    ? segments
    : [{ from: startValue, to: endValue, duration: Math.max(1, requestedDuration) }];
}

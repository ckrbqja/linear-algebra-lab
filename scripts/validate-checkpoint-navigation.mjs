import assert from 'node:assert/strict';
import {
  batchNotebookSceneSetupCells,
  buildNotebookPlaybackSegments,
  notebookCheckpointStops,
  notebookActiveLineIndexForCursor,
  notebookCursorForLineStart,
  notebookCursorForSegmentProgress,
  notebookPlaybackSegments,
  notebookPlaybackStops,
  notebookSegmentProgress,
  notebookPlaybackLineCount,
} from '../src/notebook/playbackEngine.js';

const cells = [
  { id: 'caption-1', type: 'caption', lineStart: 0, lineEnd: 0 },
  { id: 'checkpoint-1', type: 'checkpoint', lineStart: 1, lineEnd: 1 },
  { id: 'hidden-checkpoint', type: 'checkpoint', lineStart: 3, lineEnd: 3, hidden: true },
  { id: 'inspect-1', type: 'inspect', lineStart: 4, lineEnd: 4 },
  { id: 'checkpoint-2', type: 'checkpoint', lineStart: 5, lineEnd: 5 },
];

assert.equal(notebookPlaybackLineCount(cells, 6, 10), 10);

const stops = notebookCheckpointStops(cells, 6, 10);
assert.deepEqual(stops.map((stop) => stop.cell.id), ['checkpoint-1', 'checkpoint-2']);
assert.deepEqual(stops.map((stop) => stop.index), [1, 4]);
assert.deepEqual(stops.map((stop) => stop.cursor), [20, 60]);

const activeIndex = stops.findIndex((stop) => stop.cell.id === 'checkpoint-2');
assert.equal(stops[activeIndex - 1].cell.id, 'checkpoint-1');

const playbackStops = notebookPlaybackStops(cells, 6, 10);
assert.deepEqual(
  playbackStops.map((stop) => stop.cell.id),
  ['checkpoint-1', 'inspect-1', 'checkpoint-2']
);
assert.equal(playbackStops[1].cursor, 50);

const segments = notebookPlaybackSegments(cells, 6, 10);
assert.deepEqual(
  segments.map((segment) => [segment.kind, segment.startCursor, segment.endCursor]),
  [
    ['checkpoint', 0, 20],
    ['inspect', 20, 50],
    ['checkpoint', 50, 60],
    ['final', 60, 100],
  ]
);
assert.equal(notebookSegmentProgress(35, segments[1]), 50);
assert.equal(notebookCursorForSegmentProgress(50, segments[1]), 35);
assert.equal(notebookCursorForLineStart(3, 10), 30);
assert.equal(notebookActiveLineIndexForCursor(notebookCursorForLineStart(3, 10), 10), 2);

const batchedSceneCells = batchNotebookSceneSetupCells([
  { id: 'zoom', type: 'scene', command: 'zoom', value: 0.8, durationSec: 1, lineStart: 0, lineEnd: 0 },
  { id: 'grid', type: 'scene', command: 'grid', value: false, lineStart: 1, lineEnd: 1 },
  { id: 'relative-grid', type: 'scene', command: 'relativeGrid', value: true, lineStart: 2, lineEnd: 2 },
  { id: 'basis', type: 'scene', command: 'basis', value: true, lineStart: 3, lineEnd: 3 },
  { id: 'coordinates', type: 'scene', command: 'coordinates', value: false, lineStart: 4, lineEnd: 4 },
]);
assert.equal(batchedSceneCells.length, 1);
assert.equal(batchedSceneCells[0].command, 'preset');
assert.equal(batchedSceneCells[0].implicitBatch, true);
assert.equal(batchedSceneCells[0].lineStart, 0);
assert.equal(batchedSceneCells[0].lineEnd, 4);
assert.deepEqual(batchedSceneCells[0].value, {
  zoom: 0.8,
  grid: false,
  relativeGrid: true,
  basis: true,
  coordinates: false,
});
assert.equal(batchedSceneCells[0].durationSec, 1);

const toggleBatchWithReveal = batchNotebookSceneSetupCells([
  { id: 'grid', type: 'scene', command: 'grid', value: false, lineStart: 0, lineEnd: 0 },
  { id: 'relative-grid', type: 'scene', command: 'relativeGrid', value: true, lineStart: 1, lineEnd: 1 },
  { id: 'basis', type: 'scene', command: 'basis', value: true, lineStart: 2, lineEnd: 2 },
  { id: 'vector', type: 'vector', name: 'v', lineStart: 3, lineEnd: 3 },
]);
const togglePlayback = buildNotebookPlaybackSegments({
  startCursor: 0,
  endCursor: 100,
  sourceCells: toggleBatchWithReveal,
  lineCount: 4,
  duration: 1000,
  speed: 1,
});
assert.deepEqual(
  togglePlayback.filter((segment) => segment.duration >= 450).map((segment) => [segment.from, segment.to, segment.duration]),
  [[0, 75, 450], [75, 100, 900]],
);

const declarationOnlyVectorPlayback = buildNotebookPlaybackSegments({
  startCursor: 0,
  endCursor: 100,
  sourceCells: [
    { id: 'declared-vector', type: 'vector', execute: false, lineStart: 0, lineEnd: 0 },
    { id: 'visible-vector', type: 'vector', execute: true, lineStart: 1, lineEnd: 1 },
  ],
  lineCount: 2,
  duration: 1,
  speed: 1,
});
assert.deepEqual(
  declarationOnlyVectorPlayback.map((segment) => [segment.from, segment.to, segment.duration]),
  [[0, 50, 300], [50, 100, 900]],
  'a named vector without @ is untimed declaration-only state'
);

console.log('checkpoint navigation validation passed');

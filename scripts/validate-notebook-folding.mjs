import assert from 'node:assert/strict';
import {
  isNotebookSceneSetupLine,
  notebookSceneSetupFoldRanges,
} from '../src/notebook/editor/monacoFolding.js';

assert.equal(isNotebookSceneSetupLine('relative-grid on'), true);
assert.equal(isNotebookSceneSetupLine('view 2d 1s'), true);
assert.equal(isNotebookSceneSetupLine('A with view 2d'), false);
assert.equal(isNotebookSceneSetupLine('A * v  #Av@'), false);
assert.equal(isNotebookSceneSetupLine('// 장면을 설명합니다'), false);

const ranges = notebookSceneSetupFoldRanges([
  'focus -',
  'clear',
  'space reset',
  '',
  'basis on',
  'grid off',
  'relative-grid on',
  '',
  '1 0 0  #A',
  '0 1 0',
  '0 0 0',
  '',
  '// A를 적용합니다',
  'A with view 2d',
]);

assert.deepEqual(ranges, [{ start: 1, end: 7, commandCount: 6 }]);
console.log('Notebook scene-setup folding validation passed.');

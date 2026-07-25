import assert from 'node:assert/strict';
import {
  notebookBoardAnnotationText,
  parseNotebookBoardAnnotationExpression,
  staggeredBoardCellProgress,
} from '../src/notebook/board/boardAnnotation.js';

const row = parseNotebookBoardAnnotationExpression('mark row(A, 2)');
assert.deepEqual(row, { clear: false, kind: 'row', matrixName: 'A', row: 1 });
assert.equal(notebookBoardAnnotationText(row), 'mark row(A, 2)');

const pivot = parseNotebookBoardAnnotationExpression('mark pivot(U, 2, 2)');
assert.deepEqual(pivot, {
  clear: false,
  kind: 'pivot',
  matrixName: 'U',
  row: 1,
  column: 1,
});
assert.equal(notebookBoardAnnotationText(pivot), 'mark pivot(U, 2, 2)');

assert.deepEqual(parseNotebookBoardAnnotationExpression('mark staircase(U)'), {
  clear: false,
  kind: 'staircase',
  matrixName: 'U',
});
assert.deepEqual(parseNotebookBoardAnnotationExpression('mark -'), { clear: true });
assert.equal(parseNotebookBoardAnnotationExpression('mark cell(A, 0, 1)'), null);

const firstHalf = staggeredBoardCellProgress(0.42, 0, 2);
const secondHalf = staggeredBoardCellProgress(0.42, 1, 2);
assert.ok(firstHalf > secondHalf, 'the first changed cell must animate before the second');
assert.equal(staggeredBoardCellProgress(1, 0, 3), 1);
assert.equal(staggeredBoardCellProgress(1, 2, 3), 1);

console.log('Algebra-board annotation validation passed.');

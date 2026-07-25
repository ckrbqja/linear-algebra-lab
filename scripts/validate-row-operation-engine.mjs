import assert from 'node:assert/strict';
import {
  analyzeElementaryRowProduct,
  formatEliminationCalculation,
  formatRowOperationCellCalculation,
  formatRowOperationNotation,
  inferElementaryRowOperation,
} from '../src/notebook/rowOperationEngine.js';

function matrix(rows) {
  return {
    rows: rows.length,
    columns: rows[0].length,
    shapeValues: rows.flat(),
  };
}

const coefficient = matrix([
  [1, 1],
  [2, -1],
]);
const replacement = matrix([
  [1, 0],
  [-2, 1],
]);
const upper = matrix([
  [1, 1],
  [0, -3],
]);

const replacementOperation = analyzeElementaryRowProduct(replacement, coefficient, upper);
assert.ok(replacementOperation, 'replacement elementary matrix should be inferred');
assert.equal(replacementOperation.kind, 'replace');
assert.equal(replacementOperation.targetRow, 1);
assert.equal(replacementOperation.sourceRow, 0);
assert.equal(replacementOperation.factor, -2);
assert.deepEqual(replacementOperation.resultValues, [1, 1, 0, -3]);
assert.deepEqual(
  replacementOperation.eliminatedCells.map(({ row, column, before, source, after }) => ({ row, column, before, source, after })),
  [{ row: 1, column: 0, before: 2, source: 1, after: 0 }]
);
assert.equal(formatRowOperationNotation(replacementOperation), 'R₂ ← R₂ − 2R₁');
assert.equal(formatEliminationCalculation(replacementOperation.eliminatedCells[0]), '2 − 2·1 = 0');
assert.equal(formatRowOperationCellCalculation(replacementOperation, replacementOperation.changedCells[1]), '-1 − 2·1 = -3');

const swapOperation = inferElementaryRowOperation(matrix([
  [0, 1],
  [1, 0],
]));
assert.equal(swapOperation?.kind, 'swap');
assert.deepEqual(swapOperation?.targetRows, [0, 1]);
assert.equal(formatRowOperationNotation(swapOperation), 'R₁ ↔ R₂');

const scaleOperation = inferElementaryRowOperation(matrix([
  [1, 0],
  [0, '-1/3'],
]));
assert.equal(scaleOperation?.kind, 'scale');
assert.equal(scaleOperation?.targetRow, 1);
assert.equal(scaleOperation?.factor, -1 / 3);

assert.equal(
  inferElementaryRowOperation(matrix([
    [2, 1],
    [0, 1],
  ])),
  null,
  'a general matrix must not be mislabeled as one elementary row operation'
);

assert.equal(
  analyzeElementaryRowProduct(replacement, coefficient, matrix([[1, 1], [0, -2]])),
  null,
  'a mismatched authored result must not receive row-operation choreography'
);

console.log('Row-operation engine validation passed (replace, swap, scale, rejection).');

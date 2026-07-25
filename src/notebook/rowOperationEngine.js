const DEFAULT_TOLERANCE = 1e-9;

function isNear(left, right, tolerance = DEFAULT_TOLERANCE) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function parseEntry(value) {
  const source = String(value ?? '').trim();
  const fraction = source.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/u);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return Math.abs(denominator) > DEFAULT_TOLERANCE ? Number(fraction[1]) / denominator : 0;
  }
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function notebookMatrixData(matrix) {
  const rows = Math.max(1, Math.min(3, Number(matrix?.rows) || 0));
  const columns = Math.max(1, Math.min(3, Number(matrix?.columns) || rows));
  const source = Array.isArray(matrix?.shapeValues) && matrix.shapeValues.length >= rows * columns
    ? matrix.shapeValues
    : Array.isArray(matrix?.values)
      ? matrix.values
      : [];
  const values = Array.from({ length: rows * columns }, (_, index) => parseEntry(source[index]));
  return { rows, columns, values };
}

export function multiplyNotebookMatrixData(leftMatrix, rightMatrix) {
  const left = notebookMatrixData(leftMatrix);
  const right = notebookMatrixData(rightMatrix);
  if (left.columns !== right.rows) return null;

  const values = [];
  for (let row = 0; row < left.rows; row += 1) {
    for (let column = 0; column < right.columns; column += 1) {
      let sum = 0;
      for (let shared = 0; shared < left.columns; shared += 1) {
        sum += left.values[row * left.columns + shared] * right.values[shared * right.columns + column];
      }
      values.push(sum);
    }
  }
  return { rows: left.rows, columns: right.columns, values };
}

function inferRowSwap(matrix, tolerance) {
  const size = matrix.rows;
  const rowTargets = [];
  const usedColumns = new Set();
  for (let row = 0; row < size; row += 1) {
    const nonzero = [];
    for (let column = 0; column < size; column += 1) {
      const value = matrix.values[row * size + column];
      if (!isNear(value, 0, tolerance)) nonzero.push({ column, value });
    }
    if (nonzero.length !== 1 || !isNear(nonzero[0].value, 1, tolerance)) return null;
    if (usedColumns.has(nonzero[0].column)) return null;
    usedColumns.add(nonzero[0].column);
    rowTargets.push(nonzero[0].column);
  }

  const changedRows = rowTargets
    .map((column, row) => column === row ? -1 : row)
    .filter((row) => row >= 0);
  if (changedRows.length !== 2) return null;
  const [firstRow, secondRow] = changedRows;
  if (rowTargets[firstRow] !== secondRow || rowTargets[secondRow] !== firstRow) return null;
  return {
    kind: 'swap',
    targetRows: [firstRow, secondRow],
    sourceRows: [secondRow, firstRow],
    firstRow,
    secondRow,
  };
}

export function inferElementaryRowOperation(matrixLike, tolerance = DEFAULT_TOLERANCE) {
  const matrix = notebookMatrixData(matrixLike);
  if (matrix.rows !== matrix.columns || matrix.rows < 2) return null;

  const swap = inferRowSwap(matrix, tolerance);
  if (swap) return { ...swap, size: matrix.rows };

  const differences = [];
  for (let row = 0; row < matrix.rows; row += 1) {
    for (let column = 0; column < matrix.columns; column += 1) {
      const value = matrix.values[row * matrix.columns + column];
      const identityValue = row === column ? 1 : 0;
      if (!isNear(value, identityValue, tolerance)) {
        differences.push({ row, column, value });
      }
    }
  }

  if (differences.length !== 1) return null;
  const difference = differences[0];
  if (difference.row === difference.column) {
    if (isNear(difference.value, 0, tolerance)) return null;
    return {
      kind: 'scale',
      size: matrix.rows,
      targetRows: [difference.row],
      sourceRows: [],
      targetRow: difference.row,
      factor: difference.value,
      coefficientCells: [{ row: difference.row, column: difference.column }],
    };
  }

  return {
    kind: 'replace',
    size: matrix.rows,
    targetRows: [difference.row],
    sourceRows: [difference.column],
    targetRow: difference.row,
    sourceRow: difference.column,
    factor: difference.value,
    coefficientCells: [
      { row: difference.row, column: difference.column },
      { row: difference.row, column: difference.row },
    ],
  };
}

function matrixValuesMatch(actual, expected, tolerance) {
  return actual.rows === expected.rows &&
    actual.columns === expected.columns &&
    actual.values.every((value, index) => isNear(value, expected.values[index], tolerance));
}

export function analyzeElementaryRowProduct(
  leftMatrix,
  rightMatrix,
  resultMatrix = null,
  tolerance = DEFAULT_TOLERANCE
) {
  const operation = inferElementaryRowOperation(leftMatrix, tolerance);
  if (!operation) return null;

  const right = notebookMatrixData(rightMatrix);
  const computed = multiplyNotebookMatrixData(leftMatrix, rightMatrix);
  if (!computed || operation.size !== right.rows) return null;
  if (resultMatrix) {
    const result = notebookMatrixData(resultMatrix);
    if (!matrixValuesMatch(result, computed, tolerance)) return null;
  }

  const changedCells = [];
  const eliminatedCells = [];
  const affectedRows = new Set(operation.targetRows);
  operation.targetRows.forEach((row) => {
    for (let column = 0; column < right.columns; column += 1) {
      const before = right.values[row * right.columns + column];
      const after = computed.values[row * computed.columns + column];
      const source = operation.kind === 'replace'
        ? right.values[operation.sourceRow * right.columns + column]
        : null;
      const change = {
        row,
        column,
        before,
        after,
        source,
        factor: operation.factor ?? null,
      };
      if (!isNear(before, after, tolerance)) changedCells.push(change);
      if (
        operation.kind === 'replace' &&
        !isNear(before, 0, tolerance) &&
        isNear(after, 0, tolerance)
      ) {
        eliminatedCells.push(change);
      }
    }
  });

  return {
    ...operation,
    rows: right.rows,
    columns: right.columns,
    sourceValues: right.values,
    resultValues: computed.values,
    affectedRows: [...affectedRows],
    changedCells,
    eliminatedCells,
  };
}

function subscriptNumber(value) {
  const digits = '0123456789';
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return String(value).split('').map((digit) => subscripts[digits.indexOf(digit)] ?? digit).join('');
}

export function formatRowOperationNotation(operation, formatNumber = String) {
  if (!operation) return '';
  if (operation.kind === 'swap') {
    return `R${subscriptNumber(operation.firstRow + 1)} ↔ R${subscriptNumber(operation.secondRow + 1)}`;
  }
  const target = `R${subscriptNumber(operation.targetRow + 1)}`;
  if (operation.kind === 'scale') {
    return `${target} ← ${formatNumber(operation.factor)}${target}`;
  }
  const source = `R${subscriptNumber(operation.sourceRow + 1)}`;
  const magnitude = Math.abs(operation.factor);
  const coefficient = isNear(magnitude, 1) ? '' : formatNumber(magnitude);
  return `${target} ← ${target} ${operation.factor < 0 ? '−' : '+'} ${coefficient}${source}`;
}

export function formatEliminationCalculation(cell, formatNumber = String) {
  if (!cell) return '';
  const magnitude = Math.abs(cell.factor);
  const coefficient = isNear(magnitude, 1) ? '' : `${formatNumber(magnitude)}·`;
  const source = cell.source < 0 ? `(${formatNumber(cell.source)})` : formatNumber(cell.source);
  return `${formatNumber(cell.before)} ${cell.factor < 0 ? '−' : '+'} ${coefficient}${source} = ${formatNumber(cell.after)}`;
}

export function formatRowOperationCellCalculation(operation, cell, formatNumber = String) {
  if (!operation || !cell) return '';
  if (operation.kind === 'replace') return formatEliminationCalculation(cell, formatNumber);
  if (operation.kind === 'scale') {
    return `${formatNumber(operation.factor)}·${formatNumber(cell.before)} = ${formatNumber(cell.after)}`;
  }
  return `${formatNumber(cell.before)} ↔ ${formatNumber(cell.after)}`;
}

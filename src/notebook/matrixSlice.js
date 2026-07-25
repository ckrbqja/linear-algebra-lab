const IDENTIFIER = '[\\p{L}_][\\p{L}\\p{N}_]*';

export function parseNotebookMatrixSliceExpression(source) {
  const match = String(source ?? '').trim().match(new RegExp(
    `^(row|col|column|행|열)\\s*\\(\\s*(${IDENTIFIER})\\s*,\\s*(\\d+)\\s*\\)$`,
    'iu'
  ));
  if (!match) return null;
  const axisToken = match[1].toLowerCase();
  const axis = axisToken === 'row' || axisToken === '행' ? 'row' : 'column';
  const oneBasedIndex = Number(match[3]);
  if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1) return null;
  return {
    axis,
    matrixName: match[2],
    index: oneBasedIndex - 1,
    oneBasedIndex,
  };
}

export function notebookMatrixSliceText(slice) {
  if (!slice) return '';
  return `${slice.axis === 'row' ? 'row' : 'col'}(${slice.matrixName}, ${slice.index + 1})`;
}

export function notebookMatrixSliceValues(matrix, axis, index) {
  const rows = Math.max(1, Number(matrix?.rows) || 1);
  const columns = Math.max(1, Number(matrix?.columns) || 1);
  const values = Array.isArray(matrix?.shapeValues)
    ? matrix.shapeValues
    : Array.isArray(matrix?.values)
      ? matrix.values
      : [];
  if (axis === 'row') {
    if (index < 0 || index >= rows) return null;
    return Array.from({ length: columns }, (_, column) => values[index * columns + column] ?? 0);
  }
  if (index < 0 || index >= columns) return null;
  return Array.from({ length: rows }, (_, row) => values[row * columns + index] ?? 0);
}

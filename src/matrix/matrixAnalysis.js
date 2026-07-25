import {
  EPSILON,
  determinant3,
  inverse3,
  rank3,
} from '../linearAlgebra.js';

export function viewKeyForMatrix(matrix) {
  const matrixRank = rank3(matrix);
  if (matrixRank <= 1) return '1d';
  if (matrixRank === 2) return '2d';
  return '3d';
}

export function modeForMatrix(matrix) {
  return viewKeyForMatrix(matrix);
}

export function matrixValuesForMode(matrix, mode = '3d') {
  if (mode === '1d') return [matrix[0]];
  if (mode === '2d') return matrix.length === 4 ? matrix : [matrix[0], matrix[1], matrix[3], matrix[4]];
  return matrix;
}

export function inverseForStep(matrix, mode = '3d') {
  if (mode === '1d') {
    if (Math.abs(matrix[0]) < EPSILON) return null;
    return [1 / matrix[0]];
  }

  if (mode === '2d') {
    const [a, b, c, d] = matrixValuesForMode(matrix, '2d');
    const det = a * d - b * c;
    if (Math.abs(det) < EPSILON) return null;
    return [d / det, -b / det, -c / det, a / det];
  }

  return inverse3(matrix);
}

export function determinantForStep(matrix, mode = '3d') {
  if (mode === '1d') return matrix[0];
  if (mode === '2d') {
    const [a, b, c, d] = matrixValuesForMode(matrix, '2d');
    return a * d - b * c;
  }
  return determinant3(matrix);
}

export function rankForStep(matrix, mode = '3d') {
  if (mode === '1d') return Math.abs(matrix[0]) < EPSILON ? 0 : 1;
  if (mode === '2d') {
    const values = matrixValuesForMode(matrix, '2d');
    if (Math.abs(determinantForStep(matrix, '2d')) > EPSILON) return 2;
    return values.some((value) => Math.abs(value) > EPSILON) ? 1 : 0;
  }
  return rank3(matrix);
}

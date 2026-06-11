export const EPSILON = 1e-4;

export const identity3 = Object.freeze([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);

export const identity4 = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

export function matrixDimension(matrix) {
  const size = Math.sqrt(matrix.length);
  return Number.isInteger(size) ? size : 3;
}

export function identityMatrix(size) {
  return Array.from({ length: size * size }, (_, index) => (
    Math.floor(index / size) === index % size ? 1 : 0
  ));
}

export function toMatrixDimension(matrix, size) {
  const sourceSize = matrixDimension(matrix);
  const next = identityMatrix(size);
  const copySize = Math.min(sourceSize, size);
  for (let row = 0; row < copySize; row += 1) {
    for (let column = 0; column < copySize; column += 1) {
      next[row * size + column] = matrix[row * sourceSize + column] ?? 0;
    }
  }
  return next;
}

export function multiplyMatrixN(a, b, size = matrixDimension(a)) {
  const left = toMatrixDimension(a, size);
  const right = toMatrixDimension(b, size);
  const next = Array.from({ length: size * size }, () => 0);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let sum = 0;
      for (let inner = 0; inner < size; inner += 1) {
        sum += left[row * size + inner] * right[inner * size + column];
      }
      next[row * size + column] = sum;
    }
  }
  return next;
}

export function determinantN(matrix, size = matrixDimension(matrix)) {
  const m = toMatrixDimension(matrix, size).map(Number);
  let det = 1;
  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(m[row * size + pivot]) > Math.abs(m[pivotRow * size + pivot])) {
        pivotRow = row;
      }
    }
    if (Math.abs(m[pivotRow * size + pivot]) < EPSILON) return 0;
    if (pivotRow !== pivot) {
      for (let column = 0; column < size; column += 1) {
        [m[pivot * size + column], m[pivotRow * size + column]] = [
          m[pivotRow * size + column],
          m[pivot * size + column],
        ];
      }
      det *= -1;
    }
    const pivotValue = m[pivot * size + pivot];
    det *= pivotValue;
    for (let row = pivot + 1; row < size; row += 1) {
      const factor = m[row * size + pivot] / pivotValue;
      for (let column = pivot; column < size; column += 1) {
        m[row * size + column] -= factor * m[pivot * size + column];
      }
    }
  }
  return det;
}

export function inverseN(matrix, size = matrixDimension(matrix)) {
  const left = toMatrixDimension(matrix, size).map(Number);
  const right = identityMatrix(size);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(left[row * size + pivot]) > Math.abs(left[pivotRow * size + pivot])) {
        pivotRow = row;
      }
    }
    const pivotValue = left[pivotRow * size + pivot];
    if (Math.abs(pivotValue) < EPSILON) return null;
    if (pivotRow !== pivot) {
      for (let column = 0; column < size; column += 1) {
        [left[pivot * size + column], left[pivotRow * size + column]] = [
          left[pivotRow * size + column],
          left[pivot * size + column],
        ];
        [right[pivot * size + column], right[pivotRow * size + column]] = [
          right[pivotRow * size + column],
          right[pivot * size + column],
        ];
      }
    }
    const normalize = left[pivot * size + pivot];
    for (let column = 0; column < size; column += 1) {
      left[pivot * size + column] /= normalize;
      right[pivot * size + column] /= normalize;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = left[row * size + pivot];
      for (let column = 0; column < size; column += 1) {
        left[row * size + column] -= factor * left[pivot * size + column];
        right[row * size + column] -= factor * right[pivot * size + column];
      }
    }
  }

  return right;
}

export function rankN(matrix, size = matrixDimension(matrix)) {
  const m = toMatrixDimension(matrix, size).map(Number);
  let rank = 0;
  let row = 0;
  for (let column = 0; column < size && row < size; column += 1) {
    let pivotRow = row;
    for (let candidate = row + 1; candidate < size; candidate += 1) {
      if (Math.abs(m[candidate * size + column]) > Math.abs(m[pivotRow * size + column])) {
        pivotRow = candidate;
      }
    }
    if (Math.abs(m[pivotRow * size + column]) < EPSILON) continue;
    if (pivotRow !== row) {
      for (let swapColumn = column; swapColumn < size; swapColumn += 1) {
        [m[row * size + swapColumn], m[pivotRow * size + swapColumn]] = [
          m[pivotRow * size + swapColumn],
          m[row * size + swapColumn],
        ];
      }
    }
    const pivotValue = m[row * size + column];
    for (let normalizeColumn = column; normalizeColumn < size; normalizeColumn += 1) {
      m[row * size + normalizeColumn] /= pivotValue;
    }
    for (let targetRow = 0; targetRow < size; targetRow += 1) {
      if (targetRow === row) continue;
      const factor = m[targetRow * size + column];
      for (let reduceColumn = column; reduceColumn < size; reduceColumn += 1) {
        m[targetRow * size + reduceColumn] -= factor * m[row * size + reduceColumn];
      }
    }
    row += 1;
    rank += 1;
  }
  return rank;
}

export function transformVectorN(matrix, vector, size = matrixDimension(matrix)) {
  const m = toMatrixDimension(matrix, size);
  return Array.from({ length: size }, (_, row) => {
    let sum = 0;
    for (let column = 0; column < size; column += 1) {
      sum += m[row * size + column] * (vector[column] ?? 0);
    }
    return sum;
  });
}

export function multiplyMatrix3(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function determinant3(m) {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function inverse3(m) {
  const det = determinant3(m);
  if (Math.abs(det) < EPSILON) return null;

  const invDet = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * invDet,
    (m[2] * m[7] - m[1] * m[8]) * invDet,
    (m[1] * m[5] - m[2] * m[4]) * invDet,
    (m[5] * m[6] - m[3] * m[8]) * invDet,
    (m[0] * m[8] - m[2] * m[6]) * invDet,
    (m[2] * m[3] - m[0] * m[5]) * invDet,
    (m[3] * m[7] - m[4] * m[6]) * invDet,
    (m[1] * m[6] - m[0] * m[7]) * invDet,
    (m[0] * m[4] - m[1] * m[3]) * invDet,
  ];
}

export function rank3(m) {
  if (Math.abs(determinant3(m)) > EPSILON) return 3;

  const minors = [
    m[0] * m[4] - m[1] * m[3],
    m[1] * m[5] - m[2] * m[4],
    m[0] * m[5] - m[2] * m[3],
    m[3] * m[7] - m[4] * m[6],
    m[4] * m[8] - m[5] * m[7],
    m[3] * m[8] - m[5] * m[6],
    m[0] * m[7] - m[1] * m[6],
    m[1] * m[8] - m[2] * m[7],
    m[0] * m[8] - m[2] * m[6],
  ];

  if (minors.some((value) => Math.abs(value) > EPSILON)) return 2;
  if (m.some((value) => Math.abs(value) > EPSILON)) return 1;
  return 0;
}

export function transformVector3(m, vector) {
  return [
    m[0] * vector[0] + m[1] * vector[1] + m[2] * vector[2],
    m[3] * vector[0] + m[4] * vector[1] + m[5] * vector[2],
    m[6] * vector[0] + m[7] * vector[1] + m[8] * vector[2],
  ];
}

export function parseNumber(value) {
  const text = String(value ?? '').trim().replace(/,/g, '.');
  if (!text) return 0;

  const fractionMatch = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && Math.abs(denominator) > EPSILON) {
      return numerator / denominator;
    }
    return 0;
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

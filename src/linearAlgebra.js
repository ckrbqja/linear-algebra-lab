export const EPSILON = 1e-4;

export const identity3 = Object.freeze([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);

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

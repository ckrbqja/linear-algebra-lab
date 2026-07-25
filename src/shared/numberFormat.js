import { EPSILON } from '../linearAlgebra.js';

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(digits)).toString();
}

function approximateFraction(value, maxDenominator = 24, tolerance = 0.0008) {
  if (!Number.isFinite(value) || Math.abs(value) < EPSILON) return null;
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = absolute - whole;
  if (fraction < EPSILON) return null;

  let best = null;
  for (let denominator = 2; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(fraction * denominator);
    if (numerator === 0 || numerator === denominator) continue;
    const candidate = numerator / denominator;
    const error = Math.abs(candidate - fraction);
    if (!best || error < best.error) {
      best = { numerator, denominator, error };
    }
  }

  if (!best || best.error > tolerance) return null;
  const numerator = whole * best.denominator + best.numerator;
  return `${sign < 0 ? '-' : ''}${numerator}/${best.denominator}`;
}

export function formatMatrixNumber(value, digits = 2) {
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  const fraction = approximateFraction(value);
  if (fraction) return fraction;
  return Number(value.toFixed(digits)).toString();
}

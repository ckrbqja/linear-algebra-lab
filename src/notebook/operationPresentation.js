function variableKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function tag(name) {
  return `{{${name}}}`;
}

function formatScalar(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '');
  if (Number.isInteger(numeric)) return String(numeric);
  return String(Math.round(numeric * 1000) / 1000);
}

function linearCombinationMath(cell) {
  const expression = (cell.terms ?? []).map((term, index) => {
    const scalar = Number(term.scalar ?? 1);
    const magnitude = Math.abs(scalar);
    const operand = tag(term.name);
    const value = magnitude === 1 ? operand : `${formatScalar(magnitude)} × ${operand}`;
    if (index === 0) return scalar < 0 ? `−${value}` : value;
    return `${scalar < 0 ? '−' : '+'} ${value}`;
  }).join(' ');
  const resultIsOperand = (cell.terms ?? []).some(
    (term) => variableKey(term.name) === variableKey(cell.name)
  );
  return cell.name && !resultIsOperand ? `${expression} → ${tag(cell.name)}` : expression;
}

function productMath(cell) {
  const left = Number.isFinite(cell.leftScalar) ? formatScalar(cell.leftScalar) : tag(cell.left);
  const right = Number.isFinite(cell.rightScalar) ? formatScalar(cell.rightScalar) : tag(cell.right);
  const expression = `${left} × ${right}`;
  const resultIsOperand = [cell.left, cell.right].some(
    (name) => variableKey(name) === variableKey(cell.name)
  );
  return cell.name && !resultIsOperand ? `${expression} → ${tag(cell.name)}` : expression;
}

export function buildNotebookOperationPresentation(cell) {
  if (!cell || cell.hidden || cell.remove) return null;

  if (cell.type === 'calc') {
    return {
      kind: 'calculation',
      labelKey: 'notebookCalculationInProgress',
      math: cell.operation === 'linearCombination'
        ? linearCombinationMath(cell)
        : productMath(cell),
    };
  }

  if (cell.type === 'ref' && cell.refKind === 'matrix' && cell.execute !== false) {
    return {
      kind: 'transform',
      labelKey: 'notebookTransformInProgress',
      math: tag(cell.name),
    };
  }

  if (cell.type === 'matrix' && cell.execute === true) {
    return {
      kind: 'transform',
      labelKey: 'notebookTransformInProgress',
      math: tag(cell.name),
    };
  }

  if (cell.type === 'measurement') {
    return {
      kind: 'measurement',
      labelKey: 'notebookMeasurementInProgress',
      math: `${cell.measureType}(${(cell.names ?? []).map(tag).join(', ')})`,
    };
  }

  if (cell.type === 'solution') {
    return {
      kind: 'solution',
      labelKey: 'notebookSolvingInProgress',
      math: `solution(${(cell.names ?? []).map(tag).join(', ')}) → ${tag(cell.name)}`,
    };
  }

  if (cell.type === 'scene' && cell.command === 'orbit') {
    return {
      kind: 'camera',
      labelKey: 'notebookOrbitInProgress',
      math: '360°',
    };
  }

  return null;
}

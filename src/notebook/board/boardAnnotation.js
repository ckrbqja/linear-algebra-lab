const ANNOTATION_KINDS = new Set(['row', 'cell', 'pivot', 'strike', 'staircase']);

function parseOneBasedIndex(value) {
  const numeric = Number(String(value ?? '').trim());
  return Number.isInteger(numeric) && numeric >= 1 ? numeric - 1 : null;
}

export function parseNotebookBoardAnnotationExpression(source) {
  const trimmed = String(source ?? '').trim();
  const clearMatch = trimmed.match(/^(?:mark|annotate)\s+(?:-|off|clear|none)$/iu);
  if (clearMatch) return { clear: true };

  const match = trimmed.match(/^(?:mark|annotate)\s+([a-z]+)\s*\((.*)\)\s*$/iu);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  if (!ANNOTATION_KINDS.has(kind)) return null;
  const args = match[2].split(',').map((part) => part.trim()).filter(Boolean);
  const expectedArgs = kind === 'staircase' ? 1 : kind === 'row' ? 2 : 3;
  if (args.length !== expectedArgs || !args[0]) return null;

  const annotation = { clear: false, kind, matrixName: args[0] };
  if (kind === 'staircase') return annotation;
  annotation.row = parseOneBasedIndex(args[1]);
  if (annotation.row === null) return null;
  if (kind === 'row') return annotation;
  annotation.column = parseOneBasedIndex(args[2]);
  return annotation.column === null ? null : annotation;
}

export function notebookBoardAnnotationText(annotation) {
  if (!annotation || annotation.clear) return 'mark -';
  if (annotation.kind === 'staircase') return `mark staircase(${annotation.matrixName})`;
  if (annotation.kind === 'row') return `mark row(${annotation.matrixName}, ${annotation.row + 1})`;
  return `mark ${annotation.kind}(${annotation.matrixName}, ${annotation.row + 1}, ${annotation.column + 1})`;
}

export function staggeredBoardCellProgress(progress, index, count, options = {}) {
  const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const safeCount = Math.max(1, Number(count) || 1);
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Number(index) || 0));
  const start = Number.isFinite(options.start) ? options.start : 0.18;
  const end = Number.isFinite(options.end) ? options.end : 0.88;
  const totalSpan = Math.max(0.01, end - start);
  const overlap = Math.max(0, Math.min(0.8, Number(options.overlap) || 0.18));
  const slot = totalSpan / Math.max(1, safeCount - (safeCount - 1) * overlap);
  const offset = slot * (1 - overlap);
  const cellStart = start + safeIndex * offset;
  return Math.max(0, Math.min(1, (safeProgress - cellStart) / slot));
}

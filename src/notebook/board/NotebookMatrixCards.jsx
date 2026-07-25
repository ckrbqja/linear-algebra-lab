import {
  formatRowOperationCellCalculation,
  formatRowOperationNotation,
} from '../rowOperationEngine.js';
import { staggeredBoardCellProgress } from './boardAnnotation.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function variableKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function cssColor(value, fallback = '#5eead4') {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return fallback;
  return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`;
}

function cellKey(row, column) {
  return `${row}:${column}`;
}

function operationRole(item, operation) {
  const key = variableKey(item.name);
  if (key === variableKey(operation?.leftName)) return 'left';
  if (key === variableKey(operation?.rightName)) return 'right';
  if (key === variableKey(operation?.resultName)) return 'result';
  return '';
}

function orderedMatrixCards(items, operation, boardMode) {
  if (!boardMode || !operation) return items;
  const roleOrder = { left: 0, right: 1, result: 2 };
  return items
    .map((item, index) => ({ item, index, role: operationRole(item, operation) }))
    .sort((left, right) => {
      const leftRank = left.role ? roleOrder[left.role] : 10 + left.index;
      const rightRank = right.role ? roleOrder[right.role] : 10 + right.index;
      return leftRank - rightRank;
    })
    .map((entry) => entry.item);
}

function MatrixCard({
  item,
  matrixWord,
  annotation,
  operation,
  boardMode,
  formatValue,
  progress,
  resultReveal,
  captionTargeted,
  captionDimmed,
}) {
  const role = operationRole(item, operation);
  const matrixColor = cssColor(item.color);
  const targetRows = new Set(operation?.targetRows ?? []);
  const sourceRows = new Set(operation?.sourceRows ?? []);
  const coefficientCells = new Set(
    (operation?.coefficientCells ?? []).map((cell) => cellKey(cell.row, cell.column))
  );
  const changedCells = new Set(
    (operation?.changedCells ?? []).map((cell) => cellKey(cell.row, cell.column))
  );
  const eliminatedCells = new Set(
    (operation?.eliminatedCells ?? []).map((cell) => cellKey(cell.row, cell.column))
  );
  const changedCellIndices = new Map(
    (operation?.changedCells ?? []).map((cell, index) => [cellKey(cell.row, cell.column), index])
  );
  const annotationMatches = boardMode && annotation &&
    variableKey(annotation.matrixName) === variableKey(item.name);
  const hasCellCoordinateTag = annotationMatches &&
    ['cell', 'pivot', 'strike'].includes(annotation.kind) &&
    Number.isInteger(annotation.row) &&
    Number.isInteger(annotation.column);
  const annotationProgress = annotationMatches ? clamp01(annotation.progress ?? 1) : 0;
  const displacement = 1 - progress;
  const cardStyle = { '--matrix-color': matrixColor };
  if (annotationMatches) cardStyle['--board-annotation-progress'] = annotationProgress;

  if (boardMode && operation) {
    cardStyle['--row-operation-progress'] = progress;
    cardStyle['--row-operation-strike'] = clamp01((progress - 0.2) / 0.42);
    if (role === 'left') {
      cardStyle.transform = `translateX(calc(${displacement * 100}% + ${displacement * 14}px))`;
    } else if (role === 'right') {
      cardStyle.transform = `translateX(calc(${-displacement * 100}% - ${displacement * 14}px))`;
    } else if (role === 'result') {
      cardStyle.opacity = resultReveal;
      cardStyle.transform = `translateY(${(1 - resultReveal) * 10}px) scale(${0.97 + resultReveal * 0.03})`;
    }
  }

  return (
    <div
      aria-label={`${item.name} ${matrixWord}`}
      className={`notebook-scene-matrix-card ${(item.slices ?? []).some((slice) => slice.axis === 'column') ? 'has-column-slice' : ''} ${(item.slices ?? []).some((slice) => slice.axis === 'row') ? 'has-row-slice' : ''} ${role ? `row-operation-${role}` : ''} ${captionTargeted ? 'caption-targeted' : ''} ${captionDimmed ? 'caption-dimmed' : ''}`}
      data-matrix-name={item.name}
      style={cardStyle}
    >
      <strong>{item.name}</strong>
      <span>=</span>
      <span
        className="notebook-scene-matrix-grid"
        style={{ '--scene-matrix-columns': item.columns }}
      >
        {item.shapeValues.map((value, index) => {
          const row = Math.floor(index / item.columns);
          const column = index % item.columns;
          const key = cellKey(row, column);
          const isRight = role === 'right';
          const isResult = role === 'result';
          const isLeft = role === 'left';
          const changedCellIndex = changedCellIndices.get(key);
          const rowOperationCellProgress = Number.isInteger(changedCellIndex)
            ? staggeredBoardCellProgress(progress, changedCellIndex, changedCellIndices.size)
            : 0;
          const isAnnotationRow = annotationMatches && annotation.kind === 'row' && annotation.row === row;
          const isAnnotationCell = annotationMatches && annotation.kind === 'cell' &&
            annotation.row === row && annotation.column === column;
          const isAnnotationPivot = annotationMatches && annotation.kind === 'pivot' &&
            annotation.row === row && annotation.column === column;
          const isAnnotationStrike = annotationMatches && annotation.kind === 'strike' &&
            annotation.row === row && annotation.column === column;
          const isAnnotationStaircase = annotationMatches && annotation.kind === 'staircase';
          const classNames = [
            'notebook-scene-matrix-value',
            isRight && sourceRows.has(row) ? 'is-row-operation-source' : '',
            isRight && targetRows.has(row) ? 'is-row-operation-target' : '',
            isLeft && coefficientCells.has(key) ? 'is-row-operation-coefficient' : '',
            isRight && eliminatedCells.has(key) ? 'is-row-operation-eliminated-source' : '',
            isResult && changedCells.has(key) ? 'is-row-operation-changed' : '',
            isResult && eliminatedCells.has(key) ? 'is-row-operation-zero' : '',
            isAnnotationRow ? 'is-board-annotation-row' : '',
            isAnnotationCell ? 'is-board-annotation-cell' : '',
            isAnnotationPivot ? 'is-board-annotation-pivot' : '',
            isAnnotationStrike ? 'is-board-annotation-strike' : '',
            isAnnotationStaircase && column < row ? 'is-board-annotation-staircase-zero' : '',
            isAnnotationStaircase && column === row ? 'is-board-annotation-staircase-pivot' : '',
          ].filter(Boolean).join(' ');
          return (
            <span
              className={classNames}
              data-column={column}
              data-row={row}
              key={index}
              style={{
                '--board-annotation-progress': annotationProgress,
                '--row-operation-cell-progress': rowOperationCellProgress,
                '--row-operation-strike': eliminatedCells.has(key)
                  ? clamp01((rowOperationCellProgress - 0.08) / 0.58)
                  : cardStyle['--row-operation-strike'] ?? 0,
                opacity: isResult && changedCells.has(key)
                  ? 0.32 + rowOperationCellProgress * 0.68
                  : undefined,
                transform: isResult && changedCells.has(key)
                  ? `scale(${0.94 + rowOperationCellProgress * 0.06})`
                  : undefined,
              }}
            >
              {formatValue(value)}
              {isAnnotationRow && column === item.columns - 1 && (
                <i className="notebook-board-annotation-tag row-tag">R{row + 1}</i>
              )}
            </span>
          );
        })}
        {annotationMatches && annotation.kind === 'staircase' && (
          <span aria-label={`${item.name} staircase`} className="notebook-board-staircase-marker">↘</span>
        )}
        {(item.slices ?? []).map((slice) => (
          <span
            aria-label={`${slice.name} ${slice.axis} ${slice.index + 1}`}
            className={`notebook-scene-matrix-slice ${slice.axis}`}
            key={slice.key}
            style={{
              '--slice-color': cssColor(slice.color),
              gridColumn: slice.axis === 'row'
                ? '1 / -1'
                : `${slice.index + 1} / span 1`,
              gridRow: slice.axis === 'row'
                ? `${slice.index + 1} / span 1`
                : `1 / span ${item.rows}`,
            }}
          >
            <small>{slice.name}</small>
          </span>
        ))}
      </span>
      {hasCellCoordinateTag && (
        <i className="notebook-board-annotation-tag card-cell-tag">
          r{annotation.row + 1}c{annotation.column + 1}
        </i>
      )}
    </div>
  );
}

export default function NotebookMatrixCards({
  items = [],
  matrixWord = 'matrix',
  boardMode = false,
  annotation = null,
  operation = null,
  formatValue = String,
  highlightedName = null,
}) {
  const progress = clamp01(operation?.progress ?? 1);
  const resultReveal = clamp01((progress - 0.38) / 0.62);
  const orderedItems = orderedMatrixCards(items, operation, boardMode);
  const leftColor = cssColor(items.find((item) => variableKey(item.name) === variableKey(operation?.leftName))?.color);
  const rightColor = cssColor(items.find((item) => variableKey(item.name) === variableKey(operation?.rightName))?.color);
  const resultColor = cssColor(items.find((item) => variableKey(item.name) === variableKey(operation?.resultName))?.color);
  const changedCells = operation?.changedCells ?? [];
  let activeChange = changedCells[0] ?? null;
  for (let index = 0; index < changedCells.length; index += 1) {
    const cellProgress = staggeredBoardCellProgress(progress, index, changedCells.length);
    if (cellProgress > 0) activeChange = changedCells[index];
    if (cellProgress > 0 && cellProgress < 1) break;
  }

  return (
    <div
      className={`notebook-scene-matrices ${boardMode && operation ? 'has-row-operation' : ''}`}
      style={{ '--row-operation-progress': progress }}
    >
      {boardMode && operation && (
        <div className="notebook-row-operation" role="status">
          <div className="notebook-row-operation-product" aria-label={`${operation.leftName} times ${operation.rightName} gives ${operation.resultName}`}>
            <strong style={{ '--operation-token-color': leftColor }}>{operation.leftName}</strong>
            <span>×</span>
            <strong style={{ '--operation-token-color': rightColor }}>{operation.rightName}</strong>
            <span>→</span>
            <strong style={{ '--operation-token-color': resultColor }}>{operation.resultName}</strong>
          </div>
          <div className="notebook-row-operation-detail">
            <b>{formatRowOperationNotation(operation, formatValue)}</b>
            {activeChange && (
              <span>
                {formatRowOperationCellCalculation(operation, activeChange, formatValue)}
              </span>
            )}
          </div>
        </div>
      )}
      {orderedItems.map((item) => (
        <MatrixCard
          boardMode={boardMode}
          formatValue={formatValue}
          item={item}
          key={variableKey(item.name)}
          matrixWord={matrixWord}
          annotation={annotation}
          operation={operation}
          progress={progress}
          resultReveal={resultReveal}
          captionTargeted={variableKey(item.name) === variableKey(highlightedName)}
          captionDimmed={Boolean(highlightedName) && variableKey(item.name) !== variableKey(highlightedName)}
        />
      ))}
    </div>
  );
}

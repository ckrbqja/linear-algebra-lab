import {
  determinantForStep,
  inverseForStep,
  modeForMatrix,
  rankForStep,
} from '../matrix/matrixAnalysis.js';
import { formatNumber } from '../shared/numberFormat.js';
import { CopyableMatrix } from './MatrixWidgets.jsx';

export default function TransformHistoryDetail({ entry, index, isActive, translate }) {
  const previousMatrix = entry.previousMatrix ?? entry.matrix;
  const stateMode = entry.stateMode ?? modeForMatrix(entry.matrix);
  const previousStateMode = entry.previousStateMode ?? modeForMatrix(previousMatrix);
  const det = determinantForStep(entry.matrix, stateMode);
  const rank = rankForStep(entry.matrix, stateMode);
  const previousDet = determinantForStep(previousMatrix, previousStateMode);
  const previousRank = rankForStep(previousMatrix, previousStateMode);
  const operationMode = entry.operationMode ?? '3d';
  const operationMatrix = entry.operationMatrix ?? entry.matrix;
  const isDimensionDrop = entry.isDimensionDrop ?? false;
  const stepInverse = isDimensionDrop ? null : inverseForStep(operationMatrix, operationMode);

  return (
    <div className={`history-detail ${isActive ? 'current' : 'preview'}`}>
      <div className="history-detail-head">
        <span className="history-detail-title">
          <strong>{entry.name}</strong>
          <small>{translate('stepLabel', { index })}</small>
        </span>
        <em>{isActive ? translate('current') : translate('preview')}</em>
      </div>
      <div className="history-metrics-row">
        <div className="history-detail-grid">
          <span>
            {translate('detLabel')}
            <strong>{formatNumber(previousDet)} → {formatNumber(det)}</strong>
          </span>
          <span>
            {translate('rankLabel')}
            <strong>{previousRank} → {rank}</strong>
          </span>
        </div>
        <div className={`inverse-panel mode-${operationMode} ${stepInverse ? '' : 'singular'}`}>
          <span>{translate('inverse')}</span>
          {stepInverse ? (
            <CopyableMatrix
              className="large inverse"
              label={translate('inverse')}
              matrix={stepInverse}
              mode={operationMode}
              translate={translate}
            />
          ) : (
            <strong>{translate('none')}</strong>
          )}
        </div>
      </div>
      <div className="history-step-flow">
        <div className="history-step-title">
          <span>{translate('matrix')}</span>
        </div>
        <CopyableMatrix
          className="large"
          label={translate('previousMatrix')}
          matrix={previousMatrix}
          mode={previousStateMode}
          translate={translate}
        />
        <span className="matrix-arrow">→</span>
        <CopyableMatrix
          className="large"
          label={translate('resultMatrix')}
          matrix={entry.matrix}
          mode={stateMode}
          translate={translate}
        />
      </div>
    </div>
  );
}

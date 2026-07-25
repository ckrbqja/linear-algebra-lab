import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { matrixValuesForMode } from '../matrix/matrixAnalysis.js';
import { copyTextToClipboard } from '../shared/clipboard.js';
import { formatMatrixNumber } from '../shared/numberFormat.js';

export function MatrixMini({ matrix, mode = '3d', className = '' }) {
  const values = matrixValuesForMode(matrix, mode);
  const columns = mode === '3d' ? 3 : mode === '2d' ? 2 : 1;

  return (
    <span className={`matrix-mini ${className}`} style={{ '--mini-columns': columns }}>
      {values.map((value, index) => (
        <span key={index}>{formatMatrixNumber(value)}</span>
      ))}
    </span>
  );
}

function matrixToClipboardText(matrix, mode = '3d') {
  const values = matrixValuesForMode(matrix, mode);
  const columns = mode === '3d' ? 3 : mode === '2d' ? 2 : 1;
  const rows = [];
  for (let i = 0; i < values.length; i += columns) {
    rows.push(values.slice(i, i + columns).map((value) => formatMatrixNumber(value)).join(' '));
  }
  return rows.join('\n');
}

async function copyMatrixToClipboard(matrix, mode, translate) {
  const text = matrixToClipboardText(matrix, mode);
  if (typeof window !== 'undefined') {
    window.__linearAlgebraMatrixClipboard = text;
  }
  await copyTextToClipboard(text);
  toast.success(translate('copied'));
}

export function CopyableMatrix({
  matrix,
  mode = '3d',
  className = '',
  label,
  translate,
}) {
  return (
    <span className="copyable-matrix">
      <MatrixMini matrix={matrix} mode={mode} className={className} />
      <button
        aria-label={translate('copyMatrix', { label })}
        className="detail-copy-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          copyMatrixToClipboard(matrix, mode, translate).catch(() => {
            toast.error(translate('copyFailed'));
          });
        }}
        title={translate('copyMatrix', { label })}
        type="button"
      >
        <Copy size={11} />
      </button>
    </span>
  );
}

export function MatrixInput({ values, columns, accent, onChange, onEnter, translate }) {
  return (
    <div className="matrix-wrap" style={{ '--matrix-columns': columns }}>
      <div className="matrix-bracket left" />
      <div className="matrix-grid">
        {values.map((value, index) => (
          <input
            aria-label={translate('matrixValueLabel', { index: index + 1 })}
            className={`matrix-cell ${accent}`}
            key={index}
            inputMode="text"
            value={value}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value.replace(/^0+(?=\d)/, '');
              onChange(next);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onEnter?.();
            }}
          />
        ))}
      </div>
      <div className="matrix-bracket right" />
    </div>
  );
}

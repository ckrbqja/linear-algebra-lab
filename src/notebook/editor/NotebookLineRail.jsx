import React from 'react';

function markColor(mark) {
  if (!mark?.color) return undefined;
  return `#${Number(mark.color).toString(16).padStart(6, '0')}`;
}

function NotebookMark({ activeLineIndex, cueLabel, lineIndex, mark, matrixTitle, onCueLine }) {
  const lineState = lineIndex <= activeLineIndex ? 'revealed' : 'future';
  const markClassName = mark?.kind
    ? `smart-mark ${mark.kind} ${lineState} ${mark.hidden ? 'hidden' : ''}`
    : `smart-mark blank ${lineState}`;
  const style = mark?.color ? { '--line-color': markColor(mark) } : undefined;

  if (!mark?.label) return <span aria-hidden="true" className={markClassName} style={style} />;

  return (
    <button
      aria-label={`${mark.label} ${cueLabel}`}
      className={markClassName}
      onClick={() => onCueLine(lineIndex)}
      style={style}
      title={mark.kind === 'matrix' ? matrixTitle : cueLabel}
      type="button"
    >
      {mark.label}
    </button>
  );
}

export default function NotebookLineRail({
  activeLineIndex,
  cueLabel,
  lineCount,
  marks,
  matrixTitle,
  onCueLine,
  progressLabel,
}) {
  const markNodes = Array.from({ length: lineCount }).map((_, lineIndex) => (
    <NotebookMark
      activeLineIndex={activeLineIndex}
      cueLabel={cueLabel}
      key={lineIndex}
      lineIndex={lineIndex}
      mark={marks[lineIndex]}
      matrixTitle={matrixTitle}
      onCueLine={onCueLine}
    />
  ));

  return <div className="equation-note-rail smart-note-rail" aria-label={progressLabel}>{markNodes}</div>;
}

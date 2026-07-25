export function shouldCommitNotebookRuntimeImmediately(nextValue, previousEditorValue, runtimeValue) {
  const normalized = String(nextValue ?? '');
  const previous = String(previousEditorValue ?? '');
  if (previous === String(runtimeValue ?? '') || normalized.length <= previous.length) return false;

  let prefixLength = 0;
  while (
    prefixLength < previous.length &&
    normalized[prefixLength] === previous[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previous.length - prefixLength &&
    normalized[normalized.length - 1 - suffixLength] === previous[previous.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const insertedEnd = normalized.length - suffixLength;
  const insertedText = normalized.slice(prefixLength, insertedEnd);
  if (!/^\n[ \t]*$/.test(insertedText)) return false;

  const lineStart = previous.lastIndexOf('\n', Math.max(0, prefixLength - 1)) + 1;
  return Boolean(previous.slice(lineStart, prefixLength).trim());
}

export function formatNotebookEnterEdit(value, selectionStart, selectionEnd, formatText) {
  const current = String(value ?? '').replace(/\r/g, '');
  const start = Math.max(0, Math.min(current.length, Number(selectionStart) || 0));
  const end = Math.max(start, Math.min(current.length, Number(selectionEnd) || start));
  const lineIndex = current.slice(0, start).split('\n').length - 1;
  const withLineBreak = `${current.slice(0, start)}\n${current.slice(end)}`;
  const formatted = typeof formatText === 'function'
    ? String(formatText(withLineBreak) ?? withLineBreak).replace(/\r/g, '')
    : withLineBreak;
  const lines = formatted.split('\n');
  const cursor = Math.min(
    formatted.length,
    lines.slice(0, lineIndex + 1).join('\n').length + 1
  );

  return { cursor, value: formatted };
}

export function minimalNotebookTextEdit(currentValue, nextValue) {
  const current = String(currentValue ?? '');
  const next = String(nextValue ?? '');
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) {
    start += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < current.length - start &&
    suffixLength < next.length - start &&
    current[current.length - 1 - suffixLength] === next[next.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    start,
    end: current.length - suffixLength,
    text: next.slice(start, next.length - suffixLength),
  };
}

export function shouldReplayNotebookPasteFromStart(value, selectionStart, selectionEnd) {
  const current = String(value ?? '').replace(/\r/g, '');
  if (!current.trim()) return true;
  const start = Math.max(0, Math.min(current.length, Number(selectionStart) || 0));
  const end = Math.max(start, Math.min(current.length, Number(selectionEnd) || start));
  return start === 0 && end === current.length;
}

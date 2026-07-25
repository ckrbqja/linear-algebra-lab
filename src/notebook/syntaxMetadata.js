import { parseNumber } from '../linearAlgebra.js';

function splitNotebookAlias(line) {
  const source = String(line ?? '');
  const match = source.match(/^(.*?)(?:\s+)#([^\s#!]+)\s*(!)?\s*$/u);
  if (!match || !match[1].trim()) return { body: source, alias: null, hidden: false };
  return {
    body: match[1].trimEnd(),
    alias: match[2],
    hidden: Boolean(match[3]),
  };
}

function splitNotebookSuffixMeta(line) {
  let body = String(line ?? '').trimEnd();
  let execute = false;
  let remove = false;
  let show = false;
  let durationSec = null;
  let changed = true;

  while (changed) {
    changed = false;

    const durationMatch = body.match(/^(.*?)\s+([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:\s*\/\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))?)\s*s\s*$/iu);
    if (durationMatch && durationMatch[1].trim()) {
      const parsed = parseNumber(durationMatch[2]);
      if (Number.isFinite(parsed) && parsed > 0) durationSec = parsed;
      body = durationMatch[1].trimEnd();
      changed = true;
      continue;
    }

    const removeMatch = body.match(/^(.*?)\s+-\s*$/u);
    if (removeMatch && removeMatch[1].trim()) {
      remove = true;
      body = removeMatch[1].trimEnd();
      changed = true;
      continue;
    }

    const showMatch = body.match(/^(.*?)\s+\+\s*$/u);
    if (showMatch && showMatch[1].trim()) {
      show = true;
      body = showMatch[1].trimEnd();
      changed = true;
      continue;
    }

    const executeMatch = body.match(/^(.*?)@\s*$/u);
    if (executeMatch && executeMatch[1].trim()) {
      execute = true;
      body = executeMatch[1].trimEnd();
      changed = true;
    }
  }

  return { body, execute, remove, show, durationSec };
}

function splitNotebookMute(line) {
  const source = String(line ?? '');
  const match = source.match(/^(\s*)!(?:\s*)(.*)$/u);
  if (!match) return { body: source, hidden: false };
  return {
    body: `${match[1] ?? ''}${match[2] ?? ''}`,
    hidden: true,
  };
}

export function splitNotebookLineMeta(line) {
  const muted = splitNotebookMute(line);
  const suffixed = splitNotebookSuffixMeta(muted.body);
  const aliased = splitNotebookAlias(suffixed.body);
  return {
    body: aliased.body,
    alias: aliased.alias,
    hidden: muted.hidden || aliased.hidden,
    execute: suffixed.execute,
    remove: suffixed.remove,
    show: suffixed.show,
    durationSec: suffixed.durationSec,
  };
}

export function notebookVectorExecutionState(meta = {}, assignedName = null) {
  const explicitExecute = Boolean(meta.execute);
  const hasAuthoredName = Boolean(String(meta.alias ?? assignedName ?? '').trim());
  return {
    execute: explicitExecute || !hasAuthoredName,
    explicitExecute,
  };
}

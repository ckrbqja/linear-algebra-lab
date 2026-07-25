const DURATION_SUFFIX_PATTERN = /\s+(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+)s\s*$/iu;

function withoutDuration(source) {
  return String(source ?? '').replace(DURATION_SUFFIX_PATTERN, '').trim();
}

export function isNotebookSceneSetupLine(source) {
  const line = withoutDuration(source);
  if (!line) return false;
  return [
    /^(?:1d|2d|3d)$/iu,
    /^(?:view|camera|시점|카메라)\s+(?:1d|2d|3d)$/iu,
    /^zoom\s+(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+)$/iu,
    /^field\s+(?:board|graph)$/iu,
    /^(?:axes|relative-axes|grid|relative-grid|coordinates|basis|vectors)\s+(?:on|off)$/iu,
    /^(?:focus|mark)\s*-$/iu,
    /^clear$/iu,
    /^space\s+reset$/iu,
  ].some((pattern) => pattern.test(line));
}

export function notebookSceneSetupFoldRanges(source) {
  const lines = Array.isArray(source)
    ? source.map((line) => String(line ?? ''))
    : String(source ?? '').replace(/\r/gu, '').split('\n');
  const ranges = [];

  let index = 0;
  while (index < lines.length) {
    if (!isNotebookSceneSetupLine(lines[index])) {
      index += 1;
      continue;
    }

    const startIndex = index;
    let lastCommandIndex = index;
    let commandCount = 0;

    while (index < lines.length) {
      if (isNotebookSceneSetupLine(lines[index])) {
        commandCount += 1;
        lastCommandIndex = index;
        index += 1;
        continue;
      }
      if (!lines[index].trim()) {
        index += 1;
        continue;
      }
      break;
    }

    if (commandCount >= 2 && lastCommandIndex > startIndex) {
      ranges.push({
        start: startIndex + 1,
        end: lastCommandIndex + 1,
        commandCount,
      });
    }
  }

  return ranges;
}

export function registerNotebookSceneSetupFoldingProvider(monaco, languageId) {
  return monaco.languages.registerFoldingRangeProvider(languageId, {
    provideFoldingRanges(model) {
      return notebookSceneSetupFoldRanges(model.getValue()).map((range) => ({
        start: range.start,
        end: range.end,
        kind: monaco.languages.FoldingRangeKind.Region,
      }));
    },
  });
}

export function scheduleNotebookSceneSetupAutoFold(editor, delayMs = 60) {
  const timeoutId = globalThis.setTimeout(() => {
    const action = editor?.getAction?.('editor.foldAllMarkerRegions');
    Promise.resolve(action?.run?.()).catch(() => {});
  }, delayMs);

  return {
    dispose() {
      globalThis.clearTimeout(timeoutId);
    },
  };
}

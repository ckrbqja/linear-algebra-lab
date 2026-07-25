export const NOTEBOOK_LANGUAGE_ID = 'flow-math-notebook';

const IDENTIFIER_SOURCE = '[\\p{L}_][\\p{L}\\p{N}_]*';
const STATIC_COMPLETIONS = [
  ['2d', '2d', '2D mathematical space'],
  ['3d', '3d', '3D mathematical space'],
  ['view 2d', 'view 2d', 'Move only the camera to the 2D preset'],
  ['view 3d', 'view 3d', 'Move only the camera to the 3D preset'],
  ['field board', 'field board', 'Use the centered algebra board field'],
  ['field graph', 'field graph', 'Return to the coordinate graph field'],
  ['zoom', 'zoom ${1:1}', 'Set absolute notebook zoom'],
  ['axes', 'axes ${1|on,off|}', 'Toggle absolute axes'],
  ['relative-axes', 'relative-axes ${1|on,off|}', 'Toggle transformed axes'],
  ['grid', 'grid ${1|on,off|}', 'Toggle absolute grid'],
  ['relative-grid', 'relative-grid ${1|on,off|}', 'Toggle transformed grid'],
  ['coordinates', 'coordinates ${1|on,off|}', 'Toggle coordinate labels'],
  ['basis', 'basis ${1|on,off|}', 'Toggle basis vectors'],
  ['vectors', 'vectors ${1|on,off|}', 'Toggle notebook vectors'],
  ['checkpoint', 'checkpoint', 'Pause for learner inspection'],
  ['inspect', 'inspect', 'Pause briefly for free camera inspection'],
  ['orbit', 'orbit ${1:6s}', 'Orbit the 3D camera once and return to its starting view'],
  ['clear', 'clear', 'Clear visible teaching objects'],
  ['space reset', 'space reset', 'Animate transformed space back to identity'],
  ['focus', 'focus ${1:name}', 'Emphasize visible notebook objects'],
  ['focus hard', 'focus hard ${1:name}', 'Strongly isolate visible notebook objects'],
  ['focus -', 'focus -', 'Clear scene focus'],
  ['mark row', 'mark row(${1:A}, ${2:1})', 'Point out one matrix row on the algebra board'],
  ['mark cell', 'mark cell(${1:A}, ${2:1}, ${3:1})', 'Point out one matrix cell'],
  ['mark pivot', 'mark pivot(${1:A}, ${2:1}, ${3:1})', 'Mark a pivot cell'],
  ['mark strike', 'mark strike(${1:A}, ${2:1}, ${3:1})', 'Strike one matrix entry'],
  ['mark staircase', 'mark staircase(${1:U})', 'Show the upper-triangular staircase'],
  ['mark -', 'mark -', 'Clear algebra-board marks'],
  ['caption', '// ${1:설명}', 'Scene caption'],
  ['vector', '${1:1}, ${2:1}  #${3:v}@', 'Declare a visible vector'],
  ['point', 'point(${1:1}, ${2:1})  #${3:p}@', 'Declare a point-presented value'],
  ['matrix 2x2', '${1:1} ${2:0}  #${3:A}\n${4:0} ${5:1}', 'Declare a 2 by 2 matrix'],
  ['matrix 3x3', '${1:1} ${2:0} ${3:0}  #${4:A}\n${5:0} ${6:1} ${7:0}\n${8:0} ${9:0} ${10:1}', 'Declare a 3 by 3 matrix'],
  ['sum', 'sum(${1:v1}, ${2:v2})', 'Draw live vector addition'],
  ['dot', 'dot(${1:v1}, ${2:v2})', 'Draw a dot-product relationship'],
  ['det 2D', 'det(${1:v1}, ${2:v2})', 'Draw determinant area'],
  ['det 3D', 'det(${1:v1}, ${2:v2}, ${3:v3})', 'Draw determinant volume'],
  ['solution', 'solution(${1:R1}, ${2:R2})  #${3:sol}@', 'Select solver-owned solution geometry'],
  ['row', 'row(${1:A}, ${2:1})  #${3:r}@', 'Extract a matrix row'],
  ['col', 'col(${1:A}, ${2:1})  #${3:c}@', 'Extract a matrix column'],
  ['setup', 'setup ${1:name} = ${2:grid off}; ${3:relative-grid on}', 'Declare a reusable scene setup'],
  ['use', 'use ${1:name}', 'Apply a declared scene setup'],
];

let languageRegistered = false;
let colorStyleElement = null;

export function notebookCompletionMode(linePrefix, currentWord = '', options = {}) {
  const prefix = String(linePrefix ?? '');
  const word = String(currentWord ?? '');
  if (/^\s*\/\//u.test(prefix)) {
    const tagMatch = prefix.match(/\{\{([\p{L}_][\p{L}\p{N}_]*)?$/u);
    return tagMatch
      ? { kind: 'captionVariable', word: tagMatch[1] ?? '' }
      : { kind: 'none', word: '' };
  }

  const beforeWord = word && prefix.endsWith(word)
    ? prefix.slice(0, prefix.length - word.length)
    : prefix;
  if (!beforeWord.trim()) return { kind: 'lineStart', word };
  if (word) return { kind: 'variable', word };
  if (options.triggerCharacter === '(' || options.explicit) {
    return { kind: 'variable', word: '' };
  }
  return { kind: 'none', word: '' };
}

function ensureColorClass(color) {
  if (typeof document === 'undefined') return '';
  const normalized = Number(color ?? 0x8b5cf6).toString(16).padStart(6, '0');
  const className = `notebook-monaco-color-${normalized}`;
  if (!colorStyleElement) {
    colorStyleElement = document.createElement('style');
    colorStyleElement.dataset.notebookMonacoColors = 'true';
    document.head.appendChild(colorStyleElement);
  }
  if (!colorStyleElement.textContent.includes(`.${className}{`)) {
    colorStyleElement.textContent += `.monaco-editor .${className}{color:#${normalized}!important;font-weight:800;text-shadow:0 0 10px color-mix(in srgb,#${normalized} 18%,transparent);}`;
  }
  return className;
}

export function ensureNotebookMonacoLanguage(monaco) {
  if (languageRegistered) return;
  if (!monaco.languages.getLanguages().some((item) => item.id === NOTEBOOK_LANGUAGE_ID)) {
    monaco.languages.register({ id: NOTEBOOK_LANGUAGE_ID });
  }
  monaco.languages.setMonarchTokensProvider(NOTEBOOK_LANGUAGE_ID, {
    defaultToken: '',
    tokenizer: {
      root: [
        [/^\s*\/\/.*$/, 'caption'],
        [/^\s*#\s+.*$/, 'comment'],
        [new RegExp(`#${IDENTIFIER_SOURCE}(?:!@?|@)?`, 'u'), 'type.identifier'],
        [/\b(?:checkpoint|confirm|inspect|explore|orbit|clear|rest|pause|wait|focus|mark|annotate|setup|use|dimension|space|view|zoom|field)\b/i, 'keyword'],
        [/\b(?:axes|relative-axes|grid|relative-grid|coordinates|basis|vectors)\b/i, 'keyword.control'],
        [/\b(?:sum|dot|det|solution|point|row|col|cell|pivot|strike|staircase)\b(?=\s*\()/i, 'function'],
        [/\b(?:on|off|reset|with|board|graph|hard)\b/i, 'constant'],
        [/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:\s*\/\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?s?/i, 'number'],
        [/[=+*\-]/, 'operator'],
        [/[(){}\[\]]/, '@brackets'],
        [/[,;]/, 'delimiter'],
        [new RegExp(IDENTIFIER_SOURCE, 'u'), 'identifier'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(NOTEBOOK_LANGUAGE_ID, {
    brackets: [['(', ')'], ['{', '}'], ['[', ']']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '{{', close: '}}' },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '{{', close: '}}' },
      { open: '`', close: '`' },
    ],
  });
  monaco.editor.defineTheme('flow-math-notebook-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'caption', foreground: 'A6710E', fontStyle: 'italic' },
      { token: 'comment', foreground: '8A8579', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7C3AED', fontStyle: 'bold' },
      { token: 'keyword.control', foreground: '0F766E', fontStyle: 'bold' },
      { token: 'function', foreground: 'C2410C', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '0E7490', fontStyle: 'bold' },
      { token: 'constant', foreground: '0369A1' },
      { token: 'number', foreground: '334155' },
      { token: 'operator', foreground: '64748B' },
    ],
    colors: {
      'editor.background': '#FFFDF8',
      'editor.foreground': '#23231F',
      'editorLineNumber.foreground': '#A8A29E',
      'editorCursor.foreground': '#6D28D9',
      'editor.selectionBackground': '#8B5CF622',
      'editor.inactiveSelectionBackground': '#8B5CF614',
      'editorSuggestWidget.background': '#FFFDF8',
      'editorSuggestWidget.border': '#DDD6FE',
    },
  });
  monaco.editor.defineTheme('flow-math-notebook-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'caption', foreground: 'F4C96B', fontStyle: 'italic' },
      { token: 'comment', foreground: 'A8A29E', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C4B5FD', fontStyle: 'bold' },
      { token: 'keyword.control', foreground: '5EEAD4', fontStyle: 'bold' },
      { token: 'function', foreground: 'FDBA74', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '67E8F9', fontStyle: 'bold' },
      { token: 'constant', foreground: '7DD3FC' },
      { token: 'number', foreground: 'E7E5E4' },
      { token: 'operator', foreground: 'A8A29E' },
    ],
    colors: {
      'editor.background': '#171815',
      'editor.foreground': '#F6F2E8',
      'editorLineNumber.foreground': '#78716C',
      'editorCursor.foreground': '#C4B5FD',
      'editor.selectionBackground': '#8B5CF633',
      'editor.inactiveSelectionBackground': '#8B5CF61F',
      'editorSuggestWidget.background': '#20211E',
      'editorSuggestWidget.border': '#45423D',
    },
  });
  languageRegistered = true;
}

export function registerNotebookCompletionProvider(monaco, getContext) {
  return monaco.languages.registerCompletionItemProvider(NOTEBOOK_LANGUAGE_ID, {
    triggerCharacters: ['('],
    provideCompletionItems(model, position, completionContext) {
      const context = getContext();
      const word = model.getWordUntilPosition(position);
      const line = model.getLineContent(position.lineNumber);
      const linePrefix = line.slice(0, position.column - 1);
      const completionMode = notebookCompletionMode(linePrefix, word.word, {
        explicit:
          completionContext?.triggerKind === monaco.languages.CompletionTriggerKind.Invoke,
        triggerCharacter: completionContext?.triggerCharacter ?? null,
      });
      if (completionMode.kind === 'none') return undefined;

      let range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      if (completionMode.kind === 'captionVariable') {
        const suffix = line.slice(position.column - 1);
        const closingLength = suffix.startsWith('}}') ? 2 : 0;
        range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - completionMode.word.length - 2,
          endColumn: position.column + closingLength,
        };
      }

      const suggestions = completionMode.kind === 'lineStart'
        ? STATIC_COMPLETIONS.map(([label, insertText, documentation], index) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: context.commandDetail,
            documentation,
            range,
            sortText: `2-${String(index).padStart(2, '0')}`,
          }))
        : [];
      (context.variables ?? []).forEach((item, index) => {
        suggestions.push({
          label: item.label,
          kind: item.kind === 'matrix'
            ? monaco.languages.CompletionItemKind.Class
            : monaco.languages.CompletionItemKind.Variable,
          insertText: completionMode.kind === 'captionVariable'
            ? `{{${item.label}}}`
            : item.label,
          detail: `${context.variableDetail} · ${item.kind}`,
          documentation: item.valueText || undefined,
          range,
          sortText: `1-${String(index).padStart(3, '0')}`,
        });
      });
      if (completionMode.kind === 'lineStart' && !model.getValue().trim() && context.starterText) {
        suggestions.unshift({
          label: context.starterLabel,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: context.starterText,
          detail: context.starterDetail,
          range,
          sortText: '0',
        });
      }
      return suggestions.length ? { suggestions } : undefined;
    },
  });
}

function declaredMatrixNames(model) {
  const lines = model.getLinesContent();
  const names = [];
  const declarationPattern = new RegExp(
    `^\\s*([+\\-.\\d/eE]+(?:\\s+[+\\-.\\d/eE]+)+)\\s+#(${IDENTIFIER_SOURCE})[!@]*\\s*$`,
    'u'
  );
  const rowPattern = /^\s*[+\-.\d/eE]+(?:\s+[+\-.\d/eE]+)+\s*$/u;

  lines.forEach((line, index) => {
    const declaration = line.match(declarationPattern);
    if (!declaration || !rowPattern.test(lines[index + 1] ?? '')) return;
    names.push(declaration[2]);
  });
  return names;
}

export function registerNotebookInlineCompletionProvider(monaco, getContext) {
  return monaco.languages.registerInlineCompletionsProvider(NOTEBOOK_LANGUAGE_ID, {
    provideInlineCompletions(model, position) {
      if (position.lineNumber !== model.getLineCount()) return undefined;
      const line = model.getLineContent(position.lineNumber);
      if (position.column !== line.length + 1) return undefined;

      const match = line.match(/^(\s*)([\p{L}_][\p{L}\p{N}_]*)?$/u);
      if (!match) return undefined;
      const indentation = match[1] ?? '';
      const typedPrefix = match[2] ?? '';
      const executedNames = new Set(
        model.getLinesContent()
          .slice(0, -1)
          .map((item) => item.trim())
          .filter((item) => new RegExp(`^${IDENTIFIER_SOURCE}$`, 'u').test(item))
          .map((item) => item.toLocaleLowerCase())
      );
      const contextualTargets = (getContext().variables ?? [])
        .filter((item) => item?.executable === true)
        .map((item) => item.label);
      const targetLabels = [...new Set([
        ...declaredMatrixNames(model),
        ...contextualTargets,
      ])];
      const target = targetLabels
        .reverse()
        .find((label) => (
          !executedNames.has(label.toLocaleLowerCase()) &&
          label.toLocaleLowerCase().startsWith(typedPrefix.toLocaleLowerCase()) &&
          label !== typedPrefix
        ));
      if (!target) return undefined;

      return {
        enableForwardStability: true,
        items: [{
          insertText: target,
          range: new monaco.Range(
            position.lineNumber,
            indentation.length + 1,
            position.lineNumber,
            position.column
          ),
        }],
      };
    },
    disposeInlineCompletions() {},
  });
}

export function registerNotebookHoverProvider(monaco, getContext) {
  return monaco.languages.registerHoverProvider(NOTEBOOK_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const variable = (getContext().variables ?? []).find(
        (item) => item.label.toLocaleLowerCase() === word.word.toLocaleLowerCase()
      );
      if (!variable) return null;
      const contents = [{ value: `**${variable.label}** · ${variable.kind}` }];
      if (variable.valueText) contents.push({ value: `\`${variable.valueText}\`` });
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents,
      };
    },
  });
}

export function notebookMonacoDecorations(monaco, model, tokenStyles, activeLineIndex) {
  if (!model) return [];
  const styleMap = tokenStyles instanceof Map ? tokenStyles : new Map();
  const decorations = [];
  const identifierPattern = new RegExp(IDENTIFIER_SOURCE, 'gu');
  const captionTagPattern = new RegExp(`\\{\\{(${IDENTIFIER_SOURCE})(?::(?:expr|value))?\\}\\}`, 'gu');

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
    const line = model.getLineContent(lineNumber);
    const caption = /^\s*\/\//u.test(line);
    const panelNote = /^\s*#\s+/u.test(line);
    if (panelNote) continue;
    const pattern = caption ? captionTagPattern : identifierPattern;
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line))) {
      const name = caption ? match[1] : match[0];
      const style = styleMap.get(name.toLocaleLowerCase());
      if (!style) continue;
      const tokenStart = match.index + (caption ? match[0].indexOf(name) : 0);
      const colorClass = ensureColorClass(style.color);
      decorations.push({
        range: new monaco.Range(lineNumber, tokenStart + 1, lineNumber, tokenStart + name.length + 1),
        options: {
          inlineClassName: `notebook-monaco-variable ${colorClass}${style.hidden ? ' notebook-monaco-hidden-variable' : ''}`,
          inlineClassNameAffectsLetterSpacing: false,
        },
      });
    }
  }

  if (activeLineIndex >= 0 && activeLineIndex < model.getLineCount()) {
    decorations.push({
      range: new monaco.Range(activeLineIndex + 1, 1, activeLineIndex + 1, 1),
      options: {
        isWholeLine: true,
        className: 'notebook-monaco-active-line',
      },
    });
  }
  return decorations;
}

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import { createNotebookGutterWidgetController } from './monacoGutterWidgets.js';
import {
  registerNotebookSceneSetupFoldingProvider,
  scheduleNotebookSceneSetupAutoFold,
} from './monacoFolding.js';
import {
  NOTEBOOK_LANGUAGE_ID,
  ensureNotebookMonacoLanguage,
  notebookMonacoDecorations,
  registerNotebookCompletionProvider,
  registerNotebookHoverProvider,
  registerNotebookInlineCompletionProvider,
} from './monacoLanguage.js';
import {
  formatNotebookEnterEdit,
  minimalNotebookTextEdit,
  shouldCommitNotebookRuntimeImmediately,
  shouldReplayNotebookPasteFromStart,
} from './notebookEditorRuntime.js';
import NotebookEditorLoadingState from './NotebookEditorLoadingState.jsx';

if (typeof globalThis !== 'undefined') {
  globalThis.MonacoEnvironment = {
    ...(globalThis.MonacoEnvironment ?? {}),
    getWorker: () => new EditorWorker(),
  };
}
loader.config({ monaco: monacoApi });

const LINE_HEIGHT = 28;
const EDITOR_MIN_HEIGHT = 294;

function preferredTheme() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') {
    return 'flow-math-notebook-dark';
  }
  return 'flow-math-notebook-light';
}

function replaceEditorText(editor, text, offset) {
  const model = editor.getModel();
  if (!model) return;
  editor.executeEdits('flow-math-notebook', [{
    range: model.getFullModelRange(),
    text,
    forceMoveMarkers: true,
  }]);
  const position = model.getPositionAt(Math.max(0, Math.min(text.length, offset)));
  editor.setPosition(position);
  editor.setSelection({
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function replaceEditorTextMinimally(editor, text, offset) {
  const model = editor.getModel();
  if (!model) return;
  const current = model.getValue();
  const edit = minimalNotebookTextEdit(current, text);
  const start = model.getPositionAt(edit.start);
  const end = model.getPositionAt(edit.end);
  editor.executeEdits('flow-math-notebook-format', [{
    range: {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
    text: edit.text,
    forceMoveMarkers: true,
  }]);
  const position = model.getPositionAt(Math.max(0, Math.min(text.length, offset)));
  editor.setPosition(position);
  editor.setSelection({
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function keepCaretVisibleInPanel(editor, editorDomNode) {
  if (!editor?.hasTextFocus?.() || !editorDomNode) return;
  const position = editor.getPosition();
  const caret = position ? editor.getScrolledVisiblePosition(position) : null;
  const scroller = editorDomNode.closest('.panel-scroll, .mobile-notebook-pane');
  if (!caret || !scroller) return;

  const editorRect = editorDomNode.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const margin = 16;
  const caretTop = editorRect.top + caret.top;
  const caretBottom = caretTop + caret.height;
  const visibleTop = scrollerRect.top + margin;
  const visibleBottom = scrollerRect.bottom - margin;

  if (caretBottom > visibleBottom) {
    scroller.scrollTop += caretBottom - visibleBottom;
  } else if (caretTop < visibleTop) {
    scroller.scrollTop -= visibleTop - caretTop;
  }
}

const MonacoNotebookEditor = forwardRef(function MonacoNotebookEditor({
  activeLineIndex,
  autoFocus,
  autocompleteLabel,
  commandDetail,
  cuedLineIndex,
  fill = false,
  followActiveLine,
  foldLabel,
  height,
  loadingLabel,
  marks,
  matrixTitle,
  notebookLabel,
  onAcceptStarter,
  onBlurFormat,
  onChange,
  onCueLine,
  onFormat,
  onPaste,
  playCueLabel,
  progressLabel,
  cueLabel,
  starterDetail,
  starterLabel,
  starterPreviewText,
  starterText,
  tokenStyles,
  value,
  variableDetail,
}, forwardedRef) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const applyingExternalValueRef = useRef(false);
  const localValueEchoRef = useRef(null);
  const decorationsRef = useRef(null);
  const gutterWidgetsRef = useRef(null);
  const autoFoldRef = useRef(null);
  const disposablesRef = useRef([]);
  const callbacksRef = useRef({});
  const contextRef = useRef({});
  const marksRef = useRef(marks);
  const [editorReady, setEditorReady] = useState(false);
  const [editorIsEmpty, setEditorIsEmpty] = useState(() => !String(value ?? '').trim());
  const [themeName, setThemeName] = useState(preferredTheme);

  useImperativeHandle(forwardedRef, () => ({
    replaceLine(lineIndex, nextLine) {
      const editor = editorRef.current;
      const model = editor?.getModel();
      const normalizedLineIndex = Math.trunc(Number(lineIndex));
      const lineNumber = normalizedLineIndex + 1;
      if (
        !editor ||
        !model ||
        !Number.isFinite(normalizedLineIndex) ||
        normalizedLineIndex < 0 ||
        lineNumber > model.getLineCount()
      ) {
        return null;
      }

      const normalizedNextLine = String(nextLine ?? '').replace(/[\r\n]/g, '');
      const currentLine = model.getLineContent(lineNumber);
      if (currentLine === normalizedNextLine) return model.getValue();

      const edit = minimalNotebookTextEdit(currentLine, normalizedNextLine);
      const scrollTop = editor.getScrollTop();
      applyingExternalValueRef.current = true;
      try {
        editor.executeEdits('flow-math-notebook-scene-sync', [{
          range: {
            startLineNumber: lineNumber,
            startColumn: edit.start + 1,
            endLineNumber: lineNumber,
            endColumn: edit.end + 1,
          },
          text: edit.text,
          forceMoveMarkers: true,
        }]);
        editor.setScrollTop(scrollTop);
        const nextValue = model.getValue();
        localValueEchoRef.current = nextValue;
        return nextValue;
      } finally {
        applyingExternalValueRef.current = false;
      }
    },
  }), []);

  const variables = useMemo(() => Array.from(tokenStyles.values()), [tokenStyles]);
  callbacksRef.current = {
    onAcceptStarter,
    onBlurFormat,
    onChange,
    onFormat,
    onPaste,
    starterText,
    value,
  };
  contextRef.current = {
    commandDetail,
    starterDetail,
    starterLabel,
    starterText,
    variableDetail,
    variables,
  };
  marksRef.current = marks;

  const numericHeight = Number(height);
  const editorHeight = Number.isFinite(numericHeight)
    ? Math.max(180, Math.round(numericHeight))
    : EDITOR_MIN_HEIGHT;

  const beforeMount = useCallback((monaco) => {
    ensureNotebookMonacoLanguage(monaco);
  }, []);

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
    ensureNotebookMonacoLanguage(monaco);
    monaco.editor.setTheme(preferredTheme());
    decorationsRef.current = editor.createDecorationsCollection();
    gutterWidgetsRef.current = createNotebookGutterWidgetController(editor, monaco);

    const editorDomNode = editor.getDomNode();
    let caretVisibilityFrame = 0;
    const scheduleCaretVisibility = () => {
      if (!editor.hasTextFocus() || caretVisibilityFrame || typeof window === 'undefined') return;
      caretVisibilityFrame = window.requestAnimationFrame(() => {
        caretVisibilityFrame = 0;
        keepCaretVisibleInPanel(editor, editorDomNode);
      });
    };
  const scheduleAutoFold = (delayMs = 60) => {
      autoFoldRef.current?.dispose?.();
      autoFoldRef.current = scheduleNotebookSceneSetupAutoFold(editor, delayMs);
    };
    const handlePasteCapture = () => {
      const model = editor.getModel();
      const selection = editor.getSelection();
      const current = model?.getValue() ?? '';
      const start = model && selection
        ? model.getOffsetAt({
            lineNumber: selection.startLineNumber,
            column: selection.startColumn,
          })
        : current.length;
      const end = model && selection
        ? model.getOffsetAt({
            lineNumber: selection.endLineNumber,
            column: selection.endColumn,
          })
        : start;
      callbacksRef.current.onPaste({
        replayFromStart: shouldReplayNotebookPasteFromStart(current, start, end),
      });
      scheduleAutoFold(90);
    };
    editorDomNode?.addEventListener('paste', handlePasteCapture, true);

    disposablesRef.current.push(
      registerNotebookSceneSetupFoldingProvider(monaco, NOTEBOOK_LANGUAGE_ID),
      registerNotebookCompletionProvider(monaco, () => contextRef.current),
      registerNotebookInlineCompletionProvider(monaco, () => contextRef.current),
      registerNotebookHoverProvider(monaco, () => contextRef.current),
      editor.onDidChangeCursorPosition(scheduleCaretVisibility),
      editor.onDidContentSizeChange(scheduleCaretVisibility),
      editor.onDidChangeModelContent((event) => {
        const completedToken = event.changes.some((change) => /[\s#]$/u.test(change.text));
        if (completedToken) {
          editor.trigger('flow-math-notebook', 'hideSuggestWidget', null);
        }
      }),
      editor.onDidBlurEditorText(() => callbacksRef.current.onBlurFormat(editor.getValue())),
      {
        dispose: () => {
          if (caretVisibilityFrame && typeof window !== 'undefined') {
            window.cancelAnimationFrame(caretVisibilityFrame);
          }
          editorDomNode?.removeEventListener('paste', handlePasteCapture, true);
        },
      }
    );

    editor.addCommand(monaco.KeyCode.Tab, () => {
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) return;
      const current = model.getValue();
      if (!current.trim()) {
        const next = callbacksRef.current.starterText;
        replaceEditorText(editor, next, next.length);
        callbacksRef.current.onAcceptStarter(next);
        scheduleAutoFold();
        return;
      }
      editor.executeEdits('flow-math-notebook-tab', [{
        range: selection,
        text: '  ',
        forceMoveMarkers: true,
      }]);
    }, '!suggestWidgetVisible && !inlineSuggestionVisible');

    editor.addCommand(monaco.KeyCode.Enter, () => {
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) return;
      const current = model.getValue();
      const start = model.getOffsetAt({
        lineNumber: selection.startLineNumber,
        column: selection.startColumn,
      });
      const end = model.getOffsetAt({
        lineNumber: selection.endLineNumber,
        column: selection.endColumn,
      });
      const next = formatNotebookEnterEdit(
        current,
        start,
        end,
        callbacksRef.current.onFormat
      );

      applyingExternalValueRef.current = true;
      localValueEchoRef.current = next.value;
      setEditorIsEmpty(!next.value.trim());
      try {
        replaceEditorTextMinimally(editor, next.value, next.cursor);
      } finally {
        applyingExternalValueRef.current = false;
      }
      callbacksRef.current.onChange(next.value, { commitNow: true });
      const restoreFormattedCaret = (attempt = 0) => {
        const refreshedModel = editor.getModel();
        if (!refreshedModel) return;
        if (refreshedModel.getValue() !== next.value) {
          if (attempt < 2) {
            window.requestAnimationFrame(() => restoreFormattedCaret(attempt + 1));
          }
          return;
        }
        const position = refreshedModel.getPositionAt(next.cursor);
        editor.setPosition(position);
        editor.setSelection({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        scheduleCaretVisibility();
      };
      window.requestAnimationFrame(() => restoreFormattedCaret());
    });

    setEditorReady(true);
    scheduleAutoFold();
    if (autoFocus) {
      window.requestAnimationFrame(() => {
        const model = editor.getModel();
        if (!model) return;
        const position = model.getPositionAt(model.getValueLength());
        editor.setPosition(position);
        editor.setSelection({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        editor.revealPositionInCenterIfOutsideViewport(position);
        editor.focus();
      });
    }
  }, [autoFocus]);

  useEffect(() => () => {
    disposablesRef.current.forEach((item) => item?.dispose?.());
    disposablesRef.current = [];
    gutterWidgetsRef.current?.dispose?.();
    gutterWidgetsRef.current = null;
    autoFoldRef.current?.dispose?.();
    autoFoldRef.current = null;
    decorationsRef.current?.clear?.();
  }, []);

  useEffect(() => {
    if (!editorReady || !gutterWidgetsRef.current) return;
    gutterWidgetsRef.current.sync({
      activeLineIndex,
      cueLabel,
      cuedLineIndex,
      marks,
      matrixTitle,
      onCueLine,
      playCueLabel,
      progressLabel,
    });
  }, [
    activeLineIndex,
    cueLabel,
    cuedLineIndex,
    editorReady,
    marks,
    matrixTitle,
    onCueLine,
    playCueLabel,
    progressLabel,
  ]);

  useLayoutEffect(() => {
    if (!editorReady || !editorRef.current) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    const nextValue = String(value ?? '');
    if (!model) return;
    setEditorIsEmpty(!nextValue.trim());

    if (localValueEchoRef.current === nextValue) {
      localValueEchoRef.current = null;
      return;
    }
    if (model.getValue() === nextValue) return;
    localValueEchoRef.current = null;

    const position = editor.getPosition();
    const cursorOffset = position ? model.getOffsetAt(position) : 0;
    const scrollTop = editor.getScrollTop();
    applyingExternalValueRef.current = true;
    try {
      replaceEditorText(editor, nextValue, Math.min(cursorOffset, nextValue.length));
      editor.setScrollTop(scrollTop);
      autoFoldRef.current?.dispose?.();
      autoFoldRef.current = scheduleNotebookSceneSetupAutoFold(editor);
    } finally {
      applyingExternalValueRef.current = false;
    }
  }, [editorReady, value]);

  useEffect(() => {
    if (!editorReady || !editorRef.current || !monacoRef.current || !decorationsRef.current) return;
    decorationsRef.current.set(notebookMonacoDecorations(
      monacoRef.current,
      editorRef.current.getModel(),
      tokenStyles,
      activeLineIndex
    ));
  }, [activeLineIndex, editorReady, tokenStyles]);

  useEffect(() => {
    if (!editorReady || !followActiveLine || activeLineIndex < 0) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    editor.revealLineInCenterIfOutsideViewport(activeLineIndex + 1, monaco.editor.ScrollType.Smooth);
  }, [activeLineIndex, editorReady, followActiveLine]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const nextTheme = preferredTheme();
      setThemeName(nextTheme);
      monacoRef.current?.editor.setTheme(nextTheme);
    };
    applyTheme();
    mediaQuery.addEventListener?.('change', applyTheme);
    return () => mediaQuery.removeEventListener?.('change', applyTheme);
  }, []);

  return (
    <div
      className="equation-note-editor smart-notebook-editor notebook-monaco-editor"
      style={{
        height: fill ? '100%' : editorHeight,
        '--notebook-scene-fold-label': JSON.stringify(String(foldLabel || 'Scene setup')),
      }}
      translate="no"
    >
      <div className="notebook-monaco-host">
        <Editor
          beforeMount={beforeMount}
          defaultValue={value}
          height={fill ? '100%' : `${editorHeight}px`}
          language={NOTEBOOK_LANGUAGE_ID}
          loading={(
            <NotebookEditorLoadingState
              embedded
              height={fill ? '100%' : editorHeight}
              label={loadingLabel}
            />
          )}
          onChange={(nextValue) => {
            if (applyingExternalValueRef.current) return;
            const normalized = String(nextValue ?? '').replace(/\r/g, '');
            setEditorIsEmpty(!normalized.trim());
            const previousEditorValue =
              localValueEchoRef.current ??
              String(callbacksRef.current.value ?? '').replace(/\r/g, '');
            const runtimeValue = String(callbacksRef.current.value ?? '').replace(/\r/g, '');
            const commitNow = shouldCommitNotebookRuntimeImmediately(
              normalized,
              previousEditorValue,
              runtimeValue
            );
            localValueEchoRef.current = normalized;
            callbacksRef.current.onChange(normalized, { commitNow });
          }}
          onMount={handleMount}
          options={{
            acceptSuggestionOnEnter: 'off',
            ariaLabel: notebookLabel,
            automaticLayout: true,
            contextmenu: true,
            cursorSmoothCaretAnimation: 'off',
            // EditContext focuses a zero-width div, which some browser shortcut
            // extensions do not recognize as a text input. Keep Monaco's real
            // textarea backend so typing always owns keyboard shortcuts.
            editContext: false,
            fixedOverflowWidgets: true,
            folding: true,
            foldingHighlight: false,
            foldingStrategy: 'auto',
            fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
            fontSize: 13,
            fontWeight: '750',
            glyphMargin: true,
            hideCursorInOverviewRuler: true,
            inlineSuggest: {
              enabled: true,
              mode: 'subwordSmart',
              showToolbar: 'onHover',
              suppressSuggestions: false,
            },
            lineDecorationsWidth: 3,
            lineHeight: LINE_HEIGHT,
            lineNumbers: 'off',
            lineNumbersMinChars: 0,
            links: false,
            matchBrackets: 'always',
            minimap: { enabled: false },
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            padding: { top: 7, bottom: 7 },
            quickSuggestions: { other: true, comments: false, strings: false },
            renderLineHighlight: 'none',
            renderValidationDecorations: 'off',
            scrollBeyondLastLine: false,
            scrollbar: {
              alwaysConsumeMouseWheel: false,
              horizontal: 'auto',
              horizontalScrollbarSize: 8,
              useShadows: false,
              vertical: 'visible',
              verticalHasArrows: false,
              verticalScrollbarSize: 10,
            },
            smoothScrolling: false,
            showFoldingControls: 'mouseover',
            snippetSuggestions: 'top',
            suggestOnTriggerCharacters: true,
            tabCompletion: 'on',
            wordBasedSuggestions: 'off',
            wordWrap: 'off',
          }}
          path="inmemory://flow-math/notebook.flowmath"
          theme={themeName}
        />
      </div>
      {editorIsEmpty && (
        <div className="notebook-monaco-starter-placeholder" aria-hidden="true">
          {String(starterPreviewText ?? '').split('\n').map((line, index) => (
            <span
              className={`notebook-monaco-starter-line${line ? '' : ' is-spacer'}`}
              key={`starter-preview-${index}`}
            >
              {line || '\u00a0'}
              {index === 0 && (
                <span className="notebook-monaco-tab-hint">
                  <kbd>Tab</kbd>
                  <span>{autocompleteLabel}</span>
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

export default MonacoNotebookEditor;

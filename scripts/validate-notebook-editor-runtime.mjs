import assert from 'node:assert/strict';
import {
  formatNotebookEnterEdit,
  minimalNotebookTextEdit,
  shouldCommitNotebookRuntimeImmediately,
  shouldReplayNotebookPasteFromStart,
} from '../src/notebook/editor/notebookEditorRuntime.js';
import { notebookCompletionMode } from '../src/notebook/editor/monacoLanguage.js';
import {
  notebookStarterPreviewText,
  notebookStarterText,
} from '../src/notebook/editor/notebookStarter.js';
import {
  notebookVectorExecutionState,
  splitNotebookLineMeta,
} from '../src/notebook/syntaxMetadata.js';

const cases = [
  {
    name: 'pending non-empty line commits on Enter',
    nextValue: '3, 4 #v\n',
    previousEditorValue: '3, 4 #v',
    runtimeValue: '',
    expected: true,
  },
  {
    name: 'already committed line does not recompute on Enter',
    nextValue: '3, 4 #v\n',
    previousEditorValue: '3, 4 #v',
    runtimeValue: '3, 4 #v',
    expected: false,
  },
  {
    name: 'blank line Enter stays debounced',
    nextValue: '3, 4 #v\n\n',
    previousEditorValue: '3, 4 #v\n',
    runtimeValue: '3, 4 #v',
    expected: false,
  },
  {
    name: 'auto-indented Enter still commits pending content',
    nextValue: '  3, 4 #v\n  ',
    previousEditorValue: '  3, 4 #v',
    runtimeValue: '',
    expected: true,
  },
  {
    name: 'ordinary typing stays debounced',
    nextValue: '3, 4 #v',
    previousEditorValue: '3, 4 #',
    runtimeValue: '',
    expected: false,
  },
  {
    name: 'multiline paste stays debounced',
    nextValue: '3, 4\n5, 6',
    previousEditorValue: '',
    runtimeValue: '',
    expected: false,
  },
];

for (const testCase of cases) {
  const actual = shouldCommitNotebookRuntimeImmediately(
    testCase.nextValue,
    testCase.previousEditorValue,
    testCase.runtimeValue
  );
  assert.equal(actual, testCase.expected, testCase.name);
}

const enterEdit = formatNotebookEnterEdit('3,4', 3, 3, (value) =>
  value.replace('3,4', '3, 4  #v1@')
);
assert.deepEqual(enterEdit, {
  cursor: '3, 4  #v1@\n'.length,
  value: '3, 4  #v1@\n',
}, 'Enter formats the completed shorthand and keeps the caret on the new line');

assert.deepEqual(
  minimalNotebookTextEdit('3,4', enterEdit.value),
  { start: 2, end: 3, text: ' 4  #v1@\n' },
  'Enter formatting produces one minimal Monaco model edit'
);

assert.deepEqual(
  minimalNotebookTextEdit('-1, 2.67  #b@', '-2.68, 3.66  #b@'),
  { start: 1, end: 8, text: '2.68, 3.66' },
  'scene dragging edits only the coordinate range and preserves vector metadata'
);

assert.equal(
  shouldReplayNotebookPasteFromStart('', 0, 0),
  true,
  'pasting into an empty notebook starts a new replay'
);
assert.equal(
  shouldReplayNotebookPasteFromStart('old notebook', 0, 'old notebook'.length),
  true,
  'replacing the whole notebook starts a new replay'
);
assert.equal(
  shouldReplayNotebookPasteFromStart('1 0\n0 1', 2, 3),
  false,
  'pasting one matrix entry preserves local edit replay behavior'
);

assert.equal(
  notebookCompletionMode('vec', 'vec').kind,
  'lineStart',
  'typing the first token offers commands and variables'
);
assert.equal(
  notebookCompletionMode('focus ', '').kind,
  'none',
  'a trailing space does not open automatic completion'
);
assert.equal(
  notebookCompletionMode('focus v', 'v').kind,
  'variable',
  'typing an operand name offers declared variables'
);
assert.equal(
  notebookCompletionMode('sum(', '', { triggerCharacter: '(' }).kind,
  'variable',
  'a function opening offers declared variables'
);
assert.equal(
  notebookCompletionMode('// ordinary caption ', '').kind,
  'none',
  'ordinary caption prose does not open completion'
);
assert.equal(
  notebookCompletionMode('// {{v', 'v').kind,
  'captionVariable',
  'caption variable tags offer declared variables'
);

assert.deepEqual(
  notebookVectorExecutionState(splitNotebookLineMeta('3,4')),
  { execute: true, explicitExecute: false },
  'an unnamed shorthand vector receives execution during its initial prettier pass'
);
assert.deepEqual(
  notebookVectorExecutionState(splitNotebookLineMeta('3, 4  #v1')),
  { execute: false, explicitExecute: false },
  'a named vector without @ remains declaration-only'
);
assert.deepEqual(
  notebookVectorExecutionState(splitNotebookLineMeta('3, 4  #v1@')),
  { execute: true, explicitExecute: true },
  'an explicit @ keeps a named vector executable'
);

assert.equal(
  notebookStarterText(),
  ['2d', '', '3, 4  #v1@', '', '0 1  #A', '1 0', '', 'A'].join('\n'),
  'the accepted starter opens in 2D and executes the declared matrix A'
);
assert.equal(
  notebookStarterPreviewText(),
  ['2d', '', '3,4', '', '0 1', '1 0', '', 'A'].join('\n'),
  'the empty-state preview mirrors the accepted starter sequence'
);

console.log(`Notebook editor runtime validation passed (${cases.length + 17} cases).`);

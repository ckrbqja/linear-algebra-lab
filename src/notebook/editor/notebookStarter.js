const NOTEBOOK_STARTER_TEXT = [
  '2d',
  '',
  '3, 4  #v1@',
  '',
  '0 1  #A',
  '1 0',
  '',
  'A',
].join('\n');

const NOTEBOOK_STARTER_PREVIEW_TEXT = [
  '2d',
  '',
  '3,4',
  '',
  '0 1',
  '1 0',
  '',
  'A',
].join('\n');

export function notebookStarterText() {
  return NOTEBOOK_STARTER_TEXT;
}

export function notebookStarterPreviewText() {
  return NOTEBOOK_STARTER_PREVIEW_TEXT;
}

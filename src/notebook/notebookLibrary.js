const NOTEBOOK_LIBRARY_STORAGE_KEY = 'flow-math:notebook-library:v1';
const NOTEBOOK_LIBRARY_LIMIT = 80;

function normalizeNotebookEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const title = String(value.title ?? '').trim();
  const text = String(value.text ?? '').replace(/\r/g, '');
  const updatedAt = Number(value.updatedAt);
  if (!id || !title || !text.trim() || !Number.isFinite(updatedAt)) return null;
  return { id, title, text, updatedAt };
}

export function readNotebookLibrary(storage = globalThis?.localStorage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(NOTEBOOK_LIBRARY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeNotebookEntry)
      .filter(Boolean)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, NOTEBOOK_LIBRARY_LIMIT);
  } catch {
    return [];
  }
}

export function writeNotebookLibrary(entries, storage = globalThis?.localStorage) {
  if (!storage) return false;
  try {
    const normalized = (Array.isArray(entries) ? entries : [])
      .map(normalizeNotebookEntry)
      .filter(Boolean)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, NOTEBOOK_LIBRARY_LIMIT);
    storage.setItem(NOTEBOOK_LIBRARY_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function createNotebookLibraryId() {
  if (typeof globalThis?.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

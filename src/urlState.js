import { homePathForLocale } from './app/seoRoutes.js';

export const URL_SHARE_STATE_ENABLED = false;
export const URL_CAMERA_STATE_ENABLED = false;

const urlStateKey = 'linearAlgebraShareState';
const urlDbKey = 'linearAlgebraUrlDb';
const animationViewerParam = 'lesson';
const animationViewerMode = 'animation';
const animationViewerVersion = 1;

export function encodeShareState(state) {
  const text = JSON.stringify(state);
  const encoded = btoa(unescape(encodeURIComponent(text)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeShareState(value) {
  try {
    const raw = String(value ?? '');
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch {
    return null;
  }
}

export function readAnimationViewerStateFromLocation() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (String(params.get('view') ?? '').toLowerCase() !== animationViewerMode) return null;

  const decoded = decodeShareState(params.get(animationViewerParam));
  if (!decoded || decoded.v !== animationViewerVersion || typeof decoded.n !== 'string') return null;
  const notebookText = decoded.n.replace(/\r/g, '').slice(0, 100_000);
  if (!notebookText.trim()) return null;

  return {
    notebookText,
    notebookSpeed: decoded.s,
    preview: decoded.p === 1,
  };
}

export function readShareStateFromLocation() {
  if (!URL_SHARE_STATE_ENABLED || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const rawState = params.get('s') ?? params.get('state') ?? window.localStorage?.getItem(urlStateKey);
  return decodeShareState(rawState);
}

function writeUrlDb(encoded, state, title) {
  if (!URL_SHARE_STATE_ENABLED || typeof window === 'undefined' || !encoded) return;
  try {
    const current = JSON.parse(window.localStorage.getItem(urlDbKey) ?? '[]');
    const next = [
      {
        id: Date.now().toString(36),
        at: new Date().toISOString(),
        encoded,
        title: title || state?.locale || 'Flow Math',
      },
      ...current.filter((item) => item.encoded !== encoded),
    ].slice(0, 12);
    window.localStorage.setItem(urlDbKey, JSON.stringify(next));
    window.localStorage.setItem(urlStateKey, encoded);
  } catch {
    window.localStorage.setItem(urlStateKey, encoded);
  }
}

function applyBaseLabParams(url, locale) {
  url.searchParams.set('app', 'linear');
  url.searchParams.set('lang', locale);
  if (!URL_SHARE_STATE_ENABLED) {
    url.searchParams.delete('s');
    url.searchParams.delete('state');
  }
}

export function buildShareUrlFromState(state, { locale, title } = {}) {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  applyBaseLabParams(url, locale ?? state?.locale ?? 'ko');
  if (URL_SHARE_STATE_ENABLED && state) {
    const encoded = encodeShareState(state);
    url.searchParams.set('s', encoded);
    writeUrlDb(encoded, state, title);
  }
  return url.toString();
}

export function buildAnimationViewerUrl({ notebookText, notebookSpeed, locale, preview = false } = {}) {
  if (typeof window === 'undefined') return '';
  const normalizedNotebookText = String(notebookText ?? '').replace(/\r/g, '');
  if (!normalizedNotebookText.trim()) return '';

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  applyBaseLabParams(url, locale ?? 'ko');
  url.searchParams.set('view', animationViewerMode);
  url.searchParams.set(
    animationViewerParam,
    encodeShareState({
      v: animationViewerVersion,
      n: normalizedNotebookText,
      s: notebookSpeed,
      ...(preview ? { p: 1 } : {}),
    })
  );
  return url.toString();
}

export function writeShareStateToUrl(state, { locale, title } = {}) {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  applyBaseLabParams(url, locale ?? state?.locale ?? 'ko');
  if (!URL_SHARE_STATE_ENABLED || !state) {
    window.history.replaceState(null, '', url);
    return null;
  }

  const encoded = encodeShareState(state);
  url.searchParams.set('s', encoded);
  window.history.replaceState(null, '', url);
  writeUrlDb(encoded, state, title);
  return encoded;
}

export function writeLabEntryToHistory(locale) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  applyBaseLabParams(url, locale ?? 'ko');
  window.history.pushState(null, '', url);
}

export function writeFlowHomeToHistory(locale) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.pathname = homePathForLocale(locale ?? 'ko');
  url.search = '';
  url.hash = '';
  window.history.pushState(null, '', url);
}

export function patchCameraStateInUrl(camera, { locale, title } = {}) {
  if (!URL_SHARE_STATE_ENABLED || !URL_CAMERA_STATE_ENABLED || typeof window === 'undefined' || !camera) return;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('s') ?? window.localStorage?.getItem(urlStateKey);
  const decoded = decodeShareState(raw);
  if (!decoded || decoded.v !== 1) return;
  writeShareStateToUrl(
    {
      ...decoded,
      locale: decoded.locale ?? locale ?? 'ko',
      camera,
    },
    { locale: locale ?? decoded.locale ?? 'ko', title }
  );
}

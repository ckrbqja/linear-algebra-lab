import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Box,
  Braces,
  Camera,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Grid3X3,
  History,
  Lock,
  Magnet,
  Menu,
  PanelRightClose,
  Play,
  Plus,
  RotateCcw,
  Sigma,
  SlidersHorizontal,
  Square,
  VectorSquare,
  X,
  ZoomIn,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  EPSILON,
  determinant3,
  identity3,
  inverse3,
  multiplyMatrix3,
  parseNumber,
  rank3,
  transformVector3,
} from './linearAlgebra.js';
import { managedLocaleMessages, managedPresetLocaleNames } from './i18n.js';

const ANIMATION_MS = 1001;
const CAMERA_MOVE_MS = 850;
const UI_SYNC_MS = 16;
const VECTOR_SPAWN_MS = 280;
const SNAP_DISTANCE = 0.08;
const DRAG_SNAP_DISTANCE = 0.12;
const AXIS_LOCK_RATIO_3D = 0.045;
const PLANE_LOCK_RATIO_3D = 0.018;
const AXIS_LOCK_MAX_3D = 0.14;
const PLANE_LOCK_MAX_3D = 0.07;
const SHIFT_AXIS_LOCK_PX = 22;
const MEASURE_DOT_HEX = 0xf1b434;
const MEASURE_DOT_GUIDE_HEX = 0xffd66b;
const MEASURE_LENGTH_HEX = 0x8bd3ff;
const MEASURE_AREA_HEX = 0xff4fd8;
const MEASURE_AREA_EDGE_HEX = 0xff9bea;
const MEASURE_VOLUME_HEX = 0xff7a59;
const MEASURE_VOLUME_EDGE_HEX = 0xffb199;
const NOTEBOOK_MIN_VISIBLE_LINES = 10;
const NOTEBOOK_NORMAL_SPEED = 0.5;
const DEFAULT_NOTEBOOK_SPEED = NOTEBOOK_NORMAL_SPEED;
const SCALAR_CONSTRAINT_LINE_RANGE = 5.6;
const DEFAULT_RELATIVE_GRID_STRENGTH = 0.45;
const monetizationConfig = {
  adProvider: import.meta.env.VITE_AD_PROVIDER || 'adsense',
  adClient: import.meta.env.VITE_AD_CLIENT || '',
  topAdSlot: import.meta.env.VITE_AD_TOP_SLOT || import.meta.env.VITE_AD_SLOT_TOP || '',
  bottomAdSlot: import.meta.env.VITE_AD_BOTTOM_SLOT || import.meta.env.VITE_AD_SLOT_BOTTOM || '',
  admobAppId: import.meta.env.VITE_ADMOB_APP_ID || '',
  donationUrl: import.meta.env.VITE_DONATION_URL || '',
  donationLabel: import.meta.env.VITE_DONATION_LABEL || '',
};
const urlStateKey = 'linearAlgebraShareState';
const urlDbKey = 'linearAlgebraUrlDb';
const CAMERA_HOME_POSITION = new THREE.Vector3(5.25, 4.05, 6.45);
const CAMERA_HOME_TARGET = new THREE.Vector3(0.35, 0.35, 0.35);

const viewPresets = {
  '3d': {
    labelKey: 'view3d',
    position: CAMERA_HOME_POSITION,
    target: CAMERA_HOME_TARGET,
  },
  '2d': {
    labelKey: 'view2d',
    position: new THREE.Vector3(0, 0, 8.35),
    target: new THREE.Vector3(0, 0, 0),
  },
  '1d': {
    labelKey: 'view1d',
    position: new THREE.Vector3(0, 2.65, 7.15),
    target: new THREE.Vector3(0, 0, 0),
  },
};

function viewDirectionForKey(viewKey) {
  const preset = viewPresets[viewKey] ?? viewPresets['3d'];
  const direction = preset.position.clone().sub(preset.target);
  if (direction.lengthSq() < EPSILON) return new THREE.Vector3(0, 0, 1);
  return direction.normalize();
}

function cameraStateForView(viewKey, positionFrom, targetFrom) {
  const preset = viewPresets[viewKey] ?? viewPresets['3d'];
  const target = targetFrom?.clone?.() ?? preset.target.clone();
  const currentDistance =
    positionFrom && targetFrom
      ? Math.max(positionFrom.distanceTo(targetFrom), EPSILON)
      : 0;
  const presetDistance = preset.position.distanceTo(preset.target);
  const distance = currentDistance > EPSILON ? currentDistance : presetDistance;
  const position = target.clone().addScaledVector(viewDirectionForKey(viewKey), distance);
  return { position, target };
}

const localeMessages = Object.fromEntries(
  Object.entries(managedLocaleMessages).map(([localeKey, messages]) => [
    localeKey,
    { ...messages },
  ])
);
const localeOrder = ['ko', 'en', 'ja', 'zh'];

const presetLocaleNames = Object.fromEntries(
  Object.entries(managedPresetLocaleNames).map(([localeKey, messages]) => [
    localeKey,
    { ...messages },
  ])
);

function normalizeLocale(value) {
  const raw = String(value ?? '').toLowerCase();
  if (raw.startsWith('ko')) return 'ko';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('zh')) return 'zh';
  if (raw.startsWith('en')) return 'en';
  return 'ko';
}

function detectLocale() {
  if (typeof window === 'undefined') return 'ko';
  const urlLocale = new URLSearchParams(window.location.search).get('lang');
  if (urlLocale) return normalizeLocale(urlLocale);
  const stored = window.localStorage?.getItem('linearAlgebraLocale');
  if (stored) return normalizeLocale(stored);
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return normalizeLocale(languages.find(Boolean));
}

function t(locale, key, values = null) {
  const template = localeMessages[locale]?.[key] ?? localeMessages.ko[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}

function encodeShareState(state) {
  const text = JSON.stringify(state);
  const encoded = btoa(unescape(encodeURIComponent(text)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeShareState(value) {
  try {
    const padded = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value ?? '').length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch {
    return null;
  }
}

function arrayOfStrings(value, fallback, length) {
  if (!Array.isArray(value)) return fallback;
  const next = value.slice(0, length).map((item) => String(item ?? '0'));
  while (next.length < length) next.push(fallback[next.length] ?? '0');
  return next;
}

function arrayOfNumbers(value, fallback, length) {
  if (!Array.isArray(value)) return fallback;
  const next = value.slice(0, length).map((item, index) => {
    const number = Number(item);
    return Number.isFinite(number) ? number : fallback[index];
  });
  while (next.length < length) next.push(fallback[next.length] ?? 0);
  return next;
}

function cameraArray(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const next = value.slice(0, 3).map(Number);
  return next.every(Number.isFinite) ? next : null;
}

function normalizeCameraState(value) {
  if (!value || typeof value !== 'object') return null;
  const position = cameraArray(value.position);
  const target = cameraArray(value.target);
  return position && target ? { position, target } : null;
}

function cameraVectorToShareArray(vector) {
  return [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(4)));
}

function cameraShareStateFromRefs(refs) {
  if (!refs?.camera || !refs?.controls) return null;
  return {
    position: cameraVectorToShareArray(refs.camera.position),
    target: cameraVectorToShareArray(refs.controls.target),
  };
}

function cameraStatesAlmostEqual(left, right) {
  if (!left || !right) return false;
  const values = [...left.position, ...left.target];
  const otherValues = [...right.position, ...right.target];
  return values.every((value, index) => Math.abs(value - otherValues[index]) < 0.0001);
}

function readSharedStateFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const rawState = params.get('s') ?? params.get('state') ?? window.localStorage?.getItem(urlStateKey);
  const decoded = decodeShareState(rawState);
  if (!decoded || decoded.v !== 1) return null;
  const vectors = Array.isArray(decoded.vectors)
    ? decoded.vectors.slice(0, 8).map((item, index) =>
        createVectorState(index, {
          id: String(item.id ?? `v${index + 1}`),
          name: String(item.name ?? `v${index + 1}`),
          x: String(item.x ?? '0'),
          y: String(item.y ?? '0'),
          z: String(item.z ?? '0'),
          scalar: String(item.scalar ?? ''),
          scalarEnabled: !!item.scalarEnabled,
          scalarSpace: item.scalarSpace === 'output' ? 'output' : 'input',
          visible: item.visible !== false,
        })
      )
    : null;

  return {
    locale: normalizeLocale(decoded.locale),
    workspaceMode: decoded.workspaceMode === 'system' ? 'system' : 'transform',
    inputMode: ['3d', '2d', '1d'].includes(decoded.inputMode) ? decoded.inputMode : '3d',
    displayMatrix: arrayOfNumbers(decoded.displayMatrix, identity3, 9),
    matrix3: arrayOfStrings(decoded.matrix3, ['1', '0', '0', '0', '1', '0', '0', '0', '1'], 9),
    matrix2: arrayOfStrings(decoded.matrix2, ['1', '0', '0', '1'], 4),
    matrix1: arrayOfStrings(decoded.matrix1, ['1'], 1),
    vectors: vectors?.length ? vectors : null,
    showVolume: !!decoded.showVolume,
    showVector: decoded.showVector !== false,
    showBasis: decoded.showBasis !== false,
    showGrid: decoded.showGrid !== false,
    showRelativeGrid: decoded.showRelativeGrid !== false,
    relativeGridStrength: normalizeRelativeGridStrength(decoded.relativeGridStrength),
    showCoordinates: decoded.showCoordinates !== false,
    showDot: !!decoded.showDot,
    showAxes: decoded.showAxes !== false,
    showRelativeAxes: decoded.showRelativeAxes !== false,
    snapToInteger: decoded.snapToInteger !== false,
    notebookSpeed: normalizeNotebookSpeed(decoded.notebookSpeed),
    camera: normalizeCameraState(decoded.camera),
  };
}

function writeUrlDb(encoded, state) {
  if (typeof window === 'undefined' || !encoded) return;
  try {
    const current = JSON.parse(window.localStorage.getItem(urlDbKey) ?? '[]');
    const next = [
      { id: Date.now().toString(36), at: new Date().toISOString(), encoded, title: localeMessages[state.locale]?.title ?? localeMessages.ko.title },
      ...current.filter((item) => item.encoded !== encoded),
    ].slice(0, 12);
    window.localStorage.setItem(urlDbKey, JSON.stringify(next));
    window.localStorage.setItem(urlStateKey, encoded);
  } catch {
    window.localStorage.setItem(urlStateKey, encoded);
  }
}

function replaceShareStateInUrl(state, locale) {
  if (typeof window === 'undefined' || !state) return;
  const encoded = encodeShareState(state);
  const url = new URL(window.location.href);
  url.searchParams.set('s', encoded);
  url.searchParams.set('lang', normalizeLocale(locale ?? state.locale));
  window.history.replaceState(null, '', url);
  writeUrlDb(encoded, state);
}

function patchCameraStateInUrl(camera, locale) {
  if (typeof window === 'undefined' || !camera) return;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('s') ?? window.localStorage?.getItem(urlStateKey);
  const decoded = decodeShareState(raw);
  if (!decoded || decoded.v !== 1) return;
  replaceShareStateInUrl(
    {
      ...decoded,
      locale: normalizeLocale(decoded.locale ?? locale),
      camera,
    },
    locale
  );
}

function upsertMeta(selector, attributes, textContent = null) {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement(selector.startsWith('script') ? 'script' : attributes.rel ? 'link' : 'meta');
    document.head.appendChild(node);
  }
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (textContent !== null) node.textContent = textContent;
}

function applySeo(locale) {
  if (typeof document === 'undefined') return;
  const message = localeMessages[locale] ?? localeMessages.ko;
  document.documentElement.lang = message.code;
  document.title = message.title;
  upsertMeta('meta[name="description"]', { name: 'description', content: message.description });
  upsertMeta('meta[name="keywords"]', {
    name: 'keywords',
    content: 'linear algebra, matrix, 3D, vectors, determinant, dot product, 선형대수, 行列, 线性代数',
  });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: message.title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: message.description });
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: message.code.replace('-', '_') });
  if (monetizationConfig.admobAppId) {
    upsertMeta('meta[name="admob-app-id"]', { name: 'admob-app-id', content: monetizationConfig.admobAppId });
  }
  upsertMeta('meta[name="geo.region"]', { name: 'geo.region', content: locale === 'ko' ? 'KR' : locale === 'ja' ? 'JP' : locale === 'zh' ? 'CN' : 'US' });
  localeOrder.forEach((key) => {
    const href = new URL(window.location.href);
    href.searchParams.set('lang', key);
    upsertMeta(`link[rel="alternate"][hreflang="${localeMessages[key].code}"]`, {
      rel: 'alternate',
      hreflang: localeMessages[key].code,
      href: href.toString(),
    });
  });
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: message.title,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    inLanguage: localeOrder.map((key) => localeMessages[key].code),
    description: message.description,
  };
  upsertMeta('script[type="application/ld+json"][data-linear-lab-schema]', {
    type: 'application/ld+json',
    'data-linear-lab-schema': 'true',
  }, JSON.stringify(schema));
}

function normalizeControlLocks(locks = {}) {
  if (typeof locks === 'boolean') {
    return { camera: locks, zoom: false };
  }
  return {
    camera: !!locks.camera,
    zoom: !!locks.zoom,
  };
}

function configureControlsForView(controls, viewKey, locks = {}) {
  if (!controls) return;
  const lockState = normalizeControlLocks(locks);
  controls.enabled = true;
  controls.enableRotate = !lockState.camera;
  controls.enablePan = !lockState.camera;
  controls.enableZoom = !lockState.zoom;
  controls.screenSpacePanning = false;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
}

function labelRectOverlaps(a, b, padding = 4) {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.bottom + padding < b.top ||
    a.top - padding > b.bottom
  );
}

function estimatedLabelRect(label, x, y) {
  const text = label.querySelector('.axis-label-text')?.textContent ?? label.textContent ?? '';
  const width = Math.max(42, Math.min(280, text.length * 8.2 + 18));
  const height = label.classList.contains('measurement-label') ? 27 : 24;
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
  };
}

function resolveSceneLabelOverlaps(container) {
  if (!container) return;
  const labels = [...container.querySelectorAll('.axis-label')]
    .filter((label) => label.style.display !== 'none' && label.dataset.labelX && label.dataset.labelY);
  const placed = [];

  labels.forEach((label) => {
    const baseX = Number(label.dataset.labelX);
    const baseY = Number(label.dataset.labelY);
    if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;

    const isScalarLabel = label.dataset.dragKey?.startsWith('s:');
    const isSolutionLabel =
      label.classList.contains('scalar-solution-label') ||
      label.classList.contains('equation-solution-label');
    const preferredXOffset = isSolutionLabel ? 18 : 0;
    const preferredYOffset = isScalarLabel ? -20 : isSolutionLabel ? 6 : 0;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const direction = attempt % 2 === 0 ? 1 : -1;
      const step = Math.ceil(attempt / 2);
      const dy = preferredYOffset + direction * step * 22;
      const dx = preferredXOffset + (attempt > 4 ? (attempt % 2 === 0 ? 18 : -18) : 0);
      const x = baseX + dx;
      const y = baseY + dy;
      label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      const rect = estimatedLabelRect(label, x, y);
      if (!placed.some((placedRect) => labelRectOverlaps(rect, placedRect))) {
        placed.push(rect);
        return;
      }
    }

    placed.push(estimatedLabelRect(label, baseX, baseY));
  });
}

const matrixPresetGroups = {
  '3d': [
    { id: '3d-identity', name: 'Identity matrix', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-rotate-x', name: 'Rotate X 90', matrix: [1, 0, 0, 0, 0, -1, 0, 1, 0], mode: '3d' },
    { id: '3d-rotate-y', name: 'Rotate Y 90', matrix: [0, 0, 1, 0, 1, 0, -1, 0, 0], mode: '3d' },
    { id: '3d-rotate-z', name: 'Rotate Z 90', matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-scale-up', name: 'Scale 1.5x', matrix: [1.5, 0, 0, 0, 1.5, 0, 0, 0, 1.5], mode: '3d' },
    { id: '3d-shear-xy', name: 'X-Y shear', matrix: [1, 1, 0, 0, 1, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-swap-xy', name: 'X/Y permutation', matrix: [0, 1, 0, 1, 0, 0, 0, 0, 1], mode: '3d' },
    { id: '3d-compress-z', name: 'Compress Z', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 0.35], mode: '3d' },
    { id: '3d-project-xy', name: 'Project to XY plane', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 0], mode: '3d' },
  ],
  '2d': [
    { id: '2d-identity', name: 'Identity matrix', matrix: [1, 0, 0, 1], mode: '2d' },
    { id: '2d-permutation', name: 'Permutation matrix', matrix: [0, 1, 1, 0], mode: '2d' },
    { id: '2d-rotate', name: 'Rotate 90', matrix: [0, -1, 1, 0], mode: '2d' },
    { id: '2d-reflect-x', name: 'Reflect X axis', matrix: [1, 0, 0, -1], mode: '2d' },
    { id: '2d-reflect-y', name: 'Reflect Y axis', matrix: [-1, 0, 0, 1], mode: '2d' },
    { id: '2d-scale-up', name: 'Scale 2x', matrix: [2, 0, 0, 2], mode: '2d' },
    { id: '2d-scale-down', name: 'Scale 1/2', matrix: [0.5, 0, 0, 0.5], mode: '2d' },
    { id: '2d-shear-x', name: 'X shear', matrix: [1, 1, 0, 1], mode: '2d' },
    { id: '2d-shear-y', name: 'Y shear', matrix: [1, 0, 1, 1], mode: '2d' },
    { id: '2d-project-x', name: 'Project to X axis', matrix: [1, 0, 0, 0], mode: '2d' },
  ],
  '1d': [
    { id: '1d-identity', name: 'Identity', matrix: [1], mode: '1d' },
    { id: '1d-flip', name: 'Flip direction', matrix: [-1], mode: '1d' },
    { id: '1d-scale-up', name: 'Scale 2x', matrix: [2], mode: '1d' },
    { id: '1d-scale-down', name: 'Scale 1/2', matrix: [0.5], mode: '1d' },
    { id: '1d-zero', name: 'Project to origin', matrix: [0], mode: '1d' },
  ],
};

function createGridGeometry(size = 5, step = 1) {
  const positions = [];
  const addLine = (x1, y1, z1, x2, y2, z2) => {
    positions.push(x1, y1, z1, x2, y2, z2);
  };

  for (let i = -size; i <= size; i += step) {
    addLine(-size, i, 0, size, i, 0);
    addLine(i, -size, 0, i, size, 0);
    addLine(-size, 0, i, size, 0, i);
    addLine(i, 0, -size, i, 0, size);
    addLine(0, -size, i, 0, size, i);
    addLine(0, i, -size, 0, i, size);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createPlaneGridGeometry(size = 9, step = 1) {
  const positions = [];
  for (let i = -size; i <= size; i += step) {
    positions.push(-size, i, 0, size, i, 0);
    positions.push(i, -size, 0, i, size, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function setGeometryPositions(geometry, positions) {
  const next = new Float32Array(positions);
  const current = geometry.getAttribute('position');
  if (!current || current.array.length !== next.length) {
    geometry.setAttribute('position', new THREE.BufferAttribute(next, 3));
    return;
  }
  current.array.set(next);
  current.needsUpdate = true;
}

function updateAreaGeometry(meshGeometry, edgeGeometry, a, b) {
  const points = [
    new THREE.Vector3(0, 0, 0),
    a,
    a.clone().add(b),
    b,
  ];
  setGeometryPositions(meshGeometry, [
    ...points[0].toArray(), ...points[1].toArray(), ...points[2].toArray(),
    ...points[0].toArray(), ...points[2].toArray(), ...points[3].toArray(),
  ]);
  setGeometryPositions(edgeGeometry, [
    ...points[0].toArray(), ...points[1].toArray(),
    ...points[1].toArray(), ...points[2].toArray(),
    ...points[2].toArray(), ...points[3].toArray(),
    ...points[3].toArray(), ...points[0].toArray(),
  ]);
}

function updateVolumeGeometry(meshGeometry, edgeGeometry, a, b, c) {
  const p0 = new THREE.Vector3(0, 0, 0);
  const p1 = a.clone();
  const p2 = b.clone();
  const p3 = c.clone();
  const p4 = a.clone().add(b);
  const p5 = a.clone().add(c);
  const p6 = b.clone().add(c);
  const p7 = a.clone().add(b).add(c);
  const quad = (pA, pB, pC, pD) => [
    ...pA.toArray(), ...pB.toArray(), ...pC.toArray(),
    ...pA.toArray(), ...pC.toArray(), ...pD.toArray(),
  ];
  setGeometryPositions(meshGeometry, [
    ...quad(p0, p1, p4, p2),
    ...quad(p0, p2, p6, p3),
    ...quad(p0, p3, p5, p1),
    ...quad(p7, p5, p3, p6),
    ...quad(p7, p6, p2, p4),
    ...quad(p7, p4, p1, p5),
  ]);
  setGeometryPositions(edgeGeometry, [
    ...p0.toArray(), ...p1.toArray(),
    ...p0.toArray(), ...p2.toArray(),
    ...p0.toArray(), ...p3.toArray(),
    ...p1.toArray(), ...p4.toArray(),
    ...p1.toArray(), ...p5.toArray(),
    ...p2.toArray(), ...p4.toArray(),
    ...p2.toArray(), ...p6.toArray(),
    ...p3.toArray(), ...p5.toArray(),
    ...p3.toArray(), ...p6.toArray(),
    ...p4.toArray(), ...p7.toArray(),
    ...p5.toArray(), ...p7.toArray(),
    ...p6.toArray(), ...p7.toArray(),
  ]);
}

function updateLengthGeometry(meshGeometry, edgeGeometry, a) {
  setGeometryPositions(meshGeometry, []);
  setGeometryPositions(edgeGeometry, [
    0, 0, 0,
    a.x, a.y, a.z,
  ]);
}

function measurementDimensionForMode(mode) {
  if (mode === '1d') return 1;
  if (mode === '2d') return 2;
  return 3;
}

function effectiveVolumeTargetCount(targetCount, mode) {
  return Math.min(targetCount, measurementDimensionForMode(mode));
}

function volumeMeasureKind(targetCount, mode) {
  const count = effectiveVolumeTargetCount(targetCount, mode);
  if (count >= 3) return 'volume';
  if (count === 2) return 'area';
  return 'length';
}

function volumeMeasureValue(targets, mode) {
  const count = effectiveVolumeTargetCount(targets.length, mode);
  if (count <= 0) return null;
  const a = new THREE.Vector3(...targets[0].values);
  if (count === 1) return a.length();
  const b = new THREE.Vector3(...targets[1].values);
  if (count === 2) return a.clone().cross(b).length();
  const c = new THREE.Vector3(...targets[2].values);
  return Math.abs(a.clone().cross(b).dot(c));
}

function setAxisLabelText(label, text) {
  if (!label) return;
  const textNode = label.querySelector('.axis-label-text');
  const applyText = (target) => {
    if (Array.isArray(text)) {
      target.replaceChildren(...text.map((part) => {
        const span = document.createElement('span');
        span.textContent = part.text ?? '';
        if (part.color) span.style.color = part.color;
        if (part.className) span.className = part.className;
        return span;
      }));
      return;
    }
    target.textContent = text;
  };
  if (textNode) {
    applyText(textNode);
    return;
  }
  if (Array.isArray(text)) {
    label.textContent = text.map((part) => part.text ?? '').join('');
    return;
  }
  label.textContent = text;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function normalizeRelativeGridStrength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_RELATIVE_GRID_STRENGTH;
  return Math.min(1, Math.max(0.2, numeric));
}

function normalizeNotebookSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_NOTEBOOK_SPEED;
  return Math.min(1.25, Math.max(0.35, numeric));
}

function getNotebookPlaybackRate(value) {
  return normalizeNotebookSpeed(value) / NOTEBOOK_NORMAL_SPEED;
}

function formatNotebookSpeedLabel(value) {
  return `${formatMatrixNumber(getNotebookPlaybackRate(value), 2)}x`;
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function interpolateNumberValue(from, to, progress) {
  const start = parseNumber(from);
  const end = parseNumber(to);
  if (!Number.isFinite(start)) return Number.isFinite(end) ? end : 0;
  if (!Number.isFinite(end)) return start;
  return start + (end - start) * clamp01(progress);
}

function interpolateValueStrings(fromValues = [], toValues = [], progress) {
  const size = Math.max(fromValues.length, toValues.length);
  return Array.from({ length: size }, (_, index) =>
    formatPresetInputValue(interpolateNumberValue(fromValues[index] ?? 0, toValues[index] ?? 0, progress))
  );
}

function interpolateEquationEntry(fromEntry, toEntry, progress) {
  if (!fromEntry || !toEntry) return toEntry;
  const eased = clamp01(progress);
  const fromCoeffs = [...(fromEntry.coeffs ?? [0, 0, 0]), 0, 0, 0].slice(0, 3);
  const toCoeffs = [...(toEntry.coeffs ?? [0, 0, 0]), 0, 0, 0].slice(0, 3);
  const coeffs = fromCoeffs.map((value, index) =>
    interpolateNumberValue(value, toCoeffs[index], eased)
  );
  const value = interpolateNumberValue(fromEntry.value ?? 0, toEntry.value ?? 0, eased);
  return {
    ...toEntry,
    coeffs,
    value,
    text: formatEquationFromCoefficients(coeffs, value),
    dimension: Math.max(fromEntry.dimension ?? 2, toEntry.dimension ?? 2),
  };
}

function setMaterialOpacity(material, opacity) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item) return;
    item.transparent = true;
    item.opacity = opacity;
  });
}

function setObjectRevealOpacity(object, revealProgress) {
  const eased = easeOutCubic(revealProgress);
  object?.traverse?.((child) => {
    const material = child.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      if (!item) return;
      if (!Number.isFinite(item.userData.baseOpacity)) {
        item.userData.baseOpacity = Number.isFinite(item.opacity) ? item.opacity : 1;
      }
      item.transparent = true;
      item.opacity = item.userData.baseOpacity * eased;
    });
  });
}

function scaleObjectOpacity(object, opacityScale) {
  object?.traverse?.((child) => {
    const material = child.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      if (!item) return;
      const baseOpacity = Number.isFinite(item.opacity) ? item.opacity : 1;
      item.transparent = true;
      item.opacity = baseOpacity * opacityScale;
    });
  });
}

function setArrowVector(arrow, x, y, z, visible = true) {
  if (!arrow) return;
  const direction = new THREE.Vector3(x, y, z);
  const length = direction.length();

  if (!visible || length < EPSILON) {
    arrow.visible = false;
    return;
  }

  arrow.setDirection(direction.normalize());
  arrow.setLength(length, 0.28, 0.14);
  arrow.visible = true;
}

function createSceneArrow(color) {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    color,
    0.28,
    0.14
  );
  arrow.line.material.depthTest = false;
  arrow.cone.material.depthTest = false;
  arrow.renderOrder = 10;
  return arrow;
}

function createVectorVisual(scene, dragHandleGeometry, vector) {
  const arrow = createSceneArrow(vector.color);
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
  );
  const dotMaterial = new THREE.LineBasicMaterial({
    color: vector.color,
    transparent: true,
    opacity: 0.86,
    depthTest: false,
    depthWrite: false,
  });
  const dotLine = new THREE.LineSegments(dotGeometry, dotMaterial);
  dotLine.renderOrder = 12;

  const dotPointGeometry = new THREE.SphereGeometry(0.055, 18, 12);
  const dotPointMaterial = new THREE.MeshBasicMaterial({
    color: vector.color,
    depthTest: false,
    depthWrite: false,
  });
  const dotPoint = new THREE.Mesh(dotPointGeometry, dotPointMaterial);
  dotPoint.renderOrder = 13;

  const handleMaterial = new THREE.MeshBasicMaterial({
    color: vector.color,
    transparent: true,
    opacity: 0.001,
    depthTest: false,
    depthWrite: false,
  });
  const handle = new THREE.Mesh(dragHandleGeometry, handleMaterial);
  handle.renderOrder = 30;
  handle.userData.dragKey = `v:${vector.id}`;
  handle.userData.color = vector.color;

  scene.add(arrow, dotLine, dotPoint, handle);
  return { arrow, dotLine, dotPoint, handle, dotGeometry, dotMaterial, dotPointGeometry, dotPointMaterial, handleMaterial };
}

function disposeVectorVisual(scene, visual) {
  if (!visual) return;
  scene.remove(visual.arrow, visual.dotLine, visual.dotPoint, visual.handle);
  visual.arrow.line.geometry?.dispose?.();
  visual.arrow.line.material?.dispose?.();
  visual.arrow.cone.geometry?.dispose?.();
  visual.arrow.cone.material?.dispose?.();
  visual.dotGeometry.dispose();
  visual.dotMaterial.dispose();
  visual.dotPointGeometry.dispose();
  visual.dotPointMaterial.dispose();
  visual.handleMaterial.dispose();
}

function toMatrix4(m) {
  return new THREE.Matrix4().set(
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    0, 0, 0, 1
  );
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(digits)).toString();
}

function approximateFraction(value, maxDenominator = 24, tolerance = 0.0008) {
  if (!Number.isFinite(value) || Math.abs(value) < EPSILON) return null;
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = absolute - whole;
  if (fraction < EPSILON) return null;

  let best = null;
  for (let denominator = 2; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(fraction * denominator);
    if (numerator === 0 || numerator === denominator) continue;
    const candidate = numerator / denominator;
    const error = Math.abs(candidate - fraction);
    if (!best || error < best.error) {
      best = { numerator, denominator, error };
    }
  }

  if (!best || best.error > tolerance) return null;
  const numerator = whole * best.denominator + best.numerator;
  return `${sign < 0 ? '-' : ''}${numerator}/${best.denominator}`;
}

function formatMatrixNumber(value, digits = 2) {
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  const fraction = approximateFraction(value);
  if (fraction) return fraction;
  return Number(value.toFixed(digits)).toString();
}

function shortNumber(value) {
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(1)).toString();
}

function formatCoord(values, mode = '3d') {
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  return `(${values.slice(0, size).map((value) => formatMatrixNumber(value, 2)).join(', ')})`;
}

function formatCompactCoord(values, mode = '3d', digits = 1) {
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  return `(${values.slice(0, size).map((value) => formatMatrixNumber(value, digits)).join(', ')})`;
}

function coordLabelText(name, values, mode = '3d', showCoordinates = true, highlightIndices = []) {
  if (!showCoordinates) return `${name}\u2032`;
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  const highlightSet = new Set(highlightIndices.filter((index) => index >= 0 && index < size));
  if (!highlightSet.size) return `${name}\u2032 ${formatCoord(values, mode)}`;

  const parts = [{ text: `${name}\u2032 (` }];
  values.slice(0, size).forEach((value, index) => {
    parts.push({
      text: formatMatrixNumber(value, 2),
      className: highlightSet.has(index) ? 'axis-lock-value' : undefined,
    });
    if (index < size - 1) parts.push({ text: ', ' });
  });
  parts.push({ text: ')' });
  return parts;
}

function scalarLockHighlightIndices(values, mode = '3d') {
  const size = mode === '1d' ? 1 : mode === '2d' ? 2 : 3;
  const active = values
    .slice(0, size)
    .map((value, index) => ({ index, value: Math.abs(value) }))
    .filter((entry) => entry.value > EPSILON);
  if (!active.length) return [];
  const maxValue = Math.max(...active.map((entry) => entry.value));
  return active
    .filter((entry) => entry.value >= maxValue * 0.2)
    .map((entry) => entry.index);
}

function dotValues(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

function vectorLength(values) {
  return Math.sqrt(dotValues(values, values));
}

function dotRelationText(dotValue, lengthA, lengthB) {
  if (lengthA < EPSILON || lengthB < EPSILON) return 'dotZeroVector';
  if (Math.abs(dotValue) < EPSILON) return 'dotOrthogonal';
  return dotValue > 0 ? 'dotAcute' : 'dotObtuse';
}

function hasScalarText(value) {
  const text = String(value ?? '').trim();
  return text !== '' && text.toLowerCase() !== 'nan';
}

function cleanScalarText(value) {
  const text = String(value ?? '');
  return text.trim().toLowerCase() === 'nan' ? '' : text;
}

function formatInputValue(value) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(2)).toString();
}

function isFiniteVector3(vector) {
  return (
    !!vector &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function formatPresetInputValue(value) {
  return formatMatrixNumber(value, 4);
}

function formatVectorInputValue(value) {
  return formatInputValue(value);
}

function snapValue(value, distance = SNAP_DISTANCE) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < distance ? rounded : value;
}

function snapValuesFor3D(values, distance = SNAP_DISTANCE) {
  const snapped = values.map((value) => snapValue(value, distance));
  const absValues = snapped.map((value) => Math.abs(value));
  const maxAbs = Math.max(...absValues);
  if (maxAbs < EPSILON) return snapped;

  const ranked = absValues
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);
  const dominant = ranked[0];
  const second = ranked[1]?.value ?? 0;
  const axisLockDistance = Math.min(
    AXIS_LOCK_MAX_3D,
    Math.max(distance * 0.55, maxAbs * AXIS_LOCK_RATIO_3D)
  );
  if (dominant.value > EPSILON && second <= axisLockDistance) {
    return snapped.map((value, index) => (index === dominant.index ? value : 0));
  }

  const planeLockDistance = Math.min(
    PLANE_LOCK_MAX_3D,
    Math.max(distance * 0.38, maxAbs * PLANE_LOCK_RATIO_3D)
  );
  return snapped.map((value) => (Math.abs(value) <= planeLockDistance ? 0 : value));
}

function constrainVectorForMode(vector, mode, options = {}) {
  const shouldSnap = options.snap !== false;
  const snapDistance = options.drag ? DRAG_SNAP_DISTANCE : SNAP_DISTANCE;
  const next = vector.clone();
  if (mode === '1d') {
    next.y = 0;
    next.z = 0;
  } else if (mode === '2d') {
    next.z = 0;
  }
  if (!shouldSnap) return next;
  if (mode === '3d') {
    const [x, y, z] = snapValuesFor3D([next.x, next.y, next.z], snapDistance);
    next.set(x, y, z);
  } else {
    next.set(
      snapValue(next.x, snapDistance),
      snapValue(next.y, snapDistance),
      snapValue(next.z, snapDistance)
    );
  }
  return next;
}

function constrainInputValuesForMode(values, mode, shouldSnap = true, options = {}) {
  const next = [...values];
  if (mode === '1d') {
    next[1] = 0;
    next[2] = 0;
  } else if (mode === '2d') {
    next[2] = 0;
  }
  if (!shouldSnap) return next;
  const snapDistance = options.drag ? DRAG_SNAP_DISTANCE : SNAP_DISTANCE;
  if (mode === '3d') return snapValuesFor3D(next, snapDistance);
  return next.map((value) => snapValue(value, snapDistance));
}

function snapGuideLabelForVectors(rawVector, snappedVector, mode) {
  const axes = mode === '1d' ? ['x'] : mode === '2d' ? ['x', 'y'] : ['x', 'y', 'z'];
  const rawValues = [rawVector.x, rawVector.y, rawVector.z];
  const snappedValues = [snappedVector.x, snappedVector.y, snappedVector.z];
  const labels = axes
    .map((axis, index) => ({
      axis,
      value: snappedValues[index],
      delta: Math.abs(rawValues[index] - snappedValues[index]),
    }))
    .filter((item) => item.delta > 0.002)
    .sort((a, b) => {
      const aNonZero = Math.abs(a.value) > EPSILON ? 1 : 0;
      const bNonZero = Math.abs(b.value) > EPSILON ? 1 : 0;
      return bNonZero - aNonZero || b.delta - a.delta;
    })
    .slice(0, 3)
    .map((item) => `${item.axis} = ${formatNumber(item.value)}`);

  return labels.join(' · ');
}

function solveVectorInputForWorld(matrix, worldVector, mode, options = {}) {
  const { snap = true } = options;
  if (!isFiniteVector3(worldVector)) return [0, 0, 0];

  if (mode === '2d') {
    const [a, b, c, d] = [matrix[0], matrix[1], matrix[3], matrix[4]];
    const det = a * d - b * c;
    if (Math.abs(det) > EPSILON) {
      return constrainInputValuesForMode(
        [
          (d * worldVector.x - b * worldVector.y) / det,
          (-c * worldVector.x + a * worldVector.y) / det,
          0,
        ],
        mode,
        snap
      );
    }
  }

  if (mode === '1d') {
    const axis = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
    const lengthSquared = axis.lengthSq();
    if (lengthSquared > EPSILON) {
      return constrainInputValuesForMode(
        [axis.dot(new THREE.Vector3(worldVector.x, worldVector.y, worldVector.z)) / lengthSquared, 0, 0],
        mode,
        snap
      );
    }
  }

  const lambda = 1e-5;
  const ata = [
    matrix[0] * matrix[0] + matrix[3] * matrix[3] + matrix[6] * matrix[6] + lambda,
    matrix[0] * matrix[1] + matrix[3] * matrix[4] + matrix[6] * matrix[7],
    matrix[0] * matrix[2] + matrix[3] * matrix[5] + matrix[6] * matrix[8],
    matrix[1] * matrix[0] + matrix[4] * matrix[3] + matrix[7] * matrix[6],
    matrix[1] * matrix[1] + matrix[4] * matrix[4] + matrix[7] * matrix[7] + lambda,
    matrix[1] * matrix[2] + matrix[4] * matrix[5] + matrix[7] * matrix[8],
    matrix[2] * matrix[0] + matrix[5] * matrix[3] + matrix[8] * matrix[6],
    matrix[2] * matrix[1] + matrix[5] * matrix[4] + matrix[8] * matrix[7],
    matrix[2] * matrix[2] + matrix[5] * matrix[5] + matrix[8] * matrix[8] + lambda,
  ];
  const atb = [
    matrix[0] * worldVector.x + matrix[3] * worldVector.y + matrix[6] * worldVector.z,
    matrix[1] * worldVector.x + matrix[4] * worldVector.y + matrix[7] * worldVector.z,
    matrix[2] * worldVector.x + matrix[5] * worldVector.y + matrix[8] * worldVector.z,
  ];
  const inverse = inverse3(ata);
  const solved = inverse ? transformVector3(inverse, atb) : [worldVector.x, worldVector.y, worldVector.z];
  return solved.every(Number.isFinite) ? constrainInputValuesForMode(solved, mode, snap) : [0, 0, 0];
}

function viewKeyForMatrix(matrix) {
  const matrixRank = rank3(matrix);
  if (matrixRank <= 1) return '1d';
  if (matrixRank === 2) return '2d';
  return '3d';
}

function scalarConstraintResidual(constraint, point) {
  return Math.abs(dotValues(constraint.normal, point) - constraint.scalar);
}

function isScalarConstraintSolution(constraints, point, tolerance = 0.035) {
  return constraints.every((constraint) => scalarConstraintResidual(constraint, point) <= tolerance);
}

function solveScalarConstraintPoint(constraints, mode) {
  if (!constraints.length) return null;

  if (mode === '1d') {
    const usable = constraints.filter((constraint) => Math.abs(constraint.normal[0]) > EPSILON);
    if (!usable.length) return null;
    const x = usable[0].scalar / usable[0].normal[0];
    const point = [x, 0, 0];
    return isScalarConstraintSolution(usable, point) ? point : null;
  }

  if (mode === '2d') {
    const usable = constraints.filter((constraint) =>
      Math.hypot(constraint.normal[0], constraint.normal[1]) > EPSILON
    );
    for (let leftIndex = 0; leftIndex < usable.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < usable.length; rightIndex += 1) {
        const left = usable[leftIndex];
        const right = usable[rightIndex];
        const [a, b] = left.normal;
        const [c, d] = right.normal;
        const det = a * d - b * c;
        if (Math.abs(det) < EPSILON) continue;
        const point = [
          (left.scalar * d - b * right.scalar) / det,
          (a * right.scalar - left.scalar * c) / det,
          0,
        ];
        if (isScalarConstraintSolution(usable, point)) return point;
      }
    }
    return null;
  }

  const usable = constraints.filter((constraint) => vectorLength(constraint.normal) > EPSILON);
  for (let aIndex = 0; aIndex < usable.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < usable.length; bIndex += 1) {
      for (let cIndex = bIndex + 1; cIndex < usable.length; cIndex += 1) {
        const matrix = [
          ...usable[aIndex].normal,
          ...usable[bIndex].normal,
          ...usable[cIndex].normal,
        ];
        const inverse = inverse3(matrix);
        if (!inverse) continue;
        const point = transformVector3(inverse, [
          usable[aIndex].scalar,
          usable[bIndex].scalar,
          usable[cIndex].scalar,
        ]);
        if (isScalarConstraintSolution(usable, point)) return point;
      }
    }
  }
  return null;
}

function modeForMatrix(matrix) {
  return viewKeyForMatrix(matrix);
}

function matrixValuesForMode(matrix, mode = '3d') {
  if (mode === '1d') return [matrix[0]];
  if (mode === '2d') return matrix.length === 4 ? matrix : [matrix[0], matrix[1], matrix[3], matrix[4]];
  return matrix;
}

function dimensionForMode(mode = '3d') {
  if (mode === '1d') return 1;
  if (mode === '2d') return 2;
  return 3;
}

function modeForDimension(dimension = 3) {
  if (dimension <= 1) return '1d';
  if (dimension === 2) return '2d';
  return '3d';
}

function operationMatrixFromPreset(preset) {
  const values = matrixValuesForMode(preset.matrix, preset.mode);
  if (preset.mode === '1d') return [values[0], 0, 0, 0, 0, 0, 0, 0, 0];
  if (preset.mode === '2d') return [values[0], values[1], 0, values[2], values[3], 0, 0, 0, 0];
  return values;
}

function identityMatrixForMode(mode = '3d') {
  if (mode === '1d') return [1, 0, 0, 0, 0, 0, 0, 0, 0];
  if (mode === '2d') return [1, 0, 0, 0, 1, 0, 0, 0, 0];
  return [...identity3];
}

function matrixInputValuesForShape(matrix, rows, columns) {
  const values = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values.push(matrix[row * 3 + column] ?? '0');
    }
  }
  return values;
}

function patchMatrixInputShape(matrix, rows, columns, values) {
  const next = [...matrix];
  let valueIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      next[row * 3 + column] = values[valueIndex] ?? next[row * 3 + column] ?? '0';
      valueIndex += 1;
    }
  }
  return next;
}

function operationMatrixFromInputValues(values, rows, columns) {
  const matrix = Array.from({ length: 9 }, () => 0);
  let valueIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      matrix[row * 3 + column] = parseNumber(values[valueIndex]);
      valueIndex += 1;
    }
  }
  return matrix;
}

function operationModeForShape(rows, columns) {
  return rows === columns ? modeForDimension(rows) : '3d';
}

function identityInputValuesForMode(mode = '2d') {
  const dimension = dimensionForMode(mode);
  return matrixInputValuesForShape(identity3, dimension, dimension).map(formatPresetInputValue);
}

function matrixTextFromValues(values, dimension) {
  const rows = [];
  for (let row = 0; row < dimension; row += 1) {
    rows.push(values.slice(row * dimension, row * dimension + dimension).join(' '));
  }
  return rows.join('\n');
}

function matrixTextFromShapeValues(values, rows, columns) {
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    lines.push(values.slice(row * columns, row * columns + columns).join(' '));
  }
  return lines.join('\n');
}

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

function splitNotebookExecute(line) {
  const source = String(line ?? '');
  const match = source.match(/^(.*?)@\s*$/u);
  if (!match || !match[1].trim()) return { body: source, execute: false };
  return {
    body: match[1].trimEnd(),
    execute: true,
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

  return {
    body,
    execute,
    remove,
    show,
    durationSec,
  };
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

function splitNotebookLineMeta(line) {
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

function appendNotebookAlias(body, alias, hidden = false, execute = false, durationSec = null, remove = false, show = false) {
  const cleaned = normalizeNotebookVariableName(alias);
  let result = cleaned ? `${body}  #${cleaned}${hidden ? '!' : ''}` : body;
  if (execute) result = `${result}@`;
  if (remove) result = `${result} -`;
  else if (show) result = `${result} +`;
  if (Number.isFinite(durationSec) && durationSec > 0) {
    result = `${result} ${formatMatrixNumber(durationSec, 2)}s`;
  }
  return result;
}

function appendNotebookLineMeta(body, meta = {}) {
  const aliased = appendNotebookAlias(body, meta.alias, meta.hidden, meta.execute, meta.durationSec, meta.remove, meta.show);
  return meta.hidden && !meta.alias ? `! ${aliased}` : aliased;
}

const NOTEBOOK_IDENTIFIER_PATTERN = '[\\p{L}_][\\p{L}\\p{N}_]*';
const NOTEBOOK_NUMBER_TOKEN_PATTERN = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:\s*\/\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))?$/u;

function isNotebookNumberToken(value) {
  return NOTEBOOK_NUMBER_TOKEN_PATTERN.test(String(value ?? '').trim());
}

function parseNotebookVectorLine(line) {
  const { body: sourceLine, alias, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed || !trimmed.includes(',')) return null;
  const assignment = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:=|:)\\s*(.+)$`, 'u'));
  const assignedName = assignment?.[1] ?? null;
  const name = alias ?? assignedName;
  const source = assignment?.[2] ?? trimmed;
  const body = trimmed
    ? source
    .replace(/^[([{<]\s*/, '')
    .replace(/\s*[)\]}>]$/, '')
    : '';
  const parts = body.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every(isNotebookNumberToken)) return null;
  const values = parts.map((part) => parseNumber(part));
  if (!values.every(Number.isFinite)) return null;
  return {
    name,
    alias,
    assignedName,
    hidden,
    execute: true,
    explicitExecute: true,
    remove,
    durationSec,
    dimension: parts.length,
    values: [
      formatPresetInputValue(values[0] ?? 0),
      formatPresetInputValue(values[1] ?? 0),
      formatPresetInputValue(values[2] ?? 0),
    ],
  };
}

function normalizeNotebookVariableName(value, fallback = '') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/^(\p{N})/u, '_$1');
  return cleaned || fallback;
}

function notebookVariableKey(value) {
  return normalizeNotebookVariableName(value).toLowerCase();
}

function resolveNotebookVariableName(value, knownNames) {
  const fallback = normalizeNotebookVariableName(value);
  if (!fallback) return fallback;
  return knownNames?.get?.(notebookVariableKey(fallback)) ?? fallback;
}

function rememberNotebookVariableName(knownNames, value) {
  const normalized = normalizeNotebookVariableName(value);
  if (!normalized) return normalized;
  const key = notebookVariableKey(normalized);
  if (!knownNames.has(key)) knownNames.set(key, normalized);
  return knownNames.get(key) ?? normalized;
}

function notebookVectorIdForName(name, index) {
  return `notebook-${normalizeNotebookVariableName(name, `v${index + 1}`)}`;
}

function measurementStateKey(type, targets) {
  return `${type}:${[...targets].sort().join('|')}`;
}

function parseNotebookMeasurementLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const { body: sourceLine, alias, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(dot|det)\s*\((.*)\)\s*$/iu);
  if (match) {
    const kind = match[1].toLowerCase();
    const names = match[2]
      .split(',')
      .map((part) => resolveNotebookVariableName(part.trim(), knownNames))
      .filter(Boolean);
    if (kind === 'dot' && names.length < 2) return null;
    if (kind === 'det' && names.length < 2) return null;
    return {
      type: kind === 'dot' ? 'dot' : 'volume',
      alias,
      hidden,
      remove,
      durationSec,
      execute: true,
      names: kind === 'dot' ? names.slice(0, 2) : names.slice(0, 3),
    };
  }

  const product = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:\\*|횞)\\s*(${NOTEBOOK_IDENTIFIER_PATTERN})$`, 'u'));
  if (!product) return null;
  const leftName = resolveNotebookVariableName(product[1], knownNames);
  const rightName = resolveNotebookVariableName(product[2], knownNames);
  const leftShape = knownShapes.get(notebookVariableKey(leftName));
  const rightShape = knownShapes.get(notebookVariableKey(rightName));
  if (leftShape?.kind !== 'vector' || rightShape?.kind !== 'vector') return null;
  return {
    type: 'dot',
    alias,
    hidden,
    remove,
    durationSec,
    execute: true,
    notation: 'product',
    names: [leftName, rightName],
  };
}

function parseNotebookCaptionLine(line) {
  const { body: sourceLine, hidden, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed.startsWith('//')) return null;
  const text = trimmed.replace(/^\/\/\s?/u, '').trim();
  if (!text && !remove) return null;
  return {
    text,
    hidden,
    remove,
    durationSec,
  };
}

function parseNotebookCalculationLine(line) {
  const { body: sourceLine, alias, hidden, execute, durationSec, remove } = splitNotebookLineMeta(line);
  const trimmed = sourceLine.trim();
  if (!trimmed || !/[=*×]/.test(trimmed)) return null;
  const assignment = trimmed.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*=\\s*(.+)$`, 'u'));
  const assignedTarget = assignment?.[1] ?? null;
  const target = alias ?? assignedTarget;
  const expression = (assignment?.[2] ?? trimmed).trim();
  const product = expression.match(new RegExp(`^(${NOTEBOOK_IDENTIFIER_PATTERN})\\s*(?:\\*|×)\\s*(${NOTEBOOK_IDENTIFIER_PATTERN})$`, 'u'));
  if (!product) return null;
  return {
    target,
    alias,
    assignedTarget,
    hidden,
    execute: true,
    explicitExecute: Boolean(execute),
    remove,
    durationSec,
    left: product[1],
    right: product[2],
  };
}

function multiplyNotebookMatrixVector(matrix, vectorValues) {
  return transformVector3(matrix, vectorValues.map((value) => parseNumber(value))).map(formatPresetInputValue);
}

function notebookMatrixShape(matrix) {
  const rows = Math.max(1, Math.min(3, Number(matrix?.rows) || 3));
  const columns = Math.max(1, Math.min(3, Number(matrix?.columns) || rows));
  const shapedValues = Array.isArray(matrix?.shapeValues)
    ? matrix.shapeValues
    : Array.isArray(matrix?.values)
      ? matrixInputValuesForShape(matrix.values, rows, columns)
      : [];
  const values = Array.from({ length: rows * columns }, (_, index) =>
    parseNumber(shapedValues[index] ?? (index % (columns + 1) === 0 ? '1' : '0'))
  );
  return { rows, columns, values };
}

function multiplyNotebookMatrices(leftMatrix, rightMatrix) {
  const left = notebookMatrixShape(leftMatrix);
  const right = notebookMatrixShape(rightMatrix);
  if (left.columns !== right.rows) return null;

  const shapeValues = [];
  for (let row = 0; row < left.rows; row += 1) {
    for (let column = 0; column < right.columns; column += 1) {
      let sum = 0;
      for (let shared = 0; shared < left.columns; shared += 1) {
        sum += left.values[row * left.columns + shared] * right.values[shared * right.columns + column];
      }
      shapeValues.push(formatPresetInputValue(sum));
    }
  }

  return {
    type: 'matrix',
    rows: left.rows,
    columns: right.columns,
    mode: operationModeForShape(left.rows, right.columns),
    shapeValues,
    values: operationMatrixFromInputValues(shapeValues, left.rows, right.columns),
  };
}

function formatEquationFromCoefficients(coeffs, value) {
  const terms = coeffs
    .map((coefficient, index) => ({ coefficient, variable: equationVariables[index] }))
    .filter((term) => Math.abs(term.coefficient) > EPSILON);
  if (!terms.length) return `0 = ${formatMatrixNumber(value, 3)}`;
  const left = terms
    .map((term, index) => `${formatEquationCoefficient(term.coefficient, index === 0)}${term.variable}`)
    .join('')
    .trim();
  return `${left} = ${formatMatrixNumber(value, 3)}`;
}

function transformNotebookEquation(equation, matrixEntry) {
  if (!equation || !matrixEntry) return null;
  const coeffs = [...(equation.coeffs ?? [0, 0, 0]), 0, 0, 0].slice(0, 3);
  const value = Number(equation.value ?? 0);
  const equationDimension = Math.abs(coeffs[2]) > EPSILON ? 3 : 2;
  const matrixDimension = Math.max(matrixEntry.rows ?? 2, matrixEntry.columns ?? 2);
  const dimension = Math.max(equationDimension, matrixDimension >= 3 ? 3 : 2);

  if (dimension <= 2) {
    const [a, b, c, d] = matrixValuesForMode(matrixEntry.values, '2d');
    const det = a * d - b * c;
    if (Math.abs(det) < EPSILON) return null;
    const inverse = [d / det, -b / det, -c / det, a / det];
    const nextCoeffs = [
      inverse[0] * coeffs[0] + inverse[2] * coeffs[1],
      inverse[1] * coeffs[0] + inverse[3] * coeffs[1],
      0,
    ];
    return {
      type: 'equation',
      coeffs: nextCoeffs,
      value,
      text: formatEquationFromCoefficients(nextCoeffs, value),
      dimension: 2,
    };
  }

  const inverse = inverse3(matrixEntry.values);
  if (!inverse) return null;
  const nextCoeffs = [
    inverse[0] * coeffs[0] + inverse[3] * coeffs[1] + inverse[6] * coeffs[2],
    inverse[1] * coeffs[0] + inverse[4] * coeffs[1] + inverse[7] * coeffs[2],
    inverse[2] * coeffs[0] + inverse[5] * coeffs[1] + inverse[8] * coeffs[2],
  ];
  return {
    type: 'equation',
    coeffs: nextCoeffs,
    value,
    text: formatEquationFromCoefficients(nextCoeffs, value),
    dimension: 3,
  };
}

function parseNotebookReferenceLine(line, knownNames = new Map(), knownShapes = new Map()) {
  const meta = splitNotebookLineMeta(line);
  const trimmed = meta.body.trim().replace(/^#\s*/u, '');
  if (!new RegExp(`^${NOTEBOOK_IDENTIFIER_PATTERN}$`, 'u').test(trimmed)) return null;
  const name = resolveNotebookVariableName(trimmed, knownNames);
  const shape = knownShapes.get(notebookVariableKey(name));
  if (!shape) return null;
  return {
    ...meta,
    name,
    refKind: shape.kind,
    shape,
    execute: true,
    explicitExecute: Boolean(meta.execute),
  };
}

function parseNotebookNumericRowLine(line) {
  const trimmed = splitNotebookLineMeta(line).body.trim();
  if (parseNotebookVectorLine(trimmed)) return null;
  if (!trimmed || /[a-zㄱ-ㅎㅏ-ㅣ가-힣一-龥ぁ-んァ-ン=]/i.test(trimmed)) return null;
  if (!/^[\d\s.,/+()-]+$/.test(trimmed)) return null;
  const numberPattern = /[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:\s*\/\s*[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))?/g;
  const matches = trimmed.match(numberPattern) ?? [];
  if (matches.length < 2 || !/\S\s+\S/.test(trimmed)) return null;
  return matches;
}

function notebookMatrixRowsFromText(text) {
  const source = String(text ?? '').replace(/\r/g, '');
  return source
    .split('\n')
    .map((line) => parseNotebookNumericRowLine(line) ?? [])
    .filter((row) => row.length > 0);
}

function notebookMatrixModeFromText(text, fallbackMode = '2d') {
  const rows = notebookMatrixRowsFromText(text);
  if (rows.length >= 1 && rows.length <= 3 && rows.every((row) => row.length === rows.length)) {
    return modeForDimension(rows.length);
  }
  const valueCount = rows.reduce((total, row) => total + row.length, 0);
  const dimension = Math.sqrt(valueCount);
  if (Number.isInteger(dimension) && dimension >= 1 && dimension <= 3) return modeForDimension(dimension);
  return fallbackMode;
}

function matrixValuesFromNotebookText(text, mode = '2d') {
  const resolvedMode = notebookMatrixModeFromText(text, mode);
  const dimension = dimensionForMode(resolvedMode);
  const rows = notebookMatrixRowsFromText(text);
  const rowValues = rows.flatMap((row) => row);
  const values = Array.from({ length: dimension * dimension }, (_, index) =>
    formatPresetInputValue(parseNumber(rowValues[index] ?? (index % (dimension + 1) === 0 ? '1' : '0')))
  );
  return values;
}

function createNotebookEquationCell(text = '') {
  return {
    id: `equation-cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'equation',
    text,
  };
}

function createNotebookMatrixCell(mode = '2d') {
  const dimension = dimensionForMode(mode);
  return {
    id: `matrix-cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'matrix',
    mode,
    text: matrixTextFromValues(identityInputValuesForMode(mode), dimension),
  };
}

function createNotebookNoteCell(text = '') {
  return {
    id: `note-cell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'note',
    text,
  };
}

function inverseForStep(matrix, mode = '3d') {
  if (mode === '1d') {
    if (Math.abs(matrix[0]) < EPSILON) return null;
    return [1 / matrix[0]];
  }

  if (mode === '2d') {
    const [a, b, c, d] = matrixValuesForMode(matrix, '2d');
    const det = a * d - b * c;
    if (Math.abs(det) < EPSILON) return null;
    return [d / det, -b / det, -c / det, a / det];
  }

  return inverse3(matrix);
}

function determinantForStep(matrix, mode = '3d') {
  if (mode === '1d') return matrix[0];
  if (mode === '2d') {
    const [a, b, c, d] = matrixValuesForMode(matrix, '2d');
    return a * d - b * c;
  }
  return determinant3(matrix);
}

function rankForStep(matrix, mode = '3d') {
  if (mode === '1d') return Math.abs(matrix[0]) < EPSILON ? 0 : 1;
  if (mode === '2d') {
    const values = matrixValuesForMode(matrix, '2d');
    if (Math.abs(determinantForStep(matrix, '2d')) > EPSILON) return 2;
    return values.some((value) => Math.abs(value) > EPSILON) ? 1 : 0;
  }
  return rank3(matrix);
}

function multiplyMatrix2(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

function operationBetweenMatrices(previousMatrix, nextMatrix) {
  const previousMode = modeForMatrix(previousMatrix);
  const nextMode = modeForMatrix(nextMatrix);

  if (previousMode === nextMode) {
    if (nextMode === '1d') {
      const [previousValue] = matrixValuesForMode(previousMatrix, '1d');
      const [nextValue] = matrixValuesForMode(nextMatrix, '1d');
      return {
        isDimensionDrop: false,
        operationMatrix: Math.abs(previousValue) > EPSILON ? [nextValue / previousValue] : [nextValue],
        operationMode: '1d',
      };
    }

    if (nextMode === '2d') {
      const previousValues = matrixValuesForMode(previousMatrix, '2d');
      const nextValues = matrixValuesForMode(nextMatrix, '2d');
      const previousInverse = inverseForStep(previousValues, '2d');
      return {
        isDimensionDrop: false,
        operationMatrix: previousInverse ? multiplyMatrix2(nextValues, previousInverse) : nextValues,
        operationMode: '2d',
      };
    }

    const previousInverse = inverse3(previousMatrix);
    return {
      isDimensionDrop: false,
      operationMatrix: previousInverse ? multiplyMatrix3(nextMatrix, previousInverse) : nextMatrix,
      operationMode: '3d',
    };
  }

  return {
    isDimensionDrop: rankForStep(nextMatrix, nextMode) < rankForStep(previousMatrix, previousMode),
    operationMatrix: nextMatrix,
    operationMode: nextMode,
  };
}

function matricesAlmostEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(value - b[index]) < EPSILON);
}

function dragHistoryName(key, locale = 'ko') {
  if (key === 'i') return t(locale, 'axisDragI');
  if (key === 'j') return t(locale, 'axisDragJ');
  if (key === 'k') return t(locale, 'axisDragK');
  return t(locale, 'axisDrag');
}

function vectorIdFromDragKey(key) {
  return key?.startsWith('v:') ? key.slice(2) : null;
}

function scalarIdFromDragKey(key) {
  return key?.startsWith('s:') ? key.slice(2) : null;
}

const equationVariables = ['x', 'y', 'z'];
const equationLineColors = [0xf59e0b, 0xa855f7, 0xec4899, 0xf97316, 0xd946ef, 0xeab308];
const vectorPalette = [0x8b5cf6, 0xf59e0b, 0xec4899, 0xf97316, 0xd946ef, 0xeab308];
const equationExamples = {
  unique: ['x + y = 3', '2x - y = 0'],
  infinite: ['2x + 2y = 4', 'x + y = 2'],
  none: ['x + y = 1', 'x + y = 3'],
  space3d: ['x + y + z = 3', '2x - y + z = 1', 'x + 2y - z = 2'],
  overlap3d: ['x + y + z = 3', '2x - y + z = 1'],
};

function colorToHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function equationSceneLabelName(item, mode, index) {
  const prefix = mode === '3d' ? 'P' : 'L';
  return `${prefix}${(item?.index ?? index) + 1}`;
}

function equationSceneLabelKey(item, mode, index) {
  return `${mode}:${item?.index ?? index}`;
}

function equationRevealKey(item, mode, index) {
  return `equation:${mode === '3d' ? 'plane' : 'line'}:${item?.index ?? index}`;
}

function equationAnchorPoint(item, mode) {
  if (!item) return null;
  const normal = mode === '3d'
    ? new THREE.Vector3(item.a, item.b, item.c)
    : new THREE.Vector3(item.a, item.b, 0);
  const lengthSquared = normal.lengthSq();
  if (lengthSquared < EPSILON) return null;
  return normal.multiplyScalar((Number(item.value) || 0) / lengthSquared);
}

function equationSceneLabelText(item, mode, index, showCoordinates = true) {
  const name = equationSceneLabelName(item, mode, index);
  if (!showCoordinates) return `${name}\u2032`;
  const coeffs = mode === '3d' ? [item.a, item.b, item.c] : [item.a, item.b, 0];
  return `${name}\u2032 ${formatEquationFromCoefficients(coeffs, item.value)}`;
}

function createVectorState(index, overrides = {}) {
  const id = overrides.id ?? `v${index + 1}`;
  return {
    id,
    name: overrides.name ?? `v${index + 1}`,
    color: overrides.color ?? vectorPalette[index % vectorPalette.length],
    x: overrides.x ?? '2',
    y: overrides.y ?? '2',
    z: overrides.z ?? '2',
    visible: overrides.visible ?? true,
    scalarEnabled: overrides.scalarEnabled ?? false,
    scalar: overrides.scalar ?? '1',
    scalarSpace: overrides.scalarSpace === 'output' ? 'output' : 'input',
  };
}

function parseExpression(expression) {
  const coeffs = [0, 0, 0];
  let constant = 0;
  const compact = expression
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[−–—]/g, '-')
    .replace(/\*/g, '')
    .replace(/,/g, '.')
    .replace(/(\d)\s+([xyz])/gi, '$1$2')
    .replace(/([+\-])\s+([xyz])/gi, '$1$2')
    .replace(/([+\-])\s+/g, '$1')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-');

  if (!compact) return { coeffs, constant };

  const normalized = /^[+\-]/.test(compact) ? compact : `+${compact}`;
  const terms = normalized.match(/[+\-][^+\-]+/g) ?? [];
  if (!terms.length) throw new Error('term');

  terms.forEach((term) => {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.slice(1);
    const numberPattern = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:\\/(?:\\d+(?:\\.\\d*)?|\\.\\d+))?';
    const variableMatch = body.match(new RegExp(`^(${numberPattern})?([xyz])$`, 'i'));

    if (variableMatch) {
      const variableIndex = equationVariables.indexOf(variableMatch[2].toLowerCase());
      const coefficientText = variableMatch[1] ?? '';
      const coefficient = coefficientText ? parseNumber(coefficientText) : 1;
      if (!Number.isFinite(coefficient)) throw new Error('coefficient');
      coeffs[variableIndex] += sign * coefficient;
      return;
    }

    if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:\/(?:\d+(?:\.\d*)?|\.\d+))?$/.test(body)) {
      constant += sign * parseNumber(body);
      return;
    }

    throw new Error('term');
  });

  return { coeffs, constant };
}

function parseEquation(text) {
  const source = splitNotebookLineMeta(text).body;
  const trimmed = source.normalize('NFKC').replace(/[＝]/g, '=').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('=');
  if (parts.length > 2) throw new Error('equals');

  const left = parseExpression(parts[0]);
  const right = parts.length === 2 ? parseExpression(parts[1]) : { coeffs: [0, 0, 0], constant: 0 };
  return {
    coeffs: left.coeffs.map((value, index) => value - right.coeffs[index]),
    value: right.constant - left.constant,
  };
}

function formatEquationCoefficient(value, isFirst = false) {
  const sign = value < 0 ? '-' : '+';
  const absolute = Math.abs(value);
  const coefficient = Math.abs(absolute - 1) < EPSILON ? '' : formatMatrixNumber(absolute, 3);
  return `${isFirst ? (sign === '-' ? '- ' : '') : ` ${sign} `}${coefficient}`;
}

function prettifyEquationLine(text) {
  const meta = splitNotebookLineMeta(text);
  const { body, alias, hidden } = meta;
  if (!body.trim()) return '';
  try {
    const parsed = parseEquation(body);
    if (!parsed) return '';
    const terms = parsed.coeffs
      .map((coefficient, index) => ({ coefficient, variable: equationVariables[index] }))
      .filter((term) => Math.abs(term.coefficient) > EPSILON);
    if (!terms.length) return appendNotebookLineMeta(`0 = ${formatMatrixNumber(parsed.value, 3)}`, meta);

    const left = terms
      .map((term, index) => `${formatEquationCoefficient(term.coefficient, index === 0)}${term.variable}`)
      .join('')
      .trim();
    return appendNotebookLineMeta(`${left} = ${formatMatrixNumber(parsed.value, 3)}`, meta);
  } catch {
    return appendNotebookLineMeta(body.trim().replace(/\s+/g, ' '), meta);
  }
}

function prettifyEquationNoteText(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => prettifyEquationLine(line))
    .join('\n');
}

function parsedEquationLine(text) {
  const trimmed = splitNotebookLineMeta(text).body.trim();
  if (!trimmed || !trimmed.includes('=')) return null;
  try {
    const parsed = parseEquation(trimmed);
    if (!parsed || !parsed.coeffs.some((coefficient) => Math.abs(coefficient) > EPSILON)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function prettifyNotebookScriptText(text) {
  let equationCount = 0;
  let vectorCount = 0;
  let matrixCount = 0;
  let calculationCount = 0;
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const output = [];
  const knownNames = new Map();
  const knownShapes = new Map();

  const prettifyNoteLine = (sourceLine) => {
    const trimmed = String(sourceLine ?? '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('//')) return `// ${trimmed.replace(/^\/\/\s?/u, '').trim()}`;
    if (trimmed.startsWith('#')) return trimmed;
    return `# ${trimmed}`;
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      output.push('');
      index += 1;
      continue;
    }

      const equationLine = parsedEquationLine(line);
      if (equationLine) {
        equationCount += 1;
        const meta = splitNotebookLineMeta(line);
        const prefix = Math.abs(equationLine.coeffs[2]) > EPSILON || /\bz\b/i.test(meta.body) ? 'P' : 'L';
        const equationAlias = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(meta.alias, `${prefix}${equationCount}`)
        );
        const lineWithAlias = meta.alias
          ? line
          : appendNotebookLineMeta(meta.body, { ...meta, alias: equationAlias });
        knownShapes.set(notebookVariableKey(equationAlias), {
          kind: 'equation',
          coeffs: equationLine.coeffs,
          value: equationLine.value,
          dimension: prefix === 'P' ? 3 : 2,
        });
      output.push(prettifyEquationLine(lineWithAlias));
      index += 1;
      continue;
      }

      const captionLine = parseNotebookCaptionLine(line);
      if (captionLine) {
        output.push(appendNotebookLineMeta(captionLine.text ? `// ${captionLine.text}` : '//', captionLine));
        index += 1;
        continue;
      }

      const measurementLine = parseNotebookMeasurementLine(line, knownNames, knownShapes);
      if (measurementLine) {
        const expression = measurementLine.type === 'dot'
          ? measurementLine.notation === 'product'
            ? `${measurementLine.names[0]} * ${measurementLine.names[1]}`
            : `dot(${measurementLine.names[0]}, ${measurementLine.names[1]})`
          : `det(${measurementLine.names.join(', ')})`;
        output.push(appendNotebookLineMeta(expression, measurementLine));
        index += 1;
        continue;
      }

      const vectorLine = parseNotebookVectorLine(line);
      if (vectorLine) {
      vectorCount += 1;
        const vectorText = vectorLine.values.slice(0, vectorLine.dimension).join(', ');
      if (vectorLine.alias) {
        rememberNotebookVariableName(knownNames, vectorLine.alias);
        knownShapes.set(notebookVariableKey(vectorLine.alias), {
          kind: 'vector',
          dimension: vectorLine.dimension,
        });
        output.push(appendNotebookLineMeta(vectorText, vectorLine));
        index += 1;
        continue;
      }
      const vectorAlias = normalizeNotebookVariableName(vectorLine.assignedName, `v${vectorCount}`);
      const resolvedVectorAlias = rememberNotebookVariableName(knownNames, vectorAlias);
        knownShapes.set(notebookVariableKey(resolvedVectorAlias), {
          kind: 'vector',
          dimension: vectorLine.dimension,
        });
        const next = vectorLine.assignedName ? `${resolvedVectorAlias} = ${vectorText}` : vectorText;
      output.push(appendNotebookLineMeta(next, { ...vectorLine, alias: resolvedVectorAlias }));
      index += 1;
      continue;
      }

      const calculationLine = parseNotebookCalculationLine(line);
      if (calculationLine) {
      calculationCount += 1;
        const leftName = resolveNotebookVariableName(calculationLine.left, knownNames);
        const rightName = resolveNotebookVariableName(calculationLine.right, knownNames);
        const leftShape = knownShapes.get(notebookVariableKey(leftName));
        const rightShape = knownShapes.get(notebookVariableKey(rightName));
        const isMatrixProduct = leftShape?.kind === 'matrix' && rightShape?.kind === 'matrix';
        const isVectorProduct =
          (leftShape?.kind === 'matrix' && rightShape?.kind === 'vector') ||
          (leftShape?.kind === 'vector' && rightShape?.kind === 'matrix');
        const isEquationProduct =
          (leftShape?.kind === 'matrix' && rightShape?.kind === 'equation') ||
          (leftShape?.kind === 'equation' && rightShape?.kind === 'matrix');
        const defaultTarget = isMatrixProduct
          ? rightName
          : isVectorProduct
            ? (leftShape?.kind === 'vector' ? leftName : rightName)
            : isEquationProduct
              ? (leftShape?.kind === 'equation' ? leftName : rightName)
              : null;
        const rememberCalculationShape = (targetName) => {
          if (!targetName) return;
          const normalizedTarget = rememberNotebookVariableName(knownNames, targetName);
          const shape = isMatrixProduct
            ? { kind: 'matrix', rows: leftShape.rows, columns: rightShape.columns }
            : isEquationProduct
              ? {
                  kind: 'equation',
                  coeffs: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.coeffs ?? [0, 0, 0],
                  value: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.value ?? 0,
                  dimension: Math.max(leftShape?.dimension ?? 2, rightShape?.dimension ?? 2),
                }
              : isVectorProduct
                ? { kind: 'vector', dimension: leftShape?.rows ?? rightShape?.dimension ?? 3 }
                : null;
          if (shape) knownShapes.set(notebookVariableKey(normalizedTarget), shape);
        };
        const expression = `${leftName} * ${rightName}`;
      if (calculationLine.alias) {
        rememberNotebookVariableName(knownNames, calculationLine.alias);
        rememberCalculationShape(calculationLine.alias);
        output.push(appendNotebookLineMeta(expression, {
          ...calculationLine,
          execute: calculationLine.explicitExecute,
        }));
        index += 1;
        continue;
      }
      if (calculationLine.assignedTarget) {
        const calculationAlias = normalizeNotebookVariableName(calculationLine.assignedTarget, `r${calculationCount}`);
        const resolvedCalculationAlias = rememberNotebookVariableName(knownNames, calculationAlias);
        rememberCalculationShape(resolvedCalculationAlias);
        output.push(appendNotebookLineMeta(`${resolvedCalculationAlias} = ${expression}`, {
          ...calculationLine,
          alias: undefined,
          execute: calculationLine.explicitExecute,
        }));
        index += 1;
        continue;
      }
      rememberCalculationShape(defaultTarget);
      output.push(appendNotebookLineMeta(expression, {
        ...calculationLine,
        alias: undefined,
        execute: calculationLine.explicitExecute,
      }));
      index += 1;
      continue;
      }

      const referenceLine = parseNotebookReferenceLine(line, knownNames, knownShapes);
      if (referenceLine) {
        const shouldShowReference = !referenceLine.remove && referenceLine.refKind !== 'matrix';
        output.push(appendNotebookLineMeta(referenceLine.name, {
          execute: referenceLine.explicitExecute,
          remove: referenceLine.remove,
          show: shouldShowReference,
          durationSec: referenceLine.durationSec,
        }));
        index += 1;
        continue;
      }

      const numericRow = parseNotebookNumericRowLine(line);
      if (numericRow) {
      const matrixRows = [];
      let rowIndex = index;
      while (rowIndex < lines.length) {
        const row = parseNotebookNumericRowLine(lines[rowIndex]);
        if (!row) break;
        const meta = splitNotebookLineMeta(lines[rowIndex]);
        matrixRows.push({ row, meta });
        rowIndex += 1;
      }

      const rows = matrixRows.length;
      const columns = matrixRows[0]?.row.length ?? 0;
      const hasMatrixBlockBreak = rowIndex >= lines.length || !lines[rowIndex].trim();
      const isMatrixBlock =
        hasMatrixBlockBreak &&
        rows >= 2 &&
        rows <= 3 &&
        columns >= 1 &&
        columns <= 3 &&
        matrixRows.every((item) => item.row.length === columns);

      if (isMatrixBlock) {
        matrixCount += 1;
        const matrixAlias = matrixRows.map((item) => item.meta.alias).find(Boolean) ?? `M${matrixCount}`;
        const resolvedMatrixAlias = rememberNotebookVariableName(knownNames, matrixAlias);
        const matrixExecute = matrixRows.some((rowItem) => rowItem.meta.execute);
        const matrixRemove = matrixRows.some((rowItem) => rowItem.meta.remove);
        const matrixDurationSec = matrixRows.map((rowItem) => rowItem.meta.durationSec).find(Number.isFinite) ?? null;
        knownShapes.set(notebookVariableKey(resolvedMatrixAlias), {
          kind: 'matrix',
          rows,
          columns,
        });
        matrixRows.forEach((item, itemIndex) => {
          output.push(
            appendNotebookLineMeta(
              item.row.map((value) => formatPresetInputValue(parseNumber(value))).join(' '),
              {
                hidden: item.meta.hidden,
                alias: itemIndex === 0 ? resolvedMatrixAlias : undefined,
                execute: itemIndex === 0 && matrixExecute,
                remove: itemIndex === 0 && matrixRemove,
                durationSec: itemIndex === 0 ? matrixDurationSec : null,
              }
            )
          );
        });
        index = rowIndex;
        continue;
      }

      matrixRows.forEach((item) => {
        output.push(
          appendNotebookLineMeta(
            item.row.map((value) => formatPresetInputValue(parseNumber(value))).join(' '),
            item.meta
          )
        );
      });
      index = rowIndex;
      continue;
    }

    output.push(prettifyNoteLine(line));
    index += 1;
  }

  return output.join('\n');
}

function notebookStarterText(locale) {
  const equationLines = t(locale, 'equationNotePlaceholder')
    .split('\n')
    .map((line, index) => appendNotebookAlias(line, `L${index + 1}`))
    .join('\n');
  return `${equationLines}\n\n2 1  #M1\n1 2\n\n# ${t(locale, 'notePlaceholder')}`;
}

function notebookPlaceholderText(locale) {
  return `${notebookStarterText(locale)}   [Tab]`;
}

function parseNotebookScript(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const cells = [];
  const marks = Array.from({ length: Math.max(1, lines.length) }, () => null);
  let equationCount = 0;
  let matrixCount = 0;
  let vectorCount = 0;
  let calculationCount = 0;
  let measurementCount = 0;
  let scriptMode = '2d';
  let index = 0;
  const knownNames = new Map();
  const knownShapes = new Map();

  const flushEquationBlock = (block) => {
    if (!block.length) return;
    const visibleBlock = block.filter((item) => !item.hidden);
    const hasZ = visibleBlock.some((item) => Math.abs(item.parsed.coeffs[2]) > EPSILON || /\bz\b/i.test(item.line));
    if (hasZ) scriptMode = '3d';
    const prefix = hasZ ? 'P' : 'L';
    const textBlock = visibleBlock.map((item) => item.body.trim()).join('\n');
    const equationLineDurations = block
      .filter((item) => Number.isFinite(item.durationSec) && item.durationSec > 0)
      .map((item) => ({
        line: item.index,
        durationSec: item.durationSec,
      }));
    const equationItems = [];
      block.forEach((item) => {
        equationCount += 1;
        const defaultLabel = `${prefix}${equationCount}`;
        const equationName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(item.alias, defaultLabel)
        );
        const color = equationLineColors[(equationCount - 1) % equationLineColors.length];
        marks[item.index] = {
          kind: 'equation',
          label: equationName,
          color,
          hidden: item.hidden,
        };
        knownShapes.set(notebookVariableKey(equationName), {
          kind: 'equation',
          coeffs: item.parsed.coeffs,
          value: item.parsed.value,
          dimension: hasZ ? 3 : 2,
        });
        if (!item.hidden) {
          equationItems.push({
            name: equationName,
            text: item.body.trim(),
            coeffs: item.parsed.coeffs,
            value: item.parsed.value,
            color,
            dimension: hasZ ? 3 : 2,
          });
        }
      });
    cells.push({
      id: `script-equation-${block[0].index}-${block[block.length - 1].index}`,
      type: 'equation',
      text: textBlock,
      equations: equationItems,
      hidden: visibleBlock.length === 0,
      lineDurations: equationLineDurations,
      lineStart: block[0].index,
      lineEnd: block[block.length - 1].index,
    });
  };

  while (index < lines.length) {
    const line = lines[index];
    const lineMeta = splitNotebookLineMeta(line);
    const trimmed = lineMeta.body.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const captionLine = parseNotebookCaptionLine(lines[index]);
    if (captionLine) {
      marks[index] = {
        kind: 'caption',
        label: 'CC',
        color: 0xf1b434,
        hidden: captionLine.hidden,
      };
      cells.push({
        id: `script-caption-${index}`,
        type: 'caption',
        text: captionLine.text,
        hidden: captionLine.hidden,
        remove: captionLine.remove,
        durationSec: captionLine.durationSec,
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const measurementLine = parseNotebookMeasurementLine(lines[index], knownNames, knownShapes);
    if (measurementLine) {
      measurementCount += 1;
      const defaultLabel = `${measurementLine.type === 'dot' ? 'dot' : 'det'}${measurementCount}`;
      const measurementName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(measurementLine.alias, defaultLabel)
      );
      marks[index] = {
        kind: 'measurement',
        label: measurementName,
        color: measurementLine.type === 'dot' ? MEASURE_DOT_HEX : MEASURE_AREA_HEX,
        hidden: measurementLine.hidden,
      };
      cells.push({
        id: `script-measure-${index}`,
        type: 'measurement',
        measureType: measurementLine.type,
        name: measurementName,
        names: measurementLine.names,
        hidden: measurementLine.hidden,
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const vectorLine = parseNotebookVectorLine(lines[index]);
    if (vectorLine) {
      vectorCount += 1;
      const vectorName = rememberNotebookVariableName(
        knownNames,
        normalizeNotebookVariableName(vectorLine.name, `v${vectorCount}`)
      );
      const vectorColor = vectorPalette[(vectorCount - 1) % vectorPalette.length];
      if (vectorLine.dimension >= 3) scriptMode = '3d';
      marks[index] = {
        kind: 'vector',
        label: vectorName,
        color: vectorColor,
        hidden: vectorLine.hidden,
      };
      cells.push({
        id: `script-vector-${index}`,
        type: 'vector',
        name: vectorName,
        values: vectorLine.values,
        dimension: vectorLine.dimension,
        color: vectorColor,
        hidden: vectorLine.hidden,
        remove: vectorLine.remove,
        durationSec: vectorLine.durationSec,
        lineStart: index,
        lineEnd: index,
      });
      knownShapes.set(notebookVariableKey(vectorName), {
        kind: 'vector',
        dimension: vectorLine.dimension,
      });
      index += 1;
      continue;
    }

    const calculationLine = parseNotebookCalculationLine(lines[index]);
    if (calculationLine) {
      calculationCount += 1;
      const leftName = resolveNotebookVariableName(calculationLine.left, knownNames);
      const rightName = resolveNotebookVariableName(calculationLine.right, knownNames);
      const leftShape = knownShapes.get(notebookVariableKey(leftName));
      const rightShape = knownShapes.get(notebookVariableKey(rightName));
      const isMatrixProduct = leftShape?.kind === 'matrix' && rightShape?.kind === 'matrix';
      const isVectorProduct =
        (leftShape?.kind === 'matrix' && rightShape?.kind === 'vector') ||
        (leftShape?.kind === 'vector' && rightShape?.kind === 'matrix');
      const isEquationProduct =
        (leftShape?.kind === 'matrix' && rightShape?.kind === 'equation') ||
        (leftShape?.kind === 'equation' && rightShape?.kind === 'matrix');
      const defaultTarget = isMatrixProduct
        ? rightName
        : isVectorProduct
          ? (leftShape?.kind === 'vector' ? leftName : rightName)
          : isEquationProduct
            ? (leftShape?.kind === 'equation' ? leftName : rightName)
            : null;
      const hasCalculationTarget = Boolean(calculationLine.target || defaultTarget);
      const calculationName = hasCalculationTarget
        ? rememberNotebookVariableName(
            knownNames,
            normalizeNotebookVariableName(calculationLine.target ?? defaultTarget, `r${calculationCount}`)
          )
        : null;
      const resultRows = isMatrixProduct ? leftShape.rows : null;
      const resultColumns = isMatrixProduct ? rightShape.columns : null;
      const resultKind = isMatrixProduct ? 'matrix' : isEquationProduct ? 'equation' : 'vector';
      const calculationColor = isMatrixProduct
        ? 0x0e7490
        : isEquationProduct
          ? equationLineColors[(equationCount + calculationCount - 1) % equationLineColors.length]
        : vectorPalette[(vectorCount + calculationCount - 1) % vectorPalette.length];
      marks[index] = hasCalculationTarget
        ? {
            kind: resultKind,
            label: calculationName,
            color: calculationColor,
            hidden: calculationLine.hidden,
          }
        : { kind: 'note', label: '', color: calculationColor, hidden: calculationLine.hidden };
      cells.push({
        id: `script-calc-${index}`,
        type: 'calc',
        resultKind,
        execute: calculationLine.execute,
        name: calculationName,
        left: leftName,
        right: rightName,
        rows: resultRows,
        columns: resultColumns,
        color: calculationColor,
        hidden: calculationLine.hidden,
        durationSec: calculationLine.durationSec,
        lineStart: index,
        lineEnd: index,
      });
      if (hasCalculationTarget) {
        knownShapes.set(notebookVariableKey(calculationName), isMatrixProduct
          ? { kind: 'matrix', rows: resultRows, columns: resultColumns }
          : isEquationProduct
            ? {
                kind: 'equation',
                coeffs: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.coeffs ?? [0, 0, 0],
                value: (leftShape?.kind === 'equation' ? leftShape : rightShape)?.value ?? 0,
                dimension: Math.max(leftShape?.dimension ?? 2, rightShape?.dimension ?? 2),
              }
            : { kind: 'vector', dimension: leftShape?.rows ?? rightShape?.dimension ?? 3 }
        );
      }
      index += 1;
      continue;
    }

    const referenceLine = parseNotebookReferenceLine(lines[index], knownNames, knownShapes);
    if (referenceLine) {
      const refColor = referenceLine.refKind === 'matrix'
        ? 0x0e7490
        : referenceLine.refKind === 'equation'
          ? equationLineColors[equationCount % equationLineColors.length]
          : vectorPalette[vectorCount % vectorPalette.length];
      marks[index] = {
        kind: referenceLine.remove ? 'note' : referenceLine.refKind,
        label: referenceLine.remove ? '' : referenceLine.name,
        color: refColor,
        hidden: referenceLine.hidden,
      };
      cells.push({
        id: `script-ref-${index}`,
        type: 'ref',
        name: referenceLine.name,
        refKind: referenceLine.refKind,
        execute: true,
        remove: referenceLine.remove,
        hidden: referenceLine.hidden,
        durationSec: referenceLine.durationSec,
        lineStart: index,
        lineEnd: index,
      });
      index += 1;
      continue;
    }

    const equationBlock = [];
    while (index < lines.length) {
      const parsed = parsedEquationLine(lines[index]);
      if (!parsed) break;
      const { body, alias, hidden, durationSec, remove } = splitNotebookLineMeta(lines[index]);
      equationBlock.push({ index, line: lines[index], body, alias, hidden, durationSec, remove, parsed });
      index += 1;
    }
    if (equationBlock.length) {
      flushEquationBlock(equationBlock);
      continue;
    }

    const matrixRows = [];
    const startIndex = index;
    while (index < lines.length) {
      const row = parseNotebookNumericRowLine(lines[index]);
      if (!row) break;
      const rowMeta = splitNotebookLineMeta(lines[index]);
      matrixRows.push({
        index,
        row,
        alias: rowMeta.alias,
        hidden: rowMeta.hidden,
        execute: rowMeta.execute,
        remove: rowMeta.remove,
        durationSec: rowMeta.durationSec,
      });
      index += 1;
    }
    if (matrixRows.length) {
      const hasMatrixBlockBreak = index < lines.length && !lines[index].trim();
      const rows = matrixRows.length;
      const columns = matrixRows[0]?.row.length ?? 0;
      if (
        hasMatrixBlockBreak &&
        rows >= 2 &&
        rows <= 3 &&
        columns >= 1 &&
        columns <= 3 &&
        matrixRows.every((item) => item.row.length === columns)
      ) {
        matrixCount += 1;
        const matrixAlias = matrixRows.map((item) => item.alias).find(Boolean);
        const matrixName = rememberNotebookVariableName(
          knownNames,
          normalizeNotebookVariableName(matrixAlias, `M${matrixCount}`)
        );
        const matrixHidden = matrixRows.some((item) => item.hidden);
        const matrixExecute = matrixRows.some((item) => item.execute);
        const matrixRemove = matrixRows.some((item) => item.remove);
        const matrixDurationSec = matrixRows.map((item) => item.durationSec).find(Number.isFinite) ?? null;
        const scriptDimension = dimensionForMode(scriptMode);
        const shouldEmbedSquare = rows === columns && rows < scriptDimension;
        const targetRows = shouldEmbedSquare ? scriptDimension : rows;
        const targetColumns = shouldEmbedSquare ? scriptDimension : columns;
        const mode = operationModeForShape(targetRows, targetColumns);
        const values = shouldEmbedSquare
          ? matrixInputValuesForShape(identity3, targetRows, targetColumns).map(formatPresetInputValue)
          : Array.from({ length: targetRows * targetColumns }, () => '0');
        matrixRows.forEach((item, rowIndex) => {
          item.row.forEach((value, columnIndex) => {
            values[rowIndex * targetColumns + columnIndex] = formatPresetInputValue(parseNumber(value));
          });
        });
        const matrixText = matrixTextFromShapeValues(values, targetRows, targetColumns);
        marks[startIndex] = {
          kind: 'matrix',
          label: matrixName,
          color: 0x0e7490,
          span: matrixRows.length,
          hidden: matrixHidden,
        };
        matrixRows.slice(1).forEach((item) => {
          marks[item.index] = { kind: 'matrix-row', label: '', color: 0x0e7490, hidden: matrixHidden };
        });
        cells.push({
          id: `script-matrix-${startIndex}-${matrixRows[matrixRows.length - 1].index}`,
          type: 'matrix',
          name: matrixName,
          execute: matrixExecute,
          mode,
          rows: targetRows,
          columns: targetColumns,
          values,
          text: matrixText,
          hidden: matrixHidden,
          remove: matrixRemove,
          durationSec: matrixDurationSec,
          lineStart: startIndex,
          lineEnd: matrixRows[matrixRows.length - 1].index,
        });
        knownShapes.set(notebookVariableKey(matrixName), {
          kind: 'matrix',
          rows: targetRows,
          columns: targetColumns,
        });
      }
      continue;
    }

    marks[index] = { kind: 'note', label: '', color: 0x8b5cf6, hidden: lineMeta.hidden };
    index += 1;
  }

  if (!cells.length) {
    cells.push({
      id: 'script-empty',
      type: 'equation',
      text: '',
      lineStart: 0,
      lineEnd: 0,
    });
  }

  return {
    cells,
    lineCount: Math.max(1, lines.length),
    marks,
    mode: scriptMode,
  };
}

function notebookMatrixCellSignature(cell) {
  if (
    !cell ||
    (
      cell.type !== 'matrix' &&
      !(cell.type === 'calc' && cell.resultKind === 'matrix') &&
      !(cell.type === 'ref' && cell.refKind === 'matrix')
    )
  ) return '';
  const values = cell.type === 'calc'
    ? `${cell.left ?? ''}*${cell.right ?? ''}`
    : cell.type === 'ref'
      ? `${cell.name ?? ''}`
      : Array.isArray(cell.values)
      ? cell.values.join(',')
      : String(cell.text ?? '');
  return [
    cell.lineStart ?? 0,
    cell.lineEnd ?? cell.lineStart ?? 0,
    `${cell.rows ?? ''}x${cell.columns ?? ''}`,
    cell.execute === false ? 'declare' : 'execute',
    cell.durationSec ?? '',
    values,
  ].join(':');
}

function notebookMatrixSignatures(cells) {
  return cells
    .filter((cell) =>
      !cell.hidden &&
      (
        cell.type === 'matrix' ||
        (cell.type === 'calc' && cell.resultKind === 'matrix') ||
        (cell.type === 'ref' && cell.refKind === 'matrix')
      )
    )
    .map(notebookMatrixCellSignature);
}

function notebookModeForCells(cells, fallback = '2d') {
  let has2d = false;
  for (const cell of cells ?? []) {
    if (!cell || cell.hidden) continue;
    if (cell.type === 'equation') {
      if (/\bz\b/i.test(cell.text ?? '')) return '3d';
      if (String(cell.text ?? '').trim()) has2d = true;
      continue;
    }
    if (cell.type === 'vector') {
      if ((cell.dimension ?? 0) >= 3) return '3d';
      if ((cell.dimension ?? 0) >= 2) has2d = true;
      continue;
    }
    if (cell.type === 'matrix') {
      const mode = cell.mode ?? operationModeForShape(cell.rows ?? 3, cell.columns ?? 3);
      if (mode === '3d') return '3d';
      if (mode === '2d') has2d = true;
      continue;
    }
    if (cell.type === 'calc' && cell.resultKind === 'matrix') {
      const mode = operationModeForShape(cell.rows ?? 3, cell.columns ?? 3);
      if (mode === '3d') return '3d';
      if (mode === '2d') has2d = true;
    }
  }
  return has2d ? '2d' : fallback;
}

function notebookCellSignature(cell) {
  if (!cell) return '';
  return [
    cell.type,
    cell.lineStart ?? '',
    cell.lineEnd ?? '',
    cell.name ?? '',
    cell.hidden ? 'hidden' : '',
    cell.execute === false ? 'declare' : 'execute',
    cell.remove ? 'remove' : '',
    cell.durationSec ?? '',
    Array.isArray(cell.lineDurations)
      ? cell.lineDurations.map((item) => `${item.line ?? ''}=${item.durationSec ?? ''}`).join(',')
      : '',
    cell.resultKind ?? '',
    cell.refKind ?? '',
    cell.text ?? '',
    Array.isArray(cell.values) ? cell.values.join(',') : '',
    cell.left ?? '',
    cell.right ?? '',
  ].join(':');
}

function solveEquationSystem(equations) {
  const parsedRows = [];
  const errors = [];

  equations.forEach((equation, index) => {
    try {
      const parsed = parseEquation(equation);
      if (parsed) parsedRows.push({ ...parsed, sourceIndex: index });
    } catch {
      errors.push(index + 1);
    }
  });

  if (errors.length) return { status: 'invalid', errors };
  if (!parsedRows.length) return { status: 'empty' };

  const matrix = parsedRows.map((row) => [...row.coeffs, row.value]);
  const pivotColumns = [];
  let pivotRow = 0;

  for (let column = 0; column < equationVariables.length && pivotRow < matrix.length; column += 1) {
    let bestRow = pivotRow;
    for (let row = pivotRow + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[bestRow][column])) {
        bestRow = row;
      }
    }

    if (Math.abs(matrix[bestRow][column]) < EPSILON) continue;

    [matrix[pivotRow], matrix[bestRow]] = [matrix[bestRow], matrix[pivotRow]];
    const pivot = matrix[pivotRow][column];
    for (let col = column; col <= equationVariables.length; col += 1) {
      matrix[pivotRow][col] /= pivot;
    }

    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = matrix[row][column];
      if (Math.abs(factor) < EPSILON) continue;
      for (let col = column; col <= equationVariables.length; col += 1) {
        matrix[row][col] -= factor * matrix[pivotRow][col];
      }
    }

    pivotColumns.push(column);
    pivotRow += 1;
  }

  matrix.forEach((row) => {
    row.forEach((value, index) => {
      if (Math.abs(value) < EPSILON) row[index] = 0;
    });
  });

  const rankA = pivotColumns.length;
  const rankAugmented = matrix.filter((row) => row.some((value) => Math.abs(value) > EPSILON)).length;
  const inconsistent = matrix.some((row) =>
    row.slice(0, equationVariables.length).every((value) => Math.abs(value) < EPSILON) &&
    Math.abs(row[equationVariables.length]) > EPSILON
  );

  if (inconsistent) {
    return { status: 'none', rows: parsedRows, rref: matrix, rankA, rankAugmented };
  }

  const pivotRows = pivotColumns.map((column, row) => ({ column, row }));
  const particular = [0, 0, 0];
  pivotRows.forEach(({ column, row }) => {
    particular[column] = snapValue(matrix[row][equationVariables.length]);
  });

  if (rankA === equationVariables.length) {
    return {
      status: 'unique',
      rows: parsedRows,
      rref: matrix,
      rankA,
      rankAugmented,
      solution: particular,
      particular,
      nullspaceBasis: [],
    };
  }

  const freeColumns = equationVariables
    .map((_, index) => index)
    .filter((column) => !pivotColumns.includes(column));
  const nullspaceBasis = freeColumns.map((freeColumn) => {
    const basis = [0, 0, 0];
    basis[freeColumn] = 1;
    pivotRows.forEach(({ column, row }) => {
      basis[column] = snapValue(-matrix[row][freeColumn]);
    });
    return basis;
  });

  return {
    status: 'infinite',
    rows: parsedRows,
    rref: matrix,
    rankA,
    rankAugmented,
    solution: particular,
    particular,
    nullspaceBasis,
  };
}

function formatSolutionTuple(values) {
  return `(${values.map((value) => formatNumber(value)).join(', ')})`;
}

function formatGeneralSolution(solution) {
  if (!solution || solution.status !== 'infinite') return '';
  const parameters = ['s', 't', 'u'];
  const basisTerms = solution.nullspaceBasis.map(
    (basis, index) => `${parameters[index]}${formatSolutionTuple(basis)}`
  );
  return [formatSolutionTuple(solution.particular), ...basisTerms].join(' + ');
}

function formatLineSolutionEquation(line) {
  if (!line) return '';
  return formatEquationFromCoefficients([line.a, line.b, 0], line.value);
}

function solutionGeometryLabelKey(solution) {
  const degrees = solution?.nullspaceBasis?.length ?? 0;
  if (degrees === 1) return 'solutionKindLine';
  if (degrees >= 2) return 'solutionKindPlane';
  return null;
}

function solutionLabelAnchor(solution) {
  if (!solution || solution.status !== 'infinite' || !solution.nullspaceBasis?.length) return null;
  if (solution.nullspaceBasis.length === 1) {
    return closestSolutionCenter(solution.particular, solution.nullspaceBasis).toArray();
  }
  return [
    Number(solution.particular?.[0]) || 0,
    Number(solution.particular?.[1]) || 0,
    Number(solution.particular?.[2]) || 0,
  ];
}

function parseLineEquation(text, index) {
  const parsed = parseEquation(text);
  if (!parsed) return null;
  const [a, b, z] = parsed.coeffs;
  if (Math.abs(a) < EPSILON && Math.abs(b) < EPSILON) {
    return { error: true, index };
  }
  return {
    a,
    b,
    z,
    value: parsed.value,
    color: equationLineColors[index % equationLineColors.length],
    index,
    text,
  };
}

function relationBetweenLines(lineA, lineB) {
  const det = lineA.a * lineB.b - lineA.b * lineB.a;
  if (Math.abs(det) < EPSILON) {
    const sameA = lineA.a * lineB.value - lineB.a * lineA.value;
    const sameB = lineA.b * lineB.value - lineB.b * lineA.value;
    return {
      type: Math.abs(sameA) < EPSILON && Math.abs(sameB) < EPSILON ? 'same' : 'parallel',
    };
  }

  return {
    type: 'intersect',
    point: [
      (lineA.value * lineB.b - lineA.b * lineB.value) / det,
      (lineA.a * lineB.value - lineA.value * lineB.a) / det,
    ],
  };
}

function satisfiesLine(line, point) {
  return Math.abs(line.a * point[0] + line.b * point[1] - line.value) < 0.015;
}

function lineSegmentForEquation(line, range = 9) {
  const points = [];
  const pushPoint = (x, y) => {
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= -range - EPSILON &&
      x <= range + EPSILON &&
      y >= -range - EPSILON &&
      y <= range + EPSILON &&
      !points.some((point) => Math.abs(point[0] - x) < 0.001 && Math.abs(point[1] - y) < 0.001)
    ) {
      points.push([x, y]);
    }
  };

  if (Math.abs(line.b) > EPSILON) {
    pushPoint(-range, (line.value - line.a * -range) / line.b);
    pushPoint(range, (line.value - line.a * range) / line.b);
  }
  if (Math.abs(line.a) > EPSILON) {
    pushPoint((line.value - line.b * -range) / line.a, -range);
    pushPoint((line.value - line.b * range) / line.a, range);
  }

  return points.slice(0, 2);
}

function scalarLineSegmentForEquation(line, range = SCALAR_CONSTRAINT_LINE_RANGE) {
  const normalLengthSquared = line.a * line.a + line.b * line.b;
  if (normalLengthSquared < EPSILON) return [];
  const anchorX = (line.a * line.value) / normalLengthSquared;
  const anchorY = (line.b * line.value) / normalLengthSquared;
  const tangentLength = Math.hypot(line.a, line.b);
  if (tangentLength < EPSILON) return [];
  const tangentX = -line.b / tangentLength;
  const tangentY = line.a / tangentLength;
  return [
    [anchorX - tangentX * range, anchorY - tangentY * range],
    [anchorX + tangentX * range, anchorY + tangentY * range],
  ];
}

function disposeObject3D(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

function clearEquationGroup(group) {
  if (!group) return;
  [...group.children].forEach((child) => {
    disposeObject3D(child);
    group.remove(child);
  });
}

function createDotMeasurementVisual() {
  const group = new THREE.Group();
  const mainGeometry = new THREE.BufferGeometry();
  const guideGeometry = new THREE.BufferGeometry();
  const mainMaterial = new THREE.LineBasicMaterial({
    color: MEASURE_DOT_HEX,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  });
  const guideMaterial = new THREE.LineDashedMaterial({
    color: MEASURE_DOT_GUIDE_HEX,
    transparent: true,
    opacity: 0.32,
    dashSize: 0.12,
    gapSize: 0.08,
    depthTest: false,
    depthWrite: false,
  });
  const pointGeometry = new THREE.SphereGeometry(0.055, 18, 12);
  const pointMaterial = new THREE.MeshBasicMaterial({
    color: MEASURE_DOT_HEX,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const mainLine = new THREE.LineSegments(mainGeometry, mainMaterial);
  const guideLine = new THREE.LineSegments(guideGeometry, guideMaterial);
  const point = new THREE.Mesh(pointGeometry, pointMaterial);
  group.add(mainLine, guideLine, point);
  return { kind: 'dot', group, mainLine, guideLine, point };
}

function createVolumeMeasurementVisual() {
  const group = new THREE.Group();
  const meshGeometry = new THREE.BufferGeometry();
  const edgeGeometry = new THREE.BufferGeometry();
  const meshMaterial = new THREE.MeshBasicMaterial({
    color: MEASURE_AREA_HEX,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: MEASURE_AREA_EDGE_HEX,
    transparent: true,
    opacity: 0.86,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  group.add(mesh, edges);
  return { kind: 'volume', group, mesh, edges };
}

function disposeMeasurementVisual(visual) {
  if (!visual) return;
  visual.group.parent?.remove(visual.group);
  disposeObject3D(visual.group);
}

function getMeasurementVisual(refs, item, kind) {
  if (!refs.measurementVisuals) refs.measurementVisuals = new Map();
  let visual = refs.measurementVisuals.get(item.id);
  if (!visual || visual.kind !== kind) {
    disposeMeasurementVisual(visual);
    visual = kind === 'dot' ? createDotMeasurementVisual() : createVolumeMeasurementVisual();
    refs.measurementGroup.add(visual.group);
    refs.measurementVisuals.set(item.id, visual);
  }
  visual.group.visible = true;
  return visual;
}

function parseEquationRows(equations) {
  const rows = [];
  const errors = [];

  equations.forEach((equation, index) => {
    try {
      const parsed = parseEquation(equation);
      if (parsed) rows.push({ ...parsed, sourceIndex: index, text: equation });
    } catch {
      errors.push(index + 1);
    }
  });

  return { rows, errors };
}

function analyzeLineSystem(equations) {
  const errors = [];
  const lines = [];

  equations.forEach((equation, index) => {
    try {
      const line = parseLineEquation(equation, index);
      if (!line) return;
      if (line.error) errors.push(index + 1);
      else lines.push(line);
    } catch {
      errors.push(index + 1);
    }
  });

  if (errors.length) return { status: 'invalid', errors, lines, relations: [] };
  if (!lines.length) return { status: 'empty', lines, relations: [] };
  if (lines.length === 1) return { status: 'single', lines, relations: [] };

  const relations = [];
  let candidate = null;
  let hasParallelConflict = false;

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const relation = relationBetweenLines(lines[i], lines[j]);
      relations.push({ ...relation, a: i, b: j });
      if (relation.type === 'intersect' && !candidate) candidate = relation.point;
      if (relation.type === 'parallel') hasParallelConflict = true;
    }
  }

  if (candidate) {
    const isCommonPoint = lines.every((line) => satisfiesLine(line, candidate));
    return {
      status: isCommonPoint ? 'unique' : 'none',
      lines,
      relations,
      point: candidate,
    };
  }

  return {
    status: hasParallelConflict ? 'parallel' : 'same',
    lines,
    relations,
  };
}

function analyzeEquationGeometry(equations) {
  const { rows, errors } = parseEquationRows(equations);
  const base = {
    mode: '2d',
    lines: [],
    planes: [],
    relations: [],
    errors,
  };

  if (errors.length) return { ...base, status: 'invalid' };
  if (!rows.length) return { ...base, status: 'empty' };

  const hasZ = rows.some((row) => Math.abs(row.coeffs[2]) > EPSILON);
  if (!hasZ) {
    return {
      ...analyzeLineSystem(equations),
      mode: '2d',
      planes: [],
      solution: solveEquationSystem(equations),
    };
  }

  const solution = solveEquationSystem(equations);
  const planes = rows
    .filter((row) => row.coeffs.some((value) => Math.abs(value) > EPSILON))
    .map((row) => ({
      a: row.coeffs[0],
      b: row.coeffs[1],
      c: row.coeffs[2],
      value: row.value,
      color: equationLineColors[row.sourceIndex % equationLineColors.length],
      index: row.sourceIndex,
      text: row.text,
    }));

  let status = solution.status;
  if (solution.status === 'unique') status = 'unique3d';
  if (solution.status === 'infinite') status = planes.length === 1 ? 'single3d' : 'infinite3d';
  if (solution.status === 'none') status = 'none3d';

  return {
    ...base,
    mode: '3d',
    status,
    planes,
    point: solution.status === 'unique' ? solution.solution : null,
    solution,
    rankA: solution.rankA,
    rankAugmented: solution.rankAugmented,
  };
}

function statusKeyForLineSystem(status) {
  if (status === 'single') return 'solutionStatusSingle';
  if (status === 'unique') return 'solutionStatusUnique';
  if (status === 'same') return 'solutionStatusSame';
  if (status === 'parallel') return 'solutionStatusParallel';
  if (status === 'none') return 'solutionStatusNone';
  if (status === 'single3d') return 'solutionStatusSingle3d';
  if (status === 'unique3d') return 'solutionStatusUnique';
  if (status === 'infinite3d') return 'solutionStatusInfinite3d';
  if (status === 'none3d') return 'solutionStatusNone';
  if (status === 'invalid') return 'invalidFormat';
  return 'waitingInput';
}

function buildLineSystemInfo(lineSystem) {
  const variableCount = lineSystem.mode === '3d' ? 3 : 2;
  const equationCount = lineSystem.mode === '3d' ? lineSystem.planes.length : lineSystem.lines.length;
  const rankA = lineSystem.solution?.rankA ?? lineSystem.rankA;
  const rankAugmented = lineSystem.solution?.rankAugmented ?? lineSystem.rankAugmented;
  const freeCount = typeof rankA === 'number' ? Math.max(0, variableCount - rankA) : null;

  let solutionDimension = null;
  if (lineSystem.status === 'unique' || lineSystem.status === 'unique3d') solutionDimension = 0;
  if (lineSystem.status === 'single' || lineSystem.status === 'same') solutionDimension = 1;
  if (lineSystem.status === 'single3d') solutionDimension = 2;
  if (lineSystem.status === 'infinite3d') {
    solutionDimension = lineSystem.solution?.nullspaceBasis?.length ?? null;
  }

  let kindKey = null;
  if (solutionDimension === 0) kindKey = 'solutionKindPoint';
  if (solutionDimension === 1) kindKey = 'solutionKindLine';
  if (solutionDimension === 2) kindKey = 'solutionKindPlane';
  if (lineSystem.status === 'none' || lineSystem.status === 'parallel' || lineSystem.status === 'none3d') {
    kindKey = 'solutionKindEmpty';
  }

  let noteKey = 'solutionEducationWaiting';
  if (lineSystem.status === 'invalid') noteKey = 'solutionEducationInvalid';
  else if (lineSystem.status === 'unique' || lineSystem.status === 'unique3d') noteKey = 'solutionEducationPoint';
  else if (lineSystem.status === 'single' || lineSystem.status === 'same') noteKey = 'solutionEducationLine';
  else if (lineSystem.status === 'single3d') noteKey = 'solutionEducationPlane';
  else if (lineSystem.status === 'infinite3d') {
    noteKey = solutionDimension === 1 ? 'solutionEducationLine' : 'solutionEducationPlane';
  } else if (lineSystem.status === 'none' || lineSystem.status === 'parallel' || lineSystem.status === 'none3d') {
    noteKey = 'solutionEducationNone';
  }

  let solutionText = '';
  if (lineSystem.point) {
    solutionText = formatCoord(lineSystem.point, lineSystem.mode);
  } else if (lineSystem.mode === '2d' && (lineSystem.status === 'single' || lineSystem.status === 'same')) {
    solutionText = formatLineSolutionEquation(lineSystem.lines[0]);
  } else if (lineSystem.status === 'infinite3d') {
    solutionText = formatGeneralSolution(lineSystem.solution);
  }

  return {
    equationCount,
    freeCount,
    kindKey,
    noteKey,
    rankA,
    rankAugmented,
    solutionDimension,
    solutionText,
    variableCount,
  };
}

function relationText(relation, lines) {
  const left = `L${lines[relation.a].index + 1}`;
  const right = `L${lines[relation.b].index + 1}`;
  if (relation.type === 'same') return `${left} = ${right}`;
  if (relation.type === 'parallel') return `${left} ∥ ${right}`;
  return `${left} × ${right} ${formatCoord([relation.point[0], relation.point[1]], '2d')}`;
}

function createPlaneObjects(plane, size = 6.5, muted = false) {
  const normal = new THREE.Vector3(plane.a, plane.b, plane.c);
  const normalLengthSquared = normal.lengthSq();
  if (normalLengthSquared < EPSILON) return [];

  const anchor = normal.clone().multiplyScalar(plane.value / normalLengthSquared);
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(normal, helper).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  const corners = [
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, size),
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, size),
  ];
  const positions = corners.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.07 : 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  mesh.renderOrder = 30;

  const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
    corners[0], corners[1],
    corners[1], corners[2],
    corners[2], corners[3],
    corners[3], corners[0],
  ]);
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.42 : 0.88,
      depthTest: false,
      depthWrite: false,
    })
  );
  edges.renderOrder = 31;

  return [mesh, edges];
}

function transformedPointForMatrix(matrix, point) {
  const [x, y, z] = transformVector3(matrix, [point.x, point.y, point.z]);
  return new THREE.Vector3(x, y, z);
}

function createTransformedPlaneObjects(plane, matrix, size = 5.8, muted = false) {
  const normal = new THREE.Vector3(plane.a, plane.b, plane.c);
  const normalLengthSquared = normal.lengthSq();
  if (normalLengthSquared < EPSILON) return [];

  const anchor = normal.clone().multiplyScalar(plane.value / normalLengthSquared);
  const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(normal, helper).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
  const inputCorners = [
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, -size),
    anchor.clone().addScaledVector(tangentA, size).addScaledVector(tangentB, size),
    anchor.clone().addScaledVector(tangentA, -size).addScaledVector(tangentB, size),
  ];
  const corners = inputCorners.map((point) => transformedPointForMatrix(matrix, point));
  const positions = corners.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.07 : 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  mesh.renderOrder = 30;

  const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
    corners[0], corners[1],
    corners[1], corners[2],
    corners[2], corners[3],
    corners[3], corners[0],
  ]);
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: plane.color,
      transparent: true,
      opacity: muted ? 0.42 : 0.88,
      depthTest: false,
      depthWrite: false,
    })
  );
  edges.renderOrder = 31;

  return [mesh, edges];
}

function createLineObjects(line, range = SCALAR_CONSTRAINT_LINE_RANGE) {
  const segment = scalarLineSegmentForEquation(line, range);
  if (segment.length < 2) return [];
  const start = new THREE.Vector3(segment[0][0], segment[0][1], 0.024);
  const end = new THREE.Vector3(segment[1][0], segment[1][1], 0.024);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const lineMesh = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    })
  );
  lineMesh.renderOrder = 34;

  const glowCurve = new THREE.LineCurve3(start, end);
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(glowCurve, 28, 0.045, 10, false),
    new THREE.MeshBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
    })
  );
  glow.renderOrder = 33;
  return [glow, lineMesh];
}

function createTransformedLineObjects(line, matrix, range = SCALAR_CONSTRAINT_LINE_RANGE) {
  const segment = scalarLineSegmentForEquation(line, range);
  if (segment.length < 2) return [];

  const start = transformedPointForMatrix(matrix, new THREE.Vector3(segment[0][0], segment[0][1], 0.024));
  const end = transformedPointForMatrix(matrix, new THREE.Vector3(segment[1][0], segment[1][1], 0.024));

  if (start.distanceToSquared(end) < EPSILON) {
    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 12),
      new THREE.MeshBasicMaterial({
        color: line.color,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false,
      })
    );
    point.position.copy(start);
    point.renderOrder = 35;
    return [point];
  }

  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const lineMesh = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    })
  );
  lineMesh.renderOrder = 34;

  const glowCurve = new THREE.LineCurve3(start, end);
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(glowCurve, 28, 0.045, 10, false),
    new THREE.MeshBasicMaterial({
      color: line.color,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
    })
  );
  glow.renderOrder = 33;
  return [glow, lineMesh];
}

function createScalarPointObjects(point, color) {
  const tickStart = point.clone().add(new THREE.Vector3(0, -0.38, 0.024));
  const tickEnd = point.clone().add(new THREE.Vector3(0, 0.38, 0.024));
  const tickGeometry = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
  const tick = new THREE.Line(
    tickGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
    })
  );
  tick.renderOrder = 34;

  const pointMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
    })
  );
  pointMesh.position.copy(point);
  pointMesh.renderOrder = 35;
  return [tick, pointMesh];
}

function closestSolutionCenter(particular, basisVectors) {
  const anchor = new THREE.Vector3(...particular);
  const basis = basisVectors
    .map((values) => new THREE.Vector3(...values))
    .filter((vector) => vector.lengthSq() > EPSILON);

  if (basis.length === 1) {
    const direction = basis[0].clone().normalize();
    return anchor.addScaledVector(direction, -anchor.dot(direction));
  }

  if (basis.length >= 2) {
    const u = basis[0];
    const v = basis[1];
    const uu = u.dot(u);
    const uv = u.dot(v);
    const vv = v.dot(v);
    const det = uu * vv - uv * uv;

    if (Math.abs(det) > EPSILON) {
      const bp = -u.dot(anchor);
      const cp = -v.dot(anchor);
      const s = (bp * vv - cp * uv) / det;
      const t = (uu * cp - uv * bp) / det;
      return anchor.addScaledVector(u, s).addScaledVector(v, t);
    }
  }

  return anchor;
}

function createSolutionHighlightObjects(solution, color = 0xf1b434, size = 5.8) {
  if (!solution || solution.status !== 'infinite' || !solution.nullspaceBasis?.length) return [];
  if (solution.nullspaceBasis.length !== 1) return [];

  const center = closestSolutionCenter(solution.particular, solution.nullspaceBasis);
  const objects = [];

  solution.nullspaceBasis.slice(0, 2).forEach((basis, index) => {
    const direction = new THREE.Vector3(...basis);
    if (direction.lengthSq() < EPSILON) return;
    direction.normalize();
    const start = center.clone().addScaledVector(direction, -size);
    const end = center.clone().addScaledVector(direction, size);
    const curve = new THREE.LineCurve3(start, end);

    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, index === 0 ? 0.095 : 0.07, 12, false),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: index === 0 ? 0.22 : 0.13,
        depthTest: false,
        depthWrite: false,
      })
    );
    glow.renderOrder = 36;

    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, index === 0 ? 0.034 : 0.026, 10, false),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? color : 0xffffff,
        transparent: true,
        opacity: index === 0 ? 0.92 : 0.62,
        depthTest: false,
        depthWrite: false,
      })
    );
    core.renderOrder = 37;

    objects.push(glow, core);
  });

  const centerDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
    })
  );
  centerDot.position.copy(center);
  centerDot.renderOrder = 38;
  objects.push(centerDot);

  return objects;
}

function MatrixMini({ matrix, mode = '3d', className = '' }) {
  const values = matrixValuesForMode(matrix, mode);
  const columns = mode === '3d' ? 3 : mode === '2d' ? 2 : 1;

  return (
    <span className={`matrix-mini ${className}`} style={{ '--mini-columns': columns }}>
      {values.map((value, index) => (
        <span key={index}>{formatMatrixNumber(value)}</span>
      ))}
    </span>
  );
}

function matrixToClipboardText(matrix, mode = '3d') {
  const values = matrixValuesForMode(matrix, mode);
  const columns = mode === '3d' ? 3 : mode === '2d' ? 2 : 1;
  const rows = [];
  for (let i = 0; i < values.length; i += columns) {
    rows.push(values.slice(i, i + columns).map((value) => formatMatrixNumber(value)).join(' '));
  }
  return rows.join('\n');
}

async function copyMatrixToClipboard(matrix, mode = '3d', label = t('ko', 'matrix'), locale = 'ko') {
  const text = matrixToClipboardText(matrix, mode);
  if (typeof window !== 'undefined') {
    window.__linearAlgebraMatrixClipboard = text;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast.success(t(locale, 'copied'));
    return;
  } catch {
    // Fall through to the legacy copy path for restricted browser contexts.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
    textarea.select();
  try {
    const copied = document.execCommand('copy');
    if (!copied) throw new Error('copy failed');
    toast.success(t(locale, 'copied'));
  } finally {
    textarea.remove();
  }
}

function CopyableMatrix({ matrix, mode = '3d', className = '', label = t('ko', 'matrix'), locale = 'ko' }) {
  return (
    <span className="copyable-matrix">
      <MatrixMini matrix={matrix} mode={mode} className={className} />
      <button
        aria-label={t(locale, 'copyMatrix', { label })}
        className="detail-copy-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          copyMatrixToClipboard(matrix, mode, label, locale).catch(() => {
            toast.error(t(locale, 'copyFailed'));
          });
        }}
        title={t(locale, 'copyMatrix', { label })}
        type="button"
      >
        <Copy size={11} />
      </button>
    </span>
  );
}

function MatrixInput({ values, columns, accent, locale = 'ko', onChange, onEnter }) {
  return (
    <div className="matrix-wrap" style={{ '--matrix-columns': columns }}>
      <div className="matrix-bracket left" />
      <div className="matrix-grid">
        {values.map((value, index) => (
          <input
            aria-label={t(locale, 'matrixValueLabel', { index: index + 1 })}
            className={`matrix-cell ${accent}`}
            key={index}
            inputMode="text"
            value={value}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value.replace(/^0+(?=\d)/, '');
              onChange(next);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onEnter?.();
            }}
          />
        ))}
      </div>
      <div className="matrix-bracket right" />
    </div>
  );
}

function HistoryDetail({ entry, index, isActive, locale = 'ko' }) {
  const previousMatrix = entry.previousMatrix ?? entry.matrix;
  const stateMode = entry.stateMode ?? modeForMatrix(entry.matrix);
  const previousStateMode = entry.previousStateMode ?? modeForMatrix(previousMatrix);
  const det = determinantForStep(entry.matrix, stateMode);
  const rank = rankForStep(entry.matrix, stateMode);
  const previousDet = determinantForStep(previousMatrix, previousStateMode);
  const previousRank = rankForStep(previousMatrix, previousStateMode);
  const operationMode = entry.operationMode ?? '3d';
  const operationMatrix = entry.operationMatrix ?? entry.matrix;
  const isDimensionDrop = entry.isDimensionDrop ?? false;
  const stepInverse = isDimensionDrop ? null : inverseForStep(operationMatrix, operationMode);

  return (
    <div className={`history-detail ${isActive ? 'current' : 'preview'}`}>
      <div className="history-detail-head">
        <span className="history-detail-title">
          <strong>{entry.name}</strong>
          <small>{t(locale, 'stepLabel', { index })}</small>
        </span>
        <em>{isActive ? t(locale, 'current') : t(locale, 'preview')}</em>
      </div>
      <div className="history-metrics-row">
        <div className="history-detail-grid">
          <span>
            {t(locale, 'detLabel')}
            <strong>{formatNumber(previousDet)} → {formatNumber(det)}</strong>
          </span>
          <span>
            {t(locale, 'rankLabel')}
            <strong>{previousRank} → {rank}</strong>
          </span>
        </div>
        <div className={`inverse-panel mode-${operationMode} ${stepInverse ? '' : 'singular'}`}>
          <span>{t(locale, 'inverse')}</span>
          {stepInverse ? (
            <CopyableMatrix matrix={stepInverse} mode={operationMode} className="large inverse" label={t(locale, 'inverse')} locale={locale} />
          ) : (
            <strong>{t(locale, 'none')}</strong>
          )}
        </div>
      </div>
      <div className="history-step-flow">
        <div className="history-step-title">
          <span>{t(locale, 'matrix')}</span>
        </div>
        <CopyableMatrix matrix={previousMatrix} mode={previousStateMode} className="large" label={t(locale, 'previousMatrix')} locale={locale} />
        <span className="matrix-arrow">→</span>
        <CopyableMatrix matrix={entry.matrix} mode={stateMode} className="large" label={t(locale, 'resultMatrix')} locale={locale} />
      </div>
    </div>
  );
}

function AdSlot({ placement, locale }) {
  const slotId = placement === 'top' ? monetizationConfig.topAdSlot : monetizationConfig.bottomAdSlot;
  const hasAdClient = !!monetizationConfig.adClient;
  const hasWebAd = hasAdClient && !!slotId;
  const label = placement === 'top' ? t(locale, 'adTop') : t(locale, 'adBottom');

  useEffect(() => {
    if (!hasAdClient || typeof document === 'undefined') return;
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(monetizationConfig.adClient)}`;
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = src;
      document.head.appendChild(script);
    }
  }, [hasAdClient]);

  useEffect(() => {
    if (!hasWebAd || typeof window === 'undefined') return;
    window.setTimeout(() => {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch {
        // Ad blockers or local previews can block the ad script.
      }
    }, 120);
  }, [hasWebAd, slotId]);

  return (
    <aside
      className={`ad-slot ad-${placement} ${hasWebAd ? 'configured' : 'placeholder'}`}
      data-admob-app-id={monetizationConfig.admobAppId}
      data-ad-provider={monetizationConfig.adProvider}
    >
      {hasWebAd ? (
        <ins
          className="adsbygoogle"
          data-ad-client={monetizationConfig.adClient}
          data-ad-format="auto"
          data-ad-slot={slotId}
          data-full-width-responsive="true"
          style={{ display: 'block' }}
        />
      ) : (
        <>
          <span>{label}</span>
          <strong>{t(locale, 'adPlaceholder')}</strong>
        </>
      )}
    </aside>
  );
}

function AdBlockGate({ locale }) {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const bait = document.createElement('div');
    bait.className = 'pub_300x250 pub_300x250m ad ads ad-banner ad-container ad-wrapper ad-unit adsbox adsbygoogle banner-ads text-ad textads';
    bait.setAttribute('aria-hidden', 'true');
    bait.style.cssText = [
      'position:absolute !important',
      'left:-10000px !important',
      'top:-10000px !important',
      'width:1px !important',
      'height:1px !important',
      'min-width:1px !important',
      'min-height:1px !important',
      'pointer-events:none !important',
    ].join(';');
    document.body.appendChild(bait);

    const check = () => {
      const style = window.getComputedStyle(bait);
      const rect = bait.getBoundingClientRect();
      const blocked =
        !document.body.contains(bait) ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        rect.width === 0 ||
        rect.height === 0 ||
        bait.offsetHeight === 0 ||
        bait.clientHeight === 0;
      if (blocked) setIsBlocked(true);
    };

    const timers = [120, 650, 1400].map((delay) => window.setTimeout(check, delay));
    check();

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      bait.remove();
    };
  }, []);

  if (!isBlocked) return null;

  return (
    <div className="access-wall" role="dialog" aria-modal="true" aria-labelledby="access-wall-title">
      <div className="access-wall-panel">
        <span className="access-wall-icon">
          <Lock size={24} />
        </span>
        <h2 id="access-wall-title">{t(locale, 'adBlockTitle')}</h2>
        <p>{t(locale, 'adBlockMessage')}</p>
        <button type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={16} />
          <span>{t(locale, 'adBlockReload')}</span>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const initialShareRef = useRef(null);
  if (initialShareRef.current === null) {
    initialShareRef.current = readSharedStateFromUrl() ?? false;
  }
  const initialShare = initialShareRef.current || {};
  const urlLocale =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('lang');
  const initialLocale = urlLocale ? normalizeLocale(urlLocale) : initialShare.locale ?? detectLocale();

  const containerRef = useRef(null);
  const matrixPresetRefs = useRef({});
  const iLabelRef = useRef(null);
  const jLabelRef = useRef(null);
  const kLabelRef = useRef(null);
  const equationSolutionLabelRef = useRef(null);
  const scalarSolutionLabelRef = useRef(null);
  const equationLabelRefs = useRef(new Map());
  const vectorLabelRefs = useRef(new Map());
  const vectorDotLabelRefs = useRef(new Map());
  const measurementLabelRefs = useRef(new Map());
  const vectorVolumeLabelRef = useRef(null);
  const scrubTrackRef = useRef(null);
  const notebookProgressRef = useRef(null);
  const notebookSceneProgressRef = useRef(null);
  const notebookPlaybackFrameRef = useRef(null);
  const notebookMatrixSignatureRef = useRef(null);
  const notebookVisualSignatureRef = useRef(null);
  const notebookReplayFromStartRef = useRef(false);
  const historyStripRef = useRef(null);
  const panelScrollRef = useRef(null);
  const arrowDragRef = useRef({
    active: false,
    hovered: null,
    key: null,
    snapped: false,
    startMatrix: [...identity3],
    startClientX: 0,
    startClientY: 0,
    startIntersection: new THREE.Vector3(),
    startInputVector: [0, 0, 0],
    startVector: new THREE.Vector3(),
    screenDown: new THREE.Vector3(),
    screenRight: new THREE.Vector3(),
    plane: new THREE.Plane(),
  });
  const dragActionsRef = useRef({
    commitBasisDrag: null,
    updateBasisVectorFromDrag: null,
    updateScalarConstraintFromDrag: null,
    updateUserVectorFromDrag: null,
  });
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const threeRef = useRef(null);
  const frameIdRef = useRef(null);
  const initialCameraPositionRef = useRef(
    initialShare.camera?.position ? new THREE.Vector3(...initialShare.camera.position) : CAMERA_HOME_POSITION.clone()
  );
  const initialCameraTargetRef = useRef(
    initialShare.camera?.target ? new THREE.Vector3(...initialShare.camera.target) : CAMERA_HOME_TARGET.clone()
  );
  const cameraShareTimerRef = useRef(null);

  const currentMatrixRef = useRef([...(initialShare.displayMatrix ?? identity3)]);
  const startMatrixRef = useRef([...(initialShare.displayMatrix ?? identity3)]);
  const targetMatrixRef = useRef([...(initialShare.displayMatrix ?? identity3)]);
  const vectorRenderValuesRef = useRef(new Map());
  const dragSnapEnabledRef = useRef(initialShare.snapToInteger !== false);
  const animationViewFromRef = useRef('3d');
  const animationViewToRef = useRef('3d');
  const animationStartRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const lastUiSyncRef = useRef(0);
  const cameraMoveRef = useRef({
    active: false,
    startTime: null,
    positionFrom: initialCameraPositionRef.current.clone(),
    targetFrom: initialCameraTargetRef.current.clone(),
    positionTo: initialCameraPositionRef.current.clone(),
    targetTo: initialCameraTargetRef.current.clone(),
  });
  const cameraLockedRef = useRef(false);
  const zoomLockedRef = useRef(false);
  const cameraAutoRef = useRef(initialShare.workspaceMode === 'system');
  const autoCameraTargetViewRef = useRef(initialShare.workspaceMode === 'system' ? '2d' : '3d');
  const userVectorRef = useRef(
    initialShare.vectors?.[0]
      ? [parseNumber(initialShare.vectors[0].x), parseNumber(initialShare.vectors[0].y), parseNumber(initialShare.vectors[0].z)]
      : [2, 2, 2]
  );
  const vectorsRef = useRef([]);
  const measurementsRef = useRef([]);
  const scalarSolutionRef = useRef(null);
  const notebookHasVisualVectorsRef = useRef(false);
  const notebookHasMatrixCellsRef = useRef(false);
  const notebookVectorTransformRef = useRef([...identity3]);
  const activeVectorIdRef = useRef(initialShare.vectors?.[0]?.id ?? 'v1');
  const nextVectorIndexRef = useRef(2);
  const nextMeasurementIndexRef = useRef(1);
  const measureModeRef = useRef(null);
  const measureDraftRef = useRef([]);
  const vectorToolModeRef = useRef('vector');
  const uiStateRef = useRef({
    showVolume: false,
    showVector: true,
    showBasis: true,
    basisVisibility: { i: true, j: true, k: true },
    showGrid: true,
    showRelativeGrid: true,
    relativeGridStrength: DEFAULT_RELATIVE_GRID_STRENGTH,
    showCoordinates: true,
    showCoordinateNumbers: true,
    showDot: false,
    showAxes: true,
    showRelativeAxes: true,
  });
  const workspaceModeRef = useRef('transform');
  const systemDimensionRef = useRef('2d');
  const lineSystemRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 760px)').matches;
  });
  const [isAnimationFocus, setIsAnimationFocus] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState(initialShare.workspaceMode ?? 'transform');
  const [inputMode, setInputMode] = useState(initialShare.inputMode ?? '3d');
  const [displayMatrix, setDisplayMatrix] = useState([...(initialShare.displayMatrix ?? identity3)]);
  const [basisControlMatrix, setBasisControlMatrix] = useState([...(initialShare.displayMatrix ?? identity3)]);
  const [matrix3, setMatrix3] = useState(initialShare.matrix3 ?? ['1', '0', '0', '0', '1', '0', '0', '0', '1']);
  const [matrix2, setMatrix2] = useState(initialShare.matrix2 ?? ['1', '0', '0', '1']);
  const [matrix1, setMatrix1] = useState(initialShare.matrix1 ?? ['1']);
  const [vectors, setVectors] = useState(initialShare.vectors ?? [createVectorState(0, { id: 'v1', name: 'v1' })]);
  const [activeVectorId, setActiveVectorId] = useState(initialShare.vectors?.[0]?.id ?? 'v1');
  const [vectorToolMode, setVectorToolMode] = useState('vector');
  const [equations, setEquations] = useState(['']);
  const [notebookText, setNotebookText] = useState('');
  const [notebookCells, setNotebookCells] = useState(() => [
    createNotebookEquationCell(''),
  ]);
  const [activeNotebookCellId, setActiveNotebookCellId] = useState(null);
  const [notebookCursor, setNotebookCursor] = useState(0);
  const [activeNotebookCaption, setActiveNotebookCaption] = useState('');
  const [history, setHistory] = useState([
    {
      name: t(initialLocale, 'initialSpace'),
      matrix: [...(initialShare.displayMatrix ?? identity3)],
      previousMatrix: [...(initialShare.displayMatrix ?? identity3)],
      previousStateMode: '3d',
      operationMatrix: [...identity3],
      operationMode: '3d',
      stateMode: '3d',
    },
  ]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(0);
  const [hoveredHistoryIndex, setHoveredHistoryIndex] = useState(null);
  const [, setClipboardStatus] = useState('');
  const [progress, setProgress] = useState(1);
  const [activeView, setActiveView] = useState(initialShare.camera ? null : '3d');
  const [cameraLocked, setCameraLocked] = useState(false);
  const [zoomLocked, setZoomLocked] = useState(false);
  const [cameraAuto, setCameraAuto] = useState(initialShare.workspaceMode === 'system');
  const [cameraState, setCameraState] = useState(initialShare.camera ?? null);
  const [locale, setLocale] = useState(initialLocale);
  const [showVolume, setShowVolume] = useState(initialShare.showVolume ?? false);
  const [showVector, setShowVector] = useState(initialShare.showVector ?? true);
  const [showBasis, setShowBasis] = useState(initialShare.showBasis ?? true);
  const [basisVisibility, setBasisVisibility] = useState({ i: true, j: true, k: true });
  const [showGrid, setShowGrid] = useState(initialShare.showGrid ?? true);
  const [showRelativeGrid, setShowRelativeGrid] = useState(initialShare.showRelativeGrid ?? true);
  const [relativeGridStrength, setRelativeGridStrength] = useState(
    normalizeRelativeGridStrength(initialShare.relativeGridStrength)
  );
  const [showCoordinates, setShowCoordinates] = useState(initialShare.showCoordinates ?? true);
  const [showDot, setShowDot] = useState(initialShare.showDot ?? false);
  const [showAxes, setShowAxes] = useState(initialShare.showAxes ?? true);
  const [showRelativeAxes, setShowRelativeAxes] = useState(initialShare.showRelativeAxes ?? true);
  const [snapToInteger, setSnapToInteger] = useState(initialShare.snapToInteger ?? true);
  const [notebookSpeed, setNotebookSpeed] = useState(normalizeNotebookSpeed(initialShare.notebookSpeed));
  const [notebookPlaying, setNotebookPlaying] = useState(false);
  const [measureMode, setMeasureMode] = useState(null);
  const [measureDraft, setMeasureDraft] = useState([]);
  const [measureAnchorId, setMeasureAnchorId] = useState(null);
  const [measurePointer, setMeasurePointer] = useState(null);
  const [dragSnapGuide, setDragSnapGuide] = useState(null);
  const [hoveredMeasureTargetId, setHoveredMeasureTargetId] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [hoveredMatrixPresetId, setHoveredMatrixPresetId] = useState(null);

  const stopPanelPointerPropagation = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const handlePanelPointerDown = useCallback((event) => {
    event.stopPropagation();
    arrowDragRef.current.active = false;
    arrowDragRef.current.key = null;
    arrowDragRef.current.snapped = false;
    setDragSnapGuide(null);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
  }, []);

  const preventPanelNativeDrag = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const allLocked = cameraLocked && zoomLocked;
  const displayMode = viewKeyForMatrix(displayMatrix);
  const inputColumns = dimensionForMode(displayMode);
  const outputRows = dimensionForMode(inputMode);
  const matrixInputValues = useMemo(
    () => matrixInputValuesForShape(matrix3, outputRows, inputColumns),
    [inputColumns, matrix3, outputRows]
  );
  const visibleMatrixPresets = useMemo(
    () =>
      inputMode === displayMode
        ? (matrixPresetGroups[inputMode] ?? matrixPresetGroups['3d']).map((preset) => ({
            ...preset,
            name: presetLocaleNames[locale]?.[preset.id] ?? presetLocaleNames.ko?.[preset.id] ?? preset.name,
          }))
        : [],
    [displayMode, inputMode, locale]
  );
  const activeMatrixPresetId = useMemo(() => {
    const parsed = matrixInputValues.map(parseNumber);
    return visibleMatrixPresets.find((preset) =>
      matricesAlmostEqual(
        matrixInputValuesForShape(operationMatrixFromPreset(preset), outputRows, inputColumns),
        parsed
      )
    )?.id ?? null;
  }, [inputColumns, matrixInputValues, outputRows, visibleMatrixPresets]);
  const activeMatrixPresetName = useMemo(() => (
    visibleMatrixPresets.find((preset) => preset.id === activeMatrixPresetId)?.name ?? null
  ), [activeMatrixPresetId, visibleMatrixPresets]);
  const hoveredMatrixPreset = useMemo(
    () => visibleMatrixPresets.find((preset) => preset.id === hoveredMatrixPresetId) ?? null,
    [hoveredMatrixPresetId, visibleMatrixPresets]
  );
  const previewMatrixInputValues = useMemo(
    () =>
      hoveredMatrixPreset
        ? matrixInputValuesForShape(operationMatrixFromPreset(hoveredMatrixPreset), outputRows, inputColumns).map(formatPresetInputValue)
        : matrixInputValues,
    [hoveredMatrixPreset, inputColumns, matrixInputValues, outputRows]
  );

  const previewIndex = hoveredHistoryIndex ?? activeHistoryIndex;
  const previewHistory = history[previewIndex] ?? history[activeHistoryIndex] ?? history.at(-1);
  const currentHistory = history[activeHistoryIndex] ?? history.at(-1);
  const displayedHistoryEntries = useMemo(
    () => history.map((step, index) => ({ step, index })).reverse(),
    [history]
  );
  const activeVector = useMemo(
    () => vectors.find((item) => item.id === activeVectorId) ?? vectors[0] ?? createVectorState(0, { id: 'v1', name: 'v1' }),
    [activeVectorId, vectors]
  );
  const vectorItems = useMemo(
    () =>
      vectors.map((item) => ({
        ...item,
        visible: item.visible !== false,
        colorHex: colorToHex(item.color),
        values: [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)],
        scalarValue: parseNumber(item.scalar),
      })),
    [vectors]
  );
  const transformedVectorItems = useMemo(
    () =>
      vectorItems.map((item) => {
        const transformed = transformVector3(displayMatrix, item.values);
        const length = vectorLength(transformed);
        const lengthSquared = dotValues(transformed, transformed);
        const scalarSpace = item.scalarSpace === 'input' ? 'input' : 'output';
        const scalarNormal = scalarSpace === 'input' ? item.values : transformed;
        const scalarLength = vectorLength(scalarNormal);
        const scalarLengthSquared = dotValues(scalarNormal, scalarNormal);
        const scalarAuto = !hasScalarText(item.scalar);
        return {
          ...item,
          scalarSpace,
          scalarNormal,
          scalarLength,
          scalarLengthSquared,
          transformed,
          length,
          lengthSquared,
          scalarAuto,
          scalarResolved: scalarAuto ? scalarLengthSquared : item.scalarValue,
        };
      }),
    [displayMatrix, vectorItems]
  );
  const dotVectorItems = useMemo(
    () => transformedVectorItems.filter((item) => item.visible && !item.scalarEnabled),
    [transformedVectorItems]
  );
  const basisItems = useMemo(() => {
    const basis = [
      { id: 'i', name: 'i′', color: 0xe05263, values: [basisControlMatrix[0], basisControlMatrix[3], basisControlMatrix[6]] },
      { id: 'j', name: 'j′', color: 0x1f9d55, values: [basisControlMatrix[1], basisControlMatrix[4], basisControlMatrix[7]] },
      { id: 'k', name: 'k′', color: 0x3f7ee8, values: [basisControlMatrix[2], basisControlMatrix[5], basisControlMatrix[8]] },
    ];
    return basis.map((item) => ({
      ...item,
      colorHex: colorToHex(item.color),
      length: vectorLength(item.values),
      lengthSquared: dotValues(item.values, item.values),
      enabled: vectorLength(item.values) > EPSILON,
    }));
  }, [basisControlMatrix]);
  const visibleBasisItems = useMemo(
    () => basisItems.filter((item) => item.enabled),
    [basisItems]
  );
  const currentRank = useMemo(() => rank3(displayMatrix), [displayMatrix]);
  const vectorDotPairs = useMemo(() => {
    const pairs = [];
    for (let rowIndex = 0; rowIndex < dotVectorItems.length; rowIndex += 1) {
      for (let colIndex = rowIndex + 1; colIndex < dotVectorItems.length; colIndex += 1) {
        const left = dotVectorItems[rowIndex];
        const right = dotVectorItems[colIndex];
        const value = dotValues(left.transformed, right.transformed);
        const denominator = left.length * right.length;
        pairs.push({
          id: `${left.id}-${right.id}`,
          left,
          right,
          value,
          cosine: denominator > EPSILON ? value / denominator : null,
          relation: dotRelationText(value, left.length, right.length),
        });
      }
    }
    return pairs;
  }, [dotVectorItems]);
  const vectorVolumeMeasure = useMemo(() => {
    if (dotVectorItems.length < 2) return null;
    const [first, second, third] = dotVectorItems;
    const a = new THREE.Vector3(...first.transformed);
    const b = new THREE.Vector3(...second.transformed);
    const area = a.clone().cross(b).length();
    if (!third) {
      return {
        type: 'area',
        names: [first.name, second.name],
        value: area,
      };
    }
    const c = new THREE.Vector3(...third.transformed);
    return {
      type: 'volume',
      names: [first.name, second.name, third.name],
      value: Math.abs(a.clone().cross(b).dot(c)),
    };
  }, [dotVectorItems]);
  const measureTargetMap = useMemo(() => {
    const entries = new Map();
    basisItems.forEach((item) => {
      entries.set(`b:${item.id}`, {
        id: `b:${item.id}`,
        name: item.name,
        color: item.color,
        colorHex: item.colorHex,
        visible: item.enabled && basisVisibility[item.id] !== false,
        values: item.values,
      });
    });
    transformedVectorItems.forEach((item) => {
      entries.set(`v:${item.id}`, {
        id: `v:${item.id}`,
        name: item.name,
        color: item.color,
        colorHex: item.colorHex,
        visible: item.visible,
        values: item.transformed,
      });
    });
    return entries;
  }, [basisItems, basisVisibility, transformedVectorItems]);
  const measurementSummaries = useMemo(
    () =>
      measurements.map((item) => {
        const targets = item.targets.map((id) => measureTargetMap.get(id)).filter(Boolean);
        let value = null;
        if (item.type === 'dot' && targets.length >= 2) {
          value = dotValues(targets[0].values, targets[1].values);
        } else if (item.type === 'volume' && targets.length >= 1) {
          value = volumeMeasureValue(targets, displayMode);
        }
        const measureKind = item.type === 'volume'
          ? volumeMeasureKind(targets.length, displayMode)
          : item.type;
        const labelTargets = item.type === 'volume'
          ? targets.slice(0, effectiveVolumeTargetCount(targets.length, displayMode))
          : targets;
        return {
          ...item,
          targetIds: item.targets,
          targets,
          measureKind,
          label: labelTargets.map((target) => `A${target.name}`).join(' · '),
          value,
        };
      }),
    [displayMode, measureTargetMap, measurements]
  );
  const dotMeasurementSummaries = useMemo(
    () => measurementSummaries.filter((item) => item.type === 'dot'),
    [measurementSummaries]
  );
  const volumeMeasurementSummaries = useMemo(
    () => measurementSummaries.filter((item) => item.type === 'volume'),
    [measurementSummaries]
  );
  const vectorScalarConstraints = useMemo(
    () =>
      transformedVectorItems
        .filter((item) => item.visible && item.scalarEnabled && item.scalarLength > EPSILON)
        .map((item, index) => ({
          id: item.id,
          name: item.name,
          scalarSpace: item.scalarSpace,
          color: item.color,
          colorHex: item.colorHex,
          normal: item.scalarNormal,
          scalar: item.scalarResolved,
          scalarAuto: item.scalarAuto,
          index,
        })),
    [transformedVectorItems]
  );
  const scalarConstraintSolution = useMemo(
    () => solveScalarConstraintPoint(vectorScalarConstraints, viewKeyForMatrix(displayMatrix)),
    [displayMatrix, vectorScalarConstraints]
  );
  const parsedVector = useMemo(
    () => [parseNumber(activeVector.x), parseNumber(activeVector.y), parseNumber(activeVector.z)],
    [activeVector]
  );
  const transformedVector = useMemo(
    () => transformVector3(displayMatrix, parsedVector),
    [displayMatrix, parsedVector]
  );
  const currentModeLabel = displayMode.toUpperCase();
  const equationSolution = useMemo(() => solveEquationSystem(equations), [equations]);
  const lineSystem = useMemo(() => analyzeEquationGeometry(equations), [equations]);
  lineSystemRef.current = lineSystem;
  const notebookScript = useMemo(() => parseNotebookScript(notebookText), [notebookText]);
  const effectiveSystemMode = lineSystem.mode === '3d' || notebookScript.mode === '3d' ? '3d' : '2d';
  const equationLabelItems = useMemo(() => {
    const mode = lineSystem.mode === '3d' ? '3d' : '2d';
    const items = mode === '3d' ? lineSystem.planes : lineSystem.lines;
    return items.map((item, index) => ({
      key: equationSceneLabelKey(item, mode, index),
      name: equationSceneLabelName(item, mode, index),
      color: item.color ?? equationLineColors[index % equationLineColors.length],
    }));
  }, [lineSystem]);
  const systemMatrixMode = effectiveSystemMode;
  const systemMatrixDimension = dimensionForMode(systemMatrixMode);
  const notebookMatrixSignatureList = useMemo(() => notebookMatrixSignatures(notebookScript.cells), [notebookScript.cells]);
  const notebookMatrixSignatureKey = notebookMatrixSignatureList.join('\n');
  const notebookVisualSignatureKey = useMemo(
    () => notebookScript.cells.map(notebookCellSignature).join('\n'),
    [notebookScript.cells]
  );
  const notebookTokenStyles = useMemo(() => {
    const styles = new Map();
    notebookScript.marks.forEach((mark) => {
      if (!mark?.label) return;
      styles.set(notebookVariableKey(mark.label), {
        label: mark.label,
        kind: mark.kind,
        color: mark.color ?? 0x8b5cf6,
        hidden: Boolean(mark.hidden),
      });
    });
    notebookScript.cells.forEach((cell) => {
      if (!cell?.name) return;
      styles.set(notebookVariableKey(cell.name), {
        label: cell.name,
        kind: cell.type,
        color: cell.color ?? (cell.type === 'matrix' ? 0x0e7490 : 0x8b5cf6),
        hidden: Boolean(cell.hidden),
      });
    });
    return styles;
  }, [notebookScript.cells, notebookScript.marks]);

  const notebookMeasurementItems = useMemo(() => {
    const clampedCursor = Math.max(0, Math.min(100, Number(notebookCursor) || 0));
    const lastLineFromCells = Math.max(
      0,
      ...notebookScript.cells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
    );
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, lastLineFromCells + 1);
    const linePosition = (clampedCursor / 100) * lineCount;
    const hasReachedLine = (lineStart) => {
      const start = Number.isFinite(lineStart) ? lineStart : 0;
      return clampedCursor >= 100 || linePosition > start;
    };
    const targetByName = new Map([
      ['i', 'b:i'],
      ['j', 'b:j'],
      ['k', 'b:k'],
    ]);
    measureTargetMap.forEach((target) => {
      if (target?.name) targetByName.set(notebookVariableKey(target.name), target.id);
    });
    notebookScript.cells.forEach((cell) => {
      if (
        (
          cell.type === 'vector' ||
          (cell.type === 'calc' && cell.resultKind === 'vector') ||
          (cell.type === 'ref' && cell.refKind === 'vector' && !cell.remove)
        ) &&
        !cell.remove &&
        cell.name
      ) {
        const targetId = `v:${notebookVectorIdForName(cell.name, 0)}`;
        targetByName.set(notebookVariableKey(cell.name), targetId);
      }
    });

    return notebookScript.cells
      .filter((cell) => cell.type === 'measurement' && !cell.hidden && hasReachedLine(cell.lineStart))
      .map((cell) => {
        const targets = cell.names
          .map((name) => targetByName.get(notebookVariableKey(name)))
          .filter((targetId) => targetId && measureTargetMap.has(targetId));
        if (cell.measureType === 'dot' && targets.length < 2) return null;
        if (cell.measureType === 'volume' && targets.length < 2) return null;
        const pickedTargets = cell.measureType === 'dot' ? targets.slice(0, 2) : targets.slice(0, 3);
        return {
          id: `notebook-measure-${cell.lineStart}-${cell.measureType}`,
          type: cell.measureType,
          targets: pickedTargets,
          visible: true,
          source: 'notebook',
          lineStart: cell.lineStart,
        };
      })
      .filter(Boolean);
  }, [measureTargetMap, notebookCursor, notebookScript.cells, notebookScript.lineCount]);

  useEffect(() => {
    if (workspaceMode !== 'system') {
      setMeasurements((previous) => {
        const next = previous.filter((item) => item.source !== 'notebook');
        return next.length === previous.length ? previous : next;
      });
      return;
    }

    setMeasurements((previous) => {
      const notebookKeys = new Set(notebookMeasurementItems.map((item) => measurementStateKey(item.type, item.targets)));
      const previousVisibility = new Map(
        previous.map((item) => [measurementStateKey(item.type, item.targets), item.visible !== false])
      );
      const manualItems = previous.filter(
        (item) => item.source !== 'notebook' && !notebookKeys.has(measurementStateKey(item.type, item.targets))
      );
      const syncedItems = notebookMeasurementItems.map((item) => ({
        ...item,
        visible: previousVisibility.get(measurementStateKey(item.type, item.targets)) ?? true,
      }));
      const next = [...manualItems, ...syncedItems];
      const isSame =
        previous.length === next.length &&
        previous.every((item, index) => {
          const other = next[index];
          return (
            other &&
            item.id === other.id &&
            item.type === other.type &&
            item.source === other.source &&
            item.visible === other.visible &&
            item.lineStart === other.lineStart &&
            item.targets.join('|') === other.targets.join('|')
          );
        });
      return isSame ? previous : next;
    });
  }, [notebookMeasurementItems, workspaceMode]);

  const notebookProgressRatio = Math.max(0, Math.min(1, notebookCursor / 100));
  const notebookLineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount);
  const notebookLinePosition = notebookProgressRatio * notebookLineCount;
  const notebookActiveLineIndex = notebookCursor <= 0
    ? -1
    : Math.min(notebookLineCount - 1, Math.max(0, Math.floor(notebookLinePosition)));
  const notebookTimelineMarks = useMemo(() => {
    const seen = new Set();
    return notebookScript.marks
      .map((mark, lineIndex) => ({ ...mark, lineIndex }))
      .filter((mark) => mark?.label && mark.kind !== 'blank' && mark.kind !== 'note')
      .filter((mark) => {
        const key = `${mark.lineIndex}:${mark.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((mark) => ({
        ...mark,
        percent: Math.max(0, Math.min(100, ((mark.lineIndex + 0.5) / notebookLineCount) * 100)),
      }));
  }, [notebookLineCount, notebookScript.marks]);

  useEffect(() => {
    notebookHasVisualVectorsRef.current = notebookScript.cells.some(
      (cell) =>
        (cell.type === 'vector' && cell.execute !== false && !cell.remove) ||
        (cell.type === 'calc' && cell.resultKind === 'vector' && cell.execute === true) ||
        (cell.type === 'ref' && cell.refKind === 'vector' && !cell.remove)
    );
    notebookHasMatrixCellsRef.current = notebookScript.cells.some(
      (cell) =>
        cell.type === 'matrix' ||
        (cell.type === 'calc' && cell.resultKind === 'matrix') ||
        (cell.type === 'ref' && cell.refKind === 'matrix')
    );
  }, [notebookScript.cells]);

  useEffect(() => {
    setNotebookCells((previous) =>
      previous.map((cell) =>
        cell.type !== 'matrix'
          ? cell
          : cell.mode === systemMatrixMode
          ? cell
          : {
              ...cell,
              mode: systemMatrixMode,
              text: matrixTextFromValues(identityInputValuesForMode(systemMatrixMode), systemMatrixDimension),
            }
      )
    );
  }, [systemMatrixDimension, systemMatrixMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const theme = mediaQuery.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      const themeColor = theme === 'dark' ? '#10110f' : '#f5f4ef';
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', themeColor);
    };
    applyTheme();
    mediaQuery.addEventListener?.('change', applyTheme);
    return () => {
      mediaQuery.removeEventListener?.('change', applyTheme);
    };
  }, []);

  useEffect(() => {
    systemDimensionRef.current = effectiveSystemMode;
  }, [effectiveSystemMode]);

  useEffect(() => {
    vectorToolModeRef.current = vectorToolMode;
  }, [vectorToolMode]);

  useEffect(() => {
    workspaceModeRef.current = workspaceMode;
    if (workspaceMode === 'system') {
      setShowGrid(true);
      setShowRelativeGrid(false);
      setShowCoordinates(false);
      setVectorToolMode('vector');
    } else {
      setShowRelativeGrid(true);
      setShowCoordinates(true);
      setVectorToolMode('vector');
    }
  }, [workspaceMode]);

  useEffect(() => {
    userVectorRef.current = parsedVector;
    vectorsRef.current = vectorItems;
    activeVectorIdRef.current = activeVector.id;
  }, [activeVector.id, parsedVector, vectorItems]);

  useEffect(() => {
    scalarSolutionRef.current = scalarConstraintSolution;
  }, [scalarConstraintSolution]);

  useEffect(() => {
    measurementsRef.current = measurements;
  }, [measurements]);

  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

  useEffect(() => {
    measureDraftRef.current = measureDraft;
  }, [measureDraft]);

  useEffect(() => {
    dragSnapEnabledRef.current = snapToInteger;
    if (!snapToInteger) setDragSnapGuide(null);
  }, [snapToInteger]);

  useEffect(() => {
    uiStateRef.current = {
      showVolume,
      showVector,
      showBasis,
      basisVisibility,
      showGrid,
      showRelativeGrid,
      relativeGridStrength,
      showCoordinates: true,
      showCoordinateNumbers: showCoordinates,
      showDot,
      showAxes,
      showRelativeAxes,
    };
  }, [
    showVolume,
    showVector,
    showBasis,
    basisVisibility,
    showGrid,
    showRelativeGrid,
    relativeGridStrength,
    showCoordinates,
    showDot,
    showAxes,
    showRelativeAxes,
  ]);

  useEffect(() => {
    if (!threeRef.current) return;

    const mode = viewKeyForMatrix(displayMatrix);
    const labelWithCoord = (name, values, coordMode = mode, highlightIndices = []) =>
      coordLabelText(name, values, coordMode, showCoordinates, highlightIndices);
    const showLabel = (label, text, visible) => {
      if (!label) return;
      setAxisLabelText(label, text);
      label.style.display = visible ? 'block' : 'none';
    };

    const basisVectors = {
      i: [displayMatrix[0], displayMatrix[3], displayMatrix[6]],
      j: [displayMatrix[1], displayMatrix[4], displayMatrix[7]],
      k: [displayMatrix[2], displayMatrix[5], displayMatrix[8]],
    };

    showLabel(
      iLabelRef.current,
      labelWithCoord('i', basisVectors.i),
      showRelativeAxes && basisVisibility.i !== false && vectorLength(basisVectors.i) > EPSILON
    );
    showLabel(
      jLabelRef.current,
      labelWithCoord('j', basisVectors.j),
      showRelativeAxes && basisVisibility.j !== false && vectorLength(basisVectors.j) > EPSILON
    );
    showLabel(
      kLabelRef.current,
      labelWithCoord('k', basisVectors.k, '3d'),
      showRelativeAxes && basisVisibility.k !== false && vectorLength(basisVectors.k) > 0.08
    );

    vectors.forEach((item) => {
      const label = vectorLabelRefs.current.get(item.id);
      const values = [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)];
      const transformed = transformVector3(displayMatrix, values);
      const scalarSpace = item.scalarSpace === 'input' ? 'input' : 'output';
      const scalarNormal = scalarSpace === 'input' ? values : transformed;
      const highlightIndices = item.scalarEnabled ? scalarLockHighlightIndices(scalarNormal, mode) : [];
      showLabel(
        label,
        labelWithCoord(item.name, transformed, mode, highlightIndices),
        showVector && item.visible !== false
      );
    });
  }, [basisVisibility, displayMatrix, showCoordinates, showRelativeAxes, showVector, vectors]);

  useEffect(() => {
    cameraLockedRef.current = cameraLocked;
    zoomLockedRef.current = zoomLocked;
    cameraAutoRef.current = cameraAuto;
    autoCameraTargetViewRef.current = workspaceMode === 'system' ? effectiveSystemMode : displayMode;
    if (cameraLocked) {
      cameraMoveRef.current.active = false;
    }

    const refs = threeRef.current;
    if (refs?.controls) {
      configureControlsForView(refs.controls, activeView ?? displayMode, {
        camera: cameraLocked,
        zoom: zoomLocked,
      });
      refs.controls.update();
    }
  }, [activeView, cameraAuto, cameraLocked, displayMode, effectiveSystemMode, workspaceMode, zoomLocked]);

  const updateVectorValue = useCallback((id, axis, value) => {
    setVectors((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, [axis]: value.replace(/^0+(?=\d)/, '') } : item
      )
    );
  }, []);

  const updateVectorScalar = useCallback((id, value) => {
    const nextValue = cleanScalarText(value);
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalar: nextValue.replace(/^0+(?=\d)/, '') } : item))
    );
  }, []);

  const updateVectorScalarSpace = useCallback((id, scalarSpace) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalarSpace } : item))
    );
  }, []);

  const restorePanelScrollTop = useCallback((scrollTop, vectorId = null) => {
    if (!Number.isFinite(scrollTop) || typeof window === 'undefined') return;

    const restore = () => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = scrollTop;
    };
    const keepVectorBottomVisible = () => {
      const scroller = panelScrollRef.current;
      if (!scroller || !vectorId) return;
      const escapedId = window.CSS?.escape ? window.CSS.escape(vectorId) : vectorId.replace(/"/g, '\\"');
      const card = scroller.querySelector(`[data-vector-id="${escapedId}"]`);
      if (!card) return;
      const nextCard = card.nextElementSibling?.classList.contains('vector-card')
        ? card.nextElementSibling
        : null;
      const scrollerRect = scroller.getBoundingClientRect();
      const bottomRect = (nextCard ?? card).getBoundingClientRect();
      const bottomOverflow = bottomRect.bottom - scrollerRect.bottom + 8;
      if (bottomOverflow > 0) scroller.scrollTop += bottomOverflow;
    };

    window.requestAnimationFrame(() => {
      restore();
      keepVectorBottomVisible();
      window.requestAnimationFrame(() => {
        restore();
        keepVectorBottomVisible();
      });
    });
    window.setTimeout(() => {
      restore();
      keepVectorBottomVisible();
    }, 120);
  }, []);

  const toggleVectorScalar = useCallback((id, checked) => {
    const scrollTop = panelScrollRef.current?.scrollTop;
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalarEnabled: checked } : item))
    );
    restorePanelScrollTop(scrollTop, id);
  }, [restorePanelScrollTop]);

  const toggleVectorVisible = useCallback((id) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: item.visible === false } : item))
    );
  }, []);

  const toggleBasisVisible = useCallback((id) => {
    setBasisVisibility((previous) => ({ ...previous, [id]: previous[id] === false }));
  }, []);

  const toggleMeasureMode = useCallback((mode) => {
    setMeasureMode((previous) => {
      const next = previous === mode ? null : mode;
      setMeasureDraft([]);
      setMeasureAnchorId(null);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
      return next;
    });
  }, []);

  const startMeasurementFrom = useCallback((mode, targetId, event = null) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setMeasureMode(mode);
    setMeasureDraft([targetId]);
    setMeasureAnchorId(null);
    setMeasurePointer(
      event && rect
        ? {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }
        : null
    );
    setHoveredMeasureTargetId(null);
    setShowVector(true);
    if (targetId.startsWith('v:')) {
      setActiveVectorId(targetId.slice(2));
    }
  }, []);

  const toggleMeasurementVisible = useCallback((id) => {
    setMeasurements((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: item.visible === false } : item))
    );
  }, []);

  const notebookNameForMeasureTarget = useCallback((targetId) => {
    if (targetId === 'b:i') return 'i';
    if (targetId === 'b:j') return 'j';
    if (targetId === 'b:k') return 'k';
    if (targetId?.startsWith('v:')) {
      const vectorId = targetId.slice(2);
      return vectorsRef.current.find((item) => item.id === vectorId)?.name ?? vectorId;
    }
    return null;
  }, []);

  const notebookMeasurementExpressionForTargets = useCallback((type, targetIds) => {
    const names = targetIds.map(notebookNameForMeasureTarget).filter(Boolean);
    if (type === 'dot') return names.length >= 2 ? `dot(${names[0]}, ${names[1]})` : null;
    if (type === 'volume') return names.length >= 2 ? `det(${names.join(', ')})` : null;
    return null;
  }, [notebookNameForMeasureTarget]);

  const nextNotebookMeasurementAlias = useCallback((lines, prefix) => {
    const aliasPattern = new RegExp(`#${prefix}(\\d+)\\b`, 'gi');
    const nextIndex = [...String(lines.join('\n')).matchAll(aliasPattern)]
      .reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0) + 1;
    return `${prefix}${nextIndex}`;
  }, []);

  const resolveNotebookMeasurementAlias = useCallback((lines, currentAlias, nextType) => {
    const normalized = normalizeNotebookVariableName(currentAlias ?? '');
    const generated = /^(?:dot|det)\d+$/iu.test(normalized);
    if (normalized && !generated) return normalized;
    const prefix = nextType === 'dot' ? 'dot' : 'det';
    if (normalized && notebookVariableKey(normalized).startsWith(prefix)) return normalized;
    return nextNotebookMeasurementAlias(lines, prefix);
  }, [nextNotebookMeasurementAlias]);

  const updateNotebookMeasurementFormula = useCallback((source, nextType, nextTargets) => {
    if (workspaceModeRef.current !== 'system' || source?.source !== 'notebook') return false;
    const expression = notebookMeasurementExpressionForTargets(nextType, nextTargets);
    if (!expression) return false;

    setNotebookText((previous) => {
      const normalized = String(previous ?? '').replace(/\r/g, '');
      const lines = normalized.split('\n');
      let index = Number.isInteger(source.lineStart) ? source.lineStart : -1;
      if (index < 0 || index >= lines.length) {
        const previousExpression = notebookMeasurementExpressionForTargets(source.type, source.targets);
        index = previousExpression
          ? lines.findIndex((line) => splitNotebookLineMeta(line).body.trim() === previousExpression)
          : -1;
      }
      if (index < 0 || index >= lines.length) return previous;

      const meta = splitNotebookLineMeta(lines[index]);
      const alias = resolveNotebookMeasurementAlias(lines, meta.alias, nextType);
      lines[index] = appendNotebookLineMeta(expression, { alias, hidden: meta.hidden });
      return lines.join('\n');
    });
    return true;
  }, [notebookMeasurementExpressionForTargets, resolveNotebookMeasurementAlias]);

  const removeMeasurement = useCallback((id) => {
    const source = measurementsRef.current.find((item) => item.id === id);
    if (workspaceModeRef.current === 'system' && source?.source === 'notebook') {
      setNotebookText((previous) => {
        const lines = String(previous ?? '').replace(/\r/g, '').split('\n');
        if (Number.isInteger(source.lineStart) && lines[source.lineStart]) {
          return lines.filter((_, index) => index !== source.lineStart).join('\n');
        }

        const expression = notebookMeasurementExpressionForTargets(source.type, source.targets);
        if (!expression) return previous;
        return lines
          .filter((line) => splitNotebookLineMeta(line).body.trim() !== expression)
          .join('\n');
      });
    }
    setMeasurements((previous) => previous.filter((item) => item.id !== id));
  }, [notebookMeasurementExpressionForTargets]);

  const reverseDotMeasurement = useCallback((id) => {
    const source = measurementsRef.current.find((item) => item.id === id);
    if (source?.type === 'dot' && source.targets.length >= 2) {
      updateNotebookMeasurementFormula(source, 'dot', [...source.targets].reverse());
    }
    setMeasurements((previous) =>
      previous.map((item) => (
        item.id === id && item.type === 'dot' && item.targets.length >= 2
          ? { ...item, targets: [...item.targets].reverse() }
          : item
      ))
    );
  }, [updateNotebookMeasurementFormula]);

  const convertMeasurementType = useCallback((id) => {
    const sourceSnapshot = measurementsRef.current.find((item) => item.id === id);
    if (sourceSnapshot && sourceSnapshot.targets.length >= 2) {
      const nextType = sourceSnapshot.type === 'dot' ? 'volume' : 'dot';
      updateNotebookMeasurementFormula(sourceSnapshot, nextType, sourceSnapshot.targets.slice(0, 2));
    }
    setMeasurements((previous) => {
      const source = previous.find((item) => item.id === id);
      if (!source || source.targets.length < 2) return previous;
      const nextType = source.type === 'dot' ? 'volume' : 'dot';
      const nextTargets = source.type === 'dot' ? source.targets.slice(0, 2) : source.targets.slice(0, 2);
      const nextKey = measurementStateKey(nextType, nextTargets);
      return previous
        .filter((item) => item.id === id || measurementStateKey(item.type, item.targets) !== nextKey)
        .map((item) => (
          item.id === id
            ? { ...item, type: nextType, targets: nextTargets, visible: true }
            : item
        ));
    });
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    setMeasurePointer(null);
  }, [updateNotebookMeasurementFormula]);

  const continueMeasurement = useCallback((item) => {
    const targetIds = item?.targetIds ?? item?.targets;
    if (!item || item.type !== 'volume' || !Array.isArray(targetIds) || targetIds.length < 2) return;
    setMeasureMode('volume');
    setMeasureDraft(targetIds.slice(0, 2));
    setMeasureAnchorId(item.id);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
  }, []);

  const continueDotMeasurement = useCallback((item, event = null) => {
    const targetIds = item?.targetIds ?? item?.targets;
    if (!item || item.type !== 'dot' || !Array.isArray(targetIds) || targetIds.length < 2) return;
    startMeasurementFrom('dot', targetIds[targetIds.length - 1], event);
  }, [startMeasurementFrom]);

  const appendNotebookMeasurementFormula = useCallback((type, targetIds) => {
    if (workspaceModeRef.current !== 'system') return;
    const expression = notebookMeasurementExpressionForTargets(type, targetIds);
    if (!expression) return;
    const aliasPrefix = type === 'dot' ? 'dot' : 'det';

    setNotebookText((previous) => {
      const normalized = String(previous ?? '').replace(/\r/g, '');
      const alreadyExists = normalized
        .split('\n')
        .some((line) => splitNotebookLineMeta(line).body.trim() === expression);
      if (alreadyExists) return previous;

      const aliasPattern = new RegExp(`#${aliasPrefix}(\\d+)\\b`, 'gi');
      const nextIndex = [...normalized.matchAll(aliasPattern)]
        .reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0) + 1;
      const prefix = normalized.trimEnd() ? '\n' : '';
      return `${normalized.trimEnd()}${prefix}${expression}  #${aliasPrefix}${nextIndex}`;
    });
  }, [notebookMeasurementExpressionForTargets]);

  const pickMeasureTarget = useCallback((targetId) => {
    if (!measureMode || measureDraft.length === 0) return false;
    if (measureDraft.includes(targetId)) {
      setMeasureDraft([]);
      setMeasureAnchorId(null);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
      setMeasureMode(null);
      return true;
    }
    const withoutDuplicate = measureDraft.filter((id) => id !== targetId);
    const next = [...withoutDuplicate, targetId];
    const addMeasurement = (type, targets, replaceTargets = null) => {
      const id = `m${nextMeasurementIndexRef.current}`;
      nextMeasurementIndexRef.current += 1;
      const source = workspaceModeRef.current === 'system' ? 'notebook' : 'manual';
      const replaceSource = replaceTargets
        ? measurementsRef.current.find((item) => (
          measurementStateKey(item.type, item.targets) === measurementStateKey(type, replaceTargets)
        ))
        : null;
      const updatedNotebookFormula = updateNotebookMeasurementFormula(replaceSource, type, targets);
      setMeasurements((items) => [
        ...items.filter((item) => {
          const itemKey = measurementStateKey(item.type, item.targets);
          if (itemKey === measurementStateKey(type, targets)) return false;
          if (replaceTargets && itemKey === measurementStateKey(type, replaceTargets)) return false;
          return true;
        }),
        { id, type, targets, visible: true, source },
      ]);
      if (!updatedNotebookFormula) appendNotebookMeasurementFormula(type, targets);
    };

    if (next.length < 2) {
      setMeasureDraft(next);
      return true;
    }

    const targetLimit = measureMode === 'volume' && displayMode === '3d' ? 3 : 2;
    addMeasurement(measureMode, next.slice(0, targetLimit), measureDraft.length >= 2 ? measureDraft : null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
    setMeasureMode(null);
    return true;
  }, [appendNotebookMeasurementFormula, displayMode, measureDraft, measureMode, updateNotebookMeasurementFormula]);

  const handleBasisLegendClick = useCallback((id) => {
    if (measureMode && measureDraft.length === 0) {
      startMeasurementFrom(measureMode, `b:${id}`);
      return;
    }
    if (pickMeasureTarget(`b:${id}`)) return;
    toggleBasisVisible(id);
  }, [measureDraft.length, measureMode, pickMeasureTarget, startMeasurementFrom, toggleBasisVisible]);

  const handleVectorLegendClick = useCallback((id) => {
    if (measureMode && measureDraft.length === 0) {
      startMeasurementFrom(measureMode, `v:${id}`);
      return;
    }
    if (pickMeasureTarget(`v:${id}`)) return;
    toggleVectorVisible(id);
  }, [measureDraft.length, measureMode, pickMeasureTarget, startMeasurementFrom, toggleVectorVisible]);

  const showAllVectorTargets = useCallback(() => {
    setShowVector(true);
    setShowBasis(true);
    setBasisVisibility({ i: true, j: true, k: true });
    setVectors((previous) => previous.map((item) => ({ ...item, visible: true })));
  }, []);

  const hideAllVectorTargets = useCallback(() => {
    setBasisVisibility({ i: false, j: false, k: false });
    setVectors((previous) => previous.map((item) => ({ ...item, visible: false })));
  }, []);

  const getMeasureTargetLabelNode = useCallback((targetId) => {
    if (targetId === 'b:i') return iLabelRef.current;
    if (targetId === 'b:j') return jLabelRef.current;
    if (targetId === 'b:k') return kLabelRef.current;
    if (targetId?.startsWith('v:')) return vectorLabelRefs.current.get(targetId.slice(2)) ?? null;
    return null;
  }, []);

  const renderLabelMeasureTools = useCallback((targetId) => (
    <span
      className="label-measure-menu"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <button
        className={measureMode === 'dot' && measureDraft.includes(targetId) ? 'active' : ''}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startMeasurementFrom('dot', targetId, event);
        }}
        title={t(locale, 'dotConnect')}
        type="button"
      >
        <Sigma size={12} />
      </button>
      <button
        className={measureMode === 'volume' && measureDraft.includes(targetId) ? 'active' : ''}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startMeasurementFrom('volume', targetId, event);
        }}
        title={t(locale, 'areaVolumeConnect')}
        type="button"
      >
        <Box size={12} />
      </button>
      <button
        className="label-hide-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (targetId.startsWith('b:')) {
            toggleBasisVisible(targetId.slice(2));
            return;
          }
          if (targetId.startsWith('v:')) {
            toggleVectorVisible(targetId.slice(2));
          }
        }}
        title={t(locale, 'hideTarget')}
        type="button"
      >
        <EyeOff size={12} />
      </button>
    </span>
  ), [locale, measureDraft, measureMode, startMeasurementFrom, toggleBasisVisible, toggleVectorVisible]);

  const renderMeasurementLabelTools = useCallback((item) => {
    const targetIds = item?.targetIds ?? item?.targets ?? [];
    const canContinueDot = item?.type === 'dot' && targetIds.length >= 2;
    const canReverseDot = item?.type === 'dot' && targetIds.length >= 2;
    const canConvertMeasurement = (item?.type === 'dot' || item?.type === 'volume') && targetIds.length >= 2;
    const canContinueVolume = item?.type === 'volume' && targetIds.length === 2 && displayMode === '3d';

    return (
      <span
        className="measurement-label-menu"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        {canContinueDot && (
          <button
            className="measurement-label-add measurement-label-add-dot"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              continueDotMeasurement(item, event);
            }}
            title={t(locale, 'continueDot')}
            type="button"
          >
            <span className="measurement-add-icon">
              <Sigma size={12} />
              <Plus size={8} />
            </span>
          </button>
        )}
        {canReverseDot && (
          <button
            className="measurement-label-reverse"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              reverseDotMeasurement(item.id);
            }}
            title={t(locale, 'reverseDirection')}
            type="button"
          >
            <ArrowLeftRight size={12} />
          </button>
        )}
        {canConvertMeasurement && (
          <button
            className={`measurement-label-convert ${item.type === 'dot' ? 'to-volume' : 'to-dot'}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              convertMeasurementType(item.id);
            }}
            title={item.type === 'dot' ? t(locale, 'convertToVolume') : t(locale, 'convertToDot')}
            type="button"
          >
            {item.type === 'dot' ? <Box size={12} /> : <Sigma size={12} />}
          </button>
        )}
        {canContinueVolume && (
          <button
            className="measurement-label-add measurement-label-add-volume"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              continueMeasurement(item);
            }}
            title={t(locale, 'extendVolume')}
            type="button"
          >
            <span className="measurement-add-icon">
              <Box size={12} />
              <Plus size={8} />
            </span>
          </button>
        )}
        <button
          className="measurement-label-delete"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            removeMeasurement(item.id);
          }}
          title={t(locale, 'deleteMeasurement')}
          type="button"
        >
          <X size={12} />
        </button>
      </span>
    );
  }, [continueDotMeasurement, continueMeasurement, convertMeasurementType, displayMode, locale, removeMeasurement, reverseDotMeasurement]);

  const renderMeasurementChip = useCallback((item) => (
    <div
      className={`measure-chip measure-${item.measureKind ?? item.type} ${item.visible === false ? 'muted' : ''}`}
      key={item.id}
    >
      <button
        onClick={() => toggleMeasurementVisible(item.id)}
        title={t(locale, 'toggleMeasurement', { type: item.type === 'dot' ? t(locale, 'dot') : t(locale, 'volume') })}
        type="button"
      >
        <span>{item.type === 'dot' ? 'Σ' : '□'}</span>
        <strong>{item.label}</strong>
        {item.value !== null && <em>{formatNumber(item.value)}</em>}
      </button>
      {(item.type === 'dot' || item.type === 'volume') && item.targetIds?.length >= 2 && (
        <button
          className={`measure-convert ${item.type === 'dot' ? 'to-volume' : 'to-dot'}`}
          onClick={() => convertMeasurementType(item.id)}
          title={item.type === 'dot' ? t(locale, 'convertToVolume') : t(locale, 'convertToDot')}
          type="button"
        >
          {item.type === 'dot' ? <Box size={11} /> : <Sigma size={11} />}
        </button>
      )}
      {item.type === 'volume' && item.targetIds?.length === 2 && displayMode === '3d' && (
        <button
          className="measure-extend"
          onClick={() => continueMeasurement(item)}
          title={t(locale, 'extendVolume')}
          type="button"
        >
          <Plus size={11} />
        </button>
      )}
      <button
        className="measure-remove"
        onClick={() => removeMeasurement(item.id)}
        title={t(locale, 'removeMeasurement')}
        type="button"
      >
        <X size={11} />
      </button>
    </div>
  ), [continueMeasurement, convertMeasurementType, displayMode, locale, removeMeasurement, toggleMeasurementVisible]);

  const updateMeasurePointer = useCallback((event) => {
    if (!measureMode || measureDraft.length === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMeasurePointer({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, [measureDraft.length, measureMode]);

  const measureDraftGuide = useMemo(() => {
    if (!measureMode || measureDraft.length === 0 || !measurePointer) return null;
    const anchorTargetNode = measureAnchorId
      ? measurementLabelRefs.current.get(measureAnchorId)
      : getMeasureTargetLabelNode(measureDraft[measureDraft.length - 1]);
    const sceneNode = containerRef.current;
    if (!anchorTargetNode || !sceneNode) return null;
    const targetRect = anchorTargetNode.getBoundingClientRect();
    const sceneRect = sceneNode.getBoundingClientRect();
    return {
      x1: targetRect.left + targetRect.width / 2 - sceneRect.left,
      y1: targetRect.top + targetRect.height / 2 - sceneRect.top,
      x2: measurePointer.x,
      y2: measurePointer.y,
      snapped: !!hoveredMeasureTargetId && !measureDraft.includes(hoveredMeasureTargetId),
    };
  }, [getMeasureTargetLabelNode, hoveredMeasureTargetId, measureAnchorId, measureDraft, measureMode, measurePointer]);

  const focusVectorDot = useCallback((id) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, visible: true, scalarEnabled: false } : item))
    );
    setActiveVectorId(id);
    setShowVector(true);
    setShowDot(true);
  }, []);

  const addVector = useCallback(() => {
    const index = nextVectorIndexRef.current;
    nextVectorIndexRef.current += 1;
    const next = createVectorState(index - 1, {
      id: `v${index}`,
      name: `v${index}`,
      x: String(index),
      y: '1',
      z: '0',
    });
    setVectors((previous) => [...previous, next]);
    setActiveVectorId(next.id);
  }, []);

  const removeVector = useCallback((id) => {
    setMeasurements((current) => current.filter((item) => !item.targets.includes(`v:${id}`)));
    setVectors((previous) => {
      const next = previous.filter((item) => item.id !== id);
      if (activeVectorIdRef.current === id) {
        const fallback = next[0]?.id ?? '';
        activeVectorIdRef.current = fallback;
        setActiveVectorId(fallback);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const refs = threeRef.current;
    if (!refs) return undefined;

    clearEquationGroup(refs.equationGroup);
    refs.equationPoint.userData.visible = false;
    refs.equationPoint.userData.inputPoint = null;
    refs.equationPoint.userData.revealKey = null;
    refs.equationPoint.visible = false;

    if (workspaceMode !== 'system' && vectorToolMode !== 'system') {
      refs.equationGroup.visible = false;
      return undefined;
    }

    refs.equationGroup.visible = true;

    if (lineSystem.mode === '3d') {
      const hasSolutionHighlight =
        lineSystem.solution?.status === 'infinite' &&
        lineSystem.solution?.nullspaceBasis?.length === 1;
      lineSystem.planes.forEach((plane) => {
        createPlaneObjects(plane, 6.5, hasSolutionHighlight).forEach((object) => {
          object.userData.revealKey = `equation:plane:${plane.index}`;
          refs.equationGroup.add(object);
        });
      });
      createSolutionHighlightObjects(lineSystem.solution, 0xf1b434).forEach((object) => {
        object.userData.revealKey = `equation:solution:${lineSystem.solution?.status ?? 'none'}`;
        refs.equationGroup.add(object);
      });
    } else {
      lineSystem.lines.forEach((line) => {
        const segment = lineSegmentForEquation(line);
        if (segment.length < 2) return;
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(segment[0][0], segment[0][1], 0.018),
          new THREE.Vector3(segment[1][0], segment[1][1], 0.018),
        ]);
        const material = new THREE.LineBasicMaterial({
          color: line.color,
          transparent: true,
          opacity: 0.96,
          depthTest: false,
          depthWrite: false,
        });
        const lineMesh = new THREE.Line(geometry, material);
        lineMesh.renderOrder = 32;
        lineMesh.userData.revealKey = `equation:line:${line.index}`;
        refs.equationGroup.add(lineMesh);
      });
    }

    if (lineSystem.point) {
      refs.equationPoint.userData.inputPoint = [
        lineSystem.point[0],
        lineSystem.point[1],
        lineSystem.mode === '3d' ? lineSystem.point[2] : 0.055,
      ];
      refs.equationPoint.userData.solutionPoint = [...lineSystem.point];
      refs.equationPoint.userData.mode = lineSystem.mode;
      refs.equationPoint.position.set(
        refs.equationPoint.userData.inputPoint[0],
        refs.equationPoint.userData.inputPoint[1],
        refs.equationPoint.userData.inputPoint[2]
      );
      refs.equationPoint.userData.visible = true;
      refs.equationPoint.userData.revealKey = `equation:point:${lineSystem.mode}`;
      refs.equationPoint.visible = true;
    }

    return () => {
      clearEquationGroup(refs.equationGroup);
    };
  }, [lineSystem, workspaceMode, vectorToolMode]);

  const previewDraggedMatrix = useCallback((matrix) => {
    const next = [...matrix];
    currentMatrixRef.current = next;
    startMatrixRef.current = next;
    targetMatrixRef.current = next;
    isAnimatingRef.current = false;
    setProgress(1);
    setDisplayMatrix(next);
    setBasisControlMatrix(next);
  }, []);

  const updateBasisInputValue = useCallback((basisId, axis, value) => {
    const columnIndex = basisId === 'i' ? 0 : basisId === 'j' ? 1 : 2;
    const rowOffset = axis === 'x' ? 0 : axis === 'y' ? 3 : 6;
    const next = [...targetMatrixRef.current];
    next[columnIndex + rowOffset] = parseNumber(value);
    setBasisControlMatrix(next);
    startMatrixRef.current = [...currentMatrixRef.current];
    targetMatrixRef.current = next;
    animationViewFromRef.current = viewKeyForMatrix(currentMatrixRef.current);
    animationViewToRef.current = viewKeyForMatrix(next);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    isAnimatingRef.current = true;
    setProgress(0);
    const nextView = viewKeyForMatrix(next);
    const refs = threeRef.current;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(nextView);
    if (refs) {
      configureControlsForView(refs.controls, nextView, controlLocksFromRefs());
      const destination = cameraStateForView(nextView, refs.camera.position, refs.controls.target);
      cameraMoveRef.current = {
        active: true,
        startTime: null,
        positionFrom: refs.camera.position.clone(),
        targetFrom: refs.controls.target.clone(),
        positionTo: destination.position,
        targetTo: destination.target,
      };
    }
  }, []);

  const resetBasisVector = useCallback((basisId) => {
    const columnIndex = basisId === 'i' ? 0 : basisId === 'j' ? 1 : 2;
    const next = [...targetMatrixRef.current];
    [0, 3, 6].forEach((rowOffset, rowIndex) => {
      next[columnIndex + rowOffset] = rowIndex === columnIndex ? 1 : 0;
    });
    setBasisControlMatrix(next);
    startMatrixRef.current = [...currentMatrixRef.current];
    targetMatrixRef.current = next;
    animationViewFromRef.current = viewKeyForMatrix(currentMatrixRef.current);
    animationViewToRef.current = viewKeyForMatrix(next);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    isAnimatingRef.current = true;
    setProgress(0);
    const nextView = viewKeyForMatrix(next);
    const refs = threeRef.current;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(nextView);
    if (refs) {
      configureControlsForView(refs.controls, nextView, controlLocksFromRefs());
      const destination = cameraStateForView(nextView, refs.camera.position, refs.controls.target);
      cameraMoveRef.current = {
        active: true,
        startTime: null,
        positionFrom: refs.camera.position.clone(),
        targetFrom: refs.controls.target.clone(),
        positionTo: destination.position,
        targetTo: destination.target,
      };
    }
  }, []);

  const commitBasisDrag = useCallback((startMatrix, endMatrix, dragKey) => {
    if (!startMatrix || !endMatrix || matricesAlmostEqual(startMatrix, endMatrix)) return;

    const stateMode = modeForMatrix(endMatrix);
    const previousStateMode = modeForMatrix(startMatrix);
    const operation = operationBetweenMatrices(startMatrix, endMatrix);
    const entry = {
      name: dragHistoryName(dragKey, locale),
      matrix: [...endMatrix],
      previousMatrix: [...startMatrix],
      previousStateMode,
      operationMatrix: [...operation.operationMatrix],
      operationMode: operation.operationMode,
      isDimensionDrop: operation.isDimensionDrop,
      stateMode,
    };

    setHistory((previous) => {
      const next = [...previous, entry];
      setActiveHistoryIndex(next.length - 1);
      setHoveredHistoryIndex(null);
      return next;
    });
  }, [locale]);

  const updateBasisVectorFromDrag = useCallback((dragKey, worldVector) => {
    if (!['i', 'j', 'k'].includes(dragKey)) return worldVector;
    const mode = viewKeyForMatrix(currentMatrixRef.current);
    const adjusted = constrainVectorForMode(
      worldVector,
      mode,
      snapToInteger ? { drag: true } : { snap: false }
    );
    const next = [...currentMatrixRef.current];
    const columnIndex = dragKey === 'i' ? 0 : dragKey === 'j' ? 1 : 2;
    next[columnIndex] = adjusted.x;
    next[columnIndex + 3] = adjusted.y;
    next[columnIndex + 6] = adjusted.z;
    previewDraggedMatrix(next);
    return adjusted;
  }, [previewDraggedMatrix]);

  const syncNotebookVectorLineFromDrag = useCallback((vectorId, solved) => {
    if (workspaceModeRef.current !== 'system' || !vectorId?.startsWith('notebook-')) return;
    if (!Array.isArray(solved) || !solved.every(Number.isFinite)) return;

    setNotebookText((previous) => {
      const normalized = String(previous ?? '').replace(/\r/g, '');
      const parsed = parseNotebookScript(normalized);
      const visualIndexByName = new Map();
      let targetCell = null;

      parsed.cells.forEach((cell) => {
        if (cell.type !== 'vector' && cell.type !== 'calc') return;
        const key = notebookVariableKey(cell.name);
        if (!visualIndexByName.has(key)) {
          visualIndexByName.set(key, visualIndexByName.size);
        }
        const candidateId = notebookVectorIdForName(cell.name, visualIndexByName.get(key));
        if (candidateId === vectorId) targetCell = cell;
      });

      if (!targetCell || !Number.isFinite(targetCell.lineStart)) return previous;
      const lines = normalized.split('\n');
      const sourceLine = lines[targetCell.lineStart] ?? '';
      const sourceVector = parseNotebookVectorLine(sourceLine);
      const sourceDimension = sourceVector?.dimension ?? targetCell.dimension;
      const dimension = sourceDimension >= 3 || Math.abs(solved[2] ?? 0) > 0.001 ? 3 : 2;
      const vectorText = solved
        .slice(0, dimension)
        .map((value) => formatVectorInputValue(value))
        .join(', ');
      const sourceMeta = splitNotebookLineMeta(sourceLine);
      lines[targetCell.lineStart] = appendNotebookLineMeta(vectorText, {
        ...sourceMeta,
        alias: targetCell.name,
      });
      const next = lines.join('\n');
      return next === normalized ? previous : next;
    });
  }, []);

  const updateUserVectorFromDrag = useCallback((worldVector, dragState = null) => {
    const vectorId = vectorIdFromDragKey(dragState?.key) ?? activeVectorIdRef.current;
    const matrix = dragState?.startMatrix ?? currentMatrixRef.current;
    const mode = viewKeyForMatrix(matrix);
    const startInput =
      dragState?.startInputVector ??
      vectorsRef.current.find((item) => item.id === vectorId)?.values ??
      userVectorRef.current;
    const inputDelta = dragState
      ? solveVectorInputForWorld(
          matrix,
          worldVector.clone().sub(dragState.startVector),
          mode,
          { snap: false }
        )
      : null;
    const solved = dragState
      ? constrainInputValuesForMode(
          startInput.map((value, index) => value + inputDelta[index]),
          mode,
          snapToInteger,
          { drag: true }
        )
      : solveVectorInputForWorld(currentMatrixRef.current, constrainVectorForMode(worldVector, mode), mode);
    const adjustedWorld = transformVector3(currentMatrixRef.current, solved);
    const nextVector = {
      x: formatVectorInputValue(solved[0]),
      y: formatVectorInputValue(solved[1]),
      z: formatVectorInputValue(solved[2]),
    };
    if (activeVectorIdRef.current === vectorId) {
      userVectorRef.current = [solved[0], solved[1], solved[2]];
    }
    syncNotebookVectorLineFromDrag(vectorId, solved);
    setVectors((previous) =>
      previous.map((item) => (item.id === vectorId ? { ...item, ...nextVector } : item))
    );
    return new THREE.Vector3(adjustedWorld[0], adjustedWorld[1], adjustedWorld[2]);
  }, [snapToInteger, syncNotebookVectorLineFromDrag]);

  const updateScalarConstraintFromDrag = useCallback((worldVector, dragState = null) => {
    const vectorId = scalarIdFromDragKey(dragState?.key);
    const normal = dragState?.scalarNormal;
    if (!vectorId || !normal || normal.lengthSq() < EPSILON || !isFiniteVector3(worldVector) || !isFiniteVector3(normal)) {
      return worldVector;
    }

    const scalarSpace = dragState?.scalarSpace === 'input' ? 'input' : 'output';
    const mode = viewKeyForMatrix(dragState?.startMatrix ?? currentMatrixRef.current);
    const inputVector =
      scalarSpace === 'input'
        ? solveVectorInputForWorld(dragState?.startMatrix ?? currentMatrixRef.current, worldVector, mode, { snap: false })
        : null;
    const scalarValue = scalarSpace === 'input'
      ? normal.dot(inputVector)
      : normal.dot(worldVector);
    if (!Number.isFinite(scalarValue)) return worldVector;
    const anchorInput = normal.clone().multiplyScalar(scalarValue / normal.lengthSq());
    const anchor = scalarSpace === 'input'
      ? new THREE.Vector3(...transformVector3(dragState?.startMatrix ?? currentMatrixRef.current, [anchorInput.x, anchorInput.y, anchorInput.z]))
      : anchorInput;
    if (!isFiniteVector3(anchor)) return worldVector;
    setVectors((previous) =>
      previous.map((item) =>
        item.id === vectorId ? { ...item, scalar: formatInputValue(scalarValue), scalarEnabled: true } : item
      )
    );
    return anchor;
  }, []);

  useEffect(() => {
    dragActionsRef.current = {
      commitBasisDrag,
      updateBasisVectorFromDrag,
      updateScalarConstraintFromDrag,
      updateUserVectorFromDrag,
    };
  }, [commitBasisDrag, updateBasisVectorFromDrag, updateScalarConstraintFromDrag, updateUserVectorFromDrag]);

  const controlLocksFromRefs = useCallback(() => ({
    camera: cameraLockedRef.current,
    zoom: zoomLockedRef.current,
  }), []);

  useEffect(() => {
    const strip = historyStripRef.current;
    if (!strip) return;
    const item = strip.querySelector(`[data-history-index="${activeHistoryIndex}"]`);
    item?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, [activeHistoryIndex, history.length]);

  useEffect(() => {
    if (!activeMatrixPresetId) return;
    matrixPresetRefs.current[activeMatrixPresetId]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, [activeMatrixPresetId]);

  const setCameraAtProgress = useCallback((rawProgress) => {
    const refs = threeRef.current;
    if (!refs) return;

    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      refs.controls.update();
      return;
    }
    if (workspaceModeRef.current === 'system') {
      refs.controls.update();
      return;
    }

    cameraMoveRef.current.active = false;
    const clamped = Math.max(0, Math.min(1, rawProgress));
    const eased = easeInOut(clamped);
    const fromKey = animationViewFromRef.current;
    const toKey = animationViewToRef.current;
    const target = refs.controls.target.clone();
    const distance = Math.max(refs.camera.position.distanceTo(refs.controls.target), EPSILON);
    const direction = viewDirectionForKey(fromKey).lerp(viewDirectionForKey(toKey), eased);
    if (direction.lengthSq() < EPSILON) direction.copy(viewDirectionForKey(toKey));
    direction.normalize();
    refs.controls.target.copy(target);
    refs.camera.position.copy(target).addScaledVector(direction, distance);
    if (clamped <= 0.001) configureControlsForView(refs.controls, fromKey, controlLocksFromRefs());
    if (clamped >= 0.999) configureControlsForView(refs.controls, toKey, controlLocksFromRefs());
    refs.controls.update();

    const nextActiveView = clamped <= 0.001 ? fromKey : clamped >= 0.999 ? toKey : null;
    setActiveView((previous) => (previous === nextActiveView ? previous : nextActiveView));
  }, []);

  const setMatrixAtProgress = useCallback((rawProgress) => {
    const clamped = Math.max(0, Math.min(1, rawProgress));
    const eased = easeInOut(clamped);

    for (let i = 0; i < 9; i += 1) {
      currentMatrixRef.current[i] =
        startMatrixRef.current[i] +
        eased * (targetMatrixRef.current[i] - startMatrixRef.current[i]);
    }

    if (clamped >= 1) {
      currentMatrixRef.current = [...targetMatrixRef.current];
    }

    setProgress(clamped);
    setDisplayMatrix([...currentMatrixRef.current]);
    setBasisControlMatrix([...currentMatrixRef.current]);
    setCameraAtProgress(clamped);
  }, [setCameraAtProgress]);

  const stopAutoAnimation = useCallback(() => {
    isAnimatingRef.current = false;
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
  }, [setMatrixAtProgress]);

  const scrubToClientX = useCallback((clientX) => {
    const track = scrubTrackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const rawProgress = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    setMatrixAtProgress(rawProgress);
  }, [setMatrixAtProgress]);

  const handleProgressPointerDown = useCallback((event) => {
    event.preventDefault();
    stopAutoAnimation();
    scrubToClientX(event.clientX);

    const handlePointerMove = (moveEvent) => {
      scrubToClientX(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [scrubToClientX, stopAutoAnimation]);

  const handleProgressKeyDown = useCallback((event) => {
    const keySteps = {
      ArrowLeft: -0.02,
      ArrowDown: -0.02,
      ArrowRight: 0.02,
      ArrowUp: 0.02,
    };

    if (event.key === 'Home') {
      event.preventDefault();
      stopAutoAnimation();
      setMatrixAtProgress(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      stopAutoAnimation();
      setMatrixAtProgress(1);
      return;
    }

    if (event.key in keySteps) {
      event.preventDefault();
      stopAutoAnimation();
      setMatrixAtProgress(progress + keySteps[event.key]);
    }
  }, [progress, setMatrixAtProgress, stopAutoAnimation]);

  const updateLabel = useCallback((labelRef, vector3, text, visible = true, offset = [0, -16], options = {}) => {
    const refs = threeRef.current;
    const label = labelRef?.current ?? labelRef;
    const allowOrigin = options.allowOrigin ?? false;
    if (!refs || !label || !visible || !isFiniteVector3(vector3) || (!allowOrigin && vector3.length() < EPSILON)) {
      if (label) label.style.display = 'none';
      return;
    }

    const projected = vector3.clone().project(refs.camera);
    if (projected.z > 1 || projected.z < -1) {
      label.style.display = 'none';
      return;
    }

    const width = refs.renderer.domElement.clientWidth;
    const height = refs.renderer.domElement.clientHeight;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (projected.y * -0.5 + 0.5) * height;
    const labelX = x + offset[0];
    const labelY = y + offset[1];
    if (!Number.isFinite(labelX) || !Number.isFinite(labelY)) {
      label.style.display = 'none';
      return;
    }
    setAxisLabelText(label, text);
    label.dataset.labelX = String(labelX);
    label.dataset.labelY = String(labelY);
    label.style.display = 'block';
    label.style.transform =
      `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`;
  }, []);

  const queueCameraShareUpdate = useCallback((delay = 180) => {
    if (typeof window === 'undefined') return;
    if (cameraShareTimerRef.current) {
      window.clearTimeout(cameraShareTimerRef.current);
    }
    cameraShareTimerRef.current = window.setTimeout(() => {
      cameraShareTimerRef.current = null;
      const next = cameraShareStateFromRefs(threeRef.current);
      if (!next) return;
      setCameraState((previous) => (cameraStatesAlmostEqual(previous, next) ? previous : next));
      if (delay <= 0) patchCameraStateInUrl(next, locale);
    }, delay);
  }, [locale]);

  const snapCameraToAutoView = useCallback(() => {
    if (!cameraAutoRef.current || cameraLockedRef.current) return false;
    const refs = threeRef.current;
    const viewKey = autoCameraTargetViewRef.current;
    if (!refs || !viewPresets[viewKey]) return false;

    const destination = cameraStateForView(viewKey, refs.camera.position, refs.controls.target);
    setActiveView(viewKey);
    setCameraState({
      position: cameraVectorToShareArray(destination.position),
      target: cameraVectorToShareArray(destination.target),
    });
    configureControlsForView(refs.controls, viewKey, controlLocksFromRefs());
    cameraMoveRef.current = {
      active: true,
      startTime: null,
      positionFrom: refs.camera.position.clone(),
      targetFrom: refs.controls.target.clone(),
      positionTo: destination.position,
      targetTo: destination.target,
    };
    return true;
  }, [controlLocksFromRefs]);

  const animate = useCallback((time) => {
    frameIdRef.current = requestAnimationFrame(animate);
    const refs = threeRef.current;
    if (!refs) return;

    const cameraMove = cameraMoveRef.current;
    if (cameraMove.active) {
      if (cameraLockedRef.current) {
        cameraMove.active = false;
      } else {
        if (cameraMove.startTime === null) cameraMove.startTime = time;
        const raw = Math.min((time - cameraMove.startTime) / CAMERA_MOVE_MS, 1);
        const eased = easeInOut(raw);
        refs.camera.position.lerpVectors(cameraMove.positionFrom, cameraMove.positionTo, eased);
        refs.controls.target.lerpVectors(cameraMove.targetFrom, cameraMove.targetTo, eased);
        if (raw >= 1) {
          cameraMove.active = false;
        }
      }
    }

    refs.controls.update();

    if (isAnimatingRef.current) {
      if (animationStartRef.current === null) animationStartRef.current = time;

      const raw = Math.min((time - animationStartRef.current) / ANIMATION_MS, 1);
      const eased = easeInOut(raw);

      for (let i = 0; i < 9; i += 1) {
        currentMatrixRef.current[i] =
          startMatrixRef.current[i] +
          eased * (targetMatrixRef.current[i] - startMatrixRef.current[i]);
      }

      if (raw >= 1) {
        isAnimatingRef.current = false;
        currentMatrixRef.current = [...targetMatrixRef.current];
      }

      if (raw >= 1 || time - lastUiSyncRef.current > UI_SYNC_MS) {
        lastUiSyncRef.current = time;
        setProgress(raw >= 1 ? 1 : raw);
        setDisplayMatrix([...currentMatrixRef.current]);
      }
    }

    const matrix = currentMatrixRef.current;
    const coordMode = viewKeyForMatrix(matrix);
    const isSystemMode = workspaceModeRef.current === 'system' || vectorToolModeRef.current === 'system';
    const vectorSceneAllowed = !isSystemMode || notebookHasVisualVectorsRef.current;
    const vectorMatrix =
      isSystemMode && notebookHasVisualVectorsRef.current
        ? notebookVectorTransformRef.current
        : matrix;
    const isSystem3D = isSystemMode && systemDimensionRef.current === '3d';
    const kAxisBlend = clamp01(new THREE.Vector3(matrix[2], matrix[5], matrix[8]).length());
    const flatBlend = 1 - kAxisBlend;
    const matrix4 = toMatrix4(matrix);
    refs.dynamicGrid.matrix.copy(matrix4);
    refs.dynamicPlaneGrid.matrix.copy(matrix4);
    refs.boxMesh.matrix.copy(matrix4);
    refs.boxEdges.matrix.copy(matrix4);
    refs.areaMesh.matrix.copy(matrix4);
    refs.areaEdges.matrix.copy(matrix4);

    const currentDet = determinant3(matrix);
    const detMagnitude = Math.abs(currentDet);
    const volumeColor =
      detMagnitude < EPSILON
        ? 0x9ca3af
        : currentDet < 0
          ? 0xe05263
          : 0xf1b434;
    const volumeOpacity = Math.min(0.34, Math.max(0, (detMagnitude - 0.035) * 1.8));
    const iVector = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
    const jVector = new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
    const areaMagnitude = iVector.clone().cross(jVector).length();
    const heightRatio = areaMagnitude > EPSILON ? detMagnitude / areaMagnitude : 0;
    const areaBlend = Math.max(0, Math.min(1, (0.42 - heightRatio) / 0.42));
    const areaOpacity = Math.min(0.34, Math.max(0.14, areaMagnitude * 0.16)) * areaBlend;
    const showVolumeShape = uiStateRef.current.showVolume && !isSystemMode;
    const volumeVisible = showVolumeShape && volumeOpacity > 0.005;
    const areaVisible = showVolumeShape && areaMagnitude > EPSILON && areaOpacity > 0.005;

    refs.boxMaterial.color.setHex(volumeColor);
    refs.edgeMaterial.color.setHex(volumeColor);
    refs.boxMaterial.opacity = volumeOpacity;
    refs.edgeMaterial.opacity = Math.min(0.85, volumeOpacity * 2.4);
    refs.boxMesh.visible = volumeVisible;
    refs.boxEdges.visible = volumeVisible;
    refs.areaMaterial.opacity = areaOpacity;
    refs.areaEdgeMaterial.opacity = Math.min(0.86, areaOpacity * 2.5);
    refs.areaMesh.visible = areaVisible;
    refs.areaEdges.visible = areaVisible;
    const showBaseGrid = uiStateRef.current.showGrid;
    const showRelativeGrid = uiStateRef.current.showRelativeGrid;
    const relativeGridStrength = normalizeRelativeGridStrength(uiStateRef.current.relativeGridStrength);
    const showStaticGrid = showBaseGrid && ((!isSystemMode && (coordMode === '3d' || kAxisBlend > 0.04)) || isSystem3D);
    const showReferenceGrid =
      showBaseGrid &&
      ((!isSystemMode && (coordMode !== '3d' || flatBlend > 0.02)) || (isSystemMode && !isSystem3D));
    const relativeGridMode = coordMode === '3d' || (isSystemMode && isSystem3D) ? '3d' : 'plane';
    const showDynamicGrid3D =
      showRelativeGrid &&
      relativeGridMode === '3d' &&
      (isSystemMode || kAxisBlend > 0.04);
    const showDynamicGrid2D =
      showRelativeGrid &&
      relativeGridMode === 'plane' &&
      (iVector.lengthSq() > EPSILON || jVector.lengthSq() > EPSILON);
    refs.staticGrid.visible = showStaticGrid;
    refs.referenceGrid.visible = showReferenceGrid;
    refs.axesHelper.visible = uiStateRef.current.showAxes;
    refs.dynamicGrid.visible = showDynamicGrid3D;
    refs.dynamicPlaneGrid.visible = showDynamicGrid2D;
    setMaterialOpacity(refs.staticGrid.material, isSystem3D ? 0.22 : 0.07 + kAxisBlend * 0.14);
    refs.referenceGrid.material.color.setHex(isSystemMode ? 0x6b7280 : 0x22c1b6);
    refs.dynamicGrid.material.color.setHex(isSystemMode ? 0x22d3c6 : 0x22c1b6);
    refs.dynamicPlaneGrid.material.color.setHex(isSystemMode ? 0x22d3c6 : 0x22c1b6);
    refs.referenceGrid.material.opacity = isSystemMode ? 0.18 : Math.max(0.04, flatBlend * 0.14);
    refs.dynamicGrid.material.opacity =
      (isSystemMode ? 0.46 : 0.06 + kAxisBlend * 0.22) * relativeGridStrength;
    refs.dynamicPlaneGrid.material.opacity =
      (isSystemMode ? 0.58 : coordMode === '2d' ? 0.38 : 0.24) * relativeGridStrength;
    refs.equationGroup.visible = isSystemMode;
    if (isSystemMode) {
      refs.equationGroup.matrix.copy(matrix4);
    } else {
      refs.equationGroup.matrix.identity();
    }
    refs.equationGroup.matrixWorldNeedsUpdate = true;
    refs.equationPoint.visible = isSystemMode && refs.equationPoint.userData.visible;
    if (refs.equationPoint.visible && refs.equationPoint.userData.inputPoint) {
      const transformedPoint = transformVector3(matrix, refs.equationPoint.userData.inputPoint);
      refs.equationPoint.position.set(transformedPoint[0], transformedPoint[1], transformedPoint[2]);
    }

    const equationSpawnTimes = refs.equationSpawnTimes ?? new Map();
    refs.equationSpawnTimes = equationSpawnTimes;
    const activeEquationRevealKeys = new Set();
    if (isSystemMode) {
      refs.equationGroup.traverse((object) => {
        const revealKey = object.userData?.revealKey;
        if (!revealKey) return;
        activeEquationRevealKeys.add(revealKey);
        if (!equationSpawnTimes.has(revealKey)) equationSpawnTimes.set(revealKey, time);
        setObjectRevealOpacity(object, (time - (equationSpawnTimes.get(revealKey) ?? time)) / VECTOR_SPAWN_MS);
      });
      const pointRevealKey = refs.equationPoint.userData.revealKey;
      if (refs.equationPoint.visible && pointRevealKey) {
        activeEquationRevealKeys.add(pointRevealKey);
        if (!equationSpawnTimes.has(pointRevealKey)) equationSpawnTimes.set(pointRevealKey, time);
        setObjectRevealOpacity(
          refs.equationPoint,
          (time - (equationSpawnTimes.get(pointRevealKey) ?? time)) / VECTOR_SPAWN_MS
        );
      }
    }
    equationSpawnTimes.forEach((_, revealKey) => {
      if (!activeEquationRevealKeys.has(revealKey)) equationSpawnTimes.delete(revealKey);
    });

    const basisVisible = uiStateRef.current.showRelativeAxes;
    const basisVisibility = uiStateRef.current.basisVisibility ?? { i: true, j: true, k: true };
    const basisLengthByKey = {
      i: Math.hypot(matrix[0], matrix[3], matrix[6]),
      j: Math.hypot(matrix[1], matrix[4], matrix[7]),
      k: Math.hypot(matrix[2], matrix[5], matrix[8]),
    };
    const basisVisibleByKey = {
      i: basisVisible && basisVisibility.i !== false && basisLengthByKey.i > EPSILON,
      j: basisVisible && basisVisibility.j !== false && basisLengthByKey.j > EPSILON,
      k: basisVisible && basisVisibility.k !== false && basisLengthByKey.k > EPSILON,
    };
    setArrowVector(refs.iArrow, matrix[0], matrix[3], matrix[6], basisVisibleByKey.i);
    setArrowVector(refs.jArrow, matrix[1], matrix[4], matrix[7], basisVisibleByKey.j);
    setArrowVector(refs.kArrow, matrix[2], matrix[5], matrix[8], basisVisibleByKey.k);

    const activeDragKey = arrowDragRef.current.active ? arrowDragRef.current.key : null;
    const activeDragVectorId = vectorIdFromDragKey(activeDragKey) ?? scalarIdFromDragKey(activeDragKey);
    const renderedVectorValues = new Map();
    const vectorRenderValues = vectorRenderValuesRef.current;
    vectorsRef.current.forEach((vectorItem) => {
      const targetValues = vectorItem.values;
      const previousValues = vectorRenderValues.get(vectorItem.id) ?? targetValues;
      const shouldSnap = activeDragVectorId === vectorItem.id || vectorItem.scalarEnabled;
      const nextValues = shouldSnap
        ? [...targetValues]
        : previousValues.map((value, index) => {
            const target = targetValues[index];
            const nextValue = value + (target - value) * 0.22;
            return Math.abs(nextValue - target) < 0.002 ? target : nextValue;
          });
      vectorRenderValues.set(vectorItem.id, nextValues);
      renderedVectorValues.set(vectorItem.id, nextValues);
    });
    vectorRenderValues.forEach((_, id) => {
      if (!vectorsRef.current.some((item) => item.id === id)) {
        vectorRenderValues.delete(id);
      }
    });

    const vectorSpawnTimes = refs.vectorSpawnTimes ?? new Map();
    refs.vectorSpawnTimes = vectorSpawnTimes;
    const liveVectorIds = new Set(vectorsRef.current.map((item) => item.id));
    vectorsRef.current.forEach((item) => {
      if (!vectorSpawnTimes.has(item.id)) vectorSpawnTimes.set(item.id, time);
    });
    vectorSpawnTimes.forEach((_, id) => {
      if (!liveVectorIds.has(id)) vectorSpawnTimes.delete(id);
    });
    const vectorSpawnEase = (id) =>
      easeOutCubic((time - (vectorSpawnTimes.get(id) ?? time)) / VECTOR_SPAWN_MS);

    const scalarSpawnTimes = refs.scalarSpawnTimes ?? new Map();
    refs.scalarSpawnTimes = scalarSpawnTimes;
    const liveScalarIds = new Set(
      vectorsRef.current
        .filter((item) => item.visible !== false && item.scalarEnabled)
        .map((item) => item.id)
    );
    liveScalarIds.forEach((id) => {
      if (!scalarSpawnTimes.has(id)) scalarSpawnTimes.set(id, time);
    });
    scalarSpawnTimes.forEach((_, id) => {
      if (!liveScalarIds.has(id)) scalarSpawnTimes.delete(id);
    });
    const scalarSpawnEase = (id) =>
      easeOutCubic((time - (scalarSpawnTimes.get(id) ?? time)) / VECTOR_SPAWN_MS);

    let frameScalarSolution = null;
    if (refs.vectorScalarGroup) {
      clearEquationGroup(refs.vectorScalarGroup);
      const scalarGroupVisible = vectorSceneAllowed && uiStateRef.current.showVector;
      refs.vectorScalarGroup.visible = scalarGroupVisible;
      if (scalarGroupVisible) {
        const scalarConstraints = vectorsRef.current
          .filter((item) => item.visible !== false && item.scalarEnabled)
          .map((item) => {
            const values = renderedVectorValues.get(item.id) ?? item.values;
            const transformed = transformVector3(vectorMatrix, values);
            const scalarSpace = item.scalarSpace === 'input' ? 'input' : 'output';
            const normal = scalarSpace === 'input' ? values : transformed;
            const lengthSquared = dotValues(normal, normal);
            return {
              color: item.color,
              lengthSquared,
              normal,
              spawnEase: scalarSpawnEase(item.id),
              scalar: hasScalarText(item.scalar) ? parseNumber(item.scalar) : lengthSquared,
              scalarSpace,
            };
          })
          .filter((constraint) =>
            constraint.lengthSquared > EPSILON &&
            Number.isFinite(constraint.scalar) &&
            constraint.normal.every(Number.isFinite)
          );

        const rawScalarSolution = solveScalarConstraintPoint(scalarConstraints, coordMode);
        frameScalarSolution =
          rawScalarSolution && scalarConstraints.every((constraint) => constraint.scalarSpace === 'input')
            ? transformVector3(vectorMatrix, rawScalarSolution)
            : rawScalarSolution;
        scalarConstraints.forEach((constraint) => {
          if (coordMode === '1d') {
            if (Math.abs(constraint.normal[0]) < EPSILON) return;
            const anchorInput = new THREE.Vector3(constraint.scalar / constraint.normal[0], 0, 0);
            const anchor =
              constraint.scalarSpace === 'input'
                ? transformedPointForMatrix(vectorMatrix, anchorInput)
                : anchorInput;
            createScalarPointObjects(anchor, constraint.color).forEach((object) => {
              scaleObjectOpacity(object, constraint.spawnEase);
              refs.vectorScalarGroup.add(object);
            });
            return;
          }

          if (coordMode === '2d') {
            const line = {
              a: constraint.normal[0],
              b: constraint.normal[1],
              value: constraint.scalar,
              color: constraint.color,
            };
            const objects =
              constraint.scalarSpace === 'input'
                ? createTransformedLineObjects(line, vectorMatrix, SCALAR_CONSTRAINT_LINE_RANGE)
                : createLineObjects(line, SCALAR_CONSTRAINT_LINE_RANGE);
            objects.forEach((object) => {
              scaleObjectOpacity(object, constraint.spawnEase);
              refs.vectorScalarGroup.add(object);
            });
            return;
          }

          const plane = {
            a: constraint.normal[0],
            b: constraint.normal[1],
            c: constraint.normal[2],
            value: constraint.scalar,
            color: constraint.color,
          };
          const objects =
            constraint.scalarSpace === 'input'
              ? createTransformedPlaneObjects(plane, vectorMatrix, 5.8, scalarConstraints.length > 1)
              : createPlaneObjects(plane, 5.8, scalarConstraints.length > 1);
          objects.forEach((object) => {
            scaleObjectOpacity(object, constraint.spawnEase);
            refs.vectorScalarGroup.add(object);
          });
        });
      }
    }

    const activeVectorItem = vectorsRef.current.find(
      (item) => item.id === activeVectorIdRef.current && item.visible !== false && !item.scalarEnabled
    );
    const activeVectorWorld = activeVectorItem
      ? new THREE.Vector3(...transformVector3(vectorMatrix, renderedVectorValues.get(activeVectorItem.id) ?? activeVectorItem.values))
      : null;
    refs.userArrow.visible = false;
    refs.dotLine.visible = false;
    refs.dotPoint.visible = false;

    const coordinatesVisible = uiStateRef.current.showCoordinateNumbers;
    const labelsVisible = true;
    const vectorLabelsVisible = true;
    const frameLineSystem = lineSystemRef.current;
    const frameEquationSolution = frameLineSystem?.solution;
    const equationSolutionInputPoint = refs.equationPoint.userData.inputPoint;
    const equationSolutionPoint = refs.equationPoint.userData.solutionPoint ?? equationSolutionInputPoint;
    const equationSolutionMode = refs.equationPoint.userData.mode ?? systemDimensionRef.current;
    let equationSolutionWorld =
      refs.equationPoint.visible && equationSolutionInputPoint
        ? new THREE.Vector3(...transformVector3(matrix, equationSolutionInputPoint))
        : new THREE.Vector3();
    let equationSolutionText = equationSolutionPoint
      ? `${t(locale, 'solution')} x = ${formatCoord(equationSolutionPoint, equationSolutionMode)}`
      : '';
    let equationSolutionVisible = refs.equationPoint.visible && labelsVisible;

    if (!equationSolutionVisible && isSystemMode && frameEquationSolution?.status === 'infinite') {
      const anchor = solutionLabelAnchor(frameEquationSolution);
      const labelKindKey = solutionGeometryLabelKey(frameEquationSolution);
      if (anchor && labelKindKey) {
        equationSolutionWorld = new THREE.Vector3(...transformVector3(matrix, anchor));
        equationSolutionText = coordinatesVisible
          ? `${t(locale, 'solution')} ${t(locale, labelKindKey)} ${formatGeneralSolution(frameEquationSolution)}`
          : `${t(locale, 'solution')} ${t(locale, labelKindKey)}`;
        equationSolutionVisible = true;
      }
    }

    updateLabel(
      equationSolutionLabelRef,
      equationSolutionWorld,
      equationSolutionText,
      equationSolutionVisible && labelsVisible,
      [38, -20],
      { allowOrigin: true }
    );

    const equationLabels = isSystemMode
      ? (frameLineSystem?.mode === '3d'
          ? frameLineSystem?.planes ?? []
          : frameLineSystem?.lines ?? [])
      : [];
    const equationLabelMode = frameLineSystem?.mode === '3d' ? '3d' : '2d';
    const activeEquationLabelKeys = new Set();
    equationLabels.forEach((item, index) => {
      const key = equationSceneLabelKey(item, equationLabelMode, index);
      const labelNode = equationLabelRefs.current.get(key);
      if (!labelNode) return;
      const anchor = equationAnchorPoint(item, equationLabelMode);
      activeEquationLabelKeys.add(key);
      if (!anchor) {
        labelNode.style.display = 'none';
        return;
      }
      const [x, y, z] = transformVector3(matrix, [anchor.x, anchor.y, anchor.z]);
      const revealKey = equationRevealKey(item, equationLabelMode, index);
      const revealStart = equationSpawnTimes.get(revealKey);
      const revealEase = revealStart ? easeOutCubic((time - revealStart) / VECTOR_SPAWN_MS) : 1;
      updateLabel(
        labelNode,
        new THREE.Vector3(x, y, z),
        equationSceneLabelText(item, equationLabelMode, index, coordinatesVisible),
        labelsVisible,
        equationLabelMode === '3d'
          ? [34, -22 - (index % 3) * 12]
          : [28, -20 - (index % 3) * 10],
        { allowOrigin: true, keepNameWhenCoordinatesHidden: true }
      );
      labelNode.style.opacity = String(0.18 + revealEase * 0.82);
    });
    equationLabelRefs.current.forEach((labelNode, key) => {
      if (activeEquationLabelKeys.has(key)) return;
      labelNode.style.display = 'none';
      labelNode.style.opacity = '1';
    });

    const dragHandles = refs.dragHandles ?? {};
    const handleTargets = {
      i: new THREE.Vector3(matrix[0], matrix[3], matrix[6]),
      j: new THREE.Vector3(matrix[1], matrix[4], matrix[7]),
      k: new THREE.Vector3(matrix[2], matrix[5], matrix[8]),
    };
    const visibleMeasureVectors = vectorsRef.current
      .filter((item) => item.visible !== false && !item.scalarEnabled)
      .slice(0, 3)
      .map((item) => {
        const values = renderedVectorValues.get(item.id) ?? item.values;
        return {
          ...item,
          world: new THREE.Vector3(...transformVector3(vectorMatrix, values)),
        };
      });
    const vectorMeasureVisible = false && visibleMeasureVectors.length >= 2;
    let vectorMeasureLabelPosition = new THREE.Vector3();
    let vectorMeasureLabel = '';
    refs.vectorAreaMesh.visible = false;
    refs.vectorAreaEdges.visible = false;
    refs.vectorVolumeMesh.visible = false;
    refs.vectorVolumeEdges.visible = false;
    if (vectorMeasureVisible) {
      const [first, second, third] = visibleMeasureVectors;
      const a = first.world;
      const b = second.world;
      const areaValue = a.clone().cross(b).length();
      if (third) {
        const c = third.world;
        const volumeValue = Math.abs(a.clone().cross(b).dot(c));
        updateVolumeGeometry(refs.vectorVolumeMesh.geometry, refs.vectorVolumeEdges.geometry, a, b, c);
        refs.vectorVolumeMaterial.opacity = Math.min(0.3, Math.max(0.08, volumeValue * 0.035));
        refs.vectorVolumeEdgeMaterial.opacity = 0.86;
        refs.vectorVolumeMesh.visible = true;
        refs.vectorVolumeEdges.visible = true;
        vectorMeasureLabelPosition = a.clone().add(b).add(c).multiplyScalar(0.5);
        vectorMeasureLabel = `${t(locale, 'volume')} A${first.name},A${second.name},A${third.name} = ${formatNumber(volumeValue)}`;
      } else {
        updateAreaGeometry(refs.vectorAreaMesh.geometry, refs.vectorAreaEdges.geometry, a, b);
        refs.vectorAreaMaterial.opacity = Math.min(0.28, Math.max(0.08, areaValue * 0.045));
        refs.vectorAreaEdgeMaterial.opacity = 0.84;
        refs.vectorAreaMesh.visible = true;
        refs.vectorAreaEdges.visible = true;
        vectorMeasureLabelPosition = a.clone().add(b).multiplyScalar(0.5);
        vectorMeasureLabel = `${t(locale, 'area')} A${first.name},A${second.name} = ${formatNumber(areaValue)}`;
      }
    }
    updateLabel(
      vectorVolumeLabelRef,
      vectorMeasureLabelPosition,
      vectorMeasureLabel,
      vectorMeasureVisible && labelsVisible,
      [0, -24],
      { allowOrigin: true }
    );

    const activeMeasurementLabels = new Set();
    const activeMeasurementVisuals = new Set();
    const measurementSpawnTimes = refs.measurementSpawnTimes ?? new Map();
    refs.measurementSpawnTimes = measurementSpawnTimes;
    const measurementRevealEase = (id) => {
      if (!measurementSpawnTimes.has(id)) measurementSpawnTimes.set(id, time);
      return easeOutCubic((time - (measurementSpawnTimes.get(id) ?? time)) / VECTOR_SPAWN_MS);
    };
    refs.measurementVisuals?.forEach((visual) => {
      visual.group.visible = false;
    });
    const getMeasureTargetName = (targetId) => {
      if (targetId === 'b:i') return 'i′';
      if (targetId === 'b:j') return 'j′';
      if (targetId === 'b:k') return 'k′';
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      return vectorsRef.current.find((item) => item.id === vectorId)?.name ?? vectorId ?? '';
    };
    const getMeasureTargetColor = (targetId) => {
      if (targetId === 'b:i') return '#ff6575';
      if (targetId === 'b:j') return '#41cf76';
      if (targetId === 'b:k') return '#78a5ff';
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      const vectorItem = vectorsRef.current.find((item) => item.id === vectorId);
      return vectorItem ? colorToHex(vectorItem.color) : undefined;
    };
    const measureTargetToken = (targetId) => ({
      text: getMeasureTargetName(targetId),
      color: getMeasureTargetColor(targetId),
      className: 'measurement-target-token',
    });
    const joinMeasureTargetTokens = (targetIds) => targetIds.flatMap((targetId, index) => (
      index === 0
        ? [measureTargetToken(targetId)]
        : [{ text: ' · ', className: 'measurement-operator' }, measureTargetToken(targetId)]
    ));
    const getMeasureTargetWorld = (targetId) => {
      if (targetId === 'b:i') {
        if (!uiStateRef.current.showRelativeAxes || uiStateRef.current.basisVisibility?.i === false) return null;
        const vector = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
        return vector.lengthSq() > EPSILON ? vector : null;
      }
      if (targetId === 'b:j') {
        if (!uiStateRef.current.showRelativeAxes || uiStateRef.current.basisVisibility?.j === false) return null;
        const vector = new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
        return vector.lengthSq() > EPSILON ? vector : null;
      }
      if (targetId === 'b:k') {
        if (!uiStateRef.current.showRelativeAxes || uiStateRef.current.basisVisibility?.k === false) return null;
        const vector = new THREE.Vector3(matrix[2], matrix[5], matrix[8]);
        return vector.lengthSq() > EPSILON ? vector : null;
      }
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      const vectorItem = vectorsRef.current.find((item) => item.id === vectorId);
      if (!vectorItem || vectorItem.visible === false || vectorItem.scalarEnabled || !uiStateRef.current.showVector) return null;
      const values = renderedVectorValues.get(vectorItem.id) ?? vectorItem.values;
      return new THREE.Vector3(...transformVector3(vectorMatrix, values));
    };

    measurementsRef.current
      .filter((item) => item.visible !== false)
      .forEach((item, index) => {
          const targetEntries = item.targets
            .map((targetId) => ({ id: targetId, vector: getMeasureTargetWorld(targetId) }))
            .filter((entry) => entry.vector);
          const targets = targetEntries.map((entry) => entry.vector);
          const visibleTargetIds = targetEntries.map((entry) => entry.id);
          if (item.type === 'dot' && targets.length >= 2) {
            const [secondary, primary] = targets;
            const visual = getMeasurementVisual(refs, item, 'dot');
            activeMeasurementVisuals.add(item.id);
            const revealEase = measurementRevealEase(item.id);
            const dotValue = primary.dot(secondary);
            const projection = primary.lengthSq() > EPSILON
              ? primary.clone().multiplyScalar(dotValue / primary.lengthSq())
              : new THREE.Vector3();
            setGeometryPositions(visual.mainLine.geometry, [
              primary.x, primary.y, primary.z, secondary.x, secondary.y, secondary.z,
            ]);
            setGeometryPositions(visual.guideLine.geometry, [
              projection.x, projection.y, projection.z, secondary.x, secondary.y, secondary.z,
            ]);
            visual.mainLine.renderOrder = 19 + index;
            visual.mainLine.material.opacity = 0.96 * revealEase;
            visual.guideLine.computeLineDistances();
            visual.guideLine.renderOrder = 18 + index;
            visual.guideLine.material.opacity = 0.32 * revealEase;
            visual.point.position.copy(projection);
            visual.point.renderOrder = 19 + index;
            visual.point.material.opacity = revealEase;
            const labelPosition = primary.clone().lerp(secondary, 0.46).lerp(projection, 0.18);
            activeMeasurementLabels.add(item.id);
            const labelNode = measurementLabelRefs.current.get(item.id);
            updateLabel(
              labelNode,
              labelPosition,
              [
                { text: 'Σ ', className: 'measurement-symbol' },
                measureTargetToken(visibleTargetIds[1]),
                { text: ' · ', className: 'measurement-operator' },
                measureTargetToken(visibleTargetIds[0]),
                { text: ` = ${formatNumber(dotValue)}`, className: 'measurement-value-token' },
              ],
              labelsVisible,
              [0, -30 - (index % 3) * 10],
              { allowOrigin: true }
            );
            if (labelNode) labelNode.style.opacity = String(0.18 + revealEase * 0.82);
          }
          if (item.type === 'volume' && targets.length >= 1) {
            const targetCount = effectiveVolumeTargetCount(targets.length, coordMode);
            const measureTargets = targets.slice(0, targetCount);
            const measureTargetIds = visibleTargetIds.slice(0, targetCount);
            const [a, b, c] = measureTargets;
            const visual = getMeasurementVisual(refs, item, 'volume');
            activeMeasurementVisuals.add(item.id);
            const revealEase = measurementRevealEase(item.id);
            const isVolume3D = targetCount >= 3;
            const isArea2D = targetCount === 2;
            if (isVolume3D) {
              updateVolumeGeometry(visual.mesh.geometry, visual.edges.geometry, a, b, c);
            } else if (isArea2D) {
              updateAreaGeometry(visual.mesh.geometry, visual.edges.geometry, a, b);
            } else {
              updateLengthGeometry(visual.mesh.geometry, visual.edges.geometry, a);
            }
            visual.mesh.visible = isArea2D || isVolume3D;
            visual.edges.visible = true;
            visual.mesh.material.color.setHex(isVolume3D ? MEASURE_VOLUME_HEX : MEASURE_AREA_HEX);
            visual.mesh.material.opacity = (isVolume3D ? 0.23 : 0.2) * revealEase;
            visual.mesh.renderOrder = 16 + index;
            visual.edges.material.color.setHex(
              isVolume3D ? MEASURE_VOLUME_EDGE_HEX : isArea2D ? MEASURE_AREA_EDGE_HEX : MEASURE_LENGTH_HEX
            );
            visual.edges.material.opacity = 0.86 * revealEase;
            visual.edges.renderOrder = 17 + index;
            const value = isVolume3D
              ? Math.abs(a.clone().cross(b).dot(c))
              : isArea2D
                ? a.clone().cross(b).length()
                : a.length();
            const labelPosition = (targetCount === 1
              ? a.clone().multiplyScalar(0.5)
              : measureTargets
              .reduce((sum, vector) => sum.add(vector), new THREE.Vector3())
              .multiplyScalar(1 / measureTargets.length));
            const labelPrefix = t(locale, isVolume3D ? 'volume' : isArea2D ? 'area' : 'length');
            activeMeasurementLabels.add(item.id);
            const labelNode = measurementLabelRefs.current.get(item.id);
            updateLabel(
              labelNode,
              labelPosition,
              [
                { text: `${labelPrefix} `, className: 'measurement-symbol' },
                ...joinMeasureTargetTokens(measureTargetIds),
                { text: ` = ${formatNumber(value)}`, className: 'measurement-value-token' },
              ],
              labelsVisible,
              [0, -32 - (index % 3) * 10],
              { allowOrigin: true }
            );
            if (labelNode) labelNode.style.opacity = String(0.18 + revealEase * 0.82);
          }
      });
    refs.measurementVisuals?.forEach((visual, id) => {
      if (!activeMeasurementVisuals.has(id)) {
        disposeMeasurementVisual(visual);
        refs.measurementVisuals.delete(id);
      }
    });
    measurementSpawnTimes.forEach((_, id) => {
      if (!activeMeasurementVisuals.has(id)) measurementSpawnTimes.delete(id);
    });
    measurementLabelRefs.current.forEach((label, id) => {
      if (!activeMeasurementLabels.has(id)) {
        label.style.display = 'none';
        label.style.opacity = '1';
      }
    });

    const activeVectorKeys = new Set();
    const vectorVisuals = refs.vectorVisuals ?? new Map();
    vectorsRef.current.forEach((vectorItem, vectorRenderIndex) => {
      activeVectorKeys.add(vectorItem.id);
      let visual = vectorVisuals.get(vectorItem.id);
      if (!visual) {
        visual = createVectorVisual(refs.scene, refs.dragHandleGeometry, vectorItem);
        vectorVisuals.set(vectorItem.id, visual);
      }

      const vectorRenderOrder = 20 + vectorRenderIndex * 3;
      visual.arrow.renderOrder = vectorRenderOrder;
      visual.arrow.line.renderOrder = vectorRenderOrder;
      visual.arrow.cone.renderOrder = vectorRenderOrder + 1;
      visual.dotLine.renderOrder = vectorRenderOrder + 2;
      visual.dotPoint.renderOrder = vectorRenderOrder + 2;
      visual.handle.renderOrder = vectorRenderOrder + 10;

      visual.arrow.line.material.color.setHex(vectorItem.color);
      visual.arrow.cone.material.color.setHex(vectorItem.color);
      visual.dotMaterial.color.setHex(vectorItem.color);
      visual.dotPointMaterial.color.setHex(vectorItem.color);
      visual.handleMaterial.color.setHex(vectorItem.color);
      visual.handle.userData.color = vectorItem.color;
      const scalarEnabled = !!vectorItem.scalarEnabled;
      const vectorDragKey = scalarEnabled ? `s:${vectorItem.id}` : `v:${vectorItem.id}`;
      delete dragHandles[`v:${vectorItem.id}`];
      delete dragHandles[`s:${vectorItem.id}`];
      dragHandles[vectorDragKey] = visual.handle;
      visual.handle.userData.dragKey = vectorDragKey;

      const renderValues = renderedVectorValues.get(vectorItem.id) ?? vectorItem.values;
      const [vx, vy, vz] = transformVector3(vectorMatrix, renderValues);
      const userVector = new THREE.Vector3(vx, vy, vz);
      const spawnEase = vectorSpawnEase(vectorItem.id);
      const vectorItemVisible = vectorItem.visible !== false;
      const isActiveVector = vectorItem.id === activeVectorIdRef.current;
      const baseLengthSquared = userVector.lengthSq();
      const activeLengthSquared = activeVectorWorld?.lengthSq() ?? 0;
      const scalarSpace = vectorItem.scalarSpace === 'input' ? 'input' : 'output';
      const scalarNormal = scalarSpace === 'input'
        ? new THREE.Vector3(renderValues[0], renderValues[1], renderValues[2])
        : userVector;
      const scalarBaseLengthSquared = scalarNormal.lengthSq();
      const scalarValue = hasScalarText(vectorItem.scalar)
        ? parseNumber(vectorItem.scalar)
        : scalarBaseLengthSquared;
      const scalarAnchorInput =
        scalarBaseLengthSquared > EPSILON
          ? scalarNormal.clone().multiplyScalar(scalarValue / scalarBaseLengthSquared)
          : new THREE.Vector3(0, 0, 0);
      const scalarAnchor = scalarSpace === 'input'
        ? new THREE.Vector3(...transformVector3(vectorMatrix, [scalarAnchorInput.x, scalarAnchorInput.y, scalarAnchorInput.z]))
        : scalarAnchorInput;
      const projection =
        activeVectorWorld && baseLengthSquared > EPSILON
          ? userVector.clone().multiplyScalar(activeVectorWorld.dot(userVector) / baseLengthSquared)
          : new THREE.Vector3(0, 0, 0);
      const vectorVisible = uiStateRef.current.showVector && vectorItemVisible && vectorSceneAllowed;
      const arrowVisible = vectorVisible && !scalarEnabled;
      const dotDisplayVisible = uiStateRef.current.showDot && vectorItemVisible;
      setArrowVector(visual.arrow, vx, vy, vz, arrowVisible);
      setMaterialOpacity(visual.arrow.line.material, spawnEase);
      setMaterialOpacity(visual.arrow.cone.material, spawnEase);
      const dotVisible =
        dotDisplayVisible &&
        arrowVisible &&
        !!activeVectorWorld &&
        !isActiveVector &&
        !scalarEnabled &&
        baseLengthSquared > EPSILON &&
        activeLengthSquared > EPSILON;
      const dotScalar = activeVectorWorld ? activeVectorWorld.dot(userVector) : 0;
      const dotPositions = visual.dotLine.geometry.attributes.position;
      dotPositions.setXYZ(0, 0, 0, 0);
      dotPositions.setXYZ(1, projection.x, projection.y, projection.z);
      dotPositions.setXYZ(2, projection.x, projection.y, projection.z);
      dotPositions.setXYZ(3, activeVectorWorld?.x ?? 0, activeVectorWorld?.y ?? 0, activeVectorWorld?.z ?? 0);
      dotPositions.needsUpdate = true;
      visual.dotLine.visible = dotVisible;
      visual.dotMaterial.opacity = 0.86 * spawnEase;
      visual.dotPoint.position.copy(projection);
      visual.dotPoint.visible = dotVisible;
      setMaterialOpacity(visual.dotPointMaterial, spawnEase);
      handleTargets[vectorDragKey] = scalarEnabled ? scalarAnchor : userVector;
      const scalarHighlightIndices = scalarEnabled
        ? scalarLockHighlightIndices(
            [scalarNormal.x, scalarNormal.y, scalarNormal.z],
            coordMode
          )
        : [];
      const vectorLabelText = coordLabelText(
        vectorItem.name,
        [vx, vy, vz],
        coordMode,
        coordinatesVisible,
        scalarHighlightIndices
      );

      const vectorLabel = vectorLabelRefs.current.get(vectorItem.id);
      updateLabel(
        vectorLabel,
        new THREE.Vector3(vx * 1.06, vy * 1.06, vz * 1.06),
        vectorLabelText,
        vectorLabelsVisible && vectorVisible,
        [0, -18],
        { keepNameWhenCoordinatesHidden: true }
      );
      if (vectorLabel) {
        vectorLabel.style.opacity = vectorLabelsVisible && vectorVisible
          ? String(0.18 + spawnEase * 0.82)
          : '';
      }
      updateLabel(
        vectorDotLabelRefs.current.get(vectorItem.id),
        projection.clone().lerp(activeVectorWorld ?? userVector, 0.22),
        `A${activeVectorItem?.name ?? 'v'}·A${vectorItem.name} = ${formatNumber(dotScalar)}`,
        dotVisible && labelsVisible,
        [16, 26 + (Math.max(0, vectorsRef.current.findIndex((item) => item.id === vectorItem.id)) % 3) * 13]
      );
      if (!dotVisible) {
        const dotLabel = vectorDotLabelRefs.current.get(vectorItem.id);
        if (dotLabel) dotLabel.textContent = '';
      }
    });

    vectorVisuals.forEach((visual, id) => {
      if (activeVectorKeys.has(id)) return;
      delete dragHandles[`v:${id}`];
      delete dragHandles[`s:${id}`];
      disposeVectorVisual(refs.scene, visual);
      vectorVisuals.delete(id);
      const label = vectorLabelRefs.current.get(id);
      const dotLabel = vectorDotLabelRefs.current.get(id);
      if (label) label.style.display = 'none';
      if (dotLabel) dotLabel.style.display = 'none';
    });

    const scalarSolution = frameScalarSolution ?? scalarSolutionRef.current;
    const scalarSolutionVisible = !!scalarSolution && uiStateRef.current.showVector && vectorSceneAllowed;
    const scalarSolutionVector = scalarSolution
      ? new THREE.Vector3(scalarSolution[0], scalarSolution[1], scalarSolution[2])
      : new THREE.Vector3();
    if (refs.scalarSolutionPoint) {
      refs.scalarSolutionPoint.visible = scalarSolutionVisible;
      if (scalarSolution) refs.scalarSolutionPoint.position.copy(scalarSolutionVector);
    }
    updateLabel(
      scalarSolutionLabelRef,
      scalarSolutionVector,
      scalarSolution ? `${t(locale, 'solution')} x = ${formatCoord(scalarSolution, coordMode)}` : '',
      scalarSolutionVisible && labelsVisible,
      [30, -10],
      { allowOrigin: true }
    );

    Object.entries(dragHandles).forEach(([key, handle]) => {
      const target = handleTargets[key];
      const isVectorHandle = !!vectorIdFromDragKey(key) || !!scalarIdFromDragKey(key);
      const dragVectorId = vectorIdFromDragKey(key) ?? scalarIdFromDragKey(key);
      const dragVectorVisible = dragVectorId
        ? vectorsRef.current.find((item) => item.id === dragVectorId)?.visible !== false
        : true;
      const isAvailable =
        !!target &&
        target.length() > EPSILON &&
        (isVectorHandle
          ? vectorSceneAllowed && uiStateRef.current.showVector && dragVectorVisible
          : !isSystemMode && basisVisibleByKey[key] && (key !== 'k' || coordMode === '3d'));
      const isHot = arrowDragRef.current.hovered === key || arrowDragRef.current.key === key;
      if (target) handle.position.copy(target);
      handle.visible = isAvailable;
      handle.scale.setScalar(isHot ? 1.15 : 1);
      handle.material.opacity = 0.001;
      handle.material.color.setHex(
        arrowDragRef.current.key === key && arrowDragRef.current.snapped
          ? 0xfff4b0
          : handle.userData.color
      );
    });
    updateLabel(
      iLabelRef,
      new THREE.Vector3(matrix[0] * 1.16, matrix[3] * 1.16, matrix[6] * 1.16),
      `i′${coordinatesVisible ? ` ${formatCoord([matrix[0], matrix[3], matrix[6]], coordMode)}` : ''}`,
      basisVisibleByKey.i,
      [18, 12],
      { keepNameWhenCoordinatesHidden: true }
    );
    updateLabel(
      jLabelRef,
      new THREE.Vector3(matrix[1] * 1.12, matrix[4] * 1.12, matrix[7] * 1.12),
      `j′${coordinatesVisible ? ` ${formatCoord([matrix[1], matrix[4], matrix[7]], coordMode)}` : ''}`,
      basisVisibleByKey.j,
      [-14, -16],
      { keepNameWhenCoordinatesHidden: true }
    );
    updateLabel(
      kLabelRef,
      new THREE.Vector3(matrix[2] * 1.12, matrix[5] * 1.12, matrix[8] * 1.12),
      `k′${coordinatesVisible ? ` ${formatCoord([matrix[2], matrix[5], matrix[8]], '3d')}` : ''}`,
      basisVisibleByKey.k && kAxisBlend > 0.08,
      [10, -18],
      { keepNameWhenCoordinatesHidden: true }
    );
    resolveSceneLabelOverlaps(containerRef.current);
    refs.renderer.render(refs.scene, refs.camera);
  }, [locale, updateLabel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#121210');

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      1000
    );
    camera.position.copy(initialCameraPositionRef.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.copy(initialCameraTargetRef.current);
    configureControlsForView(controls, '3d', controlLocksFromRefs());
    controls.update();
    const handleControlsStart = () => {
      cameraMoveRef.current.active = false;
      setActiveView(null);
    };
    const handleControlsChange = () => {
      if (!cameraAutoRef.current) queueCameraShareUpdate(220);
    };
    const handleControlsEnd = () => {
      if (snapCameraToAutoView()) return;
      queueCameraShareUpdate(0);
    };
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);
    controls.addEventListener('end', handleControlsEnd);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.86);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xf1b434, 0.35);
    rimLight.position.set(-7, 4, -8);
    scene.add(rimLight);

    const staticGridMaterial = new THREE.LineBasicMaterial({
      color: 0x6b7280,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
    });
    const staticGrid = new THREE.LineSegments(createGridGeometry(9, 1), staticGridMaterial);
    staticGrid.renderOrder = 0;
    scene.add(staticGrid);

    const referenceGridMaterial = new THREE.LineBasicMaterial({
      color: 0x22c1b6,
      transparent: true,
      opacity: 0.34,
      depthTest: false,
      depthWrite: false,
    });
    const referenceGrid = new THREE.LineSegments(createPlaneGridGeometry(), referenceGridMaterial);
    referenceGrid.renderOrder = 1;
    referenceGrid.visible = false;
    scene.add(referenceGrid);

    const axesHelper = new THREE.AxesHelper(8);
    axesHelper.renderOrder = 5;
    scene.add(axesHelper);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x22c1b6,
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
    });
    const dynamicGrid = new THREE.LineSegments(createGridGeometry(9, 1), gridMaterial);
    dynamicGrid.matrixAutoUpdate = false;
    dynamicGrid.renderOrder = 4;
    dynamicGroup.add(dynamicGrid);

    const dynamicPlaneGridMaterial = new THREE.LineBasicMaterial({
      color: 0x22c1b6,
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
    });
    const dynamicPlaneGrid = new THREE.LineSegments(createPlaneGridGeometry(), dynamicPlaneGridMaterial);
    dynamicPlaneGrid.matrixAutoUpdate = false;
    dynamicPlaneGrid.renderOrder = 4;
    dynamicPlaneGrid.visible = false;
    dynamicGroup.add(dynamicPlaneGrid);

    const createArrow = (color) => {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        color,
        0.28,
        0.14
      );
      arrow.line.material.depthTest = false;
      arrow.cone.material.depthTest = false;
      arrow.renderOrder = 10;
      return arrow;
    };

    const iArrow = createArrow(0xe05263);
    const jArrow = createArrow(0x1f9d55);
    const kArrow = createArrow(0x3f7ee8);
    const userArrow = createArrow(0x8b5cf6);
    scene.add(iArrow, jArrow, kArrow, userArrow);

    const dotGeometry = new THREE.BufferGeometry();
    dotGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
    );
    const dotMaterial = new THREE.LineBasicMaterial({
      color: MEASURE_DOT_HEX,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    const dotLine = new THREE.LineSegments(dotGeometry, dotMaterial);
    dotLine.renderOrder = 12;
    scene.add(dotLine);

    const dotPointGeometry = new THREE.SphereGeometry(0.055, 18, 12);
    const dotPointMaterial = new THREE.MeshBasicMaterial({
      color: MEASURE_DOT_HEX,
      depthTest: false,
      depthWrite: false,
    });
    const dotPoint = new THREE.Mesh(dotPointGeometry, dotPointMaterial);
    dotPoint.renderOrder = 13;
    scene.add(dotPoint);

    const equationGroup = new THREE.Group();
    equationGroup.matrixAutoUpdate = false;
    equationGroup.visible = false;
    scene.add(equationGroup);

    const vectorScalarGroup = new THREE.Group();
    vectorScalarGroup.visible = false;
    scene.add(vectorScalarGroup);

    const measurementGroup = new THREE.Group();
    measurementGroup.visible = true;
    scene.add(measurementGroup);

    const scalarSolutionPointGeometry = new THREE.SphereGeometry(0.085, 24, 16);
    const scalarSolutionPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1b434,
      depthTest: false,
      depthWrite: false,
    });
    const scalarSolutionPoint = new THREE.Mesh(scalarSolutionPointGeometry, scalarSolutionPointMaterial);
    scalarSolutionPoint.renderOrder = 36;
    scalarSolutionPoint.visible = false;
    scene.add(scalarSolutionPoint);

    const equationPointGeometry = new THREE.SphereGeometry(0.11, 24, 16);
    const equationPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    });
    const equationPoint = new THREE.Mesh(equationPointGeometry, equationPointMaterial);
    equationPoint.renderOrder = 35;
    equationPoint.userData.visible = false;
    equationPoint.visible = false;
    scene.add(equationPoint);

    const dragHandleGeometry = new THREE.SphereGeometry(0.13, 22, 14);
    const createDragHandle = (key, color) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.001,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(dragHandleGeometry, material);
      mesh.renderOrder = 30;
      mesh.userData.dragKey = key;
      mesh.userData.color = color;
      scene.add(mesh);
      return mesh;
    };
    const dragHandles = {
      i: createDragHandle('i', 0xe05263),
      j: createDragHandle('j', 0x1f9d55),
      k: createDragHandle('k', 0x3f7ee8),
    };

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    boxGeometry.translate(0.5, 0.5, 0.5);
    const boxMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    boxMesh.matrixAutoUpdate = false;
    boxMesh.renderOrder = 2;
    scene.add(boxMesh);

    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    const boxEdges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
    boxEdges.matrixAutoUpdate = false;
    boxEdges.renderOrder = 3;
    scene.add(boxEdges);

    const areaGeometry = new THREE.PlaneGeometry(1, 1);
    areaGeometry.translate(0.5, 0.5, 0);
    const areaMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const areaMesh = new THREE.Mesh(areaGeometry, areaMaterial);
    areaMesh.matrixAutoUpdate = false;
    areaMesh.renderOrder = 2;
    scene.add(areaMesh);

    const areaEdgesGeometry = new THREE.EdgesGeometry(areaGeometry);
    const areaEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xf1b434,
      transparent: true,
      opacity: 0.76,
      depthTest: false,
      depthWrite: false,
    });
    const areaEdges = new THREE.LineSegments(areaEdgesGeometry, areaEdgeMaterial);
    areaEdges.matrixAutoUpdate = false;
    areaEdges.renderOrder = 3;
    scene.add(areaEdges);

    const vectorAreaGeometry = new THREE.BufferGeometry();
    const vectorAreaEdgeGeometry = new THREE.BufferGeometry();
    updateAreaGeometry(
      vectorAreaGeometry,
      vectorAreaEdgeGeometry,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0)
    );
    const vectorVolumeGeometry = new THREE.BufferGeometry();
    const vectorVolumeEdgeGeometry = new THREE.BufferGeometry();
    updateVolumeGeometry(
      vectorVolumeGeometry,
      vectorVolumeEdgeGeometry,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    );
    const vectorVolumeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const vectorVolumeEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xc4b5fd,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
    });
    const vectorAreaMesh = new THREE.Mesh(vectorAreaGeometry, vectorVolumeMaterial.clone());
    vectorAreaMesh.renderOrder = 6;
    vectorAreaMesh.visible = false;
    scene.add(vectorAreaMesh);
    const vectorAreaEdges = new THREE.LineSegments(vectorAreaEdgeGeometry, vectorVolumeEdgeMaterial.clone());
    vectorAreaEdges.renderOrder = 7;
    vectorAreaEdges.visible = false;
    scene.add(vectorAreaEdges);
    const vectorVolumeMesh = new THREE.Mesh(vectorVolumeGeometry, vectorVolumeMaterial);
    vectorVolumeMesh.renderOrder = 6;
    vectorVolumeMesh.visible = false;
    scene.add(vectorVolumeMesh);
    const vectorVolumeEdges = new THREE.LineSegments(vectorVolumeEdgeGeometry, vectorVolumeEdgeMaterial);
    vectorVolumeEdges.renderOrder = 7;
    vectorVolumeEdges.visible = false;
    scene.add(vectorVolumeEdges);

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    threeRef.current = {
      renderer,
      scene,
      camera,
      controls,
      staticGrid,
      referenceGrid,
      axesHelper,
      dynamicGrid,
      dynamicPlaneGrid,
      iArrow,
      jArrow,
      kArrow,
      userArrow,
      dotLine,
      dotPoint,
      equationGroup,
      vectorScalarGroup,
      measurementGroup,
      measurementVisuals: new Map(),
      measurementSpawnTimes: new Map(),
      equationSpawnTimes: new Map(),
      scalarSolutionPoint,
      equationPoint,
      dragHandles,
      dragHandleGeometry,
      vectorVisuals: new Map(),
      boxMesh,
      boxEdges,
      boxMaterial,
      edgeMaterial,
      areaMesh,
      areaEdges,
      areaMaterial,
      areaEdgeMaterial,
      vectorAreaMesh,
      vectorAreaEdges,
      vectorAreaMaterial: vectorAreaMesh.material,
      vectorAreaEdgeMaterial: vectorAreaEdges.material,
      vectorVolumeMesh,
      vectorVolumeEdges,
      vectorVolumeMaterial,
      vectorVolumeEdgeMaterial,
      disposable: [
        staticGrid.geometry,
        staticGridMaterial,
        gridMaterial,
        referenceGrid.geometry,
        referenceGridMaterial,
        dynamicGrid.geometry,
        dynamicPlaneGrid.geometry,
        dynamicPlaneGridMaterial,
        dotGeometry,
        dotMaterial,
        dotPointGeometry,
        dotPointMaterial,
        scalarSolutionPointGeometry,
        scalarSolutionPointMaterial,
        equationPointGeometry,
        equationPointMaterial,
        dragHandleGeometry,
        ...Object.values(dragHandles).map((handle) => handle.material),
        boxGeometry,
        boxMaterial,
        edgesGeometry,
        edgeMaterial,
        areaGeometry,
        areaMaterial,
        areaEdgesGeometry,
        areaEdgeMaterial,
        vectorAreaGeometry,
        vectorAreaMesh.material,
        vectorAreaEdgeGeometry,
        vectorAreaEdges.material,
        vectorVolumeGeometry,
        vectorVolumeMaterial,
        vectorVolumeEdgeGeometry,
        vectorVolumeEdgeMaterial,
      ],
    };

    const setPointerFromEvent = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.set(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
      );
    };

    const intersectDragPlaneAtClient = (clientX, clientY, plane, target) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.set(
        ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
      );
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      return raycasterRef.current.ray.intersectPlane(plane, target);
    };

    const setDragCursor = (value) => {
      container.style.cursor = value;
      renderer.domElement.style.cursor = value;
    };

    const projectDragPoint = (vector) => {
      const projected = vector.clone().project(camera);
      if (projected.z > 1 || projected.z < -1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
        y: (projected.y * -0.5 + 0.5) * renderer.domElement.clientHeight,
      };
    };

    const updateDragSnapGuide = (rawWorld, snappedWorld, mode) => {
      const distance = rawWorld.distanceTo(snappedWorld);
      if (distance <= 0.002) {
        setDragSnapGuide(null);
        return;
      }
      const rawPoint = projectDragPoint(rawWorld);
      const snappedPoint = projectDragPoint(snappedWorld);
      if (!rawPoint || !snappedPoint) {
        setDragSnapGuide(null);
        return;
      }
      const label = snapGuideLabelForVectors(rawWorld, snappedWorld, mode);
      setDragSnapGuide({
        x1: rawPoint.x,
        y1: rawPoint.y,
        x2: snappedPoint.x,
        y2: snappedPoint.y,
        label,
      });
    };

    const distanceToScreenLine = (point, start, end) => {
      const vx = end.x - start.x;
      const vy = end.y - start.y;
      const wx = point.x - start.x;
      const wy = point.y - start.y;
      const lengthSquared = vx * vx + vy * vy;
      if (lengthSquared < EPSILON) return Infinity;
      return Math.abs(vx * wy - vy * wx) / Math.sqrt(lengthSquared);
    };

    const shiftAxisLockedWorld = (rawWorld, mode) => {
      if (mode === '1d') {
        return new THREE.Vector3(rawWorld.x, 0, 0);
      }

      const rawPoint = projectDragPoint(rawWorld);
      const originPoint = projectDragPoint(new THREE.Vector3(0, 0, 0));
      if (!rawPoint || !originPoint) return null;

      const axisItems = [
        { key: 'x', axis: new THREE.Vector3(1, 0, 0) },
        { key: 'y', axis: new THREE.Vector3(0, 1, 0) },
        ...(mode === '3d' ? [{ key: 'z', axis: new THREE.Vector3(0, 0, 1) }] : []),
      ];

      let best = null;
      axisItems.forEach((item) => {
        const plus = projectDragPoint(item.axis.clone().multiplyScalar(8));
        const minus = projectDragPoint(item.axis.clone().multiplyScalar(-8));
        const start = minus ?? originPoint;
        const end = plus ?? originPoint;
        if (!plus && !minus) return;
        const distance = distanceToScreenLine(rawPoint, start, end);
        if (!best || distance < best.distance) {
          best = { ...item, distance };
        }
      });

      if (!best || best.distance > SHIFT_AXIS_LOCK_PX) return null;
      return best.axis.multiplyScalar(rawWorld.dot(best.axis));
    };

    const setHoveredDragKey = (key, isDragging = false) => {
      arrowDragRef.current.hovered = key;
      container.querySelectorAll('[data-drag-key]').forEach((label) => {
        const isActiveLabel = label.dataset.dragKey === key;
        label.classList.toggle('is-drag-hot', isActiveLabel);
        label.classList.toggle('is-dragging', isActiveLabel && isDragging);
      });
      setDragCursor(key ? (isDragging ? 'grabbing' : 'grab') : '');
    };

    const getLabelDragKey = (event) => {
      if (!(event.target instanceof Element)) return null;
      if (event.target.closest('.label-measure-menu')) return null;
      if (measureModeRef.current && event.target.closest('.measure-target-label')) {
        return null;
      }
      return event.target.closest('[data-drag-key]')?.dataset.dragKey ?? null;
    };

    const getDragTargetVector = (key) => {
      const matrix = currentMatrixRef.current;
      if (key === 'i') return new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
      if (key === 'j') return new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
      if (key === 'k') return new THREE.Vector3(matrix[2], matrix[5], matrix[8]);
      const scalarId = scalarIdFromDragKey(key);
      if (scalarId) {
        const sourceVector = vectorsRef.current.find((item) => item.id === scalarId);
        if (!sourceVector) return new THREE.Vector3(0, 0, 0);
        const scalarSpace = sourceVector.scalarSpace === 'input' ? 'input' : 'output';
        const normal = scalarSpace === 'input'
          ? new THREE.Vector3(...sourceVector.values)
          : new THREE.Vector3(...transformVector3(matrix, sourceVector.values));
        const lengthSquared = normal.lengthSq();
        if (lengthSquared < EPSILON) return new THREE.Vector3(0, 0, 0);
        const scalarValue = hasScalarText(sourceVector.scalar)
          ? parseNumber(sourceVector.scalar)
          : lengthSquared;
        const anchor = normal.multiplyScalar(scalarValue / lengthSquared);
        return scalarSpace === 'input'
          ? new THREE.Vector3(...transformVector3(matrix, [anchor.x, anchor.y, anchor.z]))
          : anchor;
      }
      const vectorId = vectorIdFromDragKey(key);
      const sourceVector =
        vectorsRef.current.find((item) => item.id === vectorId)?.values ??
        userVectorRef.current;
      const [vx, vy, vz] = transformVector3(matrix, sourceVector);
      return new THREE.Vector3(vx, vy, vz);
    };

    const pickDragHandle = (event) => {
      setPointerFromEvent(event);
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const activeVectorKey = `v:${activeVectorIdRef.current}`;
      const hitScore = (hit) => {
        const key = hit.object?.userData?.dragKey;
        if (!hit.object?.visible) return 99;
        if (key === activeVectorKey) return 0;
        if (scalarIdFromDragKey(key)) return 0.5;
        if (vectorIdFromDragKey(key)) return 1;
        return 2;
      };
      const hits = raycasterRef.current
        .intersectObjects(Object.values(dragHandles), false)
        .filter((hit) => hit.object?.visible)
        .sort((a, b) => hitScore(a) - hitScore(b) || a.distance - b.distance);
      return hits[0]?.object ?? null;
    };

    const isSceneChromeTarget = (event) => (
      event.target instanceof Element &&
      !!event.target.closest(
        'button, input, select, textarea, .axis-label, .scene-control-dock, .measure-draft-guide, .ad-slot'
      )
    );

    const cancelMeasurementPick = () => {
      setMeasureMode(null);
      setMeasureDraft([]);
      setMeasureAnchorId(null);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
    };

    const handleArrowPointerMove = (event) => {
      const dragState = arrowDragRef.current;
      if (dragState.active) {
        event.preventDefault();
        const dx = event.clientX - dragState.startClientX;
        const dy = event.clientY - dragState.startClientY;
        const nextWorld = dragState.startVector
          .clone()
          .addScaledVector(dragState.screenRight, dx)
          .addScaledVector(dragState.screenDown, dy);
        const mode = viewKeyForMatrix(currentMatrixRef.current);
        const snapEnabled = dragSnapEnabledRef.current;
        const shiftLockedWorld =
          event.shiftKey && !scalarIdFromDragKey(dragState.key)
            ? shiftAxisLockedWorld(nextWorld, mode)
            : null;
        const dragWorld = shiftLockedWorld ?? nextWorld;
        const snappedWorld = constrainVectorForMode(
          dragWorld,
          mode,
          snapEnabled ? { drag: true } : { snap: false }
        );
        let adjustedWorld = snappedWorld;
        if (scalarIdFromDragKey(dragState.key)) {
          adjustedWorld =
            dragActionsRef.current.updateScalarConstraintFromDrag?.(dragWorld, dragState) ?? snappedWorld;
        } else if (vectorIdFromDragKey(dragState.key)) {
          adjustedWorld =
            dragActionsRef.current.updateUserVectorFromDrag?.(dragWorld, dragState) ?? snappedWorld;
        } else {
          adjustedWorld =
            dragActionsRef.current.updateBasisVectorFromDrag?.(dragState.key, dragWorld) ?? snappedWorld;
        }
        dragState.snapped = adjustedWorld.distanceTo(nextWorld) > EPSILON;
        if ((snapEnabled || shiftLockedWorld) && dragState.snapped && !scalarIdFromDragKey(dragState.key)) {
          updateDragSnapGuide(nextWorld, adjustedWorld, mode);
        } else {
          setDragSnapGuide(null);
        }
        setHoveredDragKey(dragState.key, true);
        return;
      }

      const labelKey = getLabelDragKey(event);
      const hit = labelKey ? null : pickDragHandle(event);
      const nextHovered = labelKey ?? hit?.userData.dragKey ?? null;
      if (arrowDragRef.current.hovered !== nextHovered) {
        setHoveredDragKey(nextHovered);
      }
      setDragSnapGuide(null);
    };

    const handleArrowPointerDown = (event) => {
      const labelKey = getLabelDragKey(event);
      const hit = labelKey ? null : pickDragHandle(event);
      const dragKey = labelKey ?? hit?.userData.dragKey ?? null;
      if (!dragKey) {
        if (
          (measureModeRef.current || measureDraftRef.current.length > 0) &&
          !isSceneChromeTarget(event)
        ) {
          cancelMeasurementPick();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDragSnapGuide(null);
      cameraMoveRef.current.active = false;
      isAnimatingRef.current = false;
      setActiveView(null);
      controls.enabled = false;
      container.setPointerCapture?.(event.pointerId);
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const startVector = getDragTargetVector(dragKey);
      const draggedVectorId = vectorIdFromDragKey(dragKey);
      const draggedScalarId = scalarIdFromDragKey(dragKey);
      const draggedAnyVectorId = draggedVectorId ?? draggedScalarId;
      if (draggedAnyVectorId) setActiveVectorId(draggedAnyVectorId);
      const startInputVector =
        vectorsRef.current.find((item) => item.id === draggedAnyVectorId)?.values ??
        userVectorRef.current;
      const draggedScalarSpace =
        draggedScalarId
          ? vectorsRef.current.find((item) => item.id === draggedScalarId)?.scalarSpace ?? 'input'
          : null;
      const scalarNormal =
        draggedScalarId
          ? (
              draggedScalarSpace === 'input'
                ? new THREE.Vector3(...startInputVector)
                : new THREE.Vector3(...transformVector3(currentMatrixRef.current, startInputVector))
            )
          : null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), startVector);
      const startIntersection = new THREE.Vector3();
      const rightIntersection = new THREE.Vector3();
      const downIntersection = new THREE.Vector3();
      const hasStartIntersection = intersectDragPlaneAtClient(event.clientX, event.clientY, plane, startIntersection);
      if (!hasStartIntersection) startIntersection.copy(startVector);
      const hasRightIntersection = intersectDragPlaneAtClient(event.clientX + 1, event.clientY, plane, rightIntersection);
      if (!hasRightIntersection) {
        rightIntersection
          .copy(startIntersection)
          .add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.01));
      }
      const hasDownIntersection = intersectDragPlaneAtClient(event.clientX, event.clientY + 1, plane, downIntersection);
      if (!hasDownIntersection) {
        downIntersection
          .copy(startIntersection)
          .add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-0.01));
      }
      arrowDragRef.current = {
        active: true,
        hovered: dragKey,
        key: dragKey,
        snapped: false,
        startMatrix: [...currentMatrixRef.current],
        startClientX: event.clientX,
        startClientY: event.clientY,
        startIntersection: startIntersection.clone(),
        startInputVector: [...startInputVector],
        startVector: startVector.clone(),
        scalarNormal,
        scalarSpace: draggedScalarSpace,
        screenDown: downIntersection.sub(startIntersection),
        screenRight: rightIntersection.sub(startIntersection),
        plane,
      };
      setHoveredDragKey(dragKey, true);
    };

    const finishArrowDrag = (event) => {
      if (!arrowDragRef.current.active) return;
      const dragState = arrowDragRef.current;
      const finalMatrix = [...currentMatrixRef.current];
      controls.enabled = true;
      try {
        container.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture can already be gone when the browser ends a drag outside the canvas.
      }
      if (dragState.key && !vectorIdFromDragKey(dragState.key) && !scalarIdFromDragKey(dragState.key)) {
        dragActionsRef.current.commitBasisDrag?.(dragState.startMatrix, finalMatrix, dragState.key);
      }
      arrowDragRef.current.active = false;
      arrowDragRef.current.key = null;
      arrowDragRef.current.snapped = false;
      setDragSnapGuide(null);
      setHoveredDragKey(arrowDragRef.current.hovered);
    };

    const clearArrowHover = () => {
      if (arrowDragRef.current.active) return;
      setDragSnapGuide(null);
      setHoveredDragKey(null);
    };

    container.addEventListener('pointermove', handleArrowPointerMove);
    container.addEventListener('pointerdown', handleArrowPointerDown);
    container.addEventListener('pointerup', finishArrowDrag);
    container.addEventListener('pointerleave', clearArrowHover);

    setIsLoaded(true);
    frameIdRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      resizeObserver.disconnect();
      container.removeEventListener('pointermove', handleArrowPointerMove);
      container.removeEventListener('pointerdown', handleArrowPointerDown);
      container.removeEventListener('pointerup', finishArrowDrag);
      container.removeEventListener('pointerleave', clearArrowHover);
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      controls.removeEventListener('end', handleControlsEnd);
      controls.dispose();
      clearEquationGroup(equationGroup);
      clearEquationGroup(vectorScalarGroup);
      threeRef.current?.measurementVisuals?.forEach(disposeMeasurementVisual);
      threeRef.current?.vectorVisuals?.forEach((visual) => disposeVectorVisual(scene, visual));
      threeRef.current?.disposable.forEach((item) => item.dispose?.());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
    };
  }, [animate, queueCameraShareUpdate, snapCameraToAutoView]);

  const moveCameraToView = useCallback((viewKey) => {
    const refs = threeRef.current;
    const preset = viewPresets[viewKey];
    if (!preset) return;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(viewKey);
    const destination = refs
      ? cameraStateForView(viewKey, refs.camera.position, refs.controls.target)
      : cameraStateForView(viewKey);
    setCameraState({
      position: cameraVectorToShareArray(destination.position),
      target: cameraVectorToShareArray(destination.target),
    });
    if (!refs) return;
    configureControlsForView(refs.controls, viewKey, controlLocksFromRefs());
    cameraMoveRef.current = {
      active: true,
      startTime: null,
      positionFrom: refs.camera.position.clone(),
      targetFrom: refs.controls.target.clone(),
      positionTo: destination.position,
      targetTo: destination.target,
    };
  }, []);

  const switchWorkspaceMode = useCallback((mode) => {
    setWorkspaceMode(mode);
    if (mode === 'system') {
      setCameraAuto(true);
      moveCameraToView(systemDimensionRef.current === '3d' ? '3d' : '2d');
    } else {
      setCameraAuto(false);
    }
  }, [moveCameraToView]);

  useEffect(() => {
    systemDimensionRef.current = effectiveSystemMode;
    if (workspaceMode === 'system') {
      moveCameraToView(effectiveSystemMode);
    }
  }, [effectiveSystemMode, moveCameraToView, workspaceMode]);

  const moveCameraForMatrix = useCallback((matrix) => {
    moveCameraToView(viewKeyForMatrix(matrix));
  }, [moveCameraToView]);

  const startAnimationTo = useCallback((matrix, historyName, options = {}) => {
    const {
      operationMatrix = matrix,
      operationMode = '3d',
      isDimensionDrop = false,
      previousMatrix,
      replaceHistory = false,
      stateMode = modeForMatrix(matrix),
    } = options;
    const animationStartMatrix = [...currentMatrixRef.current];
    startMatrixRef.current = animationStartMatrix;
    targetMatrixRef.current = [...matrix];
    setBasisControlMatrix([...matrix]);
    animationViewFromRef.current = viewKeyForMatrix(animationStartMatrix);
    animationViewToRef.current = viewKeyForMatrix(matrix);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    isAnimatingRef.current = true;
    setProgress(0);

    if (historyName) {
      const entry = {
        name: historyName,
        matrix: [...matrix],
        previousMatrix: [...(previousMatrix ?? animationStartMatrix)],
        previousStateMode: modeForMatrix(previousMatrix ?? animationStartMatrix),
        operationMatrix: [...operationMatrix],
        operationMode,
        isDimensionDrop,
        stateMode,
      };
      setHistory((previous) => {
        const next = replaceHistory ? [entry] : [...previous, entry];
        setActiveHistoryIndex(next.length - 1);
        setHoveredHistoryIndex(null);
        return next;
      });
    }
  }, []);

  const applyTransformation = useCallback((matrix, name, operationMode = '3d') => {
    const previousRank = rank3(currentMatrixRef.current);
    const next = multiplyMatrix3(matrix, currentMatrixRef.current);
    const nextRank = rank3(next);
    startAnimationTo(next, name, {
      operationMatrix: matrix,
      operationMode,
      isDimensionDrop: nextRank < previousRank,
    });
    moveCameraForMatrix(next);
  }, [moveCameraForMatrix, startAnimationTo]);

  const applyNotebookCursor = useCallback((rawCursor, sourceCells = notebookScript.cells, options = {}) => {
    const cells = sourceCells.length ? sourceCells : [];
    const clamped = Math.max(0, Math.min(100, Number(rawCursor) || 0));
    const hasLineMetadata = cells.some(
      (cell) => Number.isFinite(cell.lineStart) && Number.isFinite(cell.lineEnd)
    );
    let activeCell = clamped <= 0 ? null : cells[0];
    let equationText = '';
    let hasEquationText = false;
    let captionText = '';
    const notebookMode = notebookModeForCells(cells, notebookScript.mode);
    const notebookIdentity = identityMatrixForMode(notebookMode);
    let startMatrix = [...notebookIdentity];
    let targetMatrix = [...notebookIdentity];
    let progressWithinCell = 1;
    const scriptHasVectorCells = hasLineMetadata && cells.some(
      (cell) =>
        !cell.hidden &&
        ((cell.type === 'vector' && cell.execute !== false && !cell.remove) ||
          (cell.type === 'calc' && cell.resultKind === 'vector' && cell.execute === true) ||
          (cell.type === 'ref' && cell.refKind === 'vector' && !cell.remove))
    );
    const revealedVectors = [];
    const notebookVectorEnv = new Map();
    const notebookMatrixEnv = new Map();
    const notebookEquationEnv = new Map();
    const equationLineItems = [];

    const upsertNotebookEquation = (entry, options = {}) => {
      if (!entry?.name && options.allowAnonymous !== true) return null;
      const equationName = normalizeNotebookVariableName(entry.name, `L${equationLineItems.length + 1}`);
      if (!equationName) return null;
      const parsed = entry.coeffs
        ? entry
        : parsedEquationLine(entry.text ?? '');
      if (!parsed) return null;
      const nextEntry = {
        name: equationName,
        text: entry.text ?? formatEquationFromCoefficients(parsed.coeffs, parsed.value),
        coeffs: parsed.coeffs,
        value: parsed.value,
        color: entry.color ?? equationLineColors[equationLineItems.length % equationLineColors.length],
        dimension: entry.dimension ?? (Math.abs(parsed.coeffs[2]) > EPSILON ? 3 : 2),
      };
      const key = notebookVariableKey(equationName);
      notebookEquationEnv.set(key, nextEntry);
      if (options.reveal !== false) {
        const existingIndex = equationLineItems.findIndex((item) => notebookVariableKey(item.name) === key);
        if (existingIndex >= 0) equationLineItems[existingIndex] = nextEntry;
        else equationLineItems.push(nextEntry);
      }
      return nextEntry;
    };

    const removeNotebookEquation = (name) => {
      const key = notebookVariableKey(name);
      const index = equationLineItems.findIndex((item) => notebookVariableKey(item.name) === key);
      if (index >= 0) equationLineItems.splice(index, 1);
    };

    const upsertNotebookVector = (name, values, color, options = {}) => {
      if (!name && options.allowAnonymous !== true) return null;
      const vectorName = normalizeNotebookVariableName(name, `v${revealedVectors.length + 1}`);
      if (!vectorName) return null;
      const reveal = options.reveal ?? true;
      const key = notebookVariableKey(vectorName);
      const existingIndex = revealedVectors.findIndex((item) => notebookVariableKey(item.name) === key);
      const vectorIndex = existingIndex >= 0 ? existingIndex : revealedVectors.length;
      const nextVector = createVectorState(vectorIndex, {
        id: notebookVectorIdForName(vectorName, vectorIndex),
        name: vectorName,
        color: color ?? vectorPalette[vectorIndex % vectorPalette.length],
        x: values[0] ?? '0',
        y: values[1] ?? '0',
        z: values[2] ?? '0',
        visible: true,
      });
      if (reveal) {
        if (existingIndex >= 0) revealedVectors[existingIndex] = nextVector;
        else revealedVectors.push(nextVector);
      }
      notebookVectorEnv.set(key, {
        name: vectorName,
        values: [nextVector.x, nextVector.y, nextVector.z],
        color: nextVector.color,
      });
      return nextVector;
    };

    const removeNotebookVector = (name) => {
      const key = notebookVariableKey(name);
      const index = revealedVectors.findIndex((item) => notebookVariableKey(item.name) === key);
      if (index >= 0) revealedVectors.splice(index, 1);
    };

    const evaluateNotebookCalculation = (cell) => {
      const leftKey = notebookVariableKey(cell.left);
      const rightKey = notebookVariableKey(cell.right);
      const leftMatrix = notebookMatrixEnv.get(leftKey);
      const rightMatrix = notebookMatrixEnv.get(rightKey);
      const leftVector = notebookVectorEnv.get(leftKey);
      const rightVector = notebookVectorEnv.get(rightKey);
      const leftEquation = notebookEquationEnv.get(leftKey);
      const rightEquation = notebookEquationEnv.get(rightKey);
      if (leftMatrix && rightVector) {
        return {
          type: 'vector',
          values: multiplyNotebookMatrixVector(leftMatrix.values, rightVector.values),
          color: cell.color ?? rightVector.color,
        };
      }
      if (leftMatrix && rightMatrix) {
        return multiplyNotebookMatrices(leftMatrix, rightMatrix);
      }
      if (rightMatrix && leftVector) {
        return {
          type: 'vector',
          values: multiplyNotebookMatrixVector(rightMatrix.values, leftVector.values),
          color: cell.color ?? leftVector.color,
        };
      }
      if (leftMatrix && rightEquation) {
        const result = transformNotebookEquation(rightEquation, leftMatrix);
        return result ? { ...result, color: cell.color ?? rightEquation.color } : null;
      }
      if (rightMatrix && leftEquation) {
        const result = transformNotebookEquation(leftEquation, rightMatrix);
        return result ? { ...result, color: cell.color ?? leftEquation.color } : null;
      }
      return null;
    };

    const matrixEntryForCell = (cell) => {
      const matrixMode = notebookMatrixModeFromText(cell.text, cell.mode);
      const rows = cell.rows ?? dimensionForMode(matrixMode);
      const columns = cell.columns ?? rows;
      const values = cell.values ?? matrixValuesFromNotebookText(cell.text, matrixMode);
      const shapeValues = Array.from({ length: rows * columns }, (_, index) =>
        formatPresetInputValue(parseNumber(values[index] ?? (index % (columns + 1) === 0 ? '1' : '0')))
      );
      return {
        name: cell.name,
        rows,
        columns,
        mode: operationModeForShape(rows, columns),
        shapeValues,
        values: operationMatrixFromInputValues(shapeValues, rows, columns),
      };
    };

    const setMatrixCalculation = (cell, result) => {
      if (result?.type !== 'matrix') return null;
      const entry = {
        name: cell.name,
        rows: result.rows,
        columns: result.columns,
        mode: result.mode,
        shapeValues: result.shapeValues,
        values: result.values,
      };
      if (cell.name) notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
      return entry;
    };

    const upsertNotebookCalculationResult = (cell, result, options = {}) => {
      const localProgress = Number.isFinite(options.localProgress) ? clamp01(options.localProgress) : 1;
      const easedProgress = easeInOut(localProgress);
      if (result?.type === 'vector') {
        const key = cell.name ? notebookVariableKey(cell.name) : '';
        const previous = key ? notebookVectorEnv.get(key) : null;
        const values = previous && localProgress < 1
          ? interpolateValueStrings(previous.values, result.values, easedProgress)
          : result.values;
        return upsertNotebookVector(cell.name, values, result.color, { reveal: cell.execute === true });
      }
      if (result?.type === 'equation') {
        const key = cell.name ? notebookVariableKey(cell.name) : '';
        const previous = key ? notebookEquationEnv.get(key) : null;
        const target = { ...result, name: cell.name };
        const entry = previous && localProgress < 1
          ? interpolateEquationEntry(previous, target, easedProgress)
          : target;
        return upsertNotebookEquation(entry, { reveal: cell.execute === true });
      }
      if (result?.type === 'matrix') return setMatrixCalculation(cell, result);
      return null;
    };

    if (hasLineMetadata) {
      const lastLineFromCells = Math.max(
        0,
        ...cells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
      );
      const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, lastLineFromCells + 1);
      const linePosition = (clamped / 100) * lineCount;
      const activeLine = clamped <= 0 ? -1 : Math.min(lineCount - 1, Math.max(0, Math.floor(linePosition)));
      const activeByLine = activeLine < 0
        ? null
        : cells.find((cell, index) => {
            const start = Number.isFinite(cell.lineStart) ? cell.lineStart : index;
            const end = Number.isFinite(cell.lineEnd) ? cell.lineEnd : start;
            return activeLine >= start && activeLine <= end;
          });
      activeCell = activeByLine
        ?? [...cells].reverse().find((cell, reverseIndex) => {
          const originalIndex = cells.length - 1 - reverseIndex;
          const start = Number.isFinite(cell.lineStart) ? cell.lineStart : originalIndex;
          return activeLine >= 0 && start <= activeLine;
        })
        ?? null;

      let isInsidePartialMatrix = false;

      for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        const lineStart = Number.isFinite(cell.lineStart) ? cell.lineStart : index;
        const lineEnd = Number.isFinite(cell.lineEnd) ? cell.lineEnd : lineStart;
        const span = Math.max(1, lineEnd - lineStart + 1);
        const hasReachedCell = clamped >= 100 || linePosition > lineStart;
        if (!hasReachedCell) continue;
        if (cell.hidden) continue;

        if (cell.type === 'caption') {
          captionText = cell.remove ? '' : cell.text ?? '';
          continue;
        }

        if (cell.type === 'equation') {
          const sourceLines = cell.text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
          const lineLimit = clamped >= 100
            ? sourceLines.length
            : Math.max(1, Math.min(sourceLines.length, Math.floor(linePosition - lineStart) + 1));
          const equationItems = cell.equations?.length
            ? cell.equations
            : sourceLines.map((text, itemIndex) => {
                const parsed = parsedEquationLine(text);
                return parsed
                  ? {
                      name: `L${itemIndex + 1}`,
                      text,
                      coeffs: parsed.coeffs,
                      value: parsed.value,
                      color: equationLineColors[itemIndex % equationLineColors.length],
                    }
                  : null;
              }).filter(Boolean);
          equationItems.slice(0, lineLimit).forEach((item) => upsertNotebookEquation(item));
          continue;
        }

      if (cell.type === 'vector') {
        const values = cell.values ?? ['0', '0', '0'];
          if (cell.remove) {
            removeNotebookVector(cell.name);
            continue;
          }
          upsertNotebookVector(cell.name, values, cell.color, { reveal: cell.execute !== false });
          continue;
        }

        if (cell.type === 'calc') {
          if (cell.remove) {
            if (cell.resultKind === 'vector') removeNotebookVector(cell.name);
            if (cell.resultKind === 'equation') removeNotebookEquation(cell.name);
            if (cell.resultKind === 'matrix') notebookMatrixEnv.delete(notebookVariableKey(cell.name));
            continue;
          }
          const result = evaluateNotebookCalculation(cell);
          const localProgress = clamp01((linePosition - lineStart) / span);
          if (result?.type === 'vector') {
            upsertNotebookCalculationResult(cell, result, { localProgress });
          }
          if (result?.type === 'equation') {
            upsertNotebookCalculationResult(cell, result, { localProgress });
          }
          if (result?.type === 'matrix') {
            setMatrixCalculation(cell, result);
          }
          continue;
        }

        if (cell.type === 'ref') {
          if (cell.remove) {
            if (cell.refKind === 'vector') removeNotebookVector(cell.name);
            if (cell.refKind === 'equation') removeNotebookEquation(cell.name);
            if (cell.refKind === 'matrix') notebookMatrixEnv.delete(notebookVariableKey(cell.name));
            continue;
          }
          if (cell.refKind === 'matrix') {
            const entry = notebookMatrixEnv.get(notebookVariableKey(cell.name));
            const localProgress = clamp01(linePosition - lineStart);
            const isComplete = localProgress >= 1 || clamped >= 100;
            if (entry && isComplete) {
              startMatrix = multiplyMatrix3(entry.values, startMatrix);
              targetMatrix = [...startMatrix];
            } else if (entry) {
              targetMatrix = multiplyMatrix3(entry.values, startMatrix);
              progressWithinCell = localProgress;
              activeCell = cell;
              isInsidePartialMatrix = true;
              break;
            }
          }
          if (cell.refKind === 'vector') {
            const entry = notebookVectorEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookVector(entry.name, entry.values, entry.color);
          }
          if (cell.refKind === 'equation') {
            const entry = notebookEquationEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookEquation(entry);
          }
          continue;
        }

        if (cell.type === 'matrix') {
          const entry = matrixEntryForCell(cell);
          const matrix = entry.values;
          const localProgress = clamp01((linePosition - lineStart) / span);
          const isComplete = localProgress >= 1 || clamped >= 100;
          if (cell.remove) {
            if (isComplete) notebookMatrixEnv.delete(notebookVariableKey(cell.name));
            continue;
          }
          if (isComplete) {
            notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
          }
          if (cell.execute === true && isComplete) {
            startMatrix = multiplyMatrix3(matrix, startMatrix);
            targetMatrix = [...startMatrix];
          } else if (cell.execute === true) {
            targetMatrix = multiplyMatrix3(matrix, startMatrix);
            progressWithinCell = localProgress;
            activeCell = cell;
            isInsidePartialMatrix = true;
            break;
          }
        }
      }

      if (!isInsidePartialMatrix) {
        targetMatrix = [...startMatrix];
        progressWithinCell = 1;
      }
      equationText = equationLineItems.map((item) => item.text).join('\n');
      hasEquationText = equationLineItems.length > 0;
    } else {
      const scaled = (clamped / 100) * cells.length;
      const roundedBoundary = Math.round(scaled);
      const isCellBoundary = clamped > 0 && Math.abs(scaled - roundedBoundary) < 0.0001;
      const activeIndex = Math.min(
        cells.length - 1,
        Math.max(0, isCellBoundary ? roundedBoundary - 1 : Math.floor(scaled))
      );
      const localProgress = isCellBoundary
        ? 1
        : activeIndex === cells.length - 1
          ? Math.min(1, scaled - activeIndex)
          : scaled - activeIndex;
      activeCell = cells[activeIndex];

      for (let index = 0; index < activeIndex; index += 1) {
        const cell = cells[index];
        if (cell.hidden) continue;
        if (cell.type === 'caption') {
          captionText = cell.remove ? '' : cell.text ?? '';
        }
        if (cell.type === 'equation') {
          const sourceLines = cell.text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
          const equationItems = cell.equations?.length
            ? cell.equations
            : sourceLines.map((text, itemIndex) => {
                const parsed = parsedEquationLine(text);
                return parsed
                  ? {
                      name: `L${itemIndex + 1}`,
                      text,
                      coeffs: parsed.coeffs,
                      value: parsed.value,
                      color: equationLineColors[itemIndex % equationLineColors.length],
                    }
                  : null;
              }).filter(Boolean);
          equationItems.forEach((item) => upsertNotebookEquation(item));
        }
        if (cell.type === 'matrix') {
          const entry = matrixEntryForCell(cell);
          if (cell.remove) {
            notebookMatrixEnv.delete(notebookVariableKey(cell.name));
            continue;
          }
          notebookMatrixEnv.set(notebookVariableKey(cell.name), entry);
          if (cell.execute === true) startMatrix = multiplyMatrix3(entry.values, startMatrix);
        }
        if (cell.type === 'vector') {
          if (cell.remove) {
            removeNotebookVector(cell.name);
            continue;
          }
          upsertNotebookVector(cell.name, cell.values ?? ['0', '0', '0'], cell.color, { reveal: cell.execute !== false });
        }
        if (cell.type === 'calc') {
          if (cell.remove) {
            if (cell.resultKind === 'vector') removeNotebookVector(cell.name);
            if (cell.resultKind === 'equation') removeNotebookEquation(cell.name);
            if (cell.resultKind === 'matrix') notebookMatrixEnv.delete(notebookVariableKey(cell.name));
            continue;
          }
          const result = evaluateNotebookCalculation(cell);
          if (result?.type === 'vector') {
            upsertNotebookCalculationResult(cell, result, { localProgress: 1 });
          }
          if (result?.type === 'equation') {
            upsertNotebookCalculationResult(cell, result, { localProgress: 1 });
          }
          if (result?.type === 'matrix') {
            setMatrixCalculation(cell, result);
          }
        }
        if (cell.type === 'ref') {
          if (cell.remove) {
            if (cell.refKind === 'vector') removeNotebookVector(cell.name);
            if (cell.refKind === 'equation') removeNotebookEquation(cell.name);
            if (cell.refKind === 'matrix') notebookMatrixEnv.delete(notebookVariableKey(cell.name));
          } else if (cell.refKind === 'matrix') {
            const entry = notebookMatrixEnv.get(notebookVariableKey(cell.name));
            if (entry) startMatrix = multiplyMatrix3(entry.values, startMatrix);
          } else if (cell.refKind === 'vector') {
            const entry = notebookVectorEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookVector(entry.name, entry.values, entry.color);
          } else if (cell.refKind === 'equation') {
            const entry = notebookEquationEnv.get(notebookVariableKey(cell.name));
            if (entry) upsertNotebookEquation(entry);
          }
        }
      }

      targetMatrix = [...startMatrix];
      if (!activeCell || activeCell.hidden) {
        progressWithinCell = 1;
      } else if (activeCell.type === 'equation') {
        const sourceLines = activeCell.text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
        const equationItems = activeCell.equations?.length
          ? activeCell.equations
          : sourceLines.map((text, itemIndex) => {
              const parsed = parsedEquationLine(text);
              return parsed
                ? {
                    name: `L${itemIndex + 1}`,
                    text,
                    coeffs: parsed.coeffs,
                    value: parsed.value,
                    color: equationLineColors[itemIndex % equationLineColors.length],
                  }
                : null;
            }).filter(Boolean);
        equationItems.forEach((item) => upsertNotebookEquation(item));
      } else if (activeCell.type === 'caption') {
        captionText = activeCell.remove ? '' : activeCell.text ?? '';
      }
      if (activeCell?.type === 'vector') {
        const values = activeCell.values ?? ['0', '0', '0'];
        if (activeCell.remove) removeNotebookVector(activeCell.name);
        else upsertNotebookVector(activeCell.name, values, activeCell.color, { reveal: activeCell.execute !== false });
      }
      if (activeCell?.type === 'calc') {
        if (activeCell.remove) {
          if (activeCell.resultKind === 'vector') removeNotebookVector(activeCell.name);
          if (activeCell.resultKind === 'equation') removeNotebookEquation(activeCell.name);
          if (activeCell.resultKind === 'matrix') notebookMatrixEnv.delete(notebookVariableKey(activeCell.name));
        } else {
        const result = evaluateNotebookCalculation(activeCell);
        if (result?.type === 'vector') {
          upsertNotebookCalculationResult(activeCell, result, { localProgress });
        }
        if (result?.type === 'equation') {
          upsertNotebookCalculationResult(activeCell, result, { localProgress });
        }
        if (result?.type === 'matrix') {
          setMatrixCalculation(activeCell, result);
        }
        }
      }
      if (activeCell?.type === 'matrix') {
        const entry = matrixEntryForCell(activeCell);
        if (activeCell.remove) {
          notebookMatrixEnv.delete(notebookVariableKey(activeCell.name));
        } else {
          notebookMatrixEnv.set(notebookVariableKey(activeCell.name), entry);
        if (activeCell.execute === true) {
          targetMatrix = multiplyMatrix3(entry.values, startMatrix);
          progressWithinCell = localProgress;
        }
        }
      }
      if (activeCell?.type === 'ref') {
        if (activeCell.remove) {
          if (activeCell.refKind === 'vector') removeNotebookVector(activeCell.name);
          if (activeCell.refKind === 'equation') removeNotebookEquation(activeCell.name);
          if (activeCell.refKind === 'matrix') notebookMatrixEnv.delete(notebookVariableKey(activeCell.name));
        } else if (activeCell.refKind === 'matrix') {
          const entry = notebookMatrixEnv.get(notebookVariableKey(activeCell.name));
          if (entry) {
            targetMatrix = multiplyMatrix3(entry.values, startMatrix);
            progressWithinCell = localProgress;
          }
        } else if (activeCell.refKind === 'vector') {
          const entry = notebookVectorEnv.get(notebookVariableKey(activeCell.name));
          if (entry) upsertNotebookVector(entry.name, entry.values, entry.color);
        } else if (activeCell.refKind === 'equation') {
          const entry = notebookEquationEnv.get(notebookVariableKey(activeCell.name));
          if (entry) upsertNotebookEquation(entry);
        }
      }
    }

    equationText = equationLineItems.map((item) => item.text).join('\n');
    hasEquationText = equationLineItems.length > 0;

    setNotebookCursor(clamped);
    setActiveNotebookCellId(activeCell?.id ?? null);
    setActiveNotebookCaption(captionText);
    if (hasLineMetadata || hasEquationText) {
      const normalized = equationText.replace(/\r/g, '');
      setEquations(normalized === '' ? [''] : normalized.split('\n'));
    }
    if (scriptHasVectorCells) {
      const notebookVectorMatrix = startMatrix.map((value, matrixIndex) =>
        value + progressWithinCell * (targetMatrix[matrixIndex] - value)
      );
      notebookVectorTransformRef.current = [...notebookVectorMatrix];
      setVectors((previous) => {
        const same = previous.length === revealedVectors.length && previous.every((item, index) => {
          const next = revealedVectors[index];
          return (
            next &&
            item.id === next.id &&
            item.name === next.name &&
            item.color === next.color &&
            item.x === next.x &&
            item.y === next.y &&
            item.z === next.z &&
            item.visible === next.visible
          );
        });
        return same ? previous : revealedVectors;
      });
      setActiveVectorId(revealedVectors.at(-1)?.id ?? null);
    } else {
      notebookVectorTransformRef.current = [...notebookIdentity];
    }

    if (options.animate) {
      const easedLocal = easeInOut(progressWithinCell);
      const desiredMatrix = startMatrix.map((value, matrixIndex) =>
        value + easedLocal * (targetMatrix[matrixIndex] - value)
      );
      startMatrixRef.current = [...currentMatrixRef.current];
      targetMatrixRef.current = desiredMatrix;
      animationViewFromRef.current = viewKeyForMatrix(currentMatrixRef.current);
      animationViewToRef.current = viewKeyForMatrix(desiredMatrix);
      animationStartRef.current = null;
      lastUiSyncRef.current = 0;
      isAnimatingRef.current = true;
      setProgress(0);
      setBasisControlMatrix(desiredMatrix);
      return;
    }

    stopAutoAnimation();
    startMatrixRef.current = [...startMatrix];
    targetMatrixRef.current = [...targetMatrix];
    animationViewFromRef.current = viewKeyForMatrix(startMatrix);
    animationViewToRef.current = viewKeyForMatrix(targetMatrix);
    animationStartRef.current = null;
    lastUiSyncRef.current = 0;
    setMatrixAtProgress(progressWithinCell);
  }, [notebookScript.cells, notebookScript.lineCount, notebookScript.mode, setMatrixAtProgress, stopAutoAnimation]);

  const runNotebookCell = useCallback((cellId) => {
    const index = notebookCells.findIndex((cell) => cell.id === cellId);
    if (index < 0) return;
    const cursor = ((index + 1) / notebookCells.length) * 100;
    applyNotebookCursor(cursor, notebookCells);
  }, [applyNotebookCursor, notebookCells]);

  const cancelNotebookPlayback = useCallback(() => {
    if (notebookPlaybackFrameRef.current) {
      window.cancelAnimationFrame(notebookPlaybackFrameRef.current);
      notebookPlaybackFrameRef.current = null;
    }
    setNotebookPlaying(false);
  }, []);

  const playNotebookCursorRange = useCallback((startCursor, endCursor, sourceCells = notebookScript.cells, duration = 900, onComplete) => {
    cancelNotebookPlayback();
    const startValue = Math.max(0, Math.min(100, Number(startCursor) || 0));
    const endValue = Math.max(0, Math.min(100, Number(endCursor) || 0));
    const delta = endValue - startValue;
    const direction = Math.sign(delta) || 1;
    const lastLineFromCells = Math.max(
      0,
      ...sourceCells.map((cell, index) => Number.isFinite(cell.lineEnd) ? cell.lineEnd : index)
    );
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, lastLineFromCells + 1);
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const timedCells = direction > 0
      ? [...sourceCells]
        .flatMap((cell, index) => {
          const lineDurations = Array.isArray(cell.lineDurations) ? cell.lineDurations : [];
          if (lineDurations.length) {
            return lineDurations
              .filter((item) => Number.isFinite(item.durationSec) && item.durationSec > 0)
              .map((item) => {
                const line = Number.isFinite(item.line)
                  ? item.line
                  : (Number.isFinite(cell.lineStart) ? cell.lineStart : index);
                const start = (line / lineCount) * 100;
                const end = ((line + 1) / lineCount) * 100;
                return {
                  start: Math.max(startValue, Math.min(endValue, start)),
                  end: Math.max(startValue, Math.min(endValue, end)),
                  duration: Math.max(120, item.durationSec * 1000 / speed),
                };
              });
          }
          if (!Number.isFinite(cell.durationSec) || cell.durationSec <= 0) return [];
          const start = ((Number.isFinite(cell.lineStart) ? cell.lineStart : index) / lineCount) * 100;
          const end = (((Number.isFinite(cell.lineEnd) ? cell.lineEnd : cell.lineStart ?? index) + 1) / lineCount) * 100;
          return [{
            start: Math.max(startValue, Math.min(endValue, start)),
            end: Math.max(startValue, Math.min(endValue, end)),
            duration: Math.max(120, cell.durationSec * 1000 / speed),
          }];
        })
        .filter((segment) => segment.end - segment.start > 0.001)
        .sort((a, b) => a.start - b.start)
      : [];
    const defaultMsPerCursor = Math.max(1, duration / Math.max(1, Math.abs(delta)));
    const segments = [];
    let cursor = startValue;
    timedCells.forEach((cellSegment) => {
      if (cellSegment.start > cursor + 0.001) {
        segments.push({
          from: cursor,
          to: cellSegment.start,
          duration: Math.max(80, (cellSegment.start - cursor) * defaultMsPerCursor),
        });
      }
      segments.push({
        from: cellSegment.start,
        to: cellSegment.end,
        duration: cellSegment.duration,
      });
      cursor = Math.max(cursor, cellSegment.end);
    });
    if (endValue > cursor + 0.001) {
      segments.push({
        from: cursor,
        to: endValue,
        duration: Math.max(80, (endValue - cursor) * defaultMsPerCursor),
      });
    }
    const effectiveSegments = segments.length
      ? segments
      : [{ from: startValue, to: endValue, duration: Math.max(1, duration) }];
    const totalDuration = effectiveSegments.reduce((sum, segment) => sum + segment.duration, 0);
    let startTime = null;
    applyNotebookCursor(startValue, sourceCells);
    setNotebookPlaying(true);

    const tick = (time) => {
      if (startTime === null) startTime = time;
      const elapsed = Math.min(totalDuration, time - startTime);
      let passed = 0;
      let currentSegment = effectiveSegments[effectiveSegments.length - 1];
      for (const segment of effectiveSegments) {
        if (elapsed <= passed + segment.duration) {
          currentSegment = segment;
          break;
        }
        passed += segment.duration;
      }
      const segmentRatio = currentSegment.duration > 0
        ? Math.min(1, Math.max(0, (elapsed - passed) / currentSegment.duration))
        : 1;
      applyNotebookCursor(
        currentSegment.from + easeInOut(segmentRatio) * (currentSegment.to - currentSegment.from),
        sourceCells
      );
      if (elapsed < totalDuration) {
        notebookPlaybackFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        notebookPlaybackFrameRef.current = null;
        onComplete?.();
        if (!notebookPlaybackFrameRef.current) {
          setNotebookPlaying(false);
        }
      }
    };

    notebookPlaybackFrameRef.current = window.requestAnimationFrame(tick);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells, notebookScript.lineCount, notebookSpeed]);

  const runSmartNotebook = useCallback(() => {
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const duration = Math.max(900, Math.min(5600, notebookScript.lineCount * 420)) / speed;
    playNotebookCursorRange(0, 100, notebookScript.cells, duration);
  }, [notebookScript.cells, notebookScript.lineCount, notebookSpeed, playNotebookCursorRange]);

  const playNotebookMatrixCell = useCallback((cell, options = {}) => {
    if (
      !cell ||
      (
        cell.type !== 'matrix' &&
        !(cell.type === 'calc' && cell.resultKind === 'matrix') &&
        !(cell.type === 'ref' && cell.refKind === 'matrix')
      )
    ) return;
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, (cell.lineEnd ?? 0) + 1);
    const startCursor = ((cell.lineStart ?? 0) / lineCount) * 100;
    const endCursor = (((cell.lineEnd ?? cell.lineStart ?? 0) + 1) / lineCount) * 100;
    const span = Math.max(1, (cell.lineEnd ?? cell.lineStart ?? 0) - (cell.lineStart ?? 0) + 1);
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const duration = Math.max(520, Math.min(2600, span * 420)) / speed;
    const continueToEnd = Boolean(options.continueToEnd);
    const playRestOfNotebook = () => {
      if (!continueToEnd || endCursor >= 99.8) return;
      const remainingLines = Math.max(1, lineCount - ((cell.lineEnd ?? cell.lineStart ?? 0) + 1));
      const restDuration = Math.max(520, Math.min(3600, remainingLines * 320)) / speed;
      playNotebookCursorRange(endCursor, 100, notebookScript.cells, restDuration);
    };
    playNotebookCursorRange(startCursor, endCursor, notebookScript.cells, duration, playRestOfNotebook);
  }, [notebookScript.cells, notebookScript.lineCount, notebookSpeed, playNotebookCursorRange]);

  const playSmartNotebookFromLine = useCallback((lineIndex) => {
    const lineCount = Math.max(NOTEBOOK_MIN_VISIBLE_LINES, notebookScript.lineCount, lineIndex + 1);
    const startCursor = (Math.max(0, lineIndex) / lineCount) * 100;
    const remainingLines = Math.max(1, lineCount - Math.max(0, lineIndex));
    const speed = getNotebookPlaybackRate(notebookSpeed);
    const duration = Math.max(620, Math.min(5200, remainingLines * 360)) / speed;
    playNotebookCursorRange(startCursor, 100, notebookScript.cells, duration);
  }, [notebookScript.cells, notebookScript.lineCount, notebookSpeed, playNotebookCursorRange]);

  const toggleSmartNotebookPlayback = useCallback(() => {
    if (notebookPlaying) {
      cancelNotebookPlayback();
      return;
    }
    runSmartNotebook();
  }, [cancelNotebookPlayback, notebookPlaying, runSmartNotebook]);

  const scrubNotebookToClientY = useCallback((clientY) => {
    cancelNotebookPlayback();
    const track = notebookProgressRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const raw = rect.height > 0 ? ((clientY - rect.top) / rect.height) * 100 : 0;
    applyNotebookCursor(raw, notebookScript.cells);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells]);

  const scrubNotebookToClientX = useCallback((clientX, track = notebookSceneProgressRef.current) => {
    cancelNotebookPlayback();
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const raw = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 0;
    applyNotebookCursor(raw, notebookScript.cells);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells]);

  const stepNotebookCursor = useCallback((delta) => {
    cancelNotebookPlayback();
    applyNotebookCursor(notebookCursor + delta, notebookScript.cells);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookCursor, notebookScript.cells]);

  const handleNotebookProgressKeyDown = useCallback((event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      cancelNotebookPlayback();
      applyNotebookCursor(0, notebookScript.cells);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      cancelNotebookPlayback();
      applyNotebookCursor(100, notebookScript.cells);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      stepNotebookCursor(event.shiftKey ? -10 : -2);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepNotebookCursor(event.shiftKey ? 10 : 2);
    }
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookScript.cells, stepNotebookCursor]);

  useEffect(() => () => cancelNotebookPlayback(), [cancelNotebookPlayback]);

  const handleNotebookProgressPointerDown = useCallback((event) => {
    event.preventDefault();
    const input = event.currentTarget;
    input.setPointerCapture?.(event.pointerId);
    scrubNotebookToClientY(event.clientY);

    const handleMove = (moveEvent) => scrubNotebookToClientY(moveEvent.clientY);
    const handleUp = (upEvent) => {
      scrubNotebookToClientY(upEvent.clientY);
      input.releasePointerCapture?.(event.pointerId);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }, [scrubNotebookToClientY]);

  const handleNotebookSceneProgressPointerDown = useCallback((event) => {
    event.preventDefault();
    const track = event.currentTarget;
    track.setPointerCapture?.(event.pointerId);
    scrubNotebookToClientX(event.clientX, track);

    const handleMove = (moveEvent) => scrubNotebookToClientX(moveEvent.clientX, track);
    const handleUp = (upEvent) => {
      scrubNotebookToClientX(upEvent.clientX, track);
      track.releasePointerCapture?.(event.pointerId);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }, [scrubNotebookToClientX]);

  const jumpNotebookToLine = useCallback((lineIndex) => {
    cancelNotebookPlayback();
    const cursor = Math.max(0, Math.min(100, ((lineIndex + 1) / notebookLineCount) * 100));
    applyNotebookCursor(cursor, notebookScript.cells);
  }, [applyNotebookCursor, cancelNotebookPlayback, notebookLineCount, notebookScript.cells]);

  useEffect(() => {
    const previousVisualKey = notebookVisualSignatureRef.current;
    notebookVisualSignatureRef.current = notebookVisualSignatureKey;
    const previousKey = notebookMatrixSignatureRef.current;
    notebookMatrixSignatureRef.current = notebookMatrixSignatureKey;
    const didVisualChange = previousVisualKey !== null && previousVisualKey !== notebookVisualSignatureKey;

    if (notebookReplayFromStartRef.current) {
      notebookReplayFromStartRef.current = false;
      if (workspaceMode !== 'system') return undefined;
      const timer = window.setTimeout(() => {
        runSmartNotebook();
      }, 70);
      return () => window.clearTimeout(timer);
    }

    if (workspaceMode !== 'system' || !didVisualChange) {
      return undefined;
    }

    if (previousKey === null || previousKey === notebookMatrixSignatureKey) {
      const timer = window.setTimeout(() => {
        applyNotebookCursor(notebookCursor, notebookScript.cells);
      }, 50);
      return () => window.clearTimeout(timer);
    }

    const previousSignatures = previousKey ? previousKey.split('\n') : [];
    const changedMatrixIndex = notebookMatrixSignatureList.findIndex(
      (signature, index) => signature !== previousSignatures[index]
    );
    const matrixCells = notebookScript.cells.filter((cell) =>
      !cell.hidden &&
      (
        cell.type === 'matrix' ||
        (cell.type === 'calc' && cell.resultKind === 'matrix') ||
        (cell.type === 'ref' && cell.refKind === 'matrix')
      )
    );
    const targetCell = matrixCells[
      changedMatrixIndex >= 0 ? changedMatrixIndex : Math.max(0, matrixCells.length - 1)
    ];
    if (!targetCell) return undefined;

    const timer = window.setTimeout(() => {
      playNotebookMatrixCell(targetCell, { continueToEnd: true });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [
    notebookMatrixSignatureKey,
    notebookMatrixSignatureList,
    notebookScript.cells,
    notebookVisualSignatureKey,
    applyNotebookCursor,
    notebookCursor,
    playNotebookMatrixCell,
    runSmartNotebook,
    workspaceMode,
  ]);

  const updateMatrixInputValues = useCallback((values) => {
    setHoveredMatrixPresetId(null);
    setMatrix3((previous) => patchMatrixInputShape(previous, outputRows, inputColumns, values));
    if (outputRows === 2 && inputColumns === 2) setMatrix2(values);
    if (outputRows === 1 && inputColumns === 1) setMatrix1(values);
  }, [inputColumns, outputRows]);

  const applyCurrentInput = useCallback(() => {
    const matrix = operationMatrixFromInputValues(matrixInputValues, outputRows, inputColumns);
    const operationMode = operationModeForShape(outputRows, inputColumns);
    const name = activeMatrixPresetName ?? `${outputRows}x${inputColumns} ${t(locale, 'matrix')}`;

    applyTransformation(matrix, name, operationMode);
  }, [activeMatrixPresetName, applyTransformation, inputColumns, locale, matrixInputValues, outputRows]);

  const loadPresetToMatrixInput = useCallback((preset) => {
    const rows = dimensionForMode(preset.mode);
    const columns = rows;
    const values = matrixInputValuesForShape(operationMatrixFromPreset(preset), rows, columns).map(formatPresetInputValue);
    setHoveredMatrixPresetId(null);
    setInputMode(preset.mode);
    setMatrix3((previous) => patchMatrixInputShape(previous, rows, columns, values));
    if (preset.mode === '2d') setMatrix2(values);
    if (preset.mode === '1d') setMatrix1(values);
  }, []);

  const applyMatrixPresetDirectly = useCallback((preset, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setHoveredMatrixPresetId(null);
    const values = matrixValuesForMode(preset.matrix, preset.mode);
    const matrix =
      preset.mode === '2d'
        ? [values[0], values[1], 0, values[2], values[3], 0, 0, 0, 0]
        : preset.mode === '1d'
          ? [values[0], 0, 0, 0, 0, 0, 0, 0, 0]
          : values;
    applyTransformation(matrix, preset.name, preset.mode);
  }, [applyTransformation]);

  const jumpToHistory = useCallback((index) => {
    const target = history[index];
    if (!target) return;
    startAnimationTo(target.matrix, null);
    moveCameraForMatrix(target.matrix);
    setActiveHistoryIndex(index);
    setHoveredHistoryIndex(null);
  }, [history, moveCameraForMatrix, startAnimationTo]);

  const deleteHistoryEntry = useCallback((index, event) => {
    event.stopPropagation();
    if (history.length <= 1) return;

    const next = history.filter((_, entryIndex) => entryIndex !== index);
    let nextActiveIndex = activeHistoryIndex;

    if (index < activeHistoryIndex) {
      nextActiveIndex = activeHistoryIndex - 1;
    } else if (index === activeHistoryIndex) {
      nextActiveIndex = Math.min(index, next.length - 1);
    }

    const target = next[nextActiveIndex];
    setHistory(next);
    setActiveHistoryIndex(nextActiveIndex);
    setHoveredHistoryIndex(null);

    if (index === activeHistoryIndex && target) {
      startAnimationTo(target.matrix, null);
      moveCameraForMatrix(target.matrix);
    }
  }, [activeHistoryIndex, history, moveCameraForMatrix, startAnimationTo]);

  const getMatrixInputValues = useCallback(() => {
    return { values: matrixInputValues, columns: inputColumns };
  }, [inputColumns, matrixInputValues]);

  const copyMatrixInput = useCallback(async () => {
    try {
      const { values, columns } = getMatrixInputValues();
      const rows = [];
      for (let i = 0; i < values.length; i += columns) {
        rows.push(values.slice(i, i + columns).join(' '));
      }

      const text = rows.join('\n');
      if (typeof window !== 'undefined') {
        window.__linearAlgebraMatrixClipboard = text;
      }
      await navigator.clipboard.writeText(text);
      toast.success(t(locale, 'copied'));
      setClipboardStatus(t(locale, 'copied'));
    } catch {
      setClipboardStatus(t(locale, 'copyFailed'));
    }
    window.setTimeout(() => setClipboardStatus(''), 1200);
  }, [getMatrixInputValues, locale]);

  const pasteMatrixInput = useCallback(async () => {
    try {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = window.__linearAlgebraMatrixClipboard ?? '';
      }
      if (!text.trim() && window.__linearAlgebraMatrixClipboard) {
        text = window.__linearAlgebraMatrixClipboard;
      }
      const numbers = text.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:\s*\/\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)?/gi) ?? [];
      const normalized = numbers.map((value) => value.replace(/\s+/g, ''));

      if (normalized.length) {
        const rows = Math.min(3, Math.max(1, Math.ceil(normalized.length / inputColumns)));
        const nextValues = Array.from(
          { length: rows * inputColumns },
          (_, index) => normalized[index] ?? matrixInputValues[index] ?? '0'
        );
        setHoveredMatrixPresetId(null);
        setInputMode(modeForDimension(rows));
        setMatrix3((previous) => patchMatrixInputShape(previous, rows, inputColumns, nextValues));
        if (rows === 2 && inputColumns === 2) setMatrix2(nextValues);
        if (rows === 1 && inputColumns === 1) setMatrix1(nextValues);
      }

      if (numbers.length) {
        toast.success(t(locale, 'pasted'));
      } else {
        toast.warning(t(locale, 'pasteNoNumbers'));
      }

      setClipboardStatus(numbers.length ? t(locale, 'pasted') : t(locale, 'pasteNoNumbers'));
    } catch {
      setClipboardStatus(t(locale, 'pasteFailed'));
    }
    window.setTimeout(() => setClipboardStatus(''), 1200);
  }, [inputColumns, locale, matrixInputValues]);

  const renderSmartNotebookSyntaxLine = useCallback((line, lineIndex) => {
    const source = String(line ?? '');
    const pieces = [];
    let cursor = 0;
    const lineMark = notebookScript.marks[lineIndex];
    const muteMatch = source.match(/^(\s*)!(\s*)/u);

    if (muteMatch) {
      const prefix = muteMatch[1] ?? '';
      if (prefix) pieces.push(prefix);
      pieces.push(
        <span className="smart-inline-mute" key={`mute-${lineIndex}`}>
          !
        </span>
      );
      if (muteMatch[2]) pieces.push(muteMatch[2]);
      cursor = muteMatch[0].length;
    }

    const captionSource = source.slice(cursor);
    const captionMatch = captionSource.match(/^(\s*)(\/\/.*)$/u);
    if (captionMatch) {
      if (captionMatch[1]) pieces.push(captionMatch[1]);
      pieces.push(
        <span className="smart-inline-caption" key={`caption-${lineIndex}`}>
          {captionMatch[2]}
        </span>
      );
      return pieces;
    }

    const tokenPattern = new RegExp(`#${NOTEBOOK_IDENTIFIER_PATTERN}(?:!@?|@)?|${NOTEBOOK_IDENTIFIER_PATTERN}`, 'gu');
    tokenPattern.lastIndex = cursor;

    let match;
    while ((match = tokenPattern.exec(source))) {
      const token = match[0];
      const start = match.index;
      const end = start + token.length;
      if (start > cursor) pieces.push(source.slice(cursor, start));

      const isAlias = token.startsWith('#');
      let aliasToken = isAlias ? token.slice(1) : token;
      const aliasExecute = isAlias && aliasToken.endsWith('@');
      if (aliasExecute) aliasToken = aliasToken.slice(0, -1);
      const aliasHidden = isAlias && aliasToken.endsWith('!');
      if (aliasHidden) aliasToken = aliasToken.slice(0, -1);
      const tokenName = aliasToken;
      const lineMarkMatches =
        lineMark?.label &&
        notebookVariableKey(lineMark.label) === notebookVariableKey(tokenName);
      const tokenStyle = lineMarkMatches
        ? {
            label: lineMark.label,
            kind: lineMark.kind,
            color: lineMark.color ?? 0x8b5cf6,
            hidden: Boolean(lineMark.hidden),
          }
        : notebookTokenStyles.get(notebookVariableKey(tokenName));

      if (tokenStyle) {
        pieces.push(
          <span
            className={`smart-inline-token ${tokenStyle.kind} ${tokenStyle.hidden ? 'hidden' : ''}`}
            key={`token-${lineIndex}-${start}`}
            style={{ '--line-color': colorToHex(tokenStyle.color) }}
          >
            {`${isAlias ? '#' : ''}${tokenStyle.label}${aliasHidden ? '!' : ''}${aliasExecute ? '@' : ''}`}
          </span>
        );
      } else {
        pieces.push(token);
      }

      cursor = end;
    }

    if (cursor < source.length) pieces.push(source.slice(cursor));
    return pieces.length ? pieces : ' ';
  }, [notebookScript.marks, notebookTokenStyles]);

  const updateEquation = useCallback((index, value) => {
    setEquations((previous) => previous.map((equation, equationIndex) =>
      equationIndex === index ? value : equation
    ));
  }, []);

  const updateEquationNote = useCallback((value) => {
    const normalized = value.replace(/\r/g, '');
    setEquations(normalized === '' ? [''] : normalized.split('\n'));
  }, []);

  const updateSmartNotebookText = useCallback((value, options = {}) => {
    const normalized = String(value ?? '').replace(/\r/g, '');
    setNotebookText(normalized);
    const parsed = parseNotebookScript(normalized);
    const equationLines = parsed.cells
      .filter((cell) => cell.type === 'equation' && !cell.hidden)
      .flatMap((cell) => cell.text.split('\n'))
      .filter((line) => parsedEquationLine(line));
    setEquations(equationLines.length ? equationLines : ['']);
    if (options.revealAll && !notebookReplayFromStartRef.current) {
      applyNotebookCursor(100, parsed.cells);
    }
  }, [applyNotebookCursor]);

  const renameSmartNotebookVariable = useCallback((lineIndex, currentName) => {
    if (typeof window === 'undefined') return;
    const nextName = normalizeNotebookVariableName(window.prompt('변수명', currentName) ?? '', currentName);
    if (!nextName || nextName === currentName) return;
    const lines = String(notebookText ?? '').replace(/\r/g, '').split('\n');
    const sourceLine = lines[lineIndex] ?? '';
    const vectorLine = parseNotebookVectorLine(sourceLine);
    const calculationLine = parseNotebookCalculationLine(sourceLine);
    if (vectorLine) {
      const vectorText = vectorLine.values.slice(0, vectorLine.dimension).join(', ');
      lines[lineIndex] = `${nextName} = ${vectorText}`;
      updateSmartNotebookText(lines.join('\n'));
      return;
    }
    if (calculationLine) {
      lines[lineIndex] = `${nextName} = ${calculationLine.left} * ${calculationLine.right}`;
      updateSmartNotebookText(lines.join('\n'));
    }
  }, [notebookText, updateSmartNotebookText]);

  const handleSmartNotebookKeyDown = useCallback((event) => {
    const textarea = event.currentTarget;
    const current = textarea.value;
    const starter = notebookStarterText(locale);

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? start;
      const lineIndex = current.slice(0, start).split('\n').length - 1;
      const next = prettifyNotebookScriptText(`${current.slice(0, start)}\n${current.slice(end)}`);
      const nextLines = next.split('\n');
      const cursor = nextLines.slice(0, lineIndex + 1).join('\n').length + 1;
      updateSmartNotebookText(next);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();

    if (!current.trim()) {
      const next = starter;
      notebookReplayFromStartRef.current = true;
      updateSmartNotebookText(next, { revealAll: true });
      window.requestAnimationFrame(() => {
        textarea.selectionStart = next.length;
        textarea.selectionEnd = next.length;
      });
      return;
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${current.slice(0, start)}  ${current.slice(end)}`;
    updateSmartNotebookText(next, { revealAll: true });
    window.requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  }, [locale, updateSmartNotebookText]);

  const handleEquationNoteKeyDown = useCallback((event) => {
    const textarea = event.currentTarget;
    const current = textarea.value;
    const placeholder = t(locale, 'equationNotePlaceholder');

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? start;
      const lineIndex = current.slice(0, start).split('\n').length - 1;
      const next = prettifyEquationNoteText(`${current.slice(0, start)}\n${current.slice(end)}`);
      const nextLines = next.split('\n');
      const cursor = nextLines.slice(0, lineIndex + 1).join('\n').length + 1;
      updateEquationNote(next);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();

    if (!current.trim()) {
      updateEquationNote(placeholder);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = placeholder.length;
        textarea.selectionEnd = placeholder.length;
      });
      return;
    }

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${current.slice(0, start)}  ${current.slice(end)}`;
    updateEquationNote(next);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  }, [locale, updateEquationNote]);

  const addEquation = useCallback(() => {
    setEquations((previous) => [...previous, '']);
  }, []);

  const removeEquation = useCallback((index) => {
    setEquations((previous) => previous.filter((_, equationIndex) => equationIndex !== index));
  }, []);

  const insertNotebookCell = useCallback((afterId, type) => {
    const nextCell =
      type === 'matrix'
        ? createNotebookMatrixCell(systemMatrixMode)
        : type === 'note'
          ? createNotebookNoteCell('')
          : createNotebookEquationCell('');
    setNotebookCells((previous) => {
      const insertIndex = Math.max(0, previous.findIndex((cell) => cell.id === afterId));
      const next = [...previous];
      next.splice(insertIndex + 1, 0, nextCell);
      return next;
    });
    setActiveNotebookCellId(nextCell.id);
  }, [systemMatrixMode]);

  const addNotebookCellToEnd = useCallback((type) => {
    const nextCell =
      type === 'matrix'
        ? createNotebookMatrixCell(systemMatrixMode)
        : type === 'note'
          ? createNotebookNoteCell('')
          : createNotebookEquationCell('');
    setNotebookCells((previous) => [...previous, nextCell]);
    setActiveNotebookCellId(nextCell.id);
  }, [systemMatrixMode]);

  const updateNotebookCellText = useCallback((cellId, text) => {
    setNotebookCells((previous) =>
      previous.map((cell) => (cell.id === cellId ? { ...cell, text } : cell))
    );
    if (cellId === activeNotebookCellId) {
      const cell = notebookCells.find((item) => item.id === cellId);
      if (cell?.type === 'equation') updateEquationNote(text);
    }
  }, [activeNotebookCellId, notebookCells, updateEquationNote]);

  const prettifyNotebookEquationCell = useCallback((cellId) => {
    const sourceCell = notebookCells.find((cell) => cell.id === cellId && cell.type === 'equation');
    if (!sourceCell) return;
    const nextText = prettifyEquationNoteText(sourceCell.text);
    setNotebookCells((previous) =>
      previous.map((cell) => (cell.id === cellId ? { ...cell, text: nextText } : cell))
    );
    if (cellId === activeNotebookCellId) updateEquationNote(nextText);
  }, [activeNotebookCellId, notebookCells, updateEquationNote]);

  const applyPresetToNotebook = useCallback((preset) => {
    const text = preset.join('\n');
    setNotebookText(text);
    const activeEquation = notebookCells.find((cell) => cell.id === activeNotebookCellId && cell.type === 'equation');
    const fallbackEquation = notebookCells.find((cell) => cell.type === 'equation');
    const targetId = activeEquation?.id ?? fallbackEquation?.id;

    if (targetId) {
      setNotebookCells((previous) =>
        previous.map((cell) => (cell.id === targetId ? { ...cell, text } : cell))
      );
      setActiveNotebookCellId(targetId);
    } else {
      const nextCell = createNotebookEquationCell(text);
      setNotebookCells((previous) => [...previous, nextCell]);
      setActiveNotebookCellId(nextCell.id);
    }

    updateEquationNote(text);
  }, [activeNotebookCellId, notebookCells, updateEquationNote]);

  const removeNotebookCell = useCallback((cellId) => {
    setNotebookCells((previous) => {
      if (previous.length <= 1) return previous;
      const next = previous.filter((cell) => cell.id !== cellId);
      if (cellId === activeNotebookCellId) setActiveNotebookCellId(next[0]?.id ?? null);
      return next;
    });
  }, [activeNotebookCellId]);

  const handleNotebookEquationKeyDown = useCallback((cellId, event) => {
    const textarea = event.currentTarget;
    const current = textarea.value;
    const placeholder = t(locale, 'equationNotePlaceholder');

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? start;
      const lineIndex = current.slice(0, start).split('\n').length - 1;
      const next = prettifyEquationNoteText(`${current.slice(0, start)}\n${current.slice(end)}`);
      const nextLines = next.split('\n');
      const cursor = nextLines.slice(0, lineIndex + 1).join('\n').length + 1;
      updateNotebookCellText(cellId, next);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();

    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const next = current.trim()
      ? `${current.slice(0, start)}  ${current.slice(end)}`
      : placeholder;
    const cursor = current.trim() ? start + 2 : placeholder.length;

    updateNotebookCellText(cellId, next);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }, [locale, updateNotebookCellText]);

  const notebookCellCursor = useCallback((index, cell) => {
    if (!notebookCells.length) return 0;
    return ((index + 1) / notebookCells.length) * 100;
  }, [notebookCells.length]);

  const applyEquationSolutionToVector = useCallback(() => {
    const solution = equationSolution.solution;
    if (!solution) return;
    const nextVector = {
      x: formatInputValue(solution[0]),
      y: formatInputValue(solution[1]),
      z: formatInputValue(solution[2]),
    };
    const targetId = activeVectorIdRef.current;
    setVectors((previous) =>
      previous.map((item) => (item.id === targetId ? { ...item, ...nextVector } : item))
    );
    setShowVector(true);
  }, [equationSolution]);

  const applyLineSystemPointToVector = useCallback(() => {
    if (!lineSystem.point) return;
    const point = lineSystem.mode === '3d'
      ? lineSystem.point
      : [lineSystem.point[0], lineSystem.point[1], 0];
    const nextVector = {
      x: formatInputValue(point[0]),
      y: formatInputValue(point[1]),
      z: formatInputValue(point[2]),
    };
    const targetId = activeVectorIdRef.current;
    setVectors((previous) =>
      previous.map((item) => (item.id === targetId ? { ...item, ...nextVector } : item))
    );
    setShowVector(true);
    setWorkspaceMode('transform');
  }, [lineSystem.mode, lineSystem.point]);

  const buildShareState = useCallback(() => ({
    v: 1,
    locale,
    workspaceMode,
    inputMode,
    displayMatrix: currentMatrixRef.current.map((value) => Number(value.toFixed(5))),
    matrix3,
    matrix2,
    matrix1,
    vectors: vectors.map((item) => ({
      id: item.id,
      name: item.name,
      x: item.x,
      y: item.y,
      z: item.z,
      scalar: item.scalar,
      scalarEnabled: !!item.scalarEnabled,
      scalarSpace: item.scalarSpace === 'input' ? 'input' : 'output',
      visible: item.visible !== false,
    })),
    showVolume,
    showVector,
    showBasis,
    showGrid,
    showRelativeGrid,
    relativeGridStrength,
    showCoordinates,
    showDot,
    showAxes,
    showRelativeAxes,
    snapToInteger,
    notebookSpeed,
    camera: cameraState,
  }), [
    cameraState,
    inputMode,
    locale,
    matrix1,
    matrix2,
    matrix3,
    showAxes,
    showBasis,
    showCoordinates,
    showDot,
    showGrid,
    showRelativeGrid,
    showRelativeAxes,
    relativeGridStrength,
    showVector,
    showVolume,
    snapToInteger,
    notebookSpeed,
    vectors,
    workspaceMode,
  ]);

  const buildShareUrl = useCallback(() => {
    const state = buildShareState();
    const encoded = encodeShareState(state);
    const url = new URL(window.location.href);
    url.searchParams.set('s', encoded);
    url.searchParams.set('lang', locale);
    writeUrlDb(encoded, state);
    return url.toString();
  }, [buildShareState, locale]);

  const copyShareUrl = useCallback(async () => {
    try {
      const url = buildShareUrl();
      await navigator.clipboard.writeText(url);
      toast.success(t(locale, 'shareCopied'));
    } catch {
      toast.error('URL copy failed');
    }
  }, [buildShareUrl, locale]);

  useEffect(() => () => {
    if (cameraShareTimerRef.current) {
      window.clearTimeout(cameraShareTimerRef.current);
      cameraShareTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    window.localStorage?.setItem('linearAlgebraLocale', locale);
    applySeo(locale);
  }, [locale]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const state = buildShareState();
      const encoded = encodeShareState(state);
      const url = new URL(window.location.href);
      url.searchParams.set('s', encoded);
      url.searchParams.set('lang', locale);
      window.history.replaceState(null, '', url);
      writeUrlDb(encoded, state);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [buildShareState, locale]);

  const resetTransformation = useCallback(() => {
    startAnimationTo([...identity3], t(locale, 'initialSpace'), {
      operationMatrix: [...identity3],
      operationMode: '3d',
      previousMatrix: [...identity3],
      previousStateMode: '3d',
      replaceHistory: true,
      stateMode: '3d',
    });
    moveCameraToView('3d');
    setMatrix3(['1', '0', '0', '0', '1', '0', '0', '0', '1']);
    setMatrix2(['1', '0', '0', '1']);
    setMatrix1(['1']);
    setShowVolume(false);
    setShowGrid(true);
    setShowRelativeGrid(true);
    setRelativeGridStrength(DEFAULT_RELATIVE_GRID_STRENGTH);
    setShowCoordinates(true);
    setShowVector(true);
    setShowBasis(true);
    setBasisVisibility({ i: true, j: true, k: true });
    setShowDot(false);
    setShowAxes(true);
    setShowRelativeAxes(true);
    setSnapToInteger(true);
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasureAnchorId(null);
    setMeasurements([]);
    setEquations(['']);
    setNotebookText('');
    setNotebookCells([createNotebookEquationCell('')]);
    setActiveNotebookCellId(null);
    setNotebookCursor(0);
    setWorkspaceMode('transform');
    setVectorToolMode('vector');
    const initialVector = createVectorState(0, { id: 'v1', name: 'v1' });
    setVectors([initialVector]);
    setActiveVectorId('v1');
    activeVectorIdRef.current = 'v1';
    userVectorRef.current = [parseNumber(initialVector.x), parseNumber(initialVector.y), parseNumber(initialVector.z)];
    vectorRenderValuesRef.current = new Map([['v1', [...userVectorRef.current]]]);
    nextVectorIndexRef.current = 2;
  }, [locale, moveCameraToView, startAnimationTo]);

  const lineSystemInfo = buildLineSystemInfo(lineSystem);
  const resolvedActiveNotebookCellId = activeNotebookCellId ?? notebookCells[0]?.id ?? null;
  const isPanelVisible = isSidebarOpen && !isAnimationFocus;

  return (
    <main className={`app-shell ${isAnimationFocus ? 'animation-focus' : ''}`}>
      <Toaster
        duration={1300}
        gap={8}
        offset={18}
        position="bottom-center"
        richColors
        toastOptions={{
          className: 'app-toast',
        }}
      />
      <AdBlockGate locale={locale} />
      <AdSlot placement="top" locale={locale} />
      <div className="workspace-shell">
      <section className="scene-area" aria-label={t(locale, 'title')}>
        {!isLoaded && (
          <div className="loader">
            <div className="spinner" />
            <span>{t(locale, 'loader')}</span>
          </div>
        )}

        <div className="scene-topbar">
          <div className="scene-title">
            <h1>{t(locale, 'title')}</h1>
            <p>{t(locale, 'subtitle')}</p>
            <div className="scene-utility-row">
              <label className="locale-switcher" title={t(locale, 'language')}>
                <span>{t(locale, 'language')}</span>
                <select
                  onChange={(event) => setLocale(normalizeLocale(event.target.value))}
                  value={locale}
                >
                  {localeOrder.map((key) => (
                    <option key={key} value={key}>{localeMessages[key].name}</option>
                  ))}
                </select>
              </label>
              <button className="utility-pill" onClick={copyShareUrl} type="button">
                <Copy size={13} />
                <span>{t(locale, 'shareUrl')}</span>
              </button>
              <a
                className={`donation-pill ${monetizationConfig.donationUrl ? '' : 'disabled'}`}
                href={monetizationConfig.donationUrl || undefined}
                onClick={(event) => {
                  if (!monetizationConfig.donationUrl) event.preventDefault();
                }}
                rel="noreferrer"
                target="_blank"
                title={t(locale, 'donationText')}
              >
                <span>{monetizationConfig.donationLabel || t(locale, 'donation')}</span>
              </a>
            </div>
          </div>
          <div className="scene-actions">
            <div className="view-actions">
              {Object.entries(viewPresets).map(([viewKey, preset]) => {
                const viewLabel = t(locale, preset.labelKey);
                return (
                  <button
                    className={`view-button ${activeView === viewKey ? 'active' : ''}`}
                    key={viewKey}
                    onClick={() => moveCameraToView(viewKey)}
                    title={t(locale, 'viewTitle', { label: viewLabel })}
                  >
                    {viewLabel}
                  </button>
                );
              })}
              <div className="camera-lock-group" aria-label={t(locale, 'lockControls')}>
                <button
                  aria-pressed={cameraAuto}
                  className={`camera-lock-button camera-auto-button ${cameraAuto ? 'active' : ''}`}
                  onClick={() => {
                    const next = !cameraAuto;
                    setCameraAuto(next);
                    cameraAutoRef.current = next;
                    autoCameraTargetViewRef.current = workspaceMode === 'system' ? effectiveSystemMode : displayMode;
                    if (next) snapCameraToAutoView();
                  }}
                  title={cameraAuto ? t(locale, 'cameraAutoOffTitle') : t(locale, 'cameraAutoTitle')}
                  type="button"
                >
                  <Magnet size={13} />
                  <span>{t(locale, 'cameraAuto')}</span>
                </button>
                <button
                  aria-pressed={allLocked}
                  className={`camera-lock-button ${allLocked ? 'active' : ''}`}
                  onClick={() => {
                    const next = !allLocked;
                    setCameraLocked(next);
                    setZoomLocked(next);
                  }}
                  title={allLocked ? t(locale, 'unlockAllTitle') : t(locale, 'lockAllTitle')}
                  type="button"
                >
                  <Lock size={13} />
                  <span>{t(locale, 'lockAll')}</span>
                </button>
                <button
                  aria-pressed={zoomLocked}
                  className={`camera-lock-button ${zoomLocked ? 'active' : ''}`}
                  onClick={() => setZoomLocked((value) => !value)}
                  title={zoomLocked ? t(locale, 'unlockZoomTitle') : t(locale, 'lockZoomTitle')}
                  type="button"
                >
                  <ZoomIn size={13} />
                  <span>{t(locale, 'lockZoom')}</span>
                </button>
                <button
                  aria-pressed={cameraLocked}
                  className={`camera-lock-button ${cameraLocked ? 'active' : ''}`}
                  onClick={() => setCameraLocked((value) => !value)}
                  title={cameraLocked ? t(locale, 'unlockCameraTitle') : t(locale, 'lockCameraTitle')}
                  type="button"
                >
                  <Camera size={13} />
                  <span>{t(locale, 'lockCamera')}</span>
                </button>
              </div>
              {!isSidebarOpen && (
                <button
                  className="icon-text-button dark panel-open-inline"
                  onClick={() => setIsSidebarOpen(true)}
                  title={t(locale, 'panelOpen')}
                  type="button"
                >
                  <Menu size={18} />
                  <span>{t(locale, 'panelButton')}</span>
                </button>
              )}
            </div>
            <div className="scene-control-dock" aria-label={t(locale, 'graphControls')}>
              <div className="rank-chip" title={t(locale, 'rankTitle')}>
                <span>{t(locale, 'rankLabel')}</span>
                <strong>{currentRank}</strong>
                <em>{currentModeLabel}</em>
              </div>
              <div className="control-cluster space-cluster">
                <span className="cluster-label">{t(locale, 'space')}</span>
                <div className="scene-display-toggles compact-group" aria-label={t(locale, 'spaceDisplay')}>
                  <label className={showGrid ? 'active' : ''} title={t(locale, 'baseGridTitle')}>
                    <input
                      checked={showGrid}
                      onChange={(event) => setShowGrid(event.target.checked)}
                      type="checkbox"
                    />
                    <Grid3X3 size={14} />
                    <span>{t(locale, 'baseGrid')}</span>
                  </label>
                  <label className={showRelativeGrid ? 'active' : ''} title={t(locale, 'relativeGridTitle')}>
                    <input
                      checked={showRelativeGrid}
                      onChange={(event) => setShowRelativeGrid(event.target.checked)}
                      type="checkbox"
                    />
                    <Grid3X3 size={14} />
                    <span>{t(locale, 'relativeGrid')}</span>
                  </label>
                  <label
                    className="scene-strength-control"
                    title={t(locale, 'relativeGridStrengthTitle')}
                  >
                    <SlidersHorizontal size={13} />
                    <span>{t(locale, 'strength')}</span>
                    <input
                      aria-label={t(locale, 'relativeGridStrengthTitle')}
                      max="1"
                      min="0.2"
                      onChange={(event) => setRelativeGridStrength(normalizeRelativeGridStrength(event.target.value))}
                      step="0.05"
                      type="range"
                      value={relativeGridStrength}
                    />
                    <em>{Math.round(relativeGridStrength * 100)}</em>
                  </label>
                  <label className={showAxes ? 'active' : ''} title={t(locale, 'axesTitle')}>
                    <input
                      checked={showAxes}
                      onChange={(event) => setShowAxes(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'axes')}</span>
                  </label>
                  <label className={showRelativeAxes ? 'active' : ''} title={t(locale, 'relativeAxesTitle')}>
                    <input
                      checked={showRelativeAxes}
                      onChange={(event) => setShowRelativeAxes(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'relativeAxes')}</span>
                  </label>
                  <label className={showCoordinates ? 'active' : ''} title={t(locale, 'coordinatesTitle')}>
                    <input
                      checked={showCoordinates}
                      onChange={(event) => setShowCoordinates(event.target.checked)}
                      type="checkbox"
                    />
                    <Braces size={14} />
                    <span>{t(locale, 'coordinates')}</span>
                  </label>
                  <label className={snapToInteger ? 'active' : ''} title={t(locale, 'snapDragTitle')}>
                    <input
                      checked={snapToInteger}
                      onChange={(event) => setSnapToInteger(event.target.checked)}
                      type="checkbox"
                    />
                    <Magnet size={14} />
                    <span>{t(locale, 'snapDrag')}</span>
                  </label>
                </div>
              </div>

              <div className="control-cluster vector-cluster">
                <span className="cluster-label">{t(locale, 'vector')}</span>
                <div className="scene-display-toggles compact-group" aria-label={t(locale, 'vectorDisplay')}>
                  <label className={showVector ? 'active' : ''} title={t(locale, 'vectorDisplay')}>
                    <input
                      checked={showVector}
                      onChange={(event) => setShowVector(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'vector')}</span>
                  </label>
                  <label className={showBasis ? 'active' : ''} title={t(locale, 'basisDisplay')}>
                    <input
                      checked={showBasis}
                      onChange={(event) => setShowBasis(event.target.checked)}
                      type="checkbox"
                    />
                    <Braces size={14} />
                    <span>{t(locale, 'basis')}</span>
                  </label>
                </div>

                {workspaceMode === 'transform' && (
                  <div className="scene-vector-legend vector-chip-row" aria-label={t(locale, 'vectorLegend')}>
                    <div className="legend-tools vector-visibility-tools" aria-label={t(locale, 'vectorAllDisplay')}>
                      <button
                        className="legend-tool"
                        onClick={hideAllVectorTargets}
                        title={t(locale, 'hideAll')}
                        type="button"
                      >
                        <EyeOff size={12} />
                      </button>
                      <button
                        className="legend-tool"
                        onClick={showAllVectorTargets}
                        title={t(locale, 'showAll')}
                        type="button"
                      >
                        <Eye size={12} />
                      </button>
                    </div>
                    {visibleBasisItems.map((item) => {
                      const targetId = `b:${item.id}`;
                      const itemVisible = basisVisibility[item.id] !== false;
                      return (
                        <div
                          className={`legend-vector basis-legend ${itemVisible ? 'active' : 'muted'} ${measureDraft.includes(targetId) ? 'selected' : ''}`}
                          key={targetId}
                          style={{ '--vector-color': item.colorHex }}
                        >
                          <button
                            aria-pressed={itemVisible}
                            className="legend-toggle"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleBasisLegendClick(item.id);
                            }}
                            title={`${item.name} ${measureMode ? t(locale, 'chooseForMeasure') : itemVisible ? t(locale, 'hide') : t(locale, 'show')}`}
                            type="button"
                          >
                            <span className="legend-swatch" />
                            <span>{item.name}</span>
                          </button>
                        </div>
                      );
                    })}
                    {transformedVectorItems.map((item) => (
                      <div
                        className={`legend-vector ${item.visible ? 'active' : 'muted'} ${
                          item.id === activeVectorId || measureDraft.includes(`v:${item.id}`) ? 'selected' : ''
                        }`}
                        key={item.id}
                        style={{ '--vector-color': item.colorHex }}
                      >
                        <button
                          aria-pressed={item.visible}
                          className="legend-toggle"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleVectorLegendClick(item.id);
                          }}
                          title={`${item.name} ${measureMode ? t(locale, 'chooseForMeasure') : item.visible ? t(locale, 'hide') : t(locale, 'show')} · ${formatCompactCoord(item.transformed, displayMode, 1)}`}
                          type="button"
                        >
                          <span className="legend-swatch" />
                          <span>{item.name}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {workspaceMode === 'transform' && (
                <div className="control-cluster measure-cluster">
                  <span className="cluster-label">{t(locale, 'measurement')}</span>
                  <div className="scene-vector-legend measure-chip-row" aria-label={t(locale, 'makeMeasurement')}>
                    <div className="legend-tools" aria-label={t(locale, 'makeMeasurement')}>
                      <button
                        className={`legend-tool ${measureMode === 'dot' ? 'active' : ''}`}
                        onClick={() => toggleMeasureMode('dot')}
                        title={t(locale, 'dotMakeTitle')}
                        type="button"
                      >
                        <Sigma size={12} />
                      </button>
                      <button
                        className={`legend-tool ${measureMode === 'volume' ? 'active' : ''}`}
                        onClick={() => toggleMeasureMode('volume')}
                        title={t(locale, 'volumeMakeTitle')}
                        type="button"
                      >
                        <Box size={12} />
                      </button>
                    </div>
                    {measureMode && (
                      <span className="measure-draft-chip">
                        {measureMode === 'dot'
                          ? t(locale, 'dot')
                          : displayMode === '3d'
                            ? t(locale, 'volume')
                            : displayMode === '2d'
                              ? t(locale, 'area')
                              : t(locale, 'length')}
                        <strong>
                          {measureDraft
                            .map((id) => measureTargetMap.get(id)?.name)
                            .filter(Boolean)
                            .join(' → ') || t(locale, 'targetSelect')}
                        </strong>
                      </span>
                    )}
                    {measurementSummaries.map((item) => (
                      <div
                        className={`measure-chip measure-${item.type} ${item.type === 'volume' && item.targetIds?.length === 2 ? 'measure-area' : ''} ${item.visible === false ? 'muted' : ''}`}
                        key={item.id}
                      >
                        <button
                          onClick={() => toggleMeasurementVisible(item.id)}
                          title={t(locale, 'toggleMeasurement', { type: item.type === 'dot' ? t(locale, 'dot') : t(locale, 'volume') })}
                          type="button"
                        >
                          <span>{item.type === 'dot' ? '∑' : '□'}</span>
                          <strong>{item.label}</strong>
                          {item.value !== null && <em>{formatNumber(item.value)}</em>}
                        </button>
                        <button
                          className="measure-remove"
                          onClick={() => removeMeasurement(item.id)}
                          title={t(locale, 'removeMeasurement')}
                          type="button"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="scene-canvas"
          onPointerLeave={() => {
            setMeasurePointer(null);
            setHoveredMeasureTargetId(null);
          }}
          onPointerMove={updateMeasurePointer}
          ref={containerRef}
        >
          {measureDraftGuide && (
            <svg
              aria-hidden="true"
              className={`measure-draft-guide ${measureDraftGuide.snapped ? 'snapped' : ''}`}
            >
              <line
                x1={measureDraftGuide.x1}
                y1={measureDraftGuide.y1}
                x2={measureDraftGuide.x2}
                y2={measureDraftGuide.y2}
              />
              <circle cx={measureDraftGuide.x2} cy={measureDraftGuide.y2} r="4" />
            </svg>
          )}
          {dragSnapGuide && (
            <>
              <svg aria-hidden="true" className="drag-snap-guide">
                <line
                  x1={dragSnapGuide.x1}
                  y1={dragSnapGuide.y1}
                  x2={dragSnapGuide.x2}
                  y2={dragSnapGuide.y2}
                />
                <circle cx={dragSnapGuide.x2} cy={dragSnapGuide.y2} r="4" />
              </svg>
            </>
          )}
          {workspaceMode === 'system' && activeNotebookCaption && (
            <div className="scene-caption" aria-live="polite">
              <span>{activeNotebookCaption}</span>
            </div>
          )}
          <span ref={vectorVolumeLabelRef} className="axis-label vector-volume-label">
            {t(locale, 'volume')} = 0
          </span>
          <span
            ref={iLabelRef}
            className={`axis-label axis-i draggable-axis measure-target-label ${measureDraft.includes('b:i') ? 'selected' : ''} ${hoveredMeasureTargetId === 'b:i' ? 'hovered' : ''}`}
            data-drag-key="i"
            onClick={(event) => {
              if (!measureMode) return;
              event.stopPropagation();
              if (measureDraft.length === 0) {
                startMeasurementFrom(measureMode, 'b:i', event);
                return;
              }
              pickMeasureTarget('b:i');
            }}
            onPointerEnter={() => setHoveredMeasureTargetId('b:i')}
            onPointerLeave={() => setHoveredMeasureTargetId(null)}
          >
            <span className="axis-label-text">i′</span>
            {renderLabelMeasureTools('b:i')}
          </span>
          <span
            ref={jLabelRef}
            className={`axis-label axis-j draggable-axis measure-target-label ${measureDraft.includes('b:j') ? 'selected' : ''} ${hoveredMeasureTargetId === 'b:j' ? 'hovered' : ''}`}
            data-drag-key="j"
            onClick={(event) => {
              if (!measureMode) return;
              event.stopPropagation();
              if (measureDraft.length === 0) {
                startMeasurementFrom(measureMode, 'b:j', event);
                return;
              }
              pickMeasureTarget('b:j');
            }}
            onPointerEnter={() => setHoveredMeasureTargetId('b:j')}
            onPointerLeave={() => setHoveredMeasureTargetId(null)}
          >
            <span className="axis-label-text">j′</span>
            {renderLabelMeasureTools('b:j')}
          </span>
          <span
            ref={kLabelRef}
            className={`axis-label axis-k draggable-axis measure-target-label ${measureDraft.includes('b:k') ? 'selected' : ''} ${hoveredMeasureTargetId === 'b:k' ? 'hovered' : ''}`}
            data-drag-key="k"
            onClick={(event) => {
              if (!measureMode) return;
              event.stopPropagation();
              if (measureDraft.length === 0) {
                startMeasurementFrom(measureMode, 'b:k', event);
                return;
              }
              pickMeasureTarget('b:k');
            }}
            onPointerEnter={() => setHoveredMeasureTargetId('b:k')}
            onPointerLeave={() => setHoveredMeasureTargetId(null)}
          >
            <span className="axis-label-text">k′</span>
            {renderLabelMeasureTools('b:k')}
          </span>
          {vectors.map((item) => (
            <span
              className={`axis-label axis-v draggable-axis measure-target-label ${measureDraft.includes(`v:${item.id}`) ? 'selected' : ''} ${hoveredMeasureTargetId === `v:${item.id}` ? 'hovered' : ''}`}
              data-drag-key={item.scalarEnabled ? `s:${item.id}` : `v:${item.id}`}
              key={`label-${item.id}`}
              onClick={(event) => {
                if (!measureMode) return;
                event.stopPropagation();
                if (measureDraft.length === 0) {
                  startMeasurementFrom(measureMode, `v:${item.id}`, event);
                  return;
                }
                pickMeasureTarget(`v:${item.id}`);
              }}
              onPointerEnter={() => setHoveredMeasureTargetId(`v:${item.id}`)}
              onPointerLeave={() => setHoveredMeasureTargetId(null)}
              ref={(node) => {
                if (node) vectorLabelRefs.current.set(item.id, node);
                else vectorLabelRefs.current.delete(item.id);
              }}
              style={{ color: colorToHex(item.color) }}
            >
              <span className="axis-label-text">{item.name}′</span>
              {renderLabelMeasureTools(`v:${item.id}`)}
            </span>
          ))}
          {vectors.map((item) => (
            <span
              className="axis-label axis-dot"
              key={`dot-${item.id}`}
              ref={(node) => {
                if (node) vectorDotLabelRefs.current.set(item.id, node);
                else vectorDotLabelRefs.current.delete(item.id);
              }}
              style={{ color: colorToHex(item.color) }}
            >
              A{activeVector.name}·A{item.name}
            </span>
          ))}
          {measurements.map((item) => {
            const measureKind = item.type === 'volume'
              ? volumeMeasureKind(item.targets?.length ?? 0, displayMode)
              : item.type;
            return (
              <span
                className={`axis-label measurement-label measurement-${measureKind}`}
                key={`measurement-${item.id}`}
                ref={(node) => {
                  if (node) measurementLabelRefs.current.set(item.id, node);
                  else measurementLabelRefs.current.delete(item.id);
                }}
              >
                <span className="axis-label-text">{item.type === 'dot' ? t(locale, 'dot') : t(locale, measureKind)}</span>
                {renderMeasurementLabelTools(item)}
              </span>
            );
          })}
          {equationLabelItems.map((item) => (
            <span
              className="axis-label equation-schema-label"
              key={`equation-label-${item.key}`}
              ref={(node) => {
                if (node) equationLabelRefs.current.set(item.key, node);
                else equationLabelRefs.current.delete(item.key);
              }}
              style={{ color: colorToHex(item.color) }}
            >
              <span className="axis-label-text">{item.name}</span>
            </span>
          ))}
          <span ref={scalarSolutionLabelRef} className="axis-label scalar-solution-label">
            {t(locale, 'solution')} x = (0, 0, 0)
          </span>
          <span ref={equationSolutionLabelRef} className="axis-label equation-solution-label">
            {t(locale, 'solution')} x = (0, 0)
          </span>
        </div>

        {workspaceMode === 'transform' && (
        <div className="progress-dock">
          <button
            className="icon-text-button danger"
            onClick={resetTransformation}
            title={t(locale, 'resetSpace')}
          >
            <RotateCcw size={18} />
            <span>{t(locale, 'reset')}</span>
          </button>
          <div className="progress-block">
            <div className="progress-meta">
              <span>{t(locale, 'animationLabel')}</span>
              <strong>{Math.round(progress * 100)}%</strong>
            </div>
            <div
              aria-label={t(locale, 'animationProgress')}
              aria-valuemax="100"
              aria-valuemin="0"
              aria-valuenow={Math.round(progress * 100)}
              className="progress-scrubber"
              onKeyDown={handleProgressKeyDown}
              onPointerDown={handleProgressPointerDown}
              ref={scrubTrackRef}
              role="slider"
              tabIndex={0}
            >
              <span className="progress-scrubber-fill" style={{ width: `${progress * 100}%` }} />
              <span className="progress-scrubber-thumb" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
          <button
            aria-pressed={isAnimationFocus}
            className={`icon-text-button animation-focus-button ${isAnimationFocus ? 'active' : ''}`}
            onClick={() => setIsAnimationFocus((value) => !value)}
            title={t(locale, isAnimationFocus ? 'animationFocusExitTitle' : 'animationFocusTitle')}
            type="button"
          >
            {isAnimationFocus ? <EyeOff size={17} /> : <Eye size={17} />}
            <span>{t(locale, isAnimationFocus ? 'animationFocusExit' : 'animationFocus')}</span>
          </button>
        </div>
        )}

        {workspaceMode === 'system' && (
          <div className="notebook-scene-dock">
            <button
              className={`notebook-scene-play ${notebookPlaying ? 'playing' : ''}`}
              onClick={toggleSmartNotebookPlayback}
              title={t(locale, notebookPlaying ? 'stopNotebookCell' : 'runNotebookCell')}
              type="button"
            >
              {notebookPlaying ? <Square size={13} /> : <Play size={14} />}
            </button>
            <div className="notebook-scene-progress">
              <div className="progress-meta notebook-scene-meta">
                <span>{t(locale, 'notebookProgress')}</span>
                <strong>{Math.round(notebookCursor)}%</strong>
              </div>
              <div
                aria-label={t(locale, 'notebookProgress')}
                aria-valuemax="100"
                aria-valuemin="0"
                aria-valuenow={Math.round(notebookCursor)}
                className="notebook-scene-scrubber"
                onKeyDown={handleNotebookProgressKeyDown}
                onPointerDown={handleNotebookSceneProgressPointerDown}
                ref={notebookSceneProgressRef}
                role="slider"
                tabIndex={0}
              >
                <span className="notebook-scene-track" />
                <span className="notebook-scene-fill" style={{ width: `${notebookCursor}%` }} />
                {notebookTimelineMarks.map((mark) => (
                  <button
                    className={`notebook-scene-mark ${mark.kind ?? ''} ${mark.lineIndex <= notebookActiveLineIndex ? 'revealed' : 'future'}`}
                    key={`${mark.lineIndex}-${mark.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      jumpNotebookToLine(mark.lineIndex);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    style={{
                      left: `${mark.percent}%`,
                      '--line-color': mark.color ? colorToHex(mark.color) : '#8b5cf6',
                    }}
                    title={mark.label}
                    type="button"
                  >
                    {mark.label}
                  </button>
                ))}
                <span className="notebook-scene-thumb" style={{ left: `${notebookCursor}%` }} />
              </div>
            </div>
            <button
              aria-pressed={isAnimationFocus}
              className={`icon-text-button animation-focus-button ${isAnimationFocus ? 'active' : ''}`}
              onClick={() => setIsAnimationFocus((value) => !value)}
              title={t(locale, isAnimationFocus ? 'animationFocusExitTitle' : 'animationFocusTitle')}
              type="button"
            >
              {isAnimationFocus ? <EyeOff size={17} /> : <Eye size={17} />}
              <span>{t(locale, isAnimationFocus ? 'animationFocusExit' : 'animationFocus')}</span>
            </button>
          </div>
        )}
      </section>

      <aside
        className={`control-panel ${isPanelVisible ? 'open' : 'closed'}`}
        onDragStart={preventPanelNativeDrag}
        onPointerCancel={stopPanelPointerPropagation}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={stopPanelPointerPropagation}
        onPointerUp={stopPanelPointerPropagation}
        onWheel={stopPanelPointerPropagation}
        style={{
          bottom: '0px',
          clipPath: isPanelVisible ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)',
          opacity: isPanelVisible ? 1 : 0,
          pointerEvents: isPanelVisible ? 'auto' : 'none',
          transform: 'none',
          '--panel-mobile-clip': isPanelVisible ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)',
          '--panel-mobile-opacity': isPanelVisible ? 1 : 0,
          '--panel-mobile-pointer': isPanelVisible ? 'auto' : 'none',
        }}
      >
        <header className="panel-header">
          <div>
            <p className="eyebrow">{t(locale, 'panelEyebrow')}</p>
            <h2>{t(locale, 'panelTitle')}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => setIsSidebarOpen(false)}
            title={t(locale, 'panelClose')}
          >
            <PanelRightClose size={20} />
          </button>
        </header>

        <div className="workspace-tabs" role="tablist" aria-label={t(locale, 'workspaceMode')}>
          <button
            className={workspaceMode === 'transform' ? 'active' : ''}
            onClick={() => switchWorkspaceMode('transform')}
          >
            {t(locale, 'transform')}
          </button>
          <button
            className={workspaceMode === 'system' ? 'active' : ''}
            onClick={() => switchWorkspaceMode('system')}
          >
            {t(locale, 'system')}
          </button>
        </div>

        <div className={`panel-scroll mode-${workspaceMode}`} ref={panelScrollRef}>
          {workspaceMode === 'transform' && (
            <section className="panel transform-inline-timeline" aria-label={t(locale, 'spaceTimeline')}>
              <div
                className="drawer-history-list"
                aria-label={t(locale, 'transformHistory')}
                ref={historyStripRef}
              >
                {displayedHistoryEntries.map(({ step, index }) => (
                  <div
                    className={`history-item ${index === activeHistoryIndex ? 'active' : ''} ${
                      index === previewIndex && index !== activeHistoryIndex ? 'preview' : ''
                    }`}
                    data-history-index={index}
                    key={`${step.name}-${index}`}
                    onFocus={() => setHoveredHistoryIndex(index)}
                    onMouseEnter={() => setHoveredHistoryIndex(index)}
                    onMouseMove={() => setHoveredHistoryIndex(index)}
                    onMouseLeave={() => setHoveredHistoryIndex(null)}
                    onPointerEnter={() => setHoveredHistoryIndex(index)}
                    onPointerMove={() => setHoveredHistoryIndex(index)}
                    onPointerLeave={() => setHoveredHistoryIndex(null)}
                  >
                    <button
                      className="history-pill"
                      onBlur={() => setHoveredHistoryIndex(null)}
                      onClick={() => jumpToHistory(index)}
                      title={step.name}
                    >
                      <span className="history-index">{index}</span>
                      <strong>{step.name}</strong>
                      <MatrixMini
                        matrix={step.matrix}
                        mode={step.stateMode ?? modeForMatrix(step.matrix)}
                        className="compact"
                      />
                    </button>
                    {history.length > 1 && (
                      <button
                        className="history-delete"
                        onClick={(event) => deleteHistoryEntry(index, event)}
                        onPointerDown={(event) => event.stopPropagation()}
                        title={t(locale, 'deleteHistory')}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel system-main-panel">
            <div className="section-heading spread">
              <span className="heading-left">
                <Braces size={17} />
                <h3>{t(locale, 'notebook')}</h3>
              </span>
              <div className="notebook-add-top">
                <button
                  className={`tiny-add-button notebook-play-toggle ${notebookPlaying ? 'playing' : ''}`}
                  onClick={toggleSmartNotebookPlayback}
                  title={t(locale, notebookPlaying ? 'stopNotebookCell' : 'runNotebookCell')}
                  type="button"
                >
                  {notebookPlaying ? <Square size={13} /> : <Play size={14} />}
                  <span>{t(locale, notebookPlaying ? 'stopNotebookCell' : 'runNotebookCell')}</span>
                </button>
                <label className="notebook-speed-control" title={t(locale, 'notebookSpeedTitle')}>
                  <span>{t(locale, 'speed')}</span>
                  <input
                    aria-label={t(locale, 'notebookSpeedTitle')}
                    max="1.25"
                    min="0.35"
                    onChange={(event) => setNotebookSpeed(normalizeNotebookSpeed(event.target.value))}
                    step="0.05"
                    type="range"
                    value={notebookSpeed}
                  />
                  <em>{formatNotebookSpeedLabel(notebookSpeed)}</em>
                </label>
              </div>
            </div>

            <div
              className="notebook-runner"
              style={{
                '--notebook-progress': notebookProgressRatio,
                '--notebook-progress-y': `${Math.max(0, Math.min(100, notebookCursor))}%`,
              }}
            >
              <div
                aria-label={t(locale, 'notebookProgress')}
                aria-valuemax="100"
                aria-valuemin="0"
                aria-valuenow={Math.round(notebookCursor)}
                className="notebook-vertical-progress"
                onKeyDown={handleNotebookProgressKeyDown}
                onPointerDown={handleNotebookProgressPointerDown}
                ref={notebookProgressRef}
                role="slider"
                tabIndex={0}
              >
                <span>{Math.round(notebookCursor)}%</span>
              </div>
              <div className="notebook-flow-stack">
                <div className="notebook-cell notebook-smart active">
                  <div className="notebook-cell-index">*</div>
                  <div className="notebook-cell-main">
                    <div
                      className="equation-note-editor smart-notebook-editor"
                      style={{ '--note-lines': notebookLineCount }}
                    >
                      <div className="equation-note-rail smart-note-rail" aria-label={t(locale, 'notebookProgress')}>
                        {Array.from({ length: notebookLineCount }).map((_, lineIndex) => {
                          const mark = notebookScript.marks[lineIndex];
                          const lineState = lineIndex <= notebookActiveLineIndex ? 'revealed' : 'future';
                          const markClassName = mark?.kind
                            ? `smart-mark ${mark.kind} ${lineState} ${mark.hidden ? 'hidden' : ''}`
                            : `smart-mark blank ${lineState}`;
                          if (!mark?.label) {
                            return (
                              <span
                                aria-hidden="true"
                                className={markClassName}
                                key={lineIndex}
                                style={mark?.color ? { '--line-color': `#${mark.color.toString(16).padStart(6, '0')}` } : undefined}
                              />
                            );
                          }
                          return (
                            <button
                              aria-label={`${mark.label} ${t(locale, 'runNotebookCell')}`}
                              className={markClassName}
                              key={lineIndex}
                              onDoubleClick={mark?.kind === 'vector' ? () => renameSmartNotebookVariable(lineIndex, mark.label) : undefined}
                              onClick={() => playSmartNotebookFromLine(lineIndex)}
                              style={mark?.color ? { '--line-color': `#${mark.color.toString(16).padStart(6, '0')}` } : undefined}
                              title={mark?.kind === 'vector' ? '더블클릭해서 변수명 수정' : mark?.kind === 'matrix' ? t(locale, 'notebookMatrixCell') : undefined}
                              type="button"
                            >
                              {mark.label}
                            </button>
                          );
                        })}
                      </div>
                      {!notebookText.trim() && (
                        <div className="smart-tab-hint" aria-hidden="true">
                          <kbd>Tab</kbd>
                          <span>자동완성</span>
                        </div>
                      )}
                      {!notebookText.trim() && (
                        <div className="smart-placeholder-overlay" aria-hidden="true">
                          {notebookStarterText(locale).split('\n').map((line, lineIndex, lines) => (
                            <span className="smart-placeholder-line" key={`${lineIndex}-${line}`}>
                              {line || ' '}
                              {lineIndex === lines.length - 1 && <kbd>Tab</kbd>}
                            </span>
                          ))}
                        </div>
                      )}
                      {notebookText.trim() && (
                        <div className="smart-syntax-overlay" aria-hidden="true">
                          {notebookText.split('\n').map((line, lineIndex) => (
                            <span className="smart-syntax-line" key={`syntax-${lineIndex}`}>
                              {renderSmartNotebookSyntaxLine(line, lineIndex)}
                            </span>
                          ))}
                        </div>
                      )}
                      <textarea
                        aria-label={t(locale, 'notebook')}
                        className="smart-notebook-textarea"
                        onBlur={(event) => updateSmartNotebookText(prettifyNotebookScriptText(event.target.value))}
                        onChange={(event) => updateSmartNotebookText(event.target.value, { revealAll: true })}
                        onFocus={(event) => {
                          const textarea = event.currentTarget;
                          if (!textarea.value.trim()) {
                            window.requestAnimationFrame(() => {
                              textarea.selectionStart = 0;
                              textarea.selectionEnd = 0;
                            });
                          }
                        }}
                        onKeyDown={handleSmartNotebookKeyDown}
                        onPaste={() => {
                          notebookReplayFromStartRef.current = true;
                        }}
                        placeholder=""
                        spellCheck="false"
                        value={notebookText}
                        wrap="off"
                      />
                    </div>
                  </div>
                  <div className="notebook-cell-actions">
                    <button
                      className={`notebook-run-button ${notebookPlaying ? 'playing' : ''}`}
                      onClick={toggleSmartNotebookPlayback}
                      type="button"
                    >
                      {notebookPlaying ? <Square size={12} /> : <Play size={13} />}
                      <span>{t(locale, notebookPlaying ? 'stopNotebookCell' : 'runNotebookCell')}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="notebook-status-slot">
              <div className={`line-status-card ${lineSystem.status}`}>
                <div className="solver-topline">
                  <span>{t(locale, 'status')}</span>
                  <strong>{t(locale, statusKeyForLineSystem(lineSystem.status))}</strong>
                </div>
                {lineSystemInfo.kindKey && (
                  <div className="system-solution-readout">
                    <span>{t(locale, 'solution')}</span>
                    <strong>{t(locale, lineSystemInfo.kindKey)}</strong>
                    {lineSystemInfo.solutionText && <code>{lineSystemInfo.solutionText}</code>}
                  </div>
                )}
                {typeof lineSystemInfo.rankA === 'number' && (
                  <div className="system-fact-grid">
                    <span><em>{t(locale, 'systemFactRank')}</em><strong>{lineSystemInfo.rankA} {'->'} {lineSystemInfo.rankAugmented}</strong></span>
                    <span><em>{t(locale, 'systemFactDimension')}</em><strong>{lineSystemInfo.solutionDimension === null ? '-' : `${lineSystemInfo.solutionDimension}D`}</strong></span>
                    <span><em>{t(locale, 'systemFactFree')}</em><strong>{lineSystemInfo.freeCount}</strong></span>
                    <span><em>{t(locale, 'systemFactEquations')}</em><strong>{lineSystemInfo.equationCount}/{lineSystemInfo.variableCount}</strong></span>
                  </div>
                )}
                <p className="system-education-note">{t(locale, lineSystemInfo.noteKey)}</p>
                {!!lineSystem.relations.length && (
                  <div className="relation-list">
                    {lineSystem.relations.map((relation, relationIndex) => (
                      <span key={relationIndex}>{relationText(relation, lineSystem.lines)}</span>
                    ))}
                  </div>
                )}
                {lineSystem.point && (
                  <button className="secondary-action compact-action" onClick={applyLineSystemPointToVector}>
                    {t(locale, 'applyPointToVector', { name: activeVector.name })}
                  </button>
                )}
              </div>
            </div>

            <div className="notebook-example-bank">
              <div className="notebook-example-label">{t(locale, 'systemExamples')}</div>
              <div className="equation-presets line-presets" aria-label={t(locale, 'systemExamples')}>
                <button onClick={() => applyPresetToNotebook(equationExamples.unique)}>{t(locale, 'intersection')}</button>
                <button onClick={() => applyPresetToNotebook(equationExamples.none)}>{t(locale, 'parallel')}</button>
                <button onClick={() => applyPresetToNotebook(equationExamples.infinite)}>{t(locale, 'overlap')}</button>
                <button onClick={() => applyPresetToNotebook(equationExamples.space3d)}>3D</button>
                <button onClick={() => applyPresetToNotebook(equationExamples.overlap3d)}>{t(locale, 'overlap3d')}</button>
              </div>
            </div>

            <div className="equation-presets line-presets" aria-label={t(locale, 'systemExamples')}>
              <button onClick={() => setEquations(equationExamples.unique)}>{t(locale, 'intersection')}</button>
              <button onClick={() => setEquations(equationExamples.none)}>{t(locale, 'parallel')}</button>
              <button onClick={() => setEquations(equationExamples.infinite)}>{t(locale, 'overlap')}</button>
              <button onClick={() => setEquations(equationExamples.space3d)}>3D</button>
              <button onClick={() => setEquations(equationExamples.overlap3d)}>{t(locale, 'overlap3d')}</button>
            </div>

            <div
              className="equation-note-editor"
              style={{ '--note-lines': Math.max(5, equations.length) }}
            >
              <div className="equation-note-rail" aria-hidden="true">
                {equations.map((equation, index) => {
                  const item =
                    lineSystem.mode === '3d'
                      ? lineSystem.planes.find((plane) => plane.index === index)
                      : lineSystem.lines.find((line) => line.index === index);
                  const color = item?.color ?? equationLineColors[index % equationLineColors.length];
                  const prefix = lineSystem.mode === '3d' ? 'P' : 'L';
                  const invalid = lineSystem.errors?.includes(index + 1);
                  return (
                    <span
                      className={invalid ? 'invalid' : ''}
                      key={index}
                      style={{ '--line-color': `#${color.toString(16).padStart(6, '0')}` }}
                    >
                      {prefix}{index + 1}
                    </span>
                  );
                })}
              </div>
              <textarea
                aria-label={t(locale, 'equationNote')}
                spellCheck="false"
                wrap="off"
                value={equations.join('\n')}
                placeholder={t(locale, 'equationNotePlaceholder')}
                onKeyDown={handleEquationNoteKeyDown}
                onBlur={(event) => updateEquationNote(prettifyEquationNoteText(event.target.value))}
                onChange={(event) => updateEquationNote(event.target.value)}
              />
            </div>

            <div className={`line-status-card ${lineSystem.status}`}>
              <div className="solver-topline">
                <span>{t(locale, 'status')}</span>
                <strong>{t(locale, statusKeyForLineSystem(lineSystem.status))}</strong>
              </div>
              {lineSystemInfo.kindKey && (
                <div className="system-solution-readout">
                  <span>{t(locale, 'solution')}</span>
                  <strong>{t(locale, lineSystemInfo.kindKey)}</strong>
                  {lineSystemInfo.solutionText && <code>{lineSystemInfo.solutionText}</code>}
                </div>
              )}
              {typeof lineSystemInfo.rankA === 'number' && (
                <div className="system-fact-grid">
                  <span>
                    <em>{t(locale, 'systemFactRank')}</em>
                    <strong>{lineSystemInfo.rankA} → {lineSystemInfo.rankAugmented}</strong>
                  </span>
                  <span>
                    <em>{t(locale, 'systemFactDimension')}</em>
                    <strong>{lineSystemInfo.solutionDimension === null ? '-' : `${lineSystemInfo.solutionDimension}D`}</strong>
                  </span>
                  <span>
                    <em>{t(locale, 'systemFactFree')}</em>
                    <strong>{lineSystemInfo.freeCount}</strong>
                  </span>
                  <span>
                    <em>{t(locale, 'systemFactEquations')}</em>
                    <strong>{lineSystemInfo.equationCount}/{lineSystemInfo.variableCount}</strong>
                  </span>
                </div>
              )}
              {lineSystem.status === 'invalid' && (
                <p className="solver-note">{t(locale, 'invalidLineNote', { items: lineSystem.errors.join(', L') })}</p>
              )}
              {lineSystem.status === 'same' && (
                <p className="line-note">{t(locale, 'sameLineNote')}</p>
              )}
              {lineSystem.status === 'parallel' && (
                <p className="line-note">{t(locale, 'parallelLineNote')}</p>
              )}
              {lineSystem.status === 'none' && (
                <p className="line-note">{t(locale, 'noCommonLineNote')}</p>
              )}
              {lineSystem.status === 'single3d' && (
                <p className="line-note">{t(locale, 'single3dNote')}</p>
              )}
              {lineSystem.status === 'infinite3d' && (
                <>
                  <p className="line-note">{t(locale, 'infinite3dNote')}</p>
                </>
              )}
              {lineSystem.status === 'none3d' && (
                <p className="line-note">{t(locale, 'no3dNote')}</p>
              )}
              <p className="system-education-note">{t(locale, lineSystemInfo.noteKey)}</p>
              {!!lineSystem.relations.length && (
                <div className="relation-list">
                  {lineSystem.relations.map((relation, index) => (
                    <span key={index}>{relationText(relation, lineSystem.lines)}</span>
                  ))}
                </div>
              )}
              {lineSystem.point && (
                <button className="secondary-action compact-action" onClick={applyLineSystemPointToVector}>
                  {t(locale, 'applyPointToVector', { name: activeVector.name })}
                </button>
              )}
            </div>

            {false && (
            <div className="notebook-cell-stack">
              <div className="notebook-cell-head">
                <span>{t(locale, 'notebook')}</span>
                <button className="tiny-add-button" onClick={addNotebookMatrixCell} title={t(locale, 'addNotebookCell')} type="button">
                  <Plus size={14} />
                </button>
              </div>
              {notebookCells.map((cell, index) => (
                <div className="notebook-matrix-cell" key={cell.id}>
                  <div className="notebook-cell-index">{index + 1}</div>
                  <div className="notebook-cell-main">
                    <div className="notebook-cell-title">
                      <strong>{t(locale, 'notebookMatrixCell')}</strong>
                      <span>{notebookMatrixModeFromText(cell.text, cell.mode).toUpperCase()}</span>
                    </div>
                    <MatrixInput
                      values={cell.values}
                      columns={systemMatrixDimension}
                      accent={cell.mode === '3d' ? 'teal' : 'red'}
                      onChange={(values) => updateNotebookCellValues(cell.id, values)}
                      onEnter={() => runNotebookMatrixCell(cell)}
                      locale={locale}
                    />
                  </div>
                  <div className="notebook-cell-actions">
                    <button className="notebook-run-button" onClick={() => runNotebookMatrixCell(cell)} type="button">
                      <Play size={13} />
                      <span>{t(locale, 'runNotebookCell')}</span>
                    </button>
                    <label className="notebook-progress-control">
                      <span>{Math.round(progress * 100)}%</span>
                      <input
                        aria-label={t(locale, 'notebookProgress')}
                        max="100"
                        min="0"
                        onChange={(event) => scrubNotebookProgress(event.target.value)}
                        type="range"
                        value={Math.round(progress * 100)}
                      />
                    </label>
                    <button
                      className="notebook-remove-button"
                      disabled={notebookCells.length <= 1}
                      onClick={() => removeNotebookCell(cell.id)}
                      title={t(locale, 'deleteEquation')}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>

          <section className="panel current-space-panel">
            <div className="section-heading spread current-space-heading">
              <span className="heading-left">
                <Grid3X3 size={17} />
                <h3>{t(locale, 'currentSpace')}</h3>
              </span>
              <button
                aria-expanded="true"
                className="timeline-open-button"
                onClick={() => historyStripRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
                type="button"
              >
                {t(locale, 'timeline')}
                <span>{history.length}</span>
              </button>
            </div>
            {previewHistory && (
              <HistoryDetail
                entry={previewHistory}
                index={previewIndex}
                isActive={previewIndex === activeHistoryIndex}
                locale={locale}
              />
            )}
          </section>

          <section className="panel matrix-panel">
            <div className="section-heading spread">
              <span className="heading-left">
                <Braces size={17} />
                <h3>{t(locale, 'matrixInput')}</h3>
              </span>
              <div className="matrix-header-tools">
                <div className="matrix-clipboard">
                  <button aria-label={t(locale, 'matrixCopy')} onClick={copyMatrixInput} title={t(locale, 'matrixCopy')}>
                    <Copy size={14} />
                  </button>
                  <button
                    aria-label={t(locale, 'matrixPaste')}
                    onClick={pasteMatrixInput}
                    title={t(locale, 'matrixPaste')}
                  >
                    <ClipboardPaste size={14} />
                  </button>
                </div>
                <div className="segmented" role="tablist" aria-label={t(locale, 'matrixDimension')}>
                  <button className={inputMode === '3d' ? 'active' : ''} onClick={() => setInputMode('3d')}>3x{inputColumns}</button>
                  <button className={inputMode === '2d' ? 'active' : ''} onClick={() => setInputMode('2d')}>2x{inputColumns}</button>
                  <button className={inputMode === '1d' ? 'active' : ''} onClick={() => setInputMode('1d')}>1x{inputColumns}</button>
                </div>
              </div>
            </div>
            <div className="matrix-workspace">
              <div className="matrix-input-column">
                <div className="matrix-input-zone">
                  <MatrixInput
                    values={previewMatrixInputValues}
                    columns={inputColumns}
                    accent={
                      hoveredMatrixPreset
                        ? 'preview'
                        : inputMode === '3d'
                          ? 'teal'
                          : inputMode === '2d'
                            ? 'red'
                            : 'gold'
                    }
                    onChange={updateMatrixInputValues}
                    onEnter={applyCurrentInput}
                    locale={locale}
                  />
                </div>

                <button className="primary-action" onClick={applyCurrentInput}>
              {t(locale, 'applyMatrix')}
            </button>
              </div>
              <div className="matrix-preset-dock">
              <div className="preset-dock-head">
                <RotateCcw size={14} />
                <span>{t(locale, 'matrixPresets')}</span>
              </div>
              <div className="matrix-presets">
                {visibleMatrixPresets.map((preset) => (
                  <div className="matrix-preset-item" key={preset.id}>
                  <button
                    className={`${activeMatrixPresetId === preset.id ? 'active' : ''} ${hoveredMatrixPresetId === preset.id ? 'previewing' : ''}`}
                    onClick={() => loadPresetToMatrixInput(preset)}
                    onBlur={() => setHoveredMatrixPresetId(null)}
                    onFocus={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseLeave={() => setHoveredMatrixPresetId(null)}
                    onPointerEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onPointerLeave={() => setHoveredMatrixPresetId(null)}
                    ref={(node) => {
                      if (node) {
                        matrixPresetRefs.current[preset.id] = node;
                      } else {
                        delete matrixPresetRefs.current[preset.id];
                      }
                    }}
                    title={t(locale, 'presetLoadTitle', { name: preset.name })}
                    type="button"
                  >
                    <strong>{preset.name}</strong>
                  </button>
                  <button
                    aria-label={t(locale, 'presetApplyTitle', { name: preset.name })}
                    className="matrix-preset-apply"
                    onBlur={() => setHoveredMatrixPresetId(null)}
                    onClick={(event) => applyMatrixPresetDirectly(preset, event)}
                    onFocus={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onMouseLeave={() => setHoveredMatrixPresetId(null)}
                    onPointerEnter={() => setHoveredMatrixPresetId(preset.id)}
                    onPointerLeave={() => setHoveredMatrixPresetId(null)}
                    title={t(locale, 'presetApplyNow')}
                    type="button"
                  >
                    <Play size={12} />
                  </button>
                  </div>
                ))}
              </div>
              </div>
            </div>
          </section>

          <section className="panel vector-panel vector-solver-panel">
            <div className="section-heading spread">
              <span className="heading-left">
                <VectorSquare size={17} />
                <h3>{t(locale, 'vectorTracking')}</h3>
              </span>
              <div className="vector-heading-tools">
                <button className="tiny-add-button" onClick={addVector} title={t(locale, 'addVector')} type="button">
                  <Plus size={14} />
                </button>
              </div>
              <div className="segmented compact" role="tablist" aria-label={t(locale, 'vectorTools')}>
                <button
                  className={vectorToolMode === 'vector' ? 'active' : ''}
                  onClick={() => setVectorToolMode('vector')}
                >
                  {t(locale, 'vector')}
                </button>
                <button
                  className={vectorToolMode === 'system' ? 'active' : ''}
                  onClick={() => setVectorToolMode('system')}
                >
                  {t(locale, 'system')}
                </button>
              </div>
            </div>

            {vectorToolMode === 'vector' && (
              <div className="vector-stack">
                <div className={`basis-stack mode-${displayMode}`}>
                  <div className="vector-subhead">
                    <strong>{t(locale, 'baseBasis')}</strong>
                    <span>{t(locale, 'fixed')}</span>
                  </div>
                  <div className="basis-compact-card">
                    {visibleBasisItems.map((item) => {
                      const itemVisible = basisVisibility[item.id] !== false;
                      return (
                      <div
                        className={`basis-compact-row ${itemVisible ? '' : 'scene-hidden'}`}
                        key={item.id}
                        style={{ '--vector-color': item.colorHex }}
                      >
                        <span className="vector-chip locked-chip basis-chip">
                          <span className="vector-swatch" />
                          {item.name}
                        </span>
                        <div className={`basis-compact-inputs mode-${displayMode}`}>
                          {(displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z']).map((axis) => {
                            const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
                            return (
                            <input
                              aria-label={`${item.name} ${axis}`}
                              key={axis}
                              value={formatInputValue(item.values[axisIndex])}
                              inputMode="decimal"
                              onChange={(event) => updateBasisInputValue(item.id, axis, event.target.value)}
                            />
                            );
                          })}
                        </div>
                        <span className="basis-compact-meta">
                          {formatCompactCoord(item.values, '3d', 1)} · {formatNumber(item.lengthSquared, 1)}
                        </span>
                        <button
                          aria-label={`${item.name} ${itemVisible ? t(locale, 'hide') : t(locale, 'show')}`}
                          className={`visibility-toggle-button ${itemVisible ? '' : 'muted'}`}
                          onClick={() => toggleBasisVisible(item.id)}
                          title={`${item.name} ${itemVisible ? t(locale, 'hide') : t(locale, 'show')}`}
                          type="button"
                        >
                          {itemVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          aria-label={t(locale, 'resetBasisAria', { name: item.name })}
                          className="basis-reset-button"
                          onClick={() => resetBasisVector(item.id)}
                          title={t(locale, 'resetBasis', { name: item.name })}
                          type="button"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
                {transformedVectorItems.map((item) => {
                  const axes = displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z'];
                  return (
                    <div
                      className={`vector-card ${item.id === activeVectorId ? 'active' : ''} ${measureDraft.includes(`v:${item.id}`) ? 'measuring' : ''} ${showVector ? '' : 'muted'} ${item.visible ? '' : 'scene-hidden'} ${item.scalarEnabled ? 'scalar-active' : ''}`}
                      data-vector-id={item.id}
                      key={item.id}
                      style={{ '--vector-color': item.colorHex }}
                    >
                      <div className="vector-card-head">
                        <div className="vector-chip-wrap">
                          <button
                            className="vector-chip"
                            aria-pressed={item.visible}
                            onClick={() => {
                              setActiveVectorId(item.id);
                              toggleVectorVisible(item.id);
                            }}
                            title={`${item.name} ${item.visible ? t(locale, 'hide') : t(locale, 'show')}`}
                            type="button"
                          >
                            <span className="vector-swatch" />
                            {item.name}
                          </button>
                        </div>
                        <div className={`vector-inline-inputs mode-${displayMode} has-scalar ${item.scalarEnabled ? '' : 'scalar-off'}`}>
                          {axes.map((axis) => (
                            <label className="vector-inline-field" key={axis}>
                              <span>{axis}</span>
                              <input
                                value={item[axis]}
                                inputMode="decimal"
                                onChange={(event) => updateVectorValue(item.id, axis, event.target.value)}
                                onFocus={() => setActiveVectorId(item.id)}
                              />
                            </label>
                          ))}
                          {item.scalarEnabled && (
                            <label className="vector-inline-field scalar-inline-field">
                              <span>=</span>
                              <input
                                aria-label={t(locale, 'scalarValue', { name: item.name })}
                                inputMode="decimal"
                                placeholder={t(locale, 'auto')}
                                value={cleanScalarText(item.scalar)}
                                onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                                onFocus={() => setActiveVectorId(item.id)}
                              />
                            </label>
                          )}
                        </div>
                        <label className={`scalar-mini-toggle ${item.scalarEnabled ? 'active' : ''}`} title={t(locale, 'scalarConstraint')}>
                          <input
                            checked={item.scalarEnabled}
                            onChange={(event) => toggleVectorScalar(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          <span>{t(locale, 'scalar')}</span>
                        </label>
                        <button
                          aria-label={`${item.name} ${item.visible ? t(locale, 'hide') : t(locale, 'show')}`}
                          className={`visibility-toggle-button ${item.visible ? '' : 'muted'}`}
                          onClick={() => toggleVectorVisible(item.id)}
                          title={`${item.name} ${item.visible ? t(locale, 'hide') : t(locale, 'show')}`}
                          type="button"
                        >
                          {item.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          className="line-remove"
                          onClick={() => removeVector(item.id)}
                          title={t(locale, 'vectorDelete')}
                          type="button"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className={`scalar-control ${item.scalarEnabled ? 'active' : ''}`}>
                        <label className="compact-check scalar-toggle">
                          <input
                            checked={item.scalarEnabled}
                            onChange={(event) => toggleVectorScalar(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          {t(locale, 'scalar')}
                        </label>
                        <input
                          aria-label={t(locale, 'scalarValue', { name: item.name })}
                          className="scalar-input"
                          disabled={!item.scalarEnabled}
                          inputMode="decimal"
                          placeholder={t(locale, 'auto')}
                          value={cleanScalarText(item.scalar)}
                          onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                        />
                        <span className="scalar-equation">
                          {item.scalarSpace === 'input' ? '' : 'A'}{item.name} · x =
                        </span>
                        <span className="scalar-auto">
                          {item.scalarAuto ? `${t(locale, 'auto')} ${formatNumber(item.scalarResolved)}` : formatNumber(item.scalarResolved)}
                        </span>
                        <div className="scalar-space-toggle" aria-label={t(locale, 'scalarSpace')}>
                          <button
                            className={item.scalarSpace === 'input' ? 'active' : ''}
                            onClick={() => updateVectorScalarSpace(item.id, 'input')}
                            title={t(locale, 'scalarInputTitle')}
                            type="button"
                          >
                            {t(locale, 'inputSpaceShort')}
                          </button>
                          <button
                            className={item.scalarSpace === 'output' ? 'active' : ''}
                            onClick={() => updateVectorScalarSpace(item.id, 'output')}
                            title={t(locale, 'scalarOutputTitle')}
                            type="button"
                          >
                            {t(locale, 'outputSpaceShort')}
                          </button>
                        </div>
                        <input
                          aria-label={t(locale, 'scalarDrag', { name: item.name })}
                          className="scalar-slider"
                          disabled={!item.scalarEnabled}
                          max="20"
                          min="-20"
                          step="0.1"
                          type="range"
                          value={Math.max(-20, Math.min(20, item.scalarResolved))}
                          onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
                {showDot && dotVectorItems.length > 1 && (
                  <div className="dot-matrix-card">
                    <div className="dot-card-head">
                      <strong><span className="dot-badge">{t(locale, 'dot')}</span> {t(locale, 'dotBetweenVectors')}</strong>
                      <span>{dotVectorItems.length}×{dotVectorItems.length}</span>
                    </div>
                    {dotVectorItems.length > 0 ? (
                      <div
                        className="dot-grid"
                        style={{ gridTemplateColumns: `46px repeat(${dotVectorItems.length}, minmax(48px, 1fr))` }}
                      >
                        <span className="dot-grid-corner" />
                        {dotVectorItems.map((item) => (
                          <span className="dot-grid-head" key={`col-${item.id}`} style={{ '--vector-color': item.colorHex }}>
                            {item.name}
                          </span>
                        ))}
                        {dotVectorItems.map((row) => (
                          <Fragment key={`row-${row.id}`}>
                            <span className="dot-grid-head row-head" style={{ '--vector-color': row.colorHex }}>
                              {row.name}
                            </span>
                            {dotVectorItems.map((col) => (
                              <span className="dot-grid-cell" key={`${row.id}-${col.id}`}>
                                {formatNumber(dotValues(row.transformed, col.transformed))}
                              </span>
                            ))}
                          </Fragment>
                        ))}
                      </div>
                    ) : (
                      <div className="dot-empty">{t(locale, 'noDotVectors')}</div>
                    )}
                    {vectorDotPairs.length > 0 && (
                      <div className="dot-pair-list">
                        {vectorDotPairs.map((pair) => (
                          <div className="dot-pair-row" key={pair.id}>
                            <span><span className="dot-badge subtle">{t(locale, 'dot')}</span> A{pair.left.name} · A{pair.right.name}</span>
                            <strong>{formatNumber(pair.value)}</strong>
                            <em>
                              {t(locale, pair.relation)}
                              {pair.cosine !== null ? ` / cos ${formatNumber(pair.cosine)}` : ''}
                            </em>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {showVolume && vectorVolumeMeasure && (
                  <div className="dot-matrix-card vector-volume-card">
                    <div className="dot-card-head">
                      <strong>
                        <span className="dot-badge subtle">{t(locale, 'volume')}</span>
                        {vectorVolumeMeasure.type === 'volume' ? ` ${t(locale, 'vectorVolume')}` : ` ${t(locale, 'vectorArea')}`}
                      </strong>
                      <span>{vectorVolumeMeasure.names.map((name) => `A${name}`).join(' · ')}</span>
                    </div>
                    <div className="dot-pair-row">
                      <span>{vectorVolumeMeasure.type === 'volume' ? t(locale, 'parallelepiped') : t(locale, 'parallelogram')}</span>
                      <strong>{formatNumber(vectorVolumeMeasure.value)}</strong>
                      <em>{vectorVolumeMeasure.type === 'volume' ? t(locale, 'tripleProduct') : t(locale, 'crossLength')}</em>
                    </div>
                  </div>
                )}
              </div>
            )}

            {vectorToolMode === 'system' && (
              <div className="system-solver">
                <div className="equation-presets" aria-label={t(locale, 'systemExamples')}>
                  <button onClick={() => setEquations(equationExamples.unique)}>{t(locale, 'unique')}</button>
                  <button onClick={() => setEquations(equationExamples.infinite)}>{t(locale, 'infinite')}</button>
                  <button onClick={() => setEquations(equationExamples.none)}>{t(locale, 'noSolution')}</button>
                </div>

                <div className="equation-list">
                  {equations.map((equation, index) => (
                    <label key={index}>
                      <span>E{index + 1}</span>
                      <input
                        value={equation}
                        placeholder={index === 0 ? '2x + 3y + 4z = 5' : 'x - y = 1'}
                        onChange={(event) => updateEquation(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>

                <div className={`solver-card ${equationSolution.status}`}>
                  <div className="solver-topline">
                    <span>{t(locale, 'status')}</span>
                    <strong>
                      {equationSolution.status === 'unique' && t(locale, 'unique')}
                      {equationSolution.status === 'infinite' && t(locale, 'infiniteMany')}
                      {equationSolution.status === 'none' && t(locale, 'noSolution')}
                      {equationSolution.status === 'invalid' && t(locale, 'invalidFormat')}
                      {equationSolution.status === 'empty' && t(locale, 'waitingInput')}
                    </strong>
                  </div>

                  {equationSolution.status !== 'empty' && equationSolution.status !== 'invalid' && (
                    <div className="solver-rank-row">
                      <span>rank(A) <strong>{equationSolution.rankA}</strong></span>
                      <span>rank([A|b]) <strong>{equationSolution.rankAugmented}</strong></span>
                    </div>
                  )}

                  {equationSolution.status === 'invalid' && (
                    <p className="solver-note">{t(locale, 'invalidEquationNote', { items: equationSolution.errors.join(', E') })}</p>
                  )}

                  {equationSolution.status === 'unique' && (
                    <div className="solution-stack">
                      <span>{t(locale, 'solution')}</span>
                      <strong>{formatSolutionTuple(equationSolution.solution)}</strong>
                      <small>
                        x={formatNumber(equationSolution.solution[0])}, y={formatNumber(equationSolution.solution[1])}, z={formatNumber(equationSolution.solution[2])}
                      </small>
                    </div>
                  )}

                  {equationSolution.status === 'infinite' && (
                    <div className="solution-stack">
                      <span>{t(locale, 'generalSolution')}</span>
                      <strong>{formatGeneralSolution(equationSolution)}</strong>
                      <small>Null(A): {equationSolution.nullspaceBasis.map(formatSolutionTuple).join(', ')}</small>
                    </div>
                  )}

                  {equationSolution.status === 'none' && (
                    <p className="solver-note">{t(locale, 'contradictionNote')}</p>
                  )}
                </div>

                <button
                  className="secondary-action"
                  disabled={!equationSolution.solution}
                  onClick={applyEquationSolutionToVector}
                >
                  {t(locale, 'applySolutionToVector')}
                </button>
              </div>
            )}
          </section>

          <section className="panel vector-panel legacy-vector-panel" aria-hidden="true">
            <div className="section-heading">
              <VectorSquare size={17} />
              <h3>{t(locale, 'vectorTracking')}</h3>
            </div>
            <div
              className={`vector-inputs mode-${displayMode} ${showVector ? '' : 'muted'}`}
            >
              {(displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z']).map((axis) => (
                <label key={axis}>
                  <span>{axis}</span>
                  <input
                    value={activeVector[axis]}
                    inputMode="decimal"
                    onChange={(event) => updateVectorValue(activeVector.id, axis, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="vector-result">
              <span>Av</span>
              <strong>{formatCoord(transformedVector, displayMode)}</strong>
            </div>
            <div className="vector-result dot-result">
              <span>Av · Av</span>
              <strong>{formatNumber(dotValues(transformedVector, transformedVector))}</strong>
            </div>
          </section>
        </div>
      </aside>

      </div>
      <AdSlot placement="bottom" locale={locale} />
    </main>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Box,
  Braces,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Grid3X3,
  History,
  Lock,
  Menu,
  PanelRightClose,
  Play,
  Plus,
  RotateCcw,
  Sigma,
  VectorSquare,
  X,
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
const SNAP_DISTANCE = 0.08;
const AXIS_LOCK_RATIO_3D = 0.045;
const PLANE_LOCK_RATIO_3D = 0.018;
const AXIS_LOCK_MAX_3D = 0.14;
const PLANE_LOCK_MAX_3D = 0.07;
const MEASURE_DOT_HEX = 0xf1b434;
const MEASURE_DOT_GUIDE_HEX = 0xffd66b;
const MEASURE_AREA_HEX = 0xff4fd8;
const MEASURE_AREA_EDGE_HEX = 0xff9bea;
const MEASURE_VOLUME_HEX = 0xff7a59;
const MEASURE_VOLUME_EDGE_HEX = 0xffb199;
const monetizationConfig = {
  adProvider: import.meta.env.VITE_AD_PROVIDER || 'adsense',
  adClient: import.meta.env.VITE_AD_CLIENT || '',
  topAdSlot: import.meta.env.VITE_AD_TOP_SLOT || '',
  bottomAdSlot: import.meta.env.VITE_AD_BOTTOM_SLOT || '',
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
    showCoordinates: decoded.showCoordinates !== false,
    showDot: !!decoded.showDot,
    showAxes: decoded.showAxes !== false,
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

function configureControlsForView(controls, viewKey, locked = false) {
  if (!controls) return;
  controls.enabled = true;
  controls.enableRotate = !locked;
  controls.enablePan = !locked;
  controls.enableZoom = true;
  controls.screenSpacePanning = false;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
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

function setMaterialOpacity(material, opacity) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item) return;
    item.transparent = true;
    item.opacity = opacity;
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

function dotValues(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

function vectorLength(values) {
  return Math.sqrt(dotValues(values, values));
}

function crossLengthValues(a, b) {
  return Math.hypot(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  );
}

function determinantFromColumns(a, b, c) {
  return determinant3([
    a[0], b[0], c[0],
    a[1], b[1], c[1],
    a[2], b[2], c[2],
  ]);
}

function independentBasisKeysForMatrix(matrix) {
  const candidates = [
    ['i', [matrix[0], matrix[3], matrix[6]]],
    ['j', [matrix[1], matrix[4], matrix[7]]],
    ['k', [matrix[2], matrix[5], matrix[8]]],
  ];
  const selected = [];
  const keys = new Set();

  candidates.forEach(([key, vector]) => {
    if (vectorLength(vector) <= EPSILON || selected.length >= 3) return;
    const isIndependent =
      selected.length === 0 ||
      (selected.length === 1 && crossLengthValues(selected[0], vector) > EPSILON) ||
      (selected.length === 2 && Math.abs(determinantFromColumns(selected[0], selected[1], vector)) > EPSILON);

    if (!isIndependent) return;
    selected.push(vector);
    keys.add(key);
  });

  return keys;
}

function dotRelationText(dotValue, lengthA, lengthB) {
  if (lengthA < EPSILON || lengthB < EPSILON) return 'dotZeroVector';
  if (Math.abs(dotValue) < EPSILON) return 'dotOrthogonal';
  return dotValue > 0 ? 'dotAcute' : 'dotObtuse';
}

function hasScalarText(value) {
  return String(value ?? '').trim() !== '';
}

function formatInputValue(value) {
  if (Math.abs(value) < EPSILON) return '0';
  if (Math.abs(value - Math.round(value)) < EPSILON) return String(Math.round(value));
  return Number(value.toFixed(2)).toString();
}

function formatPresetInputValue(value) {
  return formatMatrixNumber(value, 4);
}

function formatVectorInputValue(value) {
  return formatInputValue(value);
}

function snapValue(value) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < SNAP_DISTANCE ? rounded : value;
}

function snapValuesFor3D(values) {
  const snapped = values.map(snapValue);
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
    Math.max(SNAP_DISTANCE * 0.55, maxAbs * AXIS_LOCK_RATIO_3D)
  );
  if (dominant.value > EPSILON && second <= axisLockDistance) {
    return snapped.map((value, index) => (index === dominant.index ? value : 0));
  }

  const planeLockDistance = Math.min(
    PLANE_LOCK_MAX_3D,
    Math.max(SNAP_DISTANCE * 0.38, maxAbs * PLANE_LOCK_RATIO_3D)
  );
  return snapped.map((value) => (Math.abs(value) <= planeLockDistance ? 0 : value));
}

function constrainVectorForMode(vector, mode) {
  const next = vector.clone();
  if (mode === '1d') {
    next.y = 0;
    next.z = 0;
  } else if (mode === '2d') {
    next.z = 0;
  }
  if (mode === '3d') {
    const [x, y, z] = snapValuesFor3D([next.x, next.y, next.z]);
    next.set(x, y, z);
  } else {
    next.set(snapValue(next.x), snapValue(next.y), snapValue(next.z));
  }
  return next;
}

function constrainInputValuesForMode(values, mode, shouldSnap = true) {
  const next = [...values];
  if (mode === '1d') {
    next[1] = 0;
    next[2] = 0;
  } else if (mode === '2d') {
    next[2] = 0;
  }
  if (!shouldSnap) return next;
  if (mode === '3d') return snapValuesFor3D(next);
  return next.map(snapValue);
}

function solveVectorInputForWorld(matrix, worldVector, mode, options = {}) {
  const { snap = true } = options;

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
  return constrainInputValuesForMode(solved, mode, snap);
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
const equationLineColors = [0xff6575, 0x22c1b6, 0xf1b434, 0x8b5cf6, 0x41cf76, 0x78a5ff];
const vectorPalette = [0x8b5cf6, 0xf1b434, 0x22c1b6, 0xff6575, 0x41cf76, 0x78a5ff];
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
  };
}

function parseExpression(expression) {
  const coeffs = [0, 0, 0];
  let constant = 0;
  const compact = expression
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/\*/g, '')
    .replace(/,/g, '.')
    .replace(/(\d)\s+([xyz])/gi, '$1$2')
    .replace(/([+\-])\s+([xyz])/gi, '$1$2')
    .replace(/([+\-])\s+/g, '$1')
    .trim()
    .replace(/\s+(?=[^+\-])/g, '+')
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-');

  if (!compact) return { coeffs, constant };

  const normalized = /^[+\-]/.test(compact) ? compact : `+${compact}`;
  const terms = normalized.match(/[+\-][^+\-]+/g) ?? [];
  if (!terms.length) throw new Error('term');

  terms.forEach((term) => {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.slice(1);
    const variableMatch = body.match(/^((?:\d+(?:\.\d*)?|\.\d+)?)?([xyz])$/i);

    if (variableMatch) {
      const variableIndex = equationVariables.indexOf(variableMatch[2].toLowerCase());
      const coefficientText = variableMatch[1] ?? '';
      const coefficient = coefficientText ? Number(coefficientText) : 1;
      if (!Number.isFinite(coefficient)) throw new Error('coefficient');
      coeffs[variableIndex] += sign * coefficient;
      return;
    }

    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(body)) {
      constant += sign * Number(body);
      return;
    }

    throw new Error('term');
  });

  return { coeffs, constant };
}

function parseEquation(text) {
  const trimmed = text.trim();
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

function clearEquationGroup(group) {
  if (!group) return;
  group.children.forEach((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
  group.clear();
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

function createLineObjects(line, range = 9) {
  const segment = lineSegmentForEquation(line, range);
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

function createSolutionHighlightObjects(solution, color = 0xf1b434, size = 4.8) {
  if (!solution || solution.status !== 'infinite' || !solution.nullspaceBasis?.length) return [];

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
      new THREE.TubeGeometry(curve, 24, index === 0 ? 0.13 : 0.095, 12, false),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: index === 0 ? 0.26 : 0.16,
        depthTest: false,
        depthWrite: false,
      })
    );
    glow.renderOrder = 36;

    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, index === 0 ? 0.048 : 0.036, 10, false),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? color : 0xffffff,
        transparent: true,
        opacity: index === 0 ? 0.98 : 0.72,
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
  const hasWebAd = !!monetizationConfig.adClient && !!slotId;
  const label = placement === 'top' ? t(locale, 'adTop') : t(locale, 'adBottom');

  useEffect(() => {
    if (!hasWebAd || typeof document === 'undefined') return;
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(monetizationConfig.adClient)}`;
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = src;
      document.head.appendChild(script);
    }
  }, [hasWebAd]);

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
  const scalarSolutionLabelRef = useRef(null);
  const vectorLabelRefs = useRef(new Map());
  const vectorDotLabelRefs = useRef(new Map());
  const measurementLabelRefs = useRef(new Map());
  const vectorVolumeLabelRef = useRef(null);
  const scrubTrackRef = useRef(null);
  const historyStripRef = useRef(null);
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
  const userVectorRef = useRef(
    initialShare.vectors?.[0]
      ? [parseNumber(initialShare.vectors[0].x), parseNumber(initialShare.vectors[0].y), parseNumber(initialShare.vectors[0].z)]
      : [2, 2, 2]
  );
  const vectorsRef = useRef([]);
  const measurementsRef = useRef([]);
  const scalarSolutionRef = useRef(null);
  const activeVectorIdRef = useRef(initialShare.vectors?.[0]?.id ?? 'v1');
  const nextVectorIndexRef = useRef(2);
  const nextMeasurementIndexRef = useRef(1);
  const measureModeRef = useRef(null);
  const measureDraftRef = useRef([]);
  const vectorToolModeRef = useRef('vector');
  const timelineCloseTimerRef = useRef(null);
  const timelinePinnedRef = useRef(false);
  const uiStateRef = useRef({
    showVolume: false,
    showVector: true,
    showBasis: true,
    basisVisibility: { i: true, j: true, k: true },
    showGrid: true,
    showRelativeGrid: true,
    showCoordinates: true,
    showCoordinateNumbers: true,
    showDot: false,
    showAxes: true,
  });
  const workspaceModeRef = useRef('transform');
  const systemDimensionRef = useRef('2d');

  const [isLoaded, setIsLoaded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isTimelinePinned, setIsTimelinePinned] = useState(false);
  const isTimelineExpanded = isTimelineOpen || isTimelinePinned;
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
  const [equations, setEquations] = useState(equationExamples.infinite);
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
  const [cameraState, setCameraState] = useState(initialShare.camera ?? null);
  const [locale, setLocale] = useState(initialLocale);
  const [showVolume, setShowVolume] = useState(initialShare.showVolume ?? false);
  const [showVector, setShowVector] = useState(initialShare.showVector ?? true);
  const [showBasis, setShowBasis] = useState(initialShare.showBasis ?? true);
  const [basisVisibility, setBasisVisibility] = useState({ i: true, j: true, k: true });
  const [showGrid, setShowGrid] = useState(initialShare.showGrid ?? true);
  const [showRelativeGrid, setShowRelativeGrid] = useState(initialShare.showRelativeGrid ?? true);
  const [showCoordinates, setShowCoordinates] = useState(initialShare.showCoordinates ?? true);
  const [showDot, setShowDot] = useState(initialShare.showDot ?? false);
  const [showAxes, setShowAxes] = useState(initialShare.showAxes ?? true);
  const [measureMode, setMeasureMode] = useState(null);
  const [measureDraft, setMeasureDraft] = useState([]);
  const [measurePointer, setMeasurePointer] = useState(null);
  const [hoveredMeasureTargetId, setHoveredMeasureTargetId] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [hoveredMatrixPresetId, setHoveredMatrixPresetId] = useState(null);

  const matrixInputValues = useMemo(() => {
    if (inputMode === '2d') return matrix2;
    if (inputMode === '1d') return matrix1;
    return matrix3;
  }, [inputMode, matrix1, matrix2, matrix3]);
  const visibleMatrixPresets = useMemo(
    () => (matrixPresetGroups[inputMode] ?? matrixPresetGroups['3d']).map((preset) => ({
      ...preset,
      name: presetLocaleNames[locale]?.[preset.id] ?? presetLocaleNames.ko?.[preset.id] ?? preset.name,
    })),
    [inputMode, locale]
  );
  const activeMatrixPresetId = useMemo(() => {
    const parsed = matrixInputValues.map(parseNumber);
    return visibleMatrixPresets.find((preset) =>
      matricesAlmostEqual(matrixValuesForMode(preset.matrix, preset.mode), parsed)
    )?.id ?? null;
  }, [matrixInputValues, visibleMatrixPresets]);
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
        ? matrixValuesForMode(hoveredMatrixPreset.matrix, hoveredMatrixPreset.mode).map(formatPresetInputValue)
        : matrixInputValues,
    [hoveredMatrixPreset, matrixInputValues]
  );

  const previewIndex = hoveredHistoryIndex ?? activeHistoryIndex;
  const previewHistory = history[previewIndex] ?? history[activeHistoryIndex] ?? history.at(-1);
  const currentHistory = history[activeHistoryIndex] ?? history.at(-1);
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
        const scalarAuto = !hasScalarText(item.scalar);
        return {
          ...item,
          transformed,
          length,
          lengthSquared,
          scalarAuto,
          scalarResolved: scalarAuto ? lengthSquared : item.scalarValue,
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
        } else if (item.type === 'volume' && targets.length >= 2) {
          const a = new THREE.Vector3(...targets[0].values);
          const b = new THREE.Vector3(...targets[1].values);
          value = targets.length >= 3
            ? Math.abs(a.clone().cross(b).dot(new THREE.Vector3(...targets[2].values)))
            : a.clone().cross(b).length();
        }
        return {
          ...item,
          targetIds: item.targets,
          targets,
          label: targets.map((target) => `A${target.name}`).join(' · '),
          value,
        };
      }),
    [measureTargetMap, measurements]
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
        .filter((item) => item.visible && item.scalarEnabled && item.length > EPSILON)
        .map((item, index) => ({
          id: item.id,
          name: item.name,
          color: item.color,
          colorHex: item.colorHex,
          normal: item.transformed,
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
  const displayMode = viewKeyForMatrix(displayMatrix);
  const currentModeLabel = displayMode.toUpperCase();
  const equationSolution = useMemo(() => solveEquationSystem(equations), [equations]);
  const lineSystem = useMemo(() => analyzeEquationGeometry(equations), [equations]);

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
    systemDimensionRef.current = lineSystem.mode ?? '2d';
  }, [lineSystem.mode]);

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
    uiStateRef.current = {
      showVolume,
      showVector,
      showBasis,
      basisVisibility,
      showGrid,
      showRelativeGrid,
      showCoordinates: true,
      showCoordinateNumbers: showCoordinates,
      showDot,
      showAxes,
    };
  }, [showVolume, showVector, showBasis, basisVisibility, showGrid, showRelativeGrid, showCoordinates, showDot, showAxes]);

  useEffect(() => {
    if (!threeRef.current) return;

    const mode = viewKeyForMatrix(displayMatrix);
    const labelWithCoord = (name, values, coordMode = mode) =>
      `${name}′${showCoordinates ? ` ${formatCoord(values, coordMode)}` : ''}`;
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
      showBasis && basisVisibility.i !== false && vectorLength(basisVectors.i) > EPSILON
    );
    showLabel(
      jLabelRef.current,
      labelWithCoord('j', basisVectors.j),
      showBasis && basisVisibility.j !== false && vectorLength(basisVectors.j) > EPSILON
    );
    showLabel(
      kLabelRef.current,
      labelWithCoord('k', basisVectors.k, '3d'),
      showBasis && basisVisibility.k !== false && vectorLength(basisVectors.k) > 0.08
    );

    vectors.forEach((item) => {
      const label = vectorLabelRefs.current.get(item.id);
      const values = [parseNumber(item.x), parseNumber(item.y), parseNumber(item.z)];
      const transformed = transformVector3(displayMatrix, values);
      const scalarValue = hasScalarText(item.scalar)
        ? parseNumber(item.scalar)
        : dotValues(transformed, transformed);
      showLabel(
        label,
        item.scalarEnabled
          ? `A${item.name}·x = ${formatNumber(scalarValue)}`
          : labelWithCoord(item.name, transformed),
        showVector && item.visible !== false
      );
    });
  }, [basisVisibility, displayMatrix, showBasis, showCoordinates, showVector, vectors]);

  useEffect(() => {
    cameraLockedRef.current = cameraLocked;
    if (cameraLocked) {
      cameraMoveRef.current.active = false;
    }

    const refs = threeRef.current;
    if (refs?.controls) {
      configureControlsForView(refs.controls, activeView ?? displayMode, cameraLocked);
      refs.controls.update();
    }
  }, [activeView, cameraLocked, displayMode]);

  useEffect(() => {
    const refs = threeRef.current;
    if (!refs?.vectorScalarGroup) return undefined;

    clearEquationGroup(refs.vectorScalarGroup);
    refs.vectorScalarGroup.visible = workspaceMode === 'transform' && showVector;

    if (workspaceMode !== 'transform' || !showVector) return undefined;

    const mode = viewKeyForMatrix(displayMatrix);
    vectorScalarConstraints.forEach((constraint) => {
      if (mode === '1d') return;
      if (mode === '2d') {
        createLineObjects(
          {
            a: constraint.normal[0],
            b: constraint.normal[1],
            value: constraint.scalar,
            color: constraint.color,
          },
          9
        ).forEach((object) => refs.vectorScalarGroup.add(object));
        return;
      }

      createPlaneObjects(
        {
          a: constraint.normal[0],
          b: constraint.normal[1],
          c: constraint.normal[2],
          value: constraint.scalar,
          color: constraint.color,
        },
        5.8,
        vectorScalarConstraints.length > 1
      ).forEach((object) => refs.vectorScalarGroup.add(object));
    });

    return () => {
      clearEquationGroup(refs.vectorScalarGroup);
    };
  }, [displayMatrix, showVector, vectorScalarConstraints, workspaceMode]);

  const updateVectorValue = useCallback((id, axis, value) => {
    setVectors((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, [axis]: value.replace(/^0+(?=\d)/, '') } : item
      )
    );
  }, []);

  const updateVectorScalar = useCallback((id, value) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalar: value.replace(/^0+(?=\d)/, '') } : item))
    );
  }, []);

  const toggleVectorScalar = useCallback((id, checked) => {
    setVectors((previous) =>
      previous.map((item) => (item.id === id ? { ...item, scalarEnabled: checked } : item))
    );
  }, []);

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
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
      return next;
    });
  }, []);

  const startMeasurementFrom = useCallback((mode, targetId, event = null) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setMeasureMode(mode);
    setMeasureDraft([targetId]);
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

  const removeMeasurement = useCallback((id) => {
    setMeasurements((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const reverseDotMeasurement = useCallback((id) => {
    setMeasurements((previous) =>
      previous.map((item) => (
        item.id === id && item.type === 'dot' && item.targets.length >= 2
          ? { ...item, targets: [...item.targets].reverse() }
          : item
      ))
    );
  }, []);

  const convertMeasurementType = useCallback((id) => {
    const measurementKey = (type, targets) => `${type}:${[...targets].sort().join('|')}`;
    setMeasurements((previous) => {
      const source = previous.find((item) => item.id === id);
      if (!source || source.targets.length < 2) return previous;
      const nextType = source.type === 'dot' ? 'volume' : 'dot';
      const nextTargets = source.type === 'dot' ? source.targets.slice(0, 2) : source.targets.slice(0, 2);
      const nextKey = measurementKey(nextType, nextTargets);
      return previous
        .filter((item) => item.id === id || measurementKey(item.type, item.targets) !== nextKey)
        .map((item) => (
          item.id === id
            ? { ...item, type: nextType, targets: nextTargets, visible: true }
            : item
        ));
    });
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasurePointer(null);
  }, []);

  const continueMeasurement = useCallback((item) => {
    const targetIds = item?.targetIds ?? item?.targets;
    if (!item || item.type !== 'volume' || !Array.isArray(targetIds) || targetIds.length < 2) return;
    setMeasureMode('volume');
    setMeasureDraft(targetIds.slice(0, 2));
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
  }, []);

  const continueDotMeasurement = useCallback((item, event = null) => {
    const targetIds = item?.targetIds ?? item?.targets;
    if (!item || item.type !== 'dot' || !Array.isArray(targetIds) || targetIds.length < 2) return;
    startMeasurementFrom('dot', targetIds[targetIds.length - 1], event);
  }, [startMeasurementFrom]);

  const pickMeasureTarget = useCallback((targetId) => {
    if (!measureMode || measureDraft.length === 0) return false;
    if (measureDraft.includes(targetId)) {
      setMeasureDraft([]);
      setMeasurePointer(null);
      setHoveredMeasureTargetId(null);
      setMeasureMode(null);
      return true;
    }
    const withoutDuplicate = measureDraft.filter((id) => id !== targetId);
    const next = [...withoutDuplicate, targetId];
    const measurementKey = (type, targets) => `${type}:${[...targets].sort().join('|')}`;
    const addMeasurement = (type, targets, replaceTargets = null) => {
      const id = `m${nextMeasurementIndexRef.current}`;
      nextMeasurementIndexRef.current += 1;
      setMeasurements((items) => [
        ...items.filter((item) => {
          const itemKey = measurementKey(item.type, item.targets);
          if (itemKey === measurementKey(type, targets)) return false;
          if (replaceTargets && itemKey === measurementKey(type, replaceTargets)) return false;
          return true;
        }),
        { id, type, targets, visible: true },
      ]);
    };

    if (next.length < 2) {
      setMeasureDraft(next);
      return true;
    }

    const targetLimit = measureMode === 'volume' && displayMode === '3d' ? 3 : 2;
    addMeasurement(measureMode, next.slice(0, targetLimit), measureDraft.length >= 2 ? measureDraft : null);
    setMeasureDraft([]);
    setMeasurePointer(null);
    setHoveredMeasureTargetId(null);
    setMeasureMode(null);
    return true;
  }, [displayMode, measureDraft, measureMode]);

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
      className={`measure-chip measure-${item.type} ${item.type === 'volume' && item.targetIds?.length === 2 ? 'measure-area' : ''} ${item.visible === false ? 'muted' : ''}`}
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
    const anchorTargetNode = getMeasureTargetLabelNode(measureDraft[measureDraft.length - 1]);
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
  }, [getMeasureTargetLabelNode, hoveredMeasureTargetId, measureDraft, measureMode, measurePointer]);

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
    refs.equationPoint.visible = false;

    if (workspaceMode !== 'system' && vectorToolMode !== 'system') {
      refs.equationGroup.visible = false;
      return undefined;
    }

    refs.equationGroup.visible = true;

    if (lineSystem.mode === '3d') {
      const hasSolutionHighlight = lineSystem.solution?.status === 'infinite';
      lineSystem.planes.forEach((plane) => {
        createPlaneObjects(plane, 6.5, hasSolutionHighlight).forEach((object) =>
          refs.equationGroup.add(object)
        );
      });
      createSolutionHighlightObjects(lineSystem.solution, 0xf1b434).forEach((object) =>
        refs.equationGroup.add(object)
      );
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
        refs.equationGroup.add(lineMesh);
      });
    }

    if (lineSystem.point) {
      refs.equationPoint.position.set(
        lineSystem.point[0],
        lineSystem.point[1],
        lineSystem.mode === '3d' ? lineSystem.point[2] : 0.055
      );
      refs.equationPoint.userData.visible = true;
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
    const preset = viewPresets[nextView] ?? viewPresets['3d'];
    const refs = threeRef.current;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(nextView);
    if (refs) {
      configureControlsForView(refs.controls, nextView, cameraLockedRef.current);
      cameraMoveRef.current = {
        active: true,
        startTime: null,
        positionFrom: refs.camera.position.clone(),
        targetFrom: refs.controls.target.clone(),
        positionTo: preset.position.clone(),
        targetTo: preset.target.clone(),
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
    const preset = viewPresets[nextView] ?? viewPresets['3d'];
    const refs = threeRef.current;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(nextView);
    if (refs) {
      configureControlsForView(refs.controls, nextView, cameraLockedRef.current);
      cameraMoveRef.current = {
        active: true,
        startTime: null,
        positionFrom: refs.camera.position.clone(),
        targetFrom: refs.controls.target.clone(),
        positionTo: preset.position.clone(),
        targetTo: preset.target.clone(),
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
    const adjusted = constrainVectorForMode(worldVector, mode);
    const next = [...currentMatrixRef.current];
    const columnIndex = dragKey === 'i' ? 0 : dragKey === 'j' ? 1 : 2;
    next[columnIndex] = adjusted.x;
    next[columnIndex + 3] = adjusted.y;
    next[columnIndex + 6] = adjusted.z;
    previewDraggedMatrix(next);
    return adjusted;
  }, [previewDraggedMatrix]);

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
          true
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
    setVectors((previous) =>
      previous.map((item) => (item.id === vectorId ? { ...item, ...nextVector } : item))
    );
    return new THREE.Vector3(adjustedWorld[0], adjustedWorld[1], adjustedWorld[2]);
  }, []);

  const updateScalarConstraintFromDrag = useCallback((worldVector, dragState = null) => {
    const vectorId = scalarIdFromDragKey(dragState?.key);
    const normal = dragState?.scalarNormal;
    if (!vectorId || !normal || normal.lengthSq() < EPSILON) return worldVector;

    const scalarValue = normal.dot(worldVector);
    const anchor = normal.clone().multiplyScalar(scalarValue / normal.lengthSq());
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

    cameraMoveRef.current.active = false;
    if (cameraLockedRef.current) {
      refs.controls.update();
      return;
    }

    const clamped = Math.max(0, Math.min(1, rawProgress));
    const eased = easeInOut(clamped);
    const fromKey = animationViewFromRef.current;
    const toKey = animationViewToRef.current;
    const fromPreset = viewPresets[fromKey] ?? viewPresets['3d'];
    const toPreset = viewPresets[toKey] ?? viewPresets['3d'];
    refs.camera.position.lerpVectors(fromPreset.position, toPreset.position, eased);
    refs.controls.target.lerpVectors(fromPreset.target, toPreset.target, eased);
    if (clamped <= 0.001) configureControlsForView(refs.controls, fromKey, cameraLockedRef.current);
    if (clamped >= 0.999) configureControlsForView(refs.controls, toKey, cameraLockedRef.current);
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
    if (!refs || !label || !visible || (!allowOrigin && vector3.length() < EPSILON)) {
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
    setAxisLabelText(label, text);
    label.style.display = 'block';
    label.style.transform =
      `translate(-50%, -50%) translate(${x + offset[0]}px, ${y + offset[1]}px)`;
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
    const showStaticGrid = showBaseGrid && ((!isSystemMode && (coordMode === '3d' || kAxisBlend > 0.04)) || isSystem3D);
    const showReferenceGrid =
      showBaseGrid &&
      ((!isSystemMode && (coordMode !== '3d' || flatBlend > 0.02)) || (isSystemMode && !isSystem3D));
    const showDynamicGrid3D = showRelativeGrid && coordMode === '3d' && !isSystemMode && kAxisBlend > 0.04;
    const showDynamicGrid2D =
      showRelativeGrid &&
      coordMode === '2d' &&
      !isSystemMode &&
      (iVector.lengthSq() > EPSILON || jVector.lengthSq() > EPSILON);
    refs.staticGrid.visible = showStaticGrid;
    refs.referenceGrid.visible = showReferenceGrid;
    refs.axesHelper.visible = uiStateRef.current.showAxes && (!isSystemMode || isSystem3D);
    refs.dynamicGrid.visible = showDynamicGrid3D;
    refs.dynamicPlaneGrid.visible = showDynamicGrid2D;
    setMaterialOpacity(refs.staticGrid.material, isSystem3D ? 0.22 : 0.07 + kAxisBlend * 0.14);
    refs.referenceGrid.material.opacity = isSystemMode ? 0.34 : Math.max(0.04, flatBlend * 0.14);
    refs.dynamicGrid.material.opacity = 0.06 + kAxisBlend * 0.22;
    refs.dynamicPlaneGrid.material.opacity = coordMode === '2d' ? 0.38 : 0.24;
    refs.equationGroup.visible = isSystemMode;
    refs.equationPoint.visible = isSystemMode && refs.equationPoint.userData.visible;

    const basisVisible = uiStateRef.current.showBasis && !isSystemMode;
    const basisVisibility = uiStateRef.current.basisVisibility ?? { i: true, j: true, k: true };
    const basisLengthByKey = {
      i: Math.hypot(matrix[0], matrix[3], matrix[6]),
      j: Math.hypot(matrix[1], matrix[4], matrix[7]),
      k: Math.hypot(matrix[2], matrix[5], matrix[8]),
    };
    const independentBasisKeys = independentBasisKeysForMatrix(matrix);
    const basisVisibleByKey = {
      i: basisVisible && basisVisibility.i !== false && basisLengthByKey.i > EPSILON && independentBasisKeys.has('i'),
      j: basisVisible && basisVisibility.j !== false && basisLengthByKey.j > EPSILON && independentBasisKeys.has('j'),
      k: basisVisible && basisVisibility.k !== false && basisLengthByKey.k > EPSILON && independentBasisKeys.has('k'),
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
      const shouldSnap = activeDragVectorId === vectorItem.id;
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

    const activeVectorItem = vectorsRef.current.find(
      (item) => item.id === activeVectorIdRef.current && item.visible !== false && !item.scalarEnabled
    );
    const activeVectorWorld = activeVectorItem
      ? new THREE.Vector3(...transformVector3(matrix, renderedVectorValues.get(activeVectorItem.id) ?? activeVectorItem.values))
      : null;
    refs.userArrow.visible = false;
    refs.dotLine.visible = false;
    refs.dotPoint.visible = false;

    const coordinatesVisible = uiStateRef.current.showCoordinateNumbers;
    const labelsVisible = true;
    const vectorLabelsVisible = true;
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
          world: new THREE.Vector3(...transformVector3(matrix, values)),
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

    clearEquationGroup(refs.measurementGroup);
    const activeMeasurementLabels = new Set();
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
        if (!uiStateRef.current.showBasis || uiStateRef.current.basisVisibility?.i === false) return null;
        const vector = new THREE.Vector3(matrix[0], matrix[3], matrix[6]);
        return vector.lengthSq() > EPSILON ? vector : null;
      }
      if (targetId === 'b:j') {
        if (!uiStateRef.current.showBasis || uiStateRef.current.basisVisibility?.j === false) return null;
        const vector = new THREE.Vector3(matrix[1], matrix[4], matrix[7]);
        return vector.lengthSq() > EPSILON ? vector : null;
      }
      if (targetId === 'b:k') {
        if (!uiStateRef.current.showBasis || uiStateRef.current.basisVisibility?.k === false) return null;
        const vector = new THREE.Vector3(matrix[2], matrix[5], matrix[8]);
        return vector.lengthSq() > EPSILON ? vector : null;
      }
      const vectorId = targetId?.startsWith('v:') ? targetId.slice(2) : null;
      const vectorItem = vectorsRef.current.find((item) => item.id === vectorId);
      if (!vectorItem || vectorItem.visible === false || vectorItem.scalarEnabled || !uiStateRef.current.showVector) return null;
      const values = renderedVectorValues.get(vectorItem.id) ?? vectorItem.values;
      return new THREE.Vector3(...transformVector3(matrix, values));
    };

    if (!isSystemMode) {
      measurementsRef.current
        .filter((item) => item.visible !== false)
        .forEach((item, index) => {
          const targets = item.targets.map(getMeasureTargetWorld).filter(Boolean);
          if (item.type === 'dot' && targets.length >= 2) {
            const [secondary, primary] = targets;
            const dotValue = primary.dot(secondary);
            const projection = primary.lengthSq() > EPSILON
              ? primary.clone().multiplyScalar(dotValue / primary.lengthSq())
              : new THREE.Vector3();
            const mainGeometry = new THREE.BufferGeometry();
            mainGeometry.setAttribute(
              'position',
              new THREE.Float32BufferAttribute([
                primary.x, primary.y, primary.z, secondary.x, secondary.y, secondary.z,
              ], 3)
            );
            const guideGeometry = new THREE.BufferGeometry();
            guideGeometry.setAttribute(
              'position',
              new THREE.Float32BufferAttribute([
                projection.x, projection.y, projection.z, secondary.x, secondary.y, secondary.z,
              ], 3)
            );
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
            const mainLine = new THREE.LineSegments(mainGeometry, mainMaterial);
            mainLine.renderOrder = 19 + index;
            refs.measurementGroup.add(mainLine);
            const guideLine = new THREE.LineSegments(guideGeometry, guideMaterial);
            guideLine.computeLineDistances();
            guideLine.renderOrder = 18 + index;
            refs.measurementGroup.add(guideLine);
            const point = new THREE.Mesh(
              new THREE.SphereGeometry(0.055, 18, 12),
              new THREE.MeshBasicMaterial({ color: MEASURE_DOT_HEX, depthTest: false, depthWrite: false })
            );
            point.position.copy(projection);
            point.renderOrder = 19 + index;
            refs.measurementGroup.add(point);
            const labelPosition = primary.clone().lerp(secondary, 0.46).lerp(projection, 0.18);
            activeMeasurementLabels.add(item.id);
            updateLabel(
              measurementLabelRefs.current.get(item.id),
              labelPosition,
              [
                { text: 'Σ ', className: 'measurement-symbol' },
                measureTargetToken(item.targets[1]),
                { text: ' · ', className: 'measurement-operator' },
                measureTargetToken(item.targets[0]),
                { text: ` = ${formatNumber(dotValue)}`, className: 'measurement-value-token' },
              ],
              labelsVisible,
              [0, -30 - (index % 3) * 10],
              { allowOrigin: true }
            );
          }
          if (item.type === 'volume' && targets.length >= 2) {
            const [a, b, c] = targets;
            const meshGeometry = new THREE.BufferGeometry();
            const edgeGeometry = new THREE.BufferGeometry();
            const isVolume3D = targets.length >= 3;
            if (isVolume3D) {
              updateVolumeGeometry(meshGeometry, edgeGeometry, a, b, c);
            } else {
              updateAreaGeometry(meshGeometry, edgeGeometry, a, b);
            }
            const mesh = new THREE.Mesh(
              meshGeometry,
              new THREE.MeshBasicMaterial({
                color: isVolume3D ? MEASURE_VOLUME_HEX : MEASURE_AREA_HEX,
                transparent: true,
                opacity: isVolume3D ? 0.23 : 0.2,
                side: THREE.DoubleSide,
                depthWrite: false,
              })
            );
            mesh.renderOrder = 16 + index;
            refs.measurementGroup.add(mesh);
            const edges = new THREE.LineSegments(
              edgeGeometry,
              new THREE.LineBasicMaterial({
                color: isVolume3D ? MEASURE_VOLUME_EDGE_HEX : MEASURE_AREA_EDGE_HEX,
                transparent: true,
                opacity: 0.86,
                depthTest: false,
                depthWrite: false,
              })
            );
            edges.renderOrder = 17 + index;
            refs.measurementGroup.add(edges);
            const value = targets.length >= 3
              ? Math.abs(a.clone().cross(b).dot(c))
              : a.clone().cross(b).length();
            const labelPosition = targets
              .reduce((sum, vector) => sum.add(vector), new THREE.Vector3())
              .multiplyScalar(1 / targets.length);
            const labelPrefix = targets.length >= 3 ? t(locale, 'volume') : t(locale, 'area');
            activeMeasurementLabels.add(item.id);
            updateLabel(
              measurementLabelRefs.current.get(item.id),
              labelPosition,
              [
                { text: `${labelPrefix} `, className: 'measurement-symbol' },
                ...joinMeasureTargetTokens(item.targets.slice(0, targets.length)),
                { text: ` = ${formatNumber(value)}`, className: 'measurement-value-token' },
              ],
              labelsVisible,
              [0, -32 - (index % 3) * 10],
              { allowOrigin: true }
            );
          }
        });
    }
    measurementLabelRefs.current.forEach((label, id) => {
      if (!activeMeasurementLabels.has(id)) label.style.display = 'none';
    });

    const activeVectorKeys = new Set();
    const vectorVisuals = refs.vectorVisuals ?? new Map();
    vectorsRef.current.forEach((vectorItem) => {
      activeVectorKeys.add(vectorItem.id);
      let visual = vectorVisuals.get(vectorItem.id);
      if (!visual) {
        visual = createVectorVisual(refs.scene, refs.dragHandleGeometry, vectorItem);
        vectorVisuals.set(vectorItem.id, visual);
      }

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
      const [vx, vy, vz] = transformVector3(matrix, renderValues);
      const userVector = new THREE.Vector3(vx, vy, vz);
      const vectorItemVisible = vectorItem.visible !== false;
      const isActiveVector = vectorItem.id === activeVectorIdRef.current;
      const baseLengthSquared = userVector.lengthSq();
      const activeLengthSquared = activeVectorWorld?.lengthSq() ?? 0;
      const scalarValue = hasScalarText(vectorItem.scalar)
        ? parseNumber(vectorItem.scalar)
        : baseLengthSquared;
      const scalarAnchor =
        baseLengthSquared > EPSILON
          ? userVector.clone().multiplyScalar(scalarValue / baseLengthSquared)
          : new THREE.Vector3(0, 0, 0);
      const projection =
        activeVectorWorld && baseLengthSquared > EPSILON
          ? userVector.clone().multiplyScalar(activeVectorWorld.dot(userVector) / baseLengthSquared)
          : new THREE.Vector3(0, 0, 0);
      const vectorVisible = uiStateRef.current.showVector && vectorItemVisible && !isSystemMode;
      const arrowVisible = vectorVisible && !scalarEnabled;
      const dotDisplayVisible = uiStateRef.current.showDot && vectorItemVisible;
      setArrowVector(visual.arrow, vx, vy, vz, arrowVisible);
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
      visual.dotPoint.position.copy(projection);
      visual.dotPoint.visible = dotVisible;
      handleTargets[vectorDragKey] = scalarEnabled ? scalarAnchor : userVector;

      updateLabel(
        vectorLabelRefs.current.get(vectorItem.id),
        scalarEnabled
          ? scalarAnchor.clone()
          : new THREE.Vector3(vx * 1.06, vy * 1.06, vz * 1.06),
        scalarEnabled
          ? `A${vectorItem.name}·x = ${formatNumber(scalarValue)}`
          : `${vectorItem.name}′${coordinatesVisible ? ` ${formatCoord([vx, vy, vz], coordMode)}` : ''}`,
        vectorLabelsVisible && vectorVisible,
        scalarEnabled ? [0, -20] : [0, -18],
        { keepNameWhenCoordinatesHidden: !scalarEnabled }
      );
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

    const scalarSolution = scalarSolutionRef.current;
    const scalarSolutionVisible = !!scalarSolution && uiStateRef.current.showVector && !isSystemMode;
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
      [0, -30],
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
        !isSystemMode &&
        !!target &&
        target.length() > EPSILON &&
        (isVectorHandle
          ? uiStateRef.current.showVector && dragVectorVisible
          : basisVisibleByKey[key] && (key !== 'k' || coordMode === '3d'));
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
    configureControlsForView(controls, '3d', cameraLockedRef.current);
    controls.update();
    const handleControlsStart = () => {
      cameraMoveRef.current.active = false;
      setActiveView(null);
    };
    const handleControlsChange = () => queueCameraShareUpdate(220);
    const handleControlsEnd = () => queueCameraShareUpdate(0);
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
        const normal = new THREE.Vector3(...transformVector3(matrix, sourceVector.values));
        const lengthSquared = normal.lengthSq();
        if (lengthSquared < EPSILON) return new THREE.Vector3(0, 0, 0);
        const scalarValue = hasScalarText(sourceVector.scalar)
          ? parseNumber(sourceVector.scalar)
          : lengthSquared;
        return normal.multiplyScalar(scalarValue / lengthSquared);
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
        const snappedWorld = constrainVectorForMode(nextWorld, mode);
        let adjustedWorld = snappedWorld;
        if (scalarIdFromDragKey(dragState.key)) {
          adjustedWorld =
            dragActionsRef.current.updateScalarConstraintFromDrag?.(nextWorld, dragState) ?? snappedWorld;
        } else if (vectorIdFromDragKey(dragState.key)) {
          adjustedWorld =
            dragActionsRef.current.updateUserVectorFromDrag?.(nextWorld, dragState) ?? snappedWorld;
        } else {
          adjustedWorld =
            dragActionsRef.current.updateBasisVectorFromDrag?.(dragState.key, nextWorld) ?? snappedWorld;
        }
        dragState.snapped = adjustedWorld.distanceTo(nextWorld) > EPSILON;
        setHoveredDragKey(dragState.key, true);
        return;
      }

      const labelKey = getLabelDragKey(event);
      const hit = labelKey ? null : pickDragHandle(event);
      const nextHovered = labelKey ?? hit?.userData.dragKey ?? null;
      if (arrowDragRef.current.hovered !== nextHovered) {
        setHoveredDragKey(nextHovered);
      }
    };

    const handleArrowPointerDown = (event) => {
      const labelKey = getLabelDragKey(event);
      const hit = labelKey ? null : pickDragHandle(event);
      const dragKey = labelKey ?? hit?.userData.dragKey ?? null;
      if (!dragKey) return;
      event.preventDefault();
      event.stopPropagation();
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
      const scalarNormal =
        draggedScalarId
          ? new THREE.Vector3(...transformVector3(currentMatrixRef.current, startInputVector))
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
      setHoveredDragKey(arrowDragRef.current.hovered);
    };

    const clearArrowHover = () => {
      if (arrowDragRef.current.active) return;
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
      threeRef.current?.vectorVisuals?.forEach((visual) => disposeVectorVisual(scene, visual));
      threeRef.current?.disposable.forEach((item) => item.dispose?.());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
    };
  }, [animate, queueCameraShareUpdate]);

  const moveCameraToView = useCallback((viewKey) => {
    const refs = threeRef.current;
    const preset = viewPresets[viewKey];
    if (!preset) return;
    if (cameraLockedRef.current) {
      cameraMoveRef.current.active = false;
      return;
    }
    setActiveView(viewKey);
    setCameraState({
      position: cameraVectorToShareArray(preset.position),
      target: cameraVectorToShareArray(preset.target),
    });
    if (!refs) return;
    configureControlsForView(refs.controls, viewKey, cameraLockedRef.current);
    cameraMoveRef.current = {
      active: true,
      startTime: null,
      positionFrom: refs.camera.position.clone(),
      targetFrom: refs.controls.target.clone(),
      positionTo: preset.position.clone(),
      targetTo: preset.target.clone(),
    };
  }, []);

  const switchWorkspaceMode = useCallback((mode) => {
    setWorkspaceMode(mode);
    if (mode === 'system') {
      moveCameraToView(systemDimensionRef.current === '3d' ? '3d' : '2d');
    }
  }, [moveCameraToView]);

  useEffect(() => {
    systemDimensionRef.current = lineSystem.mode ?? '2d';
    if (workspaceMode === 'system') {
      moveCameraToView(lineSystem.mode === '3d' ? '3d' : '2d');
    }
  }, [lineSystem.mode, moveCameraToView, workspaceMode]);

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

  const applyCurrentInput = useCallback(() => {
    let matrix;
    let name;

    if (inputMode === '2d') {
      const [a, b, c, d] = matrix2.map(parseNumber);
      matrix = [a, b, 0, c, d, 0, 0, 0, 0];
      name = activeMatrixPresetName ?? t(locale, 'input2dDefaultName');
    } else if (inputMode === '1d') {
      const [a] = matrix1.map(parseNumber);
      matrix = [a, 0, 0, 0, 0, 0, 0, 0, 0];
      name = activeMatrixPresetName ?? t(locale, 'input1dDefaultName');
    } else {
      matrix = matrix3.map(parseNumber);
      name = activeMatrixPresetName ?? t(locale, 'directInput');
    }

    applyTransformation(matrix, name, inputMode);
  }, [activeMatrixPresetName, applyTransformation, inputMode, locale, matrix1, matrix2, matrix3]);

  const loadPresetToMatrixInput = useCallback((preset) => {
    const values = matrixValuesForMode(preset.matrix, preset.mode).map(formatPresetInputValue);
    setHoveredMatrixPresetId(null);
    setInputMode(preset.mode);
    if (preset.mode === '2d') {
      setMatrix2(values);
    } else if (preset.mode === '1d') {
      setMatrix1(values);
    } else {
      setMatrix3(values);
    }
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
    if (inputMode === '2d') return { values: matrix2, columns: 2 };
    if (inputMode === '1d') return { values: matrix1, columns: 1 };
    return { values: matrix3, columns: 3 };
  }, [inputMode, matrix1, matrix2, matrix3]);

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

      if (normalized.length >= 9) {
        setInputMode('3d');
        setMatrix3((previous) => previous.map((value, index) => normalized[index] ?? value));
      } else if (normalized.length === 4) {
        setInputMode('2d');
        setMatrix2((previous) => previous.map((value, index) => normalized[index] ?? value));
      } else if (normalized.length === 1) {
        setInputMode('1d');
        setMatrix1((previous) => previous.map((value, index) => normalized[index] ?? value));
      } else if (inputMode === '2d') {
        setMatrix2((previous) => previous.map((value, index) => normalized[index] ?? value));
      } else if (inputMode === '1d') {
        setMatrix1((previous) => previous.map((value, index) => normalized[index] ?? value));
      } else {
        setMatrix3((previous) => previous.map((value, index) => normalized[index] ?? value));
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
  }, [inputMode, locale]);

  const updateEquation = useCallback((index, value) => {
    setEquations((previous) => previous.map((equation, equationIndex) =>
      equationIndex === index ? value : equation
    ));
  }, []);

  const addEquation = useCallback(() => {
    setEquations((previous) => [...previous, '']);
  }, []);

  const removeEquation = useCallback((index) => {
    setEquations((previous) => previous.filter((_, equationIndex) => equationIndex !== index));
  }, []);

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
      visible: item.visible !== false,
    })),
    showVolume,
    showVector,
    showBasis,
    showGrid,
    showRelativeGrid,
    showCoordinates,
    showDot,
    showAxes,
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
    showVector,
    showVolume,
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

  useEffect(() => {
    timelinePinnedRef.current = isTimelinePinned;
  }, [isTimelinePinned]);

  useEffect(() => () => {
    if (timelineCloseTimerRef.current) {
      window.clearTimeout(timelineCloseTimerRef.current);
      timelineCloseTimerRef.current = null;
    }
    if (cameraShareTimerRef.current) {
      window.clearTimeout(cameraShareTimerRef.current);
      cameraShareTimerRef.current = null;
    }
  }, []);

  const openTimelineDrawer = useCallback(() => {
    if (timelineCloseTimerRef.current) {
      window.clearTimeout(timelineCloseTimerRef.current);
      timelineCloseTimerRef.current = null;
    }
    setIsTimelineOpen(true);
  }, []);

  const closeTimelineDrawerNow = useCallback(() => {
    if (timelineCloseTimerRef.current) {
      window.clearTimeout(timelineCloseTimerRef.current);
      timelineCloseTimerRef.current = null;
    }
    timelinePinnedRef.current = false;
    setIsTimelinePinned(false);
    setIsTimelineOpen(false);
  }, []);

  const toggleTimelineDrawer = useCallback(() => {
    if (isTimelineExpanded) {
      closeTimelineDrawerNow();
      return;
    }
    openTimelineDrawer();
  }, [closeTimelineDrawerNow, isTimelineExpanded, openTimelineDrawer]);

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
    setShowCoordinates(true);
    setShowVector(true);
    setShowBasis(true);
    setBasisVisibility({ i: true, j: true, k: true });
    setShowDot(false);
    setShowAxes(true);
    setMeasureMode(null);
    setMeasureDraft([]);
    setMeasurements([]);
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

  return (
    <main className="app-shell">
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
      <AdSlot placement="top" locale={locale} />
      <div className={`workspace-shell ${isTimelineExpanded ? 'timeline-open' : ''}`}>
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
              <button
                aria-pressed={cameraLocked}
                className={`camera-lock-button ${cameraLocked ? 'active' : ''}`}
                onClick={() => setCameraLocked((value) => !value)}
                title={cameraLocked ? t(locale, 'cameraUnlock') : t(locale, 'cameraLock')}
                type="button"
              >
                <Lock size={13} />
                <span>{cameraLocked ? t(locale, 'locked') : t(locale, 'lock')}</span>
              </button>
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
                  <label className={showAxes ? 'active' : ''} title={t(locale, 'axesTitle')}>
                    <input
                      checked={showAxes}
                      onChange={(event) => setShowAxes(event.target.checked)}
                      type="checkbox"
                    />
                    <VectorSquare size={14} />
                    <span>{t(locale, 'axes')}</span>
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
                        {measureMode === 'dot' ? t(locale, 'dot') : displayMode === '3d' ? t(locale, 'volume') : t(locale, 'area')}
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
            {!isSidebarOpen && (
              <button
                className="icon-text-button dark"
                onClick={() => setIsSidebarOpen(true)}
                title={t(locale, 'panelOpen')}
              >
                <Menu size={18} />
                <span>{t(locale, 'panelButton')}</span>
              </button>
            )}
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
          {measurements.map((item) => (
            <span
              className={`axis-label measurement-label measurement-${item.type} ${item.type === 'volume' && item.targets?.length === 2 ? 'measurement-area' : ''}`}
              key={`measurement-${item.id}`}
              ref={(node) => {
                if (node) measurementLabelRefs.current.set(item.id, node);
                else measurementLabelRefs.current.delete(item.id);
              }}
            >
              <span className="axis-label-text">{item.type === 'dot' ? t(locale, 'dot') : t(locale, 'volume')}</span>
              {renderMeasurementLabelTools(item)}
            </span>
          ))}
          <span ref={scalarSolutionLabelRef} className="axis-label scalar-solution-label">
            {t(locale, 'solution')} x = (0, 0, 0)
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
        </div>
        )}
      </section>

      <aside className={`control-panel ${isSidebarOpen ? 'open' : 'closed'}`}>
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

        <div className={`panel-scroll mode-${workspaceMode}`}>
          <section className="panel system-main-panel">
            <div className="section-heading spread">
              <span className="heading-left">
                <Braces size={17} />
                <h3>{t(locale, 'systemTitle')}</h3>
              </span>
              <button className="tiny-add-button" onClick={addEquation} title={t(locale, 'addEquation')}>
                <Plus size={14} />
              </button>
            </div>

            <div className="equation-presets line-presets" aria-label={t(locale, 'systemExamples')}>
              <button onClick={() => setEquations(equationExamples.unique)}>{t(locale, 'intersection')}</button>
              <button onClick={() => setEquations(equationExamples.none)}>{t(locale, 'parallel')}</button>
              <button onClick={() => setEquations(equationExamples.infinite)}>{t(locale, 'overlap')}</button>
              <button onClick={() => setEquations(equationExamples.space3d)}>3D</button>
              <button onClick={() => setEquations(equationExamples.overlap3d)}>{t(locale, 'overlap3d')}</button>
            </div>

            <div className="equation-list line-equation-list">
              {equations.map((equation, index) => {
                const item =
                  lineSystem.mode === '3d'
                    ? lineSystem.planes.find((plane) => plane.index === index)
                    : lineSystem.lines.find((line) => line.index === index);
                const color = item?.color ?? equationLineColors[index % equationLineColors.length];
                const prefix = lineSystem.mode === '3d' ? 'P' : 'L';
                return (
                  <label key={index}>
                    <span style={{ '--line-color': `#${color.toString(16).padStart(6, '0')}` }}>
                      {prefix}{index + 1}
                    </span>
                    <input
                      value={equation}
                      placeholder={index === 0 ? '2x + 3y + z = 5' : 'x - y - 1'}
                      onChange={(event) => updateEquation(index, event.target.value)}
                    />
                    {equations.length > 1 && (
                      <button
                        className="line-remove"
                        onClick={() => removeEquation(index)}
                        title={t(locale, 'deleteEquation')}
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>

            <div className={`line-status-card ${lineSystem.status}`}>
              <div className="solver-topline">
                <span>{t(locale, 'status')}</span>
                <strong>{t(locale, statusKeyForLineSystem(lineSystem.status))}</strong>
              </div>
              {lineSystem.point && (
                <div className="line-solution">
                  <span>{t(locale, 'linePoint')}</span>
                  <strong>{formatCoord(lineSystem.point, lineSystem.mode)}</strong>
                </div>
              )}
              {lineSystem.mode === '3d' && lineSystem.solution?.rankA !== undefined && (
                <div className="solver-rank-row">
                  <span>rank(A) <strong>{lineSystem.solution.rankA}</strong></span>
                  <span>rank([A|b]) <strong>{lineSystem.solution.rankAugmented}</strong></span>
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
                  <div className="line-solution solution-rail">
                    <span>{lineSystem.solution?.nullspaceBasis?.length === 1 ? t(locale, 'commonLine') : t(locale, 'commonPlane')}</span>
                    <strong>{formatGeneralSolution(lineSystem.solution)}</strong>
                  </div>
                </>
              )}
              {lineSystem.status === 'none3d' && (
                <p className="line-note">{t(locale, 'no3dNote')}</p>
              )}
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
          </section>

          <section className="panel current-space-panel">
            <div className="section-heading spread current-space-heading">
              <span className="heading-left">
                <Grid3X3 size={17} />
                <h3>{t(locale, 'currentSpace')}</h3>
              </span>
              <button
                aria-expanded={isTimelineExpanded}
                className="timeline-open-button"
                onClick={toggleTimelineDrawer}
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

          <section className="panel timeline-panel">
            <div className="section-heading spread timeline-heading">
              <span className="heading-left">
                <History size={17} />
                <h3>{t(locale, 'spaceTimeline')}</h3>
              </span>
              <span className="timeline-count">{history.length}</span>
            </div>
            <div className="timeline-body">
              <div
                className="history-strip"
                aria-label={t(locale, 'transformHistory')}
                ref={historyStripRef}
              >
                {history.map((step, index) => (
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
              <div className="timeline-detail-slot">
                {previewHistory && (
                  <HistoryDetail
                    entry={previewHistory}
                    index={previewIndex}
                    isActive={previewIndex === activeHistoryIndex}
                    locale={locale}
                  />
                )}
              </div>
            </div>
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
                  <button className={inputMode === '3d' ? 'active' : ''} onClick={() => setInputMode('3d')}>3x3</button>
                  <button className={inputMode === '2d' ? 'active' : ''} onClick={() => setInputMode('2d')}>2x2</button>
                  <button className={inputMode === '1d' ? 'active' : ''} onClick={() => setInputMode('1d')}>1x1</button>
                </div>
              </div>
            </div>
            <div className="matrix-workspace">
              <div className="matrix-input-column">
                <div className="matrix-input-zone">
              {inputMode === '3d' && (
                <MatrixInput
                  values={previewMatrixInputValues}
                  columns={3}
                  accent={hoveredMatrixPreset ? 'preview' : 'teal'}
                  onChange={(values) => {
                    setHoveredMatrixPresetId(null);
                    setMatrix3(values);
                  }}
                  onEnter={applyCurrentInput}
                  locale={locale}
                />
              )}
              {inputMode === '2d' && (
                <MatrixInput
                  values={previewMatrixInputValues}
                  columns={2}
                  accent={hoveredMatrixPreset ? 'preview' : 'red'}
                  onChange={(values) => {
                    setHoveredMatrixPresetId(null);
                    setMatrix2(values);
                  }}
                  onEnter={applyCurrentInput}
                  locale={locale}
                />
              )}
              {inputMode === '1d' && (
                <MatrixInput
                  values={previewMatrixInputValues}
                  columns={1}
                  accent={hoveredMatrixPreset ? 'preview' : 'gold'}
                  onChange={(values) => {
                    setHoveredMatrixPresetId(null);
                    setMatrix1(values);
                  }}
                  onEnter={applyCurrentInput}
                  locale={locale}
                />
              )}
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
                    {visibleBasisItems.map((item) => (
                      <div
                        className="basis-compact-row"
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
                          aria-label={t(locale, 'resetBasisAria', { name: item.name })}
                          className="basis-reset-button"
                          onClick={() => resetBasisVector(item.id)}
                          title={t(locale, 'resetBasis', { name: item.name })}
                          type="button"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                {transformedVectorItems.map((item) => {
                  const axes = displayMode === '1d' ? ['x'] : displayMode === '2d' ? ['x', 'y'] : ['x', 'y', 'z'];
                  return (
                    <div
                      className={`vector-card ${item.id === activeVectorId ? 'active' : ''} ${measureDraft.includes(`v:${item.id}`) ? 'measuring' : ''} ${showVector ? '' : 'muted'} ${item.visible ? '' : 'scene-hidden'} ${item.scalarEnabled ? 'scalar-active' : ''}`}
                      key={item.id}
                      style={{ '--vector-color': item.colorHex }}
                    >
                      <div className="vector-card-head">
                        <div className="vector-chip-wrap">
                          <button
                            className="vector-chip"
                            onClick={() => {
                              if (pickMeasureTarget(`v:${item.id}`)) return;
                              setActiveVectorId(item.id);
                            }}
                            type="button"
                          >
                            <span className="vector-swatch" />
                            {item.name}
                          </button>
                          <div className="vector-measure-menu" aria-label={t(locale, 'vectorMeasureMenu', { name: item.name })}>
                            <button
                              className={measureMode === 'dot' && measureDraft.includes(`v:${item.id}`) ? 'active' : ''}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                startMeasurementFrom('dot', `v:${item.id}`);
                              }}
                              title={t(locale, 'dotStartTitle', { name: item.name })}
                              type="button"
                            >
                              <Sigma size={11} />
                              <span>{t(locale, 'dot')}</span>
                            </button>
                            <button
                              className={measureMode === 'volume' && measureDraft.includes(`v:${item.id}`) ? 'active' : ''}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                startMeasurementFrom('volume', `v:${item.id}`);
                              }}
                              title={t(locale, 'volumeStartTitle', { name: item.name })}
                              type="button"
                            >
                              <Box size={11} />
                              <span>{displayMode === '3d' ? t(locale, 'volume') : t(locale, 'area')}</span>
                            </button>
                          </div>
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
                                value={item.scalar}
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
                          value={item.scalar}
                          onChange={(event) => updateVectorScalar(item.id, event.target.value)}
                        />
                        <span className="scalar-equation">
                          A{item.name} · x =
                        </span>
                        <span className="scalar-auto">
                          {item.scalarAuto ? `${t(locale, 'auto')} ${formatNumber(item.scalarResolved)}` : formatNumber(item.scalarResolved)}
                        </span>
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

      <button
        aria-label={t(locale, 'timelineClose')}
        className={`timeline-drawer-backdrop ${isTimelineExpanded ? 'open' : ''}`}
        onClick={closeTimelineDrawerNow}
        type="button"
      />
      <aside
        aria-expanded={isTimelineExpanded}
        aria-label={t(locale, 'spaceTimeline')}
        className={`timeline-drawer ${isTimelineExpanded ? 'open' : ''} ${isTimelinePinned ? 'pinned' : ''}`}
      >
        <div className="timeline-drawer-head">
          <button
            aria-label={t(locale, 'timelineClose')}
            className="icon-button timeline-drawer-close"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeTimelineDrawerNow();
            }}
            type="button"
          >
            <X size={12} />
          </button>
        </div>
        <div className="timeline-drawer-body">
          <div className="drawer-history-list" ref={historyStripRef}>
            {history.map((step, index) => (
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
                  onFocus={() => setHoveredHistoryIndex(index)}
                  onMouseEnter={() => setHoveredHistoryIndex(index)}
                  onMouseMove={() => setHoveredHistoryIndex(index)}
                  onMouseLeave={() => setHoveredHistoryIndex(null)}
                  onClick={() => jumpToHistory(index)}
                  onPointerEnter={() => setHoveredHistoryIndex(index)}
                  onPointerMove={() => setHoveredHistoryIndex(index)}
                  onPointerLeave={() => setHoveredHistoryIndex(null)}
                  title={step.name}
                  type="button"
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
                    type="button"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="timeline-detail-slot">
            {previewHistory && (
              <HistoryDetail
                entry={previewHistory}
                index={previewIndex}
                isActive={previewIndex === activeHistoryIndex}
                locale={locale}
              />
            )}
          </div>
        </div>
      </aside>
      </div>
      <AdSlot placement="bottom" locale={locale} />
    </main>
  );
}

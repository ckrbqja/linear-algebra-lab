import { useEffect, useState } from 'react';

export const NOTEBOOK_CAPTION_EDGE_GAP = 12;
export const MOBILE_NOTEBOOK_MID_SNAP = 1;
export const MOBILE_NOTEBOOK_FULL_SNAP = 2;
export const MOBILE_NOTEBOOK_SNAP_POINTS = [0, 0.58, 1];

const MOBILE_NOTEBOOK_FULL_COMMIT_RATIO = 0.76;
const MOBILE_NOTEBOOK_CLOSE_COMMIT_RATIO = 0.46;
const MOBILE_NOTEBOOK_COLLAPSE_COMMIT_RATIO = 0.34;
const SCENE_CONTAIN_ASPECT = 1.12;
const SCENE_MIN_PROJECTION_ASPECT = 0.25;
const SCENE_MAX_VERTICAL_FOV_DEG = 120;

export function sceneVerticalFovForViewport(
  width,
  height,
  baseVerticalFovDeg = 45
) {
  const safeWidth = Math.max(Number(width) || 0, 1);
  const safeHeight = Math.max(Number(height) || 0, 1);
  const aspect = Math.max(
    safeWidth / safeHeight,
    SCENE_MIN_PROJECTION_ASPECT
  );
  const baseFov = Math.min(
    Math.max(Number(baseVerticalFovDeg) || 45, 1),
    SCENE_MAX_VERTICAL_FOV_DEG
  );
  if (aspect >= SCENE_CONTAIN_ASPECT) return baseFov;

  const baseHalfFov = (baseFov * Math.PI) / 360;
  const containedFov =
    (Math.atan(Math.tan(baseHalfFov) * (SCENE_CONTAIN_ASPECT / aspect)) * 360) /
    Math.PI;
  return Math.min(containedFov, SCENE_MAX_VERTICAL_FOV_DEG);
}

export function resolveMobileNotebookSnap(startSnap, offsetY, sheetHeight) {
  const height = Math.max(Number(sheetHeight) || 0, 1);
  const midHeight = MOBILE_NOTEBOOK_SNAP_POINTS[MOBILE_NOTEBOOK_MID_SNAP] * height;
  const fullTravel = (
    MOBILE_NOTEBOOK_SNAP_POINTS[MOBILE_NOTEBOOK_FULL_SNAP] -
    MOBILE_NOTEBOOK_SNAP_POINTS[MOBILE_NOTEBOOK_MID_SNAP]
  ) * height;

  if (startSnap === MOBILE_NOTEBOOK_FULL_SNAP) {
    if (offsetY <= 0) return MOBILE_NOTEBOOK_FULL_SNAP;
    return offsetY >= fullTravel * MOBILE_NOTEBOOK_COLLAPSE_COMMIT_RATIO
      ? MOBILE_NOTEBOOK_MID_SNAP
      : MOBILE_NOTEBOOK_FULL_SNAP;
  }

  if (offsetY < 0) {
    return Math.abs(offsetY) >= fullTravel * MOBILE_NOTEBOOK_FULL_COMMIT_RATIO
      ? MOBILE_NOTEBOOK_FULL_SNAP
      : MOBILE_NOTEBOOK_MID_SNAP;
  }

  if (offsetY > 0) {
    return offsetY >= midHeight * MOBILE_NOTEBOOK_CLOSE_COMMIT_RATIO
      ? 0
      : MOBILE_NOTEBOOK_MID_SNAP;
  }

  return MOBILE_NOTEBOOK_MID_SNAP;
}

export function startControlPanelResize({
  event,
  normalizeWidth,
  onCommit,
  startWidth,
  workspace,
}) {
  const handle = event.currentTarget;
  if (!handle || !workspace) return () => {};

  const pointerId = event.pointerId;
  const startClientX = event.clientX;
  const workspaceWidth = workspace.getBoundingClientRect().width;
  let appliedWidth = startWidth;
  let pendingWidth = startWidth;
  let frameId = null;
  let active = true;

  const applyResizePreview = () => {
    frameId = null;
    appliedWidth = pendingWidth;
    workspace.style.setProperty(
      '--control-panel-resize-offset',
      `${startWidth - appliedWidth}px`
    );
    handle.setAttribute('aria-valuenow', String(appliedWidth));
    handle.setAttribute('aria-valuetext', `${appliedWidth}px`);
  };

  const handlePointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    pendingWidth = normalizeWidth(
      startWidth + startClientX - moveEvent.clientX,
      workspaceWidth
    );
    if (frameId === null) {
      frameId = window.requestAnimationFrame(applyResizePreview);
    }
  };

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    workspace.style.removeProperty('--control-panel-resize-offset');
    workspace.classList.remove('panel-resizing');
    handle.classList.remove('dragging');
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', finishResize, true);
    window.removeEventListener('pointercancel', finishResize, true);
    window.removeEventListener('blur', finishResize);
  };

  const finishResize = (finishEvent) => {
    if (
      finishEvent.type !== 'blur' &&
      finishEvent.pointerId !== pointerId
    ) {
      return;
    }
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    appliedWidth = pendingWidth;
    workspace.style.setProperty('--control-panel-width', `${appliedWidth}px`);
    handle.setAttribute('aria-valuenow', String(appliedWidth));
    handle.setAttribute('aria-valuetext', `${appliedWidth}px`);
    cleanup();
    onCommit(appliedWidth);
  };

  workspace.classList.add('panel-resizing');
  handle.classList.add('dragging');
  window.addEventListener('pointermove', handlePointerMove, {
    capture: true,
    passive: false,
  });
  window.addEventListener('pointerup', finishResize, true);
  window.addEventListener('pointercancel', finishResize, true);
  window.addEventListener('blur', finishResize);

  return cleanup;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);
    updateMatches();
    mediaQuery.addEventListener('change', updateMatches);
    return () => mediaQuery.removeEventListener('change', updateMatches);
  }, [query]);

  return matches;
}

export function useMobileKeyboardOpen(enabled) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setIsOpen(false);
      return undefined;
    }

    const viewport = window.visualViewport;
    let fullHeight = Math.max(viewport.height, window.innerHeight);

    const updateKeyboardState = () => {
      const viewportHeight = Math.max(1, viewport.height);
      const heightLoss = fullHeight - viewportHeight;
      const nextOpen = heightLoss > 140 || viewportHeight / fullHeight < 0.78;

      if (!nextOpen) {
        fullHeight = Math.max(fullHeight, viewportHeight, window.innerHeight);
      }
      setIsOpen(nextOpen);
    };

    const resetBaseline = () => {
      fullHeight = Math.max(viewport.height, window.innerHeight);
      setIsOpen(false);
      window.requestAnimationFrame(updateKeyboardState);
    };

    updateKeyboardState();
    viewport.addEventListener('resize', updateKeyboardState);
    viewport.addEventListener('scroll', updateKeyboardState);
    window.addEventListener('orientationchange', resetBaseline);
    return () => {
      viewport.removeEventListener('resize', updateKeyboardState);
      viewport.removeEventListener('scroll', updateKeyboardState);
      window.removeEventListener('orientationchange', resetBaseline);
    };
  }, [enabled]);

  return isOpen;
}

export function suggestedNotebookTitle(source) {
  const lines = String(source ?? '').replace(/\r/g, '').split('\n');
  const caption = lines.find((line) => /^\s*\/\//u.test(line));
  if (!caption) return '';
  return caption
    .replace(/^\s*\/\/\s*/u, '')
    .replace(/\{\{([^}]+)\}\}/gu, '$1')
    .replace(/[*`#_]/gu, '')
    .replace(/\\n/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 42);
}

export function clampNotebookCaptionPosition(position, captionRect, sceneRect) {
  const current = {
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0,
  };
  if (!captionRect || !sceneRect) return current;

  const left = sceneRect.left + NOTEBOOK_CAPTION_EDGE_GAP;
  const right = sceneRect.right - NOTEBOOK_CAPTION_EDGE_GAP;
  const top = sceneRect.top + NOTEBOOK_CAPTION_EDGE_GAP;
  const bottom = sceneRect.bottom - NOTEBOOK_CAPTION_EDGE_GAP;
  let nextX = current.x;
  let nextY = current.y;

  if (captionRect.width > right - left) {
    nextX += (left + right) / 2 - (captionRect.left + captionRect.right) / 2;
  } else if (captionRect.left < left) {
    nextX += left - captionRect.left;
  } else if (captionRect.right > right) {
    nextX -= captionRect.right - right;
  }

  if (captionRect.height > bottom - top) {
    nextY += (top + bottom) / 2 - (captionRect.top + captionRect.bottom) / 2;
  } else if (captionRect.top < top) {
    nextY += top - captionRect.top;
  } else if (captionRect.bottom > bottom) {
    nextY -= captionRect.bottom - bottom;
  }

  return {
    x: Math.round(nextX * 10) / 10,
    y: Math.round(nextY * 10) / 10,
  };
}

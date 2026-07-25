import { useLayoutEffect } from 'react';

const APP_REVEAL_FONT_BUDGET_MS = 1200;

function afterNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

export default function FlowAppReady({ children }) {
  useLayoutEffect(() => {
    let cancelled = false;
    let fontBudgetTimeout = null;

    const revealApp = () => {
      if (cancelled) return;
      if (window.__flowReadyTimeout) {
        window.clearTimeout(window.__flowReadyTimeout);
        window.__flowReadyTimeout = null;
      }
      document.documentElement.classList.add('flow-app-ready');
      document.documentElement.dataset.flowMathReady = 'true';
    };

    const fontReady = document.fonts?.ready ?? Promise.resolve();
    const fontBudgetExpired = new Promise((resolve) => {
      fontBudgetTimeout = window.setTimeout(resolve, APP_REVEAL_FONT_BUDGET_MS);
    });

    Promise.race([fontReady, fontBudgetExpired])
      .then(afterNextPaint)
      .then(revealApp);

    return () => {
      cancelled = true;
      if (fontBudgetTimeout) {
        window.clearTimeout(fontBudgetTimeout);
      }
    };
  }, []);

  return children;
}

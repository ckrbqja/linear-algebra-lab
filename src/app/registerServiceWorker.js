const assetRetryParam = '__flowAssetRetry';

function hasAppStyles() {
  return window.getComputedStyle(document.documentElement)
    .getPropertyValue('--flow-app-styles-ready')
    .trim() === '1';
}

function attemptAssetRecovery() {
  if (!hasAppStyles()) window.__flowAttemptAssetRecovery?.();
}

export function registerFlowMathServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  navigator.serviceWorker.addEventListener('controllerchange', attemptAssetRecovery);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FLOW_MATH_ASSET_FAILURE') attemptAssetRecovery();
  });

  window.addEventListener('load', () => {
    if (hasAppStyles()) {
      try {
        window.sessionStorage.removeItem(window.__flowAssetRecoveryKey);
      } catch {
        // Asset recovery does not depend on session storage being available.
      }

      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has(assetRetryParam)) {
        currentUrl.searchParams.delete(assetRetryParam);
        window.history.replaceState(window.history.state, '', currentUrl.toString());
      }
    } else {
      window.setTimeout(attemptAssetRecovery, 350);
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => registration.update())
      .catch(() => {
        // The app remains fully usable online when service-worker registration is unavailable.
      });
  });
}

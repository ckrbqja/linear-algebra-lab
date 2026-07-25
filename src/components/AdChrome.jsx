import { useEffect, useRef, useState } from 'react';
import { Lock, RotateCcw } from 'lucide-react';

export function AdSlot({ placement, translate, config }) {
  const slotId = placement === 'top' ? config.topAdSlot : config.bottomAdSlot;
  const hasAdClient = !!config.adClient;
  const hasWebAd = hasAdClient && !!slotId;
  const label = placement === 'top' ? translate('adTop') : translate('adBottom');
  const containerRef = useRef(null);
  const adElementRef = useRef(null);
  const [shouldLoadAd, setShouldLoadAd] = useState(false);
  const [adStatus, setAdStatus] = useState(hasWebAd ? 'pending' : 'placeholder');

  useEffect(() => {
    if (!hasWebAd || typeof window === 'undefined') return undefined;
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') {
      setShouldLoadAd(true);
      return undefined;
    }
    const rect = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top <= viewportHeight + 400 && rect.bottom >= -400) {
      setShouldLoadAd(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShouldLoadAd(true);
      observer.disconnect();
    }, { rootMargin: '400px 0px' });
    observer.observe(container);
    return () => observer.disconnect();
  }, [hasWebAd]);

  useEffect(() => {
    if (!hasAdClient || !shouldLoadAd || typeof document === 'undefined') return;
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adClient)}`;
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = src;
      document.head.appendChild(script);
    }
  }, [config.adClient, hasAdClient, shouldLoadAd]);

  useEffect(() => {
    if (!hasWebAd || !shouldLoadAd || typeof window === 'undefined') return;
    window.setTimeout(() => {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch {
        // Ad blockers or local previews can block the ad script.
      }
    }, 120);
  }, [hasWebAd, shouldLoadAd, slotId]);

  useEffect(() => {
    if (!hasWebAd) {
      setAdStatus('placeholder');
      return undefined;
    }
    const adElement = adElementRef.current;
    const container = containerRef.current;
    if (
      !adElement ||
      !container ||
      typeof MutationObserver === 'undefined'
    ) return undefined;
    const clearProviderContainerSizing = () => {
      if (container.style.getPropertyValue('height')) {
        container.style.removeProperty('height');
      }
      if (container.style.getPropertyValue('max-height')) {
        container.style.removeProperty('max-height');
      }
    };
    const syncStatus = () => {
      const nextStatus = adElement.dataset.adStatus;
      setAdStatus(nextStatus === 'filled' || nextStatus === 'unfilled' ? nextStatus : 'pending');
      clearProviderContainerSizing();
    };
    const observer = new MutationObserver(syncStatus);
    observer.observe(adElement, {
      attributeFilter: ['data-ad-status'],
      attributes: true,
    });
    observer.observe(container, {
      attributeFilter: ['style'],
      attributes: true,
    });
    syncStatus();
    return () => observer.disconnect();
  }, [hasWebAd, slotId]);

  return (
    <aside
      aria-label={label}
      className={`ad-slot ad-${placement} ${hasWebAd ? 'configured' : 'placeholder'} ad-status-${adStatus}`}
      data-admob-app-id={config.admobAppId}
      data-ad-provider={config.adProvider}
      data-ad-render-state={adStatus}
      ref={containerRef}
    >
      {hasWebAd ? (
        <>
          <span aria-hidden="true" className="ad-disclosure">{label}</span>
          <div className="ad-frame">
            <ins
              className="adsbygoogle"
              data-ad-client={config.adClient}
              data-ad-format="horizontal"
              data-ad-slot={slotId}
              data-full-width-responsive="false"
              ref={adElementRef}
              style={{ display: 'block', width: '100%', height: '90px' }}
            />
          </div>
        </>
      ) : (
        <>
          <span>{label}</span>
          <strong>{translate('adPlaceholder')}</strong>
        </>
      )}
    </aside>
  );
}

export function AdBlockGate({ disabled = false, translate }) {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (disabled) {
      setIsBlocked(false);
      return undefined;
    }
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
  }, [disabled]);

  if (disabled || !isBlocked) return null;

  return (
    <div className="access-wall" role="dialog" aria-modal="true" aria-labelledby="access-wall-title">
      <div className="access-wall-panel">
        <span className="access-wall-icon">
          <Lock size={24} />
        </span>
        <h2 id="access-wall-title">{translate('adBlockTitle')}</h2>
        <p>{translate('adBlockMessage')}</p>
        <button type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={16} />
          <span>{translate('adBlockReload')}</span>
        </button>
      </div>
    </div>
  );
}

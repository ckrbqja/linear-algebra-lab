import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Box,
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  GraduationCap,
  Mail,
  Maximize2,
  Minimize2,
  Rocket,
  Play,
  ScanLine,
  Share2,
  SquareFunction,
  VectorSquare,
} from 'lucide-react';
import {
  localeMessages,
  localeOrderWithPreferredFirst,
  normalizeLocale,
  t,
} from '../app/localization.js';
import { homePathForLocale } from '../app/seoRoutes.js';
import { buildNotebookExamplePresets } from '../notebook/examplePresets.js';
import { buildNotebookBasicLessons } from '../notebook/lessonExamples.js';
import { buildAnimationViewerUrl } from '../urlState.js';
import FlowMathMark from './FlowMathMark.jsx';
import GlassSurface from './reactbits/GlassSurface.jsx';
import ShinySparkles from './reactbits/ShinySparkles.jsx';
import './FlowMathLanding.css';

const Aurora = lazy(() => import('./reactbits/Aurora.jsx'));

const landingPreviewLessonIds = ['matrixTransform', 'rankDrop3d', 'system-two-views'];

function buildLandingPreviewScript(script) {
  return script.flatMap((line) => {
    const trimmed = String(line).trim();
    if (/^checkpoint$/iu.test(trimmed)) return ['ns 1s'];
    if (/^inspect$/iu.test(trimmed)) return [];
    return [line];
  });
}

const landingDemoHistoryKey = 'flowMathLandingDemo';

const featureItems = [
  { icon: ShinySparkles, title: 'landingFeature1Title', body: 'landingFeature1Body', mobileBody: 'landingFeature1BodyMobile', className: 'wide' },
  { icon: Clock3, title: 'landingFeature2Title', body: 'landingFeature2Body', mobileBody: 'landingFeature2BodyMobile', className: 'timeline' },
  { icon: Box, title: 'landingFeature3Title', body: 'landingFeature3Body', mobileBody: 'landingFeature3BodyMobile', className: 'spatial' },
  { icon: Braces, title: 'landingFeature4Title', body: 'landingFeature4Body', mobileBody: 'landingFeature4BodyMobile', className: 'board' },
  { icon: Share2, title: 'landingFeature5Title', body: 'landingFeature5Body', mobileBody: 'landingFeature5BodyMobile', className: 'share' },
  { icon: ScanLine, title: 'landingFeature6Title', body: 'landingFeature6Body', mobileBody: 'landingFeature6BodyMobile', className: 'caption' },
];

const audienceItems = [
  { icon: GraduationCap, title: 'landingAudience1Title', body: 'landingAudience1Body' },
  { icon: SquareFunction, title: 'landingAudience2Title', body: 'landingAudience2Body' },
  { icon: Code2, title: 'landingAudience3Title', body: 'landingAudience3Body' },
];

const workflowItems = [
  { number: '01', icon: Copy, title: 'landingStep1Title', body: 'landingStep1Body' },
  { number: '02', icon: ShinySparkles, title: 'landingStep2Title', body: 'landingStep2Body' },
  { number: '03', icon: CirclePlay, title: 'landingStep3Title', body: 'landingStep3Body' },
];

const faqItems = [
  { question: 'landingFaq1Question', answer: 'landingFaq1Answer' },
  { question: 'landingFaq2Question', answer: 'landingFaq2Answer' },
  { question: 'landingFaq3Question', answer: 'landingFaq3Answer' },
  { question: 'landingFaq4Question', answer: 'landingFaq4Answer' },
  { question: 'landingFaq5Question', answer: 'landingFaq5Answer' },
];

function LandingSectionKicker({ children, icon: Icon }) {
  return (
    <p className="flow-landing-kicker">
      <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
      <span>{children}</span>
    </p>
  );
}

function ProductPreview({
  activeDemoId,
  demoLabel,
  demoTabs = [],
  demoUrl,
  isMaximized,
  locale,
  onClose,
  onExpand,
  onMinimize,
  onSelectDemo,
  onToggleMaximize,
}) {
  const previewLabel = demoLabel
    ? `${t(locale, 'landingPreviewAria')}: ${demoLabel}`
    : t(locale, 'landingPreviewAria');
  const frameRef = useRef(null);
  const frameFallbackTimerRef = useRef(null);
  const frameRevealTimerRef = useRef(null);
  const frameLoadStartedAtRef = useRef(Date.now());
  const frameLoadUrlRef = useRef(null);
  const [readyDemoUrl, setReadyDemoUrl] = useState(null);
  const isFrameReady = Boolean(demoUrl && readyDemoUrl === demoUrl);
  const previewTransitionClass = activeDemoId === 'rankDrop3d'
    ? 'is-space-collapse'
    : 'is-system-intersection';

  if (frameLoadUrlRef.current !== demoUrl) {
    frameLoadUrlRef.current = demoUrl;
    frameLoadStartedAtRef.current = Date.now();
  }

  useEffect(() => {
    if (!demoUrl) return undefined;

    const handlePreviewReady = (event) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        event.data?.type !== 'flow-math-preview-ready'
      ) {
        return;
      }
      if (frameFallbackTimerRef.current) {
        window.clearTimeout(frameFallbackTimerRef.current);
        frameFallbackTimerRef.current = null;
      }
      const minimumTransitionTime = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 720;
      const remainingTransitionTime = Math.max(
        0,
        minimumTransitionTime - (Date.now() - frameLoadStartedAtRef.current)
      );
      frameRevealTimerRef.current = window.setTimeout(() => {
        frameRevealTimerRef.current = null;
        setReadyDemoUrl(demoUrl);
      }, remainingTransitionTime);
    };

    window.addEventListener('message', handlePreviewReady);
    return () => {
      window.removeEventListener('message', handlePreviewReady);
      if (frameFallbackTimerRef.current) {
        window.clearTimeout(frameFallbackTimerRef.current);
        frameFallbackTimerRef.current = null;
      }
      if (frameRevealTimerRef.current) {
        window.clearTimeout(frameRevealTimerRef.current);
        frameRevealTimerRef.current = null;
      }
    };
  }, [demoUrl]);

  const handleFrameLoad = () => {
    if (!demoUrl) return;
    if (frameFallbackTimerRef.current) {
      window.clearTimeout(frameFallbackTimerRef.current);
    }
    frameFallbackTimerRef.current = window.setTimeout(() => {
      frameFallbackTimerRef.current = null;
      setReadyDemoUrl(demoUrl);
    }, 2400);
  };

  return (
    <div
      className="flow-landing-preview"
      aria-label={previewLabel}
      role="region"
    >
      <div className="flow-preview-toolbar">
        {onClose ? (
          <span className="flow-preview-window-controls">
            <button
              aria-label={t(locale, 'landingExampleClose')}
              className="is-close"
              onClick={onClose}
              title={t(locale, 'landingExampleClose')}
              type="button"
            />
            <button
              aria-label={t(locale, 'landingExampleMinimize')}
              className="is-minimize"
              onClick={onMinimize}
              title={t(locale, 'landingExampleMinimize')}
              type="button"
            >
              <Minimize2 size={8} />
            </button>
            <button
              aria-label={t(
                locale,
                isMaximized ? 'landingExampleRestore' : 'landingExampleMaximize'
              )}
              className="is-maximize"
              onClick={onToggleMaximize}
              title={t(
                locale,
                isMaximized ? 'landingExampleRestore' : 'landingExampleMaximize'
              )}
              type="button"
            >
              <Maximize2 size={8} />
            </button>
          </span>
        ) : (
          <span className="flow-preview-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        <FlowMathMark className="flow-preview-toolbar-mark" />
        <span className="flow-preview-demo-title">{t(locale, 'landingPreviewLive')}</span>
        {demoTabs.length > 1 && onSelectDemo && (
          <div
            aria-label={t(locale, 'landingPreviewTabsAria')}
            className="flow-preview-tabs"
            role="tablist"
          >
            {demoTabs.map((demo) => (
              <button
                aria-selected={activeDemoId === demo.id}
                className={activeDemoId === demo.id ? 'is-active' : undefined}
                key={demo.id}
                onClick={() => onSelectDemo(demo.id)}
                role="tab"
                title={demo.label}
                type="button"
              >
                {demo.label}
              </button>
            ))}
          </div>
        )}
        <span className={`flow-preview-status ${isFrameReady ? '' : 'is-loading'}`}>
          <span aria-hidden="true" />
          {t(locale, isFrameReady ? 'landingPreviewReady' : 'landingPreviewLoading')}
        </span>
      </div>

      <div aria-busy={!isFrameReady} className="flow-preview-live-stage">
        {demoUrl ? (
          <>
            <iframe
              allow="fullscreen"
              className={`flow-preview-live-frame ${isFrameReady ? 'is-ready' : ''}`}
              key={demoUrl}
              loading="eager"
              onLoad={handleFrameLoad}
              ref={frameRef}
              referrerPolicy="same-origin"
              sandbox="allow-same-origin allow-scripts"
              scrolling="no"
              src={demoUrl}
              tabIndex={isFrameReady ? 0 : -1}
              title={previewLabel}
            />
            {!isFrameReady && (
              <div
                aria-live="polite"
                className={`flow-preview-skeleton ${previewTransitionClass}`}
                role="status"
              >
                <span aria-hidden="true" className="flow-preview-simple-loader">
                  <i />
                  <b />
                  <em />
                </span>
                <span className="sr-only">{t(locale, 'landingPreviewLoading')}</span>
              </div>
            )}
          </>
        ) : (
          <div className="flow-preview-live-loading">{t(locale, 'landingPreviewLoading')}</div>
        )}
      </div>

      <div className="flow-preview-live-footer">
        <span>
          <Check size={13} />
          {demoLabel || t(locale, 'landingPreviewStudentMode')}
        </span>
        {onExpand ? (
          <button className="flow-preview-open" onClick={onExpand} type="button">
            {t(locale, 'landingPreviewOpen')}
            <Maximize2 size={14} />
          </button>
        ) : (
          <a
            className="flow-preview-open"
            href={demoUrl || '#flow-landing-main'}
            rel="noreferrer"
            target={demoUrl ? '_blank' : undefined}
          >
            {t(locale, 'landingPreviewOpen')}
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

function MobileDemoTeaser({
  activeDemoId,
  demoLabel,
  demoTabs = [],
  locale,
  onOpen,
  onSelectDemo,
}) {
  const isSpaceDemo = activeDemoId === 'rankDrop3d';

  return (
    <div
      aria-label={`${t(locale, 'landingPreviewAria')}: ${demoLabel}`}
      className="flow-mobile-demo-teaser"
      role="region"
    >
      <div className="flow-mobile-demo-toolbar">
        <span className="flow-preview-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <FlowMathMark className="flow-preview-toolbar-mark" />
        <div
          aria-label={t(locale, 'landingPreviewTabsAria')}
          className="flow-preview-tabs"
          role="tablist"
        >
          {demoTabs.map((demo) => (
            <button
              aria-selected={activeDemoId === demo.id}
              className={activeDemoId === demo.id ? 'is-active' : undefined}
              key={demo.id}
              onClick={() => onSelectDemo(demo.id)}
              role="tab"
              title={demo.label}
              type="button"
            >
              {demo.label}
            </button>
          ))}
        </div>
      </div>

      <button
        aria-label={`${demoLabel} — ${t(locale, 'landingPreviewOpen')}`}
        className="flow-mobile-demo-trigger"
        onClick={onOpen}
        type="button"
      >
        <span
          aria-hidden="true"
          className={`flow-mobile-demo-graphic${isSpaceDemo ? ' is-space' : ' is-system'}`}
        >
          <i className="is-axis-x" />
          <i className="is-axis-y" />
          <i className="is-line-a" />
          <i className="is-line-b" />
          <i className="is-node" />
        </span>
        <span className="flow-mobile-demo-copy">
          <small>{t(locale, 'landingPreviewLive')}</small>
          <strong>{demoLabel}</strong>
          <span>
            {t(locale, 'landingPreviewOpen')}
            <Maximize2 size={15} />
          </span>
        </span>
      </button>
    </div>
  );
}

function LandingHeaderSurface({ children, isMobile }) {
  if (isMobile) {
    return <div className="flow-landing-header-mobile-surface">{children}</div>;
  }

  return (
    <GlassSurface
      backgroundOpacity={0.1}
      borderRadius={16}
      borderWidth={0.07}
      blueOffset={20}
      blur={11}
      brightness={50}
      displace={0.5}
      distortionScale={-180}
      greenOffset={10}
      height={52}
      opacity={0.93}
      redOffset={0}
      saturation={1}
      width="100%"
    >
      {children}
    </GlassSurface>
  );
}

export default function FlowMathLanding({
  locale,
  onEnter,
  setLocale,
  supportMailHref,
}) {
  const [localeOptions] = useState(() => localeOrderWithPreferredFirst(locale));
  const [activeDemoId, setActiveDemoId] = useState(null);
  const [featuredDemoId, setFeaturedDemoId] = useState(null);
  const [isDemoMaximized, setIsDemoMaximized] = useState(false);
  const [isDemoMinimized, setIsDemoMinimized] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
  );
  const demoModalRef = useRef(null);
  const demoHistoryBackPendingRef = useRef(false);

  const demoLessons = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const sourceLessons = [
      ...buildNotebookExamplePresets(locale).lessons,
      ...buildNotebookBasicLessons(locale).lessons,
    ];
    return landingPreviewLessonIds.flatMap((lessonId) => {
      const sourceLesson = sourceLessons.find((lesson) => lesson.id === lessonId);
      if (!sourceLesson) return [];
      return [{
        contract: sourceLesson.contract,
        demoUrl: buildAnimationViewerUrl({
          locale,
          notebookSpeed: 1,
          notebookText: buildLandingPreviewScript(sourceLesson.script).join('\n'),
          preview: true,
        }),
        id: sourceLesson.id,
        label: sourceLesson.label,
      }];
    });
  }, [locale]);

  const activeDemo = demoLessons.find((lesson) => lesson.id === activeDemoId) ?? null;
  const featuredDemo = demoLessons.find((lesson) => lesson.id === featuredDemoId)
    ?? demoLessons[0]
    ?? null;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)');
    const handleViewportChange = (event) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleViewportChange);
    return () => mediaQuery.removeEventListener?.('change', handleViewportChange);
  }, []);

  const resetDemoState = () => {
    setActiveDemoId(null);
    setIsDemoMaximized(false);
    setIsDemoMinimized(false);
  };

  const writeDemoHistory = (demoId, { replace = false } = {}) => {
    if (typeof window === 'undefined') return;
    const currentState = window.history.state;
    const nextState = {
      ...(currentState && typeof currentState === 'object' ? currentState : {}),
      [landingDemoHistoryKey]: demoId,
    };
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](nextState, '', window.location.href);
  };

  const openDemo = (demoId) => {
    const currentHistoryDemoId = window.history.state?.[landingDemoHistoryKey];
    writeDemoHistory(demoId, { replace: Boolean(currentHistoryDemoId) });
    demoHistoryBackPendingRef.current = false;
    setFeaturedDemoId(demoId);
    setActiveDemoId(demoId);
    setIsDemoMaximized(false);
    setIsDemoMinimized(false);
  };

  const selectFeaturedDemo = (demoId) => {
    setFeaturedDemoId(demoId);
    if (!activeDemoId) return;
    writeDemoHistory(demoId, { replace: true });
    setActiveDemoId(demoId);
  };

  const closeDemo = () => {
    if (typeof window !== 'undefined' && window.history.state?.[landingDemoHistoryKey]) {
      if (demoHistoryBackPendingRef.current) return;
      demoHistoryBackPendingRef.current = true;
      window.history.back();
      return;
    }
    resetDemoState();
  };

  useEffect(() => {
    const restoreDemoFromHistory = (historyState) => {
      demoHistoryBackPendingRef.current = false;
      const historyDemoId = historyState?.[landingDemoHistoryKey];
      const historyDemo = demoLessons.find((lesson) => lesson.id === historyDemoId);
      if (!historyDemo) {
        resetDemoState();
        return;
      }
      setFeaturedDemoId(historyDemo.id);
      setActiveDemoId(historyDemo.id);
      setIsDemoMaximized(false);
      setIsDemoMinimized(false);
    };
    const handlePopState = (event) => restoreDemoFromHistory(event.state);
    restoreDemoFromHistory(window.history.state);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [demoLessons]);

  useEffect(() => {
    if (!activeDemo || isDemoMinimized) return undefined;
    const animationFrame = window.requestAnimationFrame(() => demoModalRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      closeDemo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDemo, isDemoMinimized]);

  return (
    <div
      className={`flow-landing${activeDemo && !isDemoMinimized ? ' has-demo-modal' : ''}`}
      id="flow-landing-top"
    >
      <a className="flow-landing-skip" href="#flow-landing-main">
        {t(locale, 'landingSkip')}
      </a>

      <div className="flow-landing-header-shell">
        <LandingHeaderSurface isMobile={isMobileViewport}>
          <header className="flow-landing-header">
            <a className="flow-landing-brand" href="#flow-landing-top" aria-label="Flow Math">
              <FlowMathMark className="flow-landing-mark" />
              <span>
                <strong>Flow Math</strong>
                <small>{t(locale, 'flowHomeEyebrow')}</small>
              </span>
            </a>

            <nav className="flow-landing-nav" aria-label={t(locale, 'landingNavAria')}>
              <a href="#flow-features">{t(locale, 'landingNavFeatures')}</a>
              <a href="#flow-workflow">{t(locale, 'landingNavWorkflow')}</a>
              <a href="#flow-faq">{t(locale, 'landingNavFaq')}</a>
            </nav>

            <div className="flow-landing-tools">
              <label className="flow-landing-locale">
                <span className="sr-only">{t(locale, 'language')}</span>
                <select
                  aria-label={t(locale, 'language')}
                  onChange={(event) => {
                    const nextLocale = normalizeLocale(event.target.value);
                    if (typeof window !== 'undefined') {
                      const nextUrl = new URL(window.location.href);
                      nextUrl.pathname = homePathForLocale(nextLocale);
                      nextUrl.searchParams.delete('lang');
                      window.history.replaceState(window.history.state, '', nextUrl);
                    }
                    setLocale(nextLocale);
                  }}
                  value={locale}
                >
                  {localeOptions.map((key) => (
                    <option key={key} value={key}>{localeMessages[key].name}</option>
                  ))}
                </select>
              </label>
              <a
                aria-label={t(locale, 'supportReportTitle')}
                className="flow-landing-support"
                href={supportMailHref}
                title={t(locale, 'supportReportTitle')}
              >
                <Mail size={16} />
              </a>
              <button className="flow-landing-header-cta" onClick={onEnter} type="button">
                {t(locale, 'landingHeaderCta')}
                <ArrowRight size={15} />
              </button>
            </div>
          </header>
        </LandingHeaderSurface>
      </div>

      <main id="flow-landing-main">
        <section className="flow-landing-hero" aria-labelledby="flow-landing-title">
          <div
            className={`flow-landing-aurora${isMobileViewport ? ' is-static' : ''}`}
            aria-hidden="true"
          >
            {!isMobileViewport && (
              <Suspense fallback={null}>
                <Aurora
                  blend={0.5}
                  colorStops={['#42e8c6', '#4dc7ff', '#6a5cff']}
                  speed={1}
                />
              </Suspense>
            )}
          </div>
          <div className="flow-landing-hero-copy">
            <p className="flow-landing-eyebrow">
              <span />
              {t(locale, 'landingHeroEyebrow')}
            </p>
            <h1 id="flow-landing-title">
              {t(locale, 'landingHeroTitleBefore')}
              {' '}
              <em>{t(locale, 'landingHeroTitleAccent')}</em>
              {' '}
              {t(locale, 'landingHeroTitleAfter')}
            </h1>
            <p className="flow-landing-lead">
              <span className="flow-landing-lead-desktop">
                {t(locale, 'landingHeroLead')}
              </span>
              <span className="flow-landing-lead-mobile">
                {t(locale, 'landingHeroLeadMobile')}
              </span>
            </p>
            <div className="flow-landing-hero-actions">
              <button className="flow-landing-primary" onClick={onEnter} type="button">
                <Play size={17} fill="currentColor" />
                {t(locale, 'landingPrimaryCta')}
              </button>
              <a className="flow-landing-secondary" href="#flow-workflow">
                {t(locale, 'landingSecondaryCta')}
                <ChevronRight size={17} />
              </a>
            </div>
            <p className="flow-landing-assurance">
              <Check size={14} />
              {t(locale, 'landingAssurance')}
            </p>
          </div>

          {featuredDemo && (
            <div className="flow-landing-featured-demo">
              {isMobileViewport ? (
                <MobileDemoTeaser
                  activeDemoId={featuredDemo.id}
                  demoLabel={featuredDemo.label}
                  demoTabs={demoLessons}
                  locale={locale}
                  onOpen={() => openDemo(featuredDemo.id)}
                  onSelectDemo={selectFeaturedDemo}
                />
              ) : (
                <ProductPreview
                  activeDemoId={featuredDemo.id}
                  demoLabel={featuredDemo.label}
                  demoTabs={demoLessons}
                  demoUrl={featuredDemo.demoUrl}
                  locale={locale}
                  onExpand={() => openDemo(featuredDemo.id)}
                  onSelectDemo={selectFeaturedDemo}
                />
              )}
            </div>
          )}
        </section>

        {activeDemo && !isDemoMinimized && (
          <div
            className={`flow-landing-demo-backdrop${isDemoMaximized ? ' is-maximized' : ''}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDemo();
            }}
          >
          <section
            aria-labelledby="flow-demo-showcase-title"
            aria-modal="true"
            className={`flow-landing-demo-modal${isDemoMaximized ? ' is-maximized' : ''}`}
            id="flow-demo-showcase"
            ref={demoModalRef}
            role="dialog"
            tabIndex={-1}
          >
            <h2 className="sr-only" id="flow-demo-showcase-title">{activeDemo.label}</h2>
            <ProductPreview
              activeDemoId={activeDemo.id}
              demoLabel={activeDemo.label}
              demoTabs={demoLessons}
              demoUrl={activeDemo.demoUrl}
              isMaximized={isDemoMaximized}
              locale={locale}
              onClose={closeDemo}
              onMinimize={closeDemo}
              onSelectDemo={selectFeaturedDemo}
              onToggleMaximize={() => setIsDemoMaximized((current) => !current)}
            />
          </section>
          </div>
        )}

        <section className="flow-landing-section" id="flow-features" aria-labelledby="flow-features-title">
          <div className="flow-landing-section-heading">
            <div>
              <LandingSectionKicker icon={ScanLine}>{t(locale, 'landingFeatureKicker')}</LandingSectionKicker>
              <h2 id="flow-features-title">{t(locale, 'landingFeatureHeading')}</h2>
            </div>
            <p>{t(locale, 'landingFeatureLead')}</p>
          </div>

          <div className="flow-landing-bento">
            {featureItems.map(({ icon: Icon, title, body, mobileBody, className }, index) => (
              <article className={`flow-feature-card ${className}`} key={title}>
                <span className="flow-feature-index">0{index + 1}</span>
                <span className="flow-feature-icon"><Icon size={20} /></span>
                <h3>{t(locale, title)}</h3>
                <p>
                  <span className="flow-feature-body-desktop">{t(locale, body)}</span>
                  <span className="flow-feature-body-mobile">{t(locale, mobileBody)}</span>
                </p>
                {className === 'timeline' && (
                  <span className="flow-feature-mini-timeline" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {className === 'spatial' && (
                  <span className="flow-feature-mini-cube" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {className === 'wide' && (
                  <span className="flow-feature-code" aria-hidden="true">
                    <code>{t(locale, 'landingFeaturePromptSource')}</code>
                    <ArrowRight size={15} />
                    <code>{t(locale, 'landingFeaturePromptResult')}</code>
                  </span>
                )}
                {className === 'board' && (
                  <span className="flow-feature-mini-board" aria-hidden="true">
                    <code>Ax = b</code>
                    <i />
                    <code>x = A⁻¹b</code>
                  </span>
                )}
                {className === 'share' && (
                  <span className="flow-feature-mini-share" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {className === 'caption' && (
                  <span className="flow-feature-mini-caption" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="flow-landing-section flow-landing-audience" aria-labelledby="flow-audience-title">
          <div className="flow-landing-section-heading compact">
            <div>
              <LandingSectionKicker icon={GraduationCap}>{t(locale, 'landingAudienceKicker')}</LandingSectionKicker>
              <h2 id="flow-audience-title">{t(locale, 'landingAudienceHeading')}</h2>
            </div>
          </div>
          <div className="flow-audience-grid">
            {audienceItems.map(({ icon: Icon, title, body }) => (
              <article key={title}>
                <Icon size={22} />
                <h3>{t(locale, title)}</h3>
                <p>{t(locale, body)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flow-landing-section flow-landing-workflow" id="flow-workflow" aria-labelledby="flow-workflow-title">
          <div className="flow-landing-section-heading">
            <div>
              <LandingSectionKicker icon={CirclePlay}>{t(locale, 'landingWorkflowKicker')}</LandingSectionKicker>
              <h2 id="flow-workflow-title">{t(locale, 'landingWorkflowHeading')}</h2>
            </div>
            <p>{t(locale, 'landingWorkflowLead')}</p>
          </div>
          <ol className="flow-workflow-list">
            {workflowItems.map(({ number, icon: Icon, title, body }) => (
              <li key={number}>
                <span className="flow-workflow-number">{number}</span>
                <span className="flow-workflow-icon"><Icon size={21} /></span>
                <div>
                  <h3>{t(locale, title)}</h3>
                  <p>{t(locale, body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flow-landing-section flow-landing-faq" id="flow-faq" aria-labelledby="flow-faq-title">
          <div className="flow-landing-section-heading compact">
            <div>
              <LandingSectionKicker icon={CircleHelp}>{t(locale, 'landingFaqKicker')}</LandingSectionKicker>
              <h2 id="flow-faq-title">{t(locale, 'landingFaqHeading')}</h2>
            </div>
          </div>
          <div className="flow-faq-list">
            {faqItems.map(({ question, answer }, index) => (
              <details key={question} open={index === 0}>
                <summary>
                  <span>{t(locale, question)}</span>
                  <span className="flow-faq-toggle" aria-hidden="true">+</span>
                </summary>
                <p>{t(locale, answer)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="flow-landing-final" aria-labelledby="flow-final-title">
          <div>
            <LandingSectionKicker icon={Rocket}>{t(locale, 'landingFinalKicker')}</LandingSectionKicker>
            <h2 id="flow-final-title">{t(locale, 'landingFinalHeading')}</h2>
            <p>{t(locale, 'landingFinalLead')}</p>
          </div>
          <button className="flow-landing-primary" onClick={onEnter} type="button">
            <VectorSquare size={18} />
            {t(locale, 'landingFinalCta')}
          </button>
        </section>
      </main>

      <footer className="flow-landing-footer">
        <div className="flow-landing-brand">
          <FlowMathMark className="flow-landing-mark" />
          <span><strong>Flow Math</strong><small>{t(locale, 'landingFooterTagline')}</small></span>
        </div>
        <p>© {new Date().getFullYear()} Flow Math</p>
        <div>
          <a href="https://textbooks.math.gatech.edu/ila/" rel="noreferrer" target="_blank">
            {t(locale, 'landingFooterReference')}
          </a>
          <a href={supportMailHref}>{t(locale, 'supportReport')}</a>
        </div>
      </footer>
    </div>
  );
}

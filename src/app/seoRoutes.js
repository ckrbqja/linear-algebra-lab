export const seoLocalePaths = Object.freeze({
  ko: '/',
  en: '/en/',
  ja: '/ja/',
  zh: '/zh/',
});

export function localeFromPathname(pathname) {
  const normalizedPath = `/${String(pathname ?? '').replace(/^\/+|\/+$/gu, '')}`;
  if (normalizedPath === '/') return 'ko';
  const locale = normalizedPath.slice(1).split('/')[0].toLowerCase();
  return Object.hasOwn(seoLocalePaths, locale) && locale !== 'ko' ? locale : null;
}

export function homePathForLocale(locale) {
  return seoLocalePaths[locale] ?? seoLocalePaths.ko;
}

export function isFlowHomePathname(pathname) {
  const normalizedPath = `/${String(pathname ?? '').replace(/^\/+|\/+$/gu, '')}`;
  return normalizedPath === '/' || Object.values(seoLocalePaths).some((path) => (
    path !== '/' && normalizedPath === path.replace(/\/$/u, '')
  ));
}

export function localizedHomeUrl(locale, baseUrl = 'https://flow-math.com/') {
  return new URL(homePathForLocale(locale), baseUrl);
}

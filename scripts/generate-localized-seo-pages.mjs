import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { localeMessages, t } from '../src/app/localization.js';
import { homePathForLocale, localizedHomeUrl } from '../src/app/seoRoutes.js';

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = resolve(projectRoot, 'dist');
const baseUrl = 'https://flow-math.com/';
const supportEmail = process.env.VITE_SUPPORT_EMAIL || 'privacy@flow-math.com';
const localizedLocales = ['en', 'ja', 'zh'];
const faqIndexes = [1, 2, 3, 4, 5];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceFirst(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Unable to replace ${label}`);
  return html.replace(pattern, replacement);
}

function localizedTitle(locale) {
  const message = localeMessages[locale] ?? localeMessages.ko;
  return locale === 'ko' ? `Flow Math | ${message.title}` : `${message.title} | Flow Math`;
}

function localizedFallback(locale) {
  const message = localeMessages[locale] ?? localeMessages.ko;
  const homeUrl = localizedHomeUrl(locale, baseUrl).toString();
  const heroTitle = [
    t(locale, 'landingHeroTitleBefore'),
    `<span>${escapeHtml(t(locale, 'landingHeroTitleAccent'))}</span>`,
    t(locale, 'landingHeroTitleAfter'),
  ].filter(Boolean).join(' ');
  const heroLead = escapeHtml(t(locale, 'landingHeroLead')).replaceAll('\n', '<br />');
  const faqs = faqIndexes.map((index) => (
    `<details${index === 1 ? ' open' : ''}>` +
    `<summary>${escapeHtml(t(locale, `landingFaq${index}Question`))}</summary>` +
    `<p>${escapeHtml(t(locale, `landingFaq${index}Answer`))}</p></details>`
  )).join('');

  return `
      <main class="seo-fallback">
        <div>
          <small>${escapeHtml(t(locale, 'landingHeroEyebrow'))}</small>
          <h1>${heroTitle}</h1>
          <p>${heroLead}</p>
          <a href="${escapeHtml(homeUrl)}">${escapeHtml(t(locale, 'landingPrimaryCta'))}</a>
          <section>
            <h2>${escapeHtml(t(locale, 'landingFeatureHeading'))}</h2>
            <p>${escapeHtml(t(locale, 'landingFeatureLead'))}</p>
          </section>
          <section id="flow-faq">
            <h2>${escapeHtml(t(locale, 'landingFaqHeading'))}</h2>
            ${faqs}
          </section>
        </div>
      </main>`;
}

function localizedSchema(locale) {
  const message = localeMessages[locale] ?? localeMessages.ko;
  const canonicalUrl = localizedHomeUrl(locale, baseUrl).toString();
  const organizationId = `${baseUrl}#organization`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Flow Math',
        url: baseUrl,
        logo: `${baseUrl}pwa-icon-512.png`,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: supportEmail,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${baseUrl}#website`,
        name: 'Flow Math',
        url: baseUrl,
        inLanguage: ['ko-KR', 'en-US', 'ja-JP', 'zh-CN'],
        description: message.description,
        publisher: { '@id': organizationId },
      },
      {
        '@type': ['WebApplication', 'LearningResource'],
        '@id': `${baseUrl}#application`,
        name: 'Flow Math',
        alternateName: ['선형대수 시각화 실험실', 'Interactive Linear Algebra Visualizer', message.title],
        url: canonicalUrl,
        image: `${baseUrl}flow-math-og.png`,
        applicationCategory: 'EducationalApplication',
        applicationSubCategory: 'Linear Algebra Visualizer',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser with JavaScript and WebGL.',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        inLanguage: message.code,
        learningResourceType: 'Interactive visualization',
        educationalUse: ['instruction', 'self study', 'classroom presentation'],
        audience: { '@type': 'EducationalAudience', educationalRole: ['student', 'teacher'] },
        description: message.description,
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        inLanguage: message.code,
        mainEntity: faqIndexes.map((index) => ({
          '@type': 'Question',
          name: t(locale, `landingFaq${index}Question`),
          acceptedAnswer: {
            '@type': 'Answer',
            text: t(locale, `landingFaq${index}Answer`),
          },
        })),
      },
    ],
  };
  return JSON.stringify(schema, null, 2);
}

function localizeHtml(rootHtml, locale) {
  const message = localeMessages[locale] ?? localeMessages.ko;
  const title = localizedTitle(locale);
  const canonicalUrl = localizedHomeUrl(locale, baseUrl).toString();
  const region = locale === 'ja' ? ['JP', 'Japan'] : locale === 'zh' ? ['CN', 'China'] : ['US', 'United States'];
  let html = rootHtml;

  html = replaceFirst(html, /<html lang="[^"]+">/u, `<html lang="${message.code}">`, 'html lang');
  html = replaceFirst(html, /<meta\s+name="description"[\s\S]*?\/>/u, `<meta name="description" content="${escapeHtml(message.description)}" />`, 'description');
  html = replaceFirst(html, /<meta name="geo\.region"[^>]*>/u, `<meta name="geo.region" content="${region[0]}" />`, 'geo.region');
  html = replaceFirst(html, /<meta name="geo\.placename"[^>]*>/u, `<meta name="geo.placename" content="${region[1]}" />`, 'geo.placename');
  html = replaceFirst(html, /<link rel="canonical"[^>]*>/u, `<link rel="canonical" href="${canonicalUrl}" />`, 'canonical');
  html = replaceFirst(html, /<meta property="og:title"[^>]*>/u, `<meta property="og:title" content="${escapeHtml(title)}" />`, 'og:title');
  html = replaceFirst(html, /<meta\s+property="og:description"[\s\S]*?\/>/u, `<meta property="og:description" content="${escapeHtml(message.description)}" />`, 'og:description');
  html = replaceFirst(html, /<meta property="og:url"[^>]*>/u, `<meta property="og:url" content="${canonicalUrl}" />`, 'og:url');
  html = replaceFirst(html, /<meta property="og:locale"[^>]*>/u, `<meta property="og:locale" content="${message.code.replace('-', '_')}" />`, 'og:locale');
  html = replaceFirst(html, /<meta property="og:image:alt"[^>]*>/u, `<meta property="og:image:alt" content="${escapeHtml(t(locale, 'landingHeroTitleAccent'))}" />`, 'og:image:alt');
  html = replaceFirst(html, /<meta name="twitter:title"[^>]*>/u, `<meta name="twitter:title" content="${escapeHtml(title)}" />`, 'twitter:title');
  html = replaceFirst(html, /<meta\s+name="twitter:description"[\s\S]*?\/>/u, `<meta name="twitter:description" content="${escapeHtml(message.description)}" />`, 'twitter:description');
  html = replaceFirst(html, /<script type="application\/ld\+json" data-linear-lab-schema>[\s\S]*?<\/script>/u, `<script type="application/ld+json" data-linear-lab-schema>\n${localizedSchema(locale)}\n    </script>`, 'JSON-LD');
  html = replaceFirst(html, /<title>[\s\S]*?<\/title>/u, `<title>${escapeHtml(title)}</title>`, 'title');
  html = replaceFirst(html, /<main class="seo-fallback">[\s\S]*?<\/main>/u, localizedFallback(locale), 'SEO fallback');
  return html;
}

const rootHtml = await readFile(resolve(distRoot, 'index.html'), 'utf8');
for (const locale of localizedLocales) {
  const outputDirectory = resolve(distRoot, homePathForLocale(locale).replace(/^\//u, ''));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, 'index.html'), localizeHtml(rootHtml, locale), 'utf8');
}

console.log(`Generated localized SEO entry pages: ${localizedLocales.join(', ')}`);

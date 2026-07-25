import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const distDir = path.resolve(process.cwd(), 'dist');
const readDist = (file) => readFile(path.join(distDir, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [redirects, headers, serviceWorker] = await Promise.all([
  readDist('_redirects'),
  readDist('_headers'),
  readDist('sw.js'),
]);
await access(path.join(distDir, '404.html'));

const redirectRules = redirects
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
assert(
  !redirectRules.some((line) => /(?:^|\s)200(?:\s|$)/.test(line)),
  'Production redirects must not rewrite missing routes or assets with status 200.'
);

const assetsHeaderBlock = headers.match(/\/assets\/\*[\s\S]*?(?=\n\/|$)/)?.[0] || '';
assert(assetsHeaderBlock, 'Missing /assets/* cache policy in dist/_headers.');
assert(
  /max-age=0/i.test(assetsHeaderBlock) && /must-revalidate/i.test(assetsHeaderBlock),
  '/assets/* must revalidate so a temporary invalid response cannot remain cached.'
);
assert(!/immutable/i.test(assetsHeaderBlock), '/assets/* must not use immutable caching.');
assert(/CACHE_VERSION\s*=\s*['"]v4['"]/.test(serviceWorker), 'Expected service-worker cache v4.');

const entryFiles = ['index.html', 'en/index.html', 'ja/index.html', 'zh/index.html'];
const referencedAssets = new Set();
for (const entryFile of entryFiles) {
  const html = await readDist(entryFile);
  for (const match of html.matchAll(/(?:href|src)=["'](\/assets\/[^"']+)["']/g)) {
    referencedAssets.add(match[1]);
  }
}

assert(referencedAssets.size > 0, 'No built assets were referenced by production entry pages.');
await Promise.all([...referencedAssets].map((assetUrl) => (
  access(path.join(distDir, assetUrl.replace(/^\//, '')))
)));

console.log(`Production routing validation passed (${referencedAssets.size} referenced assets, true 404 fallback).`);

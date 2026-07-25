import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';

const baseUrl = new URL(process.argv[2] || process.env.FLOW_MATH_VERIFY_URL || 'https://flow-math.com/');
const attempts = Number(process.env.FLOW_MATH_VERIFY_ATTEMPTS || 40);
const assetType = (pathname) => pathname.endsWith('.css') ? 'text/css' : 'javascript';

function assertAssetResponse(assetPath, response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.includes(assetType(assetPath))) {
    throw new Error(`${assetPath} returned ${response.status} ${contentType || '(no content type)'}.`);
  }
  const isMainEntryAsset = /^\/assets\/index-[^.]+\.(?:css|js)$/.test(assetPath);
  if (isMainEntryAsset && /immutable/i.test(response.headers.get('cache-control') || '')) {
    throw new Error(`${assetPath} still has an unsafe immutable cache policy.`);
  }
}

async function verify() {
  const entryUrl = new URL(baseUrl);
  entryUrl.searchParams.set('__deploymentCheck', Date.now().toString());
  const entryResponse = await fetch(entryUrl, { cache: 'no-store', redirect: 'follow' });
  if (!entryResponse.ok) throw new Error(`Entry returned ${entryResponse.status}.`);
  const html = await entryResponse.text();
  const assetPaths = [...html.matchAll(/(?:href|src)=["'](\/assets\/[^"']+\.(?:css|js))["']/g)]
    .map((match) => match[1]);
  if (assetPaths.length === 0) throw new Error('Entry did not reference built CSS or JavaScript.');

  const uniqueAssetPaths = [...new Set(assetPaths)];
  for (const [assetIndex, assetPath] of uniqueAssetPaths.entries()) {
    const probeUrl = new URL(assetPath, baseUrl);
    probeUrl.searchParams.set('__deploymentAssetProbe', `${Date.now()}-${assetIndex}`);
    const response = await fetch(probeUrl, { cache: 'no-store' });
    assertAssetResponse(assetPath, response);
  }

  for (const assetPath of uniqueAssetPaths) {
    const response = await fetch(new URL(assetPath, baseUrl), { cache: 'no-store' });
    assertAssetResponse(assetPath, response);
  }

  const missingPath = `/assets/__missing-deployment-check-${Date.now()}.css`;
  for (let requestIndex = 0; requestIndex < 2; requestIndex += 1) {
    const response = await fetch(new URL(missingPath, baseUrl), { cache: 'no-store' });
    if (response.status !== 404) {
      throw new Error(`${missingPath} returned ${response.status}; missing assets must remain 404.`);
    }
  }

  const workerResponse = await fetch(new URL('/sw.js', baseUrl), { cache: 'no-store' });
  const workerCacheControl = workerResponse.headers.get('cache-control') || '';
  if (!workerResponse.ok || !/no-store/i.test(workerCacheControl)) {
    throw new Error(`/sw.js returned ${workerResponse.status} with Cache-Control: ${workerCacheControl}.`);
  }

  return uniqueAssetPaths;
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const assetPaths = await verify();
    console.log(`Production assets verified at ${baseUrl.origin}: ${assetPaths.join(', ')}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < attempts) await wait(1500);
  }
}

throw new Error(`Production asset verification failed at ${baseUrl.origin}: ${lastError?.message}`);

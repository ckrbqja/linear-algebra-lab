import { fileURLToPath } from 'node:url';
import path from 'node:path';

import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(projectRoot, 'public');

const logoMark = `
  <path d="M128 120h256l-51.2 67.2H209.6V244H308l-48.8 64h-49.6v84H128V120Z" fill="#58e0d7"/>
  <path d="M311.2 120H384l-51.2 67.2H260l51.2-67.2Z" fill="#f1b434"/>
`;

const anyPurposeSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="44" y="44" width="424" height="424" rx="98" fill="#0f1715" stroke="#2f8078" stroke-width="7"/>
    ${logoMark}
  </svg>
`);

const maskableSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#0f1715"/>
    ${logoMark}
  </svg>
`);

async function writeIcon(svg, size, filename) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(publicDir, filename));
}

await Promise.all([
  writeIcon(maskableSvg, 180, 'pwa-icon-180.png'),
  writeIcon(anyPurposeSvg, 192, 'pwa-icon-192.png'),
  writeIcon(anyPurposeSvg, 512, 'pwa-icon-512.png'),
  writeIcon(maskableSvg, 512, 'pwa-icon-maskable-512.png'),
]);

console.log('Generated Flow Math PWA icons: 180, 192, 512, maskable-512');

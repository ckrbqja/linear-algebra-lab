import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function lineCount(relativePath) {
  const source = readFileSync(resolve(projectRoot, relativePath), 'utf8');
  return source.split(/\r?\n/u).length;
}

function assertLineBudget(relativePath, maximum) {
  const actual = lineCount(relativePath);
  if (actual > maximum) {
    failures.push(`${relativePath}: ${actual} lines (maximum ${maximum})`);
  }
}

assertLineBudget('src/styles.css', 80);
assertLineBudget('src/App.jsx', 11200);
assertLineBudget('src/AppRuntime.jsx', 5900);

for (const entry of readdirSync(resolve(projectRoot, 'src/styles'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.css')) {
    assertLineBudget(`src/styles/${entry.name}`, 2500);
  }
}

const styleEntry = readFileSync(resolve(projectRoot, 'src/styles.css'), 'utf8');
for (const requiredImport of [
  'tailwindcss/theme.css',
  'tailwindcss/utilities.css',
  './styles/base-shell.css',
  './styles/responsive.css',
]) {
  if (!styleEntry.includes(requiredImport)) {
    failures.push(`src/styles.css: missing ${requiredImport}`);
  }
}

if (failures.length) {
  console.error('Frontend architecture budget failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('Extract the new responsibility into its owning module instead of growing a legacy monolith.');
  process.exit(1);
}

console.log('Frontend architecture budget passed.');

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

assert.match(html, /<script src="\.\/js\/app\.js" defer integrity="sha384-/);
assert.doesNotMatch(html, /<script>\s/);
new Function(app);
new Function(serviceWorker);

const appIntegrity = `sha384-${crypto.createHash('sha384').update(app).digest('base64')}`;
assert.ok(html.includes(`integrity="${appIntegrity}"`), 'app.js integrity hash is stale');

for (const marker of [
  'multiple',
  'operationToken',
  'MAX_FILE_SIZE',
  'processBatch',
  'verifyCleanBlob',
  'aria-live="polite"',
  'serviceWorker.register',
  'integrity="sha384-'
]) {
  assert.ok(`${html}\n${app}`.includes(marker), `missing expected feature: ${marker}`);
}

assert.equal(manifest.name, 'Image Data Cleaner');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.ok(fs.existsSync(path.join(root, 'icon.svg')));

console.log('Static checks passed.');

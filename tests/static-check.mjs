import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, 'runtime must be contained in one inline script');
const runtime = scripts[0][1];

assert.doesNotMatch(html, /<script\s+src=/i, 'index.html must not load external scripts');
new Function(runtime);

const runtimeIntegrity = `sha384-${crypto.createHash('sha384').update(runtime).digest('base64')}`;
assert.match(html, new RegExp(`script-src[^;]*${runtimeIntegrity.replace(/[+/=]/g, '\\$&')}`), 'inline runtime CSP hash is stale');
assert.doesNotMatch(html, /manifest\.webmanifest|sw\.js|serviceWorker\.register|vendor\/|js\/app\.js/);

for (const marker of [
  'multiple',
  'operationToken',
  'MAX_FILE_SIZE',
  'processBatch',
  'verifyCleanBlob',
  'aria-live="polite"',
  'processBatch',
  'exifr.parse'
]) {
  assert.ok(html.includes(marker), `missing expected feature: ${marker}`);
}

assert.match(html, /<title>Image Data Cleaner<\/title>/);
assert.doesNotMatch(html, /IMAGE PROCESSING UNIT|LOCAL ONLY|BATCH SANITIZER|DROP FILE TO SCAN/);

console.log('Static checks passed.');

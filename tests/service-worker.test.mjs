import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'sw.js'), 'utf8');

function harness({ fetchImpl = async () => new Response('network') } = {}) {
  const listeners = new Map();
  const stored = new Map();
  const cache = {
    added: [],
    puts: [],
    async addAll(paths) { this.added.push(...paths); },
    async put(key, response) { this.puts.push([key, response]); stored.set(typeof key === 'string' ? key : key.url, response); }
  };
  const caches = {
    deleted: [],
    async open() { return cache; },
    async keys() { return ['aram-pwa-v4', 'aram-pwa-v5']; },
    async delete(key) { this.deleted.push(key); return true; },
    async match(key) { return stored.get(typeof key === 'string' ? key : key.url); }
  };
  let skipWaiting = 0;
  let claimed = 0;
  const self = {
    location: { origin: 'https://aram.test' },
    clients: { async claim() { claimed += 1; } },
    async skipWaiting() { skipWaiting += 1; },
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise });
  return { listeners, caches, cache, stored, get skipWaiting() { return skipWaiting; }, get claimed() { return claimed; } };
}

function lifecycleEvent() {
  const waits = [];
  return { waits, waitUntil(promise) { waits.push(Promise.resolve(promise)); } };
}

function fetchEvent(request) {
  const waits = [];
  let responsePromise;
  return {
    request,
    waits,
    waitUntil(promise) { waits.push(Promise.resolve(promise)); },
    respondWith(promise) { responsePromise = Promise.resolve(promise); },
    response: () => responsePromise
  };
}

test('service worker install caches the full application shell and activates immediately', async () => {
  const h = harness();
  const event = lifecycleEvent();
  h.listeners.get('install')(event);
  await Promise.all(event.waits);
  assert.ok(h.cache.added.includes('./index.html'));
  assert.ok(h.cache.added.includes('./js/developer-mode.js'));
  assert.ok(h.cache.added.includes('./icons/icon-512.png'));
  assert.equal(h.skipWaiting, 1);
});

test('service worker activation removes old caches and claims clients', async () => {
  const h = harness();
  const event = lifecycleEvent();
  h.listeners.get('activate')(event);
  await Promise.all(event.waits);
  assert.deepEqual(h.caches.deleted, ['aram-pwa-v4', 'aram-pwa-v5']);
  assert.equal(h.claimed, 1);
});

test('offline navigation falls back to the cached application shell', async () => {
  const h = harness({ fetchImpl: async () => { throw new Error('offline'); } });
  h.stored.set('./index.html', new Response('offline shell'));
  const event = fetchEvent({ method: 'GET', mode: 'navigate', url: 'https://aram.test/calendar' });
  h.listeners.get('fetch')(event);
  const response = await event.response();
  assert.equal(await response.text(), 'offline shell');
});

test('cached assets respond immediately while network refresh is scheduled', async () => {
  const request = { method: 'GET', mode: 'same-origin', url: 'https://aram.test/styles.css' };
  const h = harness({ fetchImpl: async () => new Response('fresh') });
  h.stored.set(request.url, new Response('cached'));
  const event = fetchEvent(request);
  h.listeners.get('fetch')(event);
  const response = await event.response();
  assert.equal(await response.text(), 'cached');
  await Promise.all(event.waits);
  assert.ok(h.cache.puts.some(([key]) => key === request));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_KEY, DIAGNOSTICS_KEY, createDiagnostics } from '../js/diagnostics.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    values
  };
}

test('diagnostics stores errors and local analytics without network dependencies', () => {
  let current = 1_000;
  const storage = memoryStorage();
  const diagnostics = createDiagnostics({ storage, now: () => current, schedule: callback => { callback(); return 1; }, cancelSchedule: () => {} });
  diagnostics.beginSession();
  diagnostics.enterScreen('home');
  current += 500;
  diagnostics.trackEvent('button_click', { action: 'quick-add' });
  diagnostics.captureError('rendering', new Error('failure'), { view: 'home' });
  current += 500;
  diagnostics.endSession('test');
  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.errors.length, 1);
  assert.equal(snapshot.analytics.visits.home, 1);
  assert.equal(snapshot.analytics.buttons['quick-add'], 1);
  assert.equal(snapshot.analytics.averageSessionMs, 1000);
  assert.ok(storage.getItem(DIAGNOSTICS_KEY));
  assert.ok(storage.getItem(ANALYTICS_KEY));
});

test('diagnostic buffers are capped and export includes debug metadata', () => {
  let current = 1_000;
  const storage = memoryStorage();
  const diagnostics = createDiagnostics({
    storage,
    now: () => ++current,
    limits: { errors: 3, console: 3, events: 4, sessions: 2, performance: 3 },
    schedule: callback => { callback(); return 1; },
    cancelSchedule: () => {}
  });
  for (let index = 0; index < 10; index += 1) {
    diagnostics.captureError('test', new Error(`error-${index}`));
    diagnostics.trackEvent('event', { index });
    diagnostics.recordPerformance('render', index);
  }
  diagnostics.flush();
  const snapshot = diagnostics.snapshot();
  assert.equal(snapshot.errors.length, 3);
  assert.equal(snapshot.events.length, 4);
  assert.equal(snapshot.performance.length, 3);
  const report = diagnostics.exportReport({ databaseVersion: 3 });
  assert.equal(report.databaseVersion, 3);
  assert.equal(report.diagnostics.errors.at(-1).message, 'error-9');
});

test('diagnostics keeps a local error when persistence becomes unavailable', () => {
  let writes = 0;
  const failing = memoryStorage();
  const originalSet = failing.setItem;
  failing.setItem = (key, value) => {
    writes += 1;
    if (writes > 2) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    originalSet(key, value);
  };
  const diagnostics = createDiagnostics({ storage: failing, schedule: callback => { callback(); return 1; }, cancelSchedule: () => {} });
  diagnostics.captureError('test', new Error('trigger'));
  assert.ok(diagnostics.snapshot().errors.some(item => item.category === 'diagnostics_storage'));
});

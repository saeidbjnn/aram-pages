import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V3_MIGRATION_BACKUP_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  V3_STORAGE_KEY,
  createStore,
  migrateV3,
  normalizeState,
  prepareImportedState
} from '../js/store.js';
import { MODULE_STATUS, moduleStatusFor } from '../js/modules.js';

const fixedNow = () => new Date('2026-08-07T10:00:00Z').getTime();
let sequence = 0;
const idFactory = () => `migration-${++sequence}`;
function checksum(value) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
function encode(value) { const payload = JSON.stringify(value); return JSON.stringify({ version: 2, checksum: checksum(payload), payload }); }
function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map }; }
function v3Fixture() {
  return {
    schemaVersion: 3,
    meta: { storeId: 'old-store', revision: 9, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' },
    settings: { theme: 'dark', autoContinue: false, sound: false, vibration: true, workPreset: { workMinutes: 45, breakMinutes: 5 }, readingGoal: { minutes: 20, pages: 5 }, currentBookId: 'book' },
    data: {
      tasks: [{ id: 'task', title: 'کار واقعی', startDate: '2026-08-07', dueOffsetDays: 0, time: '09:00', estimatedMinutes: 30, priority: 'high', category: 'شخصی', notes: '', recurrence: { type: 'none', interval: 1, unit: 'day', weekdays: [], endDate: null }, archivedAt: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null }],
      taskEntries: [], habits: [], habitEntries: [], notes: [],
      books: [{ id: 'book', title: 'کتاب واقعی', author: 'نویسنده', totalPages: 100, currentPage: 30, archivedAt: null, finishedAt: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null }],
      readingSessions: [{ id: 'session', bookId: 'book', date: '2026-08-06', fromPage: 20, toPage: 30, pagesRead: 10, durationSeconds: 1200, startedAt: null, endedAt: '2026-08-06T10:00:00.000Z', notes: '', createdAt: '2026-08-06T10:00:00.000Z', updatedAt: '2026-08-06T10:00:00.000Z', deletedAt: null }],
      universityItems: [{ id: 'uni', title: 'پایان‌نامه', type: 'thesis', deadline: '2026-09-01', progress: 50, status: 'in_progress', notes: '', priority: 'high', estimatedHours: 20, completedAt: null, archivedAt: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null }],
      focusSessions: [], screenTimeEntries: [{ id: 'screen', date: '2026-08-06', minutes: 80, createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z', deletedAt: null }]
    }, runtime: { timer: { mode: 'focus', phase: 'focus', status: 'idle', durationSeconds: 1500, remainingSeconds: 1500 } }
  };
}

test('v3 migration preserves every record, settings and old visible layout', () => {
  sequence = 0;
  const old = v3Fixture();
  const migrated = migrateV3(old, { now: fixedNow, idFactory });
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.meta.storeId, 'old-store');
  assert.equal(migrated.settings.theme, 'dark');
  assert.equal(migrated.settings.autoContinue, false);
  assert.equal(migrated.data.tasks.length, 1);
  assert.equal(migrated.data.books.length, 1);
  assert.equal(migrated.data.readingSessions.length, 1);
  assert.equal(migrated.data.universityItems.length, 1);
  assert.equal(migrated.data.screenTimeEntries.length, 1);
  assert.equal(moduleStatusFor(migrated, 'reading'), MODULE_STATUS.ACTIVE);
  assert.equal(moduleStatusFor(migrated, 'university'), MODULE_STATUS.ACTIVE);
  assert.equal(moduleStatusFor(migrated, 'screen-time'), MODULE_STATUS.ACTIVE);
  assert.equal(migrated.settings.modulePreferences.onboardingStatus, 'completed');
});

test('migration is idempotent after normalization', () => {
  sequence = 0;
  const once = migrateV3(v3Fixture(), { now: fixedNow, idFactory });
  const twice = normalizeState(once, { now: fixedNow, idFactory });
  assert.deepEqual(twice.data, once.data);
  assert.deepEqual(twice.settings.moduleConfigs, once.settings.moduleConfigs);
});

test('store saves an untouched v3 snapshot before committing the current schema', () => {
  sequence = 0;
  const local = storage();
  const raw = encode(v3Fixture());
  local.setItem(V3_STORAGE_KEY, raw);
  const repo = createStore({ storage: local, now: fixedNow, idFactory, eventTarget: null });
  assert.equal(repo.recovery, 'v3');
  assert.equal(local.getItem(V3_MIGRATION_BACKUP_KEY), raw);
  assert.ok(local.getItem(STORAGE_KEY));
  assert.equal(repo.getState().data.books[0].title, 'کتاب واقعی');
});

test('import accepts v3 backups, rejects newer schema and ignores malformed optional records safely', () => {
  sequence = 0;
  const imported = prepareImportedState({ format: 'aram-backup', schemaVersion: 3, state: v3Fixture() }, { now: fixedNow, idFactory });
  assert.equal(imported.data.tasks.length, 1);
  assert.throws(() => prepareImportedState({ format: 'aram-backup', schemaVersion: 99, state: { schemaVersion: 99 } }, { now: fixedNow, idFactory }), /نسخه جدیدتری/);
  const damaged = v3Fixture();
  damaged.data.books.push({ id: 'broken', title: '', totalPages: -1 });
  const repaired = migrateV3(damaged, { now: fixedNow, idFactory });
  assert.equal(repaired.data.books.length, 1);
  assert.equal(repaired.data.tasks.length, 1);
});


test('schema-v4 data with missing module preferences is treated as an existing user when records exist', () => {
  sequence = 0;
  const damaged = normalizeState({
    schemaVersion: 4,
    settings: { theme: 'light' },
    data: {
      tasks: [], taskEntries: [], habits: [], habitEntries: [], notes: [],
      books: [{ id: 'existing-book', title: 'کتاب قبلی', author: '', totalPages: 120, currentPage: 20, archivedAt: null, finishedAt: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null }],
      readingSessions: [], universityItems: [], focusSessions: [], screenTimeEntries: [], customModules: [], customModuleRecords: []
    }
  }, { now: fixedNow, idFactory });
  assert.equal(damaged.settings.modulePreferences.onboardingStatus, 'completed');
  assert.equal(moduleStatusFor(damaged, 'reading'), MODULE_STATUS.ACTIVE);
});

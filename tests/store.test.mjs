import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_KEY,
  LEGACY_KEY,
  STORAGE_KEY,
  V2_STORAGE_KEY,
  createStore,
  migrateLegacy,
  migrateV2,
  normalizeState
} from '../js/store.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    values
  };
}
const fixedNow = () => new Date('2026-08-05T10:00:00Z').getTime();
let sequence = 0;
const idFactory = () => `id-${++sequence}`;

test('new v5 store starts empty with modular and native timer defaults', () => {
  sequence = 0;
  const repo = createStore({ storage: storage(), now: fixedNow, idFactory });
  const state = repo.getState();
  assert.equal(state.schemaVersion, 5);
  assert.equal(state.data.tasks.length, 0);
  assert.equal(state.data.taskEntries.length, 0);
  assert.deepEqual(state.settings.readingGoal, { minutes: 30, pages: 0 });
  assert.equal(state.settings.autoContinue, false);
  assert.equal(state.settings.timerNotifications, false);
  assert.equal(state.settings.timerSound, 'calm');
  assert.equal(state.settings.liveActivities, true);
});

test('v2 migration converts completed task state into task history', () => {
  sequence = 0;
  const migrated = migrateV2({
    settings: {},
    data: { tasks: [{ id: 'task', title: 'کار', date: '2026-08-05', time: '10:00', durationMinutes: 20, status: 'completed', completedAt: '2026-08-05T10:20:00.000Z' }] }
  }, { now: fixedNow, idFactory });
  assert.equal(migrated.data.tasks[0].startDate, '2026-08-05');
  assert.equal(migrated.data.tasks[0].estimatedMinutes, 20);
  assert.equal(migrated.data.taskEntries.length, 1);
  assert.equal(migrated.data.taskEntries[0].status, 'completed');
});

test('legacy migration drops samples and keeps custom records', () => {
  sequence = 0;
  const migrated = migrateLegacy({ schedule: [{ title: 'مرور برنامه روز', time: '08:30', duration: 15 }, { title: 'کار واقعی من', time: '13:00', duration: 20, status: 'done' }], habits: [{ title: 'مطالعه' }, { title: 'تمرین ساز', done: true }] }, { now: fixedNow, idFactory });
  assert.deepEqual(migrated.data.tasks.map(item => item.title), ['کار واقعی من']);
  assert.equal(migrated.data.taskEntries.length, 1);
  assert.deepEqual(migrated.data.habits.map(item => item.title), ['تمرین ساز']);
});

test('normalization validates real dates and clock values', () => {
  sequence = 0;
  const normalized = normalizeState({ data: { tasks: [
    { id: 'bad-date', title: 'بد', startDate: '2026-99-99' },
    { id: 'bad-time', title: 'خوب', startDate: '2026-08-05', time: '99:99' }
  ] } }, { now: fixedNow, idFactory });
  assert.equal(normalized.data.tasks.length, 1);
  assert.equal(normalized.data.tasks[0].time, '12:00');
});

test('normalization preserves reading history when a book is deleted', () => {
  sequence = 0;
  const normalized = normalizeState({ data: {
    books: [{ id: 'book', title: 'کتاب', totalPages: 100, currentPage: 20, deletedAt: '2026-08-05T10:00:00.000Z' }],
    readingSessions: [{ id: 'session', bookId: 'book', date: '2026-08-04', fromPage: 0, toPage: 20, pagesRead: 20, durationSeconds: 600 }]
  } }, { now: fixedNow, idFactory });
  assert.equal(normalized.data.readingSessions.length, 1);
});

test('normalization removes habit completions outside the habit lifecycle', () => {
  sequence = 0;
  const normalized = normalizeState({ data: {
    habits: [{ id: 'habit', title: 'عادت', createdAt: '2026-08-03T08:00:00.000Z', updatedAt: '2026-08-03T08:00:00.000Z', deletedAt: null, archivedAt: null }],
    habitEntries: [
      { id: 'before', habitId: 'habit', date: '2026-08-02', completed: true },
      { id: 'valid', habitId: 'habit', date: '2026-08-04', completed: true },
      { id: 'future', habitId: 'habit', date: '2026-08-06', completed: true }
    ]
  } }, { now: fixedNow, idFactory });
  assert.deepEqual(normalized.data.habitEntries.map(item => item.id), ['valid']);
});

test('normalization deduplicates daily records using newest update', () => {
  sequence = 0;
  const normalized = normalizeState({ data: { screenTimeEntries: [
    { id: 'old', date: '2026-08-05', minutes: 100, createdAt: '2026-08-05T08:00:00.000Z', updatedAt: '2026-08-05T08:00:00.000Z' },
    { id: 'new', date: '2026-08-05', minutes: 120, createdAt: '2026-08-05T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z' }
  ] } }, { now: fixedNow, idFactory });
  assert.equal(normalized.data.screenTimeEntries.length, 1);
  assert.equal(normalized.data.screenTimeEntries[0].minutes, 120);
});

test('corrupted primary storage recovers latest valid backup', () => {
  sequence = 0;
  const local = storage();
  const repo = createStore({ storage: local, now: fixedNow, idFactory });
  repo.commit(draft => draft.data.notes.push({ id: 'note', title: 'واقعی', body: 'متن', createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z', deletedAt: null }));
  assert.ok(local.getItem(BACKUP_KEY));
  local.setItem(STORAGE_KEY, '{corrupt');
  const recovered = createStore({ storage: local, now: fixedNow, idFactory });
  assert.equal(recovered.recovery, 'backup');
  assert.equal(recovered.getState().data.notes[0].title, 'واقعی');
});

test('legacy key migrates automatically', () => {
  sequence = 0;
  const local = storage();
  local.setItem(LEGACY_KEY, JSON.stringify({ schedule: [{ title: 'کار واقعی', time: '09:00', duration: 30, status: 'pending' }] }));
  const repo = createStore({ storage: local, now: fixedNow, idFactory });
  assert.equal(repo.recovery, 'legacy');
  assert.equal(repo.getState().data.tasks.length, 1);
});

test('mutator exceptions do not corrupt persisted state', () => {
  sequence = 0;
  const repo = createStore({ storage: storage(), now: fixedNow, idFactory });
  const result = repo.commit(() => { throw new Error('failure'); });
  assert.equal(result.ok, false);
  assert.equal(repo.getState().data.tasks.length, 0);
});

test('storage quota failure leaves the last committed state intact and reports the error', () => {
  sequence = 0;
  const local = storage();
  let failWrites = false;
  const quotaStorage = {
    ...local,
    setItem(key, value) {
      if (failWrites && key === STORAGE_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      local.setItem(key, value);
    }
  };
  const errors = [];
  const repo = createStore({ storage: quotaStorage, now: fixedNow, idFactory, onError: (error, context) => errors.push({ error, context }), eventTarget: null });
  const before = repo.exportData();
  failWrites = true;
  const result = repo.commit(draft => draft.data.notes.push({ id: 'note-quota', title: 'نباید ذخیره شود', body: '', createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z', deletedAt: null }));
  assert.equal(result.ok, false);
  assert.deepEqual(repo.exportData(), before);
  assert.equal(errors.at(-1).context.operation, 'storage_write');
});

test('a stale tab cannot overwrite a newer external revision', () => {
  sequence = 0;
  const local = storage();
  const first = createStore({ storage: local, now: fixedNow, idFactory, eventTarget: null });
  const second = createStore({ storage: local, now: fixedNow, idFactory, eventTarget: null });
  assert.equal(first.commit(draft => draft.data.notes.push({ id: 'newer', title: 'نسخه جدید', body: '', createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z', deletedAt: null })).ok, true);
  const result = second.commit(draft => draft.data.notes.push({ id: 'stale', title: 'نسخه قدیمی', body: '', createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z', deletedAt: null }));
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.deepEqual(second.getState().data.notes.map(item => item.id), ['newer']);
});

test('storage events synchronize a newer revision into an open store', () => {
  sequence = 0;
  const local = storage();
  const listeners = new Set();
  const eventTarget = {
    addEventListener(type, listener) { if (type === 'storage') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'storage') listeners.delete(listener); }
  };
  const first = createStore({ storage: local, now: fixedNow, idFactory, eventTarget });
  const second = createStore({ storage: local, now: fixedNow, idFactory, eventTarget: null });
  second.commit(draft => draft.data.notes.push({ id: 'external', title: 'همگام', body: '', createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z', deletedAt: null }));
  const newValue = local.getItem(STORAGE_KEY);
  for (const listener of listeners) listener({ key: STORAGE_KEY, newValue });
  assert.deepEqual(first.getState().data.notes.map(item => item.id), ['external']);
  first.destroy();
  assert.equal(listeners.size, 0);
});


test('timer runtime preserves custom-duration source through normalization', () => {
  const normalized = normalizeState({ runtime: { timer: {
    mode: 'workbreak', phase: 'break', status: 'idle', durationSeconds: 3723,
    durationSource: 'custom', remainingMilliseconds: 3723000
  } } });
  assert.equal(normalized.runtime.timer.durationSource, 'custom');
  assert.equal(normalized.runtime.timer.durationSeconds, 3723);
});



test('legacy work/break custom runtime is inferred when its duration differs from the saved preset', () => {
  const normalized = normalizeState({
    settings: { workPreset: { workMinutes: 50, breakMinutes: 10 } },
    runtime: { timer: {
      mode: 'workbreak', phase: 'work', status: 'idle', durationSeconds: 60,
      remainingMilliseconds: 60000
    } }
  });
  assert.equal(normalized.runtime.timer.durationSource, 'custom');
});


test('v4 to v5 migration preserves existing timer preferences while adding native defaults', async () => {
  const { V4_STORAGE_KEY, MIGRATION_BACKUP_KEY, SCHEMA_VERSION } = await import('../js/store.js');
  const local = storage();
  const oldState = normalizeState({
    schemaVersion: 4,
    meta: { storeId: 'v4-user', revision: 12, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z' },
    settings: {
      theme: 'dark', autoContinue: true, sound: false, vibration: false,
      workPreset: { workMinutes: 45, breakMinutes: 7 },
      modulePreferences: { onboardingStatus: 'completed' }, moduleConfigs: []
    },
    data: { tasks: [{ id: 'task-v4', title: 'حفظ شود', startDate: '2026-08-05', time: '10:00' }] }
  }, { now: fixedNow, idFactory });
  // Represent the prior schema without v5-only preferences.
  oldState.schemaVersion = 4;
  delete oldState.settings.timerNotifications;
  delete oldState.settings.timerSound;
  delete oldState.settings.liveActivities;
  oldState.settings.sound = false;
  const payload = JSON.stringify(oldState);
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) { hash ^= payload.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  const raw = JSON.stringify({ version: 2, checksum: (hash >>> 0).toString(16).padStart(8, '0'), payload });
  local.setItem(V4_STORAGE_KEY, raw);
  sequence = 0;
  const repo = createStore({ storage: local, now: fixedNow, idFactory, eventTarget: null });
  const migrated = repo.getState();
  assert.equal(repo.recovery, 'v4');
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.meta.storeId, 'v4-user');
  assert.equal(migrated.settings.autoContinue, true);
  assert.equal(migrated.settings.timerSound, 'none');
  assert.equal(migrated.settings.timerNotifications, false);
  assert.equal(migrated.settings.liveActivities, true);
  assert.equal(migrated.settings.vibration, false);
  assert.equal(migrated.data.tasks[0].title, 'حفظ شود');
  assert.equal(local.getItem(MIGRATION_BACKUP_KEY), raw);
});

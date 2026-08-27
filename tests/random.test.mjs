import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import {
  archiveBook, archiveHabit, archiveTask, archiveUniversityItem,
  deleteBook, deleteHabit, deleteTask, deleteUniversityItem,
  restoreBook, restoreHabit, restoreTask, restoreUniversityItem,
  saveBook, saveHabit, saveTask, saveUniversityItem,
  toggleHabitDate, toggleTaskOccurrence,
  unarchiveBook, unarchiveHabit, unarchiveTask, unarchiveUniversityItem
} from '../js/commands.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    values
  };
}

function random(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test('repeated random lifecycle operations remain normalized and recoverable', () => {
  const rng = random();
  let id = 0;
  let now = new Date('2026-08-05T08:00:00Z').getTime();
  const repo = createStore({ storage: memoryStorage(), now: () => now, idFactory: () => `rnd-${++id}`, eventTarget: null });
  const kinds = ['task', 'habit', 'book', 'university'];

  for (let index = 0; index < 160; index += 1) {
    now += 60_000;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const result = repo.commit(draft => {
      if (kind === 'task') saveTask(draft, { title: `کار ${index}`, startDate: '2026-08-05', dueDate: '2026-08-05', time: '12:00', estimatedMinutes: 30, priority: 'medium', recurrence: { type: 'none' } }, { now: () => now, idFactory: () => `rnd-${++id}` });
      if (kind === 'habit') saveHabit(draft, { title: `عادت ${index}` }, { now: () => now, idFactory: () => `rnd-${++id}` });
      if (kind === 'book') saveBook(draft, { title: `کتاب ${index}`, totalPages: 100, currentPage: 0 }, { now: () => now, idFactory: () => `rnd-${++id}` });
      if (kind === 'university') saveUniversityItem(draft, { title: `دانشگاه ${index}`, type: 'assignment', deadline: '2026-08-05', status: 'not_started', priority: 'medium', progress: 0, estimatedHours: 1 }, { now: () => now, idFactory: () => `rnd-${++id}` });
    });
    assert.equal(result.ok, true);
  }

  const operations = {
    task: [archiveTask, unarchiveTask, deleteTask, restoreTask],
    habit: [archiveHabit, unarchiveHabit, deleteHabit, restoreHabit],
    book: [archiveBook, unarchiveBook, deleteBook, restoreBook],
    university: [archiveUniversityItem, unarchiveUniversityItem, deleteUniversityItem, restoreUniversityItem]
  };
  const collections = { task: 'tasks', habit: 'habits', book: 'books', university: 'universityItems' };

  for (let index = 0; index < 500; index += 1) {
    now += 1_000;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const items = repo.getState().data[collections[kind]];
    const item = items[Math.floor(rng() * items.length)];
    const operation = operations[kind][Math.floor(rng() * operations[kind].length)];
    const result = repo.commit(draft => operation(draft, item.id, { now: () => now }));
    assert.equal(result.ok, true);
  }

  const activeTask = repo.getState().data.tasks.find(item => !item.deletedAt && !item.archivedAt);
  if (activeTask) assert.equal(repo.commit(draft => toggleTaskOccurrence(draft, activeTask.id, '2026-08-05', { now: () => now, idFactory: () => `rnd-${++id}` })).ok, true);
  const activeHabit = repo.getState().data.habits.find(item => !item.deletedAt && !item.archivedAt);
  if (activeHabit) assert.equal(repo.commit(draft => toggleHabitDate(draft, activeHabit.id, '2026-08-05', { now: () => now, idFactory: () => `rnd-${++id}` })).ok, true);

  const exported = repo.exportData();
  assert.equal(exported.schemaVersion, 5);
  assert.equal(new Set(exported.state.data.tasks.map(item => item.id)).size, exported.state.data.tasks.length);
  assert.equal(new Set(exported.state.data.habits.map(item => item.id)).size, exported.state.data.habits.length);
  assert.equal(new Set(exported.state.data.books.map(item => item.id)).size, exported.state.data.books.length);
  assert.equal(new Set(exported.state.data.universityItems.map(item => item.id)).size, exported.state.data.universityItems.length);
});

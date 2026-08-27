import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState } from '../js/store.js';
import {
  archiveBook,
  archiveTask,
  deleteTask,
  recordReadingSession,
  restoreTask,
  saveBook,
  saveHabit,
  saveTask,
  setCurrentBook,
  toggleHabitDate,
  toggleTaskOccurrence
} from '../js/commands.js';

const fixedNow = () => new Date('2026-08-05T10:00:00Z').getTime();
let id = 0;
const idFactory = () => `id-${++id}`;

test('task commands create, complete, archive, delete and restore without duplicate task state', () => {
  id = 0;
  const state = createEmptyState({ now: fixedNow, idFactory });
  const taskId = saveTask(state, { title: 'کار', startDate: '2026-08-05', dueDate: '2026-08-06', time: '10:00', estimatedMinutes: 25, priority: 'high', category: 'کار', recurrence: { type: 'daily' } }, { now: fixedNow, idFactory });
  assert.equal(state.data.tasks[0].status, undefined);
  assert.equal(toggleTaskOccurrence(state, taskId, '2026-08-05', { now: fixedNow, idFactory }), true);
  assert.equal(state.data.taskEntries.length, 1);
  assert.equal(toggleTaskOccurrence(state, taskId, '2026-08-05', { now: fixedNow, idFactory }), false);
  archiveTask(state, taskId, { now: fixedNow });
  assert.ok(state.data.tasks[0].archivedAt);
  deleteTask(state, taskId, { now: fixedNow });
  assert.ok(state.data.tasks[0].deletedAt);
  restoreTask(state, taskId, { now: fixedNow });
  assert.equal(state.data.tasks[0].deletedAt, null);
});

test('reading command records history and advances book progress', () => {
  id = 0;
  const state = createEmptyState({ now: fixedNow, idFactory });
  const bookId = saveBook(state, { title: 'کتاب', totalPages: 100, currentPage: 5, makeCurrent: true }, { now: fixedNow, idFactory });
  recordReadingSession(state, { bookId, date: '2026-08-05', fromPage: 5, toPage: 15, minutes: 20 }, { now: fixedNow, idFactory });
  const normalized = normalizeState(state, { now: fixedNow, idFactory });
  assert.equal(normalized.data.readingSessions.length, 1);
  assert.equal(normalized.data.readingSessions[0].pagesRead, 10);
  assert.equal(normalized.data.books[0].currentPage, 15);
  assert.equal(normalized.settings.currentBookId, bookId);
});

test('commands reject records that cannot represent real activity', () => {
  id = 0;
  const state = createEmptyState({ now: fixedNow, idFactory });
  assert.throws(() => saveTask(state, { title: '', startDate: '2026-08-05', dueDate: '2026-08-05' }, { now: fixedNow, idFactory }));
  const bookId = saveBook(state, { title: 'کتاب', totalPages: 100, currentPage: 10 }, { now: fixedNow, idFactory });
  assert.throws(() => recordReadingSession(state, { bookId, date: '2026-08-05', fromPage: 10, toPage: 10, minutes: 0 }, { now: fixedNow, idFactory }));
  assert.equal(state.data.readingSessions.length, 0);
});

test('habit history only accepts dates during the habit lifecycle', () => {
  id = 0;
  const state = createEmptyState({ now: fixedNow, idFactory });
  const habitId = saveHabit(state, { title: 'عادت' }, { now: fixedNow, idFactory });
  assert.equal(toggleHabitDate(state, habitId, '2026-08-05', { now: fixedNow, idFactory }), true);
  assert.throws(() => toggleHabitDate(state, habitId, '2026-08-04', { now: fixedNow, idFactory }));
  assert.throws(() => toggleHabitDate(state, habitId, '2026-08-06', { now: fixedNow, idFactory }));
});

test('archived books cannot become current or receive new sessions', () => {
  id = 0;
  const state = createEmptyState({ now: fixedNow, idFactory });
  const bookId = saveBook(state, { title: 'کتاب', totalPages: 100, currentPage: 10, makeCurrent: true }, { now: fixedNow, idFactory });
  archiveBook(state, bookId, { now: fixedNow });
  assert.equal(setCurrentBook(state, bookId), false);
  assert.throws(() => recordReadingSession(state, { bookId, date: '2026-08-05', fromPage: 10, toPage: 20, minutes: 10 }, { now: fixedNow, idFactory }));
});


test('commands normalize Persian digits in dates, times and numeric values', () => {
  id = 0;
  const state = createEmptyState({ now: fixedNow, idFactory });
  const taskId = saveTask(state, {
    title: 'کار فارسی',
    startDate: '۲۰۲۶-۰۸-۰۵',
    dueDate: '۲۰۲۶-۰۸-۰۶',
    time: '۰۹:۳۰',
    estimatedMinutes: '۴۵',
    priority: 'medium'
  }, { now: fixedNow, idFactory });
  const task = state.data.tasks.find(item => item.id === taskId);
  assert.equal(task.startDate, '2026-08-05');
  assert.equal(task.time, '09:30');
  assert.equal(task.estimatedMinutes, 45);

  const bookId = saveBook(state, { title: 'کتاب فارسی', totalPages: '۱۰۰', currentPage: '۵' }, { now: fixedNow, idFactory });
  recordReadingSession(state, {
    bookId,
    date: '۲۰۲۶-۰۸-۰۵',
    fromPage: '۵',
    toPage: '۱۵',
    minutes: '۲۰'
  }, { now: fixedNow, idFactory });
  const session = state.data.readingSessions.at(-1);
  assert.equal(session.date, '2026-08-05');
  assert.equal(session.pagesRead, 10);
  assert.equal(session.durationSeconds, 1200);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarActivityForDate,
  currentHabitStreak,
  gregorianForPersian,
  habitAdherence,
  longestHabitStreak,
  normalizeDigits,
  persianParts,
  readingGoalForDate,
  statisticsForRange,
  taskDueDateForOccurrence,
  taskRecursOnDate,
  tasksOnDate,
  toLocalDateKey
} from '../js/domain.js';
import { createEmptyState } from '../js/store.js';

const fixedNow = () => new Date('2026-08-05T10:00:00Z').getTime();
function base(id, createdAt = '2026-08-01T09:00:00.000Z') {
  return { id, createdAt, updatedAt: createdAt, deletedAt: null };
}
function task(id, startDate, recurrence = { type: 'none', interval: 1, unit: 'day', weekdays: [], endDate: null }) {
  return { ...base(id), title: id, startDate, dueOffsetDays: 0, time: '10:00', estimatedMinutes: 30, priority: 'medium', category: '', notes: '', recurrence, archivedAt: null };
}

test('Persian conversion round-trips through Intl', () => {
  const source = new Date(2026, 7, 5, 12);
  const persian = persianParts(source);
  const converted = gregorianForPersian(persian.year, persian.month, persian.day);
  assert.equal(toLocalDateKey(converted), toLocalDateKey(source));
});

test('task recurrence supports daily, weekly, monthly and custom rules', () => {
  assert.equal(taskRecursOnDate(task('daily', '2026-08-01', { type: 'daily', interval: 1, unit: 'day', weekdays: [], endDate: null }), '2026-08-05'), true);
  const weekly = task('weekly', '2026-08-01', { type: 'weekly', interval: 1, unit: 'week', weekdays: [0], endDate: null });
  assert.equal(taskRecursOnDate(weekly, '2026-08-08'), true);
  assert.equal(taskRecursOnDate(weekly, '2026-08-09'), false);
  const monthly = task('monthly', '2026-01-31', { type: 'monthly', interval: 1, unit: 'month', weekdays: [], endDate: null });
  assert.equal(taskRecursOnDate(monthly, '2026-02-28'), true);
  const custom = task('custom', '2026-08-01', { type: 'custom', interval: 2, unit: 'day', weekdays: [], endDate: '2026-08-09' });
  assert.equal(taskRecursOnDate(custom, '2026-08-05'), true);
  assert.equal(taskRecursOnDate(custom, '2026-08-06'), false);
  assert.equal(taskRecursOnDate(custom, '2026-08-11'), false);
});

test('task occurrences use independent completion entries and due offsets', () => {
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  const recurring = { ...task('task', '2026-08-01', { type: 'daily', interval: 1, unit: 'day', weekdays: [], endDate: null }), dueOffsetDays: 2 };
  state.data.tasks.push(recurring);
  state.data.taskEntries.push({ ...base('entry'), taskId: 'task', occurrenceDate: '2026-08-05', status: 'completed', completedAt: '2026-08-05T10:30:00.000Z' });
  const occurrence = tasksOnDate(state, '2026-08-05')[0];
  assert.equal(occurrence.status, 'completed');
  assert.equal(taskDueDateForOccurrence(recurring, '2026-08-05'), '2026-08-07');
  assert.equal(tasksOnDate(state, '2026-08-06')[0].status, 'pending');
});

test('soft deletion preserves task history before the deletion date', () => {
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  const recurring = task('task', '2026-08-01', { type: 'daily', interval: 1, unit: 'day', weekdays: [], endDate: null });
  recurring.deletedAt = '2026-08-05T10:00:00.000Z';
  state.data.tasks.push(recurring);
  state.data.taskEntries.push({ ...base('entry'), taskId: 'task', occurrenceDate: '2026-08-04', status: 'completed', completedAt: '2026-08-04T10:30:00.000Z' });
  assert.equal(tasksOnDate(state, '2026-08-04')[0].status, 'completed');
  assert.equal(tasksOnDate(state, '2026-08-05').length, 0);
});

test('habit streaks, longest streak and adherence use stored history', () => {
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  state.data.habits.push({ ...base('habit', '2026-08-01T09:00:00.000Z'), title: 'مطالعه', archivedAt: null, reminder: { enabled: false, time: null } });
  for (const date of ['2026-08-01', '2026-08-02', '2026-08-04', '2026-08-05']) {
    state.data.habitEntries.push({ ...base(`entry-${date}`), habitId: 'habit', date, completed: true, completedAt: `${date}T10:00:00.000Z` });
  }
  assert.equal(currentHabitStreak(state, 'habit', '2026-08-05'), 2);
  assert.equal(longestHabitStreak(state, 'habit'), 2);
  assert.deepEqual(habitAdherence(state, 'habit', '2026-08-01', '2026-08-05'), { completed: 4, missed: 1, expected: 5, percent: 80 });
});

test('reading goal is derived from persisted sessions', () => {
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  state.settings.readingGoal = { minutes: 20, pages: 10 };
  state.data.readingSessions.push({ ...base('reading'), bookId: 'book', date: '2026-08-05', fromPage: 0, toPage: 12, pagesRead: 12, durationSeconds: 1500, startedAt: null, endedAt: '2026-08-05T12:00:00.000Z', notes: '' });
  const goal = readingGoalForDate(state, '2026-08-05');
  assert.equal(goal.achieved, true);
  assert.equal(goal.percent, 100);
});

test('statistics and calendar are derived only from stored records', () => {
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  state.data.tasks.push(task('task', '2026-08-05'));
  state.data.taskEntries.push({ ...base('task-entry'), taskId: 'task', occurrenceDate: '2026-08-05', status: 'completed', completedAt: '2026-08-05T10:30:00.000Z' });
  state.data.habits.push({ ...base('habit', '2026-08-05T07:00:00.000Z'), title: 'آب', archivedAt: null, reminder: { enabled: false, time: null } });
  state.data.habitEntries.push({ ...base('habit-entry'), habitId: 'habit', date: '2026-08-05', completed: true, completedAt: '2026-08-05T08:00:00.000Z' });
  state.data.focusSessions.push({ ...base('focus'), kind: 'focus', date: '2026-08-05', durationSeconds: 1500, startedAt: '2026-08-05T09:00:00.000Z', endedAt: '2026-08-05T09:25:00.000Z', notes: '' });
  state.data.books.push({ ...base('book'), title: 'کتاب', author: '', totalPages: 100, currentPage: 20, archivedAt: null, finishedAt: null });
  state.data.readingSessions.push({ ...base('reading'), bookId: 'book', date: '2026-08-05', fromPage: 10, toPage: 20, pagesRead: 10, durationSeconds: 1200, startedAt: null, endedAt: '2026-08-05T12:00:00.000Z', notes: '' });

  const stats = statisticsForRange(state, 'week', new Date(2026, 7, 5, 12));
  assert.equal(stats.today.percent, 100);
  assert.equal(stats.focus.minutes, 25);
  assert.equal(stats.reading.minutes, 20);
  assert.equal(stats.reading.progress, 20);

  const activity = calendarActivityForDate(state, '2026-08-05');
  assert.equal(activity.tasks.length, 1);
  assert.equal(activity.habits.length, 1);
  assert.equal(activity.focus.length, 1);
  assert.equal(activity.reading.length, 1);
  assert.equal(calendarActivityForDate(state, '2026-08-04').tasks.length, 0);
});


test('numeric normalization accepts Persian, Arabic and English digits', () => {
  assert.equal(normalizeDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
  assert.equal(normalizeDigits('١٢٣٤٥٦٧٨٩٠'), '1234567890');
  assert.equal(normalizeDigits('2026-۰۸-۰۵'), '2026-08-05');
});

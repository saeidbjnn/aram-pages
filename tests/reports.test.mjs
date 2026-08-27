import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../js/store.js';
import { persianMonthRange } from '../js/domain.js';
import { dailyReview, globalSearch, monthlyReview, weeklyReview } from '../js/reports.js';

const fixedNow = () => new Date('2026-08-05T10:00:00Z').getTime();
function base(id, createdAt = '2026-08-01T09:00:00.000Z') { return { id, createdAt, updatedAt: createdAt, deletedAt: null }; }
function populated() {
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  state.data.tasks.push({ ...base('task'), title: 'گزارش پروژه', startDate: '2026-08-05', dueOffsetDays: 0, time: '09:00', estimatedMinutes: 30, priority: 'high', category: 'کار', notes: '', recurrence: { type: 'none', interval: 1, unit: 'day', weekdays: [], endDate: null }, archivedAt: null });
  state.data.taskEntries.push({ ...base('entry'), taskId: 'task', occurrenceDate: '2026-08-05', status: 'completed', completedAt: '2026-08-05T09:30:00.000Z' });
  state.data.habits.push({ ...base('habit'), title: 'ورزش', archivedAt: null, reminder: { enabled: false, time: null } });
  state.data.habitEntries.push({ ...base('habit-entry'), habitId: 'habit', date: '2026-08-05', completed: true, completedAt: '2026-08-05T08:00:00.000Z' });
  state.data.focusSessions.push({ ...base('focus'), kind: 'focus', date: '2026-08-05', durationSeconds: 1800, startedAt: '2026-08-05T10:00:00.000Z', endedAt: '2026-08-05T10:30:00.000Z', notes: '' });
  state.data.books.push({ ...base('book'), title: 'کتاب آزمون', author: 'نویسنده', totalPages: 100, currentPage: 10, archivedAt: null, finishedAt: null });
  state.data.readingSessions.push({ ...base('reading'), bookId: 'book', date: '2026-08-05', fromPage: 0, toPage: 10, pagesRead: 10, durationSeconds: 1200, startedAt: null, endedAt: '2026-08-05T12:00:00.000Z', notes: '' });
  state.data.universityItems.push({ ...base('uni'), title: 'پروژه دانشگاه', type: 'project', deadline: '2026-08-05', progress: 40, status: 'in_progress', notes: 'تحقیق', priority: 'high', estimatedHours: 8, completedAt: null, archivedAt: null });
  return state;
}

test('daily review combines only actual stored activity', () => {
  const report = dailyReview(populated(), '2026-08-05');
  assert.equal(report.completedTasks.length, 1);
  assert.equal(report.completedHabits.length, 1);
  assert.equal(report.focusMinutes, 30);
  assert.equal(report.readingMinutes, 20);
  assert.equal(report.productivity.percent, 100);
  assert.equal(report.universityDue.length, 1);
});

test('weekly review calculates rings and productive days', () => {
  const report = weeklyReview(populated(), new Date(2026, 7, 5, 12));
  assert.equal(report.taskCompleted, 1);
  assert.equal(report.habitRate > 0, true);
  assert.equal(report.focusMinutes, 30);
  assert.equal(report.readingMinutes, 20);
  assert.equal(report.mostProductiveDay.date, '2026-08-05');
  assert.equal(report.insights.length > 0, true);
});

test('monthly review exposes comparisons, streaks and weak areas from data', () => {
  const report = monthlyReview(populated(), new Date(2026, 7, 5, 12));
  assert.equal(typeof report.comparisons.completion.delta, 'number');
  assert.equal(report.streaks[0].title, 'ورزش');
  assert.equal(Array.isArray(report.weakAreas), true);
});

test('monthly comparison uses the same elapsed portion of the previous month', () => {
  const reference = new Date(2026, 7, 5, 12);
  const previousMonth = persianMonthRange(-1, reference);
  const state = createEmptyState({ now: fixedNow, idFactory: () => 'store', existingUser: true });
  state.data.focusSessions.push({ ...base('late-focus'), kind: 'focus', date: previousMonth.endKey, durationSeconds: 3600, startedAt: `${previousMonth.endKey}T09:00:00.000Z`, endedAt: `${previousMonth.endKey}T10:00:00.000Z`, notes: '' });
  const report = monthlyReview(state, reference);
  assert.equal(report.previousEndKey < previousMonth.endKey, true);
  assert.equal(report.previous.focus.minutes, 0);
});

test('global search finds all supported entities and calendar dates', () => {
  const state = populated();
  state.data.notes.push({ ...base('note'), title: 'یادداشت جلسه', body: 'متن پروژه' });
  assert.equal(globalSearch(state, 'گزارش').some(result => result.type === 'task'), true);
  assert.equal(globalSearch(state, 'ورزش').some(result => result.type === 'habit'), true);
  assert.equal(globalSearch(state, 'کتاب آزمون').some(result => result.type === 'book'), true);
  assert.equal(globalSearch(state, 'یادداشت جلسه').some(result => result.type === 'note'), true);
  assert.equal(globalSearch(state, 'پروژه دانشگاه').some(result => result.type === 'university'), true);
  assert.equal(globalSearch(state, '2026-08-05').some(result => result.type === 'calendar'), true);
});

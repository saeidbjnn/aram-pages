import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState } from '../js/store.js';
import { saveBook, saveHabit, saveTask, toggleHabitDate, toggleTaskOccurrence, recordReadingSession, recordFocusSession } from '../js/commands.js';
import { addDays, statisticsForRange, toLocalDateKey } from '../js/domain.js';
import { globalSearch, monthlyReview, weeklyReview } from '../js/reports.js';
import { saveCustomModule, saveCustomModuleRecord } from '../js/module-commands.js';
import { CUSTOM_MODULE_TYPES } from '../js/modules.js';

const reference = new Date('2026-08-05T12:00:00.000Z');
const now = () => reference.getTime();
let id = 0;
const idFactory = () => `stress-${++id}`;

test('hundreds of records normalize, search and report without corruption', () => {
  id = 0;
  const state = createEmptyState({ now, idFactory });
  const today = toLocalDateKey(reference);
  for (let index = 0; index < 350; index += 1) {
    const startDate = addDays(today, -(index % 30));
    const taskId = saveTask(state, { title: `کار ${index}`, startDate, dueDate: startDate, time: '09:00', estimatedMinutes: 30, recurrence: { type: 'none' } }, { now, idFactory });
    if (index % 2 === 0) toggleTaskOccurrence(state, taskId, startDate, { now, idFactory });
  }
  for (let index = 0; index < 120; index += 1) {
    const habitId = saveHabit(state, { title: `عادت ${index}` }, { now, idFactory });
    if (index % 3 === 0) toggleHabitDate(state, habitId, today, { now, idFactory });
  }
  for (let index = 0; index < 80; index += 1) {
    const bookId = saveBook(state, { title: `کتاب ${index}`, totalPages: 500, currentPage: 0 }, { now, idFactory });
    recordReadingSession(state, { bookId, date: today, fromPage: 0, toPage: 5, minutes: 10 }, { now, idFactory });
  }
  for (let index = 0; index < 300; index += 1) recordFocusSession(state, { date: addDays(today, -(index % 30)), minutes: 25, kind: 'focus' }, { now, idFactory });

  const started = performance.now();
  const normalized = normalizeState(state, { now, idFactory });
  const stats = statisticsForRange(normalized, 'month', reference);
  const week = weeklyReview(normalized, reference);
  const month = monthlyReview(normalized, reference);
  const results = globalSearch(normalized, 'کار 3');
  const elapsed = performance.now() - started;

  assert.equal(normalized.data.tasks.length, 350);
  assert.equal(normalized.data.habits.length, 120);
  assert.equal(normalized.data.books.length, 80);
  assert.equal(normalized.data.focusSessions.length, 300);
  assert.ok(stats.focus.minutes > 0);
  assert.ok(week.focusMinutes > 0);
  assert.ok(month.current.focus.minutes > 0);
  assert.ok(results.length > 0);
  assert.ok(elapsed < 3000, `stress calculations took ${elapsed}ms`);
});


test('many active custom modules and long histories remain responsive and serializable', () => {
  id = 0;
  const state = createEmptyState({ now, idFactory });
  const today = toLocalDateKey(reference);
  const types = Object.values(CUSTOM_MODULE_TYPES);
  const moduleIds = [];
  for (let index = 0; index < 25; index += 1) {
    const type = types[index % types.length];
    const moduleId = saveCustomModule(state, {
      name: `بخش شخصی ${index}`,
      icon: '○',
      type,
      goalValue: type === CUSTOM_MODULE_TYPES.TIME_TRACKER ? 600 : 100,
      unit: type === CUSTOM_MODULE_TYPES.SIMPLE_TRACKER ? 'واحد' : 'دقیقه'
    }, { now, idFactory });
    moduleIds.push([moduleId, type]);
    for (let recordIndex = 0; recordIndex < 20; recordIndex += 1) {
      const date = addDays(today, -(recordIndex % 30));
      const common = { moduleId, date, notes: `یادداشت ${recordIndex}` };
      if (type === CUSTOM_MODULE_TYPES.SIMPLE_TRACKER) saveCustomModuleRecord(state, { ...common, value: recordIndex + 1 }, { now, idFactory });
      if (type === CUSTOM_MODULE_TYPES.PROJECT) saveCustomModuleRecord(state, { ...common, title: `پروژه ${recordIndex}`, deadline: addDays(date, 10), progress: recordIndex % 101 }, { now, idFactory });
      if (type === CUSTOM_MODULE_TYPES.ROUTINE) saveCustomModuleRecord(state, { ...common, completed: recordIndex % 3 !== 0 }, { now, idFactory });
      if (type === CUSTOM_MODULE_TYPES.LIST) saveCustomModuleRecord(state, { ...common, title: `مورد ${recordIndex}`, completed: recordIndex % 2 === 0 }, { now, idFactory });
      if (type === CUSTOM_MODULE_TYPES.TIME_TRACKER) saveCustomModuleRecord(state, { ...common, minutes: 30, seconds: recordIndex % 60 }, { now, idFactory });
    }
  }
  const started = performance.now();
  const normalized = normalizeState(state, { now, idFactory });
  const searchResults = globalSearch(normalized, 'یادداشت');
  const exported = JSON.stringify(normalized);
  const elapsed = performance.now() - started;
  assert.equal(normalized.data.customModules.length, 25);
  assert.equal(normalized.data.customModuleRecords.length, 500);
  assert.ok(searchResults.length > 0);
  assert.ok(exported.length > 1000);
  assert.ok(elapsed < 3000, `module stress calculations took ${elapsed}ms`);
});

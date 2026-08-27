import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../js/store.js';
import { calendarActivityForDate, customModuleStatistics } from '../js/domain.js';
import { globalSearch } from '../js/reports.js';
import { CUSTOM_MODULE_TYPES, MODULE_STATUS, moduleStatusFor } from '../js/modules.js';
import { activateModule, hideModule, permanentlyDeleteModule, saveCustomModule, saveCustomModuleRecord } from '../js/module-commands.js';

const now = () => new Date('2026-08-07T10:00:00Z').getTime();
let sequence = 0;
const idFactory = () => `integration-${++sequence}`;
const base = id => ({ id, createdAt: '2026-08-07T08:00:00.000Z', updatedAt: '2026-08-07T08:00:00.000Z', deletedAt: null });

test('inactive optional data is preserved but excluded from calendar and search', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  state.data.books.push({ ...base('book'), title: 'کتاب پنهان', author: '', totalPages: 100, currentPage: 10, archivedAt: null, finishedAt: null });
  state.data.readingSessions.push({ ...base('session'), bookId: 'book', date: '2026-08-07', fromPage: 0, toPage: 10, pagesRead: 10, durationSeconds: 600, startedAt: null, endedAt: '2026-08-07T08:10:00.000Z', notes: '' });
  assert.equal(moduleStatusFor(state, 'reading'), MODULE_STATUS.AVAILABLE);
  assert.equal(calendarActivityForDate(state, '2026-08-07').reading.length, 0);
  assert.equal(globalSearch(state, 'کتاب').length, 0);
  activateModule(state, 'reading', { now });
  assert.equal(calendarActivityForDate(state, '2026-08-07').reading.length, 1);
  assert.equal(globalSearch(state, 'کتاب')[0].sourceModule, 'مطالعه');
});

test('hidden module search is opt-in while calendar remains uncluttered', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  activateModule(state, 'university', { now });
  state.data.universityItems.push({ ...base('uni'), moduleId: 'university', title: 'پژوهش پنهان', type: 'research', deadline: '2026-08-07', progress: 20, status: 'in_progress', notes: '', priority: 'medium', estimatedHours: 5, completedAt: null, archivedAt: null });
  hideModule(state, 'university', { now });
  assert.equal(calendarActivityForDate(state, '2026-08-07').university.length, 0);
  assert.equal(globalSearch(state, 'پژوهش').length, 0);
  const hidden = globalSearch(state, 'پژوهش', { includeHiddenModules: true });
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].sourceModule, 'دانشگاه');
});

test('custom project integrates with calendar, search and real statistics from one record', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  const moduleId = saveCustomModule(state, { name: 'پروژه مهاجرت', type: CUSTOM_MODULE_TYPES.PROJECT, icon: '◇' }, { now, idFactory });
  saveCustomModuleRecord(state, { moduleId, title: 'ارسال مدارک', date: '2026-08-07', deadline: '2026-08-20', progress: 50, notes: 'نسخه ترجمه' }, { now, idFactory });
  assert.equal(calendarActivityForDate(state, '2026-08-07').custom.length, 1);
  assert.equal(calendarActivityForDate(state, '2026-08-20').custom.length, 1);
  const result = globalSearch(state, 'مدارک')[0];
  assert.equal(result.sourceModule, 'پروژه مهاجرت');
  const stats = customModuleStatistics(state, moduleId, '2026-08-01', '2026-08-31');
  assert.equal(stats.total, 1);
  assert.equal(stats.averageProgress, 50);
});

test('project facade and university module can be activated independently', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  activateModule(state, 'projects', { now });
  state.data.universityItems.push({ ...base('project'), moduleId: 'projects', title: 'وب‌سایت شخصی', type: 'project', deadline: '2026-08-07', progress: 10, status: 'in_progress', notes: '', priority: 'medium', estimatedHours: 10, completedAt: null, archivedAt: null });
  const activity = calendarActivityForDate(state, '2026-08-07');
  assert.equal(activity.university.length, 1);
  assert.equal(globalSearch(state, 'وب‌سایت')[0].sourceModule, 'پروژه‌ها');
});


test('custom list records stay searchable but do not create calendar activity without calendar capability', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  const moduleId = saveCustomModule(state, { name: 'فهرست خرید', type: CUSTOM_MODULE_TYPES.LIST, icon: '≡' }, { now, idFactory });
  saveCustomModuleRecord(state, { moduleId, title: 'خرید برنج', completed: false }, { now, idFactory });
  assert.equal(calendarActivityForDate(state, '2026-08-07').custom.length, 0);
  assert.equal(globalSearch(state, 'برنج')[0].sourceModule, 'فهرست خرید');
});

test('permanently deleting University preserves independent Projects facade records', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory, existingUser: true });
  state.data.universityItems.push(
    { ...base('university-item'), moduleId: 'university', title: 'تمرین دانشگاه', type: 'assignment', deadline: '2026-08-07', progress: 20, status: 'in_progress', notes: '', priority: 'medium', estimatedHours: 2, completedAt: null, archivedAt: null },
    { ...base('project-item'), moduleId: 'projects', title: 'پروژه شخصی', type: 'project', deadline: '2026-08-10', progress: 40, status: 'in_progress', notes: '', priority: 'high', estimatedHours: 5, completedAt: null, archivedAt: null }
  );
  const removed = permanentlyDeleteModule(state, 'university', { now });
  assert.equal(removed.universityItems, 1);
  assert.deepEqual(state.data.universityItems.map(item => item.id), ['project-item']);
  assert.equal(state.data.universityItems[0].moduleId, 'projects');
});

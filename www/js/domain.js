import { MODULE_CAPABILITIES, MODULE_STATUS, getModuleDefinition, moduleStatusFor, moduleSupports } from './modules.js';

export const DAY_MS = 86_400_000;
export const TASK_PRIORITIES = ['low', 'medium', 'high'];
export const UNIVERSITY_TYPES = ['assignment', 'project', 'research', 'thesis'];
export const UNIVERSITY_STATUSES = ['not_started', 'in_progress', 'on_hold', 'completed'];
export const RECURRENCE_TYPES = ['none', 'daily', 'weekly', 'monthly', 'custom'];
export const RECURRENCE_UNITS = ['day', 'week', 'month'];


export function moduleVisibleOnSurfaces(state, moduleId, { includeArchived = false, includeHidden = false } = {}) {
  if (!moduleId) return true;
  const status = moduleStatusFor(state, moduleId);
  return status === MODULE_STATUS.ACTIVE
    || (includeArchived && status === MODULE_STATUS.ARCHIVED)
    || (includeHidden && status === MODULE_STATUS.HIDDEN);
}

export function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function clamp(value, min, max) {
  const numeric = Number(normalizeDigits(value));
  return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : min));
}

export function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeDigits(key));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function isValidDateKey(key) {
  return Boolean(dateFromKey(key));
}

export function addDays(key, amount) {
  const date = dateFromKey(key);
  if (!date) return '';
  date.setDate(date.getDate() + Number(amount || 0));
  return toLocalDateKey(date);
}

export function differenceInDays(startKey, endKey) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  if (!start || !end) return NaN;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function compareDateKeys(left, right) {
  return String(left).localeCompare(String(right));
}

export function enumerateDateKeys(startKey, endKey) {
  if (!dateFromKey(startKey) || !dateFromKey(endKey) || compareDateKeys(startKey, endKey) > 0) return [];
  const keys = [];
  for (let key = startKey; compareDateKeys(key, endKey) <= 0; key = addDays(key, 1)) keys.push(key);
  return keys;
}

export function daysInclusive(startKey, endKey) {
  const difference = differenceInDays(startKey, endKey);
  return Number.isFinite(difference) && difference >= 0 ? difference + 1 : 0;
}

export function weekdayIndex(dateKey) {
  const date = dateFromKey(dateKey);
  return date ? (date.getDay() + 1) % 7 : -1; // Saturday = 0, Friday = 6
}

export function startOfWeekKey(reference = new Date()) {
  const date = reference instanceof Date ? new Date(reference) : new Date(reference);
  if (Number.isNaN(date.getTime())) return '';
  date.setHours(12, 0, 0, 0);
  const saturdayIndex = (date.getDay() + 1) % 7;
  date.setDate(date.getDate() - saturdayIndex);
  return toLocalDateKey(date);
}

export function endOfWeekKey(reference = new Date()) {
  return addDays(startOfWeekKey(reference), 6);
}

export function monthDifference(startKey, endKey) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  if (!start || !end) return NaN;
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
}

export function persianParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter(part => ['year', 'month', 'day'].includes(part.type))
    .map(part => [part.type, Number(part.value)]));
}

function comparePersian(left, right) {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

export function gregorianForPersian(year, month, day = 1) {
  const target = { year: Number(year), month: Number(month), day: Number(day) };
  if (!Number.isInteger(target.year) || !Number.isInteger(target.month) || !Number.isInteger(target.day)) return null;
  let low = new Date(target.year + 620, 0, 1, 12).getTime();
  let high = new Date(target.year + 622, 11, 31, 12).getTime();
  while (low <= high) {
    const midpointDays = Math.floor(((low + high) / 2) / DAY_MS);
    const midpoint = midpointDays * DAY_MS + 12 * 60 * 60 * 1000;
    const date = new Date(midpoint);
    const comparison = comparePersian(persianParts(date), target);
    if (comparison === 0) return date;
    if (comparison < 0) low = midpoint + DAY_MS;
    else high = midpoint - DAY_MS;
  }
  return null;
}

export function shiftedPersianMonth(offset = 0, reference = new Date()) {
  const current = persianParts(reference);
  const monthIndex = current.year * 12 + current.month - 1 + Number(offset || 0);
  return { year: Math.floor(monthIndex / 12), month: ((monthIndex % 12) + 12) % 12 + 1 };
}

export function persianMonthRange(offset = 0, reference = new Date()) {
  const current = shiftedPersianMonth(offset, reference);
  const next = current.month === 12 ? { year: current.year + 1, month: 1 } : { year: current.year, month: current.month + 1 };
  const first = gregorianForPersian(current.year, current.month, 1);
  const nextFirst = gregorianForPersian(next.year, next.month, 1);
  if (!first || !nextFirst) return null;
  return {
    ...current,
    first,
    nextFirst,
    startKey: toLocalDateKey(first),
    endKey: addDays(toLocalDateKey(nextFirst), -1),
    length: Math.round((nextFirst.getTime() - first.getTime()) / DAY_MS)
  };
}

export function isActive(entity) {
  return Boolean(entity && !entity.deletedAt);
}

export function activeEntities(items = []) {
  return items.filter(isActive);
}

export function archivedEntities(items = []) {
  return items.filter(item => item && !item.deletedAt && item.archivedAt);
}

export function deletedEntities(items = []) {
  return items.filter(item => item?.deletedAt);
}

function lifecycleIncludesDate(entity, dateKey) {
  const boundaries = [entity?.archivedAt, entity?.deletedAt]
    .map(value => value ? toLocalDateKey(value) : '')
    .filter(Boolean)
    .sort(compareDateKeys);
  return !boundaries.length || compareDateKeys(dateKey, boundaries[0]) < 0;
}

function recurrenceConfig(task) {
  const recurrence = task?.recurrence || {};
  const type = RECURRENCE_TYPES.includes(recurrence.type) ? recurrence.type : 'none';
  const unit = RECURRENCE_UNITS.includes(recurrence.unit) ? recurrence.unit : (
    type === 'weekly' ? 'week' : type === 'monthly' ? 'month' : 'day'
  );
  return {
    type,
    unit,
    interval: Math.max(1, Math.round(Number(recurrence.interval || 1))),
    weekdays: [...new Set((Array.isArray(recurrence.weekdays) ? recurrence.weekdays : [])
      .map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 6))].sort(),
    endDate: isValidDateKey(recurrence.endDate) ? recurrence.endDate : null
  };
}

function daysInGregorianMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
}

export function taskRecursOnDate(task, dateKey) {
  if (!task || !isValidDateKey(task.startDate) || !isValidDateKey(dateKey)) return false;
  if (compareDateKeys(dateKey, task.startDate) < 0 || !lifecycleIncludesDate(task, dateKey)) return false;
  const recurrence = recurrenceConfig(task);
  if (recurrence.endDate && compareDateKeys(dateKey, recurrence.endDate) > 0) return false;
  if (recurrence.type === 'none') return dateKey === task.startDate;

  const unit = recurrence.type === 'custom' ? recurrence.unit : (
    recurrence.type === 'weekly' ? 'week' : recurrence.type === 'monthly' ? 'month' : 'day'
  );
  const interval = recurrence.type === 'custom' ? recurrence.interval : 1;

  if (unit === 'day') {
    const difference = differenceInDays(task.startDate, dateKey);
    return difference >= 0 && difference % interval === 0;
  }

  if (unit === 'week') {
    const startWeek = startOfWeekKey(dateFromKey(task.startDate));
    const currentWeek = startOfWeekKey(dateFromKey(dateKey));
    const weekDifference = differenceInDays(startWeek, currentWeek) / 7;
    const weekdays = recurrence.weekdays.length ? recurrence.weekdays : [weekdayIndex(task.startDate)];
    return weekDifference >= 0 && weekDifference % interval === 0 && weekdays.includes(weekdayIndex(dateKey));
  }

  const months = monthDifference(task.startDate, dateKey);
  if (months < 0 || months % interval !== 0) return false;
  const start = dateFromKey(task.startDate);
  const current = dateFromKey(dateKey);
  const expectedDay = Math.min(start.getDate(), daysInGregorianMonth(current));
  return current.getDate() === expectedDay;
}

export function taskDueDateForOccurrence(task, occurrenceDate) {
  return addDays(occurrenceDate, Math.max(0, Math.round(Number(task?.dueOffsetDays || 0))));
}

export function taskEntryForDate(state, taskId, occurrenceDate) {
  return activeEntities(state.data.taskEntries || []).find(entry => entry.taskId === taskId && entry.occurrenceDate === occurrenceDate) || null;
}

export function taskOccurrence(state, task, occurrenceDate) {
  const entry = taskEntryForDate(state, task.id, occurrenceDate);
  return {
    ...task,
    occurrenceDate,
    dueDate: taskDueDateForOccurrence(task, occurrenceDate),
    occurrenceId: `${task.id}:${occurrenceDate}`,
    status: entry?.status === 'completed' ? 'completed' : 'pending',
    completedAt: entry?.completedAt || null,
    taskEntryId: entry?.id || null
  };
}

export function tasksOnDate(state, dateKey) {
  return (state.data.tasks || [])
    .filter(task => moduleVisibleOnSurfaces(state, task.moduleId) && taskRecursOnDate(task, dateKey))
    .map(task => taskOccurrence(state, task, dateKey));
}

export function tasksDueOnDate(state, dateKey) {
  return (state.data.tasks || []).filter(task => moduleVisibleOnSurfaces(state, task.moduleId)).flatMap(task => {
    const occurrenceDate = addDays(dateKey, -Math.max(0, Math.round(Number(task.dueOffsetDays || 0))));
    return taskRecursOnDate(task, occurrenceDate) ? [taskOccurrence(state, task, occurrenceDate)] : [];
  });
}

export function taskOccurrencesInRange(state, startKey, endKey) {
  return enumerateDateKeys(startKey, endKey).flatMap(date => tasksOnDate(state, date));
}

export function completedTaskHistory(state, { startKey = null, endKey = null, includeDeleted = true } = {}) {
  const tasks = new Map((includeDeleted ? state.data.tasks || [] : activeEntities(state.data.tasks || [])).map(task => [task.id, task]));
  return activeEntities(state.data.taskEntries || [])
    .filter(entry => entry.status === 'completed'
      && (!startKey || compareDateKeys(entry.occurrenceDate, startKey) >= 0)
      && (!endKey || compareDateKeys(entry.occurrenceDate, endKey) <= 0)
      && tasks.has(entry.taskId))
    .map(entry => ({ ...entry, task: tasks.get(entry.taskId) }))
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
}

export function activeHabitsOnDate(state, dateKey) {
  return (state.data.habits || []).filter(habit => {
    const createdKey = toLocalDateKey(habit.createdAt);
    return (!createdKey || compareDateKeys(createdKey, dateKey) <= 0) && lifecycleIncludesDate(habit, dateKey);
  });
}

export function habitEntryForDate(state, habitId, dateKey) {
  return activeEntities(state.data.habitEntries || []).find(entry => entry.habitId === habitId && entry.date === dateKey && entry.completed) || null;
}

export function completedHabitIdsOnDate(state, dateKey) {
  return new Set(activeEntities(state.data.habitEntries || [])
    .filter(entry => entry.date === dateKey && entry.completed)
    .map(entry => entry.habitId));
}

function completedHabitDates(state, habitId) {
  return new Set(activeEntities(state.data.habitEntries || [])
    .filter(entry => entry.habitId === habitId && entry.completed)
    .map(entry => entry.date));
}

export function currentHabitStreak(state, habitId, todayKey = toLocalDateKey()) {
  const completedDates = completedHabitDates(state, habitId);
  let cursor = completedDates.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestHabitStreak(state, habitId) {
  const dates = [...completedHabitDates(state, habitId)].sort(compareDateKeys);
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const date of dates) {
    current = previous && differenceInDays(previous, date) === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

export function habitAdherence(state, habitId, startKey, endKey) {
  const habit = (state.data.habits || []).find(item => item.id === habitId);
  if (!habit) return { completed: 0, missed: 0, expected: 0, percent: 0 };
  const createdKey = toLocalDateKey(habit.createdAt) || startKey;
  const eligibleStart = compareDateKeys(createdKey, startKey) > 0 ? createdKey : startKey;
  const lifecycleEnd = [habit.archivedAt, habit.deletedAt]
    .map(value => value ? toLocalDateKey(value) : '')
    .filter(Boolean)
    .sort(compareDateKeys)[0];
  const finalEligibleKey = lifecycleEnd ? addDays(lifecycleEnd, -1) : endKey;
  const eligibleEnd = compareDateKeys(finalEligibleKey, endKey) < 0 ? finalEligibleKey : endKey;
  if (compareDateKeys(eligibleStart, eligibleEnd) > 0) return { completed: 0, missed: 0, expected: 0, percent: 0 };
  const expected = daysInclusive(eligibleStart, eligibleEnd);
  const completed = [...completedHabitDates(state, habitId)]
    .filter(date => compareDateKeys(date, eligibleStart) >= 0 && compareDateKeys(date, eligibleEnd) <= 0).length;
  return { completed, missed: Math.max(0, expected - completed), expected, percent: expected ? Math.round(completed / expected * 100) : 0 };
}

export function habitHistory(state, habitId, startKey, endKey) {
  const completed = completedHabitDates(state, habitId);
  return enumerateDateKeys(startKey, endKey).map(date => ({ date, completed: completed.has(date) }));
}

export function completionForDate(state, dateKey) {
  const tasks = tasksOnDate(state, dateKey);
  const habits = activeHabitsOnDate(state, dateKey);
  const completedHabits = completedHabitIdsOnDate(state, dateKey);
  const taskDone = tasks.filter(task => task.status === 'completed').length;
  const habitDone = habits.filter(habit => completedHabits.has(habit.id)).length;
  const total = tasks.length + habits.length;
  const done = taskDone + habitDone;
  return { done, total, taskDone, taskTotal: tasks.length, habitDone, habitTotal: habits.length, percent: total ? Math.round(done / total * 100) : 0 };
}

export function completionSeries(state, startKey, endKey) {
  return enumerateDateKeys(startKey, endKey).map(date => ({ date, ...completionForDate(state, date) }));
}

export function focusSessionsInRange(state, startKey, endKey, { includeBreaks = false } = {}) {
  return activeEntities(state.data.focusSessions || []).filter(session => {
    const date = session.date || toLocalDateKey(session.endedAt);
    const kindAllowed = includeBreaks || session.kind === 'focus' || session.kind === 'work';
    return moduleVisibleOnSurfaces(state, session.moduleId) && kindAllowed && compareDateKeys(date, startKey) >= 0 && compareDateKeys(date, endKey) <= 0;
  });
}

export function focusMinutesForDate(state, dateKey) {
  const seconds = focusSessionsInRange(state, dateKey, dateKey)
    .reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0);
  return Math.round(seconds / 60);
}

export function readingSessionsInRange(state, startKey, endKey) {
  return activeEntities(state.data.readingSessions || []).filter(session =>
    compareDateKeys(session.date, startKey) >= 0 && compareDateKeys(session.date, endKey) <= 0);
}

export function readingSummaryForRange(state, startKey, endKey) {
  const sessions = readingSessionsInRange(state, startKey, endKey);
  return {
    sessions,
    sessionCount: sessions.length,
    minutes: Math.round(sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60),
    pages: sessions.reduce((sum, session) => sum + Number(session.pagesRead || 0), 0),
    days: new Set(sessions.map(session => session.date)).size
  };
}

export function readingGoalForDate(state, dateKey) {
  const goal = state.settings.readingGoal || { minutes: 30, pages: 0 };
  const summary = readingSummaryForRange(state, dateKey, dateKey);
  const requirements = [];
  if (Number(goal.minutes) > 0) requirements.push(summary.minutes >= Number(goal.minutes));
  if (Number(goal.pages) > 0) requirements.push(summary.pages >= Number(goal.pages));
  return {
    ...summary,
    goalMinutes: Number(goal.minutes || 0),
    goalPages: Number(goal.pages || 0),
    achieved: requirements.length > 0 && requirements.every(Boolean),
    percent: requirements.length
      ? Math.round(Math.min(1, Math.min(
        Number(goal.minutes) > 0 ? summary.minutes / Number(goal.minutes) : Infinity,
        Number(goal.pages) > 0 ? summary.pages / Number(goal.pages) : Infinity
      )) * 100)
      : 0
  };
}

export function currentBook(state) {
  const books = activeEntities(state.data.books || []);
  return books.find(book => book.id === state.settings.currentBookId) || books.find(book => !book.finishedAt) || books[0] || null;
}

export function universityItemsInRange(state, startKey, endKey) {
  return activeEntities(state.data.universityItems || []).filter(item => item.deadline
    && compareDateKeys(item.deadline, startKey) >= 0 && compareDateKeys(item.deadline, endKey) <= 0);
}

export function universityStatistics(state, referenceKey = toLocalDateKey(), { moduleId = null } = {}) {
  const items = activeEntities(state.data.universityItems || []).filter(item => !moduleId || (item.moduleId || 'university') === moduleId);
  const completed = items.filter(item => item.status === 'completed').length;
  const overdue = items.filter(item => item.status !== 'completed' && item.deadline && compareDateKeys(item.deadline, referenceKey) < 0).length;
  return {
    total: items.length,
    completed,
    pending: items.length - completed,
    overdue,
    estimatedHours: Math.round(items.reduce((sum, item) => sum + Number(item.estimatedHours || 0), 0) * 10) / 10,
    averageProgress: items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.progress || 0), 0) / items.length) : 0,
    byType: Object.fromEntries(UNIVERSITY_TYPES.map(type => [type, items.filter(item => item.type === type).length])),
    byStatus: Object.fromEntries(UNIVERSITY_STATUSES.map(status => [status, items.filter(item => item.status === status).length]))
  };
}


export function customModuleRecordsOnDate(state, dateKey, { includeArchived = true, includeHidden = false } = {}) {
  const customModules = state.data.customModules || [];
  return activeEntities(state.data.customModuleRecords || []).filter(record => {
    const definition = getModuleDefinition(record.moduleId, customModules);
    return definition
      && moduleSupports(definition, MODULE_CAPABILITIES.CALENDAR)
      && (record.date === dateKey || record.deadline === dateKey)
      && moduleVisibleOnSurfaces(state, record.moduleId, { includeArchived, includeHidden });
  });
}

export function customModuleStatistics(state, moduleId, startKey, endKey) {
  const records = activeEntities(state.data.customModuleRecords || []).filter(record =>
    record.moduleId === moduleId
    && record.date
    && compareDateKeys(record.date, startKey) >= 0
    && compareDateKeys(record.date, endKey) <= 0);
  const completed = records.filter(record => record.completed || record.status === 'completed').length;
  const totalDurationSeconds = records.reduce((sum, record) => sum + Number(record.durationSeconds || 0), 0);
  const numericValues = records.filter(record => Number.isFinite(Number(record.value))).map(record => Number(record.value));
  const progressRecords = records.filter(record => record.recordType === 'project');
  return {
    records,
    total: records.length,
    completed,
    completionRate: records.length ? Math.round(completed / records.length * 100) : 0,
    durationMinutes: Math.round(totalDurationSeconds / 60),
    valueTotal: numericValues.reduce((sum, value) => sum + value, 0),
    valueAverage: numericValues.length ? Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length * 10) / 10 : 0,
    averageProgress: progressRecords.length ? Math.round(progressRecords.reduce((sum, record) => sum + Number(record.progress || 0), 0) / progressRecords.length) : 0,
    activeDays: new Set(records.map(record => record.date)).size
  };
}

export function screenTimeEntryForDate(state, dateKey) {
  return activeEntities(state.data.screenTimeEntries || []).find(entry => entry.date === dateKey) || null;
}

export function rangeForStats(range, reference = new Date()) {
  const today = toLocalDateKey(reference);
  if (range === 'month') {
    const month = persianMonthRange(0, reference);
    const startKey = month?.startKey || addDays(today, -29);
    const elapsedDays = daysInclusive(startKey, today);
    const previousMonth = persianMonthRange(-1, reference);
    const previousStartKey = previousMonth?.startKey || addDays(startKey, -elapsedDays);
    const previousEndKey = previousMonth
      ? addDays(previousStartKey, Math.min(elapsedDays, previousMonth.length) - 1)
      : addDays(startKey, -1);
    return { startKey, endKey: today, previousStartKey, previousEndKey };
  }
  const startKey = startOfWeekKey(reference);
  const elapsedDays = daysInclusive(startKey, today);
  const previousStartKey = addDays(startKey, -7);
  return { startKey, endKey: today, previousStartKey, previousEndKey: addDays(previousStartKey, elapsedDays - 1) };
}

function aggregateCompletion(state, startKey, endKey) {
  return completionSeries(state, startKey, endKey).reduce((acc, day) => {
    acc.done += day.done;
    acc.total += day.total;
    acc.taskDone += day.taskDone;
    acc.taskTotal += day.taskTotal;
    acc.habitDone += day.habitDone;
    acc.habitTotal += day.habitTotal;
    return acc;
  }, { done: 0, total: 0, taskDone: 0, taskTotal: 0, habitDone: 0, habitTotal: 0 });
}

export function statisticsForDateRange(state, startKey, endKey, referenceKey = endKey) {
  const currentCompletion = aggregateCompletion(state, startKey, endKey);
  const completionRate = currentCompletion.total ? Math.round(currentCompletion.done / currentCompletion.total * 100) : 0;

  const habits = state.data.habits || [];
  const habitTotals = habits.reduce((acc, habit) => {
    const result = habitAdherence(state, habit.id, startKey, endKey);
    acc.completed += result.completed;
    acc.missed += result.missed;
    acc.expected += result.expected;
    return acc;
  }, { completed: 0, missed: 0, expected: 0 });
  const habitRate = habitTotals.expected ? Math.round(habitTotals.completed / habitTotals.expected * 100) : 0;

  const focusSessions = focusSessionsInRange(state, startKey, endKey);
  const focusMinutes = Math.round(focusSessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
  const focusDays = new Set(focusSessions.map(session => session.date || toLocalDateKey(session.endedAt))).size;
  const elapsedDays = daysInclusive(startKey, endKey);
  const focusConsistency = elapsedDays ? Math.round(focusDays / elapsedDays * 100) : 0;

  const readingEnabled = moduleVisibleOnSurfaces(state, 'reading');
  const books = readingEnabled ? activeEntities(state.data.books || []) : [];
  const totalBookPages = books.reduce((sum, book) => sum + Number(book.totalPages || 0), 0);
  const currentBookPages = books.reduce((sum, book) => sum + Math.min(Number(book.currentPage || 0), Number(book.totalPages || 0)), 0);
  const readingProgress = totalBookPages ? Math.round(currentBookPages / totalBookPages * 100) : 0;
  const reading = readingEnabled ? readingSummaryForRange(state, startKey, endKey) : { minutes: 0, pages: 0, sessionCount: 0, activeDays: 0 };
  const readingGoalDays = readingEnabled ? enumerateDateKeys(startKey, endKey).filter(date => readingGoalForDate(state, date).achieved).length : 0;
  const readingGoalRate = elapsedDays ? Math.round(readingGoalDays / elapsedDays * 100) : 0;

  const university = moduleVisibleOnSurfaces(state, 'university')
    ? universityStatistics(state, referenceKey, { moduleId: 'university' })
    : { total: 0, completed: 0, pending: 0, overdue: 0, estimatedHours: 0, averageProgress: 0, byType: {}, byStatus: {} };
  const screenEntries = moduleVisibleOnSurfaces(state, 'screen-time')
    ? activeEntities(state.data.screenTimeEntries || []).filter(entry => compareDateKeys(entry.date, startKey) >= 0 && compareDateKeys(entry.date, endKey) <= 0)
    : [];
  const screenAverage = screenEntries.length
    ? Math.round(screenEntries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0) / screenEntries.length)
    : 0;
  const screenCoverage = elapsedDays ? Math.round(screenEntries.length / elapsedDays * 100) : 0;

  return {
    startKey,
    endKey,
    today: completionForDate(state, referenceKey),
    completion: { ...currentCompletion, rate: completionRate },
    habits: { ...habitTotals, rate: habitRate },
    focus: { minutes: focusMinutes, days: focusDays, consistency: focusConsistency },
    reading: { ...reading, progress: readingProgress, currentPages: currentBookPages, totalPages: totalBookPages, goalDays: readingGoalDays, goalRate: readingGoalRate },
    university,
    screenTime: { averageMinutes: screenAverage, entries: screenEntries.length, coverage: screenCoverage },
    series: completionSeries(state, startKey, endKey)
  };
}

export function statisticsForRange(state, range = 'week', reference = new Date()) {
  const dates = rangeForStats(range, reference);
  const current = statisticsForDateRange(state, dates.startKey, dates.endKey, toLocalDateKey(reference));
  const previous = statisticsForDateRange(state, dates.previousStartKey, dates.previousEndKey, dates.previousEndKey);
  const previousRate = previous.completion.total ? previous.completion.rate : null;
  return {
    ...current,
    ...dates,
    completion: {
      ...current.completion,
      previousRate,
      delta: previousRate === null ? null : current.completion.rate - previousRate
    }
  };
}

export function calendarActivityForDate(state, dateKey) {
  const tasks = tasksOnDate(state, dateKey);
  const taskDeadlines = tasksDueOnDate(state, dateKey).filter(task => task.dueDate !== task.occurrenceDate);
  const habits = activeEntities(state.data.habitEntries || []).filter(entry => entry.date === dateKey && entry.completed);
  const focus = focusSessionsInRange(state, dateKey, dateKey, { includeBreaks: true });
  const reading = moduleVisibleOnSurfaces(state, 'reading', { includeArchived: true }) ? readingSessionsInRange(state, dateKey, dateKey) : [];
  const university = activeEntities(state.data.universityItems || []).filter(item =>
    item.deadline === dateKey
    && moduleVisibleOnSurfaces(state, item.moduleId || 'university', { includeArchived: true }));
  const notes = activeEntities(state.data.notes || []).filter(note => toLocalDateKey(note.updatedAt) === dateKey);
  const screenTime = moduleVisibleOnSurfaces(state, 'screen-time', { includeArchived: true }) ? screenTimeEntryForDate(state, dateKey) : null;
  const custom = customModuleRecordsOnDate(state, dateKey, { includeArchived: true });
  return { tasks, taskDeadlines, habits, focus, reading, university, notes, screenTime, custom };
}

export function hasCalendarActivity(activity) {
  return activity.tasks.length > 0
    || activity.taskDeadlines.length > 0
    || activity.habits.length > 0
    || activity.focus.length > 0
    || activity.reading.length > 0
    || activity.university.length > 0
    || activity.notes.length > 0
    || activity.custom?.length > 0
    || Boolean(activity.screenTime);
}

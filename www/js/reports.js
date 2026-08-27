import {
  activeEntities,
  activeHabitsOnDate,
  addDays,
  calendarActivityForDate,
  compareDateKeys,
  completedTaskHistory,
  completionForDate,
  completionSeries,
  customModuleRecordsOnDate,
  customModuleStatistics,
  currentHabitStreak,
  enumerateDateKeys,
  focusSessionsInRange,
  habitAdherence,
  habitEntryForDate,
  hasCalendarActivity,
  longestHabitStreak,
  persianMonthRange,
  rangeForStats,
  readingGoalForDate,
  readingSummaryForRange,
  statisticsForDateRange,
  taskOccurrencesInRange,
  tasksOnDate,
  taskRecursOnDate,
  toLocalDateKey,
  universityStatistics
} from './domain.js';
import {
  MODULE_STATUS,
  activeModuleDefinitions,
  getModuleDefinition,
  moduleSourceLabel,
  moduleStatusFor
} from './modules.js';

function minutesFromSessions(sessions) {
  return Math.round(sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
}

function moduleIsActive(state, moduleId) {
  return moduleStatusFor(state, moduleId) === MODULE_STATUS.ACTIVE;
}

function customReviewSummaries(state, startKey, endKey) {
  return activeModuleDefinitions(state)
    .filter(definition => definition.custom)
    .map(definition => ({
      moduleId: definition.id,
      name: definition.name,
      type: definition.genericType,
      unit: definition.unit || '',
      ...customModuleStatistics(state, definition.id, startKey, endKey)
    }));
}

export function dailyReview(state, dateKey = toLocalDateKey()) {
  const tasks = tasksOnDate(state, dateKey);
  const completedTasks = tasks.filter(task => task.status === 'completed');
  const pendingTasks = tasks.filter(task => task.status !== 'completed');
  const habits = activeHabitsOnDate(state, dateKey);
  const completedHabits = habits.filter(habit => habitEntryForDate(state, habit.id, dateKey));
  const missedHabits = habits.filter(habit => !habitEntryForDate(state, habit.id, dateKey));
  const focusSessions = focusSessionsInRange(state, dateKey, dateKey);
  const reading = moduleIsActive(state, 'reading')
    ? readingSummaryForRange(state, dateKey, dateKey)
    : { minutes: 0, pages: 0, sessionCount: 0 };
  const universityDue = activeEntities(state.data.universityItems || [])
    .filter(item => item.deadline === dateKey && item.status !== 'completed' && moduleIsActive(state, item.moduleId || 'university'));
  const moduleSummaries = customReviewSummaries(state, dateKey, dateKey);
  const productivity = completionForDate(state, dateKey);

  return {
    date: dateKey,
    completedTasks,
    pendingTasks,
    completedHabits,
    missedHabits,
    focusMinutes: minutesFromSessions(focusSessions),
    readingMinutes: reading.minutes,
    readingPages: reading.pages,
    productivity,
    universityDue,
    moduleSummaries,
    unfinished: [
      ...pendingTasks.map(item => ({ type: 'task', id: item.id, date: item.occurrenceDate, title: item.title })),
      ...missedHabits.map(item => ({ type: 'habit', id: item.id, date: dateKey, title: item.title })),
      ...universityDue.map(item => ({ type: 'university', id: item.id, date: item.deadline, title: item.title }))
    ]
  };
}

function productiveDayRanking(state, startKey, endKey) {
  return completionSeries(state, startKey, endKey)
    .map(day => ({ ...day, score: day.percent, hasPlan: day.total > 0 }))
    .filter(day => day.hasPlan);
}

function weeklyInsights(report, previousStats) {
  const insights = [];
  if (!report.taskTotal && !report.habitExpected && !report.focusMinutes && !report.readingMinutes) {
    return ['برای این هفته هنوز فعالیت ثبت‌شده‌ای وجود ندارد.'];
  }
  if (report.taskTotal) insights.push(`${report.taskCompleted} کار از ${report.taskTotal} کار برنامه‌ریزی‌شده کامل شده است.`);
  if (report.habitExpected) insights.push(`نرخ پایبندی به عادت‌ها ${report.habitRate} درصد بوده است.`);
  if (report.mostProductiveDay) insights.push(`بیشترین تکمیل برنامه در ${report.mostProductiveDay.date} ثبت شده است.`);
  if (report.leastProductiveDay && report.leastProductiveDay.date !== report.mostProductiveDay?.date) {
    insights.push(`کمترین تکمیل برنامه در ${report.leastProductiveDay.date} بوده است.`);
  }
  if (previousStats?.completion?.rate !== null) {
    const delta = report.taskHabitRate - previousStats.completion.rate;
    if (delta > 0) insights.push(`نرخ تکمیل نسبت به دوره قبل ${delta} واحد درصد بهتر شده است.`);
    else if (delta < 0) insights.push(`نرخ تکمیل نسبت به دوره قبل ${Math.abs(delta)} واحد درصد کمتر است.`);
  }
  if (!report.focusMinutes) insights.push('این هفته جلسه تمرکز تکمیل‌شده‌ای ثبت نشده است.');
  if (report.readingEnabled && !report.readingMinutes) insights.push('این هفته جلسه مطالعه‌ای ثبت نشده است.');
  return insights.slice(0, 5);
}

export function weeklyReview(state, reference = new Date()) {
  const range = rangeForStats('week', reference);
  const occurrences = taskOccurrencesInRange(state, range.startKey, range.endKey);
  const taskCompleted = occurrences.filter(item => item.status === 'completed').length;
  const habits = state.data.habits || [];
  const habitTotals = habits.reduce((total, habit) => {
    const adherence = habitAdherence(state, habit.id, range.startKey, range.endKey);
    total.completed += adherence.completed;
    total.expected += adherence.expected;
    total.missed += adherence.missed;
    return total;
  }, { completed: 0, expected: 0, missed: 0 });
  const focusSessions = focusSessionsInRange(state, range.startKey, range.endKey);
  const reading = moduleIsActive(state, 'reading')
    ? readingSummaryForRange(state, range.startKey, range.endKey)
    : { minutes: 0, pages: 0, sessionCount: 0 };
  const ranking = productiveDayRanking(state, range.startKey, range.endKey);
  const mostProductiveDay = ranking.length ? [...ranking].sort((a, b) => b.score - a.score || b.done - a.done)[0] : null;
  const leastProductiveDay = ranking.length ? [...ranking].sort((a, b) => a.score - b.score || a.done - b.done)[0] : null;
  const elapsedDays = enumerateDateKeys(range.startKey, range.endKey).length;
  const focusDays = new Set(focusSessions.map(session => session.date || toLocalDateKey(session.endedAt))).size;
  const readingGoalDays = enumerateDateKeys(range.startKey, range.endKey).filter(date => readingGoalForDate(state, date).achieved).length;
  const taskRate = occurrences.length ? Math.round(taskCompleted / occurrences.length * 100) : 0;
  const habitRate = habitTotals.expected ? Math.round(habitTotals.completed / habitTotals.expected * 100) : 0;
  const taskHabitTotal = occurrences.length + habitTotals.expected;
  const taskHabitDone = taskCompleted + habitTotals.completed;
  const taskHabitRate = taskHabitTotal ? Math.round(taskHabitDone / taskHabitTotal * 100) : 0;
  const previousStats = statisticsForDateRange(state, range.previousStartKey, range.previousEndKey, range.previousEndKey);

  const report = {
    ...range,
    taskCompleted,
    taskTotal: occurrences.length,
    taskRate,
    habitCompleted: habitTotals.completed,
    habitExpected: habitTotals.expected,
    habitMissed: habitTotals.missed,
    habitRate,
    focusMinutes: minutesFromSessions(focusSessions),
    focusHours: Math.round(minutesFromSessions(focusSessions) / 6) / 10,
    readingMinutes: reading.minutes,
    readingHours: Math.round(reading.minutes / 6) / 10,
    readingPages: reading.pages,
    mostProductiveDay,
    leastProductiveDay,
    taskHabitRate,
    rings: {
      tasks: taskRate,
      habits: habitRate,
      focus: elapsedDays ? Math.round(focusDays / elapsedDays * 100) : 0,
      reading: elapsedDays ? Math.round(readingGoalDays / elapsedDays * 100) : 0
    },
    moduleSummaries: customReviewSummaries(state, range.startKey, range.endKey)
  };
  report.readingEnabled = moduleIsActive(state, 'reading');
  report.insights = weeklyInsights(report, previousStats);
  return report;
}

function metricComparison(current, previous) {
  return { current, previous, delta: current - previous };
}

export function monthlyReview(state, reference = new Date()) {
  const currentRange = persianMonthRange(0, reference);
  const previousRange = persianMonthRange(-1, reference);
  const today = toLocalDateKey(reference);
  const currentEnd = compareDateKeys(today, currentRange?.endKey || today) <= 0 ? today : currentRange.endKey;
  const currentStart = currentRange?.startKey || rangeForStats('month', reference).startKey;
  const elapsedDays = enumerateDateKeys(currentStart, currentEnd).length;
  const previousStart = previousRange?.startKey || addDays(currentStart, -elapsedDays);
  const previousEnd = previousRange
    ? addDays(previousStart, Math.min(elapsedDays, previousRange.length) - 1)
    : addDays(currentStart, -1);
  const currentStats = statisticsForDateRange(state, currentStart, currentEnd, currentEnd);
  const previousStats = statisticsForDateRange(state, previousStart, previousEnd, previousEnd);
  const habits = activeEntities(state.data.habits || []);
  const streaks = habits.map(habit => ({
    id: habit.id,
    title: habit.title,
    current: currentHabitStreak(state, habit.id, today),
    longest: longestHabitStreak(state, habit.id)
  })).sort((a, b) => b.current - a.current || b.longest - a.longest);

  const comparisons = {
    completion: metricComparison(currentStats.completion.rate, previousStats.completion.rate),
    habits: metricComparison(currentStats.habits.rate, previousStats.habits.rate),
    focusMinutes: metricComparison(currentStats.focus.minutes, previousStats.focus.minutes),
    readingMinutes: metricComparison(currentStats.reading.minutes, previousStats.reading.minutes),
    readingPages: metricComparison(currentStats.reading.pages, previousStats.reading.pages)
  };

  const improvements = [];
  const weakAreas = [];
  if (comparisons.completion.delta > 0) improvements.push({ key: 'completion', delta: comparisons.completion.delta });
  if (comparisons.habits.delta > 0) improvements.push({ key: 'habits', delta: comparisons.habits.delta });
  if (comparisons.focusMinutes.delta > 0) improvements.push({ key: 'focusMinutes', delta: comparisons.focusMinutes.delta });
  if (comparisons.readingMinutes.delta > 0) improvements.push({ key: 'readingMinutes', delta: comparisons.readingMinutes.delta });
  if (currentStats.completion.rate < 60) weakAreas.push({ key: 'completion', value: currentStats.completion.rate });
  if (currentStats.habits.rate < 60 && currentStats.habits.expected) weakAreas.push({ key: 'habits', value: currentStats.habits.rate });
  if (!currentStats.focus.minutes) weakAreas.push({ key: 'focus', value: 0 });
  if (!currentStats.reading.minutes) weakAreas.push({ key: 'reading', value: 0 });

  return {
    startKey: currentStart,
    endKey: currentEnd,
    previousStartKey: previousStart,
    previousEndKey: previousEnd,
    current: currentStats,
    previous: previousStats,
    comparisons,
    streaks,
    improvements,
    weakAreas,
    university: moduleIsActive(state, 'university') ? universityStatistics(state, today) : { total: 0, completed: 0, overdue: 0, averageProgress: 0, estimatedHours: 0, byType: {}, byStatus: {} },
    moduleSummaries: customReviewSummaries(state, currentStart, currentEnd),
    readingEnabled: moduleIsActive(state, 'reading')
  };
}

function normalizeSearch(value) {
  return String(value ?? '')
    .toLocaleLowerCase('fa')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchable(...values) {
  return normalizeSearch(values.filter(Boolean).join(' '));
}

function matchesQuery(query, ...values) {
  return searchable(...values).includes(query);
}

function dateSearchLabel(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return [
    dateKey,
    new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    new Intl.DateTimeFormat('fa-IR-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  ].join(' ');
}

export function globalSearch(state, rawQuery, {
  types = null,
  includeArchived = true,
  includeDeleted = false,
  includeHiddenModules = state.settings.modulePreferences?.showHiddenSearchResults === true,
  sort = 'recent',
  limit = 100
} = {}) {
  const query = normalizeSearch(rawQuery);
  if (!query) return [];
  const allowed = types ? new Set(types) : null;
  const results = [];
  const permit = type => !allowed || allowed.has(type);
  const visible = items => (items || []).filter(item => (includeDeleted || !item.deletedAt) && (includeArchived || !item.archivedAt));
  const moduleAllowed = moduleId => {
    if (!moduleId) return true;
    const status = moduleStatusFor(state, moduleId);
    if (status === MODULE_STATUS.ACTIVE) return true;
    if (status === MODULE_STATUS.HIDDEN) return includeHiddenModules;
    if (status === MODULE_STATUS.ARCHIVED) return includeArchived;
    return false;
  };
  const withSource = (result, moduleId = null) => ({
    ...result,
    sourceModuleId: moduleId,
    sourceModule: moduleId ? moduleSourceLabel(state, moduleId) : ({ task: 'کارها', habit: 'عادت‌ها', note: 'یادداشت‌ها', calendar: 'تقویم' }[result.type] || 'آرام')
  });

  if (permit('task')) {
    for (const task of visible(state.data.tasks).filter(item => moduleAllowed(item.moduleId))) {
      if (!matchesQuery(query, task.title, task.category, task.notes, task.startDate, task.priority)) continue;
      results.push(withSource({ type: 'task', id: task.id, title: task.title, subtitle: task.category || task.startDate, date: task.startDate, updatedAt: task.updatedAt, archived: Boolean(task.archivedAt), deleted: Boolean(task.deletedAt) }, task.moduleId));
    }
  }
  if (permit('habit')) {
    for (const habit of visible(state.data.habits)) {
      if (!matchesQuery(query, habit.title, habit.reminder?.time)) continue;
      results.push(withSource({ type: 'habit', id: habit.id, title: habit.title, subtitle: 'عادت', date: toLocalDateKey(habit.updatedAt), updatedAt: habit.updatedAt, archived: Boolean(habit.archivedAt), deleted: Boolean(habit.deletedAt) }));
    }
  }
  if (permit('book') && moduleAllowed('reading')) {
    for (const book of visible(state.data.books)) {
      if (!matchesQuery(query, book.title, book.author)) continue;
      results.push(withSource({ type: 'book', id: book.id, title: book.title, subtitle: book.author || 'کتاب', date: toLocalDateKey(book.updatedAt), updatedAt: book.updatedAt, archived: Boolean(book.archivedAt), deleted: Boolean(book.deletedAt) }, 'reading'));
    }
  }
  if (permit('note')) {
    for (const note of visible(state.data.notes)) {
      if (!matchesQuery(query, note.title, note.body)) continue;
      results.push(withSource({ type: 'note', id: note.id, title: note.title, subtitle: String(note.body || '').slice(0, 80), date: toLocalDateKey(note.updatedAt), updatedAt: note.updatedAt, deleted: Boolean(note.deletedAt) }));
    }
  }
  if (permit('university')) {
    for (const item of visible(state.data.universityItems).filter(record => moduleAllowed(record.moduleId || 'university'))) {
      if (!matchesQuery(query, item.title, item.notes, item.type, item.status, item.priority, item.deadline)) continue;
      results.push(withSource({ type: 'university', id: item.id, title: item.title, subtitle: item.deadline || item.type, date: item.deadline || toLocalDateKey(item.updatedAt), updatedAt: item.updatedAt, archived: Boolean(item.archivedAt), deleted: Boolean(item.deletedAt) }, item.moduleId || 'university'));
    }
  }
  if (permit('custom')) {
    const modules = new Map((state.data.customModules || []).filter(module => !module.deletedAt && moduleAllowed(module.id)).map(module => [module.id, module]));
    for (const record of visible(state.data.customModuleRecords).filter(item => modules.has(item.moduleId))) {
      const module = modules.get(record.moduleId);
      if (!matchesQuery(query, module.name, record.title, record.notes, record.value, record.unit, record.date, record.deadline)) continue;
      results.push(withSource({
        type: 'custom',
        id: record.id,
        moduleId: record.moduleId,
        title: record.title || module.name,
        subtitle: record.notes || record.date || module.name,
        date: record.date || record.deadline || toLocalDateKey(record.updatedAt),
        updatedAt: record.updatedAt,
        deleted: Boolean(record.deletedAt)
      }, record.moduleId));
    }
  }

  if (permit('calendar')) {
    const dates = new Set();
    for (const task of state.data.tasks || []) if (task.startDate && moduleAllowed(task.moduleId)) dates.add(task.startDate);
    for (const entry of state.data.taskEntries || []) dates.add(entry.occurrenceDate);
    for (const entry of state.data.habitEntries || []) dates.add(entry.date);
    for (const session of state.data.focusSessions || []) if (moduleAllowed(session.moduleId)) dates.add(session.date || toLocalDateKey(session.endedAt));
    if (moduleAllowed('reading')) for (const session of state.data.readingSessions || []) dates.add(session.date);
    for (const item of state.data.universityItems || []) if (item.deadline && moduleAllowed(item.moduleId || 'university')) dates.add(item.deadline);
    for (const note of state.data.notes || []) dates.add(toLocalDateKey(note.updatedAt));
    if (moduleAllowed('screen-time')) for (const entry of state.data.screenTimeEntries || []) dates.add(entry.date);
    for (const record of state.data.customModuleRecords || []) {
      if (!moduleAllowed(record.moduleId)) continue;
      if (record.date) dates.add(record.date);
      if (record.deadline) dates.add(record.deadline);
    }
    for (const date of dates) {
      if (!date || !matchesQuery(query, dateSearchLabel(date))) continue;
      const activity = calendarActivityForDate(state, date);
      if (!hasCalendarActivity(activity)) continue;
      const count = activity.tasks.length + activity.taskDeadlines.length + activity.habits.length + activity.focus.length + activity.reading.length + activity.university.length + activity.notes.length + (activity.custom?.length || 0) + (activity.screenTime ? 1 : 0);
      results.push(withSource({ type: 'calendar', id: date, title: dateSearchLabel(date).split(' ').slice(1).join(' '), subtitle: `${count} رویداد`, date, updatedAt: `${date}T12:00:00.000Z` }));
    }
  }

  const direction = sort === 'oldest' ? 1 : -1;
  return results.sort((left, right) => direction * String(left.updatedAt || left.date || '').localeCompare(String(right.updatedAt || right.date || ''))).slice(0, limit);
}

export function filterTasks(state, filters = {}) {
  const today = filters.referenceDate || toLocalDateKey();
  let tasks = [...(state.data.tasks || [])];
  const status = filters.status || 'active';
  if (status === 'active') tasks = tasks.filter(task => !task.deletedAt && !task.archivedAt);
  if (status === 'archived') tasks = tasks.filter(task => !task.deletedAt && task.archivedAt);
  if (status === 'deleted') tasks = tasks.filter(task => task.deletedAt);
  if (status === 'completed') {
    const completedIds = new Set(completedTaskHistory(state).map(entry => entry.taskId));
    tasks = tasks.filter(task => completedIds.has(task.id));
  }
  if (status === 'pending') tasks = tasks.filter(task => !task.deletedAt && !task.archivedAt && tasksOnDate(state, today).some(item => item.id === task.id && item.status === 'pending'));
  if (filters.priority && filters.priority !== 'all') tasks = tasks.filter(task => task.priority === filters.priority);
  if (filters.category && filters.category !== 'all') tasks = tasks.filter(task => task.category === filters.category);
  if (filters.moduleId) tasks = tasks.filter(task => task.moduleId === filters.moduleId);
  if (filters.date) tasks = tasks.filter(task => taskRecursOnDate(task, filters.date));
  if (filters.query) tasks = tasks.filter(task => matchesQuery(normalizeSearch(filters.query), task.title, task.category, task.notes));
  const sort = filters.sort || 'recent';
  tasks.sort((left, right) => {
    if (sort === 'oldest') return String(left.createdAt).localeCompare(String(right.createdAt));
    if (sort === 'date') return String(left.startDate).localeCompare(String(right.startDate));
    return String(right.updatedAt).localeCompare(String(left.updatedAt));
  });
  return tasks;
}


export function filterHabits(state, filters = {}) {
  let habits = [...(state.data.habits || [])];
  const status = filters.status || 'active';
  if (status === 'active') habits = habits.filter(item => !item.deletedAt && !item.archivedAt);
  if (status === 'archived') habits = habits.filter(item => !item.deletedAt && item.archivedAt);
  if (status === 'deleted') habits = habits.filter(item => item.deletedAt);
  if (status === 'done_today') habits = habits.filter(item => !item.deletedAt && habitEntryForDate(state, item.id, filters.referenceDate || toLocalDateKey()));
  if (status === 'missed_today') habits = habits.filter(item => !item.deletedAt && !item.archivedAt && !habitEntryForDate(state, item.id, filters.referenceDate || toLocalDateKey()));
  if (filters.query) habits = habits.filter(item => matchesQuery(normalizeSearch(filters.query), item.title));
  const sort = filters.sort || 'recent';
  habits.sort((left, right) => {
    if (sort === 'oldest') return String(left.createdAt).localeCompare(String(right.createdAt));
    if (sort === 'streak') return currentHabitStreak(state, right.id) - currentHabitStreak(state, left.id);
    return String(right.updatedAt).localeCompare(String(left.updatedAt));
  });
  return habits;
}

export function filterBooks(state, filters = {}) {
  let books = [...(state.data.books || [])];
  const status = filters.status || 'active';
  if (status === 'active') books = books.filter(item => !item.deletedAt && !item.archivedAt);
  if (status === 'current') books = books.filter(item => item.id === state.settings.currentBookId && !item.deletedAt);
  if (status === 'finished') books = books.filter(item => !item.deletedAt && item.finishedAt);
  if (status === 'archived') books = books.filter(item => !item.deletedAt && item.archivedAt);
  if (status === 'deleted') books = books.filter(item => item.deletedAt);
  if (filters.query) books = books.filter(item => matchesQuery(normalizeSearch(filters.query), item.title, item.author));
  books.sort((left, right) => filters.sort === 'oldest'
    ? String(left.createdAt).localeCompare(String(right.createdAt))
    : String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return books;
}

export function filterUniversity(state, filters = {}) {
  let items = [...(state.data.universityItems || [])];
  const lifecycle = filters.lifecycle || 'active';
  if (lifecycle === 'active') items = items.filter(item => !item.deletedAt && !item.archivedAt);
  if (lifecycle === 'archived') items = items.filter(item => !item.deletedAt && item.archivedAt);
  if (lifecycle === 'deleted') items = items.filter(item => item.deletedAt);
  if (filters.status && filters.status !== 'all') items = items.filter(item => item.status === filters.status);
  if (filters.type && filters.type !== 'all') items = items.filter(item => item.type === filters.type);
  if (filters.moduleId) items = items.filter(item => (item.moduleId || 'university') === filters.moduleId);
  if (filters.priority && filters.priority !== 'all') items = items.filter(item => item.priority === filters.priority);
  if (filters.date) items = items.filter(item => item.deadline === filters.date);
  if (filters.query) items = items.filter(item => matchesQuery(normalizeSearch(filters.query), item.title, item.notes));
  items.sort((left, right) => {
    if (filters.sort === 'oldest') return String(left.createdAt).localeCompare(String(right.createdAt));
    if (filters.sort === 'deadline') return String(left.deadline || '9999').localeCompare(String(right.deadline || '9999'));
    return String(right.updatedAt).localeCompare(String(left.updatedAt));
  });
  return items;
}

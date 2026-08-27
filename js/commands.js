import {
  RECURRENCE_TYPES,
  RECURRENCE_UNITS,
  TASK_PRIORITIES,
  UNIVERSITY_STATUSES,
  UNIVERSITY_TYPES,
  compareDateKeys,
  differenceInDays,
  isValidDateKey,
  normalizeDigits,
  taskRecursOnDate,
  toLocalDateKey
} from './domain.js';
import { createId } from './store.js';

const SESSION_KINDS = new Set(['focus', 'work', 'break']);

function requiredText(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function requiredDate(value, label) {
  const result = normalizeDigits(value);
  if (!isValidDateKey(result)) throw new Error(`${label} is invalid`);
  return result;
}

function boundedNumber(value, minimum, maximum, label) {
  const result = Number(normalizeDigits(value));
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`${label} is invalid`);
  return result;
}

function optionalClock(value, label = 'time') {
  const result = normalizeDigits(value);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function timestamp(now = Date.now) {
  return new Date(now()).toISOString();
}

function base(id, at) {
  return { id: id || createId(), createdAt: at, updatedAt: at, deletedAt: null };
}

function findEntity(items, id) {
  return (items || []).find(item => item.id === id);
}

export function saveTask(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const at = timestamp(now);
  const startDate = requiredDate(input.startDate, 'startDate');
  const dueDate = requiredDate(input.dueDate || startDate, 'dueDate');
  if (compareDateKeys(dueDate, startDate) < 0) throw new Error('dueDate precedes startDate');
  const recurrenceType = RECURRENCE_TYPES.includes(input.recurrence?.type) ? input.recurrence.type : 'none';
  const recurrenceUnit = RECURRENCE_UNITS.includes(input.recurrence?.unit) ? input.recurrence.unit : 'day';
  const recurrenceEnd = input.recurrence?.endDate ? requiredDate(input.recurrence.endDate, 'recurrence.endDate') : null;
  if (recurrenceEnd && compareDateKeys(recurrenceEnd, startDate) < 0) throw new Error('recurrence ends before task starts');
  const dueOffsetDays = differenceInDays(startDate, dueDate);
  const payload = {
    title: requiredText(input.title, 'title'),
    moduleId: String(input.moduleId || '').trim() || null,
    startDate,
    dueOffsetDays,
    time: optionalClock(input.time || '12:00'),
    estimatedMinutes: boundedNumber(input.estimatedMinutes ?? 30, 1, 1440, 'estimatedMinutes'),
    priority: TASK_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    category: String(input.category || '').trim(),
    notes: String(input.notes || ''),
    recurrence: {
      type: recurrenceType,
      interval: boundedNumber(input.recurrence?.interval ?? 1, 1, 365, 'recurrence.interval'),
      unit: recurrenceUnit,
      weekdays: Array.isArray(input.recurrence?.weekdays) ? input.recurrence.weekdays.map(value => Number(normalizeDigits(value))) : [],
      endDate: recurrenceEnd
    }
  };
  const existing = input.id ? findEntity(draft.data.tasks, input.id) : null;
  if (existing) {
    Object.assign(existing, payload, { updatedAt: at });
    return existing.id;
  }
  const id = input.id || idFactory();
  draft.data.tasks.push({ ...base(id, at), ...payload, archivedAt: null });
  return id;
}

export function toggleTaskOccurrence(draft, taskId, occurrenceDate, { now = Date.now, idFactory = createId } = {}) {
  const task = findEntity(draft.data.tasks, taskId);
  if (!task) throw new Error('Task not found');
  requiredDate(occurrenceDate, 'occurrenceDate');
  if (!taskRecursOnDate(task, occurrenceDate)) throw new Error('Task does not occur on this date');
  const at = timestamp(now);
  const entries = draft.data.taskEntries || (draft.data.taskEntries = []);
  const existing = entries.find(entry => entry.taskId === taskId && entry.occurrenceDate === occurrenceDate);
  const completing = Boolean(!existing || existing.status !== 'completed' || existing.deletedAt);
  if (existing) {
    Object.assign(existing, {
      status: completing ? 'completed' : 'pending',
      completedAt: completing ? at : null,
      deletedAt: null,
      updatedAt: at
    });
  } else {
    entries.push({ ...base(idFactory(), at), taskId, occurrenceDate, status: 'completed', completedAt: at });
  }
  return completing;
}

export function archiveTask(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.tasks, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = at;
  item.updatedAt = at;
  return true;
}

export function unarchiveTask(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.tasks, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = null;
  item.updatedAt = at;
  return true;
}

export function deleteTask(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.tasks, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = at;
  item.updatedAt = at;
  return true;
}

export function restoreTask(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.tasks, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = null;
  item.updatedAt = at;
  return true;
}

export function saveHabit(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const at = timestamp(now);
  const payload = {
    title: requiredText(input.title, 'title'),
    reminder: {
      enabled: input.reminder?.enabled === true,
      time: input.reminder?.enabled === true ? optionalClock(input.reminder?.time || '09:00', 'reminder.time') : null
    }
  };
  const existing = input.id ? findEntity(draft.data.habits, input.id) : null;
  if (existing) {
    Object.assign(existing, payload, { updatedAt: at });
    return existing.id;
  }
  const id = input.id || idFactory();
  draft.data.habits.push({ ...base(id, at), ...payload, archivedAt: null });
  return id;
}

export function toggleHabitDate(draft, habitId, date, { now = Date.now, idFactory = createId } = {}) {
  const habit = findEntity(draft.data.habits, habitId);
  if (!habit) throw new Error('Habit not found');
  requiredDate(date, 'date');
  const at = timestamp(now);
  const createdDate = toLocalDateKey(habit.createdAt);
  const today = toLocalDateKey(at);
  const lifecycleEnd = [habit.archivedAt, habit.deletedAt]
    .map(value => value ? toLocalDateKey(value) : '')
    .filter(Boolean)
    .sort()[0];
  if ((createdDate && compareDateKeys(date, createdDate) < 0)
    || compareDateKeys(date, today) > 0
    || (lifecycleEnd && compareDateKeys(date, lifecycleEnd) >= 0)) {
    throw new Error('Habit date is outside its valid history');
  }
  const entries = draft.data.habitEntries;
  const existing = entries.find(entry => entry.habitId === habitId && entry.date === date);
  const completing = Boolean(!existing || existing.deletedAt || existing.completed === false);
  if (existing) {
    existing.completed = true;
    existing.completedAt = at;
    existing.deletedAt = completing ? null : at;
    existing.updatedAt = at;
  } else {
    entries.push({ ...base(idFactory(), at), habitId, date, completed: true, completedAt: at });
  }
  return completing;
}

export function archiveHabit(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.habits, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = at;
  item.updatedAt = at;
  return true;
}

export function unarchiveHabit(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.habits, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = null;
  item.updatedAt = at;
  return true;
}

export function deleteHabit(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.habits, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = at;
  item.updatedAt = at;
  return true;
}

export function restoreHabit(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.habits, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = null;
  item.updatedAt = at;
  return true;
}

export function saveNote(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const at = timestamp(now);
  const existing = input.id ? findEntity(draft.data.notes, input.id) : null;
  if (existing) {
    Object.assign(existing, { title: String(input.title || 'بدون عنوان').trim() || 'بدون عنوان', body: String(input.body || ''), updatedAt: at });
    return existing.id;
  }
  const id = input.id || idFactory();
  draft.data.notes.push({ ...base(id, at), title: String(input.title || 'بدون عنوان').trim() || 'بدون عنوان', body: String(input.body || '') });
  return id;
}

export function deleteNote(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.notes, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = at;
  item.updatedAt = at;
  return true;
}

export function restoreNote(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.notes, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = null;
  item.updatedAt = at;
  return true;
}

export function saveBook(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const at = timestamp(now);
  const totalPages = boundedNumber(input.totalPages, 1, 100000, 'totalPages');
  const currentPage = boundedNumber(input.currentPage ?? 0, 0, totalPages, 'currentPage');
  const payload = {
    title: requiredText(input.title, 'title'),
    author: String(input.author || '').trim(),
    totalPages,
    currentPage
  };
  const existing = input.id ? findEntity(draft.data.books, input.id) : null;
  let id;
  if (existing) {
    Object.assign(existing, payload, { updatedAt: at, finishedAt: payload.currentPage >= payload.totalPages ? (existing.finishedAt || at) : null });
    id = existing.id;
  } else {
    id = input.id || idFactory();
    draft.data.books.push({ ...base(id, at), ...payload, archivedAt: null, finishedAt: payload.currentPage >= payload.totalPages ? at : null });
  }
  if (input.makeCurrent || !draft.settings.currentBookId) draft.settings.currentBookId = id;
  return id;
}

export function setCurrentBook(draft, id) {
  const item = findEntity(draft.data.books, id);
  if (!item || item.deletedAt || item.archivedAt) return false;
  draft.settings.currentBookId = id;
  return true;
}

export function archiveBook(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.books, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = at;
  item.updatedAt = at;
  if (draft.settings.currentBookId === id) draft.settings.currentBookId = null;
  return true;
}

export function unarchiveBook(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.books, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = null;
  item.updatedAt = at;
  return true;
}

export function deleteBook(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.books, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = at;
  item.updatedAt = at;
  if (draft.settings.currentBookId === id) draft.settings.currentBookId = null;
  return true;
}

export function restoreBook(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.books, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = null;
  item.updatedAt = at;
  return true;
}

export function recordReadingSession(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const at = timestamp(now);
  const book = findEntity(draft.data.books, input.bookId);
  if (!book || book.deletedAt || book.archivedAt) throw new Error('Book not found');
  const date = requiredDate(input.date || toLocalDateKey(at), 'date');
  const fromPage = boundedNumber(input.fromPage ?? book.currentPage ?? 0, 0, book.totalPages, 'fromPage');
  const toPage = boundedNumber(input.toPage ?? fromPage, fromPage, book.totalPages, 'toPage');
  const minutes = boundedNumber(input.minutes ?? 0, 0, 1440, 'minutes');
  if (toPage === fromPage && minutes === 0) throw new Error('Reading session is empty');
  const id = input.id || idFactory();
  draft.data.readingSessions.push({
    ...base(id, at),
    bookId: book.id,
    date,
    fromPage,
    toPage,
    pagesRead: Math.max(0, Number(normalizeDigits(input.pagesRead ?? (toPage - fromPage)))),
    durationSeconds: Math.round(minutes * 60),
    startedAt: input.startedAt || null,
    endedAt: input.endedAt || at,
    notes: String(input.notes || '')
  });
  book.currentPage = Math.max(Number(book.currentPage || 0), toPage);
  book.finishedAt = book.currentPage >= book.totalPages ? (book.finishedAt || at) : null;
  book.updatedAt = at;
  return id;
}

export function deleteReadingSession(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.readingSessions, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = at;
  item.updatedAt = at;
  return true;
}

export function setReadingGoal(draft, { minutes, pages }) {
  draft.settings.readingGoal = {
    minutes: boundedNumber(minutes ?? 0, 0, 1440, 'minutes'),
    pages: boundedNumber(pages ?? 0, 0, 10000, 'pages')
  };
}

export function saveUniversityItem(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const at = timestamp(now);
  const progress = boundedNumber(input.progress ?? 0, 0, 100, 'progress');
  const status = UNIVERSITY_STATUSES.includes(input.status)
    ? input.status
    : (progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started');
  const deadline = input.deadline ? requiredDate(input.deadline, 'deadline') : null;
  const payload = {
    title: requiredText(input.title, 'title'),
    moduleId: String(input.moduleId || '').trim() || null,
    type: UNIVERSITY_TYPES.includes(input.type) ? input.type : 'assignment',
    deadline,
    progress: status === 'completed' ? 100 : progress,
    status,
    notes: String(input.notes || ''),
    priority: TASK_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    estimatedHours: boundedNumber(input.estimatedHours ?? 0, 0, 10000, 'estimatedHours'),
    completedAt: status === 'completed' ? (input.completedAt || at) : null
  };
  const existing = input.id ? findEntity(draft.data.universityItems, input.id) : null;
  if (existing) {
    Object.assign(existing, payload, { updatedAt: at });
    return existing.id;
  }
  const id = input.id || idFactory();
  draft.data.universityItems.push({ ...base(id, at), ...payload, archivedAt: null });
  return id;
}

export function archiveUniversityItem(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.universityItems, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = at;
  item.updatedAt = at;
  return true;
}

export function unarchiveUniversityItem(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.universityItems, id);
  if (!item) return false;
  const at = timestamp(now);
  item.archivedAt = null;
  item.updatedAt = at;
  return true;
}

export function deleteUniversityItem(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.universityItems, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = at;
  item.updatedAt = at;
  return true;
}

export function restoreUniversityItem(draft, id, { now = Date.now } = {}) {
  const item = findEntity(draft.data.universityItems, id);
  if (!item) return false;
  const at = timestamp(now);
  item.deletedAt = null;
  item.updatedAt = at;
  return true;
}

export function recordFocusSession(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const endedAt = input.endedAt || timestamp(now);
  const date = requiredDate(input.date || toLocalDateKey(endedAt), 'date');
  const minutes = boundedNumber(input.minutes ?? 1, 1, 1440, 'minutes');
  const kind = SESSION_KINDS.has(input.kind) ? input.kind : 'focus';
  const endedMs = new Date(endedAt).getTime();
  const startedAt = input.startedAt || new Date(endedMs - minutes * 60_000).toISOString();
  const id = input.id || idFactory();
  draft.data.focusSessions.push({
    ...base(id, endedAt),
    kind,
    moduleId: String(input.moduleId || '').trim() || null,
    date,
    durationSeconds: Math.round(minutes * 60),
    startedAt,
    endedAt,
    notes: String(input.notes || '')
  });
  return id;
}

export function setScreenTime(draft, date, minutes, { now = Date.now, idFactory = createId } = {}) {
  requiredDate(date, 'date');
  const safeMinutes = boundedNumber(minutes ?? 0, 0, 1440, 'minutes');
  const at = timestamp(now);
  const existing = draft.data.screenTimeEntries.find(entry => entry.date === date);
  if (existing) {
    existing.minutes = safeMinutes;
    existing.deletedAt = null;
    existing.updatedAt = at;
    return existing.id;
  }
  const id = idFactory();
  draft.data.screenTimeEntries.push({ ...base(id, at), date, minutes: safeMinutes });
  return id;
}

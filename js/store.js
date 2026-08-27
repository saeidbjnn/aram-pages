import {
  RECURRENCE_TYPES,
  RECURRENCE_UNITS,
  TASK_PRIORITIES,
  UNIVERSITY_STATUSES,
  UNIVERSITY_TYPES,
  clamp,
  differenceInDays,
  isValidDateKey,
  normalizeDigits,
  toLocalDateKey,
  weekdayIndex
} from './domain.js';
import {
  CUSTOM_MODULE_TYPES,
  MODULE_STATUSES,
  OPTIONAL_MODULE_DEFINITIONS,
  TODAY_VISIBILITIES,
  createDefaultModuleConfigs,
  getModuleDefinition,
  normalizeModuleIcon
} from './modules.js';

export const SCHEMA_VERSION = 5;
export const STORAGE_KEY = 'aram-planner-store-v5';
export const BACKUP_KEY = 'aram-planner-store-v5-backup';
export const V4_STORAGE_KEY = 'aram-planner-store-v4';
export const V4_BACKUP_KEY = 'aram-planner-store-v4-backup';
export const V3_STORAGE_KEY = 'aram-planner-store-v3';
export const V3_BACKUP_KEY = 'aram-planner-store-v3-backup';
export const MIGRATION_BACKUP_KEY = 'aram-planner-store-v4-migration-backup';
export const V3_MIGRATION_BACKUP_KEY = 'aram-planner-store-v3-migration-backup';
export const IMPORT_BACKUP_KEY = 'aram-planner-store-import-backup';
export const V2_STORAGE_KEY = 'aram-planner-store-v2';
export const V2_BACKUP_KEY = 'aram-planner-store-v2-backup';
export const LEGACY_KEY = 'aram-planner-state-v1';
export const MIGRATION_MARKER_KEY = 'aram-planner-migrated-to-v5';

const LEGACY_SAMPLES = {
  tasks: new Set(['مرور برنامه روز', 'کار عمیق روی پروژه', 'پاسخ به پیام‌های ضروری', 'مطالعه و یادداشت‌برداری', 'تمرین سبک']),
  habits: new Set(['مطالعه', 'آب کافی', 'پیاده‌روی']),
  books: new Set(['تفکر، سریع و کند', 'کار عمیق']),
  university: new Set(['فصل دوم پایان‌نامه', 'پروژه درس طراحی تعامل', 'مرور مقاله‌های پژوهش'])
};

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoNow(now = Date.now) {
  return new Date(now()).toISOString();
}

export function createDefaultTimerRuntime() {
  const durationSeconds = 25 * 60;
  return {
    mode: 'focus',
    phase: 'focus',
    status: 'idle',
    durationSeconds,
    durationSource: 'preset',
    remainingSeconds: durationSeconds,
    remainingMilliseconds: durationSeconds * 1000,
    startedAt: null,
    endsAt: null,
    sessionId: null
  };
}

export function createEmptyState({ now = Date.now, idFactory = createId, existingUser = false } = {}) {
  const timestamp = isoNow(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      storeId: idFactory(),
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    settings: {
      theme: 'system',
      autoContinue: false,
      timerNotifications: false,
      timerSound: 'calm',
      vibration: true,
      liveActivities: true,
      workPreset: { workMinutes: 50, breakMinutes: 10 },
      readingGoal: { minutes: 30, pages: 0 },
      currentBookId: null,
      modulePreferences: {
        onboardingStatus: existingUser ? 'completed' : 'pending',
        onboardingStep: 1,
        onboardingUseCase: null,
        onboardingSelections: [],
        showHiddenSearchResults: false,
        moduleIntroductionDismissed: false
      },
      moduleConfigs: createDefaultModuleConfigs({ existingUser })
    },
    data: {
      tasks: [],
      taskEntries: [],
      habits: [],
      habitEntries: [],
      notes: [],
      books: [],
      readingSessions: [],
      universityItems: [],
      focusSessions: [],
      screenTimeEntries: [],
      customModules: [],
      customModuleRecords: []
    },
    runtime: { timer: createDefaultTimerRuntime() }
  };
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validDateKey(value) {
  const normalized = normalizeDigits(value);
  return isValidDateKey(normalized) ? normalized : null;
}

function validTime(value, fallback = '12:00') {
  const match = /^(\d{2}):(\d{2})$/.exec(normalizeDigits(value));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${match[1]}:${match[2]}` : fallback;
}

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function baseEntity(entity, { now, idFactory }) {
  const timestamp = isoNow(now);
  return {
    id: text(entity?.id) || idFactory(),
    createdAt: validIso(entity?.createdAt) || timestamp,
    updatedAt: validIso(entity?.updatedAt) || timestamp,
    deletedAt: validIso(entity?.deletedAt)
  };
}

function sanitizeRecurrence(value, startDate) {
  const source = value && typeof value === 'object' ? value : {};
  const type = RECURRENCE_TYPES.includes(source.type) ? source.type : 'none';
  const unit = RECURRENCE_UNITS.includes(source.unit) ? source.unit : (
    type === 'weekly' ? 'week' : type === 'monthly' ? 'month' : 'day'
  );
  const weekdays = [...new Set(list(source.weekdays).map(Number)
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
  if ((type === 'weekly' || (type === 'custom' && unit === 'week')) && !weekdays.length && startDate) {
    weekdays.push(weekdayIndex(startDate));
  }
  const endDate = validDateKey(source.endDate);
  return {
    type,
    interval: type === 'custom' ? Math.round(clamp(source.interval ?? 1, 1, 365)) : 1,
    unit,
    weekdays,
    endDate: endDate && startDate && endDate >= startDate ? endDate : null
  };
}

function sanitizeTask(entity, context) {
  const base = baseEntity(entity, context);
  const title = text(entity?.title);
  const startDate = validDateKey(entity?.startDate || entity?.date);
  if (!title || !startDate) return null;
  let dueOffsetDays = Math.round(clamp(entity?.dueOffsetDays ?? 0, 0, 3650));
  const oldDueDate = validDateKey(entity?.dueDate);
  if (oldDueDate) {
    const difference = differenceInDays(startDate, oldDueDate);
    if (Number.isFinite(difference) && difference >= 0) dueOffsetDays = Math.min(3650, difference);
  }
  return {
    ...base,
    title,
    moduleId: text(entity?.moduleId) || null,
    startDate,
    dueOffsetDays,
    time: validTime(entity?.time),
    estimatedMinutes: Math.round(clamp(entity?.estimatedMinutes ?? entity?.durationMinutes ?? 30, 1, 1440)),
    priority: TASK_PRIORITIES.includes(entity?.priority) ? entity.priority : 'medium',
    category: text(entity?.category),
    notes: String(entity?.notes ?? ''),
    recurrence: sanitizeRecurrence(entity?.recurrence, startDate),
    archivedAt: validIso(entity?.archivedAt)
  };
}

function sanitizeTaskEntry(entity, context) {
  const base = baseEntity(entity, context);
  const taskId = text(entity?.taskId);
  const occurrenceDate = validDateKey(entity?.occurrenceDate || entity?.date);
  if (!taskId || !occurrenceDate) return null;
  const status = entity?.status === 'completed' || entity?.completed === true ? 'completed' : 'pending';
  return {
    ...base,
    taskId,
    occurrenceDate,
    status,
    completedAt: status === 'completed' ? (validIso(entity?.completedAt) || base.updatedAt) : null
  };
}

function sanitizeHabit(entity, context) {
  const base = baseEntity(entity, context);
  const title = text(entity?.title);
  if (!title) return null;
  const reminder = entity?.reminder && typeof entity.reminder === 'object' ? entity.reminder : {};
  return {
    ...base,
    title,
    archivedAt: validIso(entity?.archivedAt),
    reminder: {
      enabled: reminder.enabled === true,
      time: reminder.enabled ? validTime(reminder.time, '09:00') : (reminder.time ? validTime(reminder.time, '09:00') : null)
    }
  };
}

function sanitizeHabitEntry(entity, context) {
  const base = baseEntity(entity, context);
  const habitId = text(entity?.habitId);
  const date = validDateKey(entity?.date);
  if (!habitId || !date) return null;
  return {
    ...base,
    habitId,
    date,
    completed: entity?.completed !== false,
    completedAt: validIso(entity?.completedAt) || base.updatedAt
  };
}

function sanitizeNote(entity, context) {
  const base = baseEntity(entity, context);
  return { ...base, title: text(entity?.title, 'بدون عنوان') || 'بدون عنوان', body: String(entity?.body ?? '') };
}

function sanitizeBook(entity, context) {
  const base = baseEntity(entity, context);
  const title = text(entity?.title);
  if (!title) return null;
  const totalPages = Math.round(clamp(entity?.totalPages, 1, 100000));
  const currentPage = Math.round(clamp(entity?.currentPage, 0, totalPages));
  return {
    ...base,
    title,
    author: text(entity?.author),
    totalPages,
    currentPage,
    archivedAt: validIso(entity?.archivedAt),
    finishedAt: currentPage >= totalPages ? (validIso(entity?.finishedAt) || base.updatedAt) : validIso(entity?.finishedAt)
  };
}

function sanitizeReadingSession(entity, context) {
  const base = baseEntity(entity, context);
  const bookId = text(entity?.bookId);
  const endedAt = validIso(entity?.endedAt) || base.updatedAt;
  const date = validDateKey(entity?.date) || toLocalDateKey(endedAt);
  if (!bookId || !date) return null;
  const fromPage = Math.max(0, Math.round(Number(entity?.fromPage || 0)));
  const toPage = Math.max(fromPage, Math.round(Number(entity?.toPage || fromPage)));
  return {
    ...base,
    bookId,
    date,
    fromPage,
    toPage,
    pagesRead: Math.max(0, Math.round(Number(entity?.pagesRead ?? (toPage - fromPage)))),
    durationSeconds: Math.max(0, Math.round(Number(entity?.durationSeconds || 0))),
    startedAt: validIso(entity?.startedAt),
    endedAt,
    notes: String(entity?.notes ?? '')
  };
}

function sanitizeUniversity(entity, context) {
  const base = baseEntity(entity, context);
  const title = text(entity?.title);
  if (!title) return null;
  let status = UNIVERSITY_STATUSES.includes(entity?.status) ? entity.status : null;
  const progress = Math.round(clamp(entity?.progress, 0, 100));
  if (!status) status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';
  if (status === 'completed') status = 'completed';
  return {
    ...base,
    title,
    moduleId: text(entity?.moduleId) || null,
    type: UNIVERSITY_TYPES.includes(entity?.type) ? entity.type : 'assignment',
    deadline: validDateKey(entity?.deadline),
    progress: status === 'completed' ? 100 : progress,
    status,
    notes: String(entity?.notes ?? ''),
    priority: TASK_PRIORITIES.includes(entity?.priority) ? entity.priority : 'medium',
    estimatedHours: Math.round(clamp(entity?.estimatedHours ?? 1, 0, 10000) * 10) / 10,
    completedAt: status === 'completed' ? (validIso(entity?.completedAt) || base.updatedAt) : null,
    archivedAt: validIso(entity?.archivedAt)
  };
}

function sanitizeFocusSession(entity, context) {
  const base = baseEntity(entity, context);
  const kind = ['focus', 'work', 'break'].includes(entity?.kind) ? entity.kind : 'focus';
  const endedAt = validIso(entity?.endedAt) || base.updatedAt;
  return {
    ...base,
    kind,
    moduleId: text(entity?.moduleId) || null,
    date: validDateKey(entity?.date) || toLocalDateKey(endedAt),
    durationSeconds: Math.max(1, Math.round(Number(entity?.durationSeconds || 0))),
    startedAt: validIso(entity?.startedAt) || base.createdAt,
    endedAt,
    notes: String(entity?.notes ?? '')
  };
}

function sanitizeScreenTime(entity, context) {
  const base = baseEntity(entity, context);
  const date = validDateKey(entity?.date);
  if (!date) return null;
  return { ...base, date, minutes: Math.round(clamp(entity?.minutes, 0, 1440)) };
}


function sanitizeCustomModule(entity, context) {
  const base = baseEntity(entity, context);
  const name = text(entity?.name);
  const type = Object.values(CUSTOM_MODULE_TYPES).includes(entity?.type) ? entity.type : null;
  if (!name || !type) return null;
  const numericGoal = Number(normalizeDigits(entity?.goal?.value ?? entity?.goalValue ?? ''));
  return {
    ...base,
    name: name.slice(0, 80),
    icon: normalizeModuleIcon(entity?.icon),
    type,
    description: text(entity?.description).slice(0, 160),
    version: Math.max(1, Math.round(Number(entity?.version || 1))),
    goal: {
      value: Number.isFinite(numericGoal) && numericGoal >= 0 ? numericGoal : null,
      unit: text(entity?.goal?.unit ?? entity?.unit).slice(0, 30)
    },
    reminderReady: entity?.reminderReady === true,
    archivedAt: validIso(entity?.archivedAt)
  };
}

function sanitizeCustomModuleRecord(entity, context) {
  const base = baseEntity(entity, context);
  const moduleId = text(entity?.moduleId);
  if (!moduleId) return null;
  const rawValue = Number(normalizeDigits(entity?.value ?? ''));
  const rawDuration = Number(normalizeDigits(entity?.durationSeconds ?? 0));
  return {
    ...base,
    moduleId,
    recordType: ['value', 'completion', 'project', 'list_item', 'time_session'].includes(entity?.recordType)
      ? entity.recordType
      : 'value',
    title: text(entity?.title).slice(0, 160),
    date: validDateKey(entity?.date),
    value: Number.isFinite(rawValue) ? rawValue : null,
    unit: text(entity?.unit).slice(0, 30),
    durationSeconds: Number.isFinite(rawDuration) ? Math.max(0, Math.round(rawDuration)) : 0,
    completed: entity?.completed === true,
    deadline: validDateKey(entity?.deadline),
    progress: Math.round(clamp(entity?.progress ?? 0, 0, 100)),
    status: ['not_started', 'in_progress', 'completed'].includes(entity?.status) ? entity.status : (entity?.completed ? 'completed' : 'not_started'),
    notes: String(entity?.notes ?? ''),
    completedAt: entity?.completed === true || entity?.status === 'completed' ? (validIso(entity?.completedAt) || base.updatedAt) : null
  };
}

function sanitizeModuleConfig(config, context, fallbackOrder = 0) {
  const moduleId = text(config?.moduleId);
  if (!moduleId) return null;
  return {
    moduleId,
    status: MODULE_STATUSES.includes(config?.status) ? config.status : 'available',
    order: Math.max(0, Math.round(Number(config?.order ?? fallbackOrder))),
    pinned: config?.pinned === true,
    todayVisibility: TODAY_VISIBILITIES.includes(config?.todayVisibility) ? config.todayVisibility : 'hidden',
    version: Math.max(1, Math.round(Number(config?.version || 1))),
    updatedAt: validIso(config?.updatedAt) || isoNow(context.now)
  };
}

function normalizeModuleConfigs(sourceConfigs, customModules, context, { existingUser = false } = {}) {
  const defaults = createDefaultModuleConfigs({ existingUser });
  const customDefaults = customModules.map((module, index) => ({
    moduleId: module.id,
    status: module.archivedAt ? 'archived' : 'active',
    order: defaults.length + index,
    pinned: false,
    todayVisibility: 'hidden',
    version: module.version || 1,
    updatedAt: module.updatedAt
  }));
  const allDefaults = [...defaults, ...customDefaults];
  const sanitized = dedupeBy(list(sourceConfigs).map((config, index) => sanitizeModuleConfig(config, context, index)), item => item.moduleId);
  const map = new Map(sanitized.map(config => [config.moduleId, config]));
  for (const fallback of allDefaults) {
    if (!map.has(fallback.moduleId)) map.set(fallback.moduleId, sanitizeModuleConfig(fallback, context, fallback.order));
  }
  return [...map.values()].sort((left, right) => left.order - right.order || left.moduleId.localeCompare(right.moduleId));
}

function sanitizeTimer(timer, settings = {}) {
  const fallback = createDefaultTimerRuntime();
  const mode = timer?.mode === 'workbreak' ? 'workbreak' : 'focus';
  const phase = mode === 'focus' ? 'focus' : (timer?.phase === 'break' ? 'break' : 'work');
  const durationSeconds = Math.max(1, Math.round(Number(timer?.durationSeconds || fallback.durationSeconds)));
  const durationMilliseconds = durationSeconds * 1000;
  const remainingMilliseconds = Math.round(clamp(
    timer?.remainingMilliseconds ?? Number(timer?.remainingSeconds ?? durationSeconds) * 1000,
    0,
    durationMilliseconds
  ));
  const requestedStatus = ['idle', 'running', 'paused'].includes(timer?.status) ? timer.status : 'idle';
  const validEnd = requestedStatus === 'running' ? validIso(timer?.endsAt) : null;
  const status = requestedStatus === 'running' && !validEnd ? 'paused' : requestedStatus;
  const configuredMinutes = phase === 'break'
    ? Number(settings?.workPreset?.breakMinutes ?? 10)
    : Number(settings?.workPreset?.workMinutes ?? 50);
  const configuredDurationSeconds = Math.max(60, Math.round(configuredMinutes * 60));
  const durationSource = timer?.durationSource === 'custom'
    || (!timer?.durationSource && mode === 'workbreak' && durationSeconds !== configuredDurationSeconds)
    ? 'custom'
    : 'preset';
  return {
    mode,
    phase,
    status,
    durationSeconds,
    durationSource,
    remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
    remainingMilliseconds,
    startedAt: status === 'idle' ? null : validIso(timer?.startedAt),
    endsAt: status === 'running' ? validEnd : null,
    sessionId: status === 'idle' ? null : (text(timer?.sessionId) || null)
  };
}

function dedupeBy(items, keySelector) {
  const map = new Map();
  for (const item of items.filter(Boolean)) {
    const key = keySelector(item);
    const previous = map.get(key);
    if (!previous || String(item.updatedAt) >= String(previous.updatedAt)) map.set(key, item);
  }
  return [...map.values()];
}

export function normalizeState(input, { now = Date.now, idFactory = createId } = {}) {
  const fallback = createEmptyState({ now, idFactory });
  const context = { now, idFactory };
  const source = input && typeof input === 'object' ? input : fallback;
  const sourceData = source.data && typeof source.data === 'object' ? source.data : {};
  const sourceSettings = source.settings && typeof source.settings === 'object' ? source.settings : {};

  const tasks = dedupeBy(list(sourceData.tasks).map(item => sanitizeTask(item, context)), item => item.id);
  const taskEntries = dedupeBy(list(sourceData.taskEntries).map(item => sanitizeTaskEntry(item, context)), item => `${item.taskId}:${item.occurrenceDate}`);
  const habits = dedupeBy(list(sourceData.habits).map(item => sanitizeHabit(item, context)), item => item.id);
  const habitById = new Map(habits.map(habit => [habit.id, habit]));
  const today = toLocalDateKey(isoNow(now));
  const habitEntries = dedupeBy(list(sourceData.habitEntries).map(item => sanitizeHabitEntry(item, context)), item => `${item.habitId}:${item.date}`)
    .filter(entry => {
      const habit = habitById.get(entry.habitId);
      if (!habit || entry.date > today) return false;
      const createdDate = toLocalDateKey(habit.createdAt);
      const lifecycleEnd = [habit.archivedAt, habit.deletedAt]
        .map(value => value ? toLocalDateKey(value) : '')
        .filter(Boolean)
        .sort()[0];
      return (!createdDate || entry.date >= createdDate) && (!lifecycleEnd || entry.date < lifecycleEnd);
    });
  const books = dedupeBy(list(sourceData.books).map(item => sanitizeBook(item, context)), item => item.id);
  const currentBookId = text(sourceSettings.currentBookId) || null;
  const validCurrentBook = currentBookId && books.some(book => book.id === currentBookId && !book.deletedAt && !book.archivedAt) ? currentBookId : null;
  const customModules = dedupeBy(list(sourceData.customModules).map(item => sanitizeCustomModule(item, context)), item => item.id);
  const customModuleIds = new Set(customModules.map(module => module.id));
  const customModuleRecords = dedupeBy(
    list(sourceData.customModuleRecords).map(item => sanitizeCustomModuleRecord(item, context)),
    item => item.id
  ).filter(record => customModuleIds.has(record.moduleId));
  const sourcePreferences = sourceSettings.modulePreferences && typeof sourceSettings.modulePreferences === 'object'
    ? sourceSettings.modulePreferences
    : {};
  const explicitOnboardingStatus = ['pending', 'completed', 'skipped'].includes(sourcePreferences.onboardingStatus)
    ? sourcePreferences.onboardingStatus
    : null;
  const hasStoredRecords = [
    tasks, taskEntries, habits, habitEntries, books, customModules, customModuleRecords,
    sourceData.notes, sourceData.readingSessions, sourceData.universityItems,
    sourceData.focusSessions, sourceData.screenTimeEntries
  ].some(collection => Array.isArray(collection) && collection.length > 0);
  const fromPriorSchema = Number(source.schemaVersion || 0) > 0 && Number(source.schemaVersion) < SCHEMA_VERSION;
  const existingUser = explicitOnboardingStatus === 'completed'
    || explicitOnboardingStatus === 'skipped'
    || (!explicitOnboardingStatus && (fromPriorSchema || hasStoredRecords));
  const moduleConfigs = normalizeModuleConfigs(sourceSettings.moduleConfigs, customModules, context, { existingUser });

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      storeId: text(source.meta?.storeId) || fallback.meta.storeId,
      revision: Math.max(0, Math.round(Number(source.meta?.revision || 0))),
      createdAt: validIso(source.meta?.createdAt) || fallback.meta.createdAt,
      updatedAt: validIso(source.meta?.updatedAt) || fallback.meta.updatedAt
    },
    settings: {
      theme: ['system', 'light', 'dark'].includes(sourceSettings.theme) ? sourceSettings.theme : 'system',
      autoContinue: typeof sourceSettings.autoContinue === 'boolean'
        ? sourceSettings.autoContinue
        : fallback.settings.autoContinue,
      timerNotifications: sourceSettings.timerNotifications === true,
      timerSound: ['calm', 'soft-bell', 'chime', 'minimal', 'system', 'none'].includes(sourceSettings.timerSound)
        ? sourceSettings.timerSound
        : (sourceSettings.sound === false ? 'none' : fallback.settings.timerSound),
      vibration: sourceSettings.vibration !== false,
      liveActivities: sourceSettings.liveActivities !== false,
      workPreset: {
        workMinutes: Math.round(clamp(sourceSettings.workPreset?.workMinutes ?? fallback.settings.workPreset.workMinutes, 1, 360)),
        breakMinutes: Math.round(clamp(sourceSettings.workPreset?.breakMinutes ?? fallback.settings.workPreset.breakMinutes, 1, 120))
      },
      readingGoal: {
        minutes: Math.round(clamp(sourceSettings.readingGoal?.minutes ?? fallback.settings.readingGoal.minutes, 0, 1440)),
        pages: Math.round(clamp(sourceSettings.readingGoal?.pages ?? fallback.settings.readingGoal.pages, 0, 10000))
      },
      currentBookId: validCurrentBook,
      modulePreferences: {
        onboardingStatus: explicitOnboardingStatus
          || (existingUser ? 'completed' : fallback.settings.modulePreferences.onboardingStatus),
        onboardingStep: Math.round(clamp(sourcePreferences.onboardingStep ?? 1, 1, 4)),
        onboardingUseCase: ['daily', 'focus', 'university', 'work', 'reading', 'habits', 'mixed'].includes(sourcePreferences.onboardingUseCase)
          ? sourcePreferences.onboardingUseCase
          : null,
        onboardingSelections: [...new Set(list(sourcePreferences.onboardingSelections).map(text).filter(Boolean))],
        showHiddenSearchResults: sourcePreferences.showHiddenSearchResults === true,
        moduleIntroductionDismissed: sourcePreferences.moduleIntroductionDismissed === true
      },
      moduleConfigs
    },
    data: {
      tasks,
      taskEntries,
      habits,
      habitEntries,
      notes: dedupeBy(list(sourceData.notes).map(item => sanitizeNote(item, context)), item => item.id),
      books,
      readingSessions: dedupeBy(list(sourceData.readingSessions).map(item => sanitizeReadingSession(item, context)), item => item.id),
      universityItems: dedupeBy(list(sourceData.universityItems).map(item => sanitizeUniversity(item, context)), item => item.id),
      focusSessions: dedupeBy(list(sourceData.focusSessions).map(item => sanitizeFocusSession(item, context)), item => item.id),
      screenTimeEntries: dedupeBy(list(sourceData.screenTimeEntries).map(item => sanitizeScreenTime(item, context)), item => item.date),
      customModules,
      customModuleRecords
    },
    runtime: { timer: sanitizeTimer(source.runtime?.timer, sourceSettings) }
  };
}

function checksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function encode(state) {
  const payload = JSON.stringify(state);
  return JSON.stringify({ version: 2, checksum: checksum(payload), payload });
}

function decode(raw) {
  if (!raw) return null;
  const envelope = JSON.parse(raw);
  if (!envelope || typeof envelope.payload !== 'string' || checksum(envelope.payload) !== envelope.checksum) throw new Error('Invalid storage envelope');
  return JSON.parse(envelope.payload);
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function safeStorage(storage, onError = () => {}) {
  if (!storage) return { storage: memoryStorage(), persistent: false };
  try {
    const probe = `aram-probe-${Math.random()}`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return { storage, persistent: true };
  } catch (error) {
    try { onError(error, { operation: 'storage_probe' }); } catch {}
    return { storage: memoryStorage(), persistent: false };
  }
}

function legacyTaskState(task, taskId, timestamp, idFactory) {
  if (task?.status !== 'completed' && task?.status !== 'done') return null;
  const occurrenceDate = validDateKey(task.startDate || task.date) || toLocalDateKey(timestamp);
  return {
    id: idFactory(),
    taskId,
    occurrenceDate,
    status: 'completed',
    completedAt: validIso(task.completedAt) || timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null
  };
}


export function migrateV4(input, { now = Date.now, idFactory = createId } = {}) {
  const source = input && typeof input === 'object' ? structuredClone(input) : {};
  return normalizeState(source, { now, idFactory });
}

export function migrateV3(input, { now = Date.now, idFactory = createId } = {}) {
  const source = input && typeof input === 'object' ? structuredClone(input) : {};
  const state = createEmptyState({ now, idFactory, existingUser: true });
  state.meta.storeId = text(source.meta?.storeId) || state.meta.storeId;
  state.meta.revision = Math.max(0, Math.round(Number(source.meta?.revision || 0)));
  state.meta.createdAt = validIso(source.meta?.createdAt) || state.meta.createdAt;
  state.meta.updatedAt = validIso(source.meta?.updatedAt) || state.meta.updatedAt;
  state.settings = {
    ...state.settings,
    ...(source.settings || {}),
    modulePreferences: {
      ...state.settings.modulePreferences,
      onboardingStatus: 'completed',
      onboardingStep: 4,
      moduleIntroductionDismissed: false
    },
    moduleConfigs: createDefaultModuleConfigs({ existingUser: true })
  };
  state.data = {
    ...state.data,
    ...(source.data || {}),
    customModules: [],
    customModuleRecords: []
  };
  state.runtime = source.runtime || state.runtime;
  return normalizeState(state, { now, idFactory });
}

export function migrateV2(input, { now = Date.now, idFactory = createId } = {}) {
  const timestamp = isoNow(now);
  const state = createEmptyState({ now, idFactory, existingUser: true });
  const source = input && typeof input === 'object' ? input : {};
  state.meta.storeId = text(source.meta?.storeId) || state.meta.storeId;
  state.meta.createdAt = validIso(source.meta?.createdAt) || state.meta.createdAt;
  state.settings = { ...state.settings, ...(source.settings || {}) };
  const sourceData = source.data || {};

  for (const oldTask of list(sourceData.tasks)) {
    const taskId = text(oldTask.id) || idFactory();
    state.data.tasks.push({
      ...oldTask,
      id: taskId,
      startDate: oldTask.startDate || oldTask.date,
      estimatedMinutes: oldTask.estimatedMinutes || oldTask.durationMinutes,
      priority: oldTask.priority || 'medium',
      recurrence: oldTask.recurrence || { type: 'none' },
      archivedAt: oldTask.archivedAt || null
    });
    const entry = legacyTaskState(oldTask, taskId, timestamp, idFactory);
    if (entry) state.data.taskEntries.push(entry);
  }

  state.data.habits = list(sourceData.habits);
  state.data.habitEntries = list(sourceData.habitEntries);
  state.data.notes = list(sourceData.notes);
  state.data.books = list(sourceData.books);
  state.data.readingSessions = list(sourceData.readingSessions);
  state.data.universityItems = list(sourceData.universityItems);
  state.data.focusSessions = list(sourceData.focusSessions);
  state.data.screenTimeEntries = list(sourceData.screenTimeEntries);
  state.runtime = source.runtime || state.runtime;
  return normalizeState(state, { now, idFactory });
}

export function migrateLegacy(legacy, { now = Date.now, idFactory = createId } = {}) {
  const timestamp = isoNow(now);
  const today = toLocalDateKey(timestamp);
  const state = createEmptyState({ now, idFactory, existingUser: true });

  for (const item of list(legacy?.schedule)) {
    const title = text(item.title);
    if (!title || LEGACY_SAMPLES.tasks.has(title)) continue;
    const taskId = text(item.id) || idFactory();
    state.data.tasks.push({
      id: taskId,
      title,
      startDate: validDateKey(item.date) || today,
      dueOffsetDays: 0,
      time: validTime(item.time),
      estimatedMinutes: Math.round(clamp(item.duration, 1, 1440)),
      priority: 'medium',
      category: '',
      notes: '',
      recurrence: { type: 'none', interval: 1, unit: 'day', weekdays: [], endDate: null },
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    });
    const entry = legacyTaskState(item, taskId, timestamp, idFactory);
    if (entry) state.data.taskEntries.push(entry);
  }

  for (const item of list(legacy?.habits)) {
    const title = text(item.title);
    if (!title || LEGACY_SAMPLES.habits.has(title)) continue;
    const habitId = text(item.id) || idFactory();
    state.data.habits.push({ id: habitId, title, archivedAt: null, reminder: { enabled: false, time: null }, createdAt: timestamp, updatedAt: timestamp, deletedAt: null });
    if (item.done === true) state.data.habitEntries.push({ id: idFactory(), habitId, date: today, completed: true, completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, deletedAt: null });
  }

  for (const item of list(legacy?.notes)) {
    const isSample = text(item.title) === 'ایده‌های هفته' && String(item.text || '').includes('سه اولویت اصلی');
    if (isSample) continue;
    state.data.notes.push({ id: text(item.id) || idFactory(), title: text(item.title, 'بدون عنوان') || 'بدون عنوان', body: String(item.text || ''), createdAt: validIso(item.updated) || timestamp, updatedAt: validIso(item.updated) || timestamp, deletedAt: null });
  }

  for (const item of list(legacy?.books)) {
    if (!text(item.title) || LEGACY_SAMPLES.books.has(text(item.title))) continue;
    state.data.books.push({ id: text(item.id) || idFactory(), title: text(item.title), author: '', totalPages: Math.round(clamp(item.pages, 1, 100000)), currentPage: Math.round(clamp(item.read, 0, item.pages || 1)), archivedAt: null, finishedAt: null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null });
  }

  for (const item of list(legacy?.university)) {
    if (!text(item.title) || LEGACY_SAMPLES.university.has(text(item.title))) continue;
    const progress = Math.round(clamp(item.progress, 0, 100));
    state.data.universityItems.push({
      id: text(item.id) || idFactory(), title: text(item.title), type: 'assignment', deadline: validDateKey(item.deadline), progress,
      status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started', notes: '', priority: 'medium', estimatedHours: 1,
      completedAt: progress >= 100 ? timestamp : null, archivedAt: null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null
    });
  }

  return normalizeState(state, { now, idFactory });
}


export function prepareImportedState(input, { now = Date.now, idFactory = createId } = {}) {
  let parsed = input;
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('فایل پشتیبان معتبر نیست');
  const source = parsed.format === 'aram-backup' ? parsed.state : parsed;
  if (!source || typeof source !== 'object') throw new Error('داده برنامه در فایل پیدا نشد');
  const version = Number(source.schemaVersion || parsed.schemaVersion || 0);
  if (version > SCHEMA_VERSION) throw new Error('این فایل با نسخه جدیدتری از آرام ساخته شده است');
  if (version === SCHEMA_VERSION) return normalizeState(source, { now, idFactory });
  if (version === 4) return migrateV4(source, { now, idFactory });
  if (version === 3) return migrateV3(source, { now, idFactory });
  if (version === 2) return migrateV2(source, { now, idFactory });
  if (version === 1 || (!version && (source.schedule || source.habits || source.books))) return migrateLegacy(source, { now, idFactory });
  throw new Error('نسخه فایل پشتیبان شناخته‌شده نیست');
}

export function createStore({ storage = globalThis.localStorage, now = Date.now, idFactory = createId, onError = () => {}, eventTarget = globalThis } = {}) {
  const reportError = (error, context = {}) => { try { onError(error, context); } catch {} };
  const resolved = safeStorage(storage, reportError);
  let state;
  let recovery = 'empty';
  let migrationError = null;
  let pendingMigrationSource = null;
  let pendingMigrationVersion = null;
  const listeners = new Set();

  const tryDecode = key => {
    try { return decode(resolved.storage.getItem(key)); } catch (error) {
      reportError(error, { operation: 'storage_decode', key });
      return null;
    }
  };

  const primary = tryDecode(STORAGE_KEY);
  const backup = primary ? null : tryDecode(BACKUP_KEY);
  if (primary) {
    state = normalizeState(primary, { now, idFactory });
    recovery = 'primary';
  } else if (backup) {
    state = normalizeState(backup, { now, idFactory });
    recovery = 'backup';
  } else {
    const v4Key = resolved.storage.getItem(V4_STORAGE_KEY) ? V4_STORAGE_KEY : V4_BACKUP_KEY;
    const v4Raw = resolved.storage.getItem(v4Key);
    const v4 = tryDecode(v4Key);
    if (v4) {
      pendingMigrationSource = v4;
      pendingMigrationVersion = 4;
      try {
        if (v4Raw) resolved.storage.setItem(MIGRATION_BACKUP_KEY, v4Raw);
        state = migrateV4(v4, { now, idFactory });
        recovery = 'v4';
        pendingMigrationSource = null;
        pendingMigrationVersion = null;
      } catch (error) {
        migrationError = error;
        reportError(error, { operation: 'migration_v4_to_v5' });
        state = createEmptyState({ now, idFactory, existingUser: true });
        recovery = 'migration_error';
      }
    } else {
      const v3Key = resolved.storage.getItem(V3_STORAGE_KEY) ? V3_STORAGE_KEY : V3_BACKUP_KEY;
      const v3Raw = resolved.storage.getItem(v3Key);
      const v3 = tryDecode(v3Key);
      if (v3) {
        pendingMigrationSource = v3;
        pendingMigrationVersion = 3;
        try {
          if (v3Raw) resolved.storage.setItem(V3_MIGRATION_BACKUP_KEY, v3Raw);
          state = migrateV3(v3, { now, idFactory });
          recovery = 'v3';
          pendingMigrationSource = null;
          pendingMigrationVersion = null;
        } catch (error) {
          migrationError = error;
          reportError(error, { operation: 'migration_v3_to_v5' });
          state = createEmptyState({ now, idFactory, existingUser: true });
          recovery = 'migration_error';
        }
      } else {
        const v2 = tryDecode(V2_STORAGE_KEY) || tryDecode(V2_BACKUP_KEY);
        if (v2) {
          state = migrateV2(v2, { now, idFactory });
          recovery = 'v2';
        } else {
          let legacy = null;
          try { legacy = JSON.parse(resolved.storage.getItem(LEGACY_KEY) || 'null'); } catch (error) { reportError(error, { operation: 'legacy_decode', key: LEGACY_KEY }); legacy = null; }
          state = legacy ? migrateLegacy(legacy, { now, idFactory }) : createEmptyState({ now, idFactory });
          recovery = legacy ? 'legacy' : 'empty';
        }
      }
    }
  }

  function notify() {
    for (const listener of listeners) {
      try { listener(state); } catch (error) { reportError(error, { operation: 'store_listener' }); }
    }
  }

  function persist(candidate, { preservePrevious = true } = {}) {
    const normalized = normalizeState(candidate, { now, idFactory });
    const timestamp = isoNow(now);
    try {
      const persisted = decode(resolved.storage.getItem(STORAGE_KEY));
      const persistedRevision = Number(persisted?.meta?.revision || 0);
      const localRevision = Number(state?.meta?.revision || 0);
      if (persisted && persistedRevision > localRevision) {
        state = normalizeState(persisted, { now, idFactory });
        const error = new Error('A newer store revision exists in another context');
        reportError(error, { operation: 'storage_conflict', persistedRevision, localRevision });
        notify();
        return { ok: false, state, error, conflict: true };
      }
    } catch (error) {
      reportError(error, { operation: 'storage_conflict_check' });
    }
    normalized.meta.revision = Math.max(state?.meta?.revision || 0, normalized.meta.revision || 0) + 1;
    normalized.meta.updatedAt = timestamp;
    const encoded = encode(normalized);
    try {
      if (preservePrevious && state) resolved.storage.setItem(BACKUP_KEY, encode(state));
      resolved.storage.setItem(STORAGE_KEY, encoded);
      state = normalized;
      try { resolved.storage.setItem(BACKUP_KEY, encoded); } catch {}
      if (['v4', 'v3', 'v2', 'legacy'].includes(recovery)) {
        try { resolved.storage.setItem(MIGRATION_MARKER_KEY, timestamp); } catch {}
      }
      notify();
      return { ok: true, state };
    } catch (error) {
      reportError(error, { operation: 'storage_write', revision: normalized.meta.revision });
      return { ok: false, state, error };
    }
  }

  if (recovery !== 'primary' && recovery !== 'migration_error') persist(state, { preservePrevious: false });

  const handleExternalStorage = event => {
    if (!event || event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = decode(event.newValue);
      if (!incoming) return;
      const incomingRevision = Number(incoming.meta?.revision || 0);
      const localRevision = Number(state.meta?.revision || 0);
      if (incomingRevision <= localRevision) return;
      state = normalizeState(incoming, { now, idFactory });
      notify();
    } catch (error) {
      reportError(error, { operation: 'storage_external_sync' });
    }
  };
  eventTarget?.addEventListener?.('storage', handleExternalStorage);

  return {
    getState: () => state,
    isPersistent: resolved.persistent,
    get recovery() { return recovery; },
    get migrationError() { return migrationError; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commit(mutator) {
      const draft = structuredClone(state);
      try {
        mutator(draft);
      } catch (error) {
        reportError(error, { operation: 'store_mutator' });
        return { ok: false, state, error };
      }
      return persist(draft);
    },
    replace(nextState) {
      return persist(nextState);
    },
    importData(value) {
      try {
        const candidate = prepareImportedState(value, { now, idFactory });
        try { resolved.storage.setItem(IMPORT_BACKUP_KEY, encode(state)); } catch (error) { reportError(error, { operation: 'import_backup' }); }
        return persist(candidate, { preservePrevious: true });
      } catch (error) {
        reportError(error, { operation: 'import_validate' });
        return { ok: false, state, error };
      }
    },
    retryMigration() {
      if (!pendingMigrationSource) return { ok: false, state, error: migrationError || new Error('No pending migration') };
      try {
        const candidate = pendingMigrationVersion === 4
          ? migrateV4(pendingMigrationSource, { now, idFactory })
          : migrateV3(pendingMigrationSource, { now, idFactory });
        const result = persist(candidate, { preservePrevious: false });
        if (result.ok) {
          recovery = pendingMigrationVersion === 4 ? 'v4' : 'v3';
          migrationError = null;
          pendingMigrationSource = null;
          pendingMigrationVersion = null;
        }
        return result;
      } catch (error) {
        migrationError = error;
        reportError(error, { operation: 'migration_retry', sourceVersion: pendingMigrationVersion });
        return { ok: false, state, error };
      }
    },
    reset() {
      return persist(createEmptyState({ now, idFactory }), { preservePrevious: true });
    },
    exportData({ appVersion = null } = {}) {
      return {
        format: 'aram-backup',
        appVersion,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: isoNow(now),
        state: structuredClone(state)
      };
    },
    destroy() {
      eventTarget?.removeEventListener?.('storage', handleExternalStorage);
      listeners.clear();
    }
  };
}

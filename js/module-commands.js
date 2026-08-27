import { isValidDateKey, normalizeDigits, toLocalDateKey } from './domain.js';
import { createId } from './store.js';
import {
  CUSTOM_MODULE_TYPES,
  MODULE_STATUS,
  MODULE_STATUSES,
  OPTIONAL_MODULE_DEFINITIONS,
  TODAY_VISIBILITIES,
  getModuleDefinition,
  moduleConfigFor,
  normalizeModuleIcon
} from './modules.js';

function at(now = Date.now) {
  return new Date(now()).toISOString();
}

function requiredText(value, label = 'value') {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function numeric(value, { min = 0, max = Number.MAX_SAFE_INTEGER, nullable = false } = {}) {
  if ((value === '' || value === null || value === undefined) && nullable) return null;
  const parsed = Number(normalizeDigits(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error('numeric value is invalid');
  return parsed;
}

function dateKey(value, { nullable = false } = {}) {
  const normalized = normalizeDigits(value || '');
  if (!normalized && nullable) return null;
  if (!isValidDateKey(normalized)) throw new Error('date is invalid');
  return normalized;
}

function configs(draft) {
  return draft.settings.moduleConfigs || (draft.settings.moduleConfigs = []);
}

function ensureConfig(draft, moduleId, { now = Date.now } = {}) {
  let config = moduleConfigFor(draft, moduleId);
  if (config) return config;
  const definition = getModuleDefinition(moduleId, draft.data.customModules || []);
  if (!definition) throw new Error('Module not found');
  const maxOrder = configs(draft).reduce((max, item) => Math.max(max, Number(item.order || 0)), -1);
  config = {
    moduleId,
    status: MODULE_STATUS.AVAILABLE,
    order: maxOrder + 1,
    pinned: false,
    todayVisibility: 'hidden',
    version: definition.version || 1,
    updatedAt: at(now)
  };
  configs(draft).push(config);
  return config;
}

function setStatus(draft, moduleId, status, { now = Date.now } = {}) {
  if (!MODULE_STATUSES.includes(status)) throw new Error('Invalid module status');
  const config = ensureConfig(draft, moduleId, { now });
  config.status = status;
  if (status !== MODULE_STATUS.ACTIVE) {
    config.pinned = false;
    config.todayVisibility = 'hidden';
  }
  config.updatedAt = at(now);
  const custom = (draft.data.customModules || []).find(item => item.id === moduleId);
  if (custom) {
    custom.archivedAt = status === MODULE_STATUS.ARCHIVED ? config.updatedAt : null;
    custom.updatedAt = config.updatedAt;
  }
  return config;
}

export function activateModule(draft, moduleId, options = {}) {
  return setStatus(draft, moduleId, MODULE_STATUS.ACTIVE, options);
}

export function hideModule(draft, moduleId, options = {}) {
  const current = ensureConfig(draft, moduleId, options);
  if (![MODULE_STATUS.ACTIVE, MODULE_STATUS.HIDDEN].includes(current.status)) throw new Error('Only active modules can be hidden');
  return setStatus(draft, moduleId, MODULE_STATUS.HIDDEN, options);
}

export function restoreHiddenModule(draft, moduleId, options = {}) {
  const current = ensureConfig(draft, moduleId, options);
  if (current.status !== MODULE_STATUS.HIDDEN) throw new Error('Module is not hidden');
  return setStatus(draft, moduleId, MODULE_STATUS.ACTIVE, options);
}

export function deactivateModule(draft, moduleId, options = {}) {
  return setStatus(draft, moduleId, MODULE_STATUS.AVAILABLE, options);
}

export function archiveModule(draft, moduleId, options = {}) {
  return setStatus(draft, moduleId, MODULE_STATUS.ARCHIVED, options);
}

export function reactivateModule(draft, moduleId, options = {}) {
  return setStatus(draft, moduleId, MODULE_STATUS.ACTIVE, options);
}

export function setModulePinned(draft, moduleId, pinned, { now = Date.now } = {}) {
  const config = ensureConfig(draft, moduleId, { now });
  if (config.status !== MODULE_STATUS.ACTIVE && pinned) throw new Error('Only active modules can be pinned');
  config.pinned = Boolean(pinned);
  config.updatedAt = at(now);
  return config;
}

export function setModuleTodayVisibility(draft, moduleId, visibility, { now = Date.now } = {}) {
  if (!TODAY_VISIBILITIES.includes(visibility)) throw new Error('Invalid Today visibility');
  const config = ensureConfig(draft, moduleId, { now });
  if (config.status !== MODULE_STATUS.ACTIVE && visibility !== 'hidden') throw new Error('Only active modules can appear on Today');
  config.todayVisibility = visibility;
  config.updatedAt = at(now);
  return config;
}

export function moveModule(draft, moduleId, direction, { now = Date.now } = {}) {
  const ordered = configs(draft)
    .filter(config => config.status === MODULE_STATUS.ACTIVE)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const index = ordered.findIndex(config => config.moduleId === moduleId);
  const targetIndex = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return false;
  const current = ordered[index];
  const target = ordered[targetIndex];
  const currentOrder = current.order;
  current.order = target.order;
  target.order = currentOrder;
  current.updatedAt = at(now);
  target.updatedAt = current.updatedAt;
  return true;
}

export function setHiddenSearchPreference(draft, enabled) {
  draft.settings.modulePreferences.showHiddenSearchResults = Boolean(enabled);
}

export function saveOnboardingProgress(draft, { step, selections, useCase } = {}) {
  const preferences = draft.settings.modulePreferences;
  preferences.onboardingStep = Math.min(4, Math.max(1, Math.round(Number(step || preferences.onboardingStep || 1))));
  if (Array.isArray(selections)) preferences.onboardingSelections = [...new Set(selections.filter(id => OPTIONAL_MODULE_DEFINITIONS.some(definition => definition.id === id)))];
  if (useCase !== undefined) preferences.onboardingUseCase = useCase || null;
}

export function finishOnboarding(draft, { selections = [], useCase = null, skipped = false } = {}, { now = Date.now } = {}) {
  const selected = new Set(selections.filter(id => OPTIONAL_MODULE_DEFINITIONS.some(definition => definition.id === id)));
  const stamp = at(now);
  for (const definition of OPTIONAL_MODULE_DEFINITIONS) {
    const config = ensureConfig(draft, definition.id, { now });
    config.status = selected.has(definition.id) ? MODULE_STATUS.ACTIVE : MODULE_STATUS.AVAILABLE;
    config.pinned = selected.has(definition.id);
    config.todayVisibility = selected.has(definition.id) && ['reading', 'university', 'work', 'projects'].includes(definition.id)
      ? 'summary'
      : 'hidden';
    config.updatedAt = stamp;
  }
  draft.settings.modulePreferences = {
    ...draft.settings.modulePreferences,
    onboardingStatus: skipped ? 'skipped' : 'completed',
    onboardingStep: 4,
    onboardingSelections: [...selected],
    onboardingUseCase: useCase || null,
    moduleIntroductionDismissed: true
  };
}

export function dismissModuleIntroduction(draft) {
  draft.settings.modulePreferences.moduleIntroductionDismissed = true;
}

export function saveCustomModule(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const stamp = at(now);
  const type = Object.values(CUSTOM_MODULE_TYPES).includes(input.type) ? input.type : null;
  if (!type) throw new Error('Module type is invalid');
  const name = requiredText(input.name, 'name').slice(0, 80);
  const goalValue = numeric(input.goalValue, { min: 0, max: 1_000_000_000, nullable: true });
  const payload = {
    name,
    icon: normalizeModuleIcon(input.icon),
    type,
    description: String(input.description || '').trim().slice(0, 160),
    version: 1,
    goal: { value: goalValue, unit: String(input.unit || '').trim().slice(0, 30) },
    reminderReady: input.reminderReady === true
  };
  const existing = input.id ? (draft.data.customModules || []).find(item => item.id === input.id) : null;
  if (existing) {
    Object.assign(existing, payload, { updatedAt: stamp, deletedAt: null });
    ensureConfig(draft, existing.id, { now }).updatedAt = stamp;
    return existing.id;
  }
  const id = input.id || `custom-${idFactory()}`;
  draft.data.customModules.push({ id, ...payload, createdAt: stamp, updatedAt: stamp, deletedAt: null, archivedAt: null });
  const maxOrder = configs(draft).reduce((max, config) => Math.max(max, Number(config.order || 0)), -1);
  configs(draft).push({
    moduleId: id,
    status: MODULE_STATUS.ACTIVE,
    order: maxOrder + 1,
    pinned: false,
    todayVisibility: input.todayVisibility === 'summary' ? 'summary' : 'hidden',
    version: 1,
    updatedAt: stamp
  });
  return id;
}

export function saveCustomModuleRecord(draft, input, { now = Date.now, idFactory = createId } = {}) {
  const module = (draft.data.customModules || []).find(item => item.id === input.moduleId && !item.deletedAt && !item.archivedAt);
  if (!module) throw new Error('Custom module is not writable');
  const config = ensureConfig(draft, module.id, { now });
  if (config.status !== MODULE_STATUS.ACTIVE) throw new Error('Custom module is not active');
  const stamp = at(now);
  let payload;
  if (module.type === CUSTOM_MODULE_TYPES.SIMPLE_TRACKER) {
    payload = {
      recordType: 'value',
      title: String(input.title || '').trim().slice(0, 160),
      date: dateKey(input.date || toLocalDateKey(stamp)),
      value: numeric(input.value, { min: 0, max: 1_000_000_000 }),
      unit: String(input.unit || module.goal?.unit || '').trim().slice(0, 30),
      durationSeconds: 0,
      completed: false,
      deadline: null,
      progress: 0,
      status: 'not_started',
      notes: String(input.notes || ''),
      completedAt: null
    };
  } else if (module.type === CUSTOM_MODULE_TYPES.ROUTINE) {
    payload = {
      recordType: 'completion',
      title: String(input.title || module.name).trim().slice(0, 160),
      date: dateKey(input.date || toLocalDateKey(stamp)),
      value: null,
      unit: '',
      durationSeconds: 0,
      completed: input.completed !== false,
      deadline: null,
      progress: input.completed === false ? 0 : 100,
      status: input.completed === false ? 'not_started' : 'completed',
      notes: String(input.notes || ''),
      completedAt: input.completed === false ? null : stamp
    };
  } else if (module.type === CUSTOM_MODULE_TYPES.PROJECT) {
    const progress = numeric(input.progress ?? 0, { min: 0, max: 100 });
    const status = progress >= 100 || input.status === 'completed' ? 'completed' : progress > 0 || input.status === 'in_progress' ? 'in_progress' : 'not_started';
    payload = {
      recordType: 'project',
      title: requiredText(input.title, 'title').slice(0, 160),
      date: dateKey(input.date || toLocalDateKey(stamp)),
      value: null,
      unit: '',
      durationSeconds: 0,
      completed: status === 'completed',
      deadline: dateKey(input.deadline, { nullable: true }),
      progress: status === 'completed' ? 100 : progress,
      status,
      notes: String(input.notes || ''),
      completedAt: status === 'completed' ? stamp : null
    };
  } else if (module.type === CUSTOM_MODULE_TYPES.LIST) {
    payload = {
      recordType: 'list_item',
      title: requiredText(input.title, 'title').slice(0, 160),
      date: dateKey(input.date || toLocalDateKey(stamp)),
      value: null,
      unit: '',
      durationSeconds: 0,
      completed: input.completed === true,
      deadline: null,
      progress: input.completed === true ? 100 : 0,
      status: input.completed === true ? 'completed' : 'not_started',
      notes: String(input.notes || ''),
      completedAt: input.completed === true ? stamp : null
    };
  } else if (module.type === CUSTOM_MODULE_TYPES.TIME_TRACKER) {
    const minutes = numeric(input.minutes, { min: 0, max: 100_000 });
    const seconds = numeric(input.seconds ?? 0, { min: 0, max: 59 });
    const durationSeconds = Math.round(minutes * 60 + seconds);
    if (durationSeconds <= 0) throw new Error('Duration is required');
    payload = {
      recordType: 'time_session',
      title: String(input.title || module.name).trim().slice(0, 160),
      date: dateKey(input.date || toLocalDateKey(stamp)),
      value: null,
      unit: '',
      durationSeconds,
      completed: true,
      deadline: null,
      progress: 100,
      status: 'completed',
      notes: String(input.notes || ''),
      completedAt: stamp
    };
  } else {
    throw new Error('Unsupported module type');
  }

  const records = draft.data.customModuleRecords || (draft.data.customModuleRecords = []);
  const existing = input.id ? records.find(record => record.id === input.id && record.moduleId === module.id) : null;
  if (module.type === CUSTOM_MODULE_TYPES.ROUTINE && !existing) {
    const sameDate = records.find(record => record.moduleId === module.id && record.recordType === 'completion' && record.date === payload.date && !record.deletedAt);
    if (sameDate) {
      Object.assign(sameDate, payload, { updatedAt: stamp });
      return sameDate.id;
    }
  }
  if (existing) {
    Object.assign(existing, payload, { updatedAt: stamp, deletedAt: null });
    return existing.id;
  }
  const id = input.id || idFactory();
  records.push({ id, moduleId: module.id, ...payload, createdAt: stamp, updatedAt: stamp, deletedAt: null });
  return id;
}

export function toggleCustomModuleRecord(draft, recordId, { now = Date.now } = {}) {
  const record = (draft.data.customModuleRecords || []).find(item => item.id === recordId && !item.deletedAt);
  if (!record) return false;
  const stamp = at(now);
  record.completed = !record.completed;
  record.status = record.completed ? 'completed' : 'not_started';
  record.progress = record.completed ? 100 : 0;
  record.completedAt = record.completed ? stamp : null;
  record.updatedAt = stamp;
  return record.completed;
}

export function deleteCustomModuleRecord(draft, recordId, { now = Date.now } = {}) {
  const record = (draft.data.customModuleRecords || []).find(item => item.id === recordId);
  if (!record) return false;
  record.deletedAt = at(now);
  record.updatedAt = record.deletedAt;
  return true;
}

export function restoreCustomModuleRecord(draft, recordId, { now = Date.now } = {}) {
  const record = (draft.data.customModuleRecords || []).find(item => item.id === recordId);
  if (!record) return false;
  record.deletedAt = null;
  record.updatedAt = at(now);
  return true;
}

function deleteBuiltInData(draft, moduleId) {
  const counts = {};
  const clear = key => {
    counts[key] = (draft.data[key] || []).length;
    draft.data[key] = [];
  };
  if (moduleId === 'reading') {
    clear('books');
    clear('readingSessions');
    draft.settings.currentBookId = null;
  } else if (moduleId === 'university') {
    const universityItems = draft.data.universityItems || [];
    counts.universityItems = universityItems.filter(item => (item.moduleId || 'university') === 'university').length;
    draft.data.universityItems = universityItems.filter(item => (item.moduleId || 'university') !== 'university');
  } else if (moduleId === 'screen-time') {
    clear('screenTimeEntries');
  } else if (moduleId === 'work' || moduleId === 'projects') {
    const taskIds = new Set((draft.data.tasks || []).filter(task => task.moduleId === moduleId).map(task => task.id));
    counts.tasks = taskIds.size;
    counts.taskEntries = (draft.data.taskEntries || []).filter(entry => taskIds.has(entry.taskId)).length;
    draft.data.tasks = (draft.data.tasks || []).filter(task => !taskIds.has(task.id));
    draft.data.taskEntries = (draft.data.taskEntries || []).filter(entry => !taskIds.has(entry.taskId));
    if (moduleId === 'work') {
      counts.focusSessions = (draft.data.focusSessions || []).filter(session => session.moduleId === 'work').length;
      draft.data.focusSessions = (draft.data.focusSessions || []).filter(session => session.moduleId !== 'work');
    }
    if (moduleId === 'projects') {
      counts.universityItems = (draft.data.universityItems || []).filter(item => item.moduleId === 'projects').length;
      draft.data.universityItems = (draft.data.universityItems || []).filter(item => item.moduleId !== 'projects');
    }
  }
  return counts;
}

export function permanentlyDeleteModule(draft, moduleId, { now = Date.now } = {}) {
  const definition = getModuleDefinition(moduleId, draft.data.customModules || []);
  if (!definition) throw new Error('Module not found');
  let removed;
  if (definition.custom) {
    const records = draft.data.customModuleRecords || [];
    removed = { customModuleRecords: records.filter(record => record.moduleId === moduleId).length };
    draft.data.customModuleRecords = records.filter(record => record.moduleId !== moduleId);
    draft.data.customModules = (draft.data.customModules || []).filter(module => module.id !== moduleId);
    draft.settings.moduleConfigs = configs(draft).filter(config => config.moduleId !== moduleId);
  } else {
    removed = deleteBuiltInData(draft, moduleId);
    const config = ensureConfig(draft, moduleId, { now });
    Object.assign(config, { status: MODULE_STATUS.AVAILABLE, pinned: false, todayVisibility: 'hidden', updatedAt: at(now) });
  }
  return removed;
}

export const MODULE_STATUS = Object.freeze({
  ACTIVE: 'active',
  HIDDEN: 'hidden',
  AVAILABLE: 'available',
  ARCHIVED: 'archived'
});

export const MODULE_STATUSES = Object.freeze(Object.values(MODULE_STATUS));
export const TODAY_VISIBILITIES = Object.freeze(['summary', 'hidden']);

export const MODULE_CAPABILITIES = Object.freeze({
  TASKS: 'tasks',
  TIME_TRACKING: 'time_tracking',
  PROGRESS: 'progress',
  GOALS: 'goals',
  SESSIONS: 'sessions',
  NOTES: 'notes',
  CALENDAR: 'calendar',
  STATISTICS: 'statistics',
  SEARCH: 'search',
  HISTORY: 'history',
  STREAK: 'streak',
  NUMERIC_VALUES: 'numeric_values'
});

export const CUSTOM_MODULE_TYPES = Object.freeze({
  SIMPLE_TRACKER: 'simple_tracker',
  PROJECT: 'project',
  ROUTINE: 'routine',
  LIST: 'list',
  TIME_TRACKER: 'time_tracker'
});

export const CUSTOM_MODULE_TYPE_DEFINITIONS = Object.freeze({
  [CUSTOM_MODULE_TYPES.SIMPLE_TRACKER]: Object.freeze({
    id: CUSTOM_MODULE_TYPES.SIMPLE_TRACKER,
    name: 'ردیاب ساده',
    description: 'ثبت مقدار یا انجام یک فعالیت در طول زمان',
    capabilities: Object.freeze([
      MODULE_CAPABILITIES.NUMERIC_VALUES,
      MODULE_CAPABILITIES.GOALS,
      MODULE_CAPABILITIES.HISTORY,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.NOTES
    ])
  }),
  [CUSTOM_MODULE_TYPES.PROJECT]: Object.freeze({
    id: CUSTOM_MODULE_TYPES.PROJECT,
    name: 'پروژه',
    description: 'کارها، مهلت و پیشرفت یک پروژه شخصی',
    capabilities: Object.freeze([
      MODULE_CAPABILITIES.TASKS,
      MODULE_CAPABILITIES.PROGRESS,
      MODULE_CAPABILITIES.NOTES,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.HISTORY
    ])
  }),
  [CUSTOM_MODULE_TYPES.ROUTINE]: Object.freeze({
    id: CUSTOM_MODULE_TYPES.ROUTINE,
    name: 'روتین',
    description: 'پیگیری فعالیت‌های تکرارشونده و پیوستگی',
    capabilities: Object.freeze([
      MODULE_CAPABILITIES.STREAK,
      MODULE_CAPABILITIES.HISTORY,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.NOTES
    ])
  }),
  [CUSTOM_MODULE_TYPES.LIST]: Object.freeze({
    id: CUSTOM_MODULE_TYPES.LIST,
    name: 'فهرست',
    description: 'نگهداری یک فهرست ساده و مرتب',
    capabilities: Object.freeze([
      MODULE_CAPABILITIES.TASKS,
      MODULE_CAPABILITIES.NOTES,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.HISTORY
    ])
  }),
  [CUSTOM_MODULE_TYPES.TIME_TRACKER]: Object.freeze({
    id: CUSTOM_MODULE_TYPES.TIME_TRACKER,
    name: 'ردیاب زمان',
    description: 'ثبت زمانی که برای یک فعالیت صرف می‌کنی',
    capabilities: Object.freeze([
      MODULE_CAPABILITIES.TIME_TRACKING,
      MODULE_CAPABILITIES.SESSIONS,
      MODULE_CAPABILITIES.GOALS,
      MODULE_CAPABILITIES.HISTORY,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.NOTES
    ])
  })
});

const CORE_MODULES = [
  ['today', 'امروز', 'برنامه و پیشرفت امروز', '⌂', 'home'],
  ['tasks', 'کارها', 'برنامه‌ریزی و تاریخچه کارها', '✓', 'schedule'],
  ['focus', 'تمرکز', 'تایمر تمرکز و چرخه کار و استراحت', '◎', 'focus'],
  ['habits', 'عادت‌ها', 'پیگیری عادت‌ها و پیوستگی', '○', 'habits'],
  ['calendar', 'تقویم', 'تقویم جلالی و تاریخچه فعالیت‌ها', '□', 'calendar'],
  ['notes', 'یادداشت‌ها', 'یادداشت‌های ساده و شخصی', '✎', 'notes'],
  ['statistics', 'آمار', 'آمار و روندهای واقعی', '⌁', 'stats'],
  ['search', 'جست‌وجو', 'جست‌وجوی سراسری', '⌕', 'search'],
  ['settings', 'تنظیمات', 'تنظیمات برنامه و پشتیبان', '⌘', 'settings']
].map(([id, name, description, icon, destination]) => Object.freeze({
  id,
  name,
  description,
  icon,
  layer: 'core',
  internalType: 'core',
  defaultEnabled: true,
  version: 1,
  capabilities: Object.freeze([]),
  destination,
  dataNamespaces: Object.freeze([]),
  availability: 'available'
}));

const OPTIONAL_MODULES = [
  {
    id: 'reading',
    name: 'مطالعه',
    description: 'کتاب‌ها، صفحات، جلسه‌ها و هدف مطالعه',
    icon: '⌑',
    internalType: 'specialized',
    capabilities: [
      MODULE_CAPABILITIES.SESSIONS,
      MODULE_CAPABILITIES.TIME_TRACKING,
      MODULE_CAPABILITIES.NUMERIC_VALUES,
      MODULE_CAPABILITIES.PROGRESS,
      MODULE_CAPABILITIES.GOALS,
      MODULE_CAPABILITIES.HISTORY,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.NOTES
    ],
    destination: 'reading',
    dataNamespaces: ['books', 'readingSessions']
  },
  {
    id: 'university',
    name: 'دانشگاه',
    description: 'تکلیف، پروژه، پژوهش، پایان‌نامه و مهلت‌ها',
    icon: '⌂',
    internalType: 'specialized',
    capabilities: [
      MODULE_CAPABILITIES.TASKS,
      MODULE_CAPABILITIES.PROGRESS,
      MODULE_CAPABILITIES.NOTES,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.HISTORY
    ],
    destination: 'university',
    dataNamespaces: ['universityItems']
  },
  {
    id: 'screen-time',
    name: 'استفاده از گوشی',
    description: 'ثبت زمان استفاده و مشاهده روند هفتگی',
    icon: '▯',
    internalType: 'specialized',
    capabilities: [
      MODULE_CAPABILITIES.TIME_TRACKING,
      MODULE_CAPABILITIES.NUMERIC_VALUES,
      MODULE_CAPABILITIES.HISTORY,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH
    ],
    destination: 'screen-time',
    dataNamespaces: ['screenTimeEntries']
  },
  {
    id: 'work',
    name: 'کار',
    description: 'کارهای شغلی و زمان کار در یک نمای متمرکز',
    icon: '▣',
    internalType: 'specialized_facade',
    capabilities: [
      MODULE_CAPABILITIES.TASKS,
      MODULE_CAPABILITIES.TIME_TRACKING,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.HISTORY,
      MODULE_CAPABILITIES.NOTES
    ],
    destination: 'work',
    dataNamespaces: ['tasks', 'taskEntries', 'focusSessions']
  },
  {
    id: 'projects',
    name: 'پروژه‌ها',
    description: 'پروژه‌های شخصی، مهلت‌ها و میزان پیشرفت',
    icon: '◇',
    internalType: 'specialized_facade',
    capabilities: [
      MODULE_CAPABILITIES.TASKS,
      MODULE_CAPABILITIES.PROGRESS,
      MODULE_CAPABILITIES.NOTES,
      MODULE_CAPABILITIES.CALENDAR,
      MODULE_CAPABILITIES.STATISTICS,
      MODULE_CAPABILITIES.SEARCH,
      MODULE_CAPABILITIES.HISTORY
    ],
    destination: 'projects',
    dataNamespaces: ['tasks', 'taskEntries', 'universityItems']
  }
].map(item => Object.freeze({
  ...item,
  layer: 'optional',
  defaultEnabled: false,
  version: 1,
  capabilities: Object.freeze(item.capabilities),
  dataNamespaces: Object.freeze(item.dataNamespaces),
  availability: 'available'
}));

export const MODULE_DEFINITIONS = Object.freeze([...CORE_MODULES, ...OPTIONAL_MODULES]);
export const OPTIONAL_MODULE_DEFINITIONS = Object.freeze(OPTIONAL_MODULES);
export const CORE_MODULE_DEFINITIONS = Object.freeze(CORE_MODULES);

const DEFINITION_MAP = new Map(MODULE_DEFINITIONS.map(definition => [definition.id, definition]));

export function getModuleDefinition(moduleId, customModules = []) {
  const builtIn = DEFINITION_MAP.get(String(moduleId || ''));
  if (builtIn) return builtIn;
  const custom = (customModules || []).find(item => item.id === moduleId && !item.deletedAt);
  if (!custom) return null;
  const template = CUSTOM_MODULE_TYPE_DEFINITIONS[custom.type];
  if (!template) return null;
  return {
    id: custom.id,
    name: custom.name,
    description: custom.description || template.description,
    icon: custom.icon || '○',
    layer: 'optional',
    internalType: 'generic',
    genericType: custom.type,
    defaultEnabled: false,
    version: Number(custom.version || 1),
    capabilities: template.capabilities,
    destination: 'custom',
    dataNamespaces: ['customModuleRecords'],
    availability: 'available',
    custom: true,
    goal: custom.goal,
    unit: custom.unit,
    reminderReady: custom.reminderReady === true
  };
}

export function createDefaultModuleConfigs({ existingUser = false } = {}) {
  return OPTIONAL_MODULE_DEFINITIONS.map((definition, index) => ({
    moduleId: definition.id,
    status: existingUser && ['reading', 'university', 'screen-time'].includes(definition.id)
      ? MODULE_STATUS.ACTIVE
      : MODULE_STATUS.AVAILABLE,
    order: index,
    pinned: existingUser && ['reading', 'university', 'screen-time'].includes(definition.id),
    todayVisibility: 'hidden',
    version: definition.version,
    updatedAt: null
  }));
}

export function moduleConfigFor(state, moduleId) {
  return (state?.settings?.moduleConfigs || []).find(config => config.moduleId === moduleId) || null;
}

export function moduleStatusFor(state, moduleId) {
  if (DEFINITION_MAP.get(moduleId)?.layer === 'core') return MODULE_STATUS.ACTIVE;
  return moduleConfigFor(state, moduleId)?.status || MODULE_STATUS.AVAILABLE;
}

export function isModuleVisible(state, moduleId) {
  return moduleStatusFor(state, moduleId) === MODULE_STATUS.ACTIVE;
}

export function isModuleWritable(state, moduleId) {
  return moduleStatusFor(state, moduleId) === MODULE_STATUS.ACTIVE;
}

export function isModuleEnabled(state, moduleId) {
  return [MODULE_STATUS.ACTIVE, MODULE_STATUS.HIDDEN].includes(moduleStatusFor(state, moduleId));
}

export function moduleDefinitionsForState(state, { includeCore = false } = {}) {
  const builtIns = includeCore ? MODULE_DEFINITIONS : OPTIONAL_MODULE_DEFINITIONS;
  const custom = (state?.data?.customModules || [])
    .filter(item => !item.deletedAt)
    .map(item => getModuleDefinition(item.id, state.data.customModules))
    .filter(Boolean);
  return [...builtIns, ...custom];
}

export function modulesByStatus(state, status) {
  return moduleDefinitionsForState(state)
    .filter(definition => moduleStatusFor(state, definition.id) === status)
    .sort((left, right) => {
      const leftConfig = moduleConfigFor(state, left.id);
      const rightConfig = moduleConfigFor(state, right.id);
      return Number(leftConfig?.order ?? 9999) - Number(rightConfig?.order ?? 9999)
        || left.name.localeCompare(right.name, 'fa');
    });
}

export function activeModuleDefinitions(state, { includeHidden = false, includeArchived = false } = {}) {
  const statuses = new Set([MODULE_STATUS.ACTIVE]);
  if (includeHidden) statuses.add(MODULE_STATUS.HIDDEN);
  if (includeArchived) statuses.add(MODULE_STATUS.ARCHIVED);
  return moduleDefinitionsForState(state)
    .filter(definition => statuses.has(moduleStatusFor(state, definition.id)))
    .sort((left, right) => Number(moduleConfigFor(state, left.id)?.order ?? 9999) - Number(moduleConfigFor(state, right.id)?.order ?? 9999));
}

export function pinnedModuleDefinitions(state) {
  return activeModuleDefinitions(state)
    .filter(definition => moduleConfigFor(state, definition.id)?.pinned === true);
}

export function todayModuleDefinitions(state) {
  return activeModuleDefinitions(state)
    .filter(definition => moduleConfigFor(state, definition.id)?.todayVisibility === 'summary');
}

export function moduleSupports(definition, capability) {
  return Boolean(definition?.capabilities?.includes(capability));
}

export function moduleSourceLabel(state, moduleId) {
  return getModuleDefinition(moduleId, state?.data?.customModules || [])?.name || 'بخش ناشناخته';
}

export function normalizeModuleIcon(value) {
  const icon = String(value || '').trim();
  return icon ? [...icon].slice(0, 2).join('') : '○';
}

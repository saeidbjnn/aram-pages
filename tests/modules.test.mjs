import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_MODULE_DEFINITIONS,
  CUSTOM_MODULE_TYPES,
  MODULE_CAPABILITIES,
  MODULE_DEFINITIONS,
  MODULE_STATUS,
  OPTIONAL_MODULE_DEFINITIONS,
  activeModuleDefinitions,
  createDefaultModuleConfigs,
  getModuleDefinition,
  moduleConfigFor,
  moduleStatusFor,
  moduleSupports,
  pinnedModuleDefinitions,
  todayModuleDefinitions
} from '../js/modules.js';
import { createEmptyState } from '../js/store.js';
import {
  activateModule,
  archiveModule,
  deactivateModule,
  hideModule,
  moveModule,
  reactivateModule,
  restoreHiddenModule,
  saveCustomModule,
  setModulePinned,
  setModuleTodayVisibility
} from '../js/module-commands.js';

const now = () => new Date('2026-08-07T10:00:00Z').getTime();
let sequence = 0;
const idFactory = () => `module-${++sequence}`;

test('module registry has one stable definition per module and capability contracts', () => {
  assert.equal(new Set(MODULE_DEFINITIONS.map(item => item.id)).size, MODULE_DEFINITIONS.length);
  assert.equal(CORE_MODULE_DEFINITIONS.length, 9);
  assert.deepEqual(OPTIONAL_MODULE_DEFINITIONS.map(item => item.id), ['reading', 'university', 'screen-time', 'work', 'projects']);
  const reading = getModuleDefinition('reading');
  assert.equal(reading.internalType, 'specialized');
  assert.equal(moduleSupports(reading, MODULE_CAPABILITIES.SESSIONS), true);
  assert.equal(moduleSupports(reading, MODULE_CAPABILITIES.STATISTICS), true);
  assert.equal(getModuleDefinition('missing'), null);
});

test('new users start with a minimal core while existing users preserve old optional layout', () => {
  const fresh = createDefaultModuleConfigs({ existingUser: false });
  assert.equal(fresh.every(config => config.status === MODULE_STATUS.AVAILABLE), true);
  const existing = createDefaultModuleConfigs({ existingUser: true });
  for (const id of ['reading', 'university', 'screen-time']) {
    assert.equal(existing.find(config => config.moduleId === id).status, MODULE_STATUS.ACTIVE);
  }
  assert.equal(existing.find(config => config.moduleId === 'work').status, MODULE_STATUS.AVAILABLE);
});

test('module lifecycle preserves configuration and supports pin, Today visibility and order', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  activateModule(state, 'reading', { now });
  activateModule(state, 'university', { now });
  setModulePinned(state, 'reading', true, { now });
  setModuleTodayVisibility(state, 'reading', 'summary', { now });
  assert.deepEqual(pinnedModuleDefinitions(state).map(item => item.id), ['reading']);
  assert.deepEqual(todayModuleDefinitions(state).map(item => item.id), ['reading']);
  assert.equal(moveModule(state, 'university', 'up', { now }), true);
  assert.equal(activeModuleDefinitions(state)[0].id, 'university');
  hideModule(state, 'reading', { now });
  assert.equal(moduleStatusFor(state, 'reading'), MODULE_STATUS.HIDDEN);
  assert.equal(moduleConfigFor(state, 'reading').pinned, false);
  restoreHiddenModule(state, 'reading', { now });
  deactivateModule(state, 'reading', { now });
  assert.equal(moduleStatusFor(state, 'reading'), MODULE_STATUS.AVAILABLE);
  archiveModule(state, 'reading', { now });
  assert.equal(moduleStatusFor(state, 'reading'), MODULE_STATUS.ARCHIVED);
  reactivateModule(state, 'reading', { now });
  assert.equal(moduleStatusFor(state, 'reading'), MODULE_STATUS.ACTIVE);
});

test('custom definitions use a safe generic template and stable ID', () => {
  sequence = 0;
  const state = createEmptyState({ now, idFactory });
  const id = saveCustomModule(state, {
    name: 'تمرین موسیقی', icon: '🎵', type: CUSTOM_MODULE_TYPES.TIME_TRACKER,
    goalValue: '۱۲۰', unit: 'دقیقه', reminderReady: true, todayVisibility: 'summary'
  }, { now, idFactory });
  const definition = getModuleDefinition(id, state.data.customModules);
  assert.equal(definition.id, id);
  assert.equal(definition.name, 'تمرین موسیقی');
  assert.equal(definition.internalType, 'generic');
  assert.equal(definition.genericType, CUSTOM_MODULE_TYPES.TIME_TRACKER);
  assert.equal(definition.goal.value, 120);
  assert.equal(moduleStatusFor(state, id), MODULE_STATUS.ACTIVE);
  assert.equal(moduleConfigFor(state, id).todayVisibility, 'summary');
});

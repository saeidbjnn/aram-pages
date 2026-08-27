import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState } from '../js/store.js';
import { CUSTOM_MODULE_TYPES, MODULE_STATUS, moduleStatusFor } from '../js/modules.js';
import {
  deleteCustomModuleRecord,
  permanentlyDeleteModule,
  restoreCustomModuleRecord,
  saveCustomModule,
  saveCustomModuleRecord,
  toggleCustomModuleRecord
} from '../js/module-commands.js';

const now = () => new Date('2026-08-07T10:00:00Z').getTime();
let sequence = 0;
const idFactory = () => `custom-${++sequence}`;
function make(type, name = 'بخش شخصی') {
  const state = createEmptyState({ now, idFactory });
  const id = saveCustomModule(state, { name, icon: '○', type, goalValue: '۱۰۰', unit: 'دقیقه', todayVisibility: 'summary' }, { now, idFactory });
  return { state, id };
}

test('all five generic templates persist only their supported fields', () => {
  sequence = 0;
  const value = make(CUSTOM_MODULE_TYPES.SIMPLE_TRACKER, 'زبان');
  saveCustomModuleRecord(value.state, { moduleId: value.id, date: '۲۰۲۶-۰۸-۰۷', value: '۱۲٫۵'.replace('٫', '.'), notes: 'تمرین' }, { now, idFactory });
  assert.equal(value.state.data.customModuleRecords[0].recordType, 'value');
  assert.equal(value.state.data.customModuleRecords[0].value, 12.5);

  const project = make(CUSTOM_MODULE_TYPES.PROJECT, 'مهاجرت');
  saveCustomModuleRecord(project.state, { moduleId: project.id, title: 'مدارک', date: '2026-08-07', deadline: '2026-09-01', progress: '۴۰' }, { now, idFactory });
  assert.equal(project.state.data.customModuleRecords[0].recordType, 'project');
  assert.equal(project.state.data.customModuleRecords[0].progress, 40);

  const routine = make(CUSTOM_MODULE_TYPES.ROUTINE, 'موسیقی');
  const first = saveCustomModuleRecord(routine.state, { moduleId: routine.id, date: '2026-08-07', completed: true }, { now, idFactory });
  const second = saveCustomModuleRecord(routine.state, { moduleId: routine.id, date: '2026-08-07', completed: false }, { now, idFactory });
  assert.equal(first, second);
  assert.equal(routine.state.data.customModuleRecords.length, 1);

  const list = make(CUSTOM_MODULE_TYPES.LIST, 'خرید');
  const listId = saveCustomModuleRecord(list.state, { moduleId: list.id, title: 'نان', completed: false }, { now, idFactory });
  assert.equal(toggleCustomModuleRecord(list.state, listId, { now }), true);

  const time = make(CUSTOM_MODULE_TYPES.TIME_TRACKER, 'رانندگی');
  saveCustomModuleRecord(time.state, { moduleId: time.id, date: '2026-08-07', minutes: '۳۰', seconds: '۴۵' }, { now, idFactory });
  assert.equal(time.state.data.customModuleRecords[0].durationSeconds, 1845);
});

test('custom records can be deleted and restored without data loss', () => {
  sequence = 0;
  const { state, id } = make(CUSTOM_MODULE_TYPES.LIST);
  const recordId = saveCustomModuleRecord(state, { moduleId: id, title: 'مورد' }, { now, idFactory });
  deleteCustomModuleRecord(state, recordId, { now });
  assert.ok(state.data.customModuleRecords[0].deletedAt);
  restoreCustomModuleRecord(state, recordId, { now });
  assert.equal(state.data.customModuleRecords[0].deletedAt, null);
});

test('invalid generic input is rejected and duplicate names remain safe because IDs are authoritative', () => {
  sequence = 0;
  const first = make(CUSTOM_MODULE_TYPES.TIME_TRACKER, 'تمرین');
  assert.throws(() => saveCustomModuleRecord(first.state, { moduleId: first.id, minutes: 0, seconds: 0 }, { now, idFactory }), /Duration/);
  const secondId = saveCustomModule(first.state, { name: 'تمرین', type: CUSTOM_MODULE_TYPES.LIST }, { now, idFactory });
  assert.notEqual(secondId, first.id);
  assert.equal(first.state.data.customModules.filter(item => item.name === 'تمرین').length, 2);
});

test('permanent deletion removes only the selected custom namespace', () => {
  sequence = 0;
  const { state, id } = make(CUSTOM_MODULE_TYPES.LIST, 'اول');
  const otherId = saveCustomModule(state, { name: 'دوم', type: CUSTOM_MODULE_TYPES.LIST }, { now, idFactory });
  saveCustomModuleRecord(state, { moduleId: id, title: 'الف' }, { now, idFactory });
  saveCustomModuleRecord(state, { moduleId: otherId, title: 'ب' }, { now, idFactory });
  permanentlyDeleteModule(state, id, { now });
  assert.equal(state.data.customModules.some(item => item.id === id), false);
  assert.equal(state.data.customModuleRecords.some(item => item.moduleId === id), false);
  assert.equal(state.data.customModuleRecords.some(item => item.moduleId === otherId), true);
  const normalized = normalizeState(state, { now, idFactory });
  assert.equal(moduleStatusFor(normalized, otherId), MODULE_STATUS.ACTIVE);
});

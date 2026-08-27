import { activeEntities, addDays, customModuleStatistics, persianMonthRange, readingSummaryForRange, tasksOnDate } from './domain.js';
import { filterTasks } from './reports.js';
import {
  CUSTOM_MODULE_TYPE_DEFINITIONS,
  MODULE_STATUS,
  activeModuleDefinitions,
  getModuleDefinition,
  moduleConfigFor,
  moduleStatusFor,
  modulesByStatus,
  pinnedModuleDefinitions,
  todayModuleDefinitions
} from './modules.js';
import {
  activateModule,
  archiveModule,
  deactivateModule,
  deleteCustomModuleRecord,
  dismissModuleIntroduction,
  hideModule,
  moveModule,
  permanentlyDeleteModule,
  reactivateModule,
  restoreHiddenModule,
  saveCustomModule,
  saveCustomModuleRecord,
  setModulePinned,
  setModuleTodayVisibility
} from './module-commands.js';

export function createModuleUI(dependencies) {
  const {
    getState,
    commit,
    applyCommand,
    openSheet,
    closeSheet,
    toast,
    downloadJson,
    store,
    appVersion,
    escapeHtml,
    escapeAttr,
    faDigits,
    formatDuration,
    formatPersianDate,
    percent,
    todayKey,
    taskListRow,
    openReading,
    openUniversity,
    openScreenTime,
    openTaskEditor,
    openUniversityEditor
  } = dependencies;
  const state = getState;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function moduleStatusLabel(status) {
    return { active: 'فعال', hidden: 'مخفی', available: 'غیرفعال', archived: 'آرشیوشده' }[status] || 'نامشخص';
  }

  function moduleRecordCount(moduleId) {
    if (moduleId === 'reading') return (state().data.books || []).length + (state().data.readingSessions || []).length;
    if (moduleId === 'university') return (state().data.universityItems || []).filter(item => !item.moduleId || item.moduleId === 'university').length;
    if (moduleId === 'screen-time') return (state().data.screenTimeEntries || []).length;
    if (moduleId === 'work') return (state().data.tasks || []).filter(item => item.moduleId === 'work').length + (state().data.focusSessions || []).filter(item => item.moduleId === 'work').length;
    if (moduleId === 'projects') return (state().data.tasks || []).filter(item => item.moduleId === 'projects').length + (state().data.universityItems || []).filter(item => item.moduleId === 'projects').length;
    return (state().data.customModuleRecords || []).filter(record => record.moduleId === moduleId).length;
  }

  function moduleCardMarkup(definition, { management = false } = {}) {
    const config = moduleConfigFor(state(), definition.id);
    const status = moduleStatusFor(state(), definition.id);
    const action = status === MODULE_STATUS.ACTIVE ? 'بازکردن' : status === MODULE_STATUS.HIDDEN ? 'بازیابی' : status === MODULE_STATUS.ARCHIVED ? 'فعال‌سازی دوباره' : 'افزودن';
    return `<article class="module-card card" data-module-card="${escapeAttr(definition.id)}">
      <button type="button" class="module-card-main" ${management ? `data-module-primary="${escapeAttr(definition.id)}"` : `data-open-module="${escapeAttr(definition.id)}"`} aria-label="${escapeAttr(action)} ${escapeAttr(definition.name)}">
        <span class="feature-icon">${escapeHtml(definition.icon)}</span>
        <span><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(definition.description)}</small></span>
        <b>${action}</b>
      </button>
      ${management ? `<div class="module-card-meta"><span>${moduleStatusLabel(status)}</span><span>${faDigits(moduleRecordCount(definition.id))} رکورد</span>${config?.pinned ? '<span>سنجاق‌شده</span>' : ''}</div><button type="button" class="text-button module-manage-button" data-module-manage="${escapeAttr(definition.id)}">مدیریت</button>` : ''}
    </article>`;
  }

  function renderMoreView() {
    const root = $('#feature-grid');
    const pinned = pinnedModuleDefinitions(state());
    const active = activeModuleDefinitions(state()).filter(definition => !moduleConfigFor(state(), definition.id)?.pinned);
    const preferences = state().settings.modulePreferences;
    const intro = preferences.moduleIntroductionDismissed ? '' : `<div class="module-introduction card"><span><strong>بخش‌های آرام حالا قابل انتخاب‌اند</strong><small>مطالعه، دانشگاه و ابزارهای دیگر را بدون حذف داده‌ها مخفی یا جابه‌جا کن.</small></span><button type="button" class="text-button" id="dismiss-module-intro">متوجه شدم</button></div>`;
    const pinnedMarkup = pinned.length ? `<div class="module-group"><div class="section-heading compact"><div><span class="section-kicker">دسترسی سریع</span><h3>سنجاق‌شده‌ها</h3></div></div>${pinned.map(definition => moduleCardMarkup(definition)).join('')}</div>` : '';
    const activeMarkup = active.length ? `<div class="module-group"><div class="section-heading compact"><div><span class="section-kicker">بخش‌های من</span><h3>فعال</h3></div></div>${active.map(definition => moduleCardMarkup(definition)).join('')}</div>` : pinned.length ? '' : `<div class="empty-state module-empty"><strong>هنوز بخشی اضافه نکرده‌ای</strong><small>مطالعه، دانشگاه، کار یا هر بخش دیگری را متناسب با زندگی خودت اضافه کن.</small><button type="button" class="primary-button" data-open-module-library>افزودن بخش</button></div>`;
    root.innerHTML = `${intro}${pinnedMarkup}${activeMarkup}<div class="module-group"><div class="section-heading compact"><div><span class="section-kicker">مدیریت</span><h3>ابزارها</h3></div></div>
      <button type="button" class="feature-card card" data-open-module-library><span class="feature-icon">＋</span><span><strong>کتابخانه بخش‌ها</strong><small>افزودن، مخفی‌کردن و مرتب‌سازی</small></span><b>›</b></button>
      <button type="button" class="feature-card card" data-open-sheet="notes"><span class="feature-icon">✎</span><span><strong>یادداشت‌ها</strong><small>ساده و بدون حواس‌پرتی</small></span><b>›</b></button>
      <button type="button" class="feature-card card" data-open-sheet="reviews"><span class="feature-icon">◎</span><span><strong>مرورها</strong><small>روزانه، هفتگی و ماهانه</small></span><b>›</b></button>
      <button type="button" class="feature-card card" data-open-sheet="settings"><span class="feature-icon">⌘</span><span><strong>تنظیمات</strong><small>ظاهر، تایمر و پشتیبان</small></span><b>›</b></button>
    </div>`;
    $('#dismiss-module-intro', root)?.addEventListener('click', () => {
      if (commit(draft => dismissModuleIntroduction(draft))) renderMoreView();
    });
  }

  function todayModuleSummary(definition) {
    const date = todayKey();
    if (definition.id === 'reading') {
      const summary = readingSummaryForRange(state(), date, date);
      return summary.sessionCount ? `امروز ${formatDuration(summary.minutes)} و ${faDigits(summary.pages)} صفحه` : 'امروز هنوز مطالعه‌ای ثبت نشده است';
    }
    if (definition.id === 'university') {
      const pending = activeEntities(state().data.universityItems || []).filter(item => (!item.moduleId || item.moduleId === 'university') && item.status !== 'completed').length;
      return pending ? `${faDigits(pending)} کار دانشگاهی باقی مانده` : 'کار دانشگاهی بازی باقی نمانده است';
    }
    if (definition.id === 'screen-time') {
      const entry = activeEntities(state().data.screenTimeEntries || []).find(item => item.date === date);
      return entry ? `${formatDuration(entry.minutes)} برای امروز ثبت شده` : 'زمان استفاده امروز ثبت نشده است';
    }
    if (definition.id === 'work') {
      const tasks = tasksOnDate(state(), date).filter(task => task.moduleId === 'work' && task.status !== 'completed');
      const minutes = Math.round(activeEntities(state().data.focusSessions || []).filter(session => session.moduleId === 'work' && session.date === date).reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
      return tasks.length ? `${faDigits(tasks.length)} کار باقی مانده · ${formatDuration(minutes)} ثبت‌شده` : `${formatDuration(minutes)} زمان کار ثبت‌شده`;
    }
    if (definition.id === 'projects') {
      const projects = activeEntities(state().data.universityItems || []).filter(item => item.moduleId === 'projects' && item.status !== 'completed');
      return projects.length ? `${faDigits(projects.length)} پروژه در جریان` : 'پروژه بازی باقی نمانده است';
    }
    const records = activeEntities(state().data.customModuleRecords || []).filter(record => record.moduleId === definition.id && record.date === date);
    const stats = customModuleStatistics(state(), definition.id, date, date);
    if (!records.length) return 'امروز هنوز چیزی ثبت نشده است';
    if (definition.genericType === 'time_tracker') return `${formatDuration(stats.durationMinutes)} امروز`;
    if (definition.genericType === 'simple_tracker') return `${faDigits(stats.valueTotal)} ${definition.unit || ''}`.trim();
    return `${faDigits(stats.completed)} از ${faDigits(stats.total)} انجام‌شده`;
  }

  function renderTodayModules() {
    const definitions = todayModuleDefinitions(state());
    const section = $('#today-module-section');
    const root = $('#today-module-summaries');
    section.hidden = definitions.length === 0;
    root.innerHTML = definitions.map(definition => `<button type="button" class="feature-card card module-summary-card" data-open-module="${escapeAttr(definition.id)}"><span class="feature-icon">${escapeHtml(definition.icon)}</span><span><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(todayModuleSummary(definition))}</small></span><b>›</b></button>`).join('');
  }

  function openModule(moduleId) {
    const definition = getModuleDefinition(moduleId, state().data.customModules || []);
    if (!definition) { toast('این بخش در دسترس نیست', 'error'); return; }
    const status = moduleStatusFor(state(), moduleId);
    if (status !== MODULE_STATUS.ACTIVE) { moduleManageSheet(moduleId); return; }
    if (moduleId === 'reading') openReading();
    else if (moduleId === 'university') openUniversity({ moduleId: 'university' });
    else if (moduleId === 'screen-time') openScreenTime();
    else if (moduleId === 'work') workSheet();
    else if (moduleId === 'projects') projectsSheet();
    else if (definition.custom) customModuleSheet(moduleId);
  }

  function moduleLibrarySheet() {
    openSheet('بخش‌های من', 'کتابخانه بخش‌ها', '<div id="module-library"></div>', root => {
      const container = $('#module-library', root);
      const render = () => {
        const builtInOnly = definitions => definitions.filter(definition => !definition.custom);
        const groups = [
          ['active', 'بخش‌های فعال', builtInOnly(modulesByStatus(state(), MODULE_STATUS.ACTIVE))],
          ['available', 'بخش‌های قابل افزودن', builtInOnly(modulesByStatus(state(), MODULE_STATUS.AVAILABLE))],
          ['hidden', 'بخش‌های مخفی', builtInOnly(modulesByStatus(state(), MODULE_STATUS.HIDDEN))],
          ['archived', 'بخش‌های آرشیوشده', builtInOnly(modulesByStatus(state(), MODULE_STATUS.ARCHIVED))]
        ];
        const custom = (state().data.customModules || []).filter(item => !item.deletedAt).map(item => getModuleDefinition(item.id, state().data.customModules)).filter(Boolean);
        container.innerHTML = `<div class="manager-toolbar"><button type="button" class="primary-button" id="create-custom-module">بخش شخصی جدید</button></div>${groups.map(([key, title, definitions]) => `<section class="module-library-group" data-group="${key}"><div class="section-heading compact"><div><span class="section-kicker">${faDigits(definitions.length)} بخش</span><h3>${title}</h3></div></div>${definitions.length ? definitions.map(definition => moduleCardMarkup(definition, { management: true })).join('') : `<div class="empty-state">${key === 'active' ? 'هنوز بخش اختیاری فعالی نداری.' : 'موردی در این گروه نیست.'}</div>`}</section>`).join('')}<section class="module-library-group"><div class="section-heading compact"><div><span class="section-kicker">قالب‌های ساده</span><h3>بخش‌های شخصی</h3></div></div>${custom.length ? custom.map(definition => moduleCardMarkup(definition, { management: true })).join('') : '<div class="empty-state"><strong>بخش شخصی خودت را بساز</strong><small>برای کاری که قالب آماده ندارد، یک بخش ساده ایجاد کن.</small></div>'}</section>`;
        $('#create-custom-module', container).onclick = () => customModuleEditor();
        $$('[data-module-primary]', container).forEach(button => button.onclick = () => {
          const id = button.dataset.modulePrimary;
          const status = moduleStatusFor(state(), id);
          if (status === MODULE_STATUS.ACTIVE) openModule(id);
          else if (status === MODULE_STATUS.HIDDEN) { if (applyCommand(restoreHiddenModule, [id], 'بخش دوباره نمایش داده شد')) render(); }
          else { if (applyCommand(activateModule, [id], 'بخش فعال شد')) render(); }
        });
        $$('[data-module-manage]', container).forEach(button => button.onclick = () => moduleManageSheet(button.dataset.moduleManage));
      };
      render();
    });
  }

  function moduleManageSheet(moduleId) {
    const definition = getModuleDefinition(moduleId, state().data.customModules || []);
    if (!definition) return;
    const config = moduleConfigFor(state(), moduleId);
    const status = moduleStatusFor(state(), moduleId);
    const isActive = status === MODULE_STATUS.ACTIVE;
    openSheet('مدیریت بخش', definition.name, `<div class="module-detail-head card"><span class="feature-icon">${escapeHtml(definition.icon)}</span><span><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(definition.description)}</small></span><b>${moduleStatusLabel(status)}</b></div>
      <div class="list-card">
        ${isActive ? `<div class="switch-row"><div><strong>سنجاق در بخش‌های من</strong><div class="muted">دسترسی سریع‌تر در بالای صفحه</div></div><button type="button" class="switch ${config?.pinned ? 'on' : ''}" id="module-pin" role="switch" aria-checked="${Boolean(config?.pinned)}" aria-label="سنجاق ${escapeAttr(definition.name)}"></button></div><div class="switch-row"><div><strong>نمایش خلاصه در امروز</strong><div class="muted">فقط یک خلاصه کوتاه نمایش داده می‌شود</div></div><button type="button" class="switch ${config?.todayVisibility === 'summary' ? 'on' : ''}" id="module-today" role="switch" aria-checked="${config?.todayVisibility === 'summary'}" aria-label="نمایش ${escapeAttr(definition.name)} در امروز"></button></div>` : ''}
        <div class="switch-row"><div><strong>تعداد رکوردها</strong><div class="muted">داده‌ها هنگام مخفی یا غیرفعال‌شدن حفظ می‌شوند</div></div><strong>${faDigits(moduleRecordCount(moduleId))}</strong></div>
      </div>
      <div class="sheet-actions module-action-grid">
        ${isActive ? '<button type="button" class="secondary-button" id="module-open">بازکردن</button><button type="button" class="secondary-button" id="module-hide">مخفی‌کردن</button><button type="button" class="secondary-button" id="module-deactivate">غیرفعال‌کردن</button><button type="button" class="secondary-button" id="module-archive">آرشیو</button>' : status === MODULE_STATUS.HIDDEN ? '<button type="button" class="primary-button" id="module-restore-hidden">بازیابی نمایش</button><button type="button" class="secondary-button" id="module-deactivate">غیرفعال‌کردن</button>' : '<button type="button" class="primary-button" id="module-activate">فعال‌کردن</button>'}
      </div>
      ${isActive ? '<div class="sheet-actions"><button type="button" class="text-button" id="module-up">بالاتر</button><button type="button" class="text-button" id="module-down">پایین‌تر</button></div>' : ''}
      ${definition.custom ? '<button type="button" class="secondary-button full-width" id="edit-custom-module">ویرایش مشخصات بخش</button>' : ''}
      <div class="danger-zone"><strong>حذف دائمی</strong><p>این عمل تنظیمات و داده‌های این بخش را برای همیشه حذف می‌کند. ابتدا یک فایل پشتیبان دریافت می‌کنی و سپس باید نام بخش را دقیق وارد کنی.</p><button type="button" class="text-button danger-text" id="delete-module-permanently">دریافت پشتیبان و حذف دائمی</button></div>`, root => {
      $('#module-open', root)?.addEventListener('click', () => openModule(moduleId));
      $('#module-pin', root)?.addEventListener('click', () => { if (applyCommand(setModulePinned, [moduleId, !config?.pinned], 'تنظیم سنجاق تغییر کرد')) moduleManageSheet(moduleId); });
      $('#module-today', root)?.addEventListener('click', () => { const next = config?.todayVisibility === 'summary' ? 'hidden' : 'summary'; if (applyCommand(setModuleTodayVisibility, [moduleId, next], 'نمایش امروز تغییر کرد')) moduleManageSheet(moduleId); });
      $('#module-hide', root)?.addEventListener('click', () => { if (applyCommand(hideModule, [moduleId], 'بخش مخفی شد')) moduleLibrarySheet(); });
      $('#module-restore-hidden', root)?.addEventListener('click', () => { if (applyCommand(restoreHiddenModule, [moduleId], 'بخش دوباره نمایش داده شد')) moduleLibrarySheet(); });
      $('#module-deactivate', root)?.addEventListener('click', () => { if (applyCommand(deactivateModule, [moduleId], 'بخش غیرفعال شد؛ داده‌ها حفظ شدند')) moduleLibrarySheet(); });
      $('#module-archive', root)?.addEventListener('click', () => { if (applyCommand(archiveModule, [moduleId], 'بخش آرشیو شد')) moduleLibrarySheet(); });
      $('#module-activate', root)?.addEventListener('click', () => { if (applyCommand(status === MODULE_STATUS.ARCHIVED ? reactivateModule : activateModule, [moduleId], 'بخش فعال شد')) moduleLibrarySheet(); });
      $('#module-up', root)?.addEventListener('click', () => { if (applyCommand(moveModule, [moduleId, 'up'], 'ترتیب بخش تغییر کرد')) moduleManageSheet(moduleId); });
      $('#module-down', root)?.addEventListener('click', () => { if (applyCommand(moveModule, [moduleId, 'down'], 'ترتیب بخش تغییر کرد')) moduleManageSheet(moduleId); });
      $('#edit-custom-module', root)?.addEventListener('click', () => customModuleEditor(moduleId));
      $('#delete-module-permanently', root).onclick = () => {
        downloadJson(`aram-before-delete-${moduleId}-${todayKey()}.json`, store.exportData({ appVersion: appVersion }));
        const confirmation = prompt(`برای حذف دائمی، نام «${definition.name}» را دقیق وارد کن:`);
        if (confirmation !== definition.name) { toast('حذف دائمی لغو شد'); return; }
        if (applyCommand(permanentlyDeleteModule, [moduleId], 'بخش و داده‌های آن حذف شد')) moduleLibrarySheet();
      };
    });
  }

  function workSheet() {
    const tasks = filterTasks(state(), { status: 'active', moduleId: 'work', sort: 'date' });
    const weekStart = addDays(todayKey(), -6);
    const sessions = activeEntities(state().data.focusSessions || []).filter(session => session.moduleId === 'work' && session.date >= weekStart && session.date <= todayKey());
    const minutes = Math.round(sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
    openSheet('کار', 'مسئولیت‌های کاری', `<div class="review-summary"><div><span>کارهای فعال</span><strong>${faDigits(tasks.length)}</strong></div><div><span>زمان هفتگی</span><strong>${formatDuration(minutes)}</strong></div></div><div class="manager-toolbar"><button type="button" class="primary-button" id="add-work-task">کار جدید</button></div><div class="list-card">${tasks.length ? tasks.map(taskListRow).join('') : '<div class="empty-state">هنوز کار شغلی ثبت نشده است.</div>'}</div>`, root => {
      $('#add-work-task', root).onclick = () => openTaskEditor(null, { moduleId: 'work', category: 'کار' });
      $$('[data-id]', root).forEach(row => row.onclick = () => openTaskEditor(row.dataset.id));
    });
  }

  function projectsSheet() {
    const items = activeEntities(state().data.universityItems || []).filter(item => item.moduleId === 'projects');
    const average = items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.progress || 0), 0) / items.length) : 0;
    openSheet('پروژه‌ها', 'پروژه‌های شخصی', `<div class="review-summary"><div><span>پروژه فعال</span><strong>${faDigits(items.filter(item => item.status !== 'completed').length)}</strong></div><div><span>میانگین پیشرفت</span><strong>${percent(average)}</strong></div></div><div class="manager-toolbar"><button type="button" class="primary-button" id="add-project">پروژه جدید</button></div><div class="list-card">${items.length ? items.map(item => `<button type="button" class="manager-row" data-id="${item.id}"><span><strong>${escapeHtml(item.title)}</strong><small>${item.deadline ? formatPersianDate(item.deadline) : 'بدون مهلت'} · ${percent(item.progress)}</small></span><b>›</b></button>`).join('') : '<div class="empty-state">هنوز پروژه‌ای ثبت نشده است.</div>'}</div>`, root => {
      $('#add-project', root).onclick = () => openUniversityEditor(null, { type: 'project', moduleId: 'projects' });
      $$('[data-id]', root).forEach(row => row.onclick = () => openUniversityEditor(row.dataset.id, { moduleId: 'projects' }));
    });
  }

  function customModuleEditor(id = null) {
    const module = id ? (state().data.customModules || []).find(item => item.id === id) : null;
    const config = id ? moduleConfigFor(state(), id) : null;
    openSheet('بخش شخصی', module ? 'ویرایش بخش' : 'ساخت بخش شخصی', `<form class="form-stack" id="custom-module-form">
      <div class="filter-grid"><div class="field"><label>نام بخش</label><input id="custom-module-name" required maxlength="80" value="${escapeAttr(module?.name || '')}" autofocus /></div><div class="field"><label>نماد</label><input id="custom-module-icon" maxlength="2" value="${escapeAttr(module?.icon || '○')}" /></div></div>
      <div class="field"><label>نوع بخش</label><select id="custom-module-type" ${module ? 'disabled' : ''}>${Object.values(CUSTOM_MODULE_TYPE_DEFINITIONS).map(type => `<option value="${type.id}">${escapeHtml(type.name)} — ${escapeHtml(type.description)}</option>`).join('')}</select></div>
      <div class="filter-grid"><div class="field"><label>هدف اختیاری</label><input id="custom-module-goal" inputmode="decimal" value="${module?.goal?.value ?? ''}" /></div><div class="field"><label>واحد اختیاری</label><input id="custom-module-unit" maxlength="30" value="${escapeAttr(module?.goal?.unit || '')}" placeholder="مثلاً دقیقه، کیلومتر یا جلسه" /></div></div>
      <label class="check-row"><input type="checkbox" id="custom-module-reminder" ${module?.reminderReady ? 'checked' : ''}/><span>آماده برای یادآوری در نسخه‌های آینده</span></label>
      <label class="check-row"><input type="checkbox" id="custom-module-today" ${config?.todayVisibility === 'summary' ? 'checked' : ''}/><span>نمایش خلاصه در امروز</span></label>
      <div class="sheet-actions"><button type="button" class="secondary-button" data-close-sheet>لغو</button><button type="submit" class="primary-button">ذخیره</button></div>
    </form>`, root => {
      $('#custom-module-type', root).value = module?.type || 'simple_tracker';
      $('[data-close-sheet]', root).onclick = closeSheet;
      $('#custom-module-form', root).onsubmit = event => {
        event.preventDefault();
        const input = { id: module?.id, name: $('#custom-module-name', root).value, icon: $('#custom-module-icon', root).value, type: module?.type || $('#custom-module-type', root).value, goalValue: $('#custom-module-goal', root).value, unit: $('#custom-module-unit', root).value, reminderReady: $('#custom-module-reminder', root).checked, todayVisibility: $('#custom-module-today', root).checked ? 'summary' : 'hidden' };
        let createdId = module?.id;
        const ok = commit(draft => { createdId = saveCustomModule(draft, input); }, 'ذخیره بخش شخصی انجام نشد');
        if (!ok) return;
        toast(module ? 'بخش شخصی به‌روزرسانی شد' : 'بخش شخصی ساخته شد');
        customModuleSheet(createdId);
      };
    });
  }

  function customModuleSheet(moduleId) {
    const definition = getModuleDefinition(moduleId, state().data.customModules || []);
    if (!definition?.custom) return;
    const records = activeEntities(state().data.customModuleRecords || []).filter(record => record.moduleId === moduleId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const month = persianMonthRange(0, new Date());
    const stats = customModuleStatistics(state(), moduleId, month?.startKey || addDays(todayKey(), -29), todayKey());
    let summary = `${faDigits(stats.total)} رکورد`;
    if (definition.genericType === 'time_tracker') summary = `${formatDuration(stats.durationMinutes)} در این ماه`;
    if (definition.genericType === 'simple_tracker') summary = `${faDigits(stats.valueTotal)} ${escapeHtml(definition.unit || '')}`.trim();
    if (definition.genericType === 'project') summary = `${percent(stats.averageProgress)} میانگین پیشرفت`;
    if (definition.genericType === 'routine' || definition.genericType === 'list') summary = `${faDigits(stats.completed)} از ${faDigits(stats.total)} انجام‌شده`;
    openSheet(definition.name, 'بخش شخصی', `<div class="module-detail-head card"><span class="feature-icon">${escapeHtml(definition.icon)}</span><span><strong>${escapeHtml(definition.name)}</strong><small>${summary}</small></span><button type="button" class="text-button" id="manage-current-module">مدیریت</button></div><div class="manager-toolbar"><button type="button" class="primary-button" id="add-custom-record">ثبت مورد جدید</button></div><div class="list-card">${records.length ? records.map(record => `<button type="button" class="manager-row" data-record-id="${record.id}"><span><strong>${escapeHtml(record.title || definition.name)}</strong><small>${record.date ? formatPersianDate(record.date) : ''}${record.value !== null ? ` · ${faDigits(record.value)} ${escapeHtml(record.unit || '')}` : ''}${record.durationSeconds ? ` · ${formatDuration(Math.round(record.durationSeconds / 60))}` : ''}${record.recordType === 'project' ? ` · ${percent(record.progress)}` : ''}</small></span><b>${record.completed ? '✓' : '›'}</b></button>`).join('') : '<div class="empty-state"><strong>هنوز چیزی ثبت نشده است</strong><small>اولین مورد را برای این بخش اضافه کن.</small></div>'}</div>`, root => {
      $('#manage-current-module', root).onclick = () => moduleManageSheet(moduleId);
      $('#add-custom-record', root).onclick = () => customRecordEditor(moduleId);
      $$('[data-record-id]', root).forEach(row => row.onclick = () => customRecordEditor(moduleId, row.dataset.recordId));
    });
  }

  function customRecordEditor(moduleId, recordId = null) {
    const definition = getModuleDefinition(moduleId, state().data.customModules || []);
    const record = recordId ? (state().data.customModuleRecords || []).find(item => item.id === recordId) : null;
    if (!definition?.custom) return;
    let fields = '';
    if (definition.genericType === 'simple_tracker') fields = `<div class="filter-grid"><div class="field"><label>تاریخ</label><input type="date" id="custom-record-date" value="${record?.date || todayKey()}" /></div><div class="field"><label>مقدار</label><input id="custom-record-value" inputmode="decimal" required value="${record?.value ?? ''}" /></div></div><div class="field"><label>یادداشت</label><textarea id="custom-record-notes">${escapeHtml(record?.notes || '')}</textarea></div>`;
    if (definition.genericType === 'routine') fields = `<div class="field"><label>تاریخ انجام</label><input type="date" id="custom-record-date" value="${record?.date || todayKey()}" /></div><label class="check-row"><input type="checkbox" id="custom-record-completed" ${record?.completed !== false ? 'checked' : ''}/><span>در این روز انجام شد</span></label><div class="field"><label>یادداشت</label><textarea id="custom-record-notes">${escapeHtml(record?.notes || '')}</textarea></div>`;
    if (definition.genericType === 'project') fields = `<div class="field"><label>عنوان</label><input id="custom-record-title" required value="${escapeAttr(record?.title || '')}" /></div><div class="filter-grid"><div class="field"><label>تاریخ شروع</label><input type="date" id="custom-record-date" value="${record?.date || todayKey()}" /></div><div class="field"><label>مهلت</label><input type="date" id="custom-record-deadline" value="${record?.deadline || ''}" /></div></div><div class="field"><label>پیشرفت</label><input type="range" id="custom-record-progress" min="0" max="100" value="${record?.progress || 0}" /><output id="custom-progress-output">${faDigits(record?.progress || 0)}٪</output></div><div class="field"><label>یادداشت</label><textarea id="custom-record-notes">${escapeHtml(record?.notes || '')}</textarea></div>`;
    if (definition.genericType === 'list') fields = `<div class="field"><label>عنوان مورد</label><input id="custom-record-title" required value="${escapeAttr(record?.title || '')}" /></div><label class="check-row"><input type="checkbox" id="custom-record-completed" ${record?.completed ? 'checked' : ''}/><span>انجام شده است</span></label><div class="field"><label>یادداشت</label><textarea id="custom-record-notes">${escapeHtml(record?.notes || '')}</textarea></div>`;
    if (definition.genericType === 'time_tracker') fields = `<div class="field"><label>تاریخ</label><input type="date" id="custom-record-date" value="${record?.date || todayKey()}" /></div><div class="filter-grid"><div class="field"><label>دقیقه</label><input type="text" inputmode="numeric" pattern="[0-9۰-۹٠-٩]{1,6}" id="custom-record-minutes" value="${record ? Math.floor(record.durationSeconds / 60) : 30}" /></div><div class="field"><label>ثانیه</label><input type="text" inputmode="numeric" pattern="[0-9۰-۹٠-٩]{1,2}" id="custom-record-seconds" value="${record ? record.durationSeconds % 60 : 0}" /></div></div><div class="field"><label>یادداشت</label><textarea id="custom-record-notes">${escapeHtml(record?.notes || '')}</textarea></div>`;
    openSheet(definition.name, record ? 'ویرایش رکورد' : 'ثبت مورد جدید', `<form class="form-stack" id="custom-record-form">${fields}<div class="sheet-actions">${record ? '<button type="button" class="secondary-button" id="delete-custom-record">حذف</button>' : '<button type="button" class="secondary-button" data-close-sheet>لغو</button>'}<button type="submit" class="primary-button">ذخیره</button></div></form>`, root => {
      $('[data-close-sheet]', root)?.addEventListener('click', closeSheet);
      $('#custom-record-progress', root)?.addEventListener('input', event => { $('#custom-progress-output', root).textContent = `${faDigits(event.target.value)}٪`; });
      $('#custom-record-form', root).onsubmit = event => {
        event.preventDefault();
        const input = { id: record?.id, moduleId, title: $('#custom-record-title', root)?.value, date: $('#custom-record-date', root)?.value || todayKey(), value: $('#custom-record-value', root)?.value, unit: definition.unit, completed: $('#custom-record-completed', root)?.checked, deadline: $('#custom-record-deadline', root)?.value || null, progress: $('#custom-record-progress', root)?.value, minutes: $('#custom-record-minutes', root)?.value, seconds: $('#custom-record-seconds', root)?.value, notes: $('#custom-record-notes', root)?.value || '' };
        if (applyCommand(saveCustomModuleRecord, [input], 'رکورد ذخیره شد')) customModuleSheet(moduleId);
      };
      $('#delete-custom-record', root)?.addEventListener('click', () => { if (applyCommand(deleteCustomModuleRecord, [record.id], 'رکورد حذف شد')) customModuleSheet(moduleId); });
    });
  }

  return Object.freeze({
    renderMoreView,
    renderTodayModules,
    openModule,
    moduleLibrarySheet,
    moduleManageSheet,
    customModuleEditor,
    customModuleSheet,
    customRecordEditor
  });
}

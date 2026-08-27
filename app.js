import {
  activeEntities,
  activeHabitsOnDate,
  addDays,
  calendarActivityForDate,
  clamp,
  compareDateKeys,
  completionForDate,
  customModuleStatistics,
  currentBook,
  currentHabitStreak,
  dateFromKey,
  focusMinutesForDate,
  gregorianForPersian,
  habitAdherence,
  habitEntryForDate,
  habitHistory,
  hasCalendarActivity,
  longestHabitStreak,
  normalizeDigits,
  persianMonthRange,
  persianParts,
  readingGoalForDate,
  readingSummaryForRange,
  statisticsForRange,
  taskDueDateForOccurrence,
  taskOccurrencesInRange,
  tasksOnDate,
  toLocalDateKey,
  universityStatistics,
  weekdayIndex
} from './js/domain.js';
import {
  dailyReview,
  filterBooks,
  filterHabits,
  filterTasks,
  filterUniversity,
  globalSearch,
  monthlyReview,
  weeklyReview
} from './js/reports.js';
import {
  archiveBook,
  archiveHabit,
  archiveTask,
  archiveUniversityItem,
  deleteBook,
  deleteHabit,
  deleteNote,
  deleteTask,
  deleteUniversityItem,
  recordFocusSession,
  recordReadingSession,
  restoreBook,
  restoreHabit,
  restoreNote,
  restoreTask,
  restoreUniversityItem,
  saveBook,
  saveHabit,
  saveNote,
  saveTask,
  saveUniversityItem,
  setCurrentBook,
  setReadingGoal,
  setScreenTime,
  toggleHabitDate,
  toggleTaskOccurrence,
  unarchiveBook,
  unarchiveHabit,
  unarchiveTask,
  unarchiveUniversityItem
} from './js/commands.js';
import { createStore, SCHEMA_VERSION, STORAGE_KEY } from './js/store.js';
import {
  MODULE_CAPABILITIES,
  MODULE_STATUS,
  activeModuleDefinitions,
  moduleSourceLabel,
  moduleStatusFor,
  moduleSupports
} from './js/modules.js';
import { setHiddenSearchPreference } from './js/module-commands.js';
import { createOnboarding } from './js/onboarding.js';
import { createModuleUI } from './js/module-ui.js';
import { ReliableTimer } from './js/timer.js';
import { createNativeTimerBridge, TIMER_SOUND_OPTIONS } from './js/native-timer-bridge.js';
import { APP_VERSION, createDiagnostics } from './js/diagnostics.js';
import { createDeveloperMode } from './js/developer-mode.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const faDigits = value => String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[digit]);
const clampInteger = (value, min, max) => Math.round(clamp(value, min, max));
const nowIso = () => new Date().toISOString();
const todayKey = () => toLocalDateKey(new Date());
const PRIORITY_LABELS = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
const UNIVERSITY_TYPE_LABELS = { assignment: 'تکلیف', project: 'پروژه', research: 'پژوهش', thesis: 'پایان‌نامه' };
const UNIVERSITY_STATUS_LABELS = { not_started: 'شروع‌نشده', in_progress: 'در حال انجام', on_hold: 'متوقف', completed: 'تکمیل‌شده' };
const RECURRENCE_LABELS = { none: 'بدون تکرار', daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه', custom: 'سفارشی' };
const SEARCH_TYPE_LABELS = { task: 'کار', habit: 'عادت', book: 'کتاب', note: 'یادداشت', university: 'دانشگاه', custom: 'بخش شخصی', calendar: 'تقویم' };
const WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const diagnostics = createDiagnostics();
const nativeTimerBridge = createNativeTimerBridge({ diagnostics, globalRef: globalThis });
diagnostics.installGlobalHandlers(window);
diagnostics.beginSession();
diagnostics.startPerformanceMonitor();

const store = createStore({
  onError: (error, context) => diagnostics.captureError('storage', error, context)
});
const uiState = {
  activeView: 'home',
  calendarOffset: 0,
  selectedDate: todayKey(),
  statsRange: 'week',
  lastToday: todayKey(),
  feedback: null
};
const selectorCache = new Map();
const dirtyViews = new Set(['home', 'calendar', 'focus', 'stats', 'more']);
let sheetReturnFocus = null;
let sheetCleanup = null;
let latestTimerSnapshot = store.getState().runtime.timer;
let completionResetTimer = null;
let timerProgressFrame = null;

function state() {
  return store.getState();
}

function cachedSelector(key, factory) {
  const revision = state().meta.revision;
  const cacheKey = `${revision}:${key}`;
  if (selectorCache.has(cacheKey)) return selectorCache.get(cacheKey);
  if (selectorCache.size > 250) selectorCache.clear();
  const value = factory();
  selectorCache.set(cacheKey, value);
  return value;
}

function activityForDate(dateKey) {
  return cachedSelector(`calendar:${dateKey}`, () => calendarActivityForDate(state(), dateKey));
}

function commit(mutator, errorMessage = 'ذخیره اطلاعات انجام نشد') {
  const started = performance.now();
  const result = store.commit(mutator);
  diagnostics.recordPerformance('store_commit', performance.now() - started, { ok: result.ok, revision: result.state?.meta?.revision });
  if (!result.ok) {
    diagnostics.captureError('storage', result.error || new Error(errorMessage), { operation: 'app_commit' });
    toast(errorMessage, 'error');
  } else {
    selectorCache.clear();
  }
  return result.ok;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}

function toast(message, type = 'success') {
  const node = $('#toast');
  node.textContent = message;
  node.dataset.type = type;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  node.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  node.classList.remove('show');
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), type === 'error' ? 3600 : 2400);
}

const formatters = new Map();
function formatter(locale, options) {
  const key = `${locale}:${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale, options));
  return formatters.get(key);
}

function formatDuration(minutes) {
  const numeric = Math.max(0, Math.round(Number(minutes || 0)));
  if (numeric < 60) return `${faDigits(numeric)} دقیقه`;
  const hours = Math.floor(numeric / 60);
  const remainder = numeric % 60;
  return remainder ? `${faDigits(hours)} ساعت و ${faDigits(remainder)} دقیقه` : `${faDigits(hours)} ساعت`;
}

function formatHours(minutes) {
  return `${faDigits((Math.round(Number(minutes || 0) / 6) / 10).toLocaleString('fa-IR'))} ساعت`;
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  const minuteSecond = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return faDigits(hours > 0 ? `${String(hours).padStart(2, '0')}:${minuteSecond}` : minuteSecond);
}

function durationSecondsFromParts(hoursValue, minutesValue, secondsValue) {
  const hours = Number(normalizeDigits(hoursValue));
  const minutes = Number(normalizeDigits(minutesValue));
  const seconds = Number(normalizeDigits(secondsValue));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return 0;
  if (hours < 0 || hours > 99 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : 0;
}

function formatPersianDate(dateKey, options = { day: 'numeric', month: 'short' }) {
  const date = dateFromKey(dateKey);
  return date ? formatter('fa-IR-u-ca-persian', options).format(date) : 'بدون تاریخ';
}

function formatGregorianDate(dateKey, options = { day: 'numeric', month: 'short' }) {
  const date = dateFromKey(dateKey);
  return date ? formatter('fa-IR-u-ca-gregory', options).format(date) : '';
}

function formatJalaliInputValue(dateKey) {
  const date = dateFromKey(dateKey);
  if (!date) return '';
  const parts = persianParts(date);
  return faDigits(`${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`);
}

function parseJalaliInputValue(value) {
  const normalized = normalizeDigits(value).trim().replace(/[.\-]/g, '/');
  const match = /^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = gregorianForPersian(year, month, day);
  if (!date) return '';
  const parts = persianParts(date);
  return parts.year === year && parts.month === month && parts.day === day ? toLocalDateKey(date) : '';
}

function isNumericInput(input) {
  return input instanceof HTMLInputElement && (
    input.type === 'number'
    || input.type === 'time'
    || input.inputMode === 'numeric'
    || input.inputMode === 'decimal'
    || input.classList.contains('jalali-date-input')
  );
}

function replaceInputSelection(input, insertedText) {
  const normalized = normalizeDigits(insertedText);
  if (!normalized) return;
  try {
    if (typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number' && typeof input.setRangeText === 'function') {
      input.setRangeText(normalized, input.selectionStart, input.selectionEnd, 'end');
    } else {
      input.value = `${normalizeDigits(input.value)}${normalized}`;
    }
  } catch {
    input.value = `${normalizeDigits(input.value)}${normalized}`;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function enhanceTimeInputs(root) {
  $$('input[type="time"]:not([data-time-enhanced])', root).forEach(input => {
    input.dataset.timeEnhanced = 'true';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.dir = 'ltr';
    input.pattern = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
    input.placeholder = '09:00';
  });
}

function enhanceDateInput(source) {
  if (!(source instanceof HTMLInputElement) || source.dataset.jalaliEnhanced === 'true') return;
  source.dataset.jalaliEnhanced = 'true';
  const required = source.required;
  const autofocus = source.autofocus;
  source.required = false;
  source.autofocus = false;
  source.type = 'hidden';

  const wrapper = document.createElement('div');
  wrapper.className = 'jalali-date-control';
  wrapper.innerHTML = `<div class="jalali-date-entry"><input type="text" class="jalali-date-input" inputmode="numeric" autocomplete="off" placeholder="۱۴۰۵/۰۵/۱۵" aria-label="تاریخ جلالی" /><button type="button" class="jalali-date-trigger" aria-label="بازکردن تقویم جلالی"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/></svg></button></div><small class="jalali-date-secondary"></small><div class="jalali-date-popover" hidden></div>`;
  source.insertAdjacentElement('afterend', wrapper);

  const input = $('.jalali-date-input', wrapper);
  const trigger = $('.jalali-date-trigger', wrapper);
  const secondary = $('.jalali-date-secondary', wrapper);
  const popover = $('.jalali-date-popover', wrapper);
  input.required = required;
  if (autofocus) input.autofocus = true;
  let monthOffset = 0;

  const syncFromSource = () => {
    input.value = formatJalaliInputValue(source.value);
    secondary.textContent = source.value ? `میلادی: ${formatGregorianDate(source.value, { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
    input.setCustomValidity('');
  };

  const commitInput = ({ announce = false } = {}) => {
    const raw = input.value.trim();
    if (!raw && !required) {
      const changed = source.value !== '';
      source.value = '';
      secondary.textContent = '';
      input.setCustomValidity('');
      if (changed) source.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const dateKey = parseJalaliInputValue(raw);
    if (!dateKey) {
      input.setCustomValidity('تاریخ جلالی معتبر را به شکل سال/ماه/روز وارد کنید.');
      if (announce) input.reportValidity();
      return false;
    }
    const changed = source.value !== dateKey;
    source.value = dateKey;
    syncFromSource();
    if (changed) {
      source.dispatchEvent(new Event('input', { bubbles: true }));
      source.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  };

  const renderPicker = () => {
    const reference = dateFromKey(source.value) || new Date();
    const month = persianMonthRange(monthOffset, reference);
    if (!month) return;
    const leading = weekdayIndex(month.startKey);
    const cells = Array.from({ length: leading }, () => '<span class="jalali-picker-day placeholder"></span>');
    for (let index = 0; index < month.length; index += 1) {
      const dateKey = addDays(month.startKey, index);
      const day = persianParts(dateFromKey(dateKey)).day;
      cells.push(`<button type="button" class="jalali-picker-day ${dateKey === source.value ? 'selected' : ''} ${dateKey === todayKey() ? 'today' : ''}" data-jalali-date="${dateKey}" aria-pressed="${dateKey === source.value}">${faDigits(day)}</button>`);
    }
    popover.innerHTML = `<div class="jalali-picker-header"><button type="button" data-jalali-next aria-label="ماه بعد">‹</button><strong>${formatter('fa-IR-u-ca-persian', { month: 'long', year: 'numeric' }).format(month.first)}</strong><button type="button" data-jalali-prev aria-label="ماه قبل">›</button></div><div class="jalali-picker-weekdays">${WEEKDAY_LABELS.map(label => `<span>${label}</span>`).join('')}</div><div class="jalali-picker-grid">${cells.join('')}</div>`;
    $('[data-jalali-prev]', popover).onclick = () => { monthOffset -= 1; renderPicker(); };
    $('[data-jalali-next]', popover).onclick = () => { monthOffset += 1; renderPicker(); };
    $$('[data-jalali-date]', popover).forEach(button => button.onclick = () => {
      source.value = button.dataset.jalaliDate;
      syncFromSource();
      source.dispatchEvent(new Event('input', { bubbles: true }));
      source.dispatchEvent(new Event('change', { bubbles: true }));
      popover.hidden = true;
      input.focus();
    });
  };

  const openPicker = () => {
    monthOffset = 0;
    renderPicker();
    popover.hidden = false;
  };

  trigger.onclick = () => popover.hidden ? openPicker() : (popover.hidden = true);
  input.addEventListener('click', openPicker);
  input.addEventListener('input', () => {
    const normalized = normalizeDigits(input.value);
    if (input.value !== normalized) input.value = normalized;
    input.setCustomValidity('');
  });
  input.addEventListener('change', () => commitInput({ announce: true }));
  input.addEventListener('blur', () => commitInput());
  syncFromSource();
}

function enhanceFormInputs(root) {
  enhanceTimeInputs(root);
  $$('input[type="date"]:not([data-jalali-enhanced])', root).forEach(enhanceDateInput);
}

function observeFormInputs(root) {
  enhanceFormInputs(root);
  const observer = new MutationObserver(() => enhanceFormInputs(root));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function normalizeNumericBeforeInput(event) {
  const input = event.target;
  if (!isNumericInput(input) || !event.data) return;
  const normalized = normalizeDigits(event.data);
  if (normalized === event.data) return;
  event.preventDefault();
  if (input.dataset.replaceOnNextInput === 'true') {
    delete input.dataset.replaceOnNextInput;
    input.value = normalized;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  replaceInputSelection(input, event.data);
}

function normalizeNumericPaste(event) {
  const input = event.target;
  if (!isNumericInput(input)) return;
  const text = event.clipboardData?.getData('text') || '';
  const normalized = normalizeDigits(text);
  if (normalized === text) return;
  event.preventDefault();
  if (input.dataset.replaceOnNextInput === 'true') {
    delete input.dataset.replaceOnNextInput;
    input.value = normalized;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  replaceInputSelection(input, normalized);
}

function normalizeNumericInput(event) {
  const input = event.target;
  if (!isNumericInput(input)) return;
  delete input.dataset.replaceOnNextInput;
  const normalized = normalizeDigits(input.value);
  if (normalized !== input.value) input.value = normalized;
}

function percent(value) {
  return `${faDigits(Math.round(Number(value || 0)))}٪`;
}

function applyTheme() {
  const current = state();
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = current.settings.theme === 'dark' || (current.settings.theme === 'system' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#ffffff');
}

function cycleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  if (!commit(draft => { draft.settings.theme = nextTheme; })) return;
  applyTheme();
  toast(nextTheme === 'dark' ? 'حالت تیره فعال شد' : 'حالت روشن فعال شد');
}

function updateClock() {
  const now = new Date();
  $('#current-time').textContent = formatter('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  $('#jalali-date').textContent = formatter('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const nextToday = toLocalDateKey(now);
  if (uiState.selectedDate === uiState.lastToday) uiState.selectedDate = nextToday;
  if (uiState.lastToday !== nextToday) renderAll();
  uiState.lastToday = nextToday;
}

function setRing(node, progress) {
  if (!node) return;
  const value = clamp(Number(progress) || 0, 0, 100);
  node.style.setProperty('--progress', value);
  const label = $('span', node);
  if (label) label.textContent = faDigits(Math.round(value));
  node.setAttribute('aria-label', `${faDigits(Math.round(value))} درصد`);
}

function ringMarkup(title, value, color, subtitle = '') {
  return `<article class="stat-ring-card card"><div class="progress-ring" style="--ring-color:${color};--progress:${clamp(value, 0, 100)}"><svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="50"/><circle class="ring-value" cx="60" cy="60" r="50"/></svg><span>${faDigits(Math.round(value))}</span></div><h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</article>`;
}

function emptyStatMarkup(title, message) {
  return `<article class="stat-ring-card stat-empty-card card"><div class="stat-empty-icon" aria-hidden="true">—</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></article>`;
}

function commandEventName(command, args) {
  const names = {
    toggleTaskOccurrence: 'task_completed',
    toggleHabitDate: 'habit_completed',
    recordReadingSession: 'reading_session_recorded',
    recordFocusSession: 'focus_session_completed'
  };
  return names[command.name] || `command_${command.name || 'anonymous'}`;
}

function applyCommand(command, args, successMessage, errorMessage) {
  const ok = commit(draft => command(draft, ...args), errorMessage);
  if (!ok) return false;
  diagnostics.trackEvent(commandEventName(command, args), { command: command.name, entityId: args?.[0]?.id || args?.[0] || null });
  renderAll();
  if (successMessage) toast(successMessage);
  return true;
}

function calculateProgress() {
  const progress = completionForDate(state(), todayKey());
  $('#daily-progress-label').textContent = percent(progress.percent);
  $('#daily-summary').textContent = progress.total
    ? `${faDigits(progress.done)} مورد از ${faDigits(progress.total)} مورد انجام شده`
    : 'برای امروز موردی ثبت نشده است';
  setRing($('.hero-card .progress-ring'), progress.percent);
}

function todayTasks() {
  return tasksOnDate(state(), todayKey()).sort((left, right) => left.time.localeCompare(right.time));
}

function toggleTask(taskId, occurrenceDate = todayKey()) {
  let completed = false;
  const ok = commit(draft => { completed = toggleTaskOccurrence(draft, taskId, occurrenceDate); });
  if (!ok) return;
  uiState.feedback = { type: 'task', id: taskId, completed };
  diagnostics.trackEvent(completed ? 'task_completed' : 'task_reopened', { taskId, occurrenceDate });
  renderAll();
  toast(completed ? 'انجام شد' : 'به فهرست بازگشت');
}

function renderTimeline() {
  const root = $('#timeline-list');
  const tasks = todayTasks();
  if (!tasks.length) {
    root.innerHTML = '<div class="empty-state">برای امروز فعالیتی ثبت نشده است.</div>';
    return;
  }
  root.innerHTML = tasks.map(task => `
    <article class="timeline-item ${task.status === 'completed' ? 'done' : ''} ${uiState.feedback?.type === 'task' && uiState.feedback.id === task.id ? 'state-feedback' : ''}" data-id="${task.id}" data-date="${task.occurrenceDate}" tabindex="0" aria-label="${escapeAttr(task.title)}">
      <time class="timeline-time">${faDigits(task.time)}</time>
      <div class="timeline-rail"><span class="timeline-dot"></span></div>
      <div class="timeline-copy"><strong>${escapeHtml(task.title)}</strong><small>${formatDuration(task.estimatedMinutes)} · ${PRIORITY_LABELS[task.priority]} · ${task.status === 'completed' ? 'انجام شد' : 'در انتظار'}</small></div>
      <div class="timeline-actions">
        <button type="button" class="timeline-edit" aria-label="ویرایش ${escapeAttr(task.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.7 4.2 4.2-.7L19 8.5 15.5 5Z"/><path d="m13.8 6.7 3.5 3.5"/></svg>
        </button>
        <button type="button" class="timeline-status" aria-label="تغییر وضعیت">${task.status === 'completed' ? '✓' : ''}</button>
      </div>
    </article>`).join('');

  $$('.timeline-item', root).forEach(itemNode => {
    $('.timeline-edit', itemNode).addEventListener('click', event => {
      event.stopPropagation();
      taskEditor(itemNode.dataset.id);
    });
    $('.timeline-status', itemNode).addEventListener('click', event => {
      event.stopPropagation();
      toggleTask(itemNode.dataset.id, itemNode.dataset.date);
    });
    let longPressed = false;
    let holdTimer;
    let pointerStartX = null;
    let pointerStartY = null;
    let swipeHandled = false;
    itemNode.addEventListener('click', () => {
      if (longPressed || swipeHandled) { longPressed = false; swipeHandled = false; return; }
      toggleTask(itemNode.dataset.id, itemNode.dataset.date);
    });
    itemNode.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleTask(itemNode.dataset.id, itemNode.dataset.date);
    });
    itemNode.addEventListener('pointerdown', event => {
      longPressed = false;
      swipeHandled = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      holdTimer = setTimeout(() => { longPressed = true; taskEditor(itemNode.dataset.id); }, 650);
    });
    itemNode.addEventListener('pointermove', event => {
      if (pointerStartX === null || pointerStartY === null) return;
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;
      if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) clearTimeout(holdTimer);
      if (Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
        swipeHandled = true;
        pointerStartX = null;
        pointerStartY = null;
        taskEditor(itemNode.dataset.id);
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(name => itemNode.addEventListener(name, () => {
      clearTimeout(holdTimer);
      pointerStartX = null;
      pointerStartY = null;
    }));
  });
}

function toggleHabit(habitId, date = todayKey()) {
  let completed = false;
  const ok = commit(draft => { completed = toggleHabitDate(draft, habitId, date); });
  if (!ok) return;
  uiState.feedback = { type: 'habit', id: habitId, completed };
  diagnostics.trackEvent(completed ? 'habit_completed' : 'habit_reopened', { habitId, date });
  renderAll();
  toast(completed ? 'عادت ثبت شد' : 'علامت انجام برداشته شد');
}

function renderHabits() {
  const root = $('#habit-list');
  const current = state();
  const habits = activeHabitsOnDate(current, todayKey());
  const month = persianMonthRange(0, new Date());
  const completed = habits.filter(habit => habitEntryForDate(current, habit.id, todayKey())).length;
  $('#habit-count').textContent = `${faDigits(completed)} از ${faDigits(habits.length)}`;
  if (!habits.length) {
    root.innerHTML = '<div class="empty-state card">هنوز عادتی ثبت نشده است.</div>';
    return;
  }
  const colors = ['var(--ring-green)', 'var(--ring-orange)', 'var(--ring-purple)', 'var(--ring-teal)', 'var(--ring-pink)'];
  const summaries = habits.map(habit => ({
    habit,
    done: Boolean(habitEntryForDate(current, habit.id, todayKey())),
    streak: currentHabitStreak(current, habit.id, todayKey()),
    adherence: habitAdherence(current, habit.id, month?.startKey || todayKey(), todayKey())
  }));
  root.innerHTML = summaries.map((summary, index) => `
    <article class="habit-card card ${summary.done ? 'done' : ''} ${uiState.feedback?.type === 'habit' && uiState.feedback.id === summary.habit.id ? 'state-feedback' : ''}" data-id="${summary.habit.id}" tabindex="0">
      <div class="habit-top"><button type="button" class="habit-check" aria-label="تکمیل ${escapeAttr(summary.habit.title)}">${summary.done ? '✓' : ''}</button>
        <div class="progress-ring mini-ring" style="--ring-color:${colors[index % colors.length]};--progress:${summary.adherence.percent}"><svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="50"/><circle class="ring-value" cx="60" cy="60" r="50"/></svg><span>${faDigits(summary.adherence.percent)}</span></div></div>
      <div><h3>${escapeHtml(summary.habit.title)}</h3><p>${percent(summary.adherence.percent)} این ماه</p></div>
      <div class="habit-streak"><span>تداوم</span><strong>${faDigits(summary.streak)} روز</strong></div>
    </article>`).join('');
  $$('.habit-card', root).forEach(card => {
    $('.habit-check', card).onclick = event => { event.stopPropagation(); toggleHabit(card.dataset.id); };
    card.onclick = () => habitDetailSheet(card.dataset.id);
    card.onkeydown = event => { if (event.key === 'Enter') habitDetailSheet(card.dataset.id); };
  });
}

function upcomingItems() {
  const current = state();
  const start = addDays(todayKey(), 1);
  const end = addDays(todayKey(), 14);
  const tasks = taskOccurrencesInRange(current, start, end)
    .filter(item => item.status !== 'completed')
    .map(item => ({ id: item.id, type: 'task', title: item.title, date: item.occurrenceDate, priority: item.priority }));
  const university = activeEntities(current.data.universityItems)
    .filter(item => moduleStatusFor(current, item.moduleId || 'university') === MODULE_STATUS.ACTIVE)
    .filter(item => item.deadline && item.status !== 'completed' && compareDateKeys(item.deadline, start) >= 0 && compareDateKeys(item.deadline, end) <= 0)
    .map(item => ({ id: item.id, type: 'university', title: item.title, date: item.deadline, priority: item.priority }));
  return [...tasks, ...university].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 5);
}

function renderUpcoming() {
  const root = $('#upcoming-list');
  const items = upcomingItems();
  root.innerHTML = items.length ? items.map(item => `<button type="button" class="compact-row" data-id="${item.id}" data-type="${item.type}"><span><strong>${escapeHtml(item.title)}</strong><small>${formatPersianDate(item.date)} · ${PRIORITY_LABELS[item.priority]}</small></span><b>›</b></button>`).join('') : '<div class="empty-state">کار پیش‌رویی ثبت نشده است.</div>';
  $$('.compact-row', root).forEach(row => row.onclick = () => row.dataset.type === 'task' ? taskEditor(row.dataset.id) : universityEditor(row.dataset.id));
}

function renderFocusBars() {
  const root = $('#focus-bars');
  const dates = Array.from({ length: 7 }, (_, index) => addDays(todayKey(), index - 6));
  const values = dates.map(date => focusMinutesForDate(state(), date));
  const max = Math.max(1, ...values);
  root.innerHTML = values.map((value, index) => `<i style="height:${value ? Math.max(7, value / max * 100) : 2}%" title="${formatPersianDate(dates[index])}: ${formatDuration(value)}" aria-hidden="true"></i>`).join('');
  root.setAttribute('aria-label', `تمرکز هفت روز اخیر؛ ${values.map((value, index) => `${formatPersianDate(dates[index])} ${formatDuration(value)}`).join('، ')}`);
  $('#focus-minutes-today').textContent = formatDuration(focusMinutesForDate(state(), todayKey()));
}

function lineChartMarkup(series) {
  if (!series.length) return '<div class="empty-state">داده‌ای برای نمایش وجود ندارد.</div>';
  const width = 600;
  const height = 180;
  const denominator = Math.max(1, series.length - 1);
  const points = series.map((day, index) => `${index / denominator * width},${height - day.percent / 100 * (height - 20) - 10}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function chartLabels(series) {
  if (!series.length) return '';
  const indices = series.length <= 7 ? series.map((_, index) => index) : [0, Math.floor((series.length - 1) / 2), series.length - 1];
  return indices.map(index => `<span>${formatPersianDate(series[index].date, { day: 'numeric', month: 'short' })}</span>`).join('');
}

function renderStats() {
  const stats = cachedSelector(`statistics:${uiState.statsRange}:${todayKey()}`, () => statisticsForRange(state(), uiState.statsRange, new Date()));
  const activeIds = new Set(activeModuleDefinitions(state()).map(definition => definition.id));
  $('#stats-period-label').textContent = uiState.statsRange === 'week' ? 'این هفته' : 'این ماه';
  $('#stats-trend').textContent = !stats.completion.total || stats.completion.delta === null
    ? 'داده کافی نیست'
    : `${stats.completion.delta >= 0 ? '+' : '−'}${faDigits(Math.abs(stats.completion.delta))}٪`;

  const rings = [
    stats.completion.total
      ? ringMarkup('تکمیل برنامه', stats.completion.rate, 'var(--ring-green)', `${faDigits(stats.completion.done)} از ${faDigits(stats.completion.total)}`)
      : emptyStatMarkup('تکمیل برنامه', 'برای این دوره کاری برنامه‌ریزی نشده است.'),
    stats.habits.expected
      ? ringMarkup('عادت‌ها', stats.habits.rate, 'var(--ring-orange)', `${faDigits(stats.habits.completed)} روز موفق`)
      : emptyStatMarkup('عادت‌ها', 'برای این دوره عادتی فعال نبوده است.'),
    stats.focus.minutes
      ? ringMarkup('ثبات تمرکز', stats.focus.consistency, 'var(--ring-blue)', formatDuration(stats.focus.minutes))
      : emptyStatMarkup('ثبات تمرکز', 'هنوز جلسه تمرکزی ثبت نشده است.')
  ];
  if (activeIds.has('reading')) {
    rings.push(stats.reading.sessionCount
      ? ringMarkup('هدف مطالعه', stats.reading.goalRate, 'var(--ring-purple)', `${faDigits(stats.reading.pages)} صفحه`)
      : emptyStatMarkup('مطالعه', 'بخش مطالعه فعال است اما هنوز جلسه‌ای ثبت نشده است.'));
  }
  $('#stats-rings').innerHTML = rings.join('');

  const hasCompletionData = stats.series.some(day => day.total > 0);
  $('#completion-chart').innerHTML = hasCompletionData
    ? lineChartMarkup(stats.series)
    : '<div class="empty-state">پس از ثبت کار یا عادت، روند تکمیل اینجا نمایش داده می‌شود.</div>';
  $('#completion-chart-labels').innerHTML = hasCompletionData ? chartLabels(stats.series) : '';

  const metrics = [['تمرکز ثبت‌شده', formatDuration(stats.focus.minutes), stats.focus.consistency]];
  if (activeIds.has('reading')) {
    metrics.push(['مطالعه ثبت‌شده', stats.reading.sessionCount ? formatDuration(stats.reading.minutes) : 'هنوز جلسه‌ای ثبت نشده', stats.reading.goalRate]);
    metrics.push(['پیشرفت کتاب‌ها', stats.reading.totalPages ? `${faDigits(stats.reading.currentPages)} از ${faDigits(stats.reading.totalPages)} صفحه` : 'هنوز کتابی ثبت نشده', stats.reading.progress]);
  }
  if (activeIds.has('university')) metrics.push(['پیشرفت دانشگاه', stats.university.total ? `${faDigits(stats.university.completed)} از ${faDigits(stats.university.total)} مورد` : 'هنوز موردی ثبت نشده', stats.university.averageProgress]);
  if (activeIds.has('screen-time')) metrics.push(['ثبت زمان گوشی', stats.screenTime.entries ? formatDuration(stats.screenTime.averageMinutes) : 'هنوز زمانی ثبت نشده', stats.screenTime.coverage]);
  if (activeIds.has('work')) {
    const workOccurrences = taskOccurrencesInRange(state(), stats.startKey, stats.endKey).filter(item => item.moduleId === 'work');
    const completedWork = workOccurrences.filter(item => item.status === 'completed').length;
    const workSessions = activeEntities(state().data.focusSessions || []).filter(session => session.moduleId === 'work' && session.date >= stats.startKey && session.date <= stats.endKey);
    const workMinutes = Math.round(workSessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / 60);
    const workCompletion = workOccurrences.length ? Math.round(completedWork / workOccurrences.length * 100) : 0;
    metrics.push(['کار', workOccurrences.length || workMinutes ? `${faDigits(completedWork)} از ${faDigits(workOccurrences.length)} کار · ${formatDuration(workMinutes)}` : 'هنوز فعالیت کاری ثبت نشده', workCompletion]);
  }
  if (activeIds.has('projects')) {
    const projects = activeEntities(state().data.universityItems || []).filter(item => item.moduleId === 'projects');
    const average = projects.length ? Math.round(projects.reduce((sum, item) => sum + Number(item.progress || 0), 0) / projects.length) : 0;
    metrics.push(['پروژه‌ها', projects.length ? `${faDigits(projects.length)} پروژه` : 'هنوز پروژه‌ای ثبت نشده', average]);
  }
  for (const definition of activeModuleDefinitions(state()).filter(item => item.custom && moduleSupports(item, MODULE_CAPABILITIES.STATISTICS))) {
    const customStats = customModuleStatistics(state(), definition.id, stats.startKey, stats.endKey);
    let value = customStats.total ? `${faDigits(customStats.total)} رکورد` : 'هنوز داده‌ای ثبت نشده';
    let progress = customStats.completionRate;
    if (definition.genericType === 'time_tracker') { value = customStats.total ? formatDuration(customStats.durationMinutes) : 'هنوز زمانی ثبت نشده'; progress = definition.goal?.value ? Math.round(customStats.durationMinutes / definition.goal.value * 100) : 0; }
    if (definition.genericType === 'simple_tracker') { value = customStats.total ? `${faDigits(customStats.valueTotal)} ${definition.unit || ''}`.trim() : 'هنوز مقداری ثبت نشده'; progress = definition.goal?.value ? Math.round(customStats.valueTotal / definition.goal.value * 100) : 0; }
    if (definition.genericType === 'project') progress = customStats.averageProgress;
    metrics.push([definition.name, value, clamp(progress, 0, 100)]);
  }
  $('#metrics-list').innerHTML = metrics.map(([label, value, progress]) => `<div class="metric-row"><span>${escapeHtml(label)}</span><div class="metric-track"><i style="width:${clamp(progress, 0, 100)}%"></i></div><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function switchView(name, updateUrl = true) {
  const allowed = ['home', 'calendar', 'focus', 'stats', 'more'];
  if (!allowed.includes(name)) { diagnostics.captureError('navigation', new Error('Invalid view'), { view: name }); return; }
  uiState.activeView = name;
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.view === name));
  const buttons = $$('.bottom-nav [data-view-target]');
  const index = buttons.findIndex(button => button.dataset.viewTarget === name);
  buttons.forEach(button => {
    const active = button.dataset.viewTarget === name;
    button.classList.toggle('active', active);
    button.toggleAttribute('aria-current', active);
    button.setAttribute('aria-label', button.textContent.trim());
  });
  $('.bottom-nav').style.setProperty('--indicator-x', `${-index * 100}%`);
  const titles = { home: 'روزت را آرام شروع کن', calendar: 'تقویم', focus: 'تمرکز', stats: 'آمار', more: 'بیشتر' };
  $('#page-title').textContent = titles[name];
  if (updateUrl) {
    try { history.replaceState(null, '', `${location.pathname}?view=${name}`); }
    catch (error) { diagnostics.captureError('navigation', error, { view: name }); }
  }
  diagnostics.enterScreen(name);
  renderView(name);
  $('#main-content')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function renderCalendar() {
  const month = persianMonthRange(uiState.calendarOffset, new Date());
  const root = $('#calendar-grid');
  if (!month) { root.innerHTML = '<div class="empty-state">تقویم در دسترس نیست.</div>'; return; }
  $('#calendar-heading').textContent = formatter('fa-IR-u-ca-persian', { month: 'long', year: 'numeric' }).format(month.first);
  $('#gregorian-month').textContent = formatter('fa-IR-u-ca-gregory', { month: 'long', year: 'numeric' }).format(month.first);
  const leading = weekdayIndex(month.startKey);
  const cells = Array.from({ length: leading }, () => '<span class="calendar-day placeholder"></span>');
  for (let day = 0; day < month.length; day += 1) {
    const date = addDays(month.startKey, day);
    const activity = activityForDate(date);
    cells.push(`<button type="button" class="calendar-day ${date === todayKey() ? 'today' : ''} ${date === uiState.selectedDate ? 'selected' : ''} ${hasCalendarActivity(activity) ? 'has-event' : ''}" data-date="${date}" aria-label="${escapeAttr(formatPersianDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}${hasCalendarActivity(activity) ? '، دارای فعالیت' : ''}" aria-pressed="${date === uiState.selectedDate}"><span>${faDigits(persianParts(dateFromKey(date)).day)}</span>${hasCalendarActivity(activity) ? '<i aria-hidden="true"></i>' : ''}</button>`);
  }
  root.innerHTML = cells.join('');
  $$('.calendar-day[data-date]', root).forEach(button => button.onclick = () => { uiState.selectedDate = button.dataset.date; renderCalendar(); });
  renderDayDetail(uiState.selectedDate);
}

function renderDayDetail(dateKey) {
  const activity = activityForDate(dateKey);
  $('#selected-day-title').textContent = formatPersianDate(dateKey, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#selected-day-gregorian').textContent = formatGregorianDate(dateKey, { day: 'numeric', month: 'short', year: 'numeric' });
  const books = new Map((state().data.books || []).map(book => [book.id, book]));
  const habits = new Map((state().data.habits || []).map(habit => [habit.id, habit]));
  const rows = [];
  activity.tasks.forEach(task => rows.push({ type: 'task', id: task.id, title: task.title, meta: `${faDigits(task.time)} · ${task.status === 'completed' ? 'انجام‌شده' : 'در انتظار'}` }));
  activity.taskDeadlines.forEach(task => rows.push({ type: 'task', id: task.id, title: `مهلت: ${task.title}`, meta: task.status === 'completed' ? 'انجام‌شده' : 'در انتظار' }));
  activity.habits.forEach(entry => rows.push({ type: 'habit', id: entry.habitId, title: habits.get(entry.habitId)?.title || 'عادت حذف‌شده', meta: 'عادت تکمیل شد' }));
  activity.focus.forEach(session => rows.push({ type: 'focus', id: session.id, title: session.kind === 'break' ? 'استراحت' : 'جلسه تمرکز', meta: formatDuration(session.durationSeconds / 60) }));
  activity.reading.forEach(session => rows.push({ type: 'book', id: session.bookId, title: books.get(session.bookId)?.title || 'کتاب حذف‌شده', meta: `${faDigits(session.pagesRead)} صفحه · ${formatDuration(session.durationSeconds / 60)}` }));
  activity.university.forEach(item => rows.push({ type: 'university', id: item.id, title: item.title, meta: `مهلت دانشگاه · ${UNIVERSITY_STATUS_LABELS[item.status]}` }));
  activity.notes.forEach(note => rows.push({ type: 'note', id: note.id, title: note.title, meta: 'یادداشت ویرایش شد' }));
  activity.custom?.forEach(record => rows.push({ type: 'custom', id: record.id, moduleId: record.moduleId, title: record.title || moduleSourceLabel(state(), record.moduleId), meta: moduleSourceLabel(state(), record.moduleId) }));
  if (activity.screenTime) rows.push({ type: 'screen', id: activity.screenTime.id, title: 'استفاده از گوشی', meta: formatDuration(activity.screenTime.minutes) });
  const root = $('#day-detail-content');
  root.innerHTML = rows.length ? rows.map(row => `<button type="button" class="detail-row" data-type="${row.type}" data-id="${row.id}" ${row.moduleId ? `data-module-id="${escapeAttr(row.moduleId)}"` : ''}><span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.meta)}</small></span><b>›</b></button>`).join('') : '<div class="empty-state">برای این روز اطلاعاتی ثبت نشده است.</div>';
  $$('.detail-row', root).forEach(row => row.onclick = () => openEntity(row.dataset.type, row.dataset.id, row.dataset.moduleId));
}

function openEntity(type, id, moduleId = null) {
  if (moduleId && moduleStatusFor(state(), moduleId) !== MODULE_STATUS.ACTIVE) {
    moduleUI.moduleManageSheet(moduleId);
    return;
  }
  if (type === 'task') taskEditor(id);
  if (type === 'habit') habitDetailSheet(id);
  if (type === 'book') bookSheet(id);
  if (type === 'note') noteEditor(id);
  if (type === 'university') universityEditor(id);
  if (type === 'screen') screenTimeSheet();
  if (type === 'focus') focusSessionSheet(id);
  if (type === 'custom') customRecordEditor(moduleId || (state().data.customModuleRecords || []).find(record => record.id === id)?.moduleId, id);
}

function focusSessionSheet(id) {
  const session = (state().data.focusSessions || []).find(item => item.id === id && !item.deletedAt);
  if (!session) { toast('جلسه پیدا نشد'); return; }
  const label = session.kind === 'break' ? 'استراحت' : session.kind === 'work' ? 'کار' : 'تمرکز';
  openSheet('جلسه', label, `<div class="review-summary"><div><span>تاریخ</span><strong>${formatPersianDate(session.date || toLocalDateKey(session.endedAt))}</strong></div><div><span>مدت</span><strong>${formatDuration(session.durationSeconds / 60)}</strong></div><div><span>نوع</span><strong>${label}</strong></div></div>${session.notes ? `<div class="list-card spaced-card"><div class="history-row"><span>${escapeHtml(session.notes)}</span></div></div>` : ''}<div class="sheet-actions"><button type="button" class="primary-button" id="open-focus-view">رفتن به تایمر</button></div>`, root => {
    $('#open-focus-view', root).onclick = () => { closeSheet(); switchView('focus'); };
  });
}

function activeTimerMode(snapshot = latestTimerSnapshot) {
  if (snapshot.mode === 'focus') return 'focus';
  return snapshot.phase === 'break' ? 'break' : 'work';
}

function timerProgressPercent(snapshot = latestTimerSnapshot, now = Date.now()) {
  const durationMilliseconds = Math.max(1, Number(snapshot.durationSeconds || 1) * 1000);
  const remainingMilliseconds = snapshot.status === 'running' && snapshot.endsAt
    ? Math.max(0, new Date(snapshot.endsAt).getTime() - now)
    : Math.max(0, Number(snapshot.remainingMilliseconds ?? snapshot.remainingSeconds * 1000));
  return clamp((durationMilliseconds - Math.min(durationMilliseconds, remainingMilliseconds)) / durationMilliseconds * 100, 0, 100);
}

function stopTimerProgressAnimation() {
  if (timerProgressFrame !== null) cancelAnimationFrame(timerProgressFrame);
  timerProgressFrame = null;
  $('#focus-ring')?.classList.remove('timer-live');
}

function ensureTimerProgressAnimation() {
  const ring = $('#focus-ring');
  ring.classList.add('timer-live');
  if (timerProgressFrame !== null) return;
  const frame = () => {
    timerProgressFrame = null;
    if (latestTimerSnapshot.status !== 'running') return;
    ring.style.setProperty('--progress', timerProgressPercent(latestTimerSnapshot));
    if (timerProgressPercent(latestTimerSnapshot) < 100) timerProgressFrame = requestAnimationFrame(frame);
  };
  timerProgressFrame = requestAnimationFrame(frame);
}

function updateTimerUI(snapshot = latestTimerSnapshot) {
  latestTimerSnapshot = snapshot;
  $('#timer-display').textContent = formatClock(snapshot.remainingSeconds);
  $('#timer-phase').textContent = snapshot.phase === 'focus' ? 'تمرکز' : snapshot.phase === 'work' ? 'کار' : 'استراحت';
  $('#timer-subtitle').textContent = snapshot.status === 'running' ? 'در حال اجرا' : snapshot.status === 'paused' ? 'متوقف شده' : 'آماده شروع';
  $('#home-focus-time').textContent = formatClock(snapshot.remainingSeconds);
  if (snapshot.status === 'running') ensureTimerProgressAnimation();
  else {
    stopTimerProgressAnimation();
    $('#focus-ring').style.setProperty('--progress', timerProgressPercent(snapshot));
  }
  $('#timer-start').disabled = snapshot.status === 'running';
  $('#timer-pause').disabled = snapshot.status !== 'running';
  updateFocusModeControl(snapshot);
  renderTimerPresets(snapshot);
}

function updateFocusModeControl(snapshot = latestTimerSnapshot) {
  const activeMode = activeTimerMode(snapshot);
  const buttons = $$('#focus-mode-control [data-timer-mode]');
  const index = buttons.findIndex(button => button.dataset.timerMode === activeMode);
  buttons.forEach(button => {
    const active = button.dataset.timerMode === activeMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $('#focus-mode-control').style.setProperty('--indicator-x', `${-index * 100}%`);
}

function renderTimerPresets(snapshot = latestTimerSnapshot) {
  const mode = activeTimerMode(snapshot);
  const presets = mode === 'break' ? [5, 10, 15, 20] : mode === 'work' ? [45, 50, 60, 90] : [25, 45, 60, 90];
  $('#timer-presets').innerHTML = presets.map(minutes => `<button type="button" class="chip ${Math.round(snapshot.durationSeconds / 60) === minutes ? 'active' : ''}" data-minutes="${minutes}">${faDigits(minutes)} دقیقه</button>`).join('') + '<button type="button" class="chip" data-custom-timer>سفارشی</button>';
}

function signalTimerEnd(label = 'جلسه') {
  const settings = state().settings;
  const message = `${label} به پایان رسید`;
  $('#timer-announcement').textContent = message;

  // Native iOS schedules the completion notification at start/resume and owns native
  // completion sound + haptics. The web fallback stays local to the PWA.
  if (!nativeTimerBridge.isNativeIOS()) {
    nativeTimerBridge.playWebCompletion(settings.timerSound).catch(error => diagnostics.captureError('timer', error, { operation: 'completion_sound' }));
    if (settings.timerNotifications && globalThis.Notification?.permission === 'granted') {
      try {
        new Notification('آرام', { body: message, icon: 'icons/icon-192.png', tag: 'aram-timer-complete' });
      } catch (error) {
        diagnostics.captureError('timer', error, { operation: 'completion_notification' });
      }
    }
  }
}

function clearTimerCompletionFeedback() {
  clearTimeout(completionResetTimer);
  completionResetTimer = null;
  const ring = $('#focus-ring');
  ring?.classList.remove('timer-complete');
}

function showTimerCompletion(nextRuntime) {
  const ring = $('#focus-ring');
  clearTimerCompletionFeedback();
  requestAnimationFrame(() => ring.classList.add('timer-complete'));
  if (nextRuntime.status === 'running') {
    completionResetTimer = setTimeout(() => ring.classList.remove('timer-complete'), 700);
    return;
  }
  setTimeout(() => {
    ring.style.setProperty('--progress', 100);
    $('#timer-display').textContent = '۰۰:۰۰';
    $('#timer-subtitle').textContent = 'جلسه کامل شد';
  }, 0);
  completionResetTimer = setTimeout(() => {
    ring.classList.remove('timer-complete');
    if (latestTimerSnapshot.status === 'idle') updateTimerUI(nextRuntime);
  }, 850);
}

const timer = new ReliableTimer({
  readRuntime: () => state().runtime.timer,
  saveRuntime: runtime => store.commit(draft => { draft.runtime.timer = runtime; }),
  commitCompletion: (sessions, runtime) => store.commit(draft => {
    for (const session of sessions) {
      if (!draft.data.focusSessions.some(item => item.id === session.id)) {
        draft.data.focusSessions.push({ ...session, date: toLocalDateKey(session.endedAt), createdAt: session.startedAt, updatedAt: session.endedAt, deletedAt: null, notes: '' });
      }
    }
    draft.runtime.timer = runtime;
  }),
  getSettings: () => state().settings,
  onTick: snapshot => updateTimerUI(snapshot),
  onTransition: (snapshot, reason, detail) => {
    nativeTimerBridge.handleTransition(snapshot, state().settings, reason, detail);
  },
  onComplete: (sessions, nextRuntime) => {
    const lastSession = sessions.at(-1);
    const label = lastSession?.kind === 'break' ? 'استراحت' : lastSession?.kind === 'work' ? 'بازه کار' : 'جلسه تمرکز';
    signalTimerEnd(label);
    showTimerCompletion(nextRuntime);
    sessions.forEach(session => diagnostics.trackEvent('focus_session_completed', { kind: session.kind, durationSeconds: session.durationSeconds }));
    selectorCache.clear();
    renderAll();
    toast(sessions.length > 1 ? `${faDigits(sessions.length)} بازه کامل و ثبت شد` : `${label} کامل و ثبت شد`);
  },
  onError: error => {
    diagnostics.captureError('timer', error, { runtime: latestTimerSnapshot });
    toast('ذخیره وضعیت تایمر انجام نشد', 'error');
  }
});

function configureTimerMode(mode) {
  clearTimerCompletionFeedback();
  if (mode === 'focus') timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 25 * 60 });
  else {
    const minutes = mode === 'work' ? state().settings.workPreset.workMinutes : state().settings.workPreset.breakMinutes;
    timer.configure({ mode: 'workbreak', phase: mode, durationSeconds: minutes * 60 });
  }
}

function sheetFocusable(root = $('#bottom-sheet')) {
  return $$('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', root)
    .filter(node => node.offsetParent !== null && node.getAttribute('aria-hidden') !== 'true');
}

function trapSheetFocus(event) {
  if (event.key !== 'Tab' || !$('#bottom-sheet').classList.contains('open')) return;
  const focusable = sheetFocusable();
  if (!focusable.length) { event.preventDefault(); $('#bottom-sheet').focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function openSheet(kicker, title, html, onOpen, options = {}) {
  const sheet = $('#bottom-sheet');
  const wasOpen = sheet.classList.contains('open');
  const dismissible = options.dismissible !== false;
  sheet.dataset.dismissible = String(dismissible);
  $('#sheet-close').hidden = !dismissible;
  if (!wasOpen && document.activeElement instanceof HTMLElement) sheetReturnFocus = document.activeElement;
  try { sheetCleanup?.(); } catch (error) { diagnostics.captureError('rendering', error, { component: 'bottom_sheet_cleanup' }); }
  sheetCleanup = null;
  $('#sheet-kicker').textContent = kicker;
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  const stopInputObserver = observeFormInputs($('#sheet-body'));
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  $('#sheet-backdrop').classList.add('open');
  $('.app-shell').inert = true;
  document.body.classList.add('sheet-open');
  document.body.style.overflow = 'hidden';
  sheet.scrollTop = 0;
  try {
    const cleanup = onOpen?.($('#sheet-body'));
    sheetCleanup = () => {
      stopInputObserver();
      if (typeof cleanup === 'function') cleanup();
    };
  } catch (error) {
    stopInputObserver();
    diagnostics.captureError('rendering', error, { component: 'bottom_sheet', title });
    toast('بازکردن این پنل با خطا روبه‌رو شد', 'error');
  }
  requestAnimationFrame(() => {
    const target = $('[autofocus]', sheet) || sheetFocusable(sheet)[0] || sheet;
    target.focus({ preventScroll: true });
  });
}

function closeSheet() {
  const sheet = $('#bottom-sheet');
  if (!sheet.classList.contains('open')) return;
  try { sheetCleanup?.(); } catch (error) { diagnostics.captureError('rendering', error, { component: 'bottom_sheet_cleanup' }); }
  sheetCleanup = null;
  sheet.classList.remove('open');
  $('#sheet-close').hidden = false;
  delete sheet.dataset.dismissible;
  sheet.setAttribute('aria-hidden', 'true');
  $('#sheet-backdrop').classList.remove('open');
  $('.app-shell').inert = false;
  document.body.classList.remove('sheet-open');
  document.body.style.overflow = '';
  const returnTarget = sheetReturnFocus;
  sheetReturnFocus = null;
  if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
}

function taskListRow(task) {
  const repeat = RECURRENCE_LABELS[task.recurrence?.type || 'none'];
  return `<button type="button" class="manager-row" data-id="${task.id}"><span><strong>${escapeHtml(task.title)}</strong><small>${formatPersianDate(task.startDate)} · ${PRIORITY_LABELS[task.priority]}${task.category ? ` · ${escapeHtml(task.category)}` : ''} · ${repeat}</small></span><b>›</b></button>`;
}

function scheduleSheet(initial = {}) {
  const filters = { status: 'active', priority: 'all', category: 'all', date: '', sort: 'recent', ...initial };
  openSheet('کارها', 'مدیریت و تاریخچه', '<div id="task-manager"></div>', root => {
    const container = $('#task-manager', root);
    const render = () => {
      const categories = [...new Set((state().data.tasks || []).map(task => task.category).filter(Boolean))].sort();
      let content;
      if (filters.status === 'completed') {
        const history = activeEntities(state().data.taskEntries || [])
          .filter(entry => entry.status === 'completed' && (!filters.date || entry.occurrenceDate === filters.date))
          .sort((a, b) => filters.sort === 'oldest' ? String(a.completedAt).localeCompare(String(b.completedAt)) : String(b.completedAt).localeCompare(String(a.completedAt)));
        const taskMap = new Map((state().data.tasks || []).map(task => [task.id, task]));
        content = history.length ? history.map(entry => {
          const task = taskMap.get(entry.taskId);
          return `<button type="button" class="manager-row" data-id="${entry.taskId}"><span><strong>${escapeHtml(task?.title || 'کار حذف‌شده')}</strong><small>${formatPersianDate(entry.occurrenceDate)} · تکمیل‌شده</small></span><b>›</b></button>`;
        }).join('') : '<div class="empty-state">تاریخچه تکمیلی مطابق فیلتر وجود ندارد.</div>';
      } else {
        const tasks = filterTasks(state(), filters);
        content = tasks.length ? tasks.map(taskListRow).join('') : '<div class="empty-state">کاری مطابق فیلتر وجود ندارد.</div>';
      }
      container.innerHTML = `<div class="manager-toolbar"><button type="button" class="primary-button" id="add-task">کار جدید</button></div>
        <div class="filter-grid">
          <div class="field"><label>وضعیت</label><select id="task-status"><option value="active">فعال</option><option value="pending">در انتظار امروز</option><option value="completed">تاریخچه تکمیل</option><option value="archived">آرشیو</option><option value="deleted">حذف‌شده</option></select></div>
          <div class="field"><label>اولویت</label><select id="task-priority"><option value="all">همه</option><option value="high">زیاد</option><option value="medium">متوسط</option><option value="low">کم</option></select></div>
          <div class="field"><label>دسته</label><select id="task-category"><option value="all">همه</option>${categories.map(category => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join('')}</select></div>
          <div class="field"><label>تاریخ</label><input type="date" id="task-date" value="${filters.date}" /></div>
          <div class="field"><label>مرتب‌سازی</label><select id="task-sort"><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="date">تاریخ شروع</option></select></div>
        </div><div class="list-card manager-list">${content}</div>`;
      $('#task-status', container).value = filters.status;
      $('#task-priority', container).value = filters.priority;
      $('#task-category', container).value = filters.category;
      $('#task-sort', container).value = filters.sort;
      $('#add-task', container).onclick = () => taskEditor();
      ['status', 'priority', 'category', 'sort'].forEach(key => {
        $(`#task-${key}`, container).onchange = event => { filters[key] = event.target.value; render(); };
      });
      $('#task-date', container).onchange = event => { filters.date = event.target.value; render(); };
      $$('.manager-row', container).forEach(row => row.onclick = () => taskEditor(row.dataset.id));
    };
    render();
  });
}

function recurrenceFields(task) {
  const recurrence = task?.recurrence || { type: 'none', interval: 1, unit: 'day', weekdays: [], endDate: null };
  return `<div class="field"><label>تکرار</label><select id="task-repeat"><option value="none">بدون تکرار</option><option value="daily">روزانه</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option><option value="custom">سفارشی</option></select></div>
    <div id="custom-repeat" class="subtle-panel">
      <div class="filter-grid"><div class="field"><label>هر چند</label><input type="number" id="repeat-interval" min="1" max="365" value="${recurrence.interval || 1}" /></div><div class="field"><label>واحد</label><select id="repeat-unit"><option value="day">روز</option><option value="week">هفته</option><option value="month">ماه</option></select></div></div>
      <div class="field" id="weekday-field"><label>روزهای هفته</label><div class="weekday-picker">${WEEKDAY_LABELS.map((label, index) => `<label><input type="checkbox" value="${index}" ${recurrence.weekdays?.includes(index) ? 'checked' : ''}/><span>${label}</span></label>`).join('')}</div></div>
      <div class="field"><label>پایان تکرار</label><input type="date" id="repeat-end" value="${recurrence.endDate || ''}" /></div>
    </div>`;
}

function taskEditor(id = null, defaults = {}) {
  const task = id ? (state().data.tasks || []).find(item => item.id === id) : null;
  const startDate = task?.startDate || defaults.startDate || todayKey();
  const dueDate = task ? taskDueDateForOccurrence(task, startDate) : defaults.dueDate || startDate;
  openSheet('کار', task ? 'ویرایش کار' : 'کار جدید', `<form class="form-stack" id="task-form">
    <div class="field"><label>عنوان</label><input id="task-title" required value="${escapeAttr(task?.title || defaults.title || '')}" autofocus /></div>
    <div class="filter-grid"><div class="field"><label>تاریخ شروع</label><input type="date" id="task-start" required value="${startDate}" /></div><div class="field"><label>مهلت</label><input type="date" id="task-due" required value="${dueDate}" /></div></div>
    <div class="filter-grid"><div class="field"><label>زمان</label><input type="time" id="task-time" value="${task?.time || defaults.time || '09:00'}" /></div><div class="field"><label>زمان تخمینی (دقیقه)</label><input type="number" min="1" max="1440" id="task-duration" value="${task?.estimatedMinutes || defaults.estimatedMinutes || 30}" /></div></div>
    <div class="filter-grid"><div class="field"><label>اولویت</label><select id="task-priority-edit"><option value="low">کم</option><option value="medium">متوسط</option><option value="high">زیاد</option></select></div><div class="field"><label>دسته</label><input id="task-category-edit" value="${escapeAttr(task?.category || defaults.category || '')}" placeholder="مثلاً کار، خانه یا شخصی" /></div></div>
    ${recurrenceFields(task)}
    <div class="field"><label>یادداشت</label><textarea id="task-notes">${escapeHtml(task?.notes || '')}</textarea></div>
    <div class="sheet-actions">${task?.deletedAt ? '<button type="button" class="secondary-button" id="restore-task">بازیابی</button>' : task?.archivedAt ? '<button type="button" class="secondary-button" id="unarchive-task">خروج از آرشیو</button><button type="button" class="secondary-button" id="delete-task">حذف</button>' : task ? '<button type="button" class="secondary-button" id="archive-task">آرشیو</button><button type="button" class="secondary-button" id="delete-task">حذف</button>' : '<button type="button" class="secondary-button" data-close-sheet>لغو</button>'}<button type="submit" class="primary-button" ${task?.deletedAt ? 'disabled' : ''}>ذخیره</button></div>
  </form>`, root => {
    $('#task-priority-edit', root).value = task?.priority || defaults.priority || 'medium';
    $('#task-repeat', root).value = task?.recurrence?.type || defaults.recurrence?.type || 'none';
    $('#repeat-unit', root).value = task?.recurrence?.unit || 'day';
    const updateRepeat = () => {
      const type = $('#task-repeat', root).value;
      $('#custom-repeat', root).hidden = type !== 'custom';
      $('#weekday-field', root).hidden = $('#repeat-unit', root).value !== 'week';
    };
    $('#task-repeat', root).onchange = updateRepeat;
    $('#repeat-unit', root).onchange = updateRepeat;
    updateRepeat();
    $('[data-close-sheet]', root)?.addEventListener('click', closeSheet);
    $('#task-form', root).onsubmit = event => {
      event.preventDefault();
      const start = $('#task-start', root).value;
      const due = $('#task-due', root).value;
      if (compareDateKeys(due, start) < 0) { toast('مهلت نمی‌تواند قبل از تاریخ شروع باشد'); return; }
      const repeatType = $('#task-repeat', root).value;
      const input = {
        id: task?.id,
        moduleId: task?.moduleId || defaults.moduleId || null,
        title: $('#task-title', root).value,
        startDate: start,
        dueDate: due,
        time: $('#task-time', root).value,
        estimatedMinutes: $('#task-duration', root).value,
        priority: $('#task-priority-edit', root).value,
        category: $('#task-category-edit', root).value,
        notes: $('#task-notes', root).value,
        recurrence: {
          type: repeatType,
          interval: repeatType === 'custom' ? $('#repeat-interval', root).value : 1,
          unit: repeatType === 'daily' ? 'day' : repeatType === 'weekly' ? 'week' : repeatType === 'monthly' ? 'month' : $('#repeat-unit', root).value,
          weekdays: repeatType === 'weekly' ? [weekdayIndex(start)] : $$('#weekday-field input:checked', root).map(input => Number(input.value)),
          endDate: repeatType === 'none' ? null : $('#repeat-end', root).value || null
        }
      };
      if (!applyCommand(saveTask, [input], task ? 'کار به‌روزرسانی شد' : 'کار ثبت شد')) return;
      if (input.moduleId === 'work') workSheet();
      else if (input.moduleId === 'projects') projectsSheet();
      else closeSheet();
    };
    $('#archive-task', root)?.addEventListener('click', () => { if (applyCommand(archiveTask, [task.id], 'کار آرشیو شد')) scheduleSheet({ status: 'archived' }); });
    $('#unarchive-task', root)?.addEventListener('click', () => { if (applyCommand(unarchiveTask, [task.id], 'کار فعال شد')) scheduleSheet(); });
    $('#delete-task', root)?.addEventListener('click', () => { if (applyCommand(deleteTask, [task.id], 'کار به سطل حذف منتقل شد')) scheduleSheet({ status: 'deleted' }); });
    $('#restore-task', root)?.addEventListener('click', () => { if (applyCommand(restoreTask, [task.id], 'کار بازیابی شد')) scheduleSheet({ status: task.archivedAt ? 'archived' : 'active' }); });
  });
}

function habitsSheet(initial = {}) {
  const filters = { status: 'active', sort: 'recent', ...initial };
  openSheet('عادت‌ها', 'ردیابی و تاریخچه', '<div id="habit-manager"></div>', root => {
    const container = $('#habit-manager', root);
    const render = () => {
      const habits = filterHabits(state(), filters);
      const month = persianMonthRange(0, new Date());
      container.innerHTML = `<div class="manager-toolbar"><button type="button" class="primary-button" id="add-habit">عادت جدید</button></div>
        <div class="filter-grid"><div class="field"><label>وضعیت</label><select id="habit-status"><option value="active">فعال</option><option value="done_today">انجام‌شده امروز</option><option value="missed_today">انجام‌نشده امروز</option><option value="archived">آرشیو</option><option value="deleted">حذف‌شده</option></select></div><div class="field"><label>مرتب‌سازی</label><select id="habit-sort"><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="streak">بیشترین تداوم</option></select></div></div>
        <div class="list-card manager-list">${habits.length ? habits.map(habit => {
          const current = currentHabitStreak(state(), habit.id);
          const longest = longestHabitStreak(state(), habit.id);
          const monthly = habitAdherence(state(), habit.id, month?.startKey || todayKey(), todayKey());
          return `<button type="button" class="manager-row" data-id="${habit.id}"><span><strong>${escapeHtml(habit.title)}</strong><small>تداوم ${faDigits(current)} · رکورد ${faDigits(longest)} · ${percent(monthly.percent)} ماه</small></span><b>›</b></button>`;
        }).join('') : '<div class="empty-state">عادتی مطابق فیلتر وجود ندارد.</div>'}</div>`;
      $('#habit-status', container).value = filters.status;
      $('#habit-sort', container).value = filters.sort;
      $('#add-habit', container).onclick = () => habitDetailSheet();
      $('#habit-status', container).onchange = event => { filters.status = event.target.value; render(); };
      $('#habit-sort', container).onchange = event => { filters.sort = event.target.value; render(); };
      $$('.manager-row', container).forEach(row => row.onclick = () => habitDetailSheet(row.dataset.id));
    };
    render();
  });
}

function habitDetailSheet(id = null) {
  const habit = id ? (state().data.habits || []).find(item => item.id === id) : null;
  const weekStart = addDays(todayKey(), -6);
  const month = persianMonthRange(0, new Date());
  const week = habit ? habitAdherence(state(), habit.id, weekStart, todayKey()) : null;
  const monthly = habit ? habitAdherence(state(), habit.id, month?.startKey || addDays(todayKey(), -29), todayKey()) : null;
  const history = habit ? habitHistory(state(), habit.id, addDays(todayKey(), -29), todayKey()).reverse() : [];
  const historyStart = habit ? toLocalDateKey(habit.createdAt) : null;
  const historyEnd = habit ? [habit.archivedAt, habit.deletedAt].map(value => value ? toLocalDateKey(value) : '').filter(Boolean).sort()[0] : null;
  openSheet('عادت', habit ? habit.title : 'عادت جدید', `<form class="form-stack" id="habit-form">
    <div class="field"><label>عنوان</label><input id="habit-title" required value="${escapeAttr(habit?.title || '')}" autofocus /></div>
    <div class="switch-row"><div><strong>یادآور سفارشی</strong><div class="muted">زمان ذخیره می‌شود و برای اعلان‌های آینده آماده است</div></div><button type="button" class="switch ${habit?.reminder?.enabled ? 'on' : ''}" id="habit-reminder-toggle"></button></div>
    <div class="field" id="habit-reminder-field"><label>زمان یادآور</label><input type="time" id="habit-reminder-time" value="${habit?.reminder?.time || '09:00'}" /></div>
    ${habit ? `<div class="review-summary"><div><span>تداوم فعلی</span><strong>${faDigits(currentHabitStreak(state(), habit.id))} روز</strong></div><div><span>طولانی‌ترین</span><strong>${faDigits(longestHabitStreak(state(), habit.id))} روز</strong></div><div><span>این هفته</span><strong>${percent(week.percent)}</strong></div><div><span>این ماه</span><strong>${percent(monthly.percent)}</strong></div><div><span>روزهای ازدست‌رفته ماه</span><strong>${faDigits(monthly.missed)}</strong></div></div>
      <div class="field"><label>تاریخچه ۳۰ روزه — برای تغییر هر روز لمس کنید</label><div class="history-grid">${history.map(day => { const editable = (!historyStart || compareDateKeys(day.date, historyStart) >= 0) && (!historyEnd || compareDateKeys(day.date, historyEnd) < 0); return `<button type="button" class="history-day ${day.completed ? 'done' : ''}" data-date="${day.date}" ${editable ? '' : 'disabled'}><span>${faDigits(persianParts(dateFromKey(day.date)).day)}</span><small>${WEEKDAY_LABELS[weekdayIndex(day.date)]}</small></button>`; }).join('')}</div></div>` : ''}
    <div class="sheet-actions">${habit?.deletedAt ? '<button type="button" class="secondary-button" id="restore-habit">بازیابی</button>' : habit?.archivedAt ? '<button type="button" class="secondary-button" id="unarchive-habit">فعال‌سازی</button><button type="button" class="secondary-button" id="delete-habit">حذف</button>' : habit ? '<button type="button" class="secondary-button" id="archive-habit">آرشیو</button><button type="button" class="secondary-button" id="delete-habit">حذف</button>' : '<button type="button" class="secondary-button" data-close-sheet>لغو</button>'}<button type="submit" class="primary-button" ${habit?.deletedAt ? 'disabled' : ''}>ذخیره</button></div>
  </form>`, root => {
    let reminderEnabled = habit?.reminder?.enabled === true;
    const syncReminder = () => {
      $('#habit-reminder-toggle', root).classList.toggle('on', reminderEnabled);
      $('#habit-reminder-field', root).hidden = !reminderEnabled;
    };
    $('#habit-reminder-toggle', root).onclick = () => { reminderEnabled = !reminderEnabled; syncReminder(); };
    syncReminder();
    $('[data-close-sheet]', root)?.addEventListener('click', closeSheet);
    $('#habit-form', root).onsubmit = event => {
      event.preventDefault();
      const input = { id: habit?.id, title: $('#habit-title', root).value, reminder: { enabled: reminderEnabled, time: reminderEnabled ? $('#habit-reminder-time', root).value : null } };
      if (applyCommand(saveHabit, [input], habit ? 'عادت به‌روزرسانی شد' : 'عادت ثبت شد')) closeSheet();
    };
    $$('.history-day', root).forEach(button => button.onclick = () => { toggleHabit(habit.id, button.dataset.date); habitDetailSheet(habit.id); });
    $('#archive-habit', root)?.addEventListener('click', () => { if (applyCommand(archiveHabit, [habit.id], 'عادت آرشیو شد')) habitsSheet({ status: 'archived' }); });
    $('#unarchive-habit', root)?.addEventListener('click', () => { if (applyCommand(unarchiveHabit, [habit.id], 'عادت فعال شد')) habitsSheet(); });
    $('#delete-habit', root)?.addEventListener('click', () => { if (applyCommand(deleteHabit, [habit.id], 'عادت به سطل حذف منتقل شد')) habitsSheet({ status: 'deleted' }); });
    $('#restore-habit', root)?.addEventListener('click', () => { if (applyCommand(restoreHabit, [habit.id], 'عادت بازیابی شد')) habitsSheet({ status: habit.archivedAt ? 'archived' : 'active' }); });
  });
}

function notesSheet() {
  const filters = { sort: 'recent', status: 'active' };
  openSheet('یادداشت‌ها', 'فکرها، بدون شلوغی', '<div id="notes-manager"></div>', root => {
    const container = $('#notes-manager', root);
    const render = () => {
      let notes = [...(state().data.notes || [])].filter(note => filters.status === 'deleted' ? note.deletedAt : !note.deletedAt);
      notes.sort((a, b) => filters.sort === 'oldest' ? String(a.updatedAt).localeCompare(String(b.updatedAt)) : String(b.updatedAt).localeCompare(String(a.updatedAt)));
      container.innerHTML = `<div class="manager-toolbar"><button type="button" class="primary-button" id="add-note">یادداشت جدید</button></div><div class="filter-grid"><div class="field"><label>وضعیت</label><select id="note-status"><option value="active">فعال</option><option value="deleted">حذف‌شده</option></select></div><div class="field"><label>مرتب‌سازی</label><select id="note-sort"><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option></select></div></div><div class="list-card">${notes.length ? notes.map(note => `<button type="button" class="manager-row" data-id="${note.id}"><span><strong>${escapeHtml(note.title)}</strong><small>${formatPersianDate(toLocalDateKey(note.updatedAt))}</small></span><b>›</b></button>`).join('') : '<div class="empty-state">یادداشتی وجود ندارد.</div>'}</div>`;
      $('#note-status', container).value = filters.status;
      $('#note-sort', container).value = filters.sort;
      $('#add-note', container).onclick = () => noteEditor();
      $('#note-status', container).onchange = event => { filters.status = event.target.value; render(); };
      $('#note-sort', container).onchange = event => { filters.sort = event.target.value; render(); };
      $$('.manager-row', container).forEach(row => row.onclick = () => noteEditor(row.dataset.id));
    };
    render();
  });
}

function noteEditor(id = null) {
  const note = id ? (state().data.notes || []).find(item => item.id === id) : null;
  openSheet('یادداشت', note ? 'ویرایش یادداشت' : 'یادداشت جدید', `<form class="form-stack" id="note-form"><div class="field"><label>عنوان</label><input id="note-title" value="${escapeAttr(note?.title || '')}" autofocus /></div><div class="field"><label>متن</label><textarea id="note-body">${escapeHtml(note?.body || '')}</textarea></div><div class="sheet-actions">${note?.deletedAt ? '<button type="button" class="secondary-button" id="restore-note">بازیابی</button>' : note ? '<button type="button" class="secondary-button" id="delete-note">حذف</button>' : '<button type="button" class="secondary-button" data-close-sheet>لغو</button>'}<button type="button" class="primary-button" ${note?.deletedAt ? 'disabled' : ''}>ذخیره</button></div></form>`, root => {
    $('[data-close-sheet]', root)?.addEventListener('click', closeSheet);
    $('#note-form', root).onsubmit = event => { event.preventDefault(); if (applyCommand(saveNote, [{ id: note?.id, title: $('#note-title', root).value, body: $('#note-body', root).value }], 'یادداشت ذخیره شد')) closeSheet(); };
    $('#delete-note', root)?.addEventListener('click', () => { if (applyCommand(deleteNote, [note.id], 'یادداشت حذف شد')) notesSheet(); });
    $('#restore-note', root)?.addEventListener('click', () => { if (applyCommand(restoreNote, [note.id], 'یادداشت بازیابی شد')) notesSheet(); });
  });
}

function readingSheet(initial = {}) {
  const filters = { status: 'active', sort: 'recent', ...initial };
  openSheet('مطالعه', 'کتاب‌ها و جلسه‌ها', '<div id="reading-manager"></div>', root => {
    const container = $('#reading-manager', root);
    const render = () => {
      const books = filterBooks(state(), filters);
      const current = currentBook(state());
      const daily = readingGoalForDate(state(), todayKey());
      const weekly = readingSummaryForRange(state(), addDays(todayKey(), -6), todayKey());
      const month = persianMonthRange(0, new Date());
      const monthly = readingSummaryForRange(state(), month?.startKey || addDays(todayKey(), -29), todayKey());
      container.innerHTML = `<div class="review-summary"><div><span>کتاب فعلی</span><strong>${escapeHtml(current?.title || '—')}</strong></div><div><span>هدف امروز</span><strong>${percent(daily.percent)}</strong></div><div><span>این هفته</span><strong>${formatDuration(weekly.minutes)}</strong></div><div><span>این ماه</span><strong>${faDigits(monthly.pages)} صفحه</strong></div></div>
        <div class="manager-toolbar"><button type="button" class="primary-button" id="add-book">کتاب جدید</button><button type="button" class="secondary-button" id="reading-goal">هدف روزانه</button><button type="button" class="secondary-button" id="quick-reading">ثبت جلسه</button></div>
        <div class="filter-grid"><div class="field"><label>وضعیت</label><select id="book-status"><option value="active">فعال</option><option value="current">کتاب فعلی</option><option value="finished">تمام‌شده</option><option value="archived">آرشیو</option><option value="deleted">حذف‌شده</option></select></div><div class="field"><label>مرتب‌سازی</label><select id="book-sort"><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option></select></div></div>
        <div class="list-card">${books.length ? books.map(book => { const progress = book.totalPages ? Math.round(book.currentPage / book.totalPages * 100) : 0; return `<button type="button" class="manager-row book-manager-row" data-id="${book.id}"><span><strong>${escapeHtml(book.title)}${state().settings.currentBookId === book.id ? ' · فعلی' : ''}</strong><small>${faDigits(book.currentPage)} از ${faDigits(book.totalPages)} صفحه${book.author ? ` · ${escapeHtml(book.author)}` : ''}</small><i class="mini-progress"><i style="width:${progress}%"></i></i></span><b>›</b></button>`; }).join('') : '<div class="empty-state">کتابی مطابق فیلتر وجود ندارد.</div>'}</div>`;
      $('#book-status', container).value = filters.status;
      $('#book-sort', container).value = filters.sort;
      $('#add-book', container).onclick = () => bookEditor();
      $('#reading-goal', container).onclick = readingGoalSheet;
      $('#quick-reading', container).onclick = () => quickAddSheet('reading');
      $('#book-status', container).onchange = event => { filters.status = event.target.value; render(); };
      $('#book-sort', container).onchange = event => { filters.sort = event.target.value; render(); };
      $$('.book-manager-row', container).forEach(row => row.onclick = () => bookSheet(row.dataset.id));
    };
    render();
  });
}

function bookEditor(id = null) {
  const book = id ? (state().data.books || []).find(item => item.id === id) : null;
  openSheet('کتاب', book ? 'ویرایش کتاب' : 'کتاب جدید', `<form class="form-stack" id="book-form"><div class="field"><label>عنوان</label><input id="book-title" required value="${escapeAttr(book?.title || '')}" autofocus /></div><div class="field"><label>نویسنده</label><input id="book-author" value="${escapeAttr(book?.author || '')}" /></div><div class="filter-grid"><div class="field"><label>تعداد صفحات</label><input type="number" min="1" id="book-total" value="${book?.totalPages || 200}" /></div><div class="field"><label>صفحه فعلی</label><input type="number" min="0" id="book-current" value="${book?.currentPage || 0}" /></div></div><label class="check-row"><input type="checkbox" id="book-current-choice" ${state().settings.currentBookId === book?.id || !book ? 'checked' : ''}/><span>کتاب فعلی باشد</span></label><div class="sheet-actions"><button type="button" class="secondary-button" data-close-sheet>لغو</button><button type="submit" class="primary-button">ذخیره</button></div></form>`, root => {
    $('[data-close-sheet]', root).onclick = closeSheet;
    $('#book-form', root).onsubmit = event => {
      event.preventDefault();
      const totalPages = clampInteger($('#book-total', root).value, 1, 100000);
      const currentPage = clampInteger($('#book-current', root).value, 0, totalPages);
      const input = { id: book?.id, title: $('#book-title', root).value, author: $('#book-author', root).value, totalPages, currentPage, makeCurrent: $('#book-current-choice', root).checked };
      if (applyCommand(saveBook, [input], book ? 'کتاب به‌روزرسانی شد' : 'کتاب ثبت شد')) readingSheet();
    };
  });
}

function bookSheet(id) {
  const book = (state().data.books || []).find(item => item.id === id);
  if (!book) { readingSheet(); return; }
  const sessions = activeEntities(state().data.readingSessions || []).filter(session => session.bookId === id).sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)));
  const progress = book.totalPages ? Math.round(book.currentPage / book.totalPages * 100) : 0;
  openSheet('کتاب', book.title, `<div class="review-summary"><div><span>پیشرفت</span><strong>${percent(progress)}</strong></div><div><span>صفحه</span><strong>${faDigits(book.currentPage)} / ${faDigits(book.totalPages)}</strong></div><div><span>جلسه‌ها</span><strong>${faDigits(sessions.length)}</strong></div><div><span>زمان کل</span><strong>${formatDuration(sessions.reduce((sum, item) => sum + item.durationSeconds, 0) / 60)}</strong></div></div>
    <div class="manager-toolbar">${!book.deletedAt && !book.archivedAt ? '<button type="button" class="primary-button" id="record-reading">ثبت جلسه</button><button type="button" class="secondary-button" id="edit-book">ویرایش</button>' : !book.deletedAt ? '<button type="button" class="secondary-button" id="edit-book">ویرایش</button>' : ''}${!book.deletedAt && !book.archivedAt && state().settings.currentBookId !== book.id ? '<button type="button" class="secondary-button" id="set-current-book">کتاب فعلی</button>' : ''}</div>
    <div class="list-card"><h3 class="list-heading">تاریخچه مطالعه</h3>${sessions.length ? sessions.map(session => `<div class="history-row"><span><strong>${formatPersianDate(session.date)}</strong><small>${faDigits(session.pagesRead)} صفحه · ${formatDuration(session.durationSeconds / 60)}${session.notes ? ` · ${escapeHtml(session.notes)}` : ''}</small></span></div>`).join('') : '<div class="empty-state">هنوز جلسه‌ای ثبت نشده است.</div>'}</div>
    <div class="sheet-actions">${book.deletedAt ? '<button type="button" class="secondary-button" id="restore-book">بازیابی</button>' : book.archivedAt ? '<button type="button" class="secondary-button" id="unarchive-book">فعال‌سازی</button><button type="button" class="secondary-button" id="delete-book">حذف</button>' : '<button type="button" class="secondary-button" id="archive-book">آرشیو</button><button type="button" class="secondary-button" id="delete-book">حذف</button>'}</div>`, root => {
    $('#record-reading', root)?.addEventListener('click', () => readingSessionSheet(book.id));
    $('#edit-book', root)?.addEventListener('click', () => bookEditor(book.id));
    $('#set-current-book', root)?.addEventListener('click', () => { if (applyCommand(setCurrentBook, [book.id], 'کتاب فعلی تغییر کرد')) bookSheet(book.id); });
    $('#archive-book', root)?.addEventListener('click', () => { if (applyCommand(archiveBook, [book.id], 'کتاب آرشیو شد')) readingSheet({ status: 'archived' }); });
    $('#unarchive-book', root)?.addEventListener('click', () => { if (applyCommand(unarchiveBook, [book.id], 'کتاب فعال شد')) readingSheet(); });
    $('#delete-book', root)?.addEventListener('click', () => { if (applyCommand(deleteBook, [book.id], 'کتاب به سطل حذف منتقل شد')) readingSheet({ status: 'deleted' }); });
    $('#restore-book', root)?.addEventListener('click', () => { if (applyCommand(restoreBook, [book.id], 'کتاب بازیابی شد')) readingSheet({ status: book.archivedAt ? 'archived' : 'active' }); });
  });
}

function readingSessionSheet(bookId = state().settings.currentBookId) {
  const books = activeEntities(state().data.books || []).filter(book => !book.archivedAt);
  const selected = books.find(book => book.id === bookId) || currentBook(state()) || books[0];
  if (!selected) { toast('ابتدا یک کتاب ثبت کنید'); bookEditor(); return; }
  openSheet('مطالعه', 'ثبت جلسه', `<form class="form-stack" id="reading-session-form"><div class="field"><label>کتاب</label><select id="session-book">${books.map(book => `<option value="${book.id}">${escapeHtml(book.title)}</option>`).join('')}</select></div><div class="field"><label>تاریخ</label><input type="date" id="session-date" value="${todayKey()}" /></div><div class="filter-grid"><div class="field"><label>از صفحه</label><input type="number" min="0" id="session-from" value="${selected.currentPage}" /></div><div class="field"><label>تا صفحه</label><input type="number" min="0" id="session-to" value="${selected.currentPage}" /></div></div><div class="field"><label>زمان (دقیقه)</label><input type="number" min="0" max="1440" id="session-minutes" value="30" /></div><div class="field"><label>یادداشت</label><textarea id="session-notes"></textarea></div><div class="sheet-actions"><button type="button" class="secondary-button" data-close-sheet>لغو</button><button type="submit" class="primary-button">ثبت جلسه</button></div></form>`, root => {
    $('#session-book', root).value = selected.id;
    const updateBook = () => {
      const book = books.find(item => item.id === $('#session-book', root).value);
      if (!book) return;
      $('#session-from', root).value = book.currentPage;
      $('#session-to', root).value = book.currentPage;
      $('#session-to', root).max = book.totalPages;
    };
    $('#session-book', root).onchange = updateBook;
    $('[data-close-sheet]', root).onclick = closeSheet;
    $('#reading-session-form', root).onsubmit = event => {
      event.preventDefault();
      const book = books.find(item => item.id === $('#session-book', root).value);
      const fromPage = clampInteger($('#session-from', root).value, 0, book.totalPages);
      const toPage = clampInteger($('#session-to', root).value, fromPage, book.totalPages);
      const input = { bookId: book.id, date: $('#session-date', root).value, fromPage, toPage, minutes: $('#session-minutes', root).value, notes: $('#session-notes', root).value };
      if (applyCommand(recordReadingSession, [input], 'جلسه مطالعه ثبت شد')) bookSheet(book.id);
    };
  });
}

function readingGoalSheet() {
  const goal = state().settings.readingGoal;
  openSheet('مطالعه', 'هدف روزانه', `<form class="form-stack" id="reading-goal-form"><div class="field"><label>دقیقه در روز (صفر یعنی غیرفعال)</label><input type="number" min="0" max="1440" id="goal-minutes" value="${goal.minutes}" /></div><div class="field"><label>صفحه در روز (صفر یعنی غیرفعال)</label><input type="number" min="0" max="10000" id="goal-pages" value="${goal.pages}" /></div><div class="sheet-actions"><button type="button" class="secondary-button" data-close-sheet>لغو</button><button type="submit" class="primary-button">ذخیره</button></div></form>`, root => {
    $('[data-close-sheet]', root).onclick = closeSheet;
    $('#reading-goal-form', root).onsubmit = event => { event.preventDefault(); if (applyCommand(setReadingGoal, [{ minutes: $('#goal-minutes', root).value, pages: $('#goal-pages', root).value }], 'هدف مطالعه ذخیره شد')) readingSheet(); };
  });
}

function universitySheet(initial = {}) {
  const filters = { lifecycle: 'active', status: 'all', type: 'all', priority: 'all', date: '', sort: 'deadline', moduleId: 'university', ...initial };
  openSheet('دانشگاه', 'کارهای دانشگاهی', '<div id="university-manager"></div>', root => {
    const container = $('#university-manager', root);
    const render = () => {
      const items = filterUniversity(state(), filters);
      const statsItems = activeEntities(state().data.universityItems || []).filter(item => (item.moduleId || 'university') === filters.moduleId);
      const completedCount = statsItems.filter(item => item.status === 'completed').length;
      const stats = { total: statsItems.length, completed: completedCount, overdue: statsItems.filter(item => item.status !== 'completed' && item.deadline && item.deadline < todayKey()).length, averageProgress: statsItems.length ? Math.round(statsItems.reduce((sum, item) => sum + Number(item.progress || 0), 0) / statsItems.length) : 0, estimatedHours: Math.round(statsItems.reduce((sum, item) => sum + Number(item.estimatedHours || 0), 0) * 10) / 10 };
      container.innerHTML = `<div class="review-summary"><div><span>کل</span><strong>${faDigits(stats.total)}</strong></div><div><span>تکمیل‌شده</span><strong>${faDigits(stats.completed)}</strong></div><div><span>عقب‌افتاده</span><strong>${faDigits(stats.overdue)}</strong></div><div><span>پیشرفت</span><strong>${percent(stats.averageProgress)}</strong></div><div><span>زمان تخمینی</span><strong>${faDigits(stats.estimatedHours)} ساعت</strong></div></div>
        <div class="manager-toolbar"><button type="button" class="primary-button" id="add-university">مورد جدید</button></div>
        <div class="filter-grid"><div class="field"><label>چرخه</label><select id="uni-lifecycle"><option value="active">فعال</option><option value="archived">آرشیو</option><option value="deleted">حذف‌شده</option></select></div><div class="field"><label>وضعیت</label><select id="uni-status"><option value="all">همه</option>${Object.entries(UNIVERSITY_STATUS_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>نوع</label><select id="uni-type"><option value="all">همه</option>${Object.entries(UNIVERSITY_TYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>اولویت</label><select id="uni-priority"><option value="all">همه</option><option value="high">زیاد</option><option value="medium">متوسط</option><option value="low">کم</option></select></div><div class="field"><label>مهلت</label><input type="date" id="uni-date" value="${filters.date}" /></div><div class="field"><label>مرتب‌سازی</label><select id="uni-sort"><option value="deadline">مهلت</option><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option></select></div></div>
        <div class="list-card">${items.length ? items.map(item => `<button type="button" class="manager-row" data-id="${item.id}"><span><strong>${escapeHtml(item.title)}</strong><small>${UNIVERSITY_TYPE_LABELS[item.type]} · ${UNIVERSITY_STATUS_LABELS[item.status]} · ${PRIORITY_LABELS[item.priority]}${item.deadline ? ` · ${formatPersianDate(item.deadline)}` : ''}</small><i class="mini-progress"><i style="width:${item.progress}%"></i></i></span><b>›</b></button>`).join('') : '<div class="empty-state">موردی مطابق فیلتر وجود ندارد.</div>'}</div>`;
      $('#uni-lifecycle', container).value = filters.lifecycle;
      $('#uni-status', container).value = filters.status;
      $('#uni-type', container).value = filters.type;
      $('#uni-priority', container).value = filters.priority;
      $('#uni-sort', container).value = filters.sort;
      $('#add-university', container).onclick = () => universityEditor(null, { moduleId: filters.moduleId });
      ['lifecycle', 'status', 'type', 'priority', 'sort'].forEach(key => $(`#uni-${key}`, container).onchange = event => { filters[key] = event.target.value; render(); });
      $('#uni-date', container).onchange = event => { filters.date = event.target.value; render(); };
      $$('.manager-row', container).forEach(row => row.onclick = () => universityEditor(row.dataset.id, { moduleId: filters.moduleId }));
    };
    render();
  });
}

function universityEditor(id = null, defaults = {}) {
  const item = id ? (state().data.universityItems || []).find(entity => entity.id === id) : null;
  openSheet('دانشگاه', item ? 'ویرایش مورد' : 'مورد جدید', `<form class="form-stack" id="university-form"><div class="field"><label>عنوان</label><input id="uni-title-edit" required value="${escapeAttr(item?.title || defaults.title || '')}" autofocus /></div><div class="filter-grid"><div class="field"><label>نوع</label><select id="uni-type-edit">${Object.entries(UNIVERSITY_TYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>مهلت</label><input type="date" id="uni-deadline-edit" value="${item?.deadline || defaults.deadline || todayKey()}" /></div></div><div class="filter-grid"><div class="field"><label>وضعیت</label><select id="uni-status-edit">${Object.entries(UNIVERSITY_STATUS_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>اولویت</label><select id="uni-priority-edit"><option value="low">کم</option><option value="medium">متوسط</option><option value="high">زیاد</option></select></div></div><div class="filter-grid"><div class="field"><label>پیشرفت</label><input type="number" min="0" max="100" id="uni-progress-edit" value="${item?.progress || 0}" /></div><div class="field"><label>زمان تخمینی (ساعت)</label><input type="number" min="0" step="0.5" id="uni-hours-edit" value="${item?.estimatedHours || 1}" /></div></div><div class="field"><label>یادداشت</label><textarea id="uni-notes-edit">${escapeHtml(item?.notes || '')}</textarea></div><div class="sheet-actions">${item?.deletedAt ? '<button type="button" class="secondary-button" id="restore-university">بازیابی</button>' : item?.archivedAt ? '<button type="button" class="secondary-button" id="unarchive-university">فعال‌سازی</button><button type="button" class="secondary-button" id="delete-university">حذف</button>' : item ? '<button type="button" class="secondary-button" id="archive-university">آرشیو</button><button type="button" class="secondary-button" id="delete-university">حذف</button>' : '<button type="button" class="secondary-button" data-close-sheet>لغو</button>'}<button type="submit" class="primary-button" ${item?.deletedAt ? 'disabled' : ''}>ذخیره</button></div></form>`, root => {
    $('#uni-type-edit', root).value = item?.type || defaults.type || 'assignment';
    $('#uni-status-edit', root).value = item?.status || defaults.status || 'not_started';
    $('#uni-priority-edit', root).value = item?.priority || defaults.priority || 'medium';
    const syncStatus = () => { if ($('#uni-status-edit', root).value === 'completed') $('#uni-progress-edit', root).value = 100; };
    $('#uni-status-edit', root).onchange = syncStatus;
    $('[data-close-sheet]', root)?.addEventListener('click', closeSheet);
    $('#university-form', root).onsubmit = event => {
      event.preventDefault();
      const input = { id: item?.id, moduleId: item?.moduleId || defaults.moduleId || 'university', title: $('#uni-title-edit', root).value, type: $('#uni-type-edit', root).value, deadline: $('#uni-deadline-edit', root).value || null, status: $('#uni-status-edit', root).value, priority: $('#uni-priority-edit', root).value, progress: $('#uni-progress-edit', root).value, estimatedHours: $('#uni-hours-edit', root).value, notes: $('#uni-notes-edit', root).value };
      if (applyCommand(saveUniversityItem, [input], item ? 'مورد به‌روزرسانی شد' : 'مورد ثبت شد')) (input.moduleId === 'projects' ? projectsSheet() : universitySheet({ moduleId: input.moduleId }));
    };
    $('#archive-university', root)?.addEventListener('click', () => { if (applyCommand(archiveUniversityItem, [item.id], 'مورد آرشیو شد')) (item.moduleId === 'projects' ? projectsSheet() : universitySheet({ lifecycle: 'archived', moduleId: item.moduleId || 'university' })); });
    $('#unarchive-university', root)?.addEventListener('click', () => { if (applyCommand(unarchiveUniversityItem, [item.id], 'مورد فعال شد')) (item.moduleId === 'projects' ? projectsSheet() : universitySheet({ moduleId: item.moduleId || 'university' })); });
    $('#delete-university', root)?.addEventListener('click', () => { if (applyCommand(deleteUniversityItem, [item.id], 'مورد به سطل حذف منتقل شد')) (item.moduleId === 'projects' ? projectsSheet() : universitySheet({ lifecycle: 'deleted', moduleId: item.moduleId || 'university' })); });
    $('#restore-university', root)?.addEventListener('click', () => { if (applyCommand(restoreUniversityItem, [item.id], 'مورد بازیابی شد')) (item.moduleId === 'projects' ? projectsSheet() : universitySheet({ lifecycle: item.archivedAt ? 'archived' : 'active', moduleId: item.moduleId || 'university' })); });
  });
}


const moduleUI = createModuleUI({
  getState: state,
  commit,
  applyCommand,
  openSheet,
  closeSheet,
  toast,
  downloadJson,
  store,
  appVersion: APP_VERSION,
  escapeHtml,
  escapeAttr,
  faDigits,
  formatDuration,
  formatPersianDate,
  percent,
  todayKey,
  taskListRow,
  openReading: readingSheet,
  openUniversity: universitySheet,
  openScreenTime: screenTimeSheet,
  openTaskEditor: taskEditor,
  openUniversityEditor: universityEditor
});
const {
  renderMoreView,
  renderTodayModules,
  openModule,
  moduleLibrarySheet,
  customRecordEditor
} = moduleUI;

function reviewRingGrid(rings) {
  const colors = ['var(--ring-green)', 'var(--ring-orange)', 'var(--ring-blue)', 'var(--ring-purple)'];
  return `<div class="rings-grid compact-rings">${Object.entries(rings).map(([label, value], index) => ringMarkup(label, value, colors[index % colors.length])).join('')}</div>`;
}

function moduleReviewRows(items = []) {
  if (!items.length) return '';
  return `<div class="list-card spaced-card"><h3 class="list-heading">بخش‌های شخصی</h3>${items.map(item => {
    let value = `${faDigits(item.total)} رکورد`;
    if (item.type === 'time_tracker') value = formatDuration(item.durationMinutes);
    if (item.type === 'simple_tracker') value = `${faDigits(item.valueTotal)} ${item.unit || ''}`.trim();
    if (item.type === 'project') value = percent(item.averageProgress);
    if (item.type === 'routine' || item.type === 'list') value = `${faDigits(item.completed)} از ${faDigits(item.total)}`;
    return `<div class="comparison-row"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }).join('')}</div>`;
}

function reviewsSheet(initialMode = 'daily', selectedDate = todayKey()) {
  let mode = initialMode;
  let date = selectedDate;
  openSheet('مرورها', 'گزارش خودکار', '<div id="reviews-root"></div>', root => {
    const container = $('#reviews-root', root);
    const render = () => {
      let body = '';
      if (mode === 'daily') {
        const report = dailyReview(state(), date);
        const summary = [
          ['کارهای کامل', faDigits(report.completedTasks.length)],
          ['عادت‌های کامل', faDigits(report.completedHabits.length)],
          ['تمرکز', formatDuration(report.focusMinutes)]
        ];
        if (moduleStatusFor(state(), 'reading') === MODULE_STATUS.ACTIVE) summary.push(['مطالعه', formatDuration(report.readingMinutes)]);
        summary.push(['بهره‌وری', percent(report.productivity.percent)]);
        body = `<div class="field"><label>روز</label><input type="date" id="review-date" value="${date}" /></div><div class="review-summary">${summary.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
          <div class="list-card"><h3 class="list-heading">کارهای انجام‌شده</h3>${report.completedTasks.length ? report.completedTasks.map(item => `<div class="history-row"><strong>${escapeHtml(item.title)}</strong></div>`).join('') : '<div class="empty-state">کاری تکمیل نشده است.</div>'}</div>
          <div class="list-card spaced-card"><h3 class="list-heading">عادت‌های انجام‌شده</h3>${report.completedHabits.length ? report.completedHabits.map(item => `<div class="history-row"><strong>${escapeHtml(item.title)}</strong></div>`).join('') : '<div class="empty-state">عادتی تکمیل نشده است.</div>'}</div>
          <div class="list-card spaced-card"><h3 class="list-heading">باقی‌مانده</h3>${report.unfinished.length ? report.unfinished.map(item => `<button type="button" class="manager-row" data-type="${item.type}" data-id="${item.id}"><span><strong>${escapeHtml(item.title)}</strong><small>${SEARCH_TYPE_LABELS[item.type] || 'مورد'}</small></span><b>›</b></button>`).join('') : '<div class="empty-state">مورد ناتمامی باقی نمانده است.</div>'}</div>${moduleReviewRows(report.moduleSummaries)}`;
      } else if (mode === 'weekly') {
        const report = weeklyReview(state(), new Date());
        const rings = { 'کارها': report.rings.tasks, 'عادت‌ها': report.rings.habits, 'تمرکز': report.rings.focus };
        if (report.readingEnabled) rings['مطالعه'] = report.rings.reading;
        const summary = [
          ['کار تکمیل‌شده', `${faDigits(report.taskCompleted)} / ${faDigits(report.taskTotal)}`],
          ['موفقیت عادت', percent(report.habitRate)],
          ['تمرکز', formatHours(report.focusMinutes)]
        ];
        if (report.readingEnabled) summary.push(['مطالعه', formatHours(report.readingMinutes)]);
        summary.push(['روز پربازده', report.mostProductiveDay ? formatPersianDate(report.mostProductiveDay.date) : '—']);
        summary.push(['روز کم‌بازده', report.leastProductiveDay ? formatPersianDate(report.leastProductiveDay.date) : '—']);
        body = `${reviewRingGrid(rings)}<div class="review-summary">${summary.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="list-card"><h3 class="list-heading">بینش‌های هفته</h3>${report.insights.map(insight => `<div class="history-row"><span>${escapeHtml(insight)}</span></div>`).join('')}</div>${moduleReviewRows(report.moduleSummaries)}`;
      } else {
        const report = monthlyReview(state(), new Date());
        const labels = { completion: 'نرخ تکمیل', habits: 'عادت‌ها', focusMinutes: 'دقایق تمرکز', readingMinutes: 'دقایق مطالعه', readingPages: 'صفحات مطالعه' };
        const rings = { 'تکمیل': report.current.completion.rate, 'عادت‌ها': report.current.habits.rate, 'تمرکز': report.current.focus.consistency };
        if (report.readingEnabled) rings['مطالعه'] = report.current.reading.goalRate;
        const comparisons = Object.entries(report.comparisons).filter(([key]) => report.readingEnabled || !key.startsWith('reading'));
        const improvements = report.improvements.filter(item => report.readingEnabled || !item.key.startsWith('reading'));
        const weakAreas = report.weakAreas.filter(item => report.readingEnabled || item.key !== 'reading');
        body = `${reviewRingGrid(rings)}<div class="list-card"><h3 class="list-heading">مقایسه با ماه قبل</h3>${comparisons.map(([key, item]) => `<div class="comparison-row"><span>${labels[key]}</span><strong>${key.includes('Minutes') || key === 'readingPages' ? faDigits(item.current) : percent(item.current)}</strong><small class="${item.delta >= 0 ? 'positive' : 'negative'}">${item.delta >= 0 ? '+' : '−'}${faDigits(Math.abs(item.delta))}</small></div>`).join('')}</div>
          <div class="list-card spaced-card"><h3 class="list-heading">تداوم عادت‌ها</h3>${report.streaks.length ? report.streaks.map(item => `<div class="comparison-row"><span>${escapeHtml(item.title)}</span><strong>${faDigits(item.current)} روز</strong><small>رکورد ${faDigits(item.longest)}</small></div>`).join('') : '<div class="empty-state">عادتی ثبت نشده است.</div>'}</div>
          <div class="list-card spaced-card"><h3 class="list-heading">بهبودها</h3>${improvements.length ? improvements.map(item => `<div class="history-row"><span>${escapeHtml(labels[item.key] || item.key)}: +${faDigits(item.delta)}</span></div>`).join('') : '<div class="empty-state">بهبود قابل‌مقایسه‌ای ثبت نشده است.</div>'}</div>
          <div class="list-card spaced-card"><h3 class="list-heading">نقاط نیازمند توجه</h3>${weakAreas.length ? weakAreas.map(item => `<div class="history-row"><span>${escapeHtml(labels[item.key] || item.key)}</span></div>`).join('') : '<div class="empty-state">ضعف مشخصی از داده‌های این ماه دیده نمی‌شود.</div>'}</div>${moduleReviewRows(report.moduleSummaries)}`;
      }
      container.innerHTML = `<div class="segmented review-tabs"><button type="button" data-review="daily" class="${mode === 'daily' ? 'active' : ''}">روزانه</button><button type="button" data-review="weekly" class="${mode === 'weekly' ? 'active' : ''}">هفتگی</button><button type="button" data-review="monthly" class="${mode === 'monthly' ? 'active' : ''}">ماهانه</button></div>${body}`;
      $$('[data-review]', container).forEach(button => button.onclick = () => { mode = button.dataset.review; render(); });
      $('#review-date', container)?.addEventListener('change', event => { date = event.target.value; render(); });
      $$('.manager-row[data-type]', container).forEach(row => row.onclick = () => openEntity(row.dataset.type, row.dataset.id));
    };
    render();
  });
}

function searchSheet() {
  let type = 'all';
  let sort = 'recent';
  openSheet('جست‌وجو', 'پیدا کردن در همه‌جا', `<div class="search-panel"><div class="field"><label>عبارت جست‌وجو</label><input id="search-input" type="search" autocomplete="off" placeholder="کار، عادت، کتاب، یادداشت، پروژه یا تاریخ" autofocus /></div><div class="filter-grid"><div class="field"><label>نوع</label><select id="search-type"><option value="all">همه</option>${Object.entries(SEARCH_TYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>مرتب‌سازی</label><select id="search-sort"><option value="recent">جدیدترین</option><option value="oldest">قدیمی‌ترین</option></select></div></div><label class="check-row"><input type="checkbox" id="search-hidden-modules" ${state().settings.modulePreferences?.showHiddenSearchResults ? 'checked' : ''}/><span>نمایش نتایج بخش‌های مخفی</span></label><div id="search-results" class="list-card"></div></div>`, root => {
    const input = $('#search-input', root);
    const resultsRoot = $('#search-results', root);
    const render = () => {
      const includeHiddenModules = $('#search-hidden-modules', root).checked;
      const results = globalSearch(state(), input.value, { types: type === 'all' ? null : [type], includeArchived: true, includeDeleted: false, includeHiddenModules, sort });
      resultsRoot.innerHTML = input.value.trim() ? (results.length ? results.map(result => { const sourceModuleId = result.sourceModuleId || result.moduleId || ''; return `<button type="button" class="manager-row search-result" data-type="${result.type}" data-id="${result.id}" ${sourceModuleId ? `data-module-id="${escapeAttr(sourceModuleId)}"` : ''}><span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(result.sourceModule || SEARCH_TYPE_LABELS[result.type] || 'آرام')} · ${escapeHtml(result.subtitle || '')}</small></span><b>›</b></button>`; }).join('') : '<div class="empty-state">نتیجه‌ای پیدا نشد.</div>') : '<div class="empty-state">برای جست‌وجوی فوری تایپ کنید.</div>';
      $$('.search-result', resultsRoot).forEach(row => row.onclick = () => {
        if (row.dataset.type === 'calendar') {
          const target = dateFromKey(row.dataset.id);
          const targetPersian = persianParts(target);
          const currentPersian = persianParts(new Date());
          uiState.calendarOffset = (targetPersian.year * 12 + targetPersian.month) - (currentPersian.year * 12 + currentPersian.month);
          uiState.selectedDate = row.dataset.id;
          closeSheet(); switchView('calendar'); renderCalendar();
        } else openEntity(row.dataset.type, row.dataset.id, row.dataset.moduleId);
      });
    };
    input.oninput = render;
    $('#search-type', root).onchange = event => { type = event.target.value; render(); };
    $('#search-sort', root).onchange = event => { sort = event.target.value; render(); };
    $('#search-hidden-modules', root).onchange = event => {
      if (commit(draft => setHiddenSearchPreference(draft, event.target.checked))) render();
    };
    render();
    setTimeout(() => input.focus(), 50);
  });
}

function quickAddSheet(initialType = 'task') {
  const availableTypes = [['task', 'کار'], ['habit', 'عادت'], ['focus', 'تمرکز']];
  if (moduleStatusFor(state(), 'reading') === MODULE_STATUS.ACTIVE) availableTypes.splice(2, 0, ['reading', 'مطالعه']);
  if (moduleStatusFor(state(), 'university') === MODULE_STATUS.ACTIVE) availableTypes.splice(availableTypes.length - 1, 0, ['university', 'دانشگاه']);
  let type = availableTypes.some(([value]) => value === initialType) ? initialType : 'task';
  openSheet('افزودن سریع', 'مورد جدید', '<div id="quick-add-root"></div>', root => {
    const container = $('#quick-add-root', root);
    const render = () => {
      const tabs = `<div class="quick-tabs">${availableTypes.map(([value, label]) => `<button type="button" data-quick-type="${value}" class="${type === value ? 'active' : ''}">${label}</button>`).join('')}</div>`;
      let form = '';
      if (type === 'task') form = `<form class="form-stack" id="quick-form"><div class="field"><label>عنوان کار</label><input id="quick-title" required autofocus /></div><div class="filter-grid"><div class="field"><label>تاریخ</label><input type="date" id="quick-date" value="${todayKey()}" /></div><div class="field"><label>مهلت</label><input type="date" id="quick-due" value="${todayKey()}" /></div></div><div class="filter-grid"><div class="field"><label>زمان</label><input type="time" id="quick-time" value="09:00" /></div><div class="field"><label>دقیقه</label><input type="number" min="1" id="quick-duration" value="30" /></div></div><div class="filter-grid"><div class="field"><label>اولویت</label><select id="quick-priority"><option value="low">کم</option><option value="medium" selected>متوسط</option><option value="high">زیاد</option></select></div><div class="field"><label>دسته</label><input id="quick-category" /></div></div><div class="field"><label>تکرار</label><select id="quick-repeat"><option value="none">بدون تکرار</option><option value="daily">روزانه</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option></select></div><button type="submit" class="primary-button">ثبت کار</button></form>`;
      if (type === 'habit') form = `<form class="form-stack" id="quick-form"><div class="field"><label>عنوان عادت</label><input id="quick-title" required autofocus /></div><label class="check-row"><input type="checkbox" id="quick-reminder"/><span>ذخیره زمان یادآور برای آینده</span></label><div class="field" id="quick-reminder-field"><label>زمان</label><input type="time" id="quick-reminder-time" value="09:00" /></div><button type="submit" class="primary-button">ثبت عادت</button></form>`;
      if (type === 'reading') {
        const books = activeEntities(state().data.books || []).filter(book => !book.archivedAt);
        form = books.length ? `<form class="form-stack" id="quick-form"><div class="field"><label>کتاب</label><select id="quick-book">${books.map(book => `<option value="${book.id}">${escapeHtml(book.title)}</option>`).join('')}</select></div><div class="field"><label>تاریخ</label><input type="date" id="quick-date" value="${todayKey()}" /></div><div class="filter-grid"><div class="field"><label>صفحه خوانده‌شده</label><input type="number" min="0" id="quick-pages" value="10" /></div><div class="field"><label>دقیقه</label><input type="number" min="0" id="quick-minutes" value="30" /></div></div><button type="submit" class="primary-button">ثبت جلسه</button></form>` : '<div class="empty-state">برای ثبت جلسه ابتدا یک کتاب بسازید.</div><button type="button" class="primary-button" id="quick-add-book">کتاب جدید</button>';
      }
      if (type === 'university') form = `<form class="form-stack" id="quick-form"><div class="field"><label>عنوان</label><input id="quick-title" required autofocus /></div><div class="filter-grid"><div class="field"><label>نوع</label><select id="quick-uni-type">${Object.entries(UNIVERSITY_TYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="field"><label>مهلت</label><input type="date" id="quick-date" value="${todayKey()}" /></div></div><div class="field"><label>اولویت</label><select id="quick-priority"><option value="low">کم</option><option value="medium" selected>متوسط</option><option value="high">زیاد</option></select></div><button type="submit" class="primary-button">ثبت مورد</button></form>`;
      if (type === 'focus') form = `<form class="form-stack" id="quick-form"><div class="filter-grid"><div class="field"><label>نوع جلسه</label><select id="quick-focus-kind"><option value="focus">تمرکز</option><option value="work">کار</option><option value="break">استراحت</option></select></div><div class="field"><label>تاریخ</label><input type="date" id="quick-date" value="${todayKey()}" /></div></div><div class="field"><label>مدت (دقیقه)</label><input type="number" min="1" max="1440" id="quick-minutes" value="25" /></div><div class="field"><label>یادداشت</label><input id="quick-notes" /></div><button type="submit" class="primary-button">ثبت جلسه</button></form>`;
      container.innerHTML = tabs + form;
      $$('[data-quick-type]', container).forEach(button => button.onclick = () => { type = button.dataset.quickType; render(); });
      $('#quick-add-book', container)?.addEventListener('click', () => bookEditor());
      if (type === 'habit') {
        const sync = () => { $('#quick-reminder-field', container).hidden = !$('#quick-reminder', container).checked; };
        $('#quick-reminder', container).onchange = sync; sync();
      }
      $('#quick-form', container)?.addEventListener('submit', event => {
        event.preventDefault();
        if (type === 'task') {
          const start = $('#quick-date', container).value;
          const due = $('#quick-due', container).value;
          if (compareDateKeys(due, start) < 0) { toast('مهلت نمی‌تواند قبل از تاریخ باشد'); return; }
          const repeat = $('#quick-repeat', container).value;
          const input = { title: $('#quick-title', container).value, startDate: start, dueDate: due, time: $('#quick-time', container).value, estimatedMinutes: $('#quick-duration', container).value, priority: $('#quick-priority', container).value, category: $('#quick-category', container).value, recurrence: { type: repeat, unit: repeat === 'weekly' ? 'week' : repeat === 'monthly' ? 'month' : 'day', interval: 1, weekdays: repeat === 'weekly' ? [weekdayIndex(start)] : [], endDate: null } };
          if (applyCommand(saveTask, [input], 'کار ثبت شد')) closeSheet();
        }
        if (type === 'habit') {
          const input = { title: $('#quick-title', container).value, reminder: { enabled: $('#quick-reminder', container).checked, time: $('#quick-reminder-time', container).value } };
          if (applyCommand(saveHabit, [input], 'عادت ثبت شد')) closeSheet();
        }
        if (type === 'reading') {
          const book = state().data.books.find(item => item.id === $('#quick-book', container).value);
          const pages = clampInteger($('#quick-pages', container).value, 0, Math.max(0, book.totalPages - book.currentPage));
          const input = { bookId: book.id, date: $('#quick-date', container).value, fromPage: book.currentPage, toPage: book.currentPage + pages, minutes: $('#quick-minutes', container).value };
          if (applyCommand(recordReadingSession, [input], 'جلسه مطالعه ثبت شد')) closeSheet();
        }
        if (type === 'university') {
          const input = { moduleId: 'university', title: $('#quick-title', container).value, type: $('#quick-uni-type', container).value, deadline: $('#quick-date', container).value, priority: $('#quick-priority', container).value, status: 'not_started', progress: 0, estimatedHours: 1 };
          if (applyCommand(saveUniversityItem, [input], 'مورد دانشگاهی ثبت شد')) closeSheet();
        }
        if (type === 'focus') {
          const input = { kind: $('#quick-focus-kind', container).value, date: $('#quick-date', container).value, minutes: $('#quick-minutes', container).value, notes: $('#quick-notes', container).value };
          if (applyCommand(recordFocusSession, [input], 'جلسه ثبت شد')) closeSheet();
        }
      });
      setTimeout(() => $('input[autofocus]', container)?.focus(), 20);
    };
    render();
  });
}

function screenTimeSheet() {
  const end = todayKey();
  const dates = Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
  const entries = new Map(activeEntities(state().data.screenTimeEntries || []).map(entry => [entry.date, entry]));
  const values = dates.map(date => entries.get(date)?.minutes || 0);
  const recorded = values.filter((_, index) => entries.has(dates[index]));
  const average = recorded.length ? Math.round(recorded.reduce((sum, value) => sum + value, 0) / recorded.length) : 0;
  const max = Math.max(1, ...values);
  const bars = values.map((value, index) => `<i style="height:${value ? Math.max(7, value / max * 100) : 2}%" title="${formatPersianDate(dates[index])}: ${formatDuration(value)}"></i>`).join('');
  const todayEntry = entries.get(end);
  openSheet('استفاده از گوشی', 'ثبت و روند هفتگی', `<div class="card chart-card"><span class="section-kicker">میانگین ثبت‌شده</span><strong class="large-value">${recorded.length ? formatDuration(average) : '—'}</strong><p class="muted">${faDigits(recorded.length)} روز از هفت روز اخیر</p><div class="bar-chart screen-bars">${bars}</div></div><form class="form-stack spaced-card" id="screen-form"><div class="field"><label>زمان امروز (دقیقه)</label><input id="screen-minutes" type="number" min="0" max="1440" value="${todayEntry?.minutes ?? 0}" /></div><button type="submit" class="primary-button">ثبت امروز</button></form>`, root => {
    $('#screen-form', root).onsubmit = event => { event.preventDefault(); if (applyCommand(setScreenTime, [end, $('#screen-minutes', root).value], 'زمان امروز ثبت شد')) screenTimeSheet(); };
  });
}


function downloadJson(filename, value) {
  try {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  } catch (error) {
    diagnostics.captureError('export', error, { filename });
    toast('ساخت فایل خروجی انجام نشد', 'error');
  }
}

const developerMode = createDeveloperMode({
  diagnostics,
  getState: state,
  store,
  openSheet,
  escapeHtml,
  todayKey,
  databaseVersion: SCHEMA_VERSION,
  storageKey: STORAGE_KEY,
  toast
});

const onboarding = createOnboarding({
  getState: state,
  commit,
  openSheet,
  closeSheet,
  escapeHtml,
  toast,
  onComplete: () => renderAll()
});

function syncTimerPreferences(reason = 'settings') {
  nativeTimerBridge.handleTransition(latestTimerSnapshot, state().settings, reason);
}

function notificationPermissionSheet(returnToSettings = true) {
  openSheet('اعلان پایان تایمر', 'پایان جلسه را از دست نده', `<div class="onboarding-copy">
    <p>برای اینکه پایان جلسه را حتی وقتی آرام باز نیست متوجه شوی، اجازه اعلان لازم است.</p>
  </div><div class="sheet-actions"><button type="button" class="secondary-button" id="notification-later">فعلاً نه</button><button type="button" class="primary-button" id="notification-enable">فعال کردن اعلان‌ها</button></div>`, root => {
    $('#notification-later', root).onclick = () => returnToSettings ? settingsSheet() : closeSheet();
    $('#notification-enable', root).onclick = async () => {
      const button = $('#notification-enable', root);
      button.disabled = true;
      const permission = await nativeTimerBridge.requestNotificationPermission();
      if (permission === 'granted') {
        if (commit(draft => { draft.settings.timerNotifications = true; })) {
          syncTimerPreferences();
          toast('اعلان پایان تایمر فعال شد');
        }
        returnToSettings ? settingsSheet() : closeSheet();
        return;
      }
      toast(permission === 'denied' ? 'اجازه اعلان در تنظیمات دستگاه غیرفعال است' : 'اعلان در این دستگاه در دسترس نیست', 'error');
      returnToSettings ? settingsSheet() : closeSheet();
    };
  });
}

async function settingsSheet() {
  const capabilities = await nativeTimerBridge.refreshCapabilities();
  const current = state();
  const dark = document.documentElement.dataset.theme === 'dark';
  const notificationPermission = capabilities.notificationPermission;
  const notificationEnabled = current.settings.timerNotifications && notificationPermission === 'granted';
  const notificationHint = notificationPermission === 'denied'
    ? 'اجازه اعلان از تنظیمات دستگاه غیرفعال است'
    : notificationPermission === 'granted'
      ? 'اعلان محلی در زمان پایان جلسه'
      : 'برای پایان تایمر در پس‌زمینه';
  const notificationControl = capabilities.notificationsSupported
    ? (notificationPermission === 'denied' && capabilities.nativeIOS
      ? `<button type="button" class="text-button" id="settings-notification-system">تنظیمات iOS</button>`
      : `<button type="button" class="switch ${notificationEnabled ? 'on' : ''}" id="settings-notifications" role="switch" aria-checked="${notificationEnabled}" aria-label="اعلان پایان تایمر"></button>`)
    : '';
  const notificationRow = capabilities.notificationsSupported ? `<div class="switch-row"><div><strong>اعلان پایان تایمر</strong><div class="muted">${notificationHint}</div></div>${notificationControl}</div>` : '';
  const soundOptions = TIMER_SOUND_OPTIONS.map(option => `<option value="${option.id}" ${current.settings.timerSound === option.id ? 'selected' : ''}>${option.label}</option>`).join('');
  const liveActivityRow = capabilities.nativeIOS && capabilities.liveActivitiesSupported
    ? `<div class="switch-row"><div><strong>Live Activity</strong><div class="muted">${capabilities.liveActivitiesEnabledBySystem ? 'نمایش تایمر روی Lock Screen و Dynamic Island' : 'در تنظیمات iOS غیرفعال است'}</div></div>${capabilities.liveActivitiesEnabledBySystem ? `<button type="button" class="switch ${current.settings.liveActivities ? 'on' : ''}" id="settings-live-activity" role="switch" aria-checked="${current.settings.liveActivities}" aria-label="Live Activity"></button>` : '<button type="button" class="text-button" id="settings-live-system">تنظیمات iOS</button>'}</div>`
    : '';

  openSheet('تنظیمات', 'آرام، مطابق سلیقه تو', `<div class="list-card">
    <div class="switch-row"><div><strong>حالت تیره</strong><div class="muted">مشکی خالص برای OLED</div></div><button type="button" class="switch ${dark ? 'on' : ''}" id="settings-dark" role="switch" aria-checked="${dark}" aria-label="حالت تیره"></button></div>
    <div class="switch-row"><div><strong>ادامه خودکار تایمر</strong><div class="muted">جابجایی خودکار کار و استراحت</div></div><button type="button" class="switch ${current.settings.autoContinue ? 'on' : ''}" id="settings-auto" role="switch" aria-checked="${current.settings.autoContinue}" aria-label="ادامه خودکار تایمر"></button></div>
    ${notificationRow}
    <div class="switch-row timer-sound-row"><div><strong>صدا</strong><div class="muted">صدای پایان تایمر؛ انتخاب برای پیش‌شنیدن پخش می‌شود</div></div><select id="settings-timer-sound" aria-label="صدای پایان تایمر">${soundOptions}</select></div>
    <div class="switch-row"><div><strong>لرزش</strong><div class="muted">بازخورد لمسی ملایم برای کنترل‌های تایمر</div></div><button type="button" class="switch ${current.settings.vibration ? 'on' : ''}" id="settings-vibration" role="switch" aria-checked="${current.settings.vibration}" aria-label="لرزش تایمر"></button></div>
    ${liveActivityRow}
    <div class="switch-row"><div><strong>مدیریت بخش‌ها</strong><div class="muted">افزودن، مخفی‌کردن و ترتیب بخش‌ها</div></div><button type="button" class="text-button" id="manage-modules-setting">بازکردن</button></div>
    <div class="switch-row"><div><strong>خروجی داده</strong><div class="muted">فایل JSON شامل داده و تنظیمات بخش‌ها</div></div><button type="button" class="text-button" id="export-data">دریافت</button></div>
    <div class="switch-row"><div><strong>ورود فایل پشتیبان</strong><div class="muted">اعتبارسنجی کامل پیش از جایگزینی</div></div><button type="button" class="text-button" id="import-data">انتخاب فایل</button><input type="file" id="import-data-file" accept="application/json,.json" hidden /></div>
    <div class="switch-row"><div><strong>پاک‌کردن همه داده‌ها</strong><div class="muted">شروع دوباره با فضای خالی</div></div><button type="button" class="text-button" id="reset-data">انجام</button></div>
    <div class="switch-row version-row"><div><strong>آرام</strong><div class="muted">نسخه برنامه</div></div><button type="button" class="version-button" id="app-version" aria-label="نسخه ${APP_VERSION}">${faDigits(APP_VERSION)}</button></div>
  </div>`, root => {
    $('#settings-dark', root).onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; if (!commit(draft => { draft.settings.theme = theme; })) return; applyTheme(); diagnostics.trackEvent('theme_changed', { theme }); settingsSheet(); };
    $('#settings-auto', root).onclick = () => { if (commit(draft => { draft.settings.autoContinue = !draft.settings.autoContinue; })) { syncTimerPreferences(); settingsSheet(); } };
    $('#settings-notifications', root)?.addEventListener('click', () => {
      if (notificationEnabled) {
        if (commit(draft => { draft.settings.timerNotifications = false; })) { syncTimerPreferences(); settingsSheet(); }
        return;
      }
      if (notificationPermission === 'granted') {
        if (commit(draft => { draft.settings.timerNotifications = true; })) { syncTimerPreferences(); settingsSheet(); }
        return;
      }
      notificationPermissionSheet();
    });
    $('#settings-notification-system', root)?.addEventListener('click', () => nativeTimerBridge.openNotificationSettings());
    $('#settings-timer-sound', root).onchange = event => {
      const timerSound = event.target.value;
      if (!commit(draft => { draft.settings.timerSound = timerSound; })) return;
      syncTimerPreferences();
      nativeTimerBridge.previewSound(timerSound);
    };
    $('#settings-vibration', root).onclick = () => { if (commit(draft => { draft.settings.vibration = !draft.settings.vibration; })) { syncTimerPreferences(); settingsSheet(); } };
    $('#settings-live-activity', root)?.addEventListener('click', () => { if (commit(draft => { draft.settings.liveActivities = !draft.settings.liveActivities; })) { syncTimerPreferences(); settingsSheet(); } });
    $('#settings-live-system', root)?.addEventListener('click', () => nativeTimerBridge.openNotificationSettings());
    $('#manage-modules-setting', root).onclick = moduleLibrarySheet;
    $('#export-data', root).onclick = () => { diagnostics.trackEvent('data_exported'); downloadJson(`aram-backup-${todayKey()}.json`, store.exportData({ appVersion: APP_VERSION })); };
    $('#import-data', root).onclick = () => $('#import-data-file', root).click();
    $('#import-data-file', root).onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') { toast('فقط فایل پشتیبان JSON پذیرفته می‌شود', 'error'); return; }
      try {
        const text = await file.text();
        const result = store.importData(text);
        if (!result.ok) throw result.error || new Error('Import failed');
        selectorCache.clear();
        timer.restore();
        applyTheme();
        renderAll();
        closeSheet();
        diagnostics.trackEvent('data_imported', { schemaVersion: result.state.schemaVersion });
        toast('فایل پشتیبان با موفقیت بازیابی شد');
      } catch (error) {
        diagnostics.captureError('storage', error, { operation: 'import' });
        toast(error?.message || 'فایل پشتیبان معتبر نیست', 'error');
      } finally { event.target.value = ''; }
    };
    $('#reset-data', root).onclick = () => {
      if (!confirm('همه داده‌های محلی پاک شوند؟ این عمل قابل بازگشت نیست.')) return;
      const result = store.reset();
      if (!result.ok) { diagnostics.captureError('storage', result.error, { operation: 'reset' }); toast('پاک‌کردن داده‌ها انجام نشد', 'error'); return; }
      selectorCache.clear();
      uiState.calendarOffset = 0;
      uiState.selectedDate = todayKey();
      timer.restore();
      applyTheme();
      renderAll();
      closeSheet();
      diagnostics.trackEvent('data_reset');
      toast('همه داده‌ها پاک شدند');
      setTimeout(() => onboarding.open(), 260);
    };
    $('#app-version', root).onclick = developerMode.registerTap;
    return () => nativeTimerBridge.stopSoundPreview();
  });
}

function customTimerSheet() {
  const currentHours = Math.floor(latestTimerSnapshot.durationSeconds / 3600);
  const currentMinutes = Math.floor((latestTimerSnapshot.durationSeconds % 3600) / 60);
  const currentSeconds = latestTimerSnapshot.durationSeconds % 60;
  openSheet('زمان سفارشی', 'ساعت، دقیقه و ثانیه', `<form class="form-stack" id="custom-timer-form"><div class="duration-fields" dir="ltr"><div class="field"><label>ساعت</label><input id="custom-hours" type="text" inputmode="numeric" pattern="[0-9۰-۹٠-٩]{1,2}" value="${String(currentHours).padStart(2, '0')}" autofocus /></div><span aria-hidden="true">:</span><div class="field"><label>دقیقه</label><input id="custom-minutes" type="text" inputmode="numeric" pattern="[0-9۰-۹٠-٩]{1,2}" value="${String(currentMinutes).padStart(2, '0')}" /></div><span aria-hidden="true">:</span><div class="field"><label>ثانیه</label><input id="custom-seconds" type="text" inputmode="numeric" pattern="[0-9۰-۹٠-٩]{1,2}" value="${String(currentSeconds).padStart(2, '0')}" /></div></div><p class="muted">ترتیب از چپ: ساعت، دقیقه، ثانیه — نمونه: ۰۱:۱۵:۳۰</p><div class="sheet-actions"><button type="button" class="secondary-button" data-close-sheet>لغو</button><button type="submit" class="primary-button">اعمال</button></div></form>`, root => {
    $('[data-close-sheet]', root).onclick = closeSheet;
    $('#custom-timer-form', root).onsubmit = event => {
      event.preventDefault();
      const hoursInput = $('#custom-hours', root);
      const minutesInput = $('#custom-minutes', root);
      const secondsInput = $('#custom-seconds', root);
      const durationSeconds = durationSecondsFromParts(hoursInput.value, minutesInput.value, secondsInput.value);
      hoursInput.setCustomValidity(durationSeconds > 0 ? '' : 'مدت باید بین ۰۰:۰۰:۰۱ و ۹۹:۵۹:۵۹ باشد.');
      if (!durationSeconds) { hoursInput.reportValidity(); return; }
      const mode = activeTimerMode(latestTimerSnapshot);
      clearTimerCompletionFeedback();
      if (mode === 'focus') timer.configure({ mode: 'focus', phase: 'focus', durationSeconds, durationSource: 'custom' });
      else timer.configure({ mode: 'workbreak', phase: mode, durationSeconds, durationSource: 'custom' });
      closeSheet();
      toast(`${formatClock(durationSeconds)} تنظیم شد`);
    };
  });
}

function renderHomeView() {
  renderTimeline();
  renderHabits();
  renderUpcoming();
  calculateProgress();
  renderTodayModules();
}

function renderView(name, force = false) {
  if (!force && !dirtyViews.has(name)) return;
  try {
    diagnostics.measure(`render_${name}`, () => {
      if (name === 'home') renderHomeView();
      if (name === 'calendar') renderCalendar();
      if (name === 'focus') renderFocusBars();
      if (name === 'stats') renderStats();
      if (name === 'more') renderMoreView();
    }, { revision: state().meta.revision });
    dirtyViews.delete(name);
  } catch (error) {
    diagnostics.captureError('rendering', error, { view: name, revision: state().meta.revision });
    toast('نمایش این بخش با خطا روبه‌رو شد', 'error');
  }
}

function renderAll() {
  ['home', 'calendar', 'focus', 'stats', 'more'].forEach(view => dirtyViews.add(view));
  renderView(uiState.activeView, true);
  if (uiState.feedback) setTimeout(() => { uiState.feedback = null; }, 320);
}

function bindEvents() {
  document.addEventListener('keydown', event => {
    if (!isNumericInput(event.target) || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return;
    event.target.dataset.replaceOnNextInput = 'true';
  }, true);
  document.addEventListener('beforeinput', normalizeNumericBeforeInput, true);
  document.addEventListener('paste', normalizeNumericPaste, true);
  document.addEventListener('input', normalizeNumericInput, true);
  $('#theme-toggle').addEventListener('click', cycleTheme);
  $('#global-search').addEventListener('click', searchSheet);
  $('#manage-habits').addEventListener('click', habitsSheet);
  $$('.bottom-nav [data-view-target]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewTarget)));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.openView)));
  $('#quick-add').addEventListener('click', () => quickAddSheet());
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-backdrop').addEventListener('click', () => { if ($('#bottom-sheet').dataset.dismissible !== 'false') closeSheet(); });
  document.addEventListener('keydown', event => {
    trapSheetFocus(event);
    if (event.key === 'Escape' && $('#bottom-sheet').dataset.dismissible !== 'false') closeSheet();
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); searchSheet(); }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button,[role="button"],a[href]');
    if (!button) return;
    const label = button.getAttribute('aria-label') || button.dataset.openSheet || button.dataset.viewTarget || button.id || button.textContent?.trim().slice(0, 80) || 'unknown';
    diagnostics.trackEvent('button_click', { action: label, view: uiState.activeView });
  }, { capture: true });
  document.addEventListener('click', event => {
    const moduleButton = event.target.closest('[data-open-module]');
    if (moduleButton) { openModule(moduleButton.dataset.openModule); return; }
    if (event.target.closest('[data-open-module-library]')) { moduleLibrarySheet(); return; }
    const sheetButton = event.target.closest('[data-open-sheet]');
    if (!sheetButton) return;
    const handlers = { schedule: scheduleSheet, notes: notesSheet, reading: readingSheet, university: universitySheet, 'screen-time': screenTimeSheet, reviews: reviewsSheet, settings: settingsSheet };
    handlers[sheetButton.dataset.openSheet]?.();
  });
  $('#calendar-prev').addEventListener('click', () => { uiState.calendarOffset -= 1; renderCalendar(); });
  $('#calendar-next').addEventListener('click', () => { uiState.calendarOffset += 1; renderCalendar(); });
  $('#stats-range').addEventListener('change', event => { uiState.statsRange = event.target.value; renderStats(); });
  $$('#home-focus-presets button').forEach(button => button.addEventListener('click', () => { clearTimerCompletionFeedback(); $$('#home-focus-presets button').forEach(item => item.classList.remove('active')); button.classList.add('active'); timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: Number(button.dataset.minutes) * 60 }); }));
  $('#timer-presets').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.matches('[data-custom-timer]')) { customTimerSheet(); return; } if (!button.dataset.minutes) return; clearTimerCompletionFeedback(); const minutes = Number(button.dataset.minutes); const mode = activeTimerMode(latestTimerSnapshot); if (mode === 'focus') timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: minutes * 60 }); else { const settingKey = mode === 'work' ? 'workMinutes' : 'breakMinutes'; if (!commit(draft => { draft.settings.workPreset[settingKey] = minutes; })) return; timer.configure({ mode: 'workbreak', phase: mode, durationSeconds: minutes * 60 }); } });
  $$('#focus-mode-control [data-timer-mode]').forEach(button => button.addEventListener('click', () => configureTimerMode(button.dataset.timerMode)));
  $('#focus-mode-control').addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const buttons = $$('#focus-mode-control [data-timer-mode]'); const current = buttons.findIndex(button => button.classList.contains('active')); const next = event.key === 'ArrowLeft' ? Math.min(buttons.length - 1, current + 1) : Math.max(0, current - 1); buttons[next].focus(); configureTimerMode(buttons[next].dataset.timerMode); });
  $('#timer-start').addEventListener('click', () => { clearTimerCompletionFeedback(); timer.start(); });
  $('#timer-pause').addEventListener('click', () => timer.pause());
  $('#timer-stop').addEventListener('click', () => { clearTimerCompletionFeedback(); timer.reset(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      diagnostics.enterScreen(uiState.activeView);
      timer.reconcile();
    } else {
      diagnostics.endScreen('hidden');
      diagnostics.flush();
    }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) diagnostics.beginSession();
    diagnostics.enterScreen(uiState.activeView);
    timer.reconcile();
  });
  window.addEventListener('pagehide', () => diagnostics.endSession('pagehide'));
  window.addEventListener('beforeunload', () => diagnostics.flush());
  window.addEventListener('focus', () => timer.reconcile());
  window.addEventListener('online', () => diagnostics.trackEvent('network_changed', { online: true }));
  window.addEventListener('offline', () => diagnostics.trackEvent('network_changed', { online: false }));
}

async function init() {
  diagnostics.trackEvent('app_boot', { recovery: store.recovery, persistent: store.isPersistent });
  applyTheme();
  updateClock();
  setInterval(updateClock, 30_000);
  bindEvents();
  await nativeTimerBridge.refreshCapabilities();
  timer.restore();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state().settings.theme === 'system') applyTheme(); });
  if (!store.isPersistent) toast('ذخیره‌سازی مرورگر در دسترس نیست', 'error');
  if (store.recovery === 'backup') toast('اطلاعات از نسخه پشتیبان بازیابی شد');
  if (store.recovery === 'v4') toast('تنظیمات تایمر برای نسخه iOS با حفظ داده‌های قبلی آماده شد');
  if (store.recovery === 'v3') toast('اطلاعات قبلی با حفظ کامل به ساختار بخش‌ها منتقل شد');
  if (store.recovery === 'v2') toast('اطلاعات Phase 1 به نسخه جدید منتقل شد');
  if (store.recovery === 'legacy') toast('اطلاعات واقعی نسخه قبلی منتقل شد');

  const params = new URLSearchParams(location.search);
  const requestedView = params.get('view');
  const initialView = ['home', 'calendar', 'focus', 'stats', 'more'].includes(requestedView) ? requestedView : 'home';
  if (requestedView && requestedView !== initialView) diagnostics.captureError('navigation', new Error('Unsupported initial route'), { requestedView });
  switchView(initialView, false);

  if ('serviceWorker' in navigator && !nativeTimerBridge.isNativeIOS()) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      diagnostics.trackEvent('service_worker_registered', { scope: registration.scope });
      registration.addEventListener?.('updatefound', () => diagnostics.trackEvent('service_worker_update_found'));
    } catch (error) {
      diagnostics.captureError('service_worker', error);
    }
  }
  document.body.classList.remove('is-loading');
  document.documentElement.dataset.appReady = 'true';
  if (store.recovery === 'migration_error') {
    setTimeout(() => openSheet('بازیابی اطلاعات', 'انتقال اطلاعات کامل نشد', `<div class="empty-state"><strong>اطلاعات قبلی دست‌نخورده باقی مانده است</strong><small>آرام نتوانست تنظیمات بخش‌ها را آماده کند. می‌توانی دوباره تلاش کنی.</small><button type="button" class="primary-button" id="retry-module-migration">تلاش دوباره</button></div>`, root => {
      $('#retry-module-migration', root).onclick = () => {
        const result = store.retryMigration();
        if (!result.ok) { toast('انتقال اطلاعات هنوز کامل نشد', 'error'); return; }
        selectorCache.clear();
        renderAll();
        closeSheet();
        toast('اطلاعات با موفقیت منتقل شد');
      };
    }, { dismissible: false }), 100);
  } else if (params.get('add') === '1') setTimeout(() => quickAddSheet(), 250);
  else setTimeout(() => onboarding.maybeOpen(), 180);
}

init().catch(error => { diagnostics.captureError('bootstrap', error); toast('راه‌اندازی برنامه کامل نشد', 'error'); document.body.classList.remove('is-loading'); });

import { APP_VERSION } from './diagnostics.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const faDigits = value => String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[digit]);

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) return `${faDigits(value)} بایت`;
  if (value < 1024 * 1024) return `${faDigits((value / 1024).toFixed(1))} کیلوبایت`;
  return `${faDigits((value / 1024 / 1024).toFixed(2))} مگابایت`;
}

function formatMilliseconds(value) {
  const milliseconds = Math.max(0, Number(value || 0));
  if (milliseconds < 1000) return `${faDigits(Math.round(milliseconds))} میلی‌ثانیه`;
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${faDigits(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${faDigits(hours)} ساعت و ${faDigits(remainder)} دقیقه` : `${faDigits(hours)} ساعت`;
}

function downloadJson(filename, value, onError) {
  try {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  } catch (error) {
    onError?.(error, { filename });
  }
}

export function createDeveloperMode({
  diagnostics,
  getState,
  store,
  openSheet,
  escapeHtml,
  todayKey,
  databaseVersion,
  storageKey,
  toast
}) {
  let tapCount = 0;
  let tapTimer = null;

  function developerContent(tab, snapshot) {
    const tabs = [['overview', 'خلاصه'], ['errors', 'خطاها'], ['console', 'کنسول'], ['events', 'رویدادها'], ['performance', 'عملکرد'], ['storage', 'ذخیره‌سازی']];
    const tabBar = `<div class="developer-tabs" role="tablist" aria-label="بخش‌های حالت توسعه‌دهنده">${tabs.map(([key, label]) => `<button type="button" role="tab" aria-selected="${tab === key}" class="${tab === key ? 'active' : ''}" data-dev-tab="${key}">${label}</button>`).join('')}</div>`;
    let content = '';

    if (tab === 'overview') {
      const counts = Object.fromEntries(Object.entries(getState().data).map(([key, items]) => [key, Array.isArray(items) ? items.length : 0]));
      content = `<div class="review-summary"><div><span>نسخه برنامه</span><strong>${APP_VERSION}</strong></div><div><span>نسخه پایگاه داده</span><strong>${faDigits(databaseVersion)}</strong></div><div><span>FPS</span><strong>${snapshot.currentFps ?? '—'}</strong></div><div><span>میانگین نشست</span><strong>${formatMilliseconds(snapshot.analytics.averageSessionMs)}</strong></div></div>
        <div class="list-card"><div class="history-row"><span>خطاهای ثبت‌شده<small>JavaScript، Promise، Storage، Render، Navigation و Timer</small></span><strong>${faDigits(snapshot.errors.length)}</strong></div><div class="history-row"><span>رویدادهای محلی<small>فقط روی همین دستگاه</small></span><strong>${faDigits(snapshot.events.length)}</strong></div><div class="history-row"><span>رکوردهای برنامه<small>${Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></span><strong>${faDigits(Object.values(counts).reduce((sum, value) => sum + value, 0))}</strong></div><div class="history-row"><span>حافظه JavaScript</span><strong>${snapshot.memory ? formatBytes(snapshot.memory.usedJSHeapSize) : 'در دسترس نیست'}</strong></div></div>`;
    }
    if (tab === 'errors') content = `<div class="list-card developer-log">${snapshot.errors.length ? [...snapshot.errors].reverse().map(item => `<div class="history-row"><span><strong>${escapeHtml(item.category)} · ${escapeHtml(item.name)}</strong><small>${escapeHtml(item.message)}<br>${escapeHtml(item.at)}</small></span></div>`).join('') : '<div class="empty-state">خطایی ثبت نشده است.</div>'}</div>`;
    if (tab === 'console') content = `<div class="list-card developer-log">${snapshot.console.length ? [...snapshot.console].reverse().map(item => `<div class="history-row"><span><strong>${escapeHtml(item.level)}</strong><small>${escapeHtml(item.message)}<br>${escapeHtml(item.at)}</small></span></div>`).join('') : '<div class="empty-state">پیام کنسولی ثبت نشده است.</div>'}</div>`;
    if (tab === 'events') content = `<div class="list-card developer-log">${snapshot.events.length ? [...snapshot.events].reverse().slice(0, 200).map(item => `<div class="history-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(JSON.stringify(item.details))}<br>${escapeHtml(item.at)}</small></span></div>`).join('') : '<div class="empty-state">رویدادی ثبت نشده است.</div>'}</div>`;
    if (tab === 'performance') {
      const recent = [...snapshot.performance].reverse().slice(0, 100);
      content = `<div class="review-summary"><div><span>FPS فعلی</span><strong>${snapshot.currentFps ?? '—'}</strong></div><div><span>میانگین FPS</span><strong>${snapshot.averageFps ?? '—'}</strong></div><div><span>حافظه مصرفی</span><strong>${snapshot.memory ? formatBytes(snapshot.memory.usedJSHeapSize) : '—'}</strong></div><div><span>Long Task</span><strong>${faDigits(snapshot.performance.filter(item => item.name === 'long_task').length)}</strong></div></div><div class="list-card developer-log">${recent.map(item => `<div class="history-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.at)}</small></span><strong>${item.fps ? faDigits(item.fps) : formatMilliseconds(item.durationMs)}</strong></div>`).join('') || '<div class="empty-state">داده عملکردی ثبت نشده است.</div>'}</div>`;
    }
    if (tab === 'storage') {
      const total = snapshot.storage.reduce((sum, item) => sum + item.bytes, 0);
      content = `<div class="review-summary"><div><span>کل LocalStorage</span><strong>${formatBytes(total)}</strong></div><div><span>کلید اصلی</span><strong>${escapeHtml(storageKey)}</strong></div></div><div class="list-card">${snapshot.storage.map(item => `<div class="history-row"><span><strong>${escapeHtml(item.key)}</strong><small>${faDigits(item.characters)} نویسه</small></span><strong>${formatBytes(item.bytes)}</strong></div>`).join('') || '<div class="empty-state">LocalStorage خالی است.</div>'}</div>`;
    }

    return `${tabBar}<div id="developer-content">${content}</div><div class="sheet-actions spaced-card"><button type="button" class="secondary-button" id="clear-debug">پاک‌سازی لاگ</button><button type="button" class="secondary-button" id="refresh-debug">تازه‌سازی</button><button type="button" class="primary-button" id="export-debug">خروجی گزارش</button></div>`;
  }

  function open(tab = 'overview') {
    openSheet('Developer Mode', 'وضعیت داخلی آرام', '<div id="developer-root"></div>', root => {
      const container = $('#developer-root', root);
      const renderSnapshot = () => {
        const snapshot = diagnostics.snapshot();
        container.innerHTML = developerContent(tab, snapshot);
        $$('[data-dev-tab]', container).forEach(button => {
          button.onclick = () => open(button.dataset.devTab);
        });
        $('#refresh-debug', container).onclick = renderSnapshot;
        $('#export-debug', container).onclick = () => downloadJson(
          `aram-debug-${todayKey()}.json`,
          diagnostics.exportReport({
            databaseVersion,
            store: { revision: getState().meta.revision, recovery: store.recovery, persistent: store.isPersistent }
          }),
          (error, context) => {
            diagnostics.captureError('export', error, context);
            toast('ساخت فایل گزارش انجام نشد', 'error');
          }
        );
        $('#clear-debug', container).onclick = () => {
          diagnostics.clear({ errors: true, console: true, performance: true });
          renderSnapshot();
        };
      };
      renderSnapshot();
    });
  }

  function registerTap() {
    tapCount += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 3000);
    if (tapCount < 5) return false;
    tapCount = 0;
    clearTimeout(tapTimer);
    diagnostics.trackEvent('developer_mode_opened');
    toast('حالت توسعه‌دهنده فعال شد');
    open();
    return true;
  }

  return Object.freeze({ open, registerTap });
}

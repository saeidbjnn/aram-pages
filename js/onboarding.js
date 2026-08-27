import { finishOnboarding, saveOnboardingProgress } from './module-commands.js';
import { OPTIONAL_MODULE_DEFINITIONS } from './modules.js';

const USE_CASES = Object.freeze([
  ['daily', 'نظم روزانه'],
  ['focus', 'تمرکز بیشتر'],
  ['university', 'درس و دانشگاه'],
  ['work', 'کار و پروژه‌ها'],
  ['reading', 'مطالعه'],
  ['habits', 'ساخت عادت'],
  ['mixed', 'ترکیبی از چند مورد']
]);

export function recommendedModules(useCase) {
  const map = {
    university: ['university', 'projects'],
    work: ['work', 'projects'],
    reading: ['reading'],
    mixed: ['reading', 'university', 'work', 'projects', 'screen-time'],
    daily: [],
    focus: [],
    habits: []
  };
  return map[useCase] || [];
}

export function createOnboarding({
  getState,
  commit,
  openSheet,
  closeSheet,
  escapeHtml,
  toast,
  onComplete = () => {}
}) {
  function preferences() {
    return getState().settings.modulePreferences;
  }

  function persist(partial) {
    return commit(draft => saveOnboardingProgress(draft, partial), 'ذخیره مراحل شروع انجام نشد');
  }

  function finish({ skipped = false } = {}) {
    const current = preferences();
    const result = commit(draft => finishOnboarding(draft, {
      selections: current.onboardingSelections || [],
      useCase: current.onboardingUseCase,
      skipped
    }), 'ثبت انتخاب‌ها انجام نشد');
    if (!result) return;
    closeSheet();
    toast(skipped ? 'می‌توانی هر زمان بخش‌ها را از «بخش‌های من» اضافه کنی' : 'آرام برای نیازهای تو آماده شد');
    onComplete();
  }

  function renderStep(root, step) {
    const body = root.querySelector('#onboarding-content');
    const current = preferences();
    const selections = new Set(current.onboardingSelections || []);
    const recommendations = new Set(recommendedModules(current.onboardingUseCase));
    let content = '';

    if (step === 1) {
      content = `<div class="onboarding-copy"><span class="onboarding-step">۱ از ۴</span><h3>آرام را برای خودت بساز</h3><p>فقط بخش‌هایی را انتخاب کن که واقعاً به آن‌ها نیاز داری. هسته‌ی امروز، کارها، تمرکز، عادت‌ها و تقویم همیشه در دسترس است.</p></div>`;
    }

    if (step === 2) {
      content = `<div class="onboarding-copy"><span class="onboarding-step">۲ از ۴</span><h3>دوست داری چه چیزهایی را مدیریت کنی؟</h3><p>بعداً می‌توانی این انتخاب‌ها را تغییر بدهی.</p></div><div class="module-choice-grid">${OPTIONAL_MODULE_DEFINITIONS.map(definition => `<button type="button" class="module-choice ${selections.has(definition.id) ? 'selected' : ''}" data-onboarding-module="${definition.id}" aria-pressed="${selections.has(definition.id)}"><span class="feature-icon">${escapeHtml(definition.icon)}</span><span><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(definition.description)}${recommendations.has(definition.id) ? ' · پیشنهاد مرتبط' : ''}</small></span><i aria-hidden="true">${selections.has(definition.id) ? '✓' : '＋'}</i></button>`).join('')}</div>`;
    }

    if (step === 3) {
      content = `<div class="onboarding-copy"><span class="onboarding-step">۳ از ۴</span><h3>بیشتر برای چه چیزی از آرام استفاده می‌کنی؟</h3><p>این پاسخ فقط برای پیشنهاد بهتر است و چیزی را محدود نمی‌کند.</p></div><div class="choice-list">${USE_CASES.map(([value, label]) => `<button type="button" class="choice-row ${current.onboardingUseCase === value ? 'selected' : ''}" data-use-case="${value}" aria-pressed="${current.onboardingUseCase === value}"><span>${label}</span><i aria-hidden="true">${current.onboardingUseCase === value ? '✓' : ''}</i></button>`).join('')}</div>`;
    }

    if (step === 4) {
      const selectedDefinitions = OPTIONAL_MODULE_DEFINITIONS.filter(definition => selections.has(definition.id));
      content = `<div class="onboarding-copy"><span class="onboarding-step">۴ از ۴</span><h3>فضای تو آماده است</h3><p>${selectedDefinitions.length ? 'این بخش‌ها در «بخش‌های من» فعال می‌شوند.' : 'فعلاً فقط هسته‌ی ساده آرام نمایش داده می‌شود.'}</p></div><div class="module-preview-list">${selectedDefinitions.length ? selectedDefinitions.map(definition => `<div class="history-row"><span class="feature-icon">${escapeHtml(definition.icon)}</span><span><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(definition.description)}</small></span></div>`).join('') : '<div class="empty-state">هیچ بخش اختیاری انتخاب نشده است.<small>هر زمان خواستی می‌توانی از کتابخانه بخش‌ها چیزی اضافه کنی.</small></div>'}</div>`;
    }

    const previous = step > 1 ? '<button type="button" class="secondary-button" id="onboarding-back">بازگشت</button>' : '<button type="button" class="secondary-button" id="onboarding-skip">فعلاً رد کن</button>';
    const nextLabel = step === 4 ? 'تأیید و شروع' : 'ادامه';
    body.innerHTML = `${content}<div class="sheet-actions onboarding-actions">${previous}<button type="button" class="primary-button" id="onboarding-next">${nextLabel}</button></div>`;

    body.querySelectorAll('[data-onboarding-module]').forEach(button => {
      button.onclick = () => {
        const next = new Set(preferences().onboardingSelections || []);
        if (next.has(button.dataset.onboardingModule)) next.delete(button.dataset.onboardingModule);
        else next.add(button.dataset.onboardingModule);
        persist({ step: 2, selections: [...next] });
        renderStep(root, 2);
      };
    });

    body.querySelectorAll('[data-use-case]').forEach(button => {
      button.onclick = () => {
        const useCase = button.dataset.useCase;
        persist({ step: 3, useCase });
        renderStep(root, 3);
      };
    });

    body.querySelector('#onboarding-back')?.addEventListener('click', () => {
      persist({ step: step - 1 });
      renderStep(root, step - 1);
    });
    body.querySelector('#onboarding-skip')?.addEventListener('click', () => finish({ skipped: true }));
    body.querySelector('#onboarding-next').onclick = () => {
      if (step === 4) { finish(); return; }
      persist({ step: step + 1 });
      renderStep(root, step + 1);
    };
  }

  function open() {
    const step = Math.min(4, Math.max(1, Number(preferences().onboardingStep || 1)));
    openSheet('شروع آرام', 'انتخاب بخش‌های موردنیاز', '<div id="onboarding-content"></div>', root => {
      renderStep(root, step);
    }, { dismissible: false });
  }

  function maybeOpen() {
    if (preferences().onboardingStatus !== 'pending') return false;
    open();
    return true;
  }

  return Object.freeze({ open, maybeOpen });
}

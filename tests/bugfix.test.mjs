import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(join(root, path), 'utf8');

test('Phase 3.1 timer ring is data-driven and has no looping animation', async () => {
  const [app, css] = await Promise.all([read('app.js'), read('styles.css')]);
  assert.match(app, /timerProgressPercent/);
  assert.match(app, /requestAnimationFrame\(frame\)/);
  assert.match(css, /stroke-dashoffset:calc\(653\.451 \* \(1 - var\(--progress,0\)\/100\)\)/);
  assert.doesNotMatch(css, /countdown-ring[^}]*animation[^}]*infinite/i);
});

test('Phase 3.1 exposes meaningful empty statistics and discoverable task editing', async () => {
  const app = `${await read('app.js')}\n${await read('js/module-ui.js')}`;
  assert.match(app, /هنوز جلسه تمرکزی ثبت نشده است/);
  assert.match(app, /(?:هنوز جلسه مطالعه‌ای ثبت نشده است|بخش مطالعه فعال است اما هنوز جلسه‌ای ثبت نشده است)/);
  assert.match(app, /class="timeline-edit"/);
  assert.match(app, /Math\.abs\(deltaX\) >= 64/);
});

test('Phase 3.1 uses Jalali-first date controls with Gregorian secondary text', async () => {
  const [app, html] = await Promise.all([read('app.js'), read('index.html')]);
  assert.match(app, /class="jalali-date-input"/);
  assert.match(app, /میلادی:/);
  assert.match(html, /ماه جلالی/);
  assert.match(html, /id="gregorian-month"/);
});

test('Phase 3.1 completion feedback includes haptic, sound, announcement and animation hooks', async () => {
  const [app, html, css] = await Promise.all([read('app.js'), read('index.html'), read('styles.css')]);
  assert.match(app, /nativeTimerBridge\.playWebCompletion/);
  assert.match(app, /nativeTimerBridge\.handleTransition/);
  assert.match(app, /showTimerCompletion/);
  assert.match(html, /id="timer-announcement"[^>]*aria-live="assertive"/);
  assert.match(css, /\.countdown-ring\.timer-complete/);
});

test('Phase 3.1.1 supports hour, minute and second custom durations in fixed left-to-right order', async () => {
  const [app, css] = await Promise.all([read('app.js'), read('styles.css')]);
  assert.match(app, /id="custom-hours"/);
  assert.match(app, /id="custom-minutes"/);
  assert.match(app, /id="custom-seconds"/);
  assert.match(app, /durationSecondsFromParts\(hoursValue, minutesValue, secondsValue\)/);
  assert.match(app, /durationSource: 'custom'/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css, /\.duration-fields\{[^}]*direction:ltr/);
  assert.match(app, /normalizeNumericBeforeInput/);
  assert.match(app, /normalizeNumericPaste/);
});

test('Phase 3.1 prevents non-editable text selection and uses one consistent modal close icon', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
  assert.match(css, /:where\(body,body \*\)\{[^}]*user-select:none/);
  assert.match(css, /:where\(input[^}]*textarea,\[contenteditable="true"\]\)\{[^}]*user-select:text/);
  assert.match(html, /id="sheet-close"[^>]*><svg/);
  assert.match(css, /#sheet-close svg/);
});

test('Phase 3.1 topbar titles no longer repeat primary section headings verbatim', async () => {
  const app = await read('app.js');
  assert.match(app, /calendar: 'تقویم', focus: 'تمرکز', stats: 'آمار', more: 'بیشتر'/);
  assert.doesNotMatch(app, /focus: 'زمان برای تمرکز'/);
});

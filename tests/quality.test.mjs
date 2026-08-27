import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(join(root, path), 'utf8');

test('static application shell exposes core accessibility semantics', async () => {
  const html = await read('index.html');
  assert.match(html, /<html[^>]*lang="fa"[^>]*dir="rtl"/);
  assert.match(html, /class="skip-link"[^>]*href="#main-content"/);
  assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/);
  assert.match(html, /id="bottom-sheet"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="toast"[^>]*aria-live="polite"/);
  assert.equal((html.match(/data-view-target=/g) || []).length, 5);
  for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /\btype="button"/, `button is missing type=button: ${match[0]}`);
  }
});

test('styles include keyboard focus, reduced motion, touch target and dynamic text safeguards', async () => {
  const css = await read('styles.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /text-size-adjust:\s*100%/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('service worker shell is complete and contains every local module', async () => {
  const sw = await read('sw.js');
  const paths = [...sw.matchAll(/['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(paths.includes('./js/diagnostics.js'));
  assert.ok(paths.includes('./js/developer-mode.js'));
  assert.ok(paths.includes('./js/modules.js'));
  assert.ok(paths.includes('./js/module-commands.js'));
  assert.ok(paths.includes('./js/onboarding.js'));
  assert.ok(paths.includes('./js/module-ui.js'));
  for (const relative of new Set(paths.filter(path => !path.includes('?')))) {
    const filesystemPath = relative === './' ? 'index.html' : relative.replace(/^\.\//, '');
    await stat(join(root, filesystemPath));
  }
});

test('production source has no remote runtime dependency and remains within bundle budgets', async () => {
  const sourceFiles = ['app.js', 'js/domain.js', 'js/reports.js', 'js/commands.js', 'js/store.js', 'js/timer.js', 'js/diagnostics.js', 'js/developer-mode.js', 'js/modules.js', 'js/module-commands.js', 'js/onboarding.js', 'js/module-ui.js'];
  let total = 0;
  for (const file of sourceFiles) {
    const content = await read(file);
    total += Buffer.byteLength(content);
    assert.doesNotMatch(content, /(?:fetch|import)\s*\(\s*['"]https?:\/\//, `${file} loads a remote dependency`);
    assert.ok(Buffer.byteLength(content) < 150_000, `${file} exceeds the individual module budget`);
  }
  assert.ok(total < 430_000, `JavaScript source exceeds budget: ${total} bytes`);
});

test('generated application buttons declare explicit behavior', async () => {
  const app = await read('app.js');
  for (const match of app.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /(?:^|\s)type="(?:button|submit)"/, `generated button is missing an explicit type: ${match[0]}`);
  }
});

test('required Phase 3.3 documentation is present', async () => {
  for (const file of ['CHANGELOG.md', 'ROADMAP.md', 'PROJECT_RULES.md', 'TEST_REPORT.md', 'DEVELOPMENT_REPORT.md', 'QA_REPORT.md', 'BUG_FIX_REPORT.md', 'MODULE_ARCHITECTURE.md', 'DATA_MIGRATION_REPORT.md', 'DOGFOODING_ISSUES.md', 'PHASE3_3_REPORT.md']) {
    const info = await stat(join(root, file));
    assert.ok(info.size > 200, `${file} is unexpectedly empty`);
  }
});

test('required iOS native timer documentation and integration template are present', async () => {
  for (const file of ['IOS_NATIVE_FEATURES.md', 'LIVE_ACTIVITY.md', 'NOTIFICATION_SYSTEM.md', 'TIMER_TEST_REPORT.md', 'ios-template/README.md']) {
    const info = await stat(join(root, file));
    assert.ok(info.size > 200, `${file} is unexpectedly empty`);
  }
});

# ARAM Phase 3.1 — Bug Fix Report

## Release

- Application version: **3.1.1**
- Release date: **2026-08-06**
- Scope: targeted correction of the twelve reported defects
- UI redesign: none
- New product features: none
- Persistent application schema: unchanged at version 3


## Phase 3.1.1 timer follow-up

### Unexpected preset start after a custom Work/Break timer

**Root cause**

The Phase 3.1 safeguard covered Focus-mode completion, but a duration entered from the custom form while the Work or Break segment was selected was still persisted as an ordinary `workbreak` runtime. With Auto Continue enabled, the timer engine correctly treated that runtime as part of the preset cycle and started the opposite saved preset.

**Solution**

Timer runtime now persists `durationSource` as either `preset` or `custom`. A custom runtime always completes into an idle state with its same mode, phase and duration. It never enters the preset work/break cycle, even when Auto Continue is enabled. Existing version 3.1.0 work/break runtimes whose durations differ from the stored preset are inferred as custom during normalization.

### Hour/minute/second custom duration direction

**Root cause**

The previous form contained only minutes and seconds, and its visual order depended on the surrounding RTL layout.

**Solution**

The form now contains Hour, Minute and Second fields in an explicit LTR grid. Hour is visually left, Minute is centered and Second is right. Persian, Arabic and English digits remain accepted. Durations up to `99:59:59` are supported, and the main countdown displays `HH:MM:SS` whenever hours are present.

### Files modified for 3.1.1

- `app.js`
- `js/timer.js`
- `js/store.js`
- `styles.css`
- `js/diagnostics.js`
- `sw.js`
- `package.json`
- `tests/bugfix.test.mjs`
- `tests/timer.test.mjs`
- `tests/store.test.mjs`
- `qa/bugfix_qa.py`
- `README.md`
- `CHANGELOG.md`

### 3.1.1 regression validation

- Custom Focus timer completion remains idle.
- Custom Work timer completion remains idle with Auto Continue enabled.
- Custom Break timer uses the same standalone completion policy through the shared runtime branch.
- Built-in Work/Break presets still auto-continue when enabled.
- Existing saved custom duration inference is covered.
- `01:02:03` is stored as 3723 seconds and displayed as `۰۱:۰۲:۰۳`.
- Browser geometry confirms Hour x-position < Minute x-position < Second x-position.
- Full syntax and automated regression suite passes.
- Dedicated Chromium bug-fix QA passes without page or console errors.

## Executive result

All twelve reported issues were reproduced against the Phase 3 build, corrected at their existing integration points, and covered by regression tests. The complete pre-existing automated suite continues to pass. Final browser validation completed with no JavaScript page errors and no console errors.

## Bug 1 — Duplicate page titles

**Root cause**

The persistent top-bar title repeated the same phrase as the primary heading inside several views, creating two competing page titles.

**Solution**

The top bar now uses compact route labels (`تقویم`, `تمرکز`, `آمار`, `بیشتر`), while each screen retains its single descriptive primary heading and useful contextual kicker.

**Files modified**

- `app.js`
- `index.html`

**Regression validation**

- Compared the top-bar title and internal primary heading for Calendar, Focus, Statistics and More.
- Confirmed that no pair is identical.

## Bug 2 — Progress Ring timing

**Root cause**

The timer UI used rounded remaining seconds and passed an incorrectly scaled percentage into a countdown-ring CSS formula that expected a fractional value. This made the ring inaccurate and disconnected from real elapsed time.

**Solution**

The timer runtime now maintains `remainingMilliseconds`, `elapsedMilliseconds` and a normalized progress ratio. The visual ring calculates:

```text
elapsed milliseconds / total duration milliseconds
```

A requestAnimationFrame loop reads the stored end timestamp and renders the precise elapsed percentage. The ring reaches 100% on the same rendered frame in which the timer reaches zero.

**Files modified**

- `app.js`
- `js/timer.js`
- `js/store.js`
- `styles.css`

**Regression validation**

- Verified 1.25 seconds elapsed in a 10-second timer produces exactly 12.5% progress.
- Verified an exact 100% completion snapshot is emitted.
- Verified live browser progress increases within the expected wall-clock interval.

## Bug 3 — Progress Ring animation

**Root cause**

The ring relied on repeated CSS transitions between coarse timer updates. Rounded time and transition lag caused jumps, snapping and a delayed final state.

**Solution**

While running, the ring is updated directly per animation frame with CSS transition disabled for the live stroke. Pause cancels the visual clock while retaining the exact current progress. Resume continues from the retained milliseconds. Stop/reset leaves live mode and performs one short, controlled transition back to zero. Starting a new session explicitly clears stale completion animation state.

**Files modified**

- `app.js`
- `js/timer.js`
- `styles.css`

**Regression validation**

- Pause held the same percentage for 450 ms.
- Resume continued from the paused percentage without reset.
- Stop returned the ring to zero and removed the completion class.
- No looping CSS timer animation exists.

## Bug 4 — Empty statistics

**Root cause**

Statistics cards rendered calculated zero percentages even when their denominator was zero and no real record existed. The result looked like a performance judgment rather than an empty dataset.

**Solution**

Each unsupported statistic now renders a contextual Empty State:

- No scheduled work in the period
- No active habits in the period
- No focus sessions yet
- No reading sessions yet

The completion chart also explains what activity will make it available.

**Files modified**

- `app.js`
- `styles.css`

**Regression validation**

- A fresh store renders four descriptive empty-stat cards.
- No empty card displays only `0%`.

## Bug 5 — Task editing

**Root cause**

Editing was available only through a 650 ms long press, which was not discoverable and conflicted with browser text selection behavior.

**Solution**

Every timeline task now has a visible monochrome edit button with an accessible label. Long press remains supported. Horizontal swipe-to-edit is also implemented with movement thresholds that cancel long press and avoid accidental task completion.

**Files modified**

- `app.js`
- `styles.css`

**Regression validation**

- The edit button is visible and opens the existing task editor.
- A horizontal pointer swipe opens the same editor.
- The task status control remains independently functional.

## Bug 6 — Persian Calendar

**Root cause**

The primary month screen was Jalali, but all form date fields still exposed the browser's native Gregorian date picker, making date entry inconsistent.

**Solution**

Every existing date field is progressively enhanced into a Jalali-first text field and Jalali month picker. The internal hidden value remains the canonical Gregorian `YYYY-MM-DD` date key required by the existing data architecture. Gregorian information appears only as a secondary line. Persian and English date digits are accepted.

**Files modified**

- `app.js`
- `index.html`
- `styles.css`

**Regression validation**

- Main calendar heading is Jalali and Gregorian month remains secondary.
- Quick Add date fields display Jalali values by default.
- The underlying stored date remains a valid canonical date key.

## Bug 7 — Timer completion feedback

**Root cause**

The previous sound context could be created too late, vibration was restricted by a transient activation check, and completion had no dedicated visual or assertive accessibility announcement.

**Solution**

The first user interaction prepares the audio context. Completion now attempts all enabled channels independently:

- Two-tone completion sound
- Supported device vibration
- Assertive screen-reader announcement
- In-app toast
- One-shot ring completion animation
- System notification when permission was already granted

Failure of one channel is logged and does not block the others.

**Files modified**

- `app.js`
- `index.html`
- `styles.css`

**Regression validation**

- Deterministic browser fakes confirmed sound, vibration and system-notification calls.
- The assertive announcement contained the completion message.
- The ring displayed its one-shot completion state.

## Bug 8 — Custom duration

**Root cause**

The custom timer accepted minutes only and rounded every duration to whole minutes.

**Solution**

The existing custom-duration sheet now accepts separate minute and second values from `00:01` through `360:00`. It supports values such as `00:30`, `01:15`, `25:00` and `90:00` without changing timer presets or unrelated settings.

**Files modified**

- `app.js`
- `styles.css`

**Regression validation**

- A Persian-digit `۰۰:۰۳` entry produced exactly three stored seconds.
- Unit tests verified one-second custom completion.

## Bug 9 — Unexpected timer restart

**Root cause**

The expected distinction between a standalone Focus timer and the Work/Break cycle was not explicitly protected by regression coverage, making custom completion behavior vulnerable to future changes.

**Solution**

Standalone Focus completion always returns to idle, regardless of the Auto Continue setting. Auto Continue affects only explicit Work/Break cycles. When disabled, Work/Break prepares the next phase but does not start it.

**Files modified**

- `js/timer.js`
- `tests/timer.test.mjs`

**Regression validation**

- A one-second custom Focus timer remained idle after completion with Auto Continue enabled.
- Session count remained unchanged after an additional waiting period.
- A Work timer with Auto Continue disabled prepared an idle Break phase.

## Bug 10 — Persian digits

**Root cause**

Browser number and time inputs can reject Persian digits before application commands receive their values. Normalization existed only in selected domain paths.

**Solution**

Digit normalization now exists at both boundaries:

1. Input events normalize Persian and Arabic-Indic digits while typing or pasting.
2. Commands and storage sanitizers normalize dates, times and numeric values before validation and persistence.

Select-all replacement is handled for number inputs whose browser APIs do not expose selection ranges.

**Files modified**

- `app.js`
- `js/domain.js`
- `js/commands.js`
- `js/store.js`

**Regression validation**

- Persian, Arabic-Indic and English digits normalize to ASCII.
- Persian task dates, times and durations persisted correctly.
- Persian reading pages and minutes persisted correctly.
- Browser entry of `۴۵` and `۰۹:۳۰` produced `45` and `09:30` internally.

## Bug 11 — Modal close button alignment

**Root cause**

A text multiplication glyph was affected by font metrics and did not share one consistent optical center across platforms.

**Solution**

The close glyph was replaced with the existing rounded outline SVG language. The button uses a centered grid, fixed icon dimensions and consistent header alignment.

**Files modified**

- `index.html`
- `styles.css`

**Regression validation**

- Browser geometry confirmed the SVG and button centers match to under one CSS pixel after the sheet transition completes.

## Bug 12 — Text selection

**Root cause**

Long press allowed native selection on timeline and general interface text, interfering with touch interactions.

**Solution**

Selection is disabled across non-editable UI. Text selection remains enabled only for editable text inputs, textareas and explicitly content-editable elements.

**Files modified**

- `styles.css`

**Regression validation**

- Computed `user-select` is `none` on the page body.
- Computed `user-select` is `text` inside the task title field.
- Long-press and swipe task interactions remain available.

## Complete file list

### Application files modified

- `app.js`
- `index.html`
- `styles.css`
- `js/domain.js`
- `js/commands.js`
- `js/store.js`
- `js/timer.js`
- `js/diagnostics.js`
- `sw.js`
- `package.json`

### Documentation modified or added

- `README.md`
- `PRODUCT_SPEC.md`
- `CHANGELOG.md`
- `BUG_FIX_REPORT.md` — added

### Regression files modified or added

- `tests/domain.test.mjs`
- `tests/commands.test.mjs`
- `tests/timer.test.mjs`
- `tests/bugfix.test.mjs` — added
- `qa/bugfix_qa.py` — added

## Regression tests executed

### Automated Node suite

- JavaScript syntax validation for all production modules and Service Worker
- 63 automated tests
- 63 passed
- 0 failed

Coverage includes:

- Existing tasks, habits, reading, university and reports
- Storage normalization, backup recovery and multi-tab conflict protection
- Diagnostics and local analytics
- Service Worker lifecycle and offline fallback
- Large datasets and randomized lifecycle operations
- Precise timer milliseconds
- Pause/resume continuity
- Completion at 100%
- No standalone Focus auto-restart
- Persian digit normalization
- Static accessibility and bug-fix contracts

### Existing Phase 3 Chromium QA

- Rapid navigation
- Repeated theme switching
- RTL/LTR resilience
- Developer Mode
- Keyboard search and focus trapping
- Reduced motion
- Enlarged text
- Result: passed with zero page errors and zero console errors

### Phase 3.1 Chromium regression QA

19 browser checks passed:

1. No duplicate primary titles
2. Meaningful empty statistics
3. Jalali-first date picker
4. Persian numeric input
5. Visible task edit action
6. Edit action opens editor
7. Modal close optical alignment
8. Text-selection policy
9. Swipe-to-edit
10. Jalali primary calendar
11. Minute-and-second custom duration
12. Real elapsed progress
13. Pause/resume continuity
14. Smooth reset
15. Completion sound/haptic/notification/animation
16. No unexpected restart
17. Navigation, theme and RTL regression
18. Persistence and storage regression
19. Zero page or console errors

## Final validation result

| Area | Result |
|---|---|
| Focus Timer | Passed |
| Calendar | Passed |
| Tasks | Passed |
| Bottom Navigation | Passed |
| Statistics | Passed |
| Dark Mode | Passed |
| Light Mode | Passed |
| RTL Layout | Passed |
| Persistence | Passed |
| Storage | Passed |
| Animations | Passed |
| Critical regressions | None found |
| High-severity regressions | None found |

**Phase 3.1 final status: PASS**

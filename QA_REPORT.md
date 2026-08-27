# ARAM 3.3 QA Report

## Release gate

No known Critical or High-severity defect remains after the executed automated, migration, stress and Chromium regression matrix.

## Phase 3.3 defects discovered and resolved

### QA-331 — Active module cards in More did not open

- Severity: High usability
- Root cause: More cards rendered `data-module-primary`, while only Module Library attached handlers for that attribute. The normal More surface expected `data-open-module`.
- Fix: Non-management module cards now use the shared open-module route.
- Regression: Browser QA opens active Reading and University from More.
- Result: Passed.

### QA-332 — Hidden specialized Search results could bypass lifecycle controls

- Severity: High data/UX consistency
- Root cause: Reading and University search results exposed a label but did not propagate `sourceModuleId` to the click router.
- Fix: Every module-owned search result carries its stable source module ID. Results from hidden, inactive or archived modules open module management rather than record editors.
- Regression: Hidden Reading is absent by default, appears only after opt-in and opens management instead of the book editor.
- Result: Passed.

### QA-333 — Persian digits rejected in custom Time Tracker fields

- Severity: High Persian UX
- Root cause: Native `type=number` parsing rejected Persian digits before command normalization.
- Fix: Custom numeric fields use text input with numeric input mode and normalize Persian, Arabic and English digits in commands.
- Regression: Browser entry `۴۵` minutes and `۳۰` seconds persists as 2,730 seconds.
- Result: Passed.

### QA-334 — Permanent University deletion could remove Projects data

- Severity: Critical data safety
- Root cause: Both specialized surfaces share the `universityItems` namespace; deletion originally cleared the complete collection.
- Fix: Permanent deletion filters by stable `moduleId`, removing only University-owned records and preserving `projects` records.
- Regression: Dedicated unit test verifies independent Projects records remain.
- Result: Passed.

### QA-335 — Custom List created calendar activity

- Severity: High architecture consistency
- Root cause: Custom records were calendared by date without checking the template capability.
- Fix: Calendar selection requires the module’s Calendar capability.
- Regression: Custom List remains searchable while producing no calendar indicator.
- Result: Passed.

### QA-336 — Damaged schema-4 preferences could expose new-user behavior to an existing user

- Severity: High migration safety
- Root cause: A schema-4 object with records but missing `modulePreferences` used new-install defaults.
- Fix: Normalization infers existing-user mode when real records are present and restores compatible active-module defaults.
- Regression: Dedicated damaged-v4 fixture retains existing-user behavior.
- Result: Passed.

### QA-337 — Work statistic used an irrelevant archived count

- Severity: Medium correctness
- Root cause: The initial Work provider used archive metadata from currently active task filtering.
- Fix: Work completion uses real task occurrence entries in the selected range.
- Regression: Module-aware statistics tests.
- Result: Passed.

### QA-338 — Reset did not immediately reopen onboarding

- Severity: Medium new-user flow
- Root cause: Reset created a pending onboarding state but the current view remained open until a later startup.
- Fix: Reset closes Settings and schedules the optional onboarding flow immediately.
- Regression: Reset/startup behavior reviewed in browser.
- Result: Passed.

### QA-339 — Inactive University/Projects could clutter Today upcoming items

- Severity: High product relevance
- Root cause: Existing upcoming selector was not filtered by optional module lifecycle.
- Fix: Home excludes upcoming records owned by inactive, hidden or archived optional modules.
- Regression: Module integration tests and browser lifecycle QA.
- Result: Passed.

### QA-340 — Existing QA fixtures assumed schema 3 and globally visible modules

- Severity: Test infrastructure
- Root cause: Browser QA preloads and empty-stat expectations predated schema 4.
- Fix: QA fixtures use schema 4 or explicit migration fixtures and complete/skip onboarding before unrelated tests.
- Regression: All three Chromium suites pass.
- Result: Passed.

### QA-341 — Use-case answer silently activated recommended modules

- Severity: High product clarity
- Root cause: Selecting an optional onboarding use case merged every recommendation into the user’s explicit module selection.
- Fix: Use-case choices now only influence recommendation labels; they never activate a module the user did not select in the module step.
- Regression: Browser onboarding selects Reading and University, chooses the mixed use case and confirms Work, Projects and Screen Time remain available.
- Result: Passed.

### QA-342 — Pinned-only More screen showed a false empty state

- Severity: High product clarity
- Root cause: The empty-state decision considered only unpinned active modules. When every active module was pinned, the screen displayed both real pinned cards and «هنوز بخشی اضافه نکرده‌ای».
- Fix: The empty state is shown only when both pinned and unpinned active-module collections are empty.
- Regression: Browser QA completes onboarding with pinned modules and asserts the false empty state is absent.
- Result: Passed.

## Migration QA

Fixtures covered:

- Reading records
- University records
- Screen-time records
- Hundreds of records
- Custom settings
- No optional records
- Incomplete optional records
- Partially malformed optional records
- Missing schema-4 module preferences

Assertions included:

- No unintended record-count loss
- Specialized records remain in original namespaces
- Existing users bypass onboarding
- Previous visible optional sections remain active
- Migration backup exists
- Repeated normalization is idempotent
- Import rejects newer schema

## New-user QA

Completed:

- Full onboarding
- Skip onboarding
- One and multiple module selection through unit/browser paths
- No optional modules
- Back/next flow
- Close/reopen during onboarding
- Refresh-style reconstruction with persisted partial state
- Use-case recommendation
- Preview confirmation

## Module-management QA

Completed:

- Add/activate
- Hide and restore
- Deactivate and reactivate
- Archive and reactivate
- Pin/unpin
- Today summary toggle
- Accessible reordering command
- Duplicate-safe activation
- Scoped permanent deletion
- Exact-name confirmation behavior in implementation review
- Rapid lifecycle mutation stress

## Specialized regression

Reading and University were explicitly opened after v3 migration in Chromium. Existing title/history data appeared in their dedicated managers. Existing command/domain tests for creation, editing, deletion, restoration, Calendar, Search and Statistics remain green.

## Generic-module QA

All five templates were validated with supported fields, Persian digits, invalid values, duplicate names, record lifecycle and stress data. Generic modules remain intentionally less complex than specialized modules.

## Random and stress QA

Executed:

- Repeated random lifecycle operations
- Large existing histories
- 25 active custom modules
- 500 custom records
- Near-quota storage failure simulation
- Corrupted primary storage
- Cross-tab stale revision
- Rapid navigation and theme switching
- Hidden Search state
- Offline Service Worker simulation

## Accessibility review

Confirmed in code and browser:

- Persian document language and RTL default
- 44×44 minimum targets
- Visible keyboard focus
- Modal focus trap and restoration
- Reduced-motion support
- Dynamic text safeguards
- Explicit ARIA state for switches and selected controls
- Natural Persian lifecycle labels
- Accessible up/down reordering alternative to drag-only interaction
- Destructive action includes readable text, backup and exact-name confirmation

## Performance review

- Inactive optional modules are not rendered.
- Search/Calendar/Statistics providers check status and capability.
- No copied calendar records are created.
- Revision-based caching remains active.
- Generic templates share one renderer/command system.
- Source remains under enforced module/total budgets.

## Residual risks

- Fully simultaneous Web Storage writes cannot be made atomic by the API.
- LocalStorage full-state serialization is the primary future scaling constraint.
- `app.js` remains a large integration module.
- Generic deleted-record restoration has command support but lacks a dedicated deleted-history browser in every template.
- Physical installed-PWA, VoiceOver and TalkBack certification is still required.

## Final QA decision

Phase 3.3 is acceptable for controlled dogfooding and Phase 4 device certification. It is not yet claimed as physically certified for App Store or Play Store distribution.

---

# ARAM 3.4 Native Timer QA Addendum

## Executed in this environment

- 98 automated JavaScript/static-contract tests after final release-document gate.
- Existing Chromium browser regression.
- Phase 3.1/3.1.1 timer regression matrix.
- Phase 3.3 module regression matrix.
- Dedicated fake-Capacitor native bridge QA covering capability gating, contextual permission, sound preview and Start/Pause/Resume/Stop synchronization.
- Swift source parsing and Swift Package manifest validation without an iOS SDK.
- Widget contract checks confirming ActivityKit/WidgetKit system timer rendering and Dynamic Island compact/minimal/expanded layouts.
- Local sound-file format/duration validation.

## Native defects found and fixed during implementation

### QA-IOS-001 — Completion state could be dismissed immediately after expired restore

- Severity: High native UX consistency
- Root cause: `restore()` could complete an expired persisted timer and then emit a second idle `restore` transition, causing native synchronization to immediately cancel the just-completed Live Activity state.
- Fix: An expired timer completed during restore emits only the authoritative `complete` transition.
- Regression: Dedicated timer test asserts transition sequence is exactly `complete`.
- Result: Passed.

### QA-IOS-002 — Foreground completion could be silent when native notifications were disabled/revoked

- Severity: High completion feedback
- Root cause: Native completion relied on the scheduled notification as the sound source even when notification delivery was unavailable.
- Fix: Native completion checks current notification authorization and directly plays the selected sound only when an authorized notification is not the sound owner; this also prevents duplicate foreground audio.
- Regression: Static native contract plus bridge/browser behavior tests.
- Result: Passed at source/contract level; physical-device audio remains pending.

### QA-IOS-003 — JavaScript fractional ISO timestamps could fail native parsing

- Severity: Critical notification/timer synchronization
- Root cause: default `ISO8601DateFormatter` parsing did not guarantee fractional-second support for JS `Date.toISOString()` values.
- Fix: Native bridge uses a fractional-seconds formatter first and standard ISO fallback second.
- Regression: Native contract test.
- Result: Passed at source level.

## Physical-device gate — not executed

No Xcode/iPhone is available in this environment. Therefore actual notification delivery, native sound, haptic, Lock Screen rendering, Dynamic Island rendering, VoiceOver and force-termination behavior are **not** marked passed. See `TIMER_TEST_REPORT.md` for the exact required matrix.

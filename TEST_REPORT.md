# ARAM 3.4 Cumulative Test Report

## Release candidate

- Application version: 3.4.0
- Store schema: 5
- Automated tests: 98 passed, 0 failed
- Chromium browser QA suites: existing browser, timer-regression, module, and native-bridge suites passed
- JavaScript page errors: 0
- Console errors: 0

## Commands executed

```bash
npm run check
npm test
python3 qa/browser_qa.py
python3 qa/bugfix_qa.py
python3 qa/module_qa.py
python3 qa/native_bridge_qa.py
```

All commands completed successfully in the final validation run.

## Automated test groups

### Phase 3.1 and 3.1.1 regressions

Validated:

- Real elapsed-time focus ring
- No looping CSS timer animation
- Empty statistics states
- Discoverable task edit action and swipe support
- Jalali-first date controls
- Timer completion feedback hooks
- Hour/minute/second custom duration layout
- Custom timer does not enter preset auto-continue
- Persian numeric normalization
- Modal close alignment
- Text-selection protection
- Duplicate title removal

### Existing domain commands

Validated:

- Task create, update, complete, archive, delete and restore
- Independent recurring task occurrences
- Reading session history and book progress
- Habit lifecycle restrictions
- Archived books rejecting new sessions
- Persian/Arabic/English digit normalization
- Invalid activity rejection

### Module registry and lifecycle

Validated:

- Unique stable definition per built-in module
- Capability declarations
- Minimal new-user defaults
- Existing-user optional-module defaults
- Activate, hide, restore, deactivate, archive and reactivate
- Pin and unpin
- Today summary visibility
- Accessible up/down order mutation
- Stable generic IDs
- Scoped permanent deletion
- University deletion preserving Projects facade records

### Generic custom modules

All five templates were tested:

- Simple Tracker
- Project
- Routine
- List
- Time Tracker

Coverage includes:

- Supported-field persistence only
- Persian digits
- English/Persian names
- Emoji icon/name data
- Empty optional values
- Very large valid values
- Invalid values
- Duplicate names with ID-safe ownership
- Record delete and restore
- Namespace-scoped permanent module deletion

### Module-aware integration

Validated from original records rather than copied data:

- Inactive optional data preserved but absent from Calendar and Search
- Hidden Search opt-in
- Hidden result lifecycle guard
- Custom Project Calendar/Search/Statistics integration
- Custom List searchable but not calendared without Calendar capability
- Project and University independent activation
- Active optional statistics
- Work occurrence completion calculations
- Module source labels

### Existing-user migration

Validated:

- Schema 3 → schema 4 with all records preserved
- Reading history preservation
- University item preservation
- Screen-time preservation
- Settings and store metadata preservation
- Existing users not forced through onboarding
- Reading, University and Screen Time remaining active
- Work and Projects remaining available
- Migration idempotence
- Untouched schema-3 snapshot written before schema-4 commit
- Retry-safe behavior
- Schema-4 data with missing module preferences inferred as existing when records exist

### Import/export compatibility

Validated:

- Schema-4 normalization
- Schema-3 import and migration
- Schema-2 import
- Legacy recognized data
- Newer-schema rejection
- Malformed optional data handled safely
- Current-state backup before import
- Export envelope includes app version, schema version and complete state

### Onboarding

Browser coverage includes:

- New-user onboarding start
- Partial progress persistence
- Close/reopen resume
- Back/next flow
- Selecting one or more optional modules
- Use-case recommendation
- Use-case recommendations never activating unselected modules
- Preview and completion
- Skip onboarding
- Skip leaves every optional module available
- Existing users bypass onboarding

### Specialized-module regression

Browser migration fixtures validated that Reading still opens with:

- Existing book
- Author/page data
- Reading history

University still opens with:

- Existing research item
- Deadline
- Progress
- Priority
- Notes

Existing task, habit, focus, calendar, statistics, review and search unit suites continue to pass.

### Storage and integrity

Validated:

- Real date and clock validation
- Daily-record deduplication
- Reading history after book deletion
- Habit entries outside lifecycle removed
- Corrupted primary recovery from backup
- Mutator exception isolation
- Quota failure preserving last committed state
- Stale-tab write rejection
- Storage-event synchronization
- Migration/import backup keys
- Normalization of malformed module settings

### Timer

Validated:

- Pause/resume wall-clock preservation
- Exact completion from stored end time
- Work/break auto-continue only when allowed
- Reset without false completion
- Multi-phase background catch-up
- Exact millisecond progress
- Custom focus/work/break completion never launching a preset
- Full-progress final snapshot

### PWA and static quality

Validated:

- Complete Service Worker shell
- Module files present in cache list
- Install/activate lifecycle simulation
- Offline navigation fallback
- Stale-while-revalidate static assets
- No remote runtime dependency
- Source-size budgets
- Explicit generated button types
- Core accessibility semantics
- Reduced motion, touch target and dynamic text safeguards
- Required documentation present

### Random and stress testing

Validated:

- 660 repeated random lifecycle mutations
- Hundreds of tasks, habits, books, sessions and focus records
- 25 active custom modules
- 500 custom module records
- Serialization and normalization under load
- Search/report correctness with large histories
- No record corruption or duplicate ownership

## Chromium QA: universal regression

`qa/browser_qa.py` executed:

- Empty startup
- Quick Add task
- Task completion
- 12 rapid cycles through all five bottom-navigation destinations
- 13 repeated theme changes
- Hidden Developer Mode activation
- LocalStorage inspector
- Keyboard closing and focus cleanup
- Persistent schema-4 keys

Result:

```json
{
  "page_errors": [],
  "console_errors": [],
  "task_count": 1,
  "developer_mode": true,
  "rapid_navigation_cycles": 12,
  "theme_switches": 13,
  "ok": true
}
```

## Chromium QA: Phase 3.1 regressions

`qa/bugfix_qa.py` executed 21 checks covering titles, empty statistics, Jalali inputs, Persian digits, task editing/swipe, modal alignment, text selection, custom duration, timer progress, pause/resume, reset, completion feedback, no unexpected restart, navigation, theme, RTL and persistence.

Result: 21/21 passed with no page or console errors.

## Chromium QA: modular personalization

`qa/module_qa.py` executed:

- New-user onboarding and resume
- Reading and University selection
- Existing-user schema-3 migration
- Specialized Reading/University UI regression
- Pin, Today summary, hide, restore, deactivate, activate, archive and reactivate
- Pinned-only More state without a contradictory empty message
- Export/import UI round-trip and permanent-delete cancellation/confirmation
- Custom Time Tracker with Persian digits
- Custom Today summary
- Search source label
- Hidden Search opt-in and safe result routing
- Onboarding skip

Result: all scenario groups passed with no page or console errors.

## Performance observations

Final uncompressed source sizes:

- JavaScript production source: 357,663 bytes
- `styles.css`: 41,148 bytes
- `index.html`: 12,880 bytes
- Largest module: `app.js`, 141,306 bytes

Budget tests enforce:

- Less than 150 KB per production JavaScript module
- Less than 430 KB total production JavaScript source

Observed test-environment timings:

- Full 86-test suite: approximately 1.3 seconds
- Random lifecycle workload: approximately 1.1 seconds
- Hundreds-of-record selector/report workload: approximately 140 ms
- 25 custom modules and 500 records: approximately 16 ms in the unit environment

These numbers are environment-specific and are not physical-device benchmarks.

## Remaining device validation

Still required before public store distribution:

- Installed iOS Safari migration and offline resume
- Installed Android Chrome migration and offline resume
- VoiceOver and TalkBack
- Physical haptic/audio behavior
- Low-end mobile CPU profiling
- Browser storage quota behavior on real devices

---

# ARAM 3.4 Native Timer Test Addendum

The final native-integration source suite adds coverage for:

- schema 4 → 5 migration and timer-native defaults;
- one-source-of-truth lifecycle transitions;
- no native calls on ordinary timer ticks;
- exact session/end-date payloads;
- deterministic notification identity and cancellation paths;
- contextual permission flow;
- native sound selection and preview non-overlap;
- Live Activity ActivityKit/WidgetKit contract;
- system-driven timer/progress rendering;
- Dynamic Island compact/minimal/expanded source paths;
- custom-timer no-auto-restart regression;
- expired-runtime restore without an immediate second idle native transition;
- native capability hiding on the PWA;
- Service Worker caching of web fallback bridge/sounds.

Final automated count after documentation gate: **98 passed, 0 failed**.

Native iOS hardware tests remain separately pending and are not included in that pass count. See `TIMER_TEST_REPORT.md`.

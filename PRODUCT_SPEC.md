# ARAM Product Specification — Version 3.4.0

## Product promise

ARAM is a calm Persian daily productivity application that adapts to different lives without becoming a configurable database tool.

> Simple to activate, deeply useful after activation.

## Universal experience

Every user receives:

- Today
- Tasks
- Focus
- Habits
- Calendar
- Notes
- Statistics
- Search
- Settings

These capabilities must remain useful when every optional module is inactive.

## Optional specialized experience

The first registered specialized modules are:

- Reading
- University
- Screen Time
- Work
- Projects

Specialized modules retain dedicated domain behavior. Reading continues to support books, authors, pages, current book, sessions, time, goals, progress, history and completed books. University continues to support assignment, project, research and thesis records with deadlines, progress, status, priority, notes, estimated time and statistics.

Specialized data must never be silently converted into generic records.

## Generic custom modules

A user may create only one of these safe templates:

- Simple Tracker
- Project
- Routine
- List
- Time Tracker

Configuration is intentionally limited to name, icon, type, optional goal/unit, reminder-ready preference and visibility. No arbitrary fields, schemas or database concepts are exposed.

## Module lifecycle contract

- Hide: remove visible module surfaces while preserving active data.
- Deactivate: remove from active experience while preserving all data.
- Archive: preserve history and prevent new records.
- Delete permanently: remove configuration and owned records only after backup and explicit exact-name confirmation.

The four terms are not interchangeable.

## Module registry contract

One source of truth must declare:

- Stable ID
- Persian name and description
- Internal type
- Version
- Capabilities
- Destination
- Data namespaces
- Availability

Module names are presentation only. Storage and integrations use IDs.

## Capability contract

The UI may expose only controls supported by a module’s declared capabilities:

- Tasks
- Time tracking
- Progress
- Goals
- Sessions
- Notes
- Calendar
- Statistics
- Search
- History
- Streak
- Numeric values

## Personalized More

The More screen contains:

- Pinned modules
- Other active modules
- One Add/Manage Module action
- General tools and settings

Inactive modules do not appear in the normal active list. Primary bottom navigation remains unchanged.

## Today contract

Optional modules do not automatically clutter Today. Active modules may be configured to:

- Show a concise summary
- Stay hidden from Today
- Be pinned in More

A Today summary links to the complete specialized or generic module.

## Onboarding contract

New users receive a calm, optional flow of no more than four steps:

1. Introduction
2. Optional-module selection
3. Optional main-use selection
4. Preview and confirmation

The user may skip, go back, close, refresh and resume. Existing users are not forced through onboarding and keep their former layout.

## Search contract

Search returns real stored records and includes a Persian source-module label. Hidden modules are excluded unless the user explicitly enables hidden results. Results from hidden, inactive or archived modules cannot bypass lifecycle controls.

## Calendar contract

The Jalali calendar is primary. Eligible modules contribute references to their original dated records. No duplicate calendar records are created.

## Statistics contract

- Active module with data: show real statistics.
- Active module without data: show a Persian empty state.
- Inactive or hidden module: do not show its optional statistics by default.
- Archived module: preserve history.

No value, ring or percentage may be a placeholder.

## Data and migration contract

- Schema version: 4
- Stable module IDs
- Module configuration separated from records
- Validated serialization and parsing
- Safe handling of missing/corrupted module settings
- One-time idempotent schema-3 migration
- Original schema-3 snapshot before migration when feasible
- No record deletion during migration
- Retryable migration failure without half-committed state
- Import backup before replacing current data

IndexedDB is deferred because the current LocalStorage architecture remains within tested limits and a storage-engine migration is not technically required for this phase.

## Persian and accessibility contract

- All user-facing content is Persian.
- Default direction is RTL.
- Vazirmatn remains the product typeface.
- Jalali dates are primary.
- Numeric inputs accept Persian, Arabic and English digits.
- Controls target at least 44 CSS pixels.
- Status controls expose ARIA state.
- Keyboard order and focus remain logical.
- Reduced motion is respected.
- Icons never act as the only destructive label.

## Performance contract

- Inactive modules are not rendered.
- Module-specific providers run only when status and capability allow them.
- Existing records are referenced rather than copied.
- Revision-based selector caching remains enabled.
- Local analytics and diagnostics remain bounded.
- Production source remains within tested bundle budgets.

## Explicit exclusions

Version 3.3.0 does not add:

- Cloud synchronization
- Accounts or login
- AI
- Social features
- Remote telemetry
- Notification delivery
- A no-code form builder
- Fitness, Sleep, Medication, Nutrition, Language Learning or Pet Care specialized modules

## Release acceptance

A build is eligible when:

- All schema and migration tests pass
- Reading and University regressions pass
- Module lifecycle and onboarding browser QA pass
- Existing Phase 1/2/3/3.1 tests pass
- No known Critical or High issue remains
- Required documentation is complete
- ZIP integrity and checksum are recorded
- Physical-device limitations are disclosed

---

# Native iOS Timer Extension — Version 3.4

The existing ARAM timer remains the single authoritative timer implementation. The optional Capacitor iOS build adds a native presentation/delivery layer without changing task, habit, reading, university, module or calendar data semantics.

Native iOS capabilities:

- local scheduled timer-completion notification;
- curated notification/completion sounds;
- restrained native haptics;
- real ActivityKit Live Activity on Lock Screen;
- Dynamic Island compact, minimal and expanded presentations on supported hardware;
- system-rendered timestamp countdown and progress;
- capability-aware Settings controls.

The PWA remains fully functional without these APIs. Live Activity controls are never rendered on unsupported web platforms.

Reliability constraints:

- `runtime.timer` and `ReliableTimer` are the sole timer authority;
- native requests are keyed by session ID;
- ordinary timer ticks never trigger native synchronization;
- Pause cancels the scheduled notification and freezes the Live Activity;
- Resume reschedules from the newly authoritative `endsAt`;
- Stop cancels native presentation;
- Completion statistics/history are committed once through the existing web store;
- custom timers never auto-continue into presets;
- Auto Continue defaults OFF for new installations.

A force-terminated app cannot locally schedule a future ActivityKit `end()` invocation. The Live Activity becomes stale/completed visually at the expected end and is reconciled on next launch; exact removal in that condition is not claimed without a future push/background architecture.

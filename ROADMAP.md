# ARAM Roadmap

## Long-term vision

ARAM should remain a calm Persian personal productivity environment that adapts to different lives without becoming a complex workspace builder. The product should be locally trustworthy, offline-first, accessible and useful with only its universal core.

## Completed phases

### Phase 1 — Foundation

- Versioned local data model
- Real calendar and statistics
- Reliable timestamp-based timer
- Storage validation, backup and migration
- Offline PWA shell

### Phase 2 — Core Features

- Complete tasks, habits, reading and university workflows
- Daily, weekly and monthly reviews
- Global search and filters
- Universal Quick Add
- Real-data integration across calendar and statistics

### Phase 3 — Premium Experience and Stabilization

- Local diagnostics and analytics
- Hidden Developer Mode
- Accessibility and modal focus behavior
- Cross-tab revision protection
- Selective rendering and performance safeguards
- Destructive QA and Service Worker hardening

### Phase 3.1 — Timer and Interaction Stabilization

- Real elapsed-time progress ring
- Smooth pause/resume/reset behavior
- Jalali-first date controls
- Persian numeric normalization
- Discoverable task editing
- Completion feedback
- Hour/minute/second custom durations
- Custom-timer auto-continue correction

### Phase 3.3 — Modular Personalization

- Universal core and optional specialized-module architecture
- Schema 4 module configuration and migration
- Personalized More and Module Library
- Optional onboarding
- Active/hidden/available/archived lifecycle
- Pinning, ordering and Today summaries
- Five constrained generic module templates
- Module-aware Calendar, Search, Statistics and backup
- Existing Reading and University specialization preserved

## Current phase

Phase 3.3 modular personalization remains complete. Version 3.4.0 is now the current native-iOS timer **device-certification candidate**. Its source-level and automated QA gates are complete, but it is not a store-ready native release until Xcode and real-iPhone validation pass.

Before public distribution, dogfooding should still cover migration with months of real data, terminology comprehension, installed-PWA behavior, and the physical iOS timer matrix documented below.

## Next phase

### Phase 4 — Distribution and Device Certification

Recommended scope:

- Real iOS Safari installed-PWA testing
- Real Android Chrome installed-PWA testing
- VoiceOver and TalkBack certification
- Store packaging and metadata
- Privacy disclosure and local-data explanation
- Import/restore usability certification
- Device-specific audio, haptic and background-timer validation
- Release-channel and rollback procedure

Phase 4 should not add new productivity modules before certification is complete.

## Future phases

### Storage scalability

Move large append-only histories to IndexedDB only when measured data volume justifies the migration. Preserve the current schema semantics and add transactional import/export.

### Optional specialized modules

Candidates to research rather than prebuild:

- Fitness
- Sleep
- Medication
- Nutrition
- Language learning
- Pet care

Each candidate requires a real specialized workflow and must not be released as an incomplete checklist.

### Reminder delivery

Implement local notification delivery only after device permission, privacy and installed-PWA behavior are certified.

### Cloud and account features

Cloud synchronization, login and multi-device conflict resolution remain explicitly deferred. They require a separate privacy, security and data-ownership phase.

## Product constraints

Future work must preserve:

- No fake data
- No dead controls
- No duplicated records
- No form-builder complexity
- Persian and RTL first
- Offline usefulness
- Specialized depth where promised
- Optional modules that never clutter a minimal user’s experience

## Phase 3.4 — Native iOS Timer Experience

### Implementation status

The code-level native timer architecture is implemented as an additive Capacitor layer:

- one authoritative timestamp timer in the web core;
- native iOS bridge for lifecycle transitions only;
- local completion notifications;
- curated native sounds and restrained haptics;
- real ActivityKit/WidgetKit Live Activity source for Lock Screen and Dynamic Island;
- schema 5 timer-native preferences and safe schema-4 migration;
- graceful PWA capability fallback.

This phase is **not physically certified yet**. The next gate is Xcode compilation/signing and the real-iPhone matrix in `TIMER_TEST_REPORT.md`.

### Next certification gate

- Generate/sync the Capacitor iOS project on macOS.
- Compile the local Swift Package and Widget Extension against the current iOS SDK.
- Validate 00:10, 00:30, 01:10 and 25:00 timers on a physical iPhone.
- Validate Lock Screen and Dynamic Island compact/minimal/expanded presentations.
- Validate denied permission, Silent Mode and Focus Mode behavior.
- Validate force-terminated notification delivery and Live Activity stale/reopen behavior.
- Validate Persian VoiceOver and battery behavior.

No additional productivity feature should be added before this device gate is closed.

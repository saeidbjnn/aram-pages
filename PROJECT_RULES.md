# ARAM Project Rules

These rules apply to every future change.

## Product integrity

1. No fake data.
2. No placeholder percentages, rings, counts or calendar indicators.
3. No dead buttons or routes.
4. Never add features outside the active phase.
5. Preserve a calm, minimal Persian experience.
6. Do not make ARAM a no-code database or form builder.
7. Specialized modules must keep their dedicated depth.
8. Optional features must not clutter users who do not need them.

## Data integrity

1. Every displayed value must be traceable to stored records.
2. No duplicated state or copied calendar records.
3. Stable IDs are authoritative; display names are never storage identifiers.
4. UI state, module configuration and activity records remain separate.
5. Every schema change requires a versioned migration.
6. Migration must be idempotent and preserve the original source until success.
7. Permanent deletion must be explicit, scoped and preceded by backup where feasible.
8. Corrupted optional data must not crash the universal core.
9. Unknown future modules must fail closed rather than become broken UI.

## Module rules

1. The registry in `js/modules.js` is the only built-in module-definition source.
2. A module declares only capabilities it actually supports.
3. Inactive modules are not rendered or included in default optional statistics.
4. Hidden module search is opt-in.
5. Generic modules use only approved templates.
6. Specialized modules are never automatically converted to generic modules.
7. Work and Projects facades reference existing records instead of creating copies.
8. Hide, deactivate, archive and permanent delete have distinct behavior and terminology.

## Engineering

1. Maintainability over clever code.
2. Performance before animations.
3. Offline first.
4. Accessibility first.
5. No remote runtime dependency without an explicit architecture decision.
6. Avoid hardcoded colors outside design tokens.
7. Avoid duplicated user-facing strings when a shared label already exists.
8. Refactor only when it reduces real coupling or correctness risk.
9. Every production module added to the application must be added to the Service Worker shell.
10. Local diagnostics and analytics must never be transmitted.

## Testing

1. Every feature requires tests.
2. Every bug requires a regression test.
3. Migration changes require old-version fixtures.
4. Data-destructive behavior requires cancellation and scope tests.
5. Module changes require Reading and University regression tests.
6. Calendar, Search, Statistics and Today integrations must be tested from the same original record.
7. Test empty, malformed, large and near-quota data.
8. Test Persian, Arabic and English digits where numeric input exists.
9. Test RTL, keyboard operation, focus state and reduced motion.
10. Never claim physical-device behavior that was not executed.

## Release gates

A release cannot be packaged until:

- Syntax checks pass.
- Automated tests pass.
- Relevant Chromium QA passes.
- No known Critical or High issue remains.
- Required documents are updated.
- Service Worker assets are complete.
- Archive integrity and checksum are verified.
- Remaining environmental limitations are disclosed.

## Native iOS timer rules

1. `ReliableTimer` and persisted `runtime.timer` are the only authoritative timer state.
2. Native iOS code may project timer state but must not create a second independent timer engine.
3. A Live Activity must use ActivityKit/WidgetKit; never fake one in web content.
4. Never update ActivityKit once per second from JavaScript; use system-rendered timestamps.
5. A timer completion session/statistic must be committed exactly once before downstream presentation is treated as complete.
6. Native notification IDs and Live Activity identity must derive from the authoritative session ID.
7. Pause and Stop must cancel pending completion notification state.
8. Auto Continue is OFF for new users and must never apply to custom timers.
9. Notification permission is contextual and user-initiated; never prompt on first launch.
10. Respect Silent Mode, Focus Mode, notification preferences and iOS policy; no Critical Alerts.
11. Native-only controls must be capability-gated and absent from unsupported PWA/browser environments.
12. Real iPhone behavior may not be marked passed without execution on a physical device.
13. Force-termination limitations of ActivityKit must be documented rather than hidden or simulated.

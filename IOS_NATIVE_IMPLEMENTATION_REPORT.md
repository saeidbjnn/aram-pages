# ARAM iOS Native Timer — Implementation Report

Version: **3.4.0**  
Store schema: **5**  
Status: **device-certification candidate**

## Scope delivered

ARAM remains a Persian RTL PWA and keeps `ReliableTimer` + `runtime.timer` as the only authoritative timer state. The new Capacitor/iOS layer mirrors stable timer lifecycle transitions into native iOS services; it does not create a second timer engine.

Implemented source architecture:

- Capacitor 8 wrapper configuration with a separate generated `www/` directory.
- Capability-aware JavaScript native timer bridge.
- Local Swift Package implementing a Capacitor plugin.
- Native local completion notifications scheduled from the authoritative end timestamp.
- Native notification permission flow requested contextually from timer settings.
- Curated completion sounds and non-overlapping preview.
- Restrained native haptic hooks.
- Real ActivityKit/WidgetKit Live Activity source.
- Lock Screen and Dynamic Island compact/minimal/expanded presentations.
- System-driven timestamp countdown/progress without per-second ActivityKit updates.
- Running, paused, completed and cancelled activity states.
- Deterministic session-ID notification/activity synchronization.
- Schema 4 → 5 migration preserving all existing productivity/module data.
- PWA fallback and capability hiding on unsupported platforms.

## Source-of-truth contract

The web timer remains authoritative for:

- session ID;
- mode/phase;
- start and expected end timestamps;
- paused remaining duration;
- total duration;
- completion;
- history and statistics;
- Auto Continue rules.

Native iOS is responsible only for system presentation/delivery:

- Live Activity;
- local scheduled notification;
- native sound preview/completion fallback;
- native haptic feedback.

No ordinary timer tick is sent across the Capacitor bridge.

## Lifecycle behavior

| Transition | Web timer | Notification | Live Activity |
| --- | --- | --- | --- |
| Start | creates authoritative timestamp state | schedules one request | create/update running |
| Pause | freezes exact remaining duration | cancels request | paused/static remaining |
| Resume | creates new expected end timestamp | replaces request | update running |
| Stop/Reset | resets using existing ARAM rules | cancels request | ends immediately |
| Complete | commits history/statistics once | scheduled iOS request owns background alert | completed then dismissed when app can execute |
| Reopen | reconciles persisted timestamps | repairs current scheduling state | repairs/ends stale state |

Custom timers preserve the Phase 3.1.1 rule: they never enter a preset Auto Continue cycle.

## Data migration

Schema 5 adds only native timer preferences:

- `timerNotifications`
- `timerSound`
- `liveActivities`

Existing `vibration` and `autoContinue` preferences remain authoritative. Existing users keep their explicit Auto Continue value. New installations default Auto Continue to OFF.

Tasks, habits, modules, books, reading sessions, university data, focus history, calendar records and timer runtime are preserved.

## Files added

- `capacitor.config.ts`
- `scripts/build-native-web.mjs`
- `js/native-timer-bridge.js`
- `assets/sounds/*.wav`
- `native/aram-native-timer/Package.swift`
- `native/aram-native-timer/package.json`
- `native/aram-native-timer/ios/Sources/AramTimerActivityModel/AramTimerAttributes.swift`
- `native/aram-native-timer/ios/Sources/AramNativeTimerPlugin/AramNativeTimerPlugin.swift`
- native Swift Package sound resources
- `ios-template/App/App/Info.plist.patch`
- `ios-template/App/App/App.entitlements`
- `ios-template/AramLiveActivity/*`
- `ios-template/README.md`
- `tests/native-timer-bridge.test.mjs`
- `tests/ios-native-contract.test.mjs`
- `qa/native_bridge_qa.py`
- `IOS_NATIVE_FEATURES.md`
- `LIVE_ACTIVITY.md`
- `NOTIFICATION_SYSTEM.md`
- `TIMER_TEST_REPORT.md`

## Important modified files

- `app.js`
- `js/timer.js`
- `js/store.js`
- `js/diagnostics.js`
- `styles.css`
- `sw.js`
- `package.json`
- timer/store/quality regression tests
- QA scripts
- `README.md`
- `PRODUCT_SPEC.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `PROJECT_RULES.md`
- `DATA_MIGRATION_REPORT.md`
- `TEST_REPORT.md`
- `QA_REPORT.md`

## Validation completed in this environment

- 98/98 automated JavaScript tests passed.
- Browser QA passed with zero page/console errors.
- 21/21 Phase 3.1/3.1.1 browser regressions passed.
- Phase 3.3 module QA passed.
- Native-bridge Chromium QA passed.
- Swift sources pass parser validation.
- Swift Package manifest passes `swift package dump-package`.
- Widget Info.plist parses successfully.
- All bundled sounds are valid mono 16-bit 44.1 kHz WAV files under 30 seconds.
- `npm run native:web` generated the Capacitor web payload successfully.

The aggregate `npm run qa` wrapper exceeded the execution harness timeout when all Playwright suites were run in one long process chain; every constituent QA suite was then executed/verified separately. This was an environment-runner limitation, not a failed product assertion.

## Required physical-device gate

This environment does not provide macOS, Xcode signing or a physical iPhone. Therefore these items are deliberately **not marked passed**:

- actual Xcode compile/sign/archive;
- Lock Screen Live Activity rendering on device;
- Dynamic Island compact/minimal/expanded on supported hardware;
- real local notification delivery while locked/terminated;
- selected sound under real iOS notification policies;
- real haptic behavior;
- Silent Mode / Focus Mode behavior;
- Persian VoiceOver behavior;
- battery observation.

Run the matrix in `TIMER_TEST_REPORT.md` on a real iPhone before calling the native feature release-complete.

## Known ActivityKit lifecycle limitation

When the app process is gone, the scheduled local notification is owned by iOS. The Live Activity uses the expected end timestamp as its stale date and can render a completed/stale state without per-second app execution. A local app cannot guarantee that a future `activity.end()` call will execute after force termination. ARAM therefore reconciles and ends any stale/orphaned activity on the next launch. A future server-driven ActivityKit push/background design would be required for a stronger remote termination guarantee.

## Release recommendation

Keep the PWA release path unchanged. Treat 3.4.0 native source as an **iPhone device-certification candidate**. Do not submit the iOS build to the App Store until the physical-device matrix is complete.

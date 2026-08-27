# آرام — Persian Modular Planner PWA + Native iOS Timer Layer

ARAM **3.4.0** keeps the existing Persian RTL offline-first PWA intact and adds an optional Capacitor iOS layer for a native-quality timer experience. The web application remains the shared product core; native iOS code only projects the authoritative timer state into local notifications, haptics, sound and a real ActivityKit Live Activity.

## Product architecture

```text
ARAM Web Core
  ├─ Today / Tasks / Habits / Calendar / Notes / Statistics / Search
  ├─ Optional specialized and custom modules
  └─ ReliableTimer + runtime.timer  ← only timer source of truth
                    │
                    └─ js/native-timer-bridge.js
                              │
                         Capacitor iOS
                              │
                  AramNativeTimer Swift plugin
                    ├─ UNUserNotificationCenter
                    ├─ native haptics / sound
                    └─ ActivityKit
                           │
                    WidgetKit / SwiftUI
                    Lock Screen + Dynamic Island
```

There is no independent Swift timer engine and no fake Live Activity in the web UI.

## Universal and optional modules

The universal core remains Today, Tasks, Focus, Habits, Calendar, Notes, Statistics, Search and Settings. Reading, University, Screen Time, Work and Projects remain optional specialized modules; five constrained generic module templates remain available. Version 3.4 does not redesign or remove any Phase 3.3 module behavior.

## Run the PWA locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. The root project remains deployable as static HTML/CSS/JavaScript to GitHub Pages, Cloudflare Pages, Netlify or another static host.

## Validate

```bash
npm run validate
npm run qa
```

The final automated suite contains **98 tests** after the native-documentation release gate is included. Chromium QA covers the existing product plus a fake-Capacitor contract test; it does not pretend to be iOS hardware.

## Native iOS setup on macOS

Capacitor is additive. Build the native web copy and generate the standard iOS project on a Mac:

```bash
npm install
npm run cap:add:ios
npm run cap:sync:ios
npm run cap:open:ios
```

Then follow `IOS_NATIVE_FEATURES.md` and `ios-template/README.md` to:

1. add `NSSupportsLiveActivities = YES` to the main target;
2. add the `AramLiveActivity` Widget Extension with iOS 16.1+ deployment;
3. link the shared `AramTimerActivityModel` product to the extension;
4. confirm the local `AramNativeTimerPlugin` package is linked to the app target;
5. sign and run on a physical iPhone.

The local native package supports an iOS 15 app deployment target; Live Activities are capability-gated and require iOS 16.1+.

> The current execution environment has no Xcode/iOS SDK and cannot resolve the public npm registry, so it cannot generate or sign the final Xcode project. Native source is provided and Swift-syntax/package contracts are validated, but real iPhone certification remains a release gate.

## Timer behavior

- `ReliableTimer` and `runtime.timer` remain authoritative.
- Running time is calculated from stored timestamps, not interval counts.
- Start/Resume schedules one deterministic local notification at `expectedEndDate` when enabled.
- Pause cancels the notification and freezes exact remaining time.
- Stop/Reset cancels the notification and ends the Live Activity.
- Running Live Activity countdown/progress is rendered by iOS from timestamps; ARAM does not update ActivityKit every second.
- Completion is persisted exactly once before native completion state is projected.
- Custom timers never enter preset Auto Continue cycles.
- New installations default Auto Continue to OFF; existing users retain their saved preference.

## Native timer settings

The existing Settings sheet now conditionally exposes only supported controls:

- اعلان پایان تایمر
- صدا: آرام / زنگ نرم / چایم / مینیمال / سیستم / بدون صدا
- لرزش
- Live Activity, only on capable native iOS
- ادامه خودکار تایمر

Notification permission is requested contextually after the user chooses to enable completion alerts, never on first launch.

## Storage

Application schema: **5**

Primary keys:

- `aram-planner-store-v5`
- `aram-planner-store-v5-backup`

Migration safety:

- schema-4 source snapshot: `aram-planner-store-v4-migration-backup`
- schema-3 source snapshot: `aram-planner-store-v3-migration-backup`
- import rollback: `aram-planner-store-import-backup`

Schema 4 → 5 adds timer-native preferences only. Tasks, modules, reading, university, history, focus sessions and timer runtime are preserved.

## Important iOS limitation

A scheduled local notification can be delivered by iOS after ARAM is terminated. A Live Activity can also use `staleDate` at the expected timer end and render a completed/stale visual state. However, without a server push or another runnable native background path, ActivityKit does not provide a local API that guarantees a future `activity.end()` call after force termination. ARAM ends stale activities when it next launches. This is documented rather than represented as solved.

## Main source map

- `app.js` — application integration and existing UI
- `js/timer.js` — authoritative timestamp timer
- `js/native-timer-bridge.js` — capability detection and lifecycle projection
- `js/store.js` — schema 5, migration and persistence
- `native/aram-native-timer/` — Capacitor Swift Package plugin + shared ActivityKit model
- `ios-template/AramLiveActivity/` — Widget Extension source
- `ios-template/App/App/` — native configuration patches/templates
- `assets/sounds/` — local web completion sounds
- `scripts/build-native-web.mjs` — creates `www/` for Capacitor without altering root PWA
- `sw.js` — PWA offline shell

## Documentation

- `IOS_NATIVE_FEATURES.md`
- `LIVE_ACTIVITY.md`
- `NOTIFICATION_SYSTEM.md`
- `TIMER_TEST_REPORT.md`
- `MODULE_ARCHITECTURE.md`
- `DATA_MIGRATION_REPORT.md`
- `TEST_REPORT.md`
- `QA_REPORT.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `PROJECT_RULES.md`

## Release status

Web/PWA regression: validated in this environment.

Native iOS implementation: **device-certification candidate, not yet physically certified**. App Store readiness for the new Live Activity/notification behavior requires the physical-iPhone matrix in `TIMER_TEST_REPORT.md` to pass.

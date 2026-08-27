# ARAM Native Timer Test Report

Version: **3.4.0**

## Result classification

The shared timer, storage migration, native bridge contract, Widget/Swift source structure and PWA regression have been verified in this environment.

**Real-device iPhone tests are NOT marked passed.** They require Xcode signing, a physical iPhone and actual system Lock Screen/Dynamic Island/notification behavior.

## Automated JavaScript tests

Executed with:

```bash
npm run validate
```

Final source-level result:

- 98 automated tests
- 98 passed
- 0 failed

Native-specific coverage includes:

- capability detection
- contextual notification permission call
- timestamp payload serialization
- lifecycle transition ordering
- start / pause / resume bridge sync
- one completion bridge event
- selected sound propagation
- preview non-overlap
- PWA fallback behavior
- no ordinary tick → native bridge update
- v4 → v5 migration
- expired persisted timer restores through completion without a second idle native transition
- foreground native sound fallback when an authorized notification is not available
- preservation of existing Auto Continue preference
- new-install Auto Continue OFF
- custom-duration anti-restart regressions
- Service Worker inclusion of bridge and sound files

## Chromium regression

### `npm run qa:browser`

Passed:

- rapid navigation
- repeated theme switching
- Developer Mode
- task persistence
- no page errors
- no console errors

### `npm run qa:bugfix`

Passed **21 / 21** Phase 3.1/3.1.1 regressions including:

- real elapsed progress
- pause/resume continuity
- custom HH:MM:SS
- custom timer no auto restart
- completion sound/haptic/notification fallback
- Jalali calendar
- Persian digits
- dark/light/RTL/persistence

### `npm run qa:module`

Passed all Phase 3.3 module lifecycle and migration checks.

### `npm run qa:native`

A fake Capacitor iOS bridge was injected into Chromium to verify web/native orchestration without pretending it is iOS itself.

Passed:

- native-only Settings controls appear only under native capability
- permission request is contextual
- native sound preview call
- Start/Pause/Resume/Stop lifecycle sync
- end-date/session-ID timestamp payload
- zero runtime/console errors


## QA harness note

The aggregate `npm run qa` wrapper exceeded this execution environment’s long-running Playwright timeout when all browser suites were chained in one command. The same constituent suites (`qa:browser`, `qa:bugfix`, `qa:module`, `qa:native`) were verified separately; no product assertion failed.

## Swift source validation

Executed:

```bash
swiftc -parse \
  native/aram-native-timer/ios/Sources/AramTimerActivityModel/AramTimerAttributes.swift \
  native/aram-native-timer/ios/Sources/AramNativeTimerPlugin/AramNativeTimerPlugin.swift \
  ios-template/AramLiveActivity/AramLiveActivity.swift \
  ios-template/AramLiveActivity/AramLiveActivityBundle.swift
```

Result: parse passed.

`swift package dump-package` also validates the local Swift Package manifest and resource target layout.

This Linux environment cannot typecheck ActivityKit/UIKit/WidgetKit against an iOS SDK; Xcode compilation remains a required device-build gate.

## Sound assets

Validated locally:

| Sound | Format | Channels | Sample rate | Duration |
| --- | --- | --- | --- | --- |
| آرام | WAV PCM 16-bit | mono | 44.1 kHz | ~0.74s |
| زنگ نرم | WAV PCM 16-bit | mono | 44.1 kHz | ~0.76s |
| چایم | WAV PCM 16-bit | mono | 44.1 kHz | ~0.51s |
| مینیمال | WAV PCM 16-bit | mono | 44.1 kHz | ~0.52s |

## Required physical-iPhone matrix — pending

These tests must be executed before App Store release:

1. 25-minute Focus → lock → unlock → completion.
2. 00:10, 00:30 and 01:10 exact short timers.
3. Pause → lock → wait → resume → finish.
4. Start → Stop; confirm no later notification or Live Activity.
5. Start → force-close ARAM → lock → completion notification.
6. Rapid Start/Pause/Resume/Pause/Resume/Stop.
7. Denied notification permission and route to Settings.
8. Silent Mode, Focus Mode and notification sound disabled.
9. Dynamic Island compact/minimal/expanded on supported hardware.
10. Full Phase 3 timer/PWA/offline regression on device.
11. Reopen while timer is still running; verify wall-clock correction.
12. Reopen after expiry; verify exactly one session/statistics update.
13. Selected custom sound on foreground/background/locked device.
14. VoiceOver Persian countdown/status labels.
15. Battery observation for a long timer; verify no recurring app-side ActivityKit updates.

## Known platform limitation to verify

When the app is force-terminated, iOS can deliver the already scheduled local notification. The Live Activity also reaches its `staleDate` and renders the stale/completed UI using system state.

A local ActivityKit API cannot schedule a future `activity.end()` call after process termination. Therefore exact Live Activity removal at expiry is not claimed in this condition; ARAM reconciles/ends it on next launch unless a future server push/background design is added.

## Release gate

Native iOS timer release status: **implementation candidate — physical-device certification pending**.

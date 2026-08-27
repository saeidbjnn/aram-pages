# ARAM iOS Native Timer Features

## Status

Version **3.4.0** adds the source architecture required for a native iPhone timer experience while preserving the existing PWA as the shared application core.

The native code is implemented and statically/browser-contract tested in this repository. **Physical iPhone certification is still required before this feature can be called release-complete.** This environment has no Xcode/iPhone device, so Lock Screen, Dynamic Island, actual notification delivery, device sound and real haptic behavior were not falsely marked as passed.

## Architecture

```text
ARAM Web Core
  ReliableTimer + runtime.timer (authoritative state)
        |
        v
js/native-timer-bridge.js
        |
        v
Capacitor iOS
        |
        v
AramNativeTimer Swift plugin
        |--------------------|
        v                    v
UNUserNotificationCenter   ActivityKit
Local notification         Live Activity
                             |
                             v
                         WidgetKit / SwiftUI
```

There is **one timer engine**. Swift never decides elapsed time, phase completion or statistics. It mirrors transitions from the timestamp-based `ReliableTimer` and schedules OS presentation from the same `sessionId` and `expectedEndDate`.

## PWA versus native iOS

### PWA / browser

- Existing timestamp-based timer remains unchanged in authority.
- Background drift is corrected from persisted timestamps on resume.
- Web completion sound uses bundled local WAV assets.
- Browser vibration is used only where supported.
- Web notifications are used only if the user explicitly enables the timer-notification setting and browser permission is granted.
- Live Activity controls are hidden because a browser cannot provide a real ActivityKit Live Activity.
- GitHub Pages / Cloudflare / static web deployment remains supported.

### Capacitor iOS

- Native local completion notification is scheduled at `expectedEndDate`.
- Pause cancels the pending notification.
- Resume creates a new end timestamp in the authoritative web timer, then reschedules the notification.
- Stop cancels the notification and ends the Live Activity.
- Start/Pause/Resume/Stop use restrained native haptics if enabled.
- Completion uses native success haptic when ARAM is executing.
- Live Activity is rendered with ActivityKit + WidgetKit, including Lock Screen and Dynamic Island presentations.
- Native sound preview and notification sounds use the curated ARAM sound set.

## Capacitor setup on macOS

Requirements:

- macOS with Xcode 26 or a Capacitor-8-compatible Xcode version
- Node/npm with access to the public npm registry
- Apple Developer signing identity for device testing
- iPhone running a Live-Activity-capable iOS version for Live Activity tests

Install dependencies and generate the wrapper:

```bash
npm install
npm run cap:add:ios
npm run cap:sync:ios
npm run cap:open:ios
```

`npm run native:web` creates the native web asset directory `www/` without changing the root PWA.

> This execution environment could not fetch `@capacitor/*` from its internal npm mirror, so the generated Xcode project itself is intentionally not fabricated. `capacitor.config.ts`, the local Swift Package plugin, Widget Extension source and all required integration files are provided. Generate the standard Capacitor `ios/` project on macOS with the commands above.

## Xcode integration checklist

1. Generate the Capacitor iOS project.
2. Confirm the main app deployment target is at least iOS 15 for the local plugin; Live Activity is capability-gated and its Widget Extension target must be iOS 16.1 or later.
3. Add `NSSupportsLiveActivities = YES` to the main app Info.plist. See `ios-template/App/App/Info.plist.patch`.
4. Add a Widget Extension target named `AramLiveActivity` with deployment target iOS 16.1 or later.
5. Replace the generated Widget Extension source with the files under `ios-template/AramLiveActivity/`.
6. Add the local Swift Package at `native/aram-native-timer` to the Xcode workspace if Capacitor sync has not already done so.
7. Link product `AramTimerActivityModel` to the Widget Extension target so the app/plugin and widget use exactly the same ActivityAttributes type.
8. Keep `AramNativeTimerPlugin` linked to the main app target.
9. Assign a unique Widget Extension bundle identifier under the same development team.
10. Confirm the four WAV resources are present in the `AramNativeTimerPlugin` Swift Package resources.
11. Do **not** enable Critical Alerts.
12. Do **not** add `NSSupportsLiveActivitiesFrequentUpdates`; ARAM does not perform frequent Live Activity updates.

## App Groups

No App Group is required in this version.

ARAM deliberately does not ship Pause/Resume/Stop App Intent controls in the Live Activity yet. Adding controls would introduce a second native mutation path unless state sharing and conflict rules were designed first. Reliability is prioritized over extra controls.

## Lifecycle synchronization

| ARAM transition | Notification | Live Activity | Haptic |
| --- | --- | --- | --- |
| Configure | no pending completion | cleanup if idle | none |
| Start | schedule for end date | create/update Running | light |
| Pause | cancel | Paused, static remaining | light |
| Resume | reschedule new end date | Running with new end date | light |
| Stop/Reset | cancel | end immediately as Cancelled | subtle |
| Completion | already scheduled by iOS | show Completed then end when app is running | success |
| Reopen | reconcile persisted timestamps | repair/update/end from authoritative runtime | none |

## Crash and termination recovery

The local notification is scheduled with iOS, so it does not require JavaScript to remain alive.

On reopen, `ReliableTimer.restore()` recalculates remaining time from persisted timestamps. If the timer expired, completion uses the existing idempotent session ID and statistics are recorded once.

### Important ActivityKit limitation

A locally started Live Activity can use `staleDate` so the system marks it stale exactly at the expected end time. ARAM's Widget uses `context.isStale` to show a completed visual state even if the app process is gone.

However, ActivityKit does not provide a local API that schedules a future `activity.end()` call after the app has been force-terminated. Without a server-driven ActivityKit push or another runnable native background path, exact removal at the end timestamp cannot be guaranteed after force termination. ARAM ends stale/orphaned activities on the next app launch. This limitation is documented instead of being hidden.

## Native source map

- `capacitor.config.ts` — Capacitor wrapper configuration
- `scripts/build-native-web.mjs` — creates `www/`
- `js/native-timer-bridge.js` — capability detection and native synchronization
- `native/aram-native-timer/` — local Capacitor Swift Package plugin
- `native/aram-native-timer/.../AramTimerAttributes.swift` — shared ActivityKit contract
- `native/aram-native-timer/.../AramNativeTimerPlugin.swift` — notifications, Live Activities, haptics, sound preview
- `ios-template/AramLiveActivity/` — Widget Extension UI
- `assets/sounds/` — PWA sound assets

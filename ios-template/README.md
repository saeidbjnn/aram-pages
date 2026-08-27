# ARAM iOS Integration Template

These files are source templates for the standard Capacitor iOS project generated on macOS. They are not a fake or hand-written replacement for Capacitor's generated Xcode project.

## Generate the wrapper

```bash
npm install
npm run cap:add:ios
npm run cap:sync:ios
npm run cap:open:ios
```

## Main app target

- Keep the standard Capacitor app target.
- Ensure the local `aram-native-timer` package/product is linked.
- Merge `App/App/Info.plist.patch` into the generated app Info.plist.
- `App/App/App.entitlements` is intentionally empty; no App Group is required in this version.

## Live Activity extension

1. In Xcode create a Widget Extension named `AramLiveActivity` and enable Live Activity support.
2. Set the extension deployment target to iOS 16.1+.
3. Replace its generated source with the Swift files in `AramLiveActivity/`.
4. Link the local Swift Package product `AramTimerActivityModel` to the extension target.
5. Keep the extension and app under the same Apple Developer team, with distinct bundle identifiers.
6. Do not enable frequent Live Activity updates; the countdown is system-rendered from timestamps.

## App Groups and interactive controls

No App Group is required because this release intentionally omits Live Activity App Intent Pause/Resume/Stop controls. The JavaScript `ReliableTimer` remains the only mutation source. Interactive controls should be added only after designing a shared native state/locking contract.

## Verification

Build and run on a physical iPhone and complete every test in `TIMER_TEST_REPORT.md` before marking the native feature release-complete.

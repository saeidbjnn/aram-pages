# ARAM Live Activity

## Principle

ARAM uses a real ActivityKit Live Activity. There is no imitation Live Activity rendered inside the web page.

The Live Activity is a projection of the authoritative JavaScript timer state. The native layer receives lifecycle transitions only; it does not run an independent second-by-second timer engine.

## Shared model

`AramTimerAttributes` lives in the local Swift Package product `AramTimerActivityModel` and is linked to both the main app/plugin and the Widget Extension.

Static attributes:

- `sessionID`
- Persian timer-mode title
- optional activity/task title
- total duration

Dynamic content state:

- `status`: running / paused / completed / cancelled
- `phase`: focus / work / break
- display start date
- expected end date
- exact paused remaining seconds

## System-driven countdown

Running content renders with SwiftUI system timer APIs:

- `Text(timerInterval:countsDown:)`
- `ProgressView(timerInterval:countsDown:)`

No JavaScript loop updates ActivityKit each second.

On resume, the bridge derives a display start timestamp from the **new end date minus total duration**, which keeps progress correct after pause time instead of counting paused time as elapsed work.

## Presentations

### Lock Screen

Displays:

- آرام
- mode: تمرکز / کار / استراحت
- native countdown
- optional activity title when supplied
- restrained progress bar
- current status

### Dynamic Island compact

- leading: minimal ARAM mark
- trailing: system countdown

### Dynamic Island minimal

- timer or pause symbol

### Dynamic Island expanded

- ARAM + timer mode
- system countdown
- optional current activity
- progress
- status

The extension is RTL and uses Persian locale/accessibility text.

## State transitions

### Running

`expectedEndDate` is present. `staleDate` is set to the same date.

### Paused

`expectedEndDate` becomes nil and exact remaining seconds are frozen. The notification is cancelled separately by the native plugin.

### Completed

When ARAM is executing at completion, the activity receives a Completed state and ends with a short dismissal delay so the user can see the completion message.

If the process is not running at the end time, `staleDate` makes `context.isStale` true and the Widget switches to a completed visual state. ARAM reconciles and ends it on the next launch.

### Cancelled

Stop/Reset immediately ends the Activity with a Cancelled state and `.immediate` dismissal.

## Duplicate protection

- `sessionID` is the identity used by the Live Activity.
- Existing activity with the same session is updated.
- Activities for another session are ended before a new one starts.
- Plugin load removes duplicate leftover activities.
- ARAM restore repairs native state from the persisted timer.

## Interactive controls

Pause / Resume / Stop App Intent buttons are intentionally deferred. Their implementation would require a safe shared mutation channel so a Live Activity action can update the same authoritative timer state without creating a second engine.

## Required entitlement/configuration

Main app Info.plist:

```xml
<key>NSSupportsLiveActivities</key>
<true/>
```

No App Group is required in this version.

The Widget Extension must have iOS 16.1+ deployment target and link `AramTimerActivityModel`.

## Battery behavior

ARAM does not:

- poll ActivityKit
- update it every second
- run background JavaScript to animate the countdown
- keep an audio session active for the Live Activity

The system owns countdown rendering between lifecycle transitions.

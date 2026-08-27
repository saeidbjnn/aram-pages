# ARAM Timer Notification, Sound and Haptic System

## Native iOS notifications

The Capacitor iOS build uses `UNUserNotificationCenter` directly through `AramNativeTimerPlugin`.

A timer notification is local. It does not require push infrastructure or a server.

Notification identity:

```text
aram.timer.<sessionId>
```

Using the authoritative session ID means Start/Resume can replace the same request and Pause/Stop can cancel it without duplicate alarms.

## Scheduling rules

### Start / Resume

If the user enabled timer notifications, schedule one local notification for the authoritative `expectedEndDate`.

### Pause

Cancel the request for the current session.

### Resume

The web timer calculates a new end timestamp. The native layer schedules a replacement request for that timestamp.

### Stop / Reset

Cancel all pending ARAM timer requests and end the Live Activity.

### Completion

The already-scheduled local notification provides completion feedback even when the web process is suspended. If ARAM is in foreground, its notification-center delegate requests banner/list/sound presentation as allowed by iOS.

## Permission UX

ARAM never requests notification permission on first launch.

In Settings, enabling **اعلان پایان تایمر** first shows a Persian explanation:

> برای اینکه پایان جلسه را حتی وقتی آرام باز نیست متوجه شوی، اجازه اعلان لازم است.

Only pressing **فعال کردن اعلان‌ها** invokes the system permission dialog.

If permission is denied, ARAM continues to work and offers a route to iOS Settings instead of repeatedly asking.

## Persian notification copy

Focus:

- `زمان تمرکز تمام شد`
- `جلسه ۲۵ دقیقه‌ای شما به پایان رسید.`

Work:

- `زمان کار تمام شد`
- `بازه کاری شما به پایان رسید.`

Break:

- `استراحت تمام شد`
- `وقت برگشتن به کار است.`

Custom timer:

- `تایمر به پایان رسید`
- `زمان تنظیم‌شده شما به پایان رسید.`

## Sound set

Curated values:

- `calm` — آرام
- `soft-bell` — زنگ نرم
- `chime` — چایم
- `minimal` — مینیمال
- `system` — سیستم
- `none` — بدون صدا

Custom WAV assets are mono 16-bit 44.1 kHz and under one second. They are bundled as Swift Package resources and copied to `Library/Sounds`, a supported location for notification sounds.

If a custom file cannot be resolved, native preview and notification configuration safely fall back to the standard system sound rather than failing silently.

## Sound preview

Changing the sound selector previews the chosen sound.

Before any new preview:

1. native preview player is stopped;
2. web preview is paused/reset;
3. only the selected new sound begins.

Closing Settings stops the preview.

## Haptics

When enabled:

- Start: light
- Pause: soft/light
- Resume: light
- Stop: subtle
- Completion while ARAM is executing: success notification feedback

The app never repeats vibration continuously.

When the app is suspended/terminated, notification haptic behavior is owned by iOS and the user’s system settings.

## System settings

ARAM does not bypass:

- Silent Mode
- Focus / Do Not Disturb
- user notification preferences
- per-app sound settings

Critical Alerts are not requested or implemented.

## PWA fallback

On the web:

- native-only Live Activity setting is hidden;
- web notification is only attempted when enabled and browser permission is already granted;
- bundled local sound is used where browser autoplay/background rules permit;
- `navigator.vibrate` is used only where available;
- unsupported controls are not displayed as if they worked.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeTimerBridge, TIMER_SOUND_OPTIONS } from '../js/native-timer-bridge.js';

function nativeHarness({ permission = 'prompt', liveEnabled = true } = {}) {
  const calls = [];
  const plugin = {
    async getCapabilities() {
      calls.push(['capabilities']);
      return {
        notificationsSupported: true,
        notificationPermission: permission,
        liveActivitiesSupported: true,
        liveActivitiesEnabledBySystem: liveEnabled,
        hapticsSupported: true,
        soundPreviewSupported: true,
        iosVersion: '18.0'
      };
    },
    async requestNotificationPermission() { calls.push(['permission']); return { permission: 'granted' }; },
    async openNotificationSettings() { calls.push(['settings']); },
    async syncTimer(payload) { calls.push(['sync', structuredClone(payload)]); },
    async completeTimer(payload) { calls.push(['complete', structuredClone(payload)]); },
    async previewSound(payload) { calls.push(['preview', structuredClone(payload)]); },
    async stopSoundPreview() { calls.push(['preview-stop']); }
  };
  const globalRef = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: { AramNativeTimer: plugin }
    },
    navigator: { vibrate() { throw new Error('native should not use web vibration'); } }
  };
  return { bridge: createNativeTimerBridge({ globalRef }), calls, plugin };
}

function runningSnapshot(overrides = {}) {
  return {
    sessionId: 'session-1', mode: 'focus', phase: 'focus', status: 'running',
    durationSeconds: 1500, durationSource: 'preset', remainingMilliseconds: 1_200_000,
    startedAt: '2026-08-08T08:00:00.000Z', endsAt: '2026-08-08T08:25:00.000Z',
    ...overrides
  };
}

const prefs = {
  timerNotifications: true,
  timerSound: 'calm',
  vibration: true,
  liveActivities: true,
  autoContinue: false
};

test('native bridge exposes iOS capabilities and requests permission only on demand', async () => {
  const { bridge, calls } = nativeHarness();
  const capabilities = await bridge.refreshCapabilities();
  assert.equal(capabilities.nativeIOS, true);
  assert.equal(capabilities.liveActivitiesSupported, true);
  assert.equal(capabilities.notificationPermission, 'prompt');
  assert.deepEqual(calls, [['capabilities']]);
  assert.equal(await bridge.requestNotificationPermission(), 'granted');
  assert.deepEqual(calls.map(call => call[0]), ['capabilities', 'permission', 'capabilities']);
});

test('native bridge serializes timer transitions and sends timestamp state rather than per-second updates', async () => {
  const { bridge, calls } = nativeHarness({ permission: 'granted' });
  await bridge.handleTransition(runningSnapshot(), prefs, 'start');
  await bridge.handleTransition(runningSnapshot({ status: 'paused', endsAt: null, remainingMilliseconds: 900_500 }), prefs, 'pause');
  await bridge.handleTransition(runningSnapshot({ status: 'running', endsAt: '2026-08-08T08:30:00.500Z', remainingMilliseconds: 900_500 }), prefs, 'resume');
  const syncs = calls.filter(call => call[0] === 'sync');
  assert.equal(syncs.length, 3);
  assert.deepEqual(syncs.map(call => call[1].reason), ['start', 'pause', 'resume']);
  assert.equal(syncs[0][1].timer.expectedEndDate, '2026-08-08T08:25:00.000Z');
  assert.equal(syncs[1][1].timer.remainingSeconds, 900.5);
  assert.equal(syncs[1][1].timer.expectedEndDate, null);
  assert.equal(syncs[2][1].timer.startDate, '2026-08-08T08:05:00.500Z');
  assert.equal(syncs[2][1].preferences.notificationsEnabled, true);
});

test('completion crosses native bridge exactly once with completed session IDs and next authoritative runtime', async () => {
  const { bridge, calls } = nativeHarness({ permission: 'granted' });
  const completed = [{ id: 'session-1', kind: 'focus', startedAt: '2026-08-08T08:00:00.000Z', endedAt: '2026-08-08T08:25:00.000Z', durationSeconds: 1500 }];
  const idle = runningSnapshot({ sessionId: null, status: 'idle', startedAt: null, endsAt: null, remainingMilliseconds: 1_500_000 });
  await bridge.handleTransition(idle, prefs, 'complete', { sessions: completed });
  const completions = calls.filter(call => call[0] === 'complete');
  assert.equal(completions.length, 1);
  assert.equal(completions[0][1].completedSessions[0].id, 'session-1');
  assert.equal(completions[0][1].nextTimer.status, 'idle');
  assert.equal(completions[0][1].preferences.autoContinue, false);
});

test('sound preview stops the previous native preview before starting a new one', async () => {
  const { bridge, calls } = nativeHarness();
  await bridge.previewSound('calm');
  await bridge.previewSound('chime');
  assert.deepEqual(calls.map(call => call[0]), ['preview-stop', 'preview', 'preview-stop', 'preview']);
  assert.equal(calls.at(-1)[1].sound, 'chime');
  assert.deepEqual(TIMER_SOUND_OPTIONS.map(sound => sound.id), ['calm', 'soft-bell', 'chime', 'minimal', 'system', 'none']);
});

test('web bridge never exposes Live Activity and keeps completion haptics as a capability fallback', async () => {
  const vibrations = [];
  const bridge = createNativeTimerBridge({
    globalRef: {
      navigator: { vibrate: pattern => { vibrations.push(pattern); return true; } },
      Notification: { permission: 'default' }
    }
  });
  const capabilities = await bridge.refreshCapabilities();
  assert.equal(capabilities.nativeIOS, false);
  assert.equal(capabilities.liveActivitiesSupported, false);
  await bridge.handleTransition(runningSnapshot(), prefs, 'start');
  await bridge.handleTransition(runningSnapshot(), prefs, 'complete');
  assert.equal(vibrations.length, 2);
});

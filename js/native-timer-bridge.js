export const TIMER_SOUND_OPTIONS = Object.freeze([
  { id: 'calm', label: 'آرام', file: 'aram-calm.wav' },
  { id: 'soft-bell', label: 'زنگ نرم', file: 'aram-soft-bell.wav' },
  { id: 'chime', label: 'چایم', file: 'aram-chime.wav' },
  { id: 'minimal', label: 'مینیمال', file: 'aram-minimal.wav' },
  { id: 'system', label: 'سیستم', file: null },
  { id: 'none', label: 'بدون صدا', file: null }
]);

export const TIMER_SOUND_IDS = Object.freeze(TIMER_SOUND_OPTIONS.map(item => item.id));

const registeredNativePlugins = new WeakMap();

function nativePlugin(globalRef) {
  const capacitor = globalRef?.Capacitor;
  const native = typeof capacitor?.isNativePlatform === 'function'
    ? capacitor.isNativePlatform()
    : Boolean(capacitor?.isNative);
  const platform = typeof capacitor?.getPlatform === 'function' ? capacitor.getPlatform() : null;
  if (!native || platform !== 'ios') return null;
  if (capacitor?.Plugins?.AramNativeTimer) return capacitor.Plugins.AramNativeTimer;
  if (typeof capacitor?.registerPlugin === 'function') {
    if (!registeredNativePlugins.has(globalRef)) registeredNativePlugins.set(globalRef, capacitor.registerPlugin('AramNativeTimer'));
    return registeredNativePlugins.get(globalRef);
  }
  return null;
}

function soundDefinition(soundId) {
  return TIMER_SOUND_OPTIONS.find(item => item.id === soundId) || TIMER_SOUND_OPTIONS[0];
}

function modeLabel(snapshot) {
  if (snapshot?.phase === 'break') return 'استراحت';
  if (snapshot?.phase === 'work') return 'کار';
  return 'تمرکز';
}

function timerPayload(snapshot) {
  if (!snapshot) return null;
  const totalDurationSeconds = Math.max(1, Math.round(Number(snapshot.durationSeconds || 1)));
  const expectedEndDate = snapshot.endsAt || null;
  let displayStartDate = snapshot.startedAt || null;
  if (snapshot.status === 'running' && expectedEndDate) {
    const endMs = new Date(expectedEndDate).getTime();
    if (Number.isFinite(endMs)) displayStartDate = new Date(endMs - totalDurationSeconds * 1000).toISOString();
  }
  return {
    sessionId: snapshot.sessionId || null,
    mode: snapshot.mode || 'focus',
    phase: snapshot.phase || 'focus',
    modeLabel: modeLabel(snapshot),
    status: snapshot.status || 'idle',
    totalDurationSeconds,
    remainingSeconds: Math.max(0, Number(snapshot.remainingMilliseconds ?? ((snapshot.remainingSeconds || 0) * 1000)) / 1000),
    startDate: displayStartDate,
    expectedEndDate,
    durationSource: snapshot.durationSource === 'custom' ? 'custom' : 'preset'
  };
}

function preferencePayload(settings = {}) {
  return {
    notificationsEnabled: settings.timerNotifications === true,
    sound: TIMER_SOUND_IDS.includes(settings.timerSound) ? settings.timerSound : 'calm',
    hapticsEnabled: settings.vibration !== false,
    liveActivitiesEnabled: settings.liveActivities !== false,
    autoContinue: settings.autoContinue === true
  };
}

function webCapabilities(globalRef) {
  return {
    nativeIOS: false,
    notificationsSupported: typeof globalRef?.Notification !== 'undefined',
    notificationPermission: globalRef?.Notification?.permission || 'unsupported',
    liveActivitiesSupported: false,
    liveActivitiesEnabledBySystem: false,
    hapticsSupported: typeof globalRef?.navigator?.vibrate === 'function',
    soundPreviewSupported: typeof globalRef?.Audio === 'function'
  };
}

export function createNativeTimerBridge({
  diagnostics = null,
  globalRef = globalThis,
  audioFactory = source => new globalRef.Audio(source)
} = {}) {
  let capabilities = webCapabilities(globalRef);
  let previewAudio = null;
  let previewToken = 0;
  let nativeSyncQueue = Promise.resolve();

  const report = (error, context = {}) => {
    try { diagnostics?.captureError?.('timer_native', error, context); } catch {}
  };

  async function refreshCapabilities() {
    const plugin = nativePlugin(globalRef);
    if (!plugin?.getCapabilities) {
      capabilities = webCapabilities(globalRef);
      return structuredClone(capabilities);
    }
    try {
      const result = await plugin.getCapabilities();
      capabilities = {
        nativeIOS: true,
        notificationsSupported: result.notificationsSupported !== false,
        notificationPermission: result.notificationPermission || 'unknown',
        liveActivitiesSupported: result.liveActivitiesSupported === true,
        liveActivitiesEnabledBySystem: result.liveActivitiesEnabledBySystem === true,
        hapticsSupported: result.hapticsSupported !== false,
        soundPreviewSupported: result.soundPreviewSupported !== false,
        iosVersion: result.iosVersion || null
      };
    } catch (error) {
      report(error, { operation: 'native_capabilities' });
      capabilities = { ...webCapabilities(globalRef), nativeIOS: true };
    }
    return structuredClone(capabilities);
  }

  function getCapabilities() {
    return structuredClone(capabilities);
  }

  async function requestNotificationPermission() {
    const plugin = nativePlugin(globalRef);
    try {
      if (plugin?.requestNotificationPermission) {
        const result = await plugin.requestNotificationPermission();
        await refreshCapabilities();
        return result?.permission || capabilities.notificationPermission;
      }
      if (typeof globalRef?.Notification?.requestPermission === 'function') {
        const permission = await globalRef.Notification.requestPermission();
        capabilities.notificationPermission = permission;
        return permission;
      }
    } catch (error) {
      report(error, { operation: 'notification_permission' });
    }
    return 'unsupported';
  }

  async function openNotificationSettings() {
    const plugin = nativePlugin(globalRef);
    if (!plugin?.openNotificationSettings) return false;
    try {
      await plugin.openNotificationSettings();
      return true;
    } catch (error) {
      report(error, { operation: 'notification_settings' });
      return false;
    }
  }

  async function stopSoundPreview() {
    previewToken += 1;
    const plugin = nativePlugin(globalRef);
    if (plugin?.stopSoundPreview) {
      try { await plugin.stopSoundPreview(); } catch (error) { report(error, { operation: 'native_sound_preview_stop' }); }
    }
    if (previewAudio) {
      try { previewAudio.pause(); previewAudio.currentTime = 0; } catch {}
      previewAudio = null;
    }
  }

  async function previewSound(soundId) {
    const sound = soundDefinition(soundId);
    await stopSoundPreview();
    if (sound.id === 'none') return true;
    const token = ++previewToken;
    const plugin = nativePlugin(globalRef);
    if (plugin?.previewSound) {
      try {
        await plugin.previewSound({ sound: sound.id });
        return true;
      } catch (error) {
        report(error, { operation: 'native_sound_preview', sound: sound.id });
        return false;
      }
    }
    if (sound.id === 'system') return playWebCompletion('system');
    try {
      const audio = audioFactory(`assets/sounds/${sound.file}`);
      previewAudio = audio;
      audio.preload = 'auto';
      await audio.play();
      if (token !== previewToken) {
        audio.pause();
        return false;
      }
      return true;
    } catch (error) {
      report(error, { operation: 'web_sound_preview', sound: sound.id });
      return false;
    }
  }

  async function playWebCompletion(soundId = 'calm') {
    if (nativePlugin(globalRef)) return false;
    const sound = soundDefinition(soundId);
    if (sound.id === 'none') return false;
    if (sound.id === 'system') {
      try {
        const Context = globalRef.AudioContext || globalRef.webkitAudioContext;
        if (!Context) return false;
        const context = new Context();
        await context.resume?.();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
        oscillator.start(); oscillator.stop(context.currentTime + 0.32);
        return true;
      } catch (error) {
        report(error, { operation: 'web_system_sound' });
        return false;
      }
    }
    try {
      const audio = audioFactory(`assets/sounds/${sound.file}`);
      await audio.play();
      return true;
    } catch (error) {
      report(error, { operation: 'web_completion_sound', sound: sound.id });
      return false;
    }
  }

  function webHaptic(reason, enabled = true) {
    if (!enabled || nativePlugin(globalRef) || typeof globalRef?.navigator?.vibrate !== 'function') return false;
    const pattern = reason === 'complete' ? [140, 70, 180]
      : reason === 'start' || reason === 'resume' ? 18
        : reason === 'pause' ? 12
          : reason === 'stop' ? 10
            : 0;
    if (!pattern) return false;
    try { return globalRef.navigator.vibrate(pattern); }
    catch (error) { report(error, { operation: 'web_haptic', reason }); return false; }
  }

  function handleTransition(snapshot, settings, reason, detail = {}) {
    const plugin = nativePlugin(globalRef);
    if (!plugin) {
      webHaptic(reason, settings?.vibration !== false);
      return Promise.resolve({ native: false });
    }
    const preferences = preferencePayload(settings);
    const snapshotCopy = structuredClone(snapshot);
    const detailCopy = structuredClone(detail);
    const operation = async () => {
      try {
        if (reason === 'complete' && plugin.completeTimer) {
          const sessions = Array.isArray(detailCopy.sessions) ? detailCopy.sessions : [];
          await plugin.completeTimer({
            completedSessions: sessions.map(session => ({
              id: session.id,
              kind: session.kind,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              durationSeconds: session.durationSeconds
            })),
            nextTimer: timerPayload(snapshotCopy),
            preferences
          });
        } else if (plugin.syncTimer) {
          await plugin.syncTimer({ timer: timerPayload(snapshotCopy), preferences, reason });
        }
        return { native: true };
      } catch (error) {
        report(error, { operation: 'native_timer_sync', reason, sessionId: snapshotCopy?.sessionId || null });
        return { native: true, error };
      }
    };
    nativeSyncQueue = nativeSyncQueue.then(operation, operation);
    return nativeSyncQueue;
  }

  return {
    refreshCapabilities,
    getCapabilities,
    requestNotificationPermission,
    openNotificationSettings,
    previewSound,
    stopSoundPreview,
    playWebCompletion,
    webHaptic,
    handleTransition,
    isNativeIOS: () => Boolean(nativePlugin(globalRef))
  };
}

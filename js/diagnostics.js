export const APP_VERSION = '3.4.0';
export const DIAGNOSTICS_VERSION = 1;
export const DIAGNOSTICS_KEY = 'aram-diagnostics-v1';
export const ANALYTICS_KEY = 'aram-analytics-v1';

const DEFAULT_LIMITS = Object.freeze({ errors: 120, console: 240, events: 1200, sessions: 120, performance: 180 });

function safeString(value, maxLength = 2000) {
  try {
    if (typeof value === 'string') return value.slice(0, maxLength);
    if (value instanceof Error) return `${value.name}: ${value.message}`.slice(0, maxLength);
    return JSON.stringify(value, (_key, nested) => typeof nested === 'bigint' ? String(nested) : nested).slice(0, maxLength);
  } catch {
    return String(value).slice(0, maxLength);
  }
}

function errorRecord(category, error, context, now) {
  const normalized = error instanceof Error ? error : new Error(safeString(error));
  return {
    id: `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(now()).toISOString(),
    category: String(category || 'unexpected'),
    name: normalized.name || 'Error',
    message: normalized.message || 'Unknown error',
    stack: safeString(normalized.stack || '', 8000),
    context: context && typeof context === 'object' ? context : { value: safeString(context) }
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  };
}

function resolveStorage(storage) {
  if (!storage) return { storage: createMemoryStorage(), persistent: false };
  try {
    const key = `aram-diagnostic-probe-${Math.random()}`;
    storage.setItem(key, '1');
    storage.removeItem(key);
    return { storage, persistent: true };
  } catch {
    return { storage: createMemoryStorage(), persistent: false };
  }
}

function readJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function byteLength(value) {
  try { return new Blob([String(value)]).size; } catch { return String(value).length * 2; }
}

function trim(items, limit) {
  return items.length > limit ? items.slice(items.length - limit) : items;
}

export function createDiagnostics({
  storage = globalThis.localStorage,
  now = Date.now,
  performanceRef = globalThis.performance,
  limits = DEFAULT_LIMITS,
  schedule = globalThis.setTimeout,
  cancelSchedule = globalThis.clearTimeout
} = {}) {
  const resolved = resolveStorage(storage);
  const emptyDiagnostics = { version: DIAGNOSTICS_VERSION, errors: [], console: [], performance: [] };
  const emptyAnalytics = { version: DIAGNOSTICS_VERSION, events: [], sessions: [] };
  let diagnostics = readJson(resolved.storage, DIAGNOSTICS_KEY, emptyDiagnostics);
  let analytics = readJson(resolved.storage, ANALYTICS_KEY, emptyAnalytics);
  diagnostics.errors = Array.isArray(diagnostics.errors) ? diagnostics.errors : [];
  diagnostics.console = Array.isArray(diagnostics.console) ? diagnostics.console : [];
  diagnostics.performance = Array.isArray(diagnostics.performance) ? diagnostics.performance : [];
  analytics.events = Array.isArray(analytics.events) ? analytics.events : [];
  analytics.sessions = Array.isArray(analytics.sessions) ? analytics.sessions : [];

  let flushTimer = null;
  let activeSession = null;
  let activeScreen = null;
  let activeScreenStartedAt = null;
  let rafId = null;
  let frameCount = 0;
  let frameWindowStartedAt = now();
  let longTaskObserver = null;
  let handlersInstalled = false;
  let consoleRestore = null;

  function persist() {
    flushTimer = null;
    diagnostics.errors = trim(diagnostics.errors, limits.errors || DEFAULT_LIMITS.errors);
    diagnostics.console = trim(diagnostics.console, limits.console || DEFAULT_LIMITS.console);
    diagnostics.performance = trim(diagnostics.performance, limits.performance || DEFAULT_LIMITS.performance);
    analytics.events = trim(analytics.events, limits.events || DEFAULT_LIMITS.events);
    analytics.sessions = trim(analytics.sessions, limits.sessions || DEFAULT_LIMITS.sessions);
    try {
      resolved.storage.setItem(DIAGNOSTICS_KEY, JSON.stringify(diagnostics));
      resolved.storage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
      return true;
    } catch {
      diagnostics.errors = trim(diagnostics.errors, Math.max(20, Math.floor((limits.errors || 120) / 2)));
      diagnostics.console = trim(diagnostics.console, Math.max(30, Math.floor((limits.console || 240) / 2)));
      analytics.events = trim(analytics.events, Math.max(100, Math.floor((limits.events || 1200) / 2)));
      analytics.sessions = trim(analytics.sessions, Math.max(20, Math.floor((limits.sessions || 120) / 2)));
      try {
        resolved.storage.setItem(DIAGNOSTICS_KEY, JSON.stringify(diagnostics));
        resolved.storage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
        return true;
      } catch (error) {
        diagnostics.errors.push(errorRecord('diagnostics_storage', error, { operation: 'diagnostics_persist' }, now));
        diagnostics.errors = trim(diagnostics.errors, Math.max(20, Math.floor((limits.errors || 120) / 2)));
        return false;
      }
    }
  }

  function schedulePersist(immediate = false) {
    if (immediate) return persist();
    if (flushTimer !== null || typeof schedule !== 'function') return false;
    flushTimer = schedule(persist, 450);
    return true;
  }

  function captureError(category, error, context = {}) {
    diagnostics.errors.push(errorRecord(category, error, context, now));
    schedulePersist(true);
  }

  function captureConsole(level, args) {
    diagnostics.console.push({
      at: new Date(now()).toISOString(),
      level,
      message: args.map(value => safeString(value, 1000)).join(' ')
    });
    schedulePersist();
  }

  function trackEvent(name, details = {}) {
    analytics.events.push({
      at: new Date(now()).toISOString(),
      name: String(name || 'event'),
      details: details && typeof details === 'object' ? details : { value: safeString(details) }
    });
    schedulePersist();
  }

  function beginSession() {
    if (activeSession) return activeSession.id;
    const startedAt = now();
    activeSession = { id: `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, startedAt };
    trackEvent('app_session_start', { sessionId: activeSession.id });
    return activeSession.id;
  }

  function endScreen(reason = 'navigation') {
    if (!activeScreen || activeScreenStartedAt === null) return;
    const durationMs = Math.max(0, now() - activeScreenStartedAt);
    trackEvent('screen_time', { screen: activeScreen, durationMs, reason });
    activeScreenStartedAt = null;
  }

  function enterScreen(screen) {
    const next = String(screen || 'unknown');
    if (activeScreen === next && activeScreenStartedAt !== null) return;
    const previous = activeScreen;
    endScreen('navigation');
    activeScreen = next;
    activeScreenStartedAt = now();
    trackEvent('screen_visit', { screen: next, from: previous });
    if (previous) trackEvent('navigation_flow', { from: previous, to: next });
  }

  function endSession(reason = 'pagehide') {
    endScreen(reason);
    if (!activeSession) { persist(); return; }
    const endedAt = now();
    const record = {
      id: activeSession.id,
      startedAt: new Date(activeSession.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: Math.max(0, endedAt - activeSession.startedAt),
      reason
    };
    analytics.sessions.push(record);
    analytics.events.push({ at: record.endedAt, name: 'app_session_end', details: { sessionId: record.id, durationMs: record.durationMs, reason } });
    activeSession = null;
    persist();
  }

  function recordPerformance(name, durationMs, details = {}) {
    diagnostics.performance.push({ at: new Date(now()).toISOString(), name, durationMs: Math.round(Number(durationMs || 0) * 100) / 100, ...details });
    schedulePersist();
  }

  function measure(name, operation, details = {}) {
    const started = performanceRef?.now?.() ?? now();
    try {
      const result = operation();
      if (result && typeof result.then === 'function') {
        return result.finally(() => recordPerformance(name, (performanceRef?.now?.() ?? now()) - started, details));
      }
      recordPerformance(name, (performanceRef?.now?.() ?? now()) - started, details);
      return result;
    } catch (error) {
      recordPerformance(name, (performanceRef?.now?.() ?? now()) - started, { ...details, failed: true });
      throw error;
    }
  }

  function frame(timestamp) {
    frameCount += 1;
    const elapsed = timestamp - frameWindowStartedAt;
    if (elapsed >= 1000) {
      const fps = Math.round(frameCount * 1000 / elapsed);
      recordPerformance('fps', elapsed, { fps });
      frameCount = 0;
      frameWindowStartedAt = timestamp;
    }
    rafId = globalThis.requestAnimationFrame?.(frame) ?? null;
  }

  function startPerformanceMonitor() {
    if (rafId === null && typeof globalThis.requestAnimationFrame === 'function') {
      frameWindowStartedAt = performanceRef?.now?.() ?? now();
      rafId = globalThis.requestAnimationFrame(frame);
    }
    if (!longTaskObserver && typeof globalThis.PerformanceObserver === 'function') {
      try {
        longTaskObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) recordPerformance('long_task', entry.duration, { startTime: entry.startTime });
        });
        longTaskObserver.observe({ type: 'longtask', buffered: true });
      } catch { longTaskObserver = null; }
    }
  }

  function stopPerformanceMonitor() {
    if (rafId !== null) globalThis.cancelAnimationFrame?.(rafId);
    rafId = null;
    longTaskObserver?.disconnect?.();
    longTaskObserver = null;
  }

  function installGlobalHandlers(target = globalThis) {
    if (handlersInstalled || !target?.addEventListener) return;
    handlersInstalled = true;
    target.addEventListener('error', event => captureError('javascript', event.error || event.message, {
      filename: event.filename || '', line: event.lineno || 0, column: event.colno || 0
    }));
    target.addEventListener('unhandledrejection', event => captureError('unhandled_promise', event.reason, {}));

    const original = {};
    for (const level of ['log', 'info', 'warn', 'error']) {
      if (typeof console?.[level] !== 'function') continue;
      original[level] = console[level];
      console[level] = (...args) => {
        try { captureConsole(level, args); } catch {}
        original[level].apply(console, args);
      };
    }
    consoleRestore = () => {
      for (const [level, method] of Object.entries(original)) console[level] = method;
    };
  }

  function storageInspector() {
    const entries = [];
    try {
      for (let index = 0; index < resolved.storage.length; index += 1) {
        const key = resolved.storage.key(index);
        if (!key) continue;
        const value = resolved.storage.getItem(key) || '';
        entries.push({ key, bytes: byteLength(value), characters: value.length });
      }
    } catch (error) {
      captureError('storage_inspector', error);
    }
    return entries.sort((left, right) => right.bytes - left.bytes);
  }

  function analyticsSummary() {
    const visits = {};
    const screenTime = {};
    const buttons = {};
    const flows = {};
    const domain = {};
    for (const event of analytics.events) {
      if (event.name === 'screen_visit') visits[event.details.screen] = (visits[event.details.screen] || 0) + 1;
      if (event.name === 'screen_time') screenTime[event.details.screen] = (screenTime[event.details.screen] || 0) + Number(event.details.durationMs || 0);
      if (event.name === 'button_click') buttons[event.details.action || event.details.label || 'unknown'] = (buttons[event.details.action || event.details.label || 'unknown'] || 0) + 1;
      if (event.name === 'navigation_flow') {
        const key = `${event.details.from} → ${event.details.to}`;
        flows[key] = (flows[key] || 0) + 1;
      }
      if (['focus_session_completed', 'habit_completed', 'reading_session_recorded', 'task_completed'].includes(event.name)) domain[event.name] = (domain[event.name] || 0) + 1;
    }
    const averageSessionMs = analytics.sessions.length
      ? Math.round(analytics.sessions.reduce((sum, session) => sum + Number(session.durationMs || 0), 0) / analytics.sessions.length)
      : 0;
    return { visits, screenTime, buttons, flows, domain, averageSessionMs, sessionCount: analytics.sessions.length };
  }

  function snapshot() {
    const fpsSamples = diagnostics.performance.filter(item => item.name === 'fps' && Number.isFinite(item.fps)).slice(-10);
    const memory = performanceRef?.memory ? {
      usedJSHeapSize: performanceRef.memory.usedJSHeapSize,
      totalJSHeapSize: performanceRef.memory.totalJSHeapSize,
      jsHeapSizeLimit: performanceRef.memory.jsHeapSizeLimit
    } : null;
    return {
      appVersion: APP_VERSION,
      diagnosticsVersion: DIAGNOSTICS_VERSION,
      persistent: resolved.persistent,
      errors: structuredClone(diagnostics.errors),
      console: structuredClone(diagnostics.console),
      events: structuredClone(analytics.events),
      sessions: structuredClone(analytics.sessions),
      performance: structuredClone(diagnostics.performance),
      currentFps: fpsSamples.length ? fpsSamples[fpsSamples.length - 1].fps : null,
      averageFps: fpsSamples.length ? Math.round(fpsSamples.reduce((sum, item) => sum + item.fps, 0) / fpsSamples.length) : null,
      memory,
      analytics: analyticsSummary(),
      storage: storageInspector()
    };
  }

  function exportReport(extra = {}) {
    return {
      generatedAt: new Date(now()).toISOString(),
      appVersion: APP_VERSION,
      userAgent: globalThis.navigator?.userAgent || 'unknown',
      language: globalThis.navigator?.language || 'unknown',
      online: globalThis.navigator?.onLine ?? null,
      viewport: globalThis.innerWidth ? { width: globalThis.innerWidth, height: globalThis.innerHeight, pixelRatio: globalThis.devicePixelRatio || 1 } : null,
      diagnostics: snapshot(),
      ...extra
    };
  }

  function clear({ errors = true, console: consoleLogs = true, events = false, performance = false } = {}) {
    if (errors) diagnostics.errors = [];
    if (consoleLogs) diagnostics.console = [];
    if (events) { analytics.events = []; analytics.sessions = []; }
    if (performance) diagnostics.performance = [];
    persist();
  }

  function destroy() {
    endSession('destroy');
    stopPerformanceMonitor();
    if (flushTimer !== null && typeof cancelSchedule === 'function') cancelSchedule(flushTimer);
    flushTimer = null;
    consoleRestore?.();
  }

  return {
    isPersistent: resolved.persistent,
    captureError,
    captureConsole,
    trackEvent,
    beginSession,
    endSession,
    enterScreen,
    endScreen,
    recordPerformance,
    measure,
    startPerformanceMonitor,
    stopPerformanceMonitor,
    installGlobalHandlers,
    storageInspector,
    analyticsSummary,
    snapshot,
    exportReport,
    flush: persist,
    clear,
    destroy
  };
}

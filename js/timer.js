import { createDefaultTimerRuntime, createId } from './store.js';

function clone(value) {
  return structuredClone(value);
}

function iso(ms) {
  return new Date(ms).toISOString();
}

export class ReliableTimer {
  constructor({
    readRuntime,
    saveRuntime,
    commitCompletion,
    getSettings,
    onTick = () => {},
    onComplete = () => {},
    onTransition = () => {},
    onError = () => {},
    now = Date.now,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    idFactory = createId
  }) {
    this.readRuntime = readRuntime;
    this.saveRuntime = saveRuntime;
    this.commitCompletion = commitCompletion;
    this.getSettings = getSettings;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.onTransition = onTransition;
    this.onError = onError;
    this.now = now;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.idFactory = idFactory;
    this.interval = null;
    this.runtime = clone(readRuntime?.() || createDefaultTimerRuntime());
  }

  snapshot() {
    const runtime = clone(this.runtime);
    const durationMilliseconds = Math.max(1, Number(runtime.durationSeconds || 1) * 1000);
    let remainingMilliseconds = Number.isFinite(Number(runtime.remainingMilliseconds))
      ? Number(runtime.remainingMilliseconds)
      : Number(runtime.remainingSeconds || runtime.durationSeconds || 0) * 1000;
    if (runtime.status === 'running' && runtime.endsAt) {
      remainingMilliseconds = Math.max(0, new Date(runtime.endsAt).getTime() - this.now());
    }
    runtime.remainingMilliseconds = Math.max(0, Math.min(durationMilliseconds, remainingMilliseconds));
    runtime.remainingSeconds = Math.ceil(runtime.remainingMilliseconds / 1000);
    runtime.elapsedMilliseconds = Math.max(0, durationMilliseconds - runtime.remainingMilliseconds);
    runtime.progress = runtime.elapsedMilliseconds / durationMilliseconds;
    return runtime;
  }

  emit() {
    this.onTick(this.snapshot());
  }

  transition(reason, detail = {}) {
    try {
      this.onTransition(this.snapshot(), reason, clone(detail));
    } catch (error) {
      this.onError(error);
    }
  }

  persistRuntime(nextRuntime) {
    const result = this.saveRuntime(clone(nextRuntime));
    if (!result?.ok) {
      this.onError(result?.error || new Error('Timer persistence failed'));
      return false;
    }
    this.runtime = clone(nextRuntime);
    return true;
  }

  schedule() {
    this.clearSchedule();
    if (this.runtime.status !== 'running') return;
    const schedule = this.setIntervalFn;
    this.interval = schedule(() => this.reconcile(), 100);
  }

  clearSchedule() {
    if (this.interval !== null) {
      const cancel = this.clearIntervalFn;
      cancel(this.interval);
    }
    this.interval = null;
  }

  restore() {
    this.runtime = clone(this.readRuntime?.() || createDefaultTimerRuntime());
    const restoredSessionId = this.runtime.sessionId;
    const restoredWasRunning = this.runtime.status === 'running';
    this.reconcile();
    if (this.runtime.status === 'running') this.schedule();
    this.emit();
    // An expired persisted timer is completed during reconcile(). That completion
    // already emits the authoritative native transition; emitting a second idle
    // restore immediately afterwards would prematurely dismiss its completion
    // Live Activity.
    const completedDuringRestore = restoredWasRunning && restoredSessionId && this.runtime.sessionId !== restoredSessionId;
    if (!completedDuringRestore) this.transition('restore');
  }

  configure({ mode, phase, durationSeconds, durationSource = 'preset' }) {
    this.clearSchedule();
    const duration = Math.max(1, Math.round(Number(durationSeconds || 1)));
    const next = {
      mode: mode === 'workbreak' ? 'workbreak' : 'focus',
      phase: mode === 'workbreak' ? (phase === 'break' ? 'break' : 'work') : 'focus',
      status: 'idle',
      durationSeconds: duration,
      durationSource: durationSource === 'custom' ? 'custom' : 'preset',
      remainingSeconds: duration,
      remainingMilliseconds: duration * 1000,
      startedAt: null,
      endsAt: null,
      sessionId: null
    };
    if (this.persistRuntime(next)) {
      this.emit();
      this.transition('configure');
    }
  }

  start() {
    if (this.runtime.status === 'running') return;
    const current = this.snapshot();
    const transitionReason = current.status === 'paused' ? 'resume' : 'start';
    const remainingMilliseconds = current.remainingMilliseconds > 0
      ? current.remainingMilliseconds
      : current.durationSeconds * 1000;
    const nowMs = this.now();
    const next = {
      ...current,
      status: 'running',
      remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
      remainingMilliseconds,
      startedAt: current.startedAt || iso(nowMs),
      endsAt: iso(nowMs + remainingMilliseconds),
      sessionId: current.sessionId || this.idFactory()
    };
    if (!this.persistRuntime(next)) return;
    this.schedule();
    this.emit();
    this.transition(transitionReason);
  }

  pause() {
    if (this.runtime.status !== 'running') return;
    const current = this.snapshot();
    const next = { ...current, status: 'paused', endsAt: null };
    this.clearSchedule();
    if (this.persistRuntime(next)) {
      this.emit();
      this.transition('pause');
    }
  }

  reset() {
    this.clearSchedule();
    const next = {
      ...this.runtime,
      status: 'idle',
      remainingSeconds: this.runtime.durationSeconds,
      remainingMilliseconds: this.runtime.durationSeconds * 1000,
      startedAt: null,
      endsAt: null,
      sessionId: null
    };
    if (this.persistRuntime(next)) {
      this.emit();
      this.transition('stop');
    }
  }

  reconcile() {
    if (this.runtime.status !== 'running') {
      this.emit();
      return;
    }
    const current = this.snapshot();
    if (current.remainingSeconds > 0) {
      this.onTick(current);
      return;
    }
    this.finish();
  }

  finish() {
    if (this.runtime.status !== 'running' || !this.runtime.sessionId) return;
    this.onTick({ ...this.snapshot(), remainingSeconds: 0, remainingMilliseconds: 0, elapsedMilliseconds: this.runtime.durationSeconds * 1000, progress: 1 });
    this.clearSchedule();

    const nowMs = this.now();
    const firstEndMs = new Date(this.runtime.endsAt || iso(nowMs)).getTime();
    const completedEndMs = Number.isFinite(firstEndMs) ? firstEndMs : nowMs;
    const settings = this.getSettings();
    const sessions = [];

    const appendSession = ({ id, kind, startedAtMs, endedAtMs, durationSeconds }) => {
      sessions.push({
        id,
        kind,
        startedAt: iso(startedAtMs),
        endedAt: iso(endedAtMs),
        durationSeconds
      });
    };

    appendSession({
      id: this.runtime.sessionId,
      kind: this.runtime.mode === 'focus' ? 'focus' : this.runtime.phase,
      startedAtMs: new Date(this.runtime.startedAt || iso(completedEndMs - this.runtime.durationSeconds * 1000)).getTime(),
      endedAtMs: completedEndMs,
      durationSeconds: this.runtime.durationSeconds
    });

    let next;
    if (this.runtime.mode === 'focus' || this.runtime.durationSource === 'custom') {
      next = {
        mode: this.runtime.mode,
        phase: this.runtime.phase,
        status: 'idle',
        durationSeconds: this.runtime.durationSeconds,
        durationSource: this.runtime.durationSource === 'custom' ? 'custom' : 'preset',
        remainingSeconds: this.runtime.durationSeconds,
        remainingMilliseconds: this.runtime.durationSeconds * 1000,
        startedAt: null,
        endsAt: null,
        sessionId: null
      };
    } else {
      let phase = this.runtime.phase;
      let phaseEndMs = completedEndMs;
      let guard = 0;

      while (settings.autoContinue && guard < 1000) {
        guard += 1;
        const nextPhase = phase === 'work' ? 'break' : 'work';
        const minutes = nextPhase === 'work' ? settings.workPreset.workMinutes : settings.workPreset.breakMinutes;
        const durationSeconds = Math.max(60, Math.round(minutes * 60));
        const nextEndMs = phaseEndMs + durationSeconds * 1000;
        const sessionId = this.idFactory();

        if (nextEndMs <= nowMs) {
          appendSession({ id: sessionId, kind: nextPhase, startedAtMs: phaseEndMs, endedAtMs: nextEndMs, durationSeconds });
          phase = nextPhase;
          phaseEndMs = nextEndMs;
          continue;
        }

        next = {
          mode: 'workbreak', phase: nextPhase, status: 'running', durationSeconds, durationSource: 'preset',
          remainingSeconds: Math.max(0, Math.ceil((nextEndMs - nowMs) / 1000)),
          remainingMilliseconds: Math.max(0, nextEndMs - nowMs),
          startedAt: iso(phaseEndMs), endsAt: iso(nextEndMs), sessionId
        };
        break;
      }

      if (!settings.autoContinue) {
        const nextPhase = phase === 'work' ? 'break' : 'work';
        const minutes = nextPhase === 'work' ? settings.workPreset.workMinutes : settings.workPreset.breakMinutes;
        const durationSeconds = Math.max(60, Math.round(minutes * 60));
        next = {
          mode: 'workbreak', phase: nextPhase, status: 'idle', durationSeconds, durationSource: 'preset',
          remainingSeconds: durationSeconds, remainingMilliseconds: durationSeconds * 1000,
          startedAt: null, endsAt: null, sessionId: null
        };
      } else if (!next) {
        this.onError(new Error('Timer catch-up limit reached'));
        const nextPhase = phase === 'work' ? 'break' : 'work';
        const minutes = nextPhase === 'work' ? settings.workPreset.workMinutes : settings.workPreset.breakMinutes;
        const durationSeconds = Math.max(60, Math.round(minutes * 60));
        next = {
          mode: 'workbreak', phase: nextPhase, status: 'idle', durationSeconds, durationSource: 'preset',
          remainingSeconds: durationSeconds, remainingMilliseconds: durationSeconds * 1000,
          startedAt: null, endsAt: null, sessionId: null
        };
      }
    }

    const result = this.commitCompletion(clone(sessions), clone(next));
    if (!result?.ok) {
      this.onError(result?.error || new Error('Timer completion persistence failed'));
      this.runtime = { ...this.runtime, remainingSeconds: 0, remainingMilliseconds: 0 };
      this.emit();
      return;
    }
    this.runtime = clone(next);
    if (next.status === 'running') this.schedule();
    this.onComplete(clone(sessions), clone(next));
    this.emit();
    this.transition('complete', { sessions });
  }

  destroy() {
    this.clearSchedule();
  }
}

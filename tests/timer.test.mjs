import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultTimerRuntime } from '../js/store.js';
import { ReliableTimer } from '../js/timer.js';

function harness({ autoContinue = false, workMinutes = 1, breakMinutes = 1 } = {}) {
  let now = new Date('2026-08-05T10:00:00.000Z').getTime();
  let runtime = createDefaultTimerRuntime();
  const sessions = [];
  const ticks = [];
  let id = 0;
  const timer = new ReliableTimer({
    readRuntime: () => runtime,
    saveRuntime: next => { runtime = structuredClone(next); return { ok: true }; },
    commitCompletion: (completedSessions, next) => {
      for (const session of completedSessions) if (!sessions.some(item => item.id === session.id)) sessions.push(session);
      runtime = structuredClone(next);
      return { ok: true };
    },
    getSettings: () => ({ autoContinue, workPreset: { workMinutes, breakMinutes } }),
    now: () => now,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    idFactory: () => `session-${++id}`,
    onTick: snapshot => ticks.push(structuredClone(snapshot))
  });
  return {
    timer,
    sessions,
    ticks,
    advance(seconds) { now += seconds * 1000; },
    runtime: () => runtime
  };
}

test('pause and resume preserve remaining wall-clock time', () => {
  const h = harness();
  h.timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 30 });
  h.timer.start();
  h.advance(10);
  h.timer.pause();
  assert.equal(h.runtime().remainingSeconds, 20);
  h.advance(100);
  assert.equal(h.timer.snapshot().remainingSeconds, 20);
  h.timer.start();
  h.advance(20);
  h.timer.reconcile();
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0].durationSeconds, 30);
  assert.equal(h.runtime().status, 'idle');
});

test('background delay completes a session once using the stored end time', () => {
  const h = harness();
  h.timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 60 });
  h.timer.start();
  h.advance(90);
  h.timer.reconcile();
  h.timer.reconcile();
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0].durationSeconds, 60);
  assert.equal(h.runtime().remainingSeconds, 60);
});

test('work completion transitions to break and auto-starts when enabled', () => {
  const h = harness({ autoContinue: true, workMinutes: 1, breakMinutes: 2 });
  h.timer.configure({ mode: 'workbreak', phase: 'work', durationSeconds: 60 });
  h.timer.start();
  h.advance(60);
  h.timer.reconcile();
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0].kind, 'work');
  assert.equal(h.runtime().phase, 'break');
  assert.equal(h.runtime().durationSeconds, 120);
  assert.equal(h.runtime().status, 'running');
});

test('reset discards an incomplete session without recording it', () => {
  const h = harness();
  h.timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 60 });
  h.timer.start();
  h.advance(20);
  h.timer.reset();
  assert.equal(h.sessions.length, 0);
  assert.equal(h.runtime().remainingSeconds, 60);
  assert.equal(h.runtime().status, 'idle');
});


test('long background suspension catches up every completed work and break interval', () => {
  const h = harness({ autoContinue: true, workMinutes: 1, breakMinutes: 1 });
  h.timer.configure({ mode: 'workbreak', phase: 'work', durationSeconds: 60 });
  h.timer.start();
  h.advance(190);
  h.timer.reconcile();
  assert.deepEqual(h.sessions.map(session => session.kind), ['work', 'break', 'work']);
  assert.equal(h.runtime().phase, 'break');
  assert.equal(h.runtime().status, 'running');
  assert.equal(h.timer.snapshot().remainingSeconds, 50);
});


test('progress uses exact elapsed milliseconds and remains continuous across pause and resume', () => {
  const h = harness();
  h.timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 10 });
  h.timer.start();
  h.advance(1.25);
  let snapshot = h.timer.snapshot();
  assert.equal(snapshot.remainingMilliseconds, 8750);
  assert.equal(snapshot.progress, 0.125);

  h.timer.pause();
  h.advance(5);
  snapshot = h.timer.snapshot();
  assert.equal(snapshot.remainingMilliseconds, 8750);
  assert.equal(snapshot.progress, 0.125);

  h.timer.start();
  h.advance(0.25);
  snapshot = h.timer.snapshot();
  assert.equal(snapshot.remainingMilliseconds, 8500);
  assert.equal(snapshot.progress, 0.15);
});

test('focus timer never auto-restarts after custom completion even when auto continue is enabled', () => {
  const h = harness({ autoContinue: true });
  h.timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 1, durationSource: 'custom' });
  h.timer.start();
  h.advance(1);
  h.timer.reconcile();
  assert.equal(h.sessions.length, 1);
  assert.equal(h.runtime().status, 'idle');
  assert.equal(h.runtime().mode, 'focus');
  assert.equal(h.runtime().durationSource, 'custom');
  assert.equal(h.runtime().remainingMilliseconds, 1000);
});


test('custom work or break duration never starts a preset after completion', () => {
  for (const phase of ['work', 'break']) {
    const h = harness({ autoContinue: true, workMinutes: 50, breakMinutes: 10 });
    h.timer.configure({ mode: 'workbreak', phase, durationSeconds: 1, durationSource: 'custom' });
    h.timer.start();
    h.advance(1);
    h.timer.reconcile();
    assert.equal(h.sessions.length, 1);
    assert.equal(h.sessions[0].kind, phase);
    assert.equal(h.runtime().status, 'idle');
    assert.equal(h.runtime().mode, 'workbreak');
    assert.equal(h.runtime().phase, phase);
    assert.equal(h.runtime().durationSeconds, 1);
    assert.equal(h.runtime().durationSource, 'custom');
    assert.equal(h.runtime().remainingMilliseconds, 1000);
  }
});

test('work timer prepares but does not start the next phase when auto continue is disabled', () => {
  const h = harness({ autoContinue: false, workMinutes: 1, breakMinutes: 1 });
  h.timer.configure({ mode: 'workbreak', phase: 'work', durationSeconds: 1 });
  h.timer.start();
  h.advance(1);
  h.timer.reconcile();
  assert.equal(h.sessions.length, 1);
  assert.equal(h.runtime().phase, 'break');
  assert.equal(h.runtime().status, 'idle');
});

test('completion emits an exact full-progress snapshot before returning to idle', () => {
  const h = harness();
  h.timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 1 });
  h.timer.start();
  h.advance(1);
  h.timer.reconcile();
  assert.ok(h.ticks.some(tick => tick.remainingMilliseconds === 0 && tick.progress === 1));
});

test('timer emits native-worthy transitions only for lifecycle changes, never for ordinary ticks', () => {
  let now = new Date('2026-08-08T08:00:00Z').getTime();
  let runtime = createDefaultTimerRuntime();
  const transitions = [];
  const timer = new ReliableTimer({
    readRuntime: () => runtime,
    saveRuntime: next => { runtime = structuredClone(next); return { ok: true }; },
    commitCompletion: (_sessions, next) => { runtime = structuredClone(next); return { ok: true }; },
    getSettings: () => ({ autoContinue: false, workPreset: { workMinutes: 50, breakMinutes: 10 } }),
    now: () => now,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    idFactory: () => 'native-transition-session',
    onTransition: (_snapshot, reason) => transitions.push(reason)
  });
  timer.configure({ mode: 'focus', phase: 'focus', durationSeconds: 10 });
  timer.start();
  now += 1250;
  timer.reconcile();
  now += 1250;
  timer.reconcile();
  assert.deepEqual(transitions, ['configure', 'start']);
  timer.pause();
  timer.start();
  timer.reset();
  assert.deepEqual(transitions, ['configure', 'start', 'pause', 'resume', 'stop']);
});

test('restoring an already-expired timer emits completion without a second idle restore transition', () => {
  const base = new Date('2026-08-08T08:00:00Z').getTime();
  let now = base + 10_000;
  let runtime = {
    ...createDefaultTimerRuntime(),
    status: 'running',
    durationSeconds: 5,
    remainingSeconds: 5,
    remainingMilliseconds: 5000,
    startedAt: new Date(base).toISOString(),
    endsAt: new Date(base + 5000).toISOString(),
    sessionId: 'expired-restored-session'
  };
  const transitions = [];
  const sessions = [];
  const timer = new ReliableTimer({
    readRuntime: () => runtime,
    saveRuntime: next => { runtime = structuredClone(next); return { ok: true }; },
    commitCompletion: (completed, next) => { sessions.push(...completed); runtime = structuredClone(next); return { ok: true }; },
    getSettings: () => ({ autoContinue: false, workPreset: { workMinutes: 50, breakMinutes: 10 } }),
    now: () => now,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    onTransition: (_snapshot, reason) => transitions.push(reason)
  });
  timer.restore();
  assert.equal(sessions.length, 1);
  assert.equal(runtime.status, 'idle');
  assert.deepEqual(transitions, ['complete']);
});

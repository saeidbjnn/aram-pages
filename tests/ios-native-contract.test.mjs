import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const read = path => readFile(join(process.cwd(), path), 'utf8');

test('Live Activity uses ActivityKit system timer rendering and all Dynamic Island presentations', async () => {
  const source = await read('ios-template/AramLiveActivity/AramLiveActivity.swift');
  assert.match(source, /ActivityConfiguration\(for: AramTimerAttributes\.self\)/);
  assert.match(source, /Text\(timerInterval:/);
  assert.match(source, /ProgressView\(timerInterval:/);
  assert.match(source, /compactLeading:/);
  assert.match(source, /compactTrailing:/);
  assert.match(source, /minimal:/);
  assert.match(source, /DynamicIslandExpandedRegion/);
  assert.match(source, /context\.isStale/);
  assert.doesNotMatch(source, /Timer\.scheduledTimer|DispatchSourceTimer|sleep\(1\)|update\([^\n]*every/i);
});

test('native timer plugin schedules deterministic local notifications and cancels them on state changes', async () => {
  const source = await read('native/aram-native-timer/ios/Sources/AramNativeTimerPlugin/AramNativeTimerPlugin.swift');
  assert.match(source, /UNNotificationRequest\(identifier: identifier/);
  assert.match(source, /notificationPrefix = "aram\.timer\."/);
  assert.match(source, /removePendingNotificationRequests/);
  assert.match(source, /status == "paused"/);
  assert.match(source, /status == "idle"/);
  assert.match(source, /Activity\.request/);
  assert.match(source, /dismissalPolicy: \.after/);
  assert.match(source, /withFractionalSeconds/);
  assert.match(source, /notificationAuthorizationStatus/);
  assert.match(source, /playForegroundCompletionSound/);
  assert.doesNotMatch(source, /criticalAlert|UNNotificationInterruptionLevel\.critical/i);
});

test('native integration declares real Live Activity support rather than a fake web activity', async () => {
  const [patch, bridge, packageSwift] = await Promise.all([
    read('ios-template/App/App/Info.plist.patch'),
    read('js/native-timer-bridge.js'),
    read('native/aram-native-timer/Package.swift')
  ]);
  assert.match(patch, /NSSupportsLiveActivities/);
  assert.match(bridge, /AramNativeTimer/);
  assert.match(packageSwift, /AramTimerActivityModel/);
  assert.match(packageSwift, /capacitor-swift-pm/);
  assert.match(packageSwift, /\.iOS\(\.v15\)/);
});

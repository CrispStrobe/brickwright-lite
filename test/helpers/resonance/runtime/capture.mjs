// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Passive, synchronous observation after each unchanged native 5 ms bridge
// step. No additional steps, hub publications, commands, or pose writes.
import assert from 'node:assert/strict';

const EPS = 1e-6;

export function installCapture(rig, observer, {poseIntervalMs = 1000 / 30} = {}) {
  const session = rig.session, bridge = session?.bridge, core = session?.core;
  assert.ok(bridge && core && typeof bridge.step === 'function',
    'This capture requires the actual main-thread native hub bridge.');
  assert.ok(typeof observer?.read === 'function');
  assert.equal(bridge.stepMs, 5, 'The source-owned native physics cadence must remain 5 ms.');
  assert.ok(Number.isFinite(poseIntervalMs) && poseIntervalMs >= bridge.stepMs);
  const originalStep = bridge.step, originalTick = session.tick;
  const stepDescriptor = Object.getOwnPropertyDescriptor(bridge, 'step');
  const tickDescriptor = Object.getOwnPropertyDescriptor(session, 'tick');
  assert.equal(typeof originalTick, 'function');
  const samples = [], bodyMotionFrames = [], clockObservations = [];
  let disposed = false, stepCalls = 0, tickCalls = 0;
  let nextPoseMs = core.time * 1000;
  const clock = () => ({sessionTimeMs: session.time,
    physicsTimeMs: core.time * 1000, nativeTimeMs: bridge.timeMs});
  const recordClock = () => {
    const current = clock(), previous = clockObservations.at(-1);
    if (previous && Math.abs(current.sessionTimeMs - previous.sessionTimeMs) <= EPS) {
      assert.ok(Math.abs(current.physicsTimeMs - previous.physicsTimeMs) <= EPS,
        'One session boundary must identify one actual physics state.');
      return previous;
    }
    if (previous) {
      assert.ok(current.sessionTimeMs > previous.sessionTimeMs);
      assert.ok(current.physicsTimeMs >= previous.physicsTimeMs);
    }
    clockObservations.push(current); return current;
  };
  const recordPoses = (sample, reason, force) => {
    if (!force && sample.physicsTimeMs + EPS < nextPoseMs) return;
    const previous = bodyMotionFrames.at(-1);
    if (previous && Math.abs(previous.physicsTimeMs - sample.physicsTimeMs) <= EPS) {
      if (!previous.reasons.includes(reason)) previous.reasons.push(reason);
      return;
    }
    const poses = Object.fromEntries(session.mechanism.bodies.map(body => {
      const pose = core.bodyPose(body.id);
      return [body.id, {position: [...pose.position], rotation: [...pose.rotation]}];
    }));
    bodyMotionFrames.push({timeMs: sample.timeMs, sessionTimeMs: sample.sessionTimeMs,
      physicsTimeMs: sample.physicsTimeMs, reasons: [reason], poses});
    while (nextPoseMs <= sample.physicsTimeMs + EPS) nextPoseMs += poseIntervalMs;
  };
  const capture = (reason, forcePose = false) => {
    assert.ok(!disposed, 'Capture has been disposed.');
    const previous = samples.at(-1), physicsTimeMs = core.time * 1000;
    if (previous && Math.abs(previous.physicsTimeMs - physicsTimeMs) <= EPS) {
      recordPoses(previous, reason, forcePose); return previous;
    }
    const sample = observer.read();
    assert.ok(Math.abs(sample.physicsTimeMs - physicsTimeMs) <= EPS);
    assert.ok(Math.abs(sample.timeMs - bridge.timeMs) <= EPS,
      'Observation timeMs is the native bridge clock, not an invented frame interpolation.');
    assert.ok(Math.abs(sample.sessionTimeMs - session.time) <= EPS,
      'The independent VM session clock must also be retained.');
    if (previous) {
      assert.ok(Math.abs(sample.physicsTimeMs - previous.physicsTimeMs - bridge.stepMs) <= EPS,
        'Every actual native step must be observed exactly once.');
      assert.ok(Math.abs(sample.timeMs - previous.timeMs - bridge.stepMs) <= EPS);
    }
    samples.push(sample); recordPoses(sample, reason, forcePose); return sample;
  };
  function observedStep(...args) {
    const result = Reflect.apply(originalStep, this, args);
    // SimHubBridge.step has already advanced Jolt and written the current
    // encoder readings. It still owns publication and all integration.
    stepCalls++; capture('native-step'); return result;
  }
  function observedTick(...args) {
    const result = Reflect.apply(originalTick, this, args);
    assert.ok(!result || typeof result.then !== 'function',
      'This read-only capture is for the original synchronous main-thread tick.');
    tickCalls++; recordClock(); return result;
  }
  bridge.step = observedStep; session.tick = observedTick;
  recordClock(); capture('initial', true);
  const dispose = () => {
    if (disposed) return;
    assert.equal(bridge.step, observedStep, 'No other code may replace the observed bridge step.');
    assert.equal(session.tick, observedTick, 'No other code may replace the observed session tick.');
    if (stepDescriptor) Object.defineProperty(bridge, 'step', stepDescriptor); else delete bridge.step;
    if (tickDescriptor) Object.defineProperty(session, 'tick', tickDescriptor); else delete session.tick;
    disposed = true;
  };
  return {samples, bodyMotionFrames, clockObservations, dispose,
    captureNow(reason = 'explicit-observation') {recordClock(); return capture(reason, true);},
    summary() {
      return {method: 'Read-only wrappers after unchanged SimHubBridge.step and SimSession.tick; no extra integration or commands.',
        nativeStepMs: bridge.stepMs, poseIntervalMs, stepCalls, tickCalls,
        sampleCount: samples.length, bodyMotionFrameCount: bodyMotionFrames.length,
        clockObservationCount: clockObservations.length,
        firstPhysicsTimeMs: samples[0]?.physicsTimeMs,
        lastPhysicsTimeMs: samples.at(-1)?.physicsTimeMs,
        sampleTimeMeaning: 'timeMs is the actual native bridge clock; physicsTimeMs is core.time; sessionTimeMs is the separately preserved VM frame clock.',
        commandClockMapping: 'Exact post-tick session/physics pairs in clockObservations; never inferred from output motion.',
        everyNativeStepObserved: samples.length === stepCalls + 1,
        posesInterpolated: false, integrationCallsAdded: 0, commandsAdded: 0};
    }};
}

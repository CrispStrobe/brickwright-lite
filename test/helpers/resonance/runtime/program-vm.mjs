// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Headless validation through the real app compiler, Scratch VM and Robot Lab
// extension. Upstream code is imported from a prepared source checkout, not
// distributed or replaced by this add-on.

import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {checkedIntegratedRoot} from '../provenance.mjs';

const SOURCE = fileURLToPath(new URL('../../../../', import.meta.url));
const importSource = relative => import(pathToFileURL(path.join(SOURCE, relative)).href);
let dependenciesPromise;
const dependencies = () => dependenciesPromise ||= (async () => {
  // Check before importing bw-integrated through spike-arena-vm: that helper
  // selects VM and Timer from the environment's dependency root at import time.
  const DEPENDENCIES = checkedIntegratedRoot();
  // This existing helper loads the real VM before installing browser-shaped
  // globals, then exposes its deterministic clock. Preserve that load order.
  const {VM, FakeClock, settle} = await importSource('test/helpers/spike-arena-vm.mjs');
  const {loadExtensionClass} = await importSource('test/helpers/bw-extensions.mjs');
  const {default: Creator} = await importSource('overlay/scratch-gui/src/lib/sb3-creator-register-art.js');
  const require = createRequire(path.join(DEPENDENCIES, 'package.json'));
  const Timer = require(path.join(DEPENDENCIES, 'node_modules/scratch-vm/src/util/timer.js'));
  const vmVersion = JSON.parse(readFileSync(path.join(DEPENDENCIES, 'node_modules/scratch-vm/package.json'), 'utf8')).version;
  return {VM, FakeClock, settle, Creator, Timer, Extension: loadExtensionClass('robotlab'), vmVersion};
})();

/**
 * Run generated .bw through generateSB3 -> loadProject -> greenFlag -> real
 * Robot Lab extension -> rig.api -> native Jolt -> native pen layer.
 *
 * The caller owns the fresh rig and disposes it. The harness never sends a motor
 * command outside the loaded blocks. It observes API requests/results and wraps
 * the native stop-all primitive only to count position-guard activations.
 *
 * Time uses the repository's FakeClock. A real VM frame and rig.tick(frameMs)
 * advance together; the sequencer gets the repository's bounded check-count
 * timer so a frozen wall clock cannot prevent it from yielding.
 */
export async function runNativeProgram({rig, source, maxSimulatedMs = 600000, frameMs = 1000 / 30,
  onFrame = () => {}, allowFailure = false, expectedRuntimeMotorCommands = undefined} = {}) {
  if (!rig?.api || typeof rig.tick !== 'function' || !rig.session) throw new TypeError('Supply a fresh native plotter rig.');
  if (typeof source !== 'string' || !source.trim()) throw new TypeError('Supply the generated .bw program text.');
  if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 100) throw new RangeError('Use a finite VM frame duration from 0 to 100 ms.');
  if (!Number.isFinite(maxSimulatedMs) || maxSimulatedMs <= 0) throw new RangeError('Use a positive simulated-time limit.');
  const {VM, FakeClock, settle, Creator, Timer, Extension, vmVersion} = await dependencies();
  const creator = new Creator();
  creator.parse(source);
  if (creator.project.extensions.some(name => name !== 'robotlab')) throw new Error('This verifier expects a native Robot Lab program.');
  const sourceBlocks = creator.project.targets.flatMap(target => Object.values(target.blocks));
  const staticMotorCommandBlocks = sourceBlocks.filter(block => block.opcode === 'robotlab_runMotorDegrees').length;
  if (!staticMotorCommandBlocks) throw new Error('The generated program contains no motor move.');
  // A shared receiver or finite repeat can execute the same native block more
  // than once. Keep the compiled shape separate from the caller's independently
  // declared finite execution plan; never infer successful scheduling from the
  // number of static blocks. The caller also checks the actual target trace.
  if (expectedRuntimeMotorCommands !== undefined &&
      (!Number.isInteger(expectedRuntimeMotorCommands) || expectedRuntimeMotorCommands < 1)) {
    throw new RangeError('Declare a positive integer number of runtime motor calls.');
  }
  const expectedCommands = expectedRuntimeMotorCommands ?? staticMotorCommandBlocks;
  const archive = await creator.generateSB3();
  const bytes = Buffer.from(await archive.arrayBuffer());
  const clock = new FakeClock(1.7e12);
  const commands = [], failures = [], blockErrors = [], holdCalls = [], broadcastJoins = [];
  const active = new Set();
  let maximumConcurrentMotors = 0, guardStops = 0, guardEvaluations = 0, frames = 0, vm;
  const started = rig.session.time;
  const api = Object.create(rig.api);
  api.runMotorDegrees = async (port, delta, speed) => {
    const item = {index: commands.length, port, deltaDegrees: delta, speedDps: speed,
      targetDegrees: rig.api.motorAngle(port) + delta, startedMs: rig.session.time - started,
      startEncoderDegrees: rig.api.encoder(port).angleDeg};
    commands.push(item); active.add(item); maximumConcurrentMotors = Math.max(maximumConcurrentMotors, active.size);
    try {
      item.result = await rig.api.runMotorDegrees(port, delta, speed);
      item.finishedMs = rig.session.time - started;
      const encoder = rig.api.encoder(port);
      item.finalEncoderDegrees = encoder.angleDeg;
      item.endpointErrorDegrees = encoder.ok ? Math.abs(encoder.angleDeg - item.targetDegrees) : null;
      if (item.result !== 'completed') failures.push({port, index: item.index, result: item.result});
      return item.result;
    } catch (error) {
      item.result = 'threw'; item.message = String(error); failures.push({port, index: item.index, result: 'threw', message: String(error)});
      throw error;
    } finally {
      active.delete(item);
    }
  };
  api.stopMotor = (port, action) => {
    holdCalls.push({port, action, timeMs: rig.session.time - started});
    const result = rig.api.stopMotor(port, action);
    if (result?.ok === false) failures.push({port, result: result.code || 'hold-refused'});
    return result;
  };
  clock.install();
  try {
    vm = new VM();
    vm.runtime.robotLab = api;
    let loaded = false;
    const manager = vm.extensionManager;
    manager.loadExtensionURL = id => {
      if (String(id) !== 'robotlab') throw new Error(`Unexpected extension ${id}.`);
      const service = manager._registerInternalExtension(new Extension(vm.runtime));
      manager._loadedExtensions.set('robotlab', service);
      loaded = true;
      return Promise.resolve();
    };
    await vm.loadProject(bytes);
    if (!loaded) throw new Error('The actual Robot Lab extension was not loaded.');
    vm.runtime.robotLab = api;
    if (creator.project.stc) vm.runtime.stc = creator.project.stc;
    vm.setCompatibilityMode(true);
    vm.runtime.currentStepTime = frameMs;
    let budget = 0;
    vm.runtime.sequencer.timer = new Timer({now: () => budget++});
    const recordBlockError = message => blockErrors.push(String(message));
    vm.runtime.on('BLOCKS_ERROR', recordBlockError);
    vm.on('BLOCKS_ERROR', recordBlockError);
    const nativeStop = vm.runtime._primitives.control_stop;
    vm.runtime._primitives.control_stop = function (args, util) {
      if (args.STOP_OPTION === 'all') guardStops++;
      return nativeStop.call(this, args, util);
    };
    const nativeIf = vm.runtime._primitives.control_if;
    vm.runtime._primitives.control_if = function (args, util) {
      guardEvaluations++;
      return nativeIf.call(this, args, util);
    };
    // Observe the real Scratch broadcast-and-wait primitive. Its own stack
    // frame stores the receiver threads. We neither start nor finish threads;
    // the wrapper only records when the native scheduler starts and joins them.
    const joinsByFrame = new WeakMap();
    const nativeBroadcastAndWait = vm.runtime._primitives.event_broadcastandwait;
    vm.runtime._primitives.event_broadcastandwait = function (args, util) {
      const frame = util.stackFrame;
      let item = joinsByFrame.get(frame);
      if (!item || !frame.startedThreads) {
        item = {index: broadcastJoins.length, message: args.BROADCAST_OPTION?.name,
          startedMs: rig.session.time - started};
        joinsByFrame.set(frame, item); broadcastJoins.push(item);
      }
      const result = nativeBroadcastAndWait.call(this, args, util);
      const receivers = frame.startedThreads || [];
      item.receiverThreads = receivers.length;
      item.receiverTopBlocks = receivers.map(thread => thread.topBlock);
      if (!receivers.some(thread => vm.runtime.threads.includes(thread))) {
        item.joinedMs ??= rig.session.time - started;
      }
      return result;
    };
    vm.greenFlag();
    const greenFlagThreads = vm.runtime.threads.length;
    if (!greenFlagThreads) throw new Error('Green flag started no native VM thread.');
    const maxFrames = Math.ceil(maxSimulatedMs / frameMs);
    for (; frames < maxFrames; frames++) {
      await clock.advance(frameMs);
      vm.runtime._step();
      await settle();
      await rig.tick(frameMs);
      await settle();
      await onFrame({rig, vm, frames: frames + 1, commands, activeCommands: active.size});
      if (rig.session.failed) throw rig.session.failed;
      if (!vm.runtime.threads.length && !active.size) {frames++; break;}
    }
    const timedOut = Boolean(vm.runtime.threads.length || active.size);
    const completed = !timedOut && !guardStops && !failures.length && !blockErrors.length && commands.length === expectedCommands;
    const report = {
      completed,
      pipeline: '.bw -> pinned compiler -> .sb3 -> real Scratch VM greenFlag scheduler -> actual robotlab extension -> Robot Lab API -> native Jolt physics -> native pen layer',
      scratchVmVersion: vmVersion,
      clock: {frameMs, deterministic: true, sequencerBudget: 'bounded check-count timer'},
      frames, simulatedMs: rig.session.time - started, timedOut, greenFlagThreads,
      compiled: {blocks: sourceBlocks.length, sb3Bytes: bytes.length, staticMotorCommandBlocks,
        expectedMotorCommands: expectedCommands,
        runtimeCountSource: expectedRuntimeMotorCommands === undefined ? 'legacy-static-block-count' : 'declared-finite-program-plan'},
      executedMotorCommands: commands.length, maximumConcurrentMotors, guardStops, guardEvaluations,
      maximumEndpointErrorDegrees: commands.reduce((maximum, item) => Math.max(maximum, item.endpointErrorDegrees ?? 0), 0),
      failures, blockErrors, commands, holdCalls, broadcastJoins,
      final: typeof rig.snapshot === 'function' ? rig.snapshot() : null,
      drawingCm: rig.api.drawing()
    };
    if (!completed && !allowFailure) {
      const error = new Error(`Native program failed: ${JSON.stringify({timedOut, guardStops, failures, blockErrors, commands: commands.length, expectedCommands})}`);
      error.report = report;
      throw error;
    }
    return report;
  } finally {
    try { if (vm) {vm.stopAll(); vm.quit();} } finally {clock.uninstall();}
  }
}

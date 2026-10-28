// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Current application qualification, separate from the original exact-file release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRig} from './runtime/rig.mjs';
import {runNativeProgram} from './runtime/program-vm.mjs';
import {makeObserver} from './runtime/observe.mjs';
import {installCapture} from './runtime/capture.mjs';
import {checkTopology} from './runtime/structure.mjs';
import {checkProgram} from './runtime/check-program.mjs';
import {inertiaAboutAxis} from './inertia.mjs';
import {CONTROL, EXPERIMENTS, programPlan} from './analysis/control.mjs';
import {LIMITS, COLD_START, commonAcceptance} from './analysis/acceptance.mjs';
import {RESPONSE_LIMITS, evaluateExperiment, responseAcceptance, compareExperiments,
  compareModes, frozenOutputNegativeControl} from './analysis/response.mjs';
import {read, MODEL_BASE, digest, checkOriginalInputs, sourceEvidence, inputEvidence, evidenceWriter} from './source.mjs';

const geometry = JSON.parse(fs.readFileSync(new URL('./data/geometry.json', import.meta.url), 'utf8'));
const independentInertia = JSON.parse(fs.readFileSync(new URL('./data/passive-inertia.json', import.meta.url), 'utf8'));
const modelText = () => read(MODEL_BASE + 'models/resonance-lab.ldr');
const failed = checks => Object.entries(checks || {}).filter(([, ok]) => ok !== true).map(([name]) => name);

export function commonMetrics(samples) {
  const max = k => Math.max(...samples.map(s => Math.abs(s[k]))), bands = samples.flatMap(s => s.bandReadings);
  return {
    sampleCount: samples.length, physicsDurationMs: samples.at(-1).physicsTimeMs - samples[0].physicsTimeMs,
    maximumSampleGapMs: Math.max(...samples.slice(1).map((s, i) => s.physicsTimeMs - samples[i].physicsTimeMs)),
    maximumInputDegrees: max('inputDegrees'), maximumOutputDegrees: max('outputDegrees'),
    maximumInputToEncoderErrorDegrees: max('inputToEncoderErrorDegrees'), maximumJointClosureErrorMm: max('maximumJointClosureErrorMm'),
    maximumAxisDeviationDegrees: max('maximumAxisDeviationDegrees'), maximumOutOfPlaneErrorMm: max('maximumOutOfPlaneErrorMm'),
    maximumBaseTiltDegrees: max('baseTiltDegrees'), maximumBaseTranslationMm: max('baseTranslationMm'),
    minimumBandExtensionMm: Math.min(...bands.map(b => b.extensionMm)),
    minimumEditorBandStretchRatio: Math.min(...bands.map(b => b.editorPathStretchRatio)),
    maximumEditorBandStretchRatio: Math.max(...bands.map(b => b.editorPathStretchRatio)),
    finalInputDegrees: samples.at(-1).inputDegrees, finalOutputDegrees: samples.at(-1).outputDegrees,
    finalOutputSpeedDps: samples.at(-1).outputSpeedDps
  };
}

function schedule(native, experiment) {
  const plan = programPlan(experiment), calls = native.commands, joins = native.broadcastJoins;
  const targetTraceMatches = calls.length === plan.length && calls.every((c, i) => c.port === 'A' &&
    Math.abs(c.targetDegrees - plan[i].targetDegrees) < 1e-8 && c.speedDps === plan[i].speedDps && c.result === 'completed');
  const joined = joins.length === plan.length && joins.every((j, i) => j.message === 'rock input' &&
    j.receiverThreads === 1 && Number.isFinite(j.joinedMs) && j.joinedMs >= calls[i].finishedMs &&
    (!i || j.startedMs >= joins[i - 1].joinedMs));
  const oneReceiver = joins.length === plan.length && new Set(joins.flatMap(j => j.receiverTopBlocks)).size === 1;
  return {expectedTargets: plan, actualMoveCount: calls.length, actualGuardCount: native.guardEvaluations, actualJoinCount: joins.length,
    acceptance: {exactFiniteTargetTrace: targetTraceMatches, allReceiversJoined: joined, oneSharedReceiverReused: oneReceiver,
      allEndpointGuardsExecuted: native.guardEvaluations === 2 + 2 * plan.length,
      onlyOneMotorCommandAtATime: native.maximumConcurrentMotors === 1,
      actualEndpointPrecision: native.maximumEndpointErrorDegrees <= CONTROL.endpointGuardDegrees}};
}

function collect(report, capture, observer) {
  report.samples = capture.samples; report.bodyMotionFrames = capture.bodyMotionFrames;
  report.capture = capture.summary(); report.clockObservations = capture.clockObservations;
  report.observedBodies = observer.ids; report.observedPoints = observer.points; report.observedBands = observer.bands;
  if (report.native) report.native.clockObservations = capture.clockObservations;
}

async function coldStart(mode) {
  const report = {passed: false, preparationMode: mode, configuration: COLD_START, limits: LIMITS};
  let rig, capture, observer;
  try {
    rig = await createRig(modelText(), mode === 'strict' ? {autoPorts: false} : {});
    const calls = []; report.observedExternalMotorCalls = calls;
    const methods = new Set(['setMotor', 'setMotorPower', 'setMotorSpeed', 'runMotorDegrees', 'stopMotor']);
    rig.api = new Proxy(rig.api, {get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (!methods.has(key) || typeof value !== 'function') return value;
      return (...args) => {calls.push({method: key, args, timeMs: rig.session.time}); return value.apply(target, args);};
    }});
    report.topology = checkTopology({model: rig.session.model, mechanism: rig.session.mechanism, issues: rig.issues}, geometry, rig.session.catalog);
    observer = makeObserver(rig, {motorToInputSign: CONTROL.motorToInputSign}); capture = installCapture(rig, observer);
    while (rig.session.core.time * 1000 < COLD_START.durationMs - 1e-6) await rig.tick(COLD_START.sampleIntervalMs);
    capture.captureNow('cold-observation-end'); collect(report, capture, observer);
    report.motorCommandsIssued = calls.length;
    report.holdCommandsIssued = calls.filter(c => c.method === 'stopMotor' && c.args[1] === 'hold').length;
    report.metrics = commonMetrics(report.samples); const m = report.metrics;
    report.acceptance = {
      oneNativePhysicsSecondObserved: m.physicsDurationMs >= COLD_START.durationMs - 1e-6 && m.sampleCount >= 201,
      noMotorOrHoldCommands: calls.length === 0,
      allPartsFreestanding: report.topology.dynamicBodies === 3 && report.topology.staticBodies.length === 1 && report.topology.staticBodies[0] === 'ground',
      denseActualSampling: m.maximumSampleGapMs <= LIMITS.maximumSampleGapMs,
      everyNativeStepObserved: report.capture.everyNativeStepObserved === true,
      inputRemainsNearReset: m.maximumInputDegrees <= LIMITS.maximumColdInputDegrees,
      passiveOutputRemainsNearReset: m.maximumOutputDegrees <= LIMITS.maximumColdOutputDegrees,
      actualInputMatchesEncoder: m.maximumInputToEncoderErrorDegrees <= LIMITS.maximumInputToEncoderErrorDegrees,
      physicalBearingsStayClosed: m.maximumJointClosureErrorMm <= LIMITS.maximumJointClosureErrorMm,
      axesStayAligned: m.maximumAxisDeviationDegrees <= LIMITS.maximumAxisDeviationDegrees,
      axialLayersStaySeparated: m.maximumOutOfPlaneErrorMm <= LIMITS.maximumOutOfPlaneErrorMm,
      bandPathsValid: report.samples.every(s => s.bandReadings.length === 2 && s.bandReadings.every(b => b.editorPathError === null)),
      bandsRemainTaut: m.minimumBandExtensionMm >= LIMITS.minimumBandExtensionMm,
      bandStretchInsideRange: m.minimumEditorBandStretchRatio >= LIMITS.minimumEditorBandStretchRatio && m.maximumEditorBandStretchRatio <= LIMITS.maximumEditorBandStretchRatio,
      frameRemainsUpright: m.maximumBaseTiltDegrees <= LIMITS.maximumBaseTiltDegrees,
      frameRemainsInPlace: m.maximumBaseTranslationMm <= LIMITS.maximumBaseTranslationMm};
    report.passed = failed(report.acceptance).length === 0;
  } catch (error) {report.error = String(error.stack || error);}
  finally {if (capture) collect(report, capture, observer); capture?.dispose(); rig?.dispose();}
  return report;
}

async function experimentRun(experiment, mode) {
  const report = {passed: false, experiment, preparationMode: mode, limits: LIMITS, responseLimits: RESPONSE_LIMITS};
  let rig, capture, observer;
  try {
    const source = read(MODEL_BASE + 'programs/' + EXPERIMENTS[experiment].file);
    report.compiler = await checkProgram(source, experiment);
    rig = await createRig(modelText(), mode === 'strict' ? {autoPorts: false} : {});
    report.topology = checkTopology({model: rig.session.model, mechanism: rig.session.mechanism, issues: rig.issues}, geometry, rig.session.catalog);
    observer = makeObserver(rig, {motorToInputSign: CONTROL.motorToInputSign});
    report.nativeBodies = rig.session.mechanism.bodies; report.nativeJoints = rig.session.mechanism.joints;
    const output = rig.session.mechanism.bodies.find(b => b.id === observer.ids.output), hinge = report.topology.joints.output;
    report.outputInertia = inertiaAboutAxis(output, hinge.point, hinge.axis);
    assert.ok(Math.abs(report.outputInertia.inertiaKgM2 - independentInertia.outputInertiaKgM2) < 1e-12,
      'Current native part-derived inertia must still equal the original independent calculation; report a changed source model instead of fitting output.');
    report.independentPassiveInertia = {outputInertiaKgM2: independentInertia.outputInertiaKgM2,
      currentPartInertiaExactlyPreserved: true};
    capture = installCapture(rig, observer, {poseIntervalMs: 1000 / 30});
    report.native = await runNativeProgram({rig, source, maxSimulatedMs: CONTROL.watchdogMs,
      expectedRuntimeMotorCommands: programPlan(experiment).length, allowFailure: true});
    capture.captureNow('final-input-held-ringdown-pose'); collect(report, capture, observer);
    report.schedule = schedule(report.native, experiment); report.metrics = commonMetrics(report.samples);
    const parameters = {outputInertiaKgM2: independentInertia.outputInertiaKgM2};
    report.response = evaluateExperiment({samples: report.samples, native: report.native, experiment, parameters});
    report.negativeControl = frozenOutputNegativeControl({samples: report.samples, native: report.native, experiment, parameters});
    report.acceptance = {...commonAcceptance({samples: report.samples, native: report.native, topology: report.topology}),
      ...report.schedule.acceptance, ...responseAcceptance(report.response, experiment),
      frozenPassiveOutputRejected: report.negativeControl.rejected,
      everyNativeStepObserved: report.capture.everyNativeStepObserved === true,
      exactCapturedNativeClockMapping: report.response.clockMapping.capturedNativeBoundaries === true};
    report.passed = failed(report.acceptance).length === 0;
  } catch (error) {report.error = String(error.stack || error); if (error.report) report.native = error.report;}
  finally {if (capture) collect(report, capture, observer); capture?.dispose(); rig?.dispose();}
  return report;
}

/** All runs are sequential: the genuine VM test clock is process-global. */
export async function qualifyResonance({evidenceDirectory, diagnostic = () => {}} = {}) {
  const writer = evidenceWriter(evidenceDirectory);
  const report = {passed: false, performedAtUtc: new Date().toISOString(),
    scope: 'Current-app integration of the original exact model/programs on the Plain mat, using the actual compiler, VM, extension, hub controller and native 5 ms physics. Browser and hardware claims are separate.',
    changesToPhysicalInputs: [], originalInputs: checkOriginalInputs(),
    source: sourceEvidence(), inputs: inputEvidence(), coldStart: {}, experiments: {default: {}, strict: {}}, receipts: {},
    limits: LIMITS, responseLimits: RESPONSE_LIMITS};
  const freeze = {purpose: 'Integration source, exact model/programs, original fixed gates and current native identities captured before any physics.',
    frozenAtUtc: report.performedAtUtc, source: report.source, inputs: report.inputs,
    limits: LIMITS, responseLimits: RESPONSE_LIMITS, originalInputs: report.originalInputs};
  report.predeclaredInputs = writer.write('predeclared-inputs.json', freeze);
  report.frozenInputArchive = writer.archiveInputs(report.inputs, report.source);
  // Keep a digest even when a normal unit run emits only TAP diagnostics.
  report.predeclaredSha256 = digest(JSON.stringify(freeze));
  const record = (name, item) => {
    const receipt = writer.write(name + '.json', item); if (receipt) report.receipts[name] = receipt;
    diagnostic({case: name, passed: item.passed, sampleCount: item.samples?.length, failed: failed(item.acceptance),
      error: item.error, gain: item.response?.transientWindow.gain, frequencyHz: item.response?.transientWindow.actualFrequencyHz,
      ringdownFrequencyHz: item.response?.ringdown.frequencyHz});
  };
  try {
    for (const mode of ['default', 'strict']) {
      const cold = await coldStart(mode); report.coldStart[mode] = cold; record('cold-' + mode, cold);
      assert.equal(cold.passed, true, `${mode} cold start: ${cold.error || failed(cold.acceptance).join(', ')}`);
    }
    for (const mode of ['default', 'strict']) for (const experiment of Object.keys(EXPERIMENTS)) {
      const item = await experimentRun(experiment, mode);
      report.experiments[mode][experiment] = item; record(experiment + '-' + mode, item);
      assert.equal(item.passed, true, `${experiment}/${mode}: ${item.error || failed(item.acceptance).join(', ')}`);
    }
    report.comparisons = Object.fromEntries(['default', 'strict'].map(mode => [mode, compareExperiments(report.experiments[mode])]));
    report.crossMode = Object.fromEntries(Object.keys(EXPERIMENTS).map(experiment => [experiment,
      compareModes(report.experiments.default[experiment].response, report.experiments.strict[experiment].response)]));
    report.passed = [...Object.values(report.comparisons), ...Object.values(report.crossMode)].every(item => failed(item.acceptance).length === 0);
  } catch (error) {report.error = String(error.stack || error);}
  finally {
    report.sourceAfter = sourceEvidence(); report.inputsAfter = inputEvidence();
    report.inputsAndSourceUnchanged = JSON.stringify(report.source) === JSON.stringify(report.sourceAfter) &&
      JSON.stringify(report.inputs) === JSON.stringify(report.inputsAfter);
    report.passed = report.passed && report.inputsAndSourceUnchanged;
  }
  // Full individual reports keep every raw native observation and failure.
  // The index stays compact and binds each separately written report by hash.
  const summary = {...report,
    coldStart: Object.fromEntries(Object.entries(report.coldStart).map(([mode, item]) => [mode,
      {passed: item.passed, acceptance: item.acceptance, metrics: item.metrics, error: item.error}])),
    experiments: Object.fromEntries(Object.entries(report.experiments).map(([mode, runs]) => [mode,
      Object.fromEntries(Object.entries(runs).map(([name, item]) => [name, {passed: item.passed,
        acceptance: item.acceptance, metrics: item.metrics, error: item.error,
        compiler: item.compiler, schedule: item.schedule, negativeControl: item.negativeControl,
        transientWindow: item.response?.transientWindow, ringdown: item.response?.ringdown}]))]))};
  writer.write('qualification.json', summary);
  return summary;
}

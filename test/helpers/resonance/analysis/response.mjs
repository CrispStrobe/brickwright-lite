// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Passive analysis of recorded body observations. No simulator imports or pose writes.
import {DEG, DYNAMICS, smallAngleProperties, integrateResponse} from './dynamics.mjs';

export const RESPONSE_LIMITS = Object.freeze({
  status: 'Prospective limits declared before any useful-motion native proof; freeze with the exact real-part inertia.',
  cycles: 4,
  analysisCycles: Object.freeze([2, 3]),
  minimumSamplesPerCycle: 5,
  minimumTransientWindowSamples: 12,
  minimumInputFundamentalAmplitudeDegrees: 1,
  minimumInputSpanDegrees: 3,
  maximumInputSpanDegrees: 5,
  minimumOutputFundamentalAmplitudeDegrees: .05,
  maximumCyclePeriodCoefficientOfVariation: .2,
  near: Object.freeze({minimumGain: 3, maximumGain: 20,
    minimumFrequencyRatio: .8, maximumFrequencyRatio: 1.25,
    minimumRingdownPeakDegrees: 2, minimumRingdownCrossings: 12,
    maximumRingdownFrequencyFractionalError: .1}),
  slow: Object.freeze({minimumGain: .8, maximumGain: 1.8,
    minimumFrequencyRatio: .25, maximumFrequencyRatio: .7}),
  fast: Object.freeze({minimumGain: .05, maximumGain: .8,
    minimumFrequencyRatio: 1.6, maximumFrequencyRatio: 5}),
  minimumNearToSlowGainRatio: 2,
  minimumNearToFastGainRatio: 4,
  minimumRingdownSeconds: 9.5,
  ringdownFrequencyStartAfterHoldSeconds: 1,
  ringdownFrequencyEndAfterHoldSeconds: 9.5,
  maximumHeldInputAbsoluteDegrees: .5,
  maximumCrossModeGainDifferenceFraction: .1,
  maximumCrossModeFrequencyDifferenceFraction: .03,
  maximumCrossModePhaseDifferenceDegrees: 10
});

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const rms = values => Math.sqrt(mean(values.map(value => value * value)));
const span = values => Math.max(...values) - Math.min(...values);
const maximumAbsolute = values => Math.max(...values.map(Math.abs));
const wrapDegrees = angle => ((angle + 180) % 360 + 360) % 360 - 180;
const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return value;
};

function solve3(matrix, rhs) {
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    if (!(Math.abs(divisor) > 1e-12)) throw new Error('Fundamental fit is singular; there is insufficient actual time coverage.');
    a[column] = a[column].map(value => value / divisor);
    for (let row = 0; row < 3; row++) if (row !== column) {
      const factor = a[row][column];
      a[row] = a[row].map((value, index) => value - factor * a[column][index]);
    }
  }
  return a.map(row => row[3]);
}

/** Equal weight per raw observation; no smoothing, output-conditioned selection,
 * fitted frequency, detrending, or synthesized replacement observations.
 */
export function fitFundamental(rows, valueKey, frequencyHz, originSeconds = rows[0]?.physicsSeconds) {
  if (rows.length < 5) throw new Error('At least five actual observations are needed for a fundamental fit.');
  if (!(frequencyHz > 0)) throw new RangeError('The measured command-cycle frequency must be positive.');
  const x = rows.map(row => [1, Math.cos(2 * Math.PI * frequencyHz * (row.physicsSeconds - originSeconds)),
    Math.sin(2 * Math.PI * frequencyHz * (row.physicsSeconds - originSeconds))]);
  const values = rows.map(row => finite(row[valueKey], valueKey));
  const matrix = [0, 1, 2].map(i => [0, 1, 2].map(j => x.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const rhs = [0, 1, 2].map(i => x.reduce((sum, row, index) => sum + row[i] * values[index], 0));
  const [offset, cosine, sine] = solve3(matrix, rhs);
  const residuals = x.map((row, index) => values[index] - offset - cosine * row[1] - sine * row[2]);
  return {sampleCount: rows.length, frequencyHz, originSeconds, offsetDegrees: offset,
    cosineCoefficientDegrees: cosine, sineCoefficientDegrees: sine,
    amplitudeDegrees: Math.hypot(cosine, sine), phaseDegrees: Math.atan2(-sine, cosine) / DEG,
    residualRmsDegrees: rms(residuals), observedSpanDegrees: span(values)};
}

function locate(rows, value, key) {
  if (value <= rows[0][key]) return 0;
  if (value >= rows.at(-1)[key]) return rows.length - 2;
  let low = 0, high = rows.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle][key] <= value) low = middle; else high = middle;
  }
  return low;
}

function interpolateClock(rows, clockMs) {
  const index = locate(rows, clockMs, 'timeMs'), left = rows[index], right = rows[index + 1];
  const fraction = Math.max(0, Math.min(1, (clockMs - left.timeMs) / (right.timeMs - left.timeMs)));
  return left.physicsSeconds + fraction * (right.physicsSeconds - left.physicsSeconds);
}

export function measuredInputInterpolator(rows, method = 'hermite') {
  if (!['hermite', 'linear'].includes(method)) throw new RangeError('Unknown measured-input interpolation.');
  return timeSeconds => {
    const index = locate(rows, timeSeconds, 'physicsSeconds'), left = rows[index], right = rows[index + 1];
    const h = right.physicsSeconds - left.physicsSeconds;
    const s = Math.max(0, Math.min(1, (timeSeconds - left.physicsSeconds) / h));
    const a = left.inputDegrees * DEG, b = right.inputDegrees * DEG;
    if (method === 'linear') return {angleRadians: a + s * (b - a), rateRadiansPerSecond: (b - a) / h};
    const av = left.inputSpeedDps * DEG, bv = right.inputSpeedDps * DEG;
    return {angleRadians: (2 * s ** 3 - 3 * s ** 2 + 1) * a + (s ** 3 - 2 * s ** 2 + s) * h * av +
      (-2 * s ** 3 + 3 * s ** 2) * b + (s ** 3 - s ** 2) * h * bv,
    rateRadiansPerSecond: (6 * s * s - 6 * s) / h * a + (3 * s * s - 4 * s + 1) * av +
      (-6 * s * s + 6 * s) / h * b + (3 * s * s - 2 * s) * bv};
  };
}

function crossingFrequency(rows) {
  const crossings = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if ((a.outputDegrees < 0 && b.outputDegrees >= 0) || (a.outputDegrees > 0 && b.outputDegrees <= 0)) {
      const fraction = -a.outputDegrees / (b.outputDegrees - a.outputDegrees);
      crossings.push({timeSeconds: a.physicsSeconds + fraction * (b.physicsSeconds - a.physicsSeconds),
        direction: b.outputDegrees > a.outputDegrees ? 1 : -1});
    }
  }
  const periods = [];
  for (const direction of [-1, 1]) {
    const same = crossings.filter(c => c.direction === direction);
    for (let i = 1; i < same.length; i++) periods.push(same[i].timeSeconds - same[i - 1].timeSeconds);
  }
  const result = {method: 'Linear interpolation of actual zero crossings; periods join consecutive crossings in the same direction.',
    zeroLevelDegrees: 0, crossings, crossingCount: crossings.length, fullPeriodCount: periods.length,
    meanPeriodSeconds: periods.length ? mean(periods) : null,
    frequencyHz: periods.length ? 1 / mean(periods) : null,
    periodCoefficientOfVariation: periods.length ? rms(periods.map(p => p - mean(periods))) / mean(periods) : null};
  return result;
}

function predictionSummary(prediction, rows, window, frequencyHz, originSeconds) {
  const values = prediction.rows.map((row, i) => ({physicsSeconds: row.timeSeconds,
    outputDegrees: row.outputRadians / DEG, outputSpeedDps: row.outputRateRadiansPerSecond / DEG,
    outputErrorDegrees: rows[i].outputDegrees - row.outputRadians / DEG,
    outputSpeedErrorDps: rows[i].outputSpeedDps - row.outputRateRadiansPerSecond / DEG}));
  const selected = values.filter(row => row.physicsSeconds >= window.startPhysicsSeconds && row.physicsSeconds <= window.endPhysicsSeconds);
  return {...prediction, rows: values,
    maximumAbsoluteOutputDegrees: maximumAbsolute(values.map(row => row.outputDegrees)),
    outputPredictionMaximumErrorDegrees: maximumAbsolute(values.map(row => row.outputErrorDegrees)),
    outputPredictionRmsErrorDegrees: rms(values.map(row => row.outputErrorDegrees)),
    outputSpeedPredictionMaximumErrorDps: maximumAbsolute(values.map(row => row.outputSpeedErrorDps)),
    outputSpeedPredictionRmsErrorDps: rms(values.map(row => row.outputSpeedErrorDps)),
    transientOutputFundamental: fitFundamental(selected, 'outputDegrees', frequencyHz, originSeconds)};
}

/** All selections are fixed by the program command indices and physics time.
 * Parameters must originate in the real-part inertia calculation before motion.
 */
export function evaluateExperiment({samples, native, experiment, parameters, clockObservations}) {
  if (!['slow', 'near', 'fast'].includes(experiment)) throw new RangeError('Declare slow, near or fast.');
  if (!Array.isArray(samples) || samples.length < 20) throw new Error('Response evaluation requires actual observations.');
  const outputInertiaKgM2 = finite(parameters?.outputInertiaKgM2, 'Independently computed passive inertia');
  const commands = native?.commands;
  if (!Array.isArray(commands) || commands.length !== 10 || commands.some((command, i) =>
    command.index !== i || !Number.isFinite(command.startedMs) || !Number.isFinite(command.finishedMs))) {
    throw new Error('Exactly ten completed finite target commands are required for the declared four-cycle experiment.');
  }
  const rows = samples.map((row, index) => {
    for (const key of ['timeMs', 'physicsTimeMs', 'inputDegrees', 'inputSpeedDps', 'outputDegrees', 'outputSpeedDps']) finite(row[key], `${key} at row ${index}`);
    return {...row, sampleIndex: index, physicsSeconds: row.physicsTimeMs / 1000};
  });
  if (rows.some((row, index) => index && (!(row.physicsSeconds > rows[index - 1].physicsSeconds) || !(row.timeMs > rows[index - 1].timeMs)))) {
    throw new Error('Raw observations must have strictly increasing clock and physics times.');
  }
  const capturedBoundaries = clockObservations || native.clockObservations;
  const clockRows = capturedBoundaries ? capturedBoundaries.map(row => ({
    timeMs: finite(row.sessionTimeMs, 'Captured session boundary'),
    physicsSeconds: finite(row.physicsTimeMs, 'Captured physics boundary') / 1000
  })) : rows;
  if (clockRows.length < 2 || clockRows.some((row, i) => i &&
    (!(row.timeMs > clockRows[i - 1].timeMs) || !(row.physicsSeconds > clockRows[i - 1].physicsSeconds)))) {
    throw new Error('Clock boundaries must preserve the actual increasing session and physics clocks.');
  }
  const clockToPhysics = clockMs => {
    if (capturedBoundaries) {
      const exact = clockRows.find(row => Math.abs(row.timeMs - clockMs) < 1e-6);
      if (!exact) throw new Error(`Command boundary ${clockMs} ms has no matching captured session tick boundary.`);
      return exact.physicsSeconds;
    }
    // Retained for explicitly exact-clock analytical fixtures and older 30 Hz
    // read-only consumers. Delivered native evidence supplies captured boundaries.
    return interpolateClock(clockRows, clockMs);
  };
  const smallAnglePrediction = smallAngleProperties(outputInertiaKgM2);
  const cycles = Array.from({length: 4}, (_, cycle) => {
    const firstCommandIndex = 1 + 2 * cycle, boundaryCommandIndex = firstCommandIndex + 2;
    const startClockMs = commands[firstCommandIndex].startedMs, endClockMs = commands[boundaryCommandIndex].startedMs;
    const startPhysicsSeconds = clockToPhysics(startClockMs), endPhysicsSeconds = clockToPhysics(endClockMs);
    const selected = rows.filter(row => row.physicsSeconds >= startPhysicsSeconds && row.physicsSeconds < endPhysicsSeconds);
    if (!selected.length) throw new Error(`No actual observations in cycle ${cycle}.`);
    return {cycle, firstCommandIndex, lastCommandIndex: firstCommandIndex + 1, boundaryCommandIndex,
      startClockMs, endClockMs, startPhysicsSeconds, endPhysicsSeconds,
      actualPeriodSeconds: endPhysicsSeconds - startPhysicsSeconds, sampleCount: selected.length,
      inputSpanDegrees: span(selected.map(row => row.inputDegrees)), outputSpanDegrees: span(selected.map(row => row.outputDegrees))};
  });
  const firstCycle = cycles[2], lastCycle = cycles[3];
  const window = {selection: 'Predeclared final two complete drive cycles, zero-based cycles 2 and 3; command 5 start to command 9 start.',
    cycles: [2, 3], firstCommandIndex: 5, boundaryCommandIndex: 9,
    startClockMs: firstCycle.startClockMs, endClockMs: lastCycle.endClockMs,
    startPhysicsSeconds: firstCycle.startPhysicsSeconds, endPhysicsSeconds: lastCycle.endPhysicsSeconds};
  const selected = rows.filter(row => row.physicsSeconds >= window.startPhysicsSeconds && row.physicsSeconds <= window.endPhysicsSeconds);
  const frequencyHz = 2 / (window.endPhysicsSeconds - window.startPhysicsSeconds);
  const inputFit = fitFundamental(selected, 'inputDegrees', frequencyHz, window.startPhysicsSeconds);
  const outputFit = fitFundamental(selected, 'outputDegrees', frequencyHz, window.startPhysicsSeconds);
  const meanPeriod = mean(cycles.map(cycle => cycle.actualPeriodSeconds));
  const transientWindow = {...window, interpretation: 'Finite-burst window, including startup-history effects. This is not a steady-state frequency response.',
    sampleCount: selected.length, firstSampleIndex: selected[0].sampleIndex, lastSampleIndex: selected.at(-1).sampleIndex,
    actualFrequencyHz: frequencyHz, frequencyToNaturalFrequencyRatio: frequencyHz / smallAnglePrediction.naturalFrequencyHz,
    cyclePeriodCoefficientOfVariation: rms(cycles.map(cycle => cycle.actualPeriodSeconds - meanPeriod)) / meanPeriod,
    input: inputFit, output: outputFit,
    gain: outputFit.amplitudeDegrees / inputFit.amplitudeDegrees,
    phaseDifferenceDegrees: wrapDegrees(outputFit.phaseDegrees - inputFit.phaseDegrees)};
  const holdStartClockMs = commands[9].finishedMs, holdStartPhysicsSeconds = clockToPhysics(holdStartClockMs);
  const heldRows = rows.filter(row => row.physicsSeconds >= holdStartPhysicsSeconds);
  const frequencyRows = rows.filter(row => row.physicsSeconds >= holdStartPhysicsSeconds + RESPONSE_LIMITS.ringdownFrequencyStartAfterHoldSeconds &&
    row.physicsSeconds <= holdStartPhysicsSeconds + RESPONSE_LIMITS.ringdownFrequencyEndAfterHoldSeconds);
  if (!heldRows.length || frequencyRows.length < 10) throw new Error('The declared held-input ringdown was not actually observed.');
  const frequency = crossingFrequency(frequencyRows);
  const ringdown = {interpretation: 'The input holds its zero target; continuing passive output is intentional.',
    holdStartClockMs, holdStartPhysicsSeconds, sampleCount: heldRows.length,
    observedDurationSeconds: rows.at(-1).physicsSeconds - holdStartPhysicsSeconds,
    maximumInputAbsoluteDegrees: maximumAbsolute(heldRows.map(row => row.inputDegrees)),
    maximumOutputAbsoluteDegrees: maximumAbsolute(heldRows.map(row => row.outputDegrees)),
    outputSpanDegrees: span(heldRows.map(row => row.outputDegrees)),
    frequencyWindow: {startAfterHoldSeconds: RESPONSE_LIMITS.ringdownFrequencyStartAfterHoldSeconds,
      endAfterHoldSeconds: RESPONSE_LIMITS.ringdownFrequencyEndAfterHoldSeconds, sampleCount: frequencyRows.length,
      firstSampleIndex: frequencyRows[0].sampleIndex, lastSampleIndex: frequencyRows.at(-1).sampleIndex},
    ...frequency,
    naturalFrequencyFractionalError: frequency.frequencyHz === null ? null :
      Math.abs(frequency.frequencyHz / smallAnglePrediction.dampedNaturalFrequencyHz - 1)};
  const settings = {timesSeconds: rows.map(row => row.physicsSeconds), inputAt: measuredInputInterpolator(rows),
    outputInertiaKgM2, initialOutputRadians: 0, initialOutputRateRadiansPerSecond: 0};
  const continuousODE = predictionSummary(integrateResponse({...settings, maximumStepSeconds: .0005, method: 'rk4'}),
    rows, window, frequencyHz, window.startPhysicsSeconds);
  const implicitSensitivity = predictionSummary(integrateResponse({...settings, maximumStepSeconds: .005, method: 'backward-euler'}),
    rows, window, frequencyHz, window.startPhysicsSeconds);
  const linearInputPrediction = integrateResponse({...settings, inputAt: measuredInputInterpolator(rows, 'linear'), maximumStepSeconds: .0005, method: 'rk4'});
  const interpolationDifference = linearInputPrediction.rows.map((row, index) => row.outputRadians / DEG - continuousODE.rows[index].outputDegrees);
  const prediction = {inputSource: 'Only actual input angle/rate and actual physics times. No output sample enters the prediction or its initial conditions.',
    parametersFitted: [], initialState: {outputDegrees: 0, outputSpeedDps: 0, origin: 'Authored symmetric saved reset, before motion.'},
    continuousODE: {...continuousODE, interpretation: 'Continuous nonlinear spring ODE, RK4 at at most 0.5 ms; native numerical damping is not fitted.'},
    implicitSensitivity: {...implicitSensitivity, interpretation: 'Separate 5 ms backward-Euler approximation demonstrates timestep sensitivity; it is not an exact emulation of Jolt.'},
    inputInterpolationSensitivity: {comparison: 'Continuous ODE driven by linear angle interpolation versus cubic Hermite angle/rate interpolation.',
      maximumOutputDifferenceDegrees: maximumAbsolute(interpolationDifference), rmsOutputDifferenceDegrees: rms(interpolationDifference)}};
  const burstStartPhysicsSeconds = clockToPhysics(commands[0].startedMs);
  const burstRows = rows.filter(row => row.physicsSeconds >= burstStartPhysicsSeconds && row.physicsSeconds <= holdStartPhysicsSeconds);
  return {experiment, sampleCount: rows.length, parameterOrigin: 'Prepared actual part geometry and masses, source spring law and native defaults, before useful-motion proof.',
    clockMapping: {method: capturedBoundaries ? 'Exact captured session tick boundaries mapped to actual physics time.' :
      'Linear clock mapping for explicitly exact-clock analytical records or legacy frame observations.',
      capturedNativeBoundaries: Boolean(capturedBoundaries), boundaryCount: clockRows.length,
      outputRowsSynthesized: 0},
    parameters: {outputInertiaKgM2, dynamics: DYNAMICS}, smallAnglePrediction, cycles, transientWindow, ringdown,
    burst: {sampleCount: burstRows.length, maximumInputAbsoluteDegrees: maximumAbsolute(burstRows.map(row => row.inputDegrees)),
      maximumOutputAbsoluteDegrees: maximumAbsolute(burstRows.map(row => row.outputDegrees)),
      outputSpanDegrees: span(burstRows.map(row => row.outputDegrees))},
    maximumOutputAbsoluteDegrees: maximumAbsolute(rows.map(row => row.outputDegrees)), prediction};
}

export function responseAcceptance(evaluation, experiment = evaluation.experiment) {
  const limits = RESPONSE_LIMITS[experiment];
  if (!limits || evaluation.experiment !== experiment) throw new Error('Response evidence and experiment identity must match.');
  const w = evaluation.transientWindow, r = evaluation.ringdown;
  const checks = {
    fourObservedCompleteCycles: evaluation.cycles.length === 4 && evaluation.cycles.every(cycle =>
      cycle.sampleCount >= RESPONSE_LIMITS.minimumSamplesPerCycle && cycle.actualPeriodSeconds > 0),
    fixedTransientWindowHasObservations: w.sampleCount >= RESPONSE_LIMITS.minimumTransientWindowSamples,
    meaningfulActualInput: w.input.amplitudeDegrees >= RESPONSE_LIMITS.minimumInputFundamentalAmplitudeDegrees &&
      evaluation.cycles.every(cycle => cycle.inputSpanDegrees >= RESPONSE_LIMITS.minimumInputSpanDegrees && cycle.inputSpanDegrees <= RESPONSE_LIMITS.maximumInputSpanDegrees),
    boundedCycleTimingVariation: w.cyclePeriodCoefficientOfVariation <= RESPONSE_LIMITS.maximumCyclePeriodCoefficientOfVariation,
    prescribedFrequencyRegimeObserved: w.frequencyToNaturalFrequencyRatio >= limits.minimumFrequencyRatio && w.frequencyToNaturalFrequencyRatio <= limits.maximumFrequencyRatio,
    actualPassiveFundamentalMotion: w.output.amplitudeDegrees >= RESPONSE_LIMITS.minimumOutputFundamentalAmplitudeDegrees,
    usefulFiniteWindowGain: w.gain >= limits.minimumGain && w.gain <= limits.maximumGain,
    heldInputRingdownActuallyObserved: r.observedDurationSeconds >= RESPONSE_LIMITS.minimumRingdownSeconds && r.maximumInputAbsoluteDegrees <= RESPONSE_LIMITS.maximumHeldInputAbsoluteDegrees,
    independentPredictionsComplete: evaluation.prediction.continuousODE.rows.length === evaluation.sampleCount &&
      evaluation.prediction.implicitSensitivity.rows.length === evaluation.sampleCount &&
      Number.isFinite(evaluation.prediction.continuousODE.outputPredictionRmsErrorDegrees) &&
      Number.isFinite(evaluation.prediction.implicitSensitivity.outputPredictionRmsErrorDegrees)
  };
  if (experiment === 'near') Object.assign(checks, {
    usefulFreeRingdown: r.maximumOutputAbsoluteDegrees >= limits.minimumRingdownPeakDegrees && r.crossingCount >= limits.minimumRingdownCrossings,
    independentNaturalFrequencySupported: Number.isFinite(r.naturalFrequencyFractionalError) &&
      r.naturalFrequencyFractionalError <= limits.maximumRingdownFrequencyFractionalError
  });
  return checks;
}

export function compareExperiments(reports) {
  const list = Array.isArray(reports) ? reports : Object.values(reports);
  const evaluations = Object.fromEntries(list.map(report => {
    const e = report.response || report.evaluation || report;
    return [e.experiment, e];
  }));
  for (const id of ['slow', 'near', 'fast']) if (!evaluations[id]?.transientWindow) throw new Error(`Missing complete ${id} response evidence.`);
  const {slow, near, fast} = evaluations;
  const nearToSlowGainRatio = near.transientWindow.gain / slow.transientWindow.gain;
  const nearToFastGainRatio = near.transientWindow.gain / fast.transientWindow.gain;
  return {interpretation: 'Three independent fresh-reset finite bursts, compared in the same predeclared cycle windows.',
    gains: Object.fromEntries(Object.entries(evaluations).map(([id, e]) => [id, e.transientWindow.gain])),
    frequenciesHz: Object.fromEntries(Object.entries(evaluations).map(([id, e]) => [id, e.transientWindow.actualFrequencyHz])),
    phasesDegrees: Object.fromEntries(Object.entries(evaluations).map(([id, e]) => [id, e.transientWindow.phaseDifferenceDegrees])),
    nearToSlowGainRatio, nearToFastGainRatio,
    acceptance: {threeCompleteIndividuallyQualifiedExperiments: Object.values(evaluations).every(e => Object.values(responseAcceptance(e)).every(Boolean)),
      actualFrequenciesOrdered: slow.transientWindow.actualFrequencyHz < near.transientWindow.actualFrequencyHz && near.transientWindow.actualFrequencyHz < fast.transientWindow.actualFrequencyHz,
      nearResponseExceedsSlow: nearToSlowGainRatio >= RESPONSE_LIMITS.minimumNearToSlowGainRatio,
      nearResponseExceedsFast: nearToFastGainRatio >= RESPONSE_LIMITS.minimumNearToFastGainRatio}};
}

export function compareModes(defaultEvaluation, strictEvaluation) {
  if (defaultEvaluation.experiment !== strictEvaluation.experiment) throw new Error('Compare the same experiment in both native modes.');
  const a = defaultEvaluation.transientWindow, b = strictEvaluation.transientWindow;
  const fractionalGainDifference = Math.abs(a.gain - b.gain) / Math.max(a.gain, b.gain);
  const fractionalFrequencyDifference = Math.abs(a.actualFrequencyHz - b.actualFrequencyHz) / Math.max(a.actualFrequencyHz, b.actualFrequencyHz);
  const phaseDifferenceDegrees = Math.abs(wrapDegrees(a.phaseDifferenceDegrees - b.phaseDifferenceDegrees));
  return {experiment: defaultEvaluation.experiment, fractionalGainDifference, fractionalFrequencyDifference, phaseDifferenceDegrees,
    acceptance: {gainConsistent: fractionalGainDifference <= RESPONSE_LIMITS.maximumCrossModeGainDifferenceFraction,
      frequencyConsistent: fractionalFrequencyDifference <= RESPONSE_LIMITS.maximumCrossModeFrequencyDifferenceFraction,
      phaseConsistent: phaseDifferenceDegrees <= RESPONSE_LIMITS.maximumCrossModePhaseDifferenceDegrees}};
}

/** Negative control is an in-memory copy, retaining the real timing and input.
 * Original raw native observations remain unchanged and are never overwritten.
 */
export function frozenOutputNegativeControl({samples, native, experiment, parameters}) {
  const frozen = samples.map(row => ({...row, outputDegrees: 0, outputSpeedDps: 0}));
  const evaluation = evaluateExperiment({samples: frozen, native, experiment, parameters});
  const acceptance = responseAcceptance(evaluation, experiment);
  const rejectedChecks = Object.entries(acceptance).filter(([, value]) => !value).map(([name]) => name);
  return {method: 'Copy the actual observations; freeze only the observed passive angle/rate at saved zero. Retain real input and real time.',
    rejected: rejectedChecks.includes('actualPassiveFundamentalMotion') && rejectedChecks.includes('usefulFiniteWindowGain'),
    rejectedChecks, acceptance, transientGain: evaluation.transientWindow.gain,
    passiveFundamentalAmplitudeDegrees: evaluation.transientWindow.output.amplitudeDegrees,
    originalSamplesModified: false};
}

// Positional convenience for the isolated module verifier; same evaluator and gates.
export const evaluateResponse = (samples, commands, {experiment, ...parameters}) =>
  evaluateExperiment({samples, native: {commands}, experiment, parameters});

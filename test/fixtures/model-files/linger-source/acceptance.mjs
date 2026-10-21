// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Fixed before complete-machine cold and actual-VM runs. Preserve failures;
// correct model/program defects instead of weakening this numerical gate.
export const LIMITS=Object.freeze({
  maximumInputToEncoderAngleErrorDegrees:0.5,
  maximumIntermediatePredictionErrorDegrees:1,
  maximumOutputPredictionErrorDegrees:1,
  maximumPointPredictionErrorMm:0.5,
  maximumJointClosureErrorMm:0.5,
  maximumMemberLengthErrorMm:0.5,
  maximumOutOfPlaneErrorMm:0.5,
  maximumAxisDeviationDegrees:1,
  minimumEachDirectionInputTravelDegrees:718,
  minimumEachCycleInputCoverageDegrees:358,
  minimumEachCycleOutputSpanDegrees:65,
  minimumEachCycleIntermediateSpanDegrees:70,
  minimumEachCyclePointerStrokeMm:43,
  phaseCoverageBins:36,
  minimumSamplesPerCycle:1000,
  requiredCompleteDwellWindows:4,
  minimumDwellInputCoverageDegrees:89,
  maximumDwellOutputSpanDegrees:1,
  maximumDwellPointerStrokeMm:1,
  minimumDwellSamples:250,
  minimumDwellDurationSeconds:8.5,
  minimumDwellInputSpeedDps:5,
  minimumTrajectorySamples:4300,
  maximumInputSampleStepDegrees:3,
  maximumOutputSampleStepDegrees:3,
  maximumFiniteMoveWrongDirectionStepDegrees:0.5,
  minimumFiniteMoveVelocitySamples:3500,
  minimumInputSpeedForVelocityCheckDps:5,
  maximumRmsOutputChordSpeedPredictionErrorDps:1,
  maximumRmsPointerVelocityPredictionErrorMmPerSecond:1,
  maximumHeldEncoderErrorDegrees:2,
  maximumReturnAngleErrorDegrees:2,
  maximumReturnPointErrorMm:1,
  maximumBaseTiltDegrees:2,
  maximumBaseTranslationMm:5
});
export const COLD_START=Object.freeze({durationMs:1000,sampleIntervalMs:10});
export const SCOPES=Object.freeze({
  coldStartup:'A separate fresh complete freestanding model advances for one native physics second without any motor or hold call. Every 10 ms raw sample is checked for connector closure, prediction, layers, axes, saved-pose drift and chassis stability. The actual finite program separately holds immediately at its startup.',
  geometry:'All saved-pose, unpowered, startup, moving, reversing, held and final samples are included. Actual O/A/B/D/P/E/Q connectors on all five moving assemblies and their independent real bearings are transformed into the measured frame axes. Two independent circle intersections predict geometry only from the measured OA direction; no expected pose enters native physics.',
  coverage:'The first two uninterrupted commands give two physical forward turns; the third gives two physical reverse turns. Each direction must travel at least 718 degrees and cover all 36 phase bins. Each of the four complete cycles separately requires input coverage, a useful intermediate/output swing and a measured Q stroke between the actual minimum and maximum output-angle samples.',
  nearDwell:'The fixed analytical input-phase interval 186–276 degrees is applied to every one of the four complete native cycles. Every raw finite-move sample inside each interval is retained, without smoothing or output-based selection. Each window must span at least 89 degrees of actual input, last at least 8.5 seconds, contain at least 250 samples, keep actual input-speed magnitude at least 5 degrees/s, and limit actual output range to 1 degree and pointer bounding-box diagonal to 1 mm. Holds occur only at whole turns.',
  velocity:'Raw adjacent measured output angles and Q points are differenced using actual native physics timestamps, then compared with independent geometric chords over the same measured input-angle interval. All finite-command samples with input-speed magnitude at least 5 degrees/s enter RMS checks. Preserve raw all-mode and finite-move maxima as well; brief solver transients are not presented as negligible instantaneous speed error.',
  negativeControl:'In an analysis-only copy of recorded observations, freeze output angle and P/Q positions at their first values. The identical four-cycle useful-motion gate must reject it. Real native physics and original observations remain untouched.',
  physicalBoundary:'This is actual headless compiler/VM/controller/native-physics evidence, separately checked against real-part construction and complete swept clearance. No fixture bodies, synthetic ratios, additional joints, mass/inertia edits, broad collision overrides, analytic poses or fitted offsets assist full-machine qualification. Browser interaction and physical hardware remain untested.'
});

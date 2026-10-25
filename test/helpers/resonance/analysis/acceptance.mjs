// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Construction and execution limits are declared before complete-model physics.
// The independent response evaluator adds its own prospective useful-output gates.
export const LIMITS=Object.freeze({
  maximumInputDegrees:3,
  maximumOutputDegrees:35,
  maximumInputToEncoderErrorDegrees:.5,
  maximumJointClosureErrorMm:.25,
  maximumAxisDeviationDegrees:.5,
  maximumOutOfPlaneErrorMm:.25,
  maximumBaseTiltDegrees:1,
  maximumBaseTranslationMm:1,
  minimumBandExtensionMm:.5,
  minimumEditorBandStretchRatio:1.01,
  maximumEditorBandStretchRatio:2.5,
  maximumHeldEncoderErrorDegrees:.5,
  maximumFinalInputDegrees:1,
  maximumColdInputDegrees:.5,
  maximumColdOutputDegrees:.5,
  minimumSampleCount:1500,
  maximumSampleGapMs:5.000001
});
export const COLD_START=Object.freeze({durationMs:1000,sampleIntervalMs:5});
export const SCOPES=Object.freeze({
  powered:'Fresh complete freestanding model for each experiment and native preparation mode. The actual finite .bw runs through compiler, SB3, Scratch VM, Robot Lab extension, hub controller and unchanged native physics.',
  coldStartup:'A fresh complete model advances for one native physics second with zero externally issued motor or hold commands.',
  physicalBoundary:'Native part masses and rubber-band spring/damping values are estimates. Finite-burst gain and phase describe these qualified simulation runs, not measured hardware or steady-state response. The passive output intentionally continues ringing after the input returns and holds.',
  browser:'UNTESTED',hardware:'UNTESTED',galleryInstallation:'Not installed; standalone integration-ready add-on.'
});
export function commonAcceptance({samples,native,topology}){
  const max=k=>Math.max(...samples.map(s=>Math.abs(s[k])));
  const bands=samples.flatMap(s=>s.bandReadings),last=samples.at(-1);
  const bothBands=samples.length>0&&samples.every(s=>s.bandReadings.length===2);
  const gap=Math.max(...samples.slice(1).map((s,i)=>s.physicsTimeMs-samples[i].physicsTimeMs));
  return {
    completeFreestandingTopology:topology.dynamicBodies===3&&topology.staticBodies.length===1&&topology.staticBodies[0]==='ground',
    usefulSampling:samples.length>=LIMITS.minimumSampleCount&&gap>0&&gap<=LIMITS.maximumSampleGapMs,
    inputInsideCertifiedEnvelope:max('inputDegrees')<=LIMITS.maximumInputDegrees,
    passiveOutputInsideCertifiedEnvelope:max('outputDegrees')<=LIMITS.maximumOutputDegrees,
    actualInputMatchesEncoder:max('inputToEncoderErrorDegrees')<=LIMITS.maximumInputToEncoderErrorDegrees,
    realHingesStayClosed:max('maximumJointClosureErrorMm')<=LIMITS.maximumJointClosureErrorMm,
    shaftAxesStayAligned:max('maximumAxisDeviationDegrees')<=LIMITS.maximumAxisDeviationDegrees,
    axialLayersStaySeparated:max('maximumOutOfPlaneErrorMm')<=LIMITS.maximumOutOfPlaneErrorMm,
    bandsRemainTaut:bothBands&&bands.every(b=>b.extensionMm>=LIMITS.minimumBandExtensionMm),
    bandPathsStayValid:bothBands&&bands.every(b=>b.editorPathError===null&&Number.isFinite(b.editorPathStretchRatio)),
    bandStretchWithinNativeRange:bothBands&&bands.every(b=>b.editorPathStretchRatio>=LIMITS.minimumEditorBandStretchRatio&&b.editorPathStretchRatio<=LIMITS.maximumEditorBandStretchRatio),
    frameRemainsUpright:max('baseTiltDegrees')<=LIMITS.maximumBaseTiltDegrees,
    frameRemainsInPlace:max('baseTranslationMm')<=LIMITS.maximumBaseTranslationMm,
    actualVmCompleted:native.completed&&!native.timedOut&&native.guardStops===0&&native.failures.length===0&&native.blockErrors.length===0,
    finalEncoderReturnsHeld:Math.abs(last.encoderADegrees)<=LIMITS.maximumHeldEncoderErrorDegrees&&native.holdCalls.at(-1)?.action==='hold',
    actualInputReturns:Math.abs(last.inputDegrees)<=LIMITS.maximumFinalInputDegrees
  };
}

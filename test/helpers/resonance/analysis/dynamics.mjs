// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Independent analytical model. This file never imports or drives the native simulator.

export const DEG = Math.PI / 180;
export const DYNAMICS = Object.freeze({
  pivotSeparationM: .056,
  anchorRadiusM: .008,
  bandPart: '85546.dat',
  bandDiameterM: .033,
  anchorSeatRadiusM: .0028,
  bandStiffnessNPerM: 100 * 15 / 33,
  bandDampingNsPerM: .02,
  angularBodyDampingPerSecond: .05000000074505806,
  nativeStepSeconds: .005,
  restCenterDistanceM: Math.PI * (.033 - 2 * .0028) / 2,
  parameterOrigin: 'Unmodified native 33 mm rubber-band law, actual 3713 groove circles, and installed native body-setting defaults.'
});

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return value;
};

export function smallAngleProperties(outputInertiaKgM2, commonAngleRadians = 0, config = DYNAMICS) {
  const I = finite(outputInertiaKgM2, 'Passive inertia');
  if (!(I > 0)) throw new RangeError('Passive inertia must be positive and independently computed from the actual parts.');
  const {pivotSeparationM: D, anchorRadiusM: r, restCenterDistanceM: d0,
    bandStiffnessNPerM: k, bandDampingNsPerM: c, angularBodyDampingPerSecond: gamma} = config;
  const a = finite(commonAngleRadians, 'Common angle');
  const stiffnessNmPerRadian = 2 * k * r * r * (1 - d0 / D * Math.sin(a) ** 2);
  const bandDampingNmsPerRadian = 2 * c * r * r * Math.cos(a) ** 2;
  const totalDampingNmsPerRadian = bandDampingNmsPerRadian + gamma * I;
  const naturalAngularFrequency = Math.sqrt(stiffnessNmPerRadian / I);
  const dampingRatio = totalDampingNmsPerRadian / (2 * Math.sqrt(stiffnessNmPerRadian * I));
  return {outputInertiaKgM2: I, commonAngleRadians: a,
    restCenterDistanceM: d0, resetBandPretensionN: k * (D - d0),
    stiffnessNmPerRadian, bandDampingNmsPerRadian, totalDampingNmsPerRadian,
    naturalFrequencyHz: naturalAngularFrequency / (2 * Math.PI),
    dampedNaturalFrequencyHz: naturalAngularFrequency * Math.sqrt(Math.max(0, 1 - dampingRatio ** 2)) / (2 * Math.PI),
    dampingRatio, amplitudeDecayRatePerSecond: totalDampingNmsPerRadian / (2 * I),
    amplitudeTimeConstantSeconds: 2 * I / totalDampingNmsPerRadian};
}

/** Exact two-anchor geometry and unilateral Kelvin-Voigt force, in SI units.
 * alpha = driven angle; phi = passive angle. Both zero directions are +Z.
 * Native springs are unilateral; the qualified range must remain taut so the
 * nonsmooth slack boundary is never used to claim precision.
 */
export function springState({inputRadians: alpha, outputRadians: phi,
  inputRateRadiansPerSecond: alphaDot = 0, outputRateRadiansPerSecond: phiDot = 0}, config = DYNAMICS) {
  [alpha, phi, alphaDot, phiDot].forEach((v, i) => finite(v, ['Input angle', 'Output angle', 'Input rate', 'Output rate'][i]));
  const {pivotSeparationM: D, anchorRadiusM: r, restCenterDistanceM: d0,
    bandStiffnessNPerM: k, bandDampingNsPerM: c} = config;
  const delta = phi - alpha;
  const bands = [-1, 1].map(sign => {
    const inputAnchorM = [-D + sign * r * Math.sin(alpha), sign * r * Math.cos(alpha)];
    const outputAnchorM = [sign * r * Math.sin(phi), sign * r * Math.cos(phi)];
    const separationM = outputAnchorM.map((v, i) => v - inputAnchorM[i]);
    const lengthM = Math.hypot(...separationM);
    const dLengthDOutput = (sign * D * r * Math.cos(phi) + r * r * Math.sin(delta)) / lengthM;
    const dLengthDInput = (-sign * D * r * Math.cos(alpha) - r * r * Math.sin(delta)) / lengthM;
    const lengthRateMPerSecond = dLengthDOutput * phiDot + dLengthDInput * alphaDot;
    const extensionM = lengthM - d0;
    const elasticForceN = k * Math.max(0, extensionM);
    const unconstrainedTensionN = elasticForceN + c * lengthRateMPerSecond;
    const tensionN = extensionM > 0 ? Math.max(0, unconstrainedTensionN) : 0;
    return {sign, inputAnchorM, outputAnchorM, lengthM, extensionM, lengthRateMPerSecond,
      dLengthDOutput, dLengthDInput, elasticForceN, unconstrainedTensionN, tensionN,
      torqueNm: -tensionN * dLengthDOutput,
      elasticPotentialJ: .5 * k * Math.max(0, extensionM) ** 2};
  });
  return {bands, torqueNm: bands.reduce((s, b) => s + b.torqueNm, 0),
    elasticPotentialJ: bands.reduce((s, b) => s + b.elasticPotentialJ, 0)};
}

export function outputAcceleration(inputRadians, inputRateRadiansPerSecond,
  outputRadians, outputRateRadiansPerSecond, outputInertiaKgM2, config = DYNAMICS) {
  const state = springState({inputRadians, inputRateRadiansPerSecond, outputRadians, outputRateRadiansPerSecond}, config);
  return state.torqueNm / outputInertiaKgM2 - config.angularBodyDampingPerSecond * outputRateRadiansPerSecond;
}

/** Continuous nonlinear ODE solved with an independently implemented RK4.
 * inputAt(t) supplies ONLY measured (or explicitly hypothetical) input angle/rate.
 * No measured output, fitted stiffness, fitted damping, or simulator API is used.
 */
export function integrateResponse({timesSeconds, inputAt, outputInertiaKgM2,
  initialOutputRadians = 0, initialOutputRateRadiansPerSecond = 0,
  maximumStepSeconds = .0005, method = 'rk4', config = DYNAMICS}) {
  smallAngleProperties(outputInertiaKgM2, 0, config);
  if (!Array.isArray(timesSeconds) || timesSeconds.length < 2 ||
    timesSeconds.some((t, i) => !Number.isFinite(t) || (i && !(t > timesSeconds[i - 1])))) {
    throw new TypeError('Prediction times must be a strictly increasing finite array.');
  }
  if (!(maximumStepSeconds > 0 && maximumStepSeconds <= .01)) throw new RangeError('Use an explicit integration step no larger than 10 ms.');
  if (!['rk4', 'backward-euler'].includes(method)) throw new RangeError('Unknown independent integration method.');
  let t = timesSeconds[0], q = initialOutputRadians, v = initialOutputRateRadiansPerSecond;
  const acceleration = (time, angle, rate) => {
    const input = inputAt(time);
    return outputAcceleration(input.angleRadians, input.rateRadiansPerSecond, angle, rate, outputInertiaKgM2, config);
  };
  const rows = [{timeSeconds: t, outputRadians: q, outputRateRadiansPerSecond: v}];
  let steps = 0, maximumNewtonResidual = 0;
  for (let i = 1; i < timesSeconds.length; i++) {
    const target = timesSeconds[i];
    const subdivisions = Math.max(1, Math.ceil((target - t) / maximumStepSeconds - 1e-10));
    const h = (target - t) / subdivisions;
    for (let sub = 0; sub < subdivisions; sub++) {
      if (method === 'rk4') {
        const k1q = v, k1v = acceleration(t, q, v);
        const k2q = v + h * k1v / 2, k2v = acceleration(t + h / 2, q + h * k1q / 2, v + h * k1v / 2);
        const k3q = v + h * k2v / 2, k3v = acceleration(t + h / 2, q + h * k2q / 2, v + h * k2v / 2);
        const k4q = v + h * k3v, k4v = acceleration(t + h, q + h * k3q, v + h * k3v);
        q += h * (k1q + 2 * k2q + 2 * k3q + k4q) / 6;
        v += h * (k1v + 2 * k2v + 2 * k3v + k4v) / 6;
      } else {
        // Prospective numerical-sensitivity model only. It is not a reimplementation
        // of Jolt's multi-constraint solver and is never labelled native evidence.
        const q0 = q, v0 = v;
        let nextV = v;
        const residual = rate => rate - v0 - h * acceleration(t + h, q0 + h * rate, rate);
        for (let iteration = 0; iteration < 12; iteration++) {
          const f = residual(nextV);
          if (Math.abs(f) < 1e-12) break;
          const epsilon = 1e-6 * Math.max(1, Math.abs(nextV));
          const derivative = (residual(nextV + epsilon) - residual(nextV - epsilon)) / (2 * epsilon);
          if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-8) throw new Error('Independent implicit step did not converge.');
          nextV -= f / derivative;
        }
        const error = Math.abs(residual(nextV));
        maximumNewtonResidual = Math.max(maximumNewtonResidual, error);
        if (!(error < 1e-8)) throw new Error('Independent implicit step residual exceeds its declared numerical tolerance.');
        v = nextV; q = q0 + h * v;
      }
      t += h; steps++;
    }
    t = target;
    rows.push({timeSeconds: t, outputRadians: q, outputRateRadiansPerSecond: v});
  }
  return {method, maximumStepSeconds, steps, maximumNewtonResidual,
    outputInertiaKgM2, initialOutputRadians, initialOutputRateRadiansPerSecond, rows};
}

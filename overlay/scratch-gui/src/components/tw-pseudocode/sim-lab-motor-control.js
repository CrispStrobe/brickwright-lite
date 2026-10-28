// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Manual Stop holds a sensed shaft; encoderless hubs explicitly refuse hold and can brake. */
export const setMixerMotorPower = (api, id, power) => {
    if (power !== 0) return api.setMotor(id, {power});
    const held = api.stopMotor(id, 'hold');
    return held?.ok === false && held.code === 'refused' ? api.stopMotor(id, 'brake') : held;
};

/** The drive pad is continuous; neither movement-pair port may require finite manual steps. */
export const manualDriveAllowed = (manualJog, movementPair) =>
    !(movementPair || ['A', 'B']).some(port => manualJog?.[port] !== undefined);

/**
 * A finite manual step from the measured encoder angle. Clamp only the requested target;
 * an unavailable or already out-of-range reading is refused and must never be rewritten.
 */
export const mixerJogTarget = (limits, angleDeg, direction) => {
    const finite = Number.isFinite;
    if (!limits || ![limits.minDeg, limits.maxDeg, limits.stepDeg, limits.speedDps].every(finite) ||
        limits.minDeg >= limits.maxDeg || limits.stepDeg <= 0 || limits.stepDeg > limits.maxDeg - limits.minDeg || limits.speedDps <= 0) {
        return {ok: false, code: 'invalid-config'};
    }
    if (direction !== -1 && direction !== 1) return {ok: false, code: 'invalid-direction'};
    if (!finite(angleDeg)) return {ok: false, code: 'no-encoder'};
    if (angleDeg < limits.minDeg || angleDeg > limits.maxDeg) return {ok: false, code: 'out-of-bounds'};
    const targetDeg = Math.max(limits.minDeg, Math.min(limits.maxDeg, angleDeg + direction * limits.stepDeg));
    const degrees = targetDeg - angleDeg;
    if (degrees === 0) return {ok: false, code: 'limit'};
    return {ok: true, targetDeg, degrees, speedDps: limits.speedDps};
};

/** The real API gets one relative-degree command, from a fresh reading, followed by real hold. */
export const setMixerMotorJog = (api, id, limits, direction, {enabled = false, busy = false} = {}) => {
    if (!enabled) return {ok: false, code: 'disabled'};
    if (busy) return {ok: false, code: 'busy'};
    const motor = api?.motors?.().find(m => m.id === id);
    if (!motor?.direct) return {ok: false, code: 'no-direct-motor'};
    const encoder = api.encoder(id);
    const target = mixerJogTarget(limits, encoder?.ok ? encoder.angleDeg : null, direction);
    if (!target.ok) return target;
    const result = api.setMotor(id, {degrees: target.degrees, speedDps: target.speedDps, then: 'hold'});
    return result?.ok ? {...result, targetDeg: target.targetDeg} : result;
};

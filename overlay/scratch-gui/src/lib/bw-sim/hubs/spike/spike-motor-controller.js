// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The SPIKE hub's motor controller as the Robot Lab runs it since owner
// decision D5 (docs/ROBOT-LAB-ARCHITECTURE.md, "Owner decisions"): the
// firmware decides a PWM DUTY per port from its encoder, and the duty drives
// the motor's DC model (physics/actuators.js `pwm`). It replaces "the shaft
// turns at the commanded speed" (the ideal servo, now a test fixture).
//
// Structure (the one modelled, and why). LEGO's SPIKE firmware is closed;
// Pybricks (MIT, same hub, same motors) documents the usual one for these
// motors: a TRAJECTORY GENERATOR that turns a command (run at speed, for
// degrees/time, to a position, hold, with acceleration ramps) into a
// reference angle θr(t) and speed ωr(t), and a feedback loop that makes the
// encoder angle TRACK θr — position-based speed control, so a motor slowed
// by a load catches up the angle it lost, and two wheels driven at the same
// speed turn the same angle (a robot drives straight). Here:
//
//   trajectory  spike-sim/independent-backend.js, unchanged and shared with
//               the SPIKE arena: its 1 ms ramps, braking-distance approach
//               to a target, hold, stop actions. The adapter
//               (spike-virtual-hub.js) runs it on the REFERENCE angle, not
//               on the measured one.
//   feedback    duty = ωr/ω0                       speed feedforward (the duty
//                                                  that turns at ωr with no load)
//                    + (Kp·e + Ki·∫e dt            PI on the tracking error
//                                                  e = θr − θ (rad)
//                       + Kd·(ωr − ω)) / τs        damping on the speed error;
//                                                  the gains are torques, divided
//                                                  by the motor's stall torque
//               clamped to ±1, the integral frozen while the duty is
//               saturated (anti-windup), and the reference dragged to within
//               the error where P alone asks 1.5·τs of the shaft (a blocked motor does not wind up an
//               unbounded catch-up).
//   stop        'brake' and 'coast' are the H-bridge's passive states (the
//               winding shorted / open, duty 0) — not a ramp to zero; 'hold'
//               is the feedback loop tracking a fixed angle.
//   stall       duty saturated and the shaft below STALL_DPS for STALL_MS:
//               the controller reports the port stalled to the trajectory
//               generator (its load input), which freezes the reference and
//               ends a position command as 'stalled' after its own stallMs.
//
// Gains (N·m per rad, per rad·s, per rad/s; 8, 40 and 0.3 of duty for a
// motor of τs = 0.18 N·m, R2's medium motor), chosen on the DC model
// J·ω' = τs(u − ω/ω0) − τ_load with a 5 ms zero-order hold and the encoder
// read at the start of the step (the Robot Lab's cadence), by a grid search
// over both SPIKE motors and driven inertias J from the bare output (the
// rotor alone, 3e-4 kg·m² medium, 1.2e-3 large: devices/dc-motors.js) to
// 3e-3 kg·m² (a heavy arm): the gains with the smallest steady-state
// peak-to-peak speed ripple at 500 °/s (≤ 1 % everywhere in that range) and
// the fastest recovery from a step load of 30 % of the stall torque
// (≤ 85 ms to within 5 %). As torques the same gains serve the large motor
// (checked over the same range), and any other DC model. Re-checked on the D6 numbers (Philo's
// measurements: medium τs 0.104 N·m, ω0 176 rpm; large 0.264 N·m, 168 rpm at 7.2 V; for the
// medium motor the gains are now 13.8, 69 and 0.52 of duty): same tests, same bounds —
// test/bw-sim-dc-motor.test.mjs (d)–(g). The derivative term is large (KD is 6× the
// back-EMF damping τs/ω0 of R2's medium motor, 9.6× the D6 one's, 3.6× the
// large one's): the motor's own damping alone leaves a heavy load ringing
// against the position loop. Above ~5e-3 kg·m² the loop rings during ramps — a load the
// real firmware would also need re-tuning for (Pybricks scales its gains
// per motor type, not per load).
// The test (test/bw-sim-dc-motor.test.mjs) measures stability, recovery
// after a load step, and position accuracy on the real physics.

/** The stall torque the gains were tuned in duty units for (R2's medium motor), N·m: a scale, not a motor's number. */
const TAU_REF = 0.18;
/** Proportional gain on the tracking error, N·m per rad. */
export const KP = 8 * TAU_REF;
/** Integral gain, N·m per rad·s. */
export const KI = 40 * TAU_REF;
/** Damping gain on the speed error, N·m per rad/s. */
export const KD = 0.3 * TAU_REF;
/** Largest tracking error kept, in units of the error at which P alone asks 1.5× the stall torque. */
const E_MAX_TORQUE = 1.5;
/** Stall: duty saturated and |speed| below this (°/s) for STALL_MS. */
export const STALL_DPS = 20;
export const STALL_MS = 200;

const DEG = 180 / Math.PI;

/** A port's controller state: plain data (exported to the physics worker's mirror). */
export const freshPortState = () => ({integral: 0, stallMs: 0, active: false});

/**
 * One control step: the duty for the next dt.
 * @param {object} s the port's state (freshPortState), updated in place
 * @param {object} x {refDeg, refDps, posDeg, speedDps}: reference and measured angle/speed
 * @param {{noLoadRadPerSec: number, stallTorqueNm: number}} motor the motor's DC spec
 * @param {number} dtMs
 * @returns {{duty: number, refDeg: number, saturated: boolean}} the duty, the reference after
 *          the drag limit, and whether the duty hit ±1
 */
export const controlStep = (s, {refDeg, refDps, posDeg, speedDps}, motor, dtMs) => {
    const dt = dtMs / 1000;
    const ts = motor.stallTorqueNm;
    const eMax = E_MAX_TORQUE * ts / KP;
    let e = (refDeg - posDeg) / DEG;
    if (Math.abs(e) > eMax) {
        e = Math.sign(e) * eMax;
        refDeg = posDeg + e * DEG;
    }
    const wr = refDps / DEG;
    const w = speedDps / DEG;
    const raw = wr / motor.noLoadRadPerSec + (KP * e + KI * s.integral + KD * (wr - w)) / ts;
    const duty = Math.max(-1, Math.min(1, raw));
    const saturated = duty !== raw;
    // Anti-windup: integrate only while the duty can still act on it.
    if (!saturated || Math.sign(e) !== Math.sign(raw)) s.integral += e * dt;
    return {duty, refDeg, saturated};
};

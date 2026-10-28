// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// One MINDSTORMS output port's drive, shared by the NXT and EV3 bricks (hubs/nxt/, hubs/ev3/;
// docs/ROBOT-LAB-EV3-NXT.md "Motor control"). Both firmwares offer the same three kinds of
// drive, which is all this module does:
//
//   open      an unregulated power: duty = power / 100 into the motor's DC model, the H-bridge
//             shorting the winding in the off phase (NXT: the BRAKE mode bit, "voltage held
//             between PWM pulses"; EV3: OUTPUT_POWER);
//   regulated a speed the firmware keeps under load (NXT: REGULATION_MODE_MOTOR_SPEED; EV3:
//             OUTPUT_SPEED, "the system will automatically adjust the power to keep the specified
//             speed" — EV3 Firmware Developer Kit §4.9). LEGO does not document either loop, so it is
//             OUR model of one: the Robot Lab's position-tracking speed loop (a reference angle
//             advancing at the asked speed, the PI + damping law of hubs/spike/spike-motor-controller.js
//             turning the tracking error into a duty), the structure Pybricks documents for these
//             motors and the one the Lab's other hubs already validate against the physics;
//   passive   brake (winding shorted) or coast (open).
//
// Plain data in, plain data out: a port's state is exported to the physics worker's mirror.

import {controlStep, freshPortState} from './spike/spike-motor-controller.js';

const DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A port's drive state. angleDeg/measuredDps are the encoder's (written from the physics readings). */
export const freshOutput = () => ({
    angleDeg: 0, measuredDps: 0,
    regulating: false, refDeg: 0, refDps: 0, ctl: freshPortState(),
    duty: 0, decay: 'coast'
});

/** Encoder reading after a physics step. */
export const readEncoder = (st, reading) => {
    st.angleDeg += reading.deltaRad * DEG;
    st.measuredDps = reading.radPerSec * DEG;
};

/** Unregulated: duty = power/100. */
export const driveOpen = (st, power, decay = 'brake') => {
    st.regulating = false;
    st.duty = clamp(power / 100, -1, 1);
    st.decay = decay;
};

/** Passive: the H-bridge's brake or coast, no duty. */
export const drivePassive = (st, decay) => {
    st.regulating = false;
    st.duty = 0;
    st.decay = decay === 'coast' ? 'coast' : 'brake';
};

/**
 * Regulated speed for the step of dtMs: the reference picks the shaft up where it is when
 * regulation starts, then advances at targetDps (ramped at accelDps2; Infinity: at once).
 * @returns {{saturated: boolean}}
 */
export const driveRegulated = (st, targetDps, motor, dtMs, accelDps2 = Infinity) => {
    if (!st.regulating) {
        st.regulating = true;
        st.ctl = freshPortState();
        st.refDeg = st.angleDeg;
        st.refDps = st.measuredDps;
    }
    const step = accelDps2 * dtMs / 1000;
    st.refDps += clamp(targetDps - st.refDps, -step, step);
    st.refDeg += st.refDps * dtMs / 1000;
    const out = controlStep(st.ctl, {refDeg: st.refDeg, refDps: st.refDps, posDeg: st.angleDeg, speedDps: st.measuredDps}, motor, dtMs);
    st.refDeg = out.refDeg;
    st.duty = out.duty;
    st.decay = 'brake';
    return {saturated: out.saturated};
};

/** Hold an angle (the regulated loop with a fixed reference). */
export const driveHold = (st, holdDeg, motor, dtMs) => {
    if (!st.regulating) {
        st.regulating = true;
        st.ctl = freshPortState();
    }
    st.refDeg = holdDeg;
    st.refDps = 0;
    const out = controlStep(st.ctl, {refDeg: holdDeg, refDps: 0, posDeg: st.angleDeg, speedDps: st.measuredDps}, motor, dtMs);
    st.duty = out.duty;
    st.decay = 'brake';
};

/** A copy for exportState. */
export const copyOutput = st => ({...st, ctl: {...st.ctl}});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Port drives → motorised joints (docs/ROBOT-LAB-ARCHITECTURE.md §5.2 "How a
// motor maps to physics"). A drive is plain data from a hub's port
// (hubs/hub-profile.js PortDrive); this module is the only place it becomes
// a physics command, so the core never learns which hub or route asked.
//
//   servo  hinge motor in Velocity mode at radPerSec, clamped to the motor's
//          top speed, torque limited by its stall torque (the hinge's
//          motor limits, set by the core from the joint's `motor`). This is
//          exactly the command SimHubBridge issued before R1 — bit-identical.
//   pwm    R1 STAND-IN for the DC-motor model R3 builds: the no-load speed a
//          DC motor reaches at that duty, u·ω0 (ω0 = the motor's top speed),
//          as a velocity target under the same stall-torque limit. It gives
//          the right speed when the load is light and the right stall torque
//          when blocked, but not the torque–speed line in between
//          (τ = τs·(u − ω/ω0)) nor back-EMF braking; R3 replaces this branch,
//          the drive data stays. duty 0: decay 'brake' holds, 'coast' frees.
//   coast  motor off (free-wheeling); brake: held at zero speed.
//   lamp, valve: no physical actuator yet (R3/R12) — ignored here.

/** Drive modes that act on a motorised joint. */
const JOINT_MODES = new Set(['servo', 'pwm', 'coast', 'brake']);

/**
 * Applies one port drive to its motorised hinge.
 * @param {object} core a physics core (jolt-core.js)
 * @param {string} jointId the motorised hinge the port is bound to
 * @param {object} drive a PortDrive
 * @param {{maxSpeedRadPerSec: number}} motor the joint's `motor` (CompiledMechanism)
 * @returns {boolean} whether the drive moved a joint
 */
export const applyDrive = (core, jointId, drive, motor) => {
    if (!drive || !JOINT_MODES.has(drive.mode)) return false;
    switch (drive.mode) {
        case 'servo':
            core.setMotor(jointId, {mode: 'velocity', radPerSec: drive.radPerSec});
            return true;
        case 'pwm': {
            const duty = Math.max(-1, Math.min(1, Number(drive.duty) || 0));
            if (duty === 0) core.setMotor(jointId, {mode: drive.decay === 'coast' ? 'coast' : 'brake'});
            else core.setMotor(jointId, {mode: 'velocity', radPerSec: duty * motor.maxSpeedRadPerSec});
            return true;
        }
        default:
            core.setMotor(jointId, {mode: drive.mode});
            return true;
    }
};

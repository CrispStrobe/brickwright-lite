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
//   pwm    the DC-motor model (§5.2; devices/dc-motors.js has the numbers
//          and their sources): the H-bridge puts u = duty·V_supply/V_nominal
//          across the winding (duty clamped to ±1; u is NOT clamped: a 9 V
//          port runs a motor rated at 7.2 V 25 % faster and stronger, as the
//          real motor does — LEGO rates these motors for 5–9 V), and the output shaft's torque is the
//          motor's torque–speed line
//              τ = τs·(u − ω/ω0) = τs·u − (τs/ω0)·ω
//          applied ON THE HINGE (drive torque on the output, reaction on the
//          housing), not as a velocity target. The −(τs/ω0)·ω part is back-EMF
//          damping; the core solves it implicitly (jolt-core.js `torque` mode:
//          ω is the speed at the end of the step), so the drive is stable at
//          the 5 ms step for any load inertia — an explicit τ(ω_n) held over
//          the step oscillates once (τs/ω0)·dt/I > 2, which a bare SPIKE
//          motor output (I ~ 1e-6 kg·m², τs/ω0 ≈ 0.009 N·m·s) exceeds 20-fold.
//          Decay at duty 0: 'brake' shorts the winding (u = 0: only the
//          back-EMF damping τ = −τs·ω/ω0 remains), 'coast' opens it (no
//          electrical torque; only the gearbox friction, frictionTorqueNm).
//          While driven the gearbox losses are inside the line (it is fitted
//          to the published no-load and stall points at the output). The
//          rotor's inertia reflected through the gearbox (rotorInertiaKgM2)
//          is given to the hinge's bodies once, when the hub is plugged
//          (attachMotor; jolt-core.js setRotorInertia says how).
//   coast  motor off (free-wheeling); brake: held at zero speed (the ideal
//          servo's brake — a test fixture, as `servo` is since D5).
//   lamp, valve: no physical actuator yet (R3/R12) — ignored here.

import {dcMotorFor} from '../devices/dc-motors.js';

/** Drive modes that act on a motorised joint. */
const JOINT_MODES = new Set(['servo', 'pwm', 'coast', 'brake']);

/**
 * The hinge command of a DC motor at a duty (the `pwm` drive's physics).
 * @param {object} device a DeviceModel with `motor` (devices/dc-motors.js)
 * @param {number} duty −1..1
 * @param {'brake'|'coast'} decay
 * @param {number} [supplyVolts] the port's supply (default: the motor's nominal voltage)
 */
export const dcMotorCommand = (device, duty, decay, supplyVolts) => {
    const spec = device.motor;
    const volts = Number(supplyVolts) > 0 ? Number(supplyVolts) : spec.nominalVolts;
    const d = Math.max(-1, Math.min(1, Number(duty) || 0));
    const u = d * volts / spec.nominalVolts;
    if (u === 0 && decay === 'coast') return {mode: 'coast', frictionNm: spec.frictionTorqueNm || 0};
    return {mode: 'torque', torqueNm: spec.stallTorqueNm * u, dampingNmsPerRad: spec.stallTorqueNm / spec.noLoadRadPerSec};
};

/**
 * What a motor brings to its hinge besides its drives: its rotor's reflected inertia.
 * Called once when the motor is bound to a port (hub-bridge.js).
 * @param {object} core a physics core
 * @param {string} jointId the motorised hinge
 * @param {object} device the motor's DeviceModel
 */
export const attachMotor = (core, jointId, device) => {
    const inertia = device && device.motor && device.motor.rotorInertiaKgM2;
    if (inertia > 0) core.setRotorInertia(jointId, inertia);
};

/**
 * Applies one port drive to its motorised hinge.
 * @param {object} core a physics core (jolt-core.js)
 * @param {string} jointId the motorised hinge the port is bound to
 * @param {object} drive a PortDrive
 * @param {{maxSpeedRadPerSec: number, maxTorqueNm: number, deviceId?: number}} motor the joint's `motor` (CompiledMechanism)
 * @param {{device?: object, supplyVolts?: number}} [port] the motor's DeviceModel (default: by its
 *        device id, devices/dc-motors.js) and the port's supply voltage (hub profile)
 * @returns {boolean} whether the drive moved a joint
 */
export const applyDrive = (core, jointId, drive, motor, {device = null, supplyVolts} = {}) => {
    if (!drive || !JOINT_MODES.has(drive.mode)) return false;
    switch (drive.mode) {
        case 'servo':
            core.setMotor(jointId, {mode: 'velocity', radPerSec: drive.radPerSec});
            return true;
        case 'pwm':
            core.setMotor(jointId, dcMotorCommand(device || dcMotorFor(motor), drive.duty, drive.decay, supplyVolts));
            return true;
        default:
            core.setMotor(jointId, {mode: drive.mode});
            return true;
    }
};

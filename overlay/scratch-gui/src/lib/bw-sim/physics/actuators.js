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
//   pwm    the DC-motor model (§5.2; devices/catalog.js has the numbers,
//          fitted to Philo's measurements, and their sources): the H-bridge
//          puts duty·V_supply across the winding (duty clamped to ±1), and the
//          output shaft's torque is the motor's torque–speed line AT THAT
//          SUPPLY (catalog.js dcLineAt: τs(V) = k_t·(V/R − i0), ω0(V) =
//          (V − R·i0)/k_e — a 9 V port runs a SPIKE motor 30 % stronger and
//          faster than its hub's 7.2 V, as the real motor does)
//              τ = duty·τs(V) − (τs/ω0)·ω
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
//          While driven the gearbox friction τf = k_t·i0 is inside the line
//          and scales with |duty| (exact at duty ±1 and 0; at duty 0.5 the
//          model is τf/2 stronger than a motor whose friction is a constant
//          Coulomb drag — for the SPIKE medium motor 9 mN·m, which the hub's
//          speed loop absorbs). The slope τs/ω0 = k_t·k_e/R is the same at
//          every supply voltage. The
//          rotor's inertia reflected through the gearbox (rotorInertiaKgM2)
//          is given to the hinge's bodies once, when the hub is plugged
//          (attachMotor; jolt-core.js setRotorInertia says how).
//   coast  motor off (free-wheeling); brake: held at zero speed (the ideal
//          servo's brake — a test fixture, as `servo` is since D5).
//   lamp, valve: no physical actuator yet (R3/R12) — ignored here.

import {dcMotorFor} from '../devices/dc-motors.js';
import {dcLineAt} from '../devices/catalog.js';

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
    const d = Math.max(-1, Math.min(1, Number(duty) || 0));
    if (d === 0 && decay === 'coast') return {mode: 'coast', frictionNm: spec.frictionTorqueNm || 0};
    const line = dcLineAt(spec, supplyVolts);
    return {mode: 'torque', torqueNm: line.stallTorqueNm * d, dampingNmsPerRad: line.dampingNmsPerRad};
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
 * @param {{maxSpeedRadPerSec: number, maxTorqueNm: number, device?: string|null, ids?: {lpf2?: number}}} motor the hinge's actuator (CompiledMechanism v2 `actuators[]`)
 * @param {{device?: object, supplyVolts?: number}} [port] the motor's DeviceModel (default: its
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

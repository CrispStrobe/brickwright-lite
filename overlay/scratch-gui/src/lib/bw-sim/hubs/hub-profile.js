// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The ONE boundary between the Robot Lab's physics and every hub and program
// route (docs/ROBOT-LAB-ARCHITECTURE.md §3, §5.1). A hub family is described
// by a HubProfile (pure data) and driven through a VirtualHub (an adapter
// around that family's own state and controller). The physics side
// (hub-bridge.js's SimHubBridge, the worker's replay) never sees anything
// else: per 5 ms step it asks every hub for its port DRIVES and hands back
// port READINGS and the hub body's POSE, all plain structured-clone-safe data.
//
// Why a boundary at the port: the routes that program LEGO hubs meet the hub
// at very different levels — SPIKE's Scratch extension calls a JS motor
// controller, an RCX program runs as bytecode in a VM, a SPIKE firmware runs
// in an emulator and drives an H-bridge. What all of them have in common is
// the real hardware's: a port that is told to drive (a speed, or a PWM duty)
// and that reports back (an encoder, a sensor value). So that is all that
// crosses, and a new hub is a profile plus one adapter, never an edit to the
// physics or the bridge.
//
// This module holds the typedefs (JSDoc, as the rest of bw-sim does) and the
// profile validator. It imports nothing: physics, compiler and hubs may all
// read it.

/**
 * Static description of a hub family. Pure data, registered in the hub
 * registry (registry/hubs.js) with the adapter that implements it.
 * @typedef {object} HubProfile
 * @property {string} id                 'spike-prime', 'rcx', 'ev3', … (docs §5.1 lists the planned ids)
 * @property {{en: string, de: string}} name
 * @property {string[]} parts            LDraw files of the hub's body ('45601.dat', …)
 * @property {PortSpec[]} ports          exactly the ids programs use, in the hub's own order
 * @property {InternalDevice[]} internalDevices  IMU, lights, matrix, internal motors (Boost A/B)
 * @property {{controllerStepMs: number, sensorPeriodMs?: number}} clock
 *           the firmware's control period; the physics step (5 ms) must equal or divide it
 * @property {'servo'|'pwm'} drive       the drive level the hub's ports accept from its route (§0.2)
 * @property {string[]} routes           program routes that can bind to this hub (route registry ids)
 */

/**
 * @typedef {object} PortSpec
 * @property {string} id                 'A', '1', '0', 'red' — what programs call it
 * @property {{en: string, de: string}} label
 * @property {string} kind               'lpf2' | 'output' | 'input' | 'rcx-output' | 'rcx-input' | … (§5.1)
 * @property {string[]} accepts          device classes the port takes (DEVICE_CLASSES)
 * @property {number} supplyVolts        what a DC-motor model scales a duty by
 * @property {number} [pwmLevels]        8 for RCX, 7 for PF; absent = continuous
 * @property {'lpf2-id'|'ev3-autoid'|'resistor-id'|'none'} identifies
 */

/** @typedef {{device: string, port: string, body: 'hub'}} InternalDevice */

/**
 * What the compiled model plugs into a port (the bridge derives these from
 * CompiledMechanism v2's actuators and devices, hub-bridge.js hubBindings). It
 * carries the identity the hub REPORTS for the device (`ids`) beside the
 * device's id (devices/catalog.js), so an adapter needs no device catalogue.
 * @typedef {object} PortBinding
 * @property {string} port
 * @property {'motor'|'sensor'} class
 * @property {{lpf2?: number}} ids       e.g. {lpf2: 49} for the SPIKE large motor; {} = the hub's default
 * @property {string} [sensor]           for class 'sensor': the v1 sensor kind ('color', 'distance', 'force')
 * @property {string|null} [hub]         the hub the mechanism binds it to (null: the scene's first hub)
 * @property {string|null} [device]      the DeviceModel id (null: a v1 motor that names no catalogue device)
 * @property {object} [dcMotor]          for class 'motor': the DC model physics drives (devices/dc-motors.js),
 *                                       so a hub's controller can regulate the same motor
 */

/**
 * What an actuator port is told to do during one physics step (zero-order hold).
 *   servo — an ideal speed servo: the hub's JS controller already decided the
 *           shaft speed (SPIKE before owner decision D5; now a test fixture). Torque limited by the motor's stall torque.
 *   pwm   — a duty cycle into a DC motor (unregulated hubs, emulated firmwares,
 *           and SPIKE after owner decision D5). decay: what the H-bridge does in
 *           the off phase / at duty 0: short the winding (brake) or float (coast).
 *   coast / brake — the port is off: free-wheeling, or held.
 *   lamp / valve  — non-motor outputs (no physics actuator before R3/R12).
 * @typedef {{port: string, mode: 'servo', radPerSec: number}
 *         | {port: string, mode: 'pwm', duty: number, decay: 'brake'|'coast'}
 *         | {port: string, mode: 'coast'} | {port: string, mode: 'brake'}
 *         | {port: string, mode: 'lamp', level: number}
 *         | {port: string, mode: 'valve', position: -1|0|1}} PortDrive
 */

/**
 * What a port reports after a step.
 *   encoder — a motor shaft. angleRad: the hinge's unwrapped angle; deltaRad: its
 *             change over THIS step (what an incremental encoder counts, so a hub
 *             whose program resets its count keeps its own base); radPerSec: the
 *             measured shaft speed.
 *   probe   — a sensor. R1 note: until the device registry exists, `device` is the
 *             v1 sensor kind and `raw` is sensors.js's measurement for it, already
 *             in the v1 (SPIKE) units; the adapter only labels it for its hub.
 * @typedef {{port: string, kind: 'encoder', angleRad: number, deltaRad: number, radPerSec: number}
 *         | {port: string, kind: 'probe', device: string, raw: object}} PortReading
 */

/**
 * The hub body's motion after a step (world frame, SI units). quat/angVel/linAcc/
 * gravity are absent when the pose could not be read; the adapter then keeps its
 * IMU as it was.
 * @typedef {object} HubPoseReading
 * @property {number} headingDeg         clockwise seen from above, continuous (unwrapped), 0 at plug
 * @property {number} rateDegPerSec      its rate over the step
 * @property {number[]} [quat]           [x, y, z, w]
 * @property {number[]} [angVel]         rad/s
 * @property {number[]} [linAcc]         m/s², without gravity ((v - v_prev) / dt; zero on the first step)
 * @property {number[]} [gravity]        m/s² (the mechanism's)
 */

/**
 * The runtime boundary, implemented once per hub family (SPIKE:
 * hubs/spike/spike-virtual-hub.js). The bridge calls, per physics step:
 *   1. advanceTo(t)      the route runs up to t, the END of the step about to be
 *                        simulated: it decides what to drive during that step
 *   2. readDrives()      one PortDrive per bound actuator port
 *   3. (physics steps)
 *   4. writeReadings(r, pose)  encoders, sensors, IMU of the state after the step
 * and publish() once per batch of steps. Nothing else crosses; everything is
 * synchronous (a route with async work runs it between batches).
 *
 * @typedef {object} VirtualHub
 * @property {HubProfile} profile
 * @property {string} id                 the hub's placed-part id in the model
 * @property {(bindings: PortBinding[]) => {severity: string, code: string, message: string}[]} plug
 *           takes the clock (refuses self-advancement while plugged) and returns refusals
 * @property {(tMs: number) => void} advanceTo
 * @property {() => PortDrive[]} readDrives
 * @property {(readings: PortReading[], pose?: HubPoseReading) => void} writeReadings
 * @property {() => void} publish        one notification to the UI/VM
 * @property {() => unknown} exportState everything the route + controller need to redo a batch
 * @property {(state: unknown) => void} importState
 * @property {(state: unknown) => string} stateKey   equal keys ⇒ identical drives from here on
 * @property {() => void} dispose        hands the clock back
 */

/** Device classes a port can accept (docs §5.1). */
export const DEVICE_CLASSES = Object.freeze(['motor', 'servo-motor', 'linear-actuator', 'lamp', 'sensor-passive',
    'sensor-active', 'sensor-digital', 'sensor-lpf2', 'pneumatic-valve-actuator']);

/** The modes a PortDrive can have. */
export const DRIVE_MODES = Object.freeze(['servo', 'pwm', 'coast', 'brake', 'lamp', 'valve']);

const IDENTIFIES = ['lpf2-id', 'ev3-autoid', 'resistor-id', 'none'];
const isLabel = l => Boolean(l) && typeof l.en === 'string' && l.en !== '' && typeof l.de === 'string' && l.de !== '';

/**
 * Checks a HubProfile's shape. Returns the problems (empty when valid), as the
 * other bw-sim validators do (contracts.js).
 * @param {HubProfile} profile
 * @returns {string[]}
 */
export const validateHubProfile = profile => {
    const out = [];
    if (!profile || typeof profile !== 'object') return ['profile: not an object'];
    const p = typeof profile.id === 'string' && profile.id ? profile.id : '(no id)';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(profile.id || '')) out.push(`${p}.id: lower-case words joined by '-'`);
    if (!isLabel(profile.name)) out.push(`${p}.name: needs {en, de}`);
    if (!Array.isArray(profile.parts)) out.push(`${p}.parts: a list of LDraw files`);
    if (!Array.isArray(profile.ports) || profile.ports.length === 0) out.push(`${p}.ports: at least one port`);
    const seen = new Set();
    for (const [i, port] of (Array.isArray(profile.ports) ? profile.ports : []).entries()) {
        const q = `${p}.ports[${i}]`;
        if (!port || typeof port.id !== 'string' || port.id === '') { out.push(`${q}.id: a non-empty string`); continue; }
        if (seen.has(port.id)) out.push(`${q}.id: '${port.id}' twice`);
        seen.add(port.id);
        if (!isLabel(port.label)) out.push(`${q}.label: needs {en, de}`);
        if (typeof port.kind !== 'string' || port.kind === '') out.push(`${q}.kind: a port kind`);
        if (!Array.isArray(port.accepts) || port.accepts.some(c => !DEVICE_CLASSES.includes(c))) {
            out.push(`${q}.accepts: device classes from ${DEVICE_CLASSES.join('|')}`);
        }
        if (!(Number(port.supplyVolts) > 0)) out.push(`${q}.supplyVolts: a positive number`);
        if (port.pwmLevels !== undefined && !(Number.isInteger(port.pwmLevels) && port.pwmLevels > 1)) {
            out.push(`${q}.pwmLevels: an integer > 1, or absent for continuous`);
        }
        if (!IDENTIFIES.includes(port.identifies)) out.push(`${q}.identifies: one of ${IDENTIFIES.join('|')}`);
    }
    if (!Array.isArray(profile.internalDevices)) out.push(`${p}.internalDevices: a list`);
    if (!profile.clock || !(Number(profile.clock.controllerStepMs) > 0)) out.push(`${p}.clock.controllerStepMs: a positive number`);
    if (!['servo', 'pwm'].includes(profile.drive)) out.push(`${p}.drive: 'servo' or 'pwm'`);
    if (!Array.isArray(profile.routes)) out.push(`${p}.routes: a list of route ids`);
    return out;
};

/** The profile's port ids, in its order. */
export const portIds = profile => profile.ports.map(port => port.id);

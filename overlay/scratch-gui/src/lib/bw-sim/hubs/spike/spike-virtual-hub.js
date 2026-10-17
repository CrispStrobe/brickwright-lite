// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The SPIKE Prime hub behind the Robot Lab's port boundary: a VirtualHub
// (hubs/hub-profile.js; docs/ROBOT-LAB-ARCHITECTURE.md §5.1) around the
// UNCHANGED VirtualSpikeHubState and its motor controller
// (spike-sim/independent-backend.js). Everything SPIKE-specific the Sim Lab
// bridge used to know lives here now — port letters as indices into the
// hub's arrays, LPF2 device ids, the controller's commanded °/s, encoder
// positions in degrees, the SPIKE IMU's axes and units, the clock owner —
// and the bridge (hub-bridge.js) only moves PortDrive/PortReading data.
//
// Drive (owner decision D5): the ports take `pwm` drives. The hub's
// controller is the trajectory generator in spike-sim/independent-backend.js
// (unchanged, shared with the SPIKE arena) plus a feedback loop that turns
// the reference into a duty from the physics encoder
// (spike-motor-controller.js, which documents the structure). Per step:
//
//   advanceTo(t)   per driven port: the measured encoder position (a
//                  program may have reset it since the last step: the
//                  reference moves with it), then the trajectory generator
//                  steps ON THE REFERENCE ANGLE (hubState.stepMotors(dt) with
//                  data.motors[i].position = θr), the measured position is put
//                  back for the program, and the feedback loop decides the
//                  duty for the step from θr, ωr and the measured θ, ω
//                  (one step of reading latency, as on the hub);
//   readDrives()   that duty as a `pwm` drive, or the stop action's passive
//                  H-bridge state (brake: winding shorted, coast: open);
//   writeReadings  the hinge's MEASURED rotation: position = base + Δangle·180/π,
//                  measuredDegPerSec; heading → IMU yaw, the pose →
//                  pitch/roll/faceUp/rates/acceleration (sensors.js
//                  imuFromPose), sensor probes → updateSensor with their LPF2
//                  ids; publish() is one hubState.changed().
//
// A position command (run for degrees, run to position) completes when the
// reference has arrived AND the shaft is within POSITION_TOLERANCE_DEG of
// the target and slower than SPEED_TOLERANCE_DPS (the backend's
// positionSettled hook), as a real motor's does; a blocked shaft is reported
// stalled to the generator (its load input) and ends as 'stalled'.
//
// The ideal servo (drive: 'servo', the pre-D5 behaviour: the controller's
// commanded °/s as a velocity target) stays as a test fixture.
//
// Signs. A hinge's angle is body2 relative to body1 about the joint axis
// (contracts.js); the compiler takes a motor's axis from its output
// connector, which the part metadata points INTO the motor from its face —
// so a positive hinge angle is clockwise seen from the motor's face, SPIKE's
// own sign. Degrees = radians · 180/π, nothing else.

import VirtualSpikeHubState from '../../../virtual-hub/spike-hub-state.js';
import {SENSOR_DEVICE, imuFromPose} from '../../sensors.js';
import {SPIKE_PRIME_PROFILE} from './profile.js';
import {dcMotorFor} from '../../devices/dc-motors.js';
import {controlStep, freshPortState, STALL_DPS, STALL_MS} from './spike-motor-controller.js';

const DEG = 180 / Math.PI;

/** LEGO device id the hub reports for a motor port when the part does not say (SPIKE medium angular motor). */
const MEDIUM_MOTOR = 48;

/** A position command ends when the shaft is this close to the target (°)... */
export const POSITION_TOLERANCE_DEG = 1;
/** ...and slower than this (°/s). */
export const SPEED_TOLERANCE_DPS = 30;

/** Trajectory modes in which the feedback loop drives the motor; any other is a passive stop. */
const ACTIVE = new Set(['speed', 'time', 'position', 'hold']);

export class SpikeVirtualHub {
    /**
     * @param {object} [options]
     * @param {object} [options.hubState] the VirtualSpikeHubState to drive (shared with the arena and
     *        the program routes); a fresh one when absent (the worker's mirror)
     * @param {string} [options.id] the hub's placed-part id
     * @param {object} [options.profile] a SPIKE-family profile (default SPIKE Prime)
     * @param {'pwm'|'servo'} [options.drive] the profile's (pwm); 'servo' is the pre-D5 ideal
     *        servo, kept as a test fixture
     */
    constructor ({hubState = null, id = 'hub', profile = SPIKE_PRIME_PROFILE, drive = profile.drive} = {}) {
        this.hubState = hubState || new VirtualSpikeHubState();
        this.id = id;
        this.profile = profile;
        this.ports = profile.ports.map(p => p.id);
        /** port id -> index into the hub's arrays, for the ports a motor is plugged into */
        this.motorPorts = new Map();
        /** port index -> encoder position (degrees) at the start of the step being simulated */
        this.base = new Map();
        /** The route's time: the end of the last step the controller ran (ms since plug). */
        this.timeMs = 0;
        this.previousOwner = null;
        this.plugged = false;
        this.drive = drive;
        /** port index -> DeviceModel of the plugged motor (its DC spec feeds the controller) */
        this.devices = new Map();
        /**
         * port index -> the feedback loop's state: controller state (spike-motor-controller.js)
         * + refDeg (θr), measuredDeg (θ at the step's start), lastWritten (the position the
         * last reading wrote: a different value at the next step is a program's reset),
         * passive (the stop action that applies when no command runs), stalled, and the
         * drive chosen for the step.
         */
        this.dc = new Map();
        this.previousSettled = null;
    }

    /**
     * Plug the model's motors into the hub, as the arena's bridge does for its driving
     * base: the extension sees a motor on each driven port, at position 0; the hub's
     * motor clock becomes 'native' (stepped by whoever steps the scene).
     * @param {import('../hub-profile.js').PortBinding[]} bindings
     */
    plug (bindings) {
        const diagnostics = [];
        const hubState = this.hubState;
        for (const b of bindings) {
            const index = this.ports.indexOf(b.port);
            if (index < 0) {
                diagnostics.push({severity: 'error', code: 'port-unknown',
                    message: `${this.profile.name.en} has no port '${b.port}' (ports ${this.ports.join(', ')})`});
                continue;
            }
            if (b.class !== 'motor') continue;
            this.motorPorts.set(b.port, index);
            const deviceId = b.ids?.lpf2 ?? MEDIUM_MOTOR;
            hubState.data.sensors[index] = {kind: 'motor', deviceId};
            this.devices.set(index, b.dcMotor || dcMotorFor({device: b.device ?? null, ids: {lpf2: deviceId}}));
            this.dc.set(index, {...freshPortState(), refDeg: 0, measuredDeg: 0, lastWritten: null,
                passive: 'brake', stalled: false, duty: 0, decay: 'brake'});
            hubState.motors.resetPosition(b.port, 0);
            hubState.motors.stop(b.port);
        }
        hubState.motorPairDefined = false;
        this.previousOwner = hubState.clockOwner;
        hubState.clockOwner = 'native';
        hubState.resetHeading(0);
        this.timeMs = 0;
        this.plugged = true;
        if (this.drive === 'pwm') {
            this.previousSettled = hubState.backend.positionSettled;
            hubState.backend.positionSettled = index => this._onTarget(index);
        }
        return diagnostics;
    }

    /** The backend's positionSettled hook: is the SHAFT on the target? */
    _onTarget (index) {
        const st = this.dc.get(index);
        if (!st) return true;
        const c = this.hubState.backend._controllers[index];
        const speed = Number(this.hubState.data.motors[index].measuredDegPerSec) || 0;
        return Math.abs(st.measuredDeg - c.target) <= POSITION_TOLERANCE_DEG && Math.abs(speed) <= SPEED_TOLERANCE_DPS;
    }

    /** The controller runs up to tMs (the end of the step about to be simulated). */
    advanceTo (tMs) {
        const data = this.hubState.data.motors;
        for (const index of this.motorPorts.values()) this.base.set(index, Number(data[index].position) || 0);
        const dt = tMs - this.timeMs;
        this.timeMs = tMs;
        if (this.drive !== 'pwm') {
            if (dt > 0) this.hubState.stepMotors(dt);
            return;
        }
        const backend = this.hubState.backend;
        // The trajectory generator steps on the reference angle.
        for (const index of this.motorPorts.values()) {
            const st = this.dc.get(index);
            const m = data[index];
            const c = backend._controllers[index];
            const measured = Number(m.position) || 0;
            if (st.lastWritten !== null && measured !== st.lastWritten) st.refDeg += measured - st.lastWritten;
            st.measuredDeg = measured;
            if (ACTIVE.has(c.mode) && !st.active) {
                // A command starts from a passive motor: the trajectory starts at the shaft.
                st.active = true;
                st.integral = 0;
                st.stallMs = 0;
                st.refDeg = measured;
                if (c.mode !== 'hold') m.degPerSec = Number(m.measuredDegPerSec) || 0;
            }
            if (!st.active) st.refDeg = measured;
            if (c.mode === 'stop') st.passive = c.action;
            m.position = st.refDeg;
        }
        if (dt > 0) this.hubState.stepMotors(dt);
        for (const index of this.motorPorts.values()) {
            const st = this.dc.get(index);
            const m = data[index];
            const c = backend._controllers[index];
            const refDeg = m.position;
            const refDps = Number(m.degPerSec) || 0;
            m.position = st.measuredDeg;
            if (c.mode === 'stop') st.passive = c.action;
            if (!ACTIVE.has(c.mode)) {
                // Stopped: the H-bridge's passive state, no feedback.
                st.active = false;
                st.integral = 0;
                st.refDeg = st.measuredDeg;
                this._setStalled(index, st, false);
                st.duty = 0;
                st.decay = st.passive === 'coast' ? 'coast' : 'brake';
                continue;
            }
            st.passive = c.defaultStopAction;
            const speedDps = Number(m.measuredDegPerSec) || 0;
            const out = controlStep(st, {refDeg, refDps, posDeg: st.measuredDeg, speedDps},
                this.devices.get(index).motor, dt);
            st.refDeg = out.refDeg;
            st.duty = out.duty;
            st.decay = 'brake';
            // Stall: pushing with everything and not moving.
            if (out.saturated && Math.abs(speedDps) < STALL_DPS) st.stallMs += dt;
            else st.stallMs = 0;
            if (st.stallMs >= STALL_MS) this._setStalled(index, st, true);
            else if (st.stalled && Math.abs(speedDps) >= STALL_DPS) this._setStalled(index, st, false);
        }
    }

    /** Reports a physical stall to the trajectory generator (its environment-load input). */
    _setStalled (index, st, stalled) {
        if (st.stalled === stalled) return;
        st.stalled = stalled;
        this.hubState.backend.setArenaLoad(index, stalled ? 1 : 0);
    }

    /** Per driven port: the duty the controller chose (pwm), or the commanded speed (servo fixture). */
    readDrives () {
        const data = this.hubState.data.motors;
        const drives = [];
        for (const [port, index] of this.motorPorts) {
            if (this.drive === 'pwm') {
                const st = this.dc.get(index);
                drives.push({port, mode: 'pwm', duty: st.duty, decay: st.decay});
                continue;
            }
            // Servo fixture: zero commanded velocity holds the shaft (brake); coast is not modelled.
            const degPerSec = Number(data[index].degPerSec) || 0;
            drives.push({port, mode: 'servo', radPerSec: degPerSec / DEG});
        }
        return drives;
    }

    /** Encoders, heading and IMU, sensors — in that order, without notifying (publish() does). */
    writeReadings (readings, pose = null) {
        const hubState = this.hubState;
        const data = hubState.data.motors;
        for (const r of readings) {
            if (r.kind !== 'encoder') continue;
            const index = this.motorPorts.get(r.port);
            if (index === undefined) continue;
            data[index].position = this.base.get(index) + r.deltaRad * DEG;
            data[index].measuredDegPerSec = r.radPerSec * DEG;
            const st = this.drive === 'pwm' && this.dc.get(index);
            if (st) {
                // The hub's port report (classicPorts) carries the measured angle, not the reference.
                st.lastWritten = data[index].position;
                hubState.backend._publish(index);
            }
        }
        if (pose) {
            hubState.setHeading(pose.headingDeg, {rate: pose.rateDegPerSec});
            if (pose.quat) {
                const {pitch, roll, angularVelocity, acceleration, faceUp} =
                    imuFromPose(pose.quat, pose.angVel, pose.linAcc, pose.gravity);
                const imu = hubState.data.imu;
                imu.pitch = pitch;
                imu.roll = roll;
                imu.angularVelocity = angularVelocity;
                imu.acceleration = acceleration;
                imu.faceUp = faceUp;
            }
        }
        for (const r of readings) {
            if (r.kind !== 'probe') continue;
            hubState.updateSensor(r.port, r.device, {deviceId: SENSOR_DEVICE[r.device], ...r.raw});
        }
    }

    publish () {
        this.hubState.changed();
    }

    /**
     * Everything the motor controller reads when it steps, as plain data (structured-clone
     * safe: the controllers' promise resolvers are left out — they decide nothing about
     * the motion), and the route's time.
     */
    exportState () {
        const hubState = this.hubState;
        const backend = hubState.backend;
        return {
            timeMs: this.timeMs,
            clockOwner: hubState.clockOwner,
            simulatedMs: backend.simulatedMs,
            remainder: backend._remainder,
            disposed: backend._disposed,
            controllers: backend._controllers.map(({resolve, ...c}) => structuredClone(c)),
            motors: structuredClone(hubState.data.motors),
            sensors: structuredClone(hubState.data.sensors),
            classicPorts: structuredClone(hubState.data.classicPorts),
            dc: [...this.dc].map(([index, st]) => [index, {...st}])
        };
    }

    /** Puts an exported state into this hub (the worker's mirror), in place. */
    importState (state) {
        const hubState = this.hubState;
        const backend = hubState.backend;
        this.timeMs = state.timeMs;
        hubState.clockOwner = state.clockOwner;
        backend.simulatedMs = state.simulatedMs;
        backend._remainder = state.remainder;
        backend._disposed = state.disposed;
        state.controllers.forEach((c, i) => {
            backend._controllers[i] = {...structuredClone(c), resolve: null};
        });
        const data = hubState.data;
        for (let i = 0; i < this.ports.length; i++) {
            data.motors[i] = structuredClone(state.motors[i]);
            data.sensors[i] = structuredClone(state.sensors[i]);
            data.classicPorts[i] = structuredClone(state.classicPorts[i]);
        }
        for (const [index, st] of state.dc || []) this.dc.set(index, {...st});
    }

    /** Equal keys step the controller identically. */
    stateKey (state) {
        return JSON.stringify(state);
    }

    /** Hand the clock back (sensor/motor authority returns to whoever had it). */
    dispose () {
        if (!this.plugged) return;
        this.hubState.clockOwner = this.previousOwner;
        if (this.drive === 'pwm') {
            const backend = this.hubState.backend;
            for (const [index, st] of this.dc) if (st.stalled) backend.setArenaLoad(index, 0);
            backend.positionSettled = this.previousSettled;
        }
        this.plugged = false;
    }
}

/** The hub registry's entry for SPIKE Prime (registry/hubs.js). */
export const spikePrimeHub = Object.freeze({
    profile: SPIKE_PRIME_PROFILE,
    createVirtualHub: options => new SpikeVirtualHub({...options, profile: SPIKE_PRIME_PROFILE})
});

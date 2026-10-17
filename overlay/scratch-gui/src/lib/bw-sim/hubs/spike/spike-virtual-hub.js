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
// It is a refactor, not a new model: with the same physics every step
// writes the same numbers into the hub as before, to the last bit
// (test/bw-sim-physics-worker-session.test.mjs and every bw-sim test that
// drives the base through SimHubBridge). Concretely, per step:
//
//   advanceTo(t)   remember each driven port's encoder position (a program
//                  may have reset it since the last step: it is the new
//                  base), then hubState.stepMotors(t - t_prev) — the hub's own
//                  motor CONTROLLER runs (ramps, holds, run-to-position, stop
//                  actions) and leaves its commanded °/s in data.motors[i];
//   readDrives()   that commanded speed as a `servo` drive (rad/s);
//   writeReadings  the hinge's MEASURED rotation replaces the controller's
//                  kinematic integration: position = base + Δangle·180/π, so
//                  the encoder reads what the wheel did and run-to-position
//                  finishes on the real angle; heading → IMU yaw, the pose →
//                  pitch/roll/faceUp/rates/acceleration (sensors.js
//                  imuFromPose), sensor probes → updateSensor with their LPF2
//                  ids; publish() is one hubState.changed().
//
// Signs. A hinge's angle is body2 relative to body1 about the joint axis
// (contracts.js); the compiler takes a motor's axis from its output
// connector, which the part metadata points INTO the motor from its face —
// so a positive hinge angle is clockwise seen from the motor's face, SPIKE's
// own sign. Degrees = radians · 180/π, nothing else.
//
// Not modelled (as before R1): stall detection from the physical tracking
// error (the controller's stall timer still works from its own load input),
// a coasting stop (a stopped motor brakes: a zero servo speed holds).

import VirtualSpikeHubState from '../../../virtual-hub/spike-hub-state.js';
import {SENSOR_DEVICE, imuFromPose} from '../../sensors.js';
import {SPIKE_PRIME_PROFILE} from './profile.js';

const DEG = 180 / Math.PI;

/** LEGO device id the hub reports for a motor port when the part does not say (SPIKE medium angular motor). */
const MEDIUM_MOTOR = 48;

export class SpikeVirtualHub {
    /**
     * @param {object} [options]
     * @param {object} [options.hubState] the VirtualSpikeHubState to drive (shared with the arena and
     *        the program routes); a fresh one when absent (the worker's mirror)
     * @param {string} [options.id] the hub's placed-part id
     * @param {object} [options.profile] a SPIKE-family profile (default SPIKE Prime)
     */
    constructor ({hubState = null, id = 'hub', profile = SPIKE_PRIME_PROFILE} = {}) {
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
            hubState.data.sensors[index] = {kind: 'motor', deviceId: b.ids?.lpf2 ?? MEDIUM_MOTOR};
            hubState.motors.resetPosition(b.port, 0);
            hubState.motors.stop(b.port);
        }
        hubState.motorPairDefined = false;
        this.previousOwner = hubState.clockOwner;
        hubState.clockOwner = 'native';
        hubState.resetHeading(0);
        this.timeMs = 0;
        this.plugged = true;
        return diagnostics;
    }

    /** The controller runs up to tMs (the end of the step about to be simulated). */
    advanceTo (tMs) {
        const data = this.hubState.data.motors;
        for (const index of this.motorPorts.values()) this.base.set(index, Number(data[index].position) || 0);
        const dt = tMs - this.timeMs;
        this.timeMs = tMs;
        if (dt > 0) this.hubState.stepMotors(dt);
    }

    /** The controller's commanded speed per driven port, as an ideal speed servo. */
    readDrives () {
        const data = this.hubState.data.motors;
        const drives = [];
        for (const [port, index] of this.motorPorts) {
            // Zero commanded velocity holds the shaft (brake); coast is not modelled.
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
            classicPorts: structuredClone(hubState.data.classicPorts)
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
    }

    /** Equal keys step the controller identically. */
    stateKey (state) {
        return JSON.stringify(state);
    }

    /** Hand the clock back (sensor/motor authority returns to whoever had it). */
    dispose () {
        if (!this.plugged) return;
        this.hubState.clockOwner = this.previousOwner;
        this.plugged = false;
    }
}

/** The hub registry's entry for SPIKE Prime (registry/hubs.js). */
export const spikePrimeHub = Object.freeze({
    profile: SPIKE_PRIME_PROFILE,
    createVirtualHub: options => new SpikeVirtualHub({...options, profile: SPIKE_PRIME_PROFILE})
});

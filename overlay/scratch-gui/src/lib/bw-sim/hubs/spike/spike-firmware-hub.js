// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A SPIKE Prime hub whose firmware runs in an emulator (Renode), locked to the
// Robot Lab's physics one 5 ms step at a time — the L3 route of
// docs/ROBOT-LAB-ARCHITECTURE.md §3.2/§3.5 and docs/ROBOT-LAB-SPIKE-EMULATION.md
// §2.4. A VirtualHub (hubs/hub-profile.js) like SpikeVirtualHub, same profile
// (same hardware), but nothing of the hub's controller runs here: the real
// firmware closes its own speed loop on the encoder it is given and drives
// its H-bridges, and this adapter only carries port data across.
//
// Per physics step k, [t_k, t_k+1]:
//   exchange()      ASYNC, before the bridge steps (the in-thread lockstep
//                   runner, routes/renode-lockstep/runner.js, awaits it): the
//                   inputs taken at t_k — every bound motor's shaft (the
//                   PHYSICS hinge angle, this hub's own base, in integer
//                   milli-degrees) and every sensor's value in the LPF2
//                   device's units — go to the emulator, which runs
//                   [t_k, t_k+1] and reports the mean H-bridge drive per port;
//   advanceTo(t)    no work (the emulator already ran the step); checks that
//                   the frame in hand is exchange k and ends at t, else throws;
//   readDrives()    that report as `pwm` drives: duty = mean/10000, decay from
//                   the braking ticks (contract.js driveToPortDrive);
//   writeReadings   records the next step's inputs (Σ deltaRad: the hub never
//                   integrates a motor model of its own — physics owns the shaft);
//   publish()       the hub's UI state (when given one): the PHYSICS encoder
//                   per motor (writeObservedMotor), one changed().
//
// Not rewindable: a Jolt checkpoint cannot rewind the emulator, so
// exportState() says {nonRewindable: true} and SimSession refuses the worker
// for the scene and runs it in-thread, one exchange per step (owner answer
// Q1/D3). importState() throws — nothing ever needs it.
//
// IMU: the contract carries `hub.imuRaw` only for the MicroPython route, and
// its raw scale is not published (plan §5 Q3); NuttX has no IMU input. So no
// IMU crosses yet; the pose is ignored.

import {SPIKE_PRIME_PROFILE} from './profile.js';
import {SENSOR_DEVICE} from '../../sensors.js';
import {writeObservedMotor} from '../../../virtual-hub/motor-telemetry.js';
import {driveToPortDrive, sensorValues, LockstepDesyncError} from '../../routes/renode-lockstep/contract.js';

const DEG = 180 / Math.PI;
const MEDIUM_MOTOR = 48;

/** The route ids an emulated SPIKE hub serves (plan §2.4). */
export const FIRMWARE_ROUTES = Object.freeze(['spike-renode-nuttx', 'spike-renode-micropython']);

/** Owner value while the emulator owns the hub state's motors (the Scratch backend refuses commands). */
export const LOCKSTEP_CLOCK_OWNER = 'renode-lockstep';

export class SpikeFirmwareVirtualHub {
    /**
     * @param {object} options
     * @param {object} options.driver a RenodeLockstepDriver that has begun (its ports are the topology)
     * @param {string} [options.id] the hub's placed-part id
     * @param {object} [options.hubState] a VirtualSpikeHubState to show the hub in the UI (optional)
     * @param {object} [options.profile]
     */
    constructor ({driver, id = 'hub', hubState = null, profile = SPIKE_PRIME_PROFILE}) {
        if (!driver || typeof driver.step !== 'function') throw new TypeError('a firmware hub needs a lockstep driver');
        this.driver = driver;
        this.id = id;
        this.hubState = hubState;
        this.profile = profile;
        this.ports = profile.ports.map(p => p.id);
        /** port -> {angleRad (Σ deltaRad since plug), radPerSec} */
        this.shafts = new Map();
        /** port -> {kind, values} (LPF2 units), the latest probe */
        this.sensors = new Map();
        this.timeMs = 0;
        /** Exchanges completed, and steps that consumed one: equal between steps. */
        this.exchanges = 0;
        this.consumed = 0;
        this.read = null;
        this.drives = [];
        this.plugged = false;
        this.previousOwner = null;
        /** The inputs each exchange sent ([{tMs, shafts}]), when a test asks for them. */
        this.sent = null;
    }

    /** Binds the model's devices; refuses what the emulated topology does not have. */
    plug (bindings) {
        const out = [];
        const ports = new Map(this.driver.ports.map(p => [p.id, p]));
        if (!this.driver.began) {
            out.push({severity: 'error', code: 'lockstep-not-started', message: 'The emulated SPIKE hub has not started.'});
            return out;
        }
        if (this.hubState?.configurationOwner && this.hubState.configurationOwner !== this.driver) {
            out.push({severity: 'error', code: 'hub-owned', message: 'Another session owns this hub (the SPIKE arena?).'});
            return out;
        }
        for (const b of bindings) {
            if (!this.ports.includes(b.port)) {
                out.push({severity: 'error', code: 'port-unknown', message: `${this.profile.name.en} has no port '${b.port}'`});
                continue;
            }
            const there = ports.get(b.port);
            const want = b.class === 'motor' ? 'motor' : b.sensor;
            if (!there || !there.attached || there.kind !== want) {
                out.push({severity: 'error', code: 'port-topology-mismatch',
                    message: `Port ${b.port}: the model has a ${want}, the emulated hub's topology has ${there && there.attached ? `a ${there.kind}` : 'nothing'} there.`});
                continue;
            }
            if (b.class === 'motor') {
                this.shafts.set(b.port, {angleRad: 0, radPerSec: 0, deviceId: b.ids?.lpf2 ?? MEDIUM_MOTOR});
            } else {
                this.sensors.set(b.port, {kind: b.sensor, values: null});
            }
        }
        if (out.some(d => d.severity === 'error')) return out;
        if (this.hubState) {
            const data = this.hubState.data;
            for (const [port, s] of this.shafts) {
                const index = this.ports.indexOf(port);
                data.sensors[index] = {kind: 'motor', deviceId: s.deviceId};
                Object.assign(data.motors[index], {position: 0, degPerSec: 0, speed: 0, stalled: false});
            }
            this.previousOwner = this.hubState.clockOwner;
            this.hubState.clockOwner = LOCKSTEP_CLOCK_OWNER;
        }
        this.plugged = true;
        return out;
    }

    get motorPorts () {
        return [...this.shafts.keys()];
    }

    /** The inputs of the next exchange (the state at the start of the step about to run). */
    pendingInputs () {
        const shafts = [...this.shafts].map(([port, s]) => ({port,
            positionMdeg: Math.round(s.angleRad * DEG * 1000), speedMdps: Math.round(s.radPerSec * DEG * 1000)}));
        const sensors = [...this.sensors].filter(([, s]) => s.values).map(([port, s]) => ({port, kind: s.kind, values: {...s.values}}));
        return {shafts, sensors, motorPorts: this.motorPorts};
    }

    /** Runs the emulator over the next step (one lockstep exchange). */
    async exchange () {
        if (this.exchanges !== this.consumed) throw new Error('lockstep: an exchange is already waiting for its physics step');
        const inputs = this.pendingInputs();
        if (this.sent) this.sent.push({tMs: this.timeMs, shafts: inputs.shafts});
        const read = await this.driver.step(inputs);
        this.acceptFrame(read);
        return read;
    }

    /** Takes a step's reply (driver.step's result): its drives hold over the next physics step. */
    acceptFrame (read) {
        this.read = read;
        this.drives = read.drives.map(driveToPortDrive);
        this.exchanges++;
    }

    advanceTo (tMs) {
        if (this.exchanges !== this.consumed + 1 || !this.read) {
            throw new LockstepDesyncError(`lockstep: physics step to ${tMs} ms has no exchange of its own (exchanges ${this.exchanges}, steps ${this.consumed})`);
        }
        const want = this.driver.t0Ns + Math.round(tMs * 1e6);
        if (this.read.clockNs !== want) throw new LockstepDesyncError(`lockstep: the emulator is at ${this.read.clockNs} ns, the physics step ends at ${want} ns`);
        this.consumed++;
        this.timeMs = tMs;
    }

    readDrives () {
        return this.drives.map(d => ({...d}));
    }

    writeReadings (readings) {
        for (const r of readings) {
            if (r.kind === 'encoder') {
                const s = this.shafts.get(r.port);
                if (!s) continue;
                s.angleRad += r.deltaRad;
                s.radPerSec = r.radPerSec;
            } else if (r.kind === 'probe') {
                const s = this.sensors.get(r.port);
                if (!s || s.kind !== r.device) continue;
                s.values = sensorValues(r.device, r.raw);
                s.raw = r.raw;
            }
        }
    }

    publish () {
        const hub = this.hubState;
        if (!hub || !this.plugged) return;
        for (const [port, s] of this.shafts) {
            writeObservedMotor(hub, port, {position: s.angleRad * DEG, speedDps: s.radPerSec * DEG, stalled: false});
        }
        for (const [port, s] of this.sensors) {
            if (s.raw) hub.updateSensor(port, s.kind, {deviceId: SENSOR_DEVICE[s.kind], ...s.raw});
        }
        hub.changed();
    }

    exportState () {
        return {nonRewindable: true, timeMs: this.timeMs};
    }

    importState () {
        throw new Error('an emulated SPIKE hub cannot be rewound (it runs in-thread, in lockstep)');
    }

    stateKey (state) {
        return `firmware@${state.timeMs}`;
    }

    dispose () {
        if (this.plugged && this.hubState && this.hubState.clockOwner === LOCKSTEP_CLOCK_OWNER) {
            this.hubState.clockOwner = this.previousOwner;
        }
        this.plugged = false;
        this.driver.end().catch(() => {});
    }
}

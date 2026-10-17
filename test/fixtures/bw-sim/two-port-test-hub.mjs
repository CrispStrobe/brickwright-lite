// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A fake hub family for the Robot Lab's port boundary (docs/ROBOT-LAB-ARCHITECTURE.md
// §5.1, slice R1's acceptance): two output ports A and B that take PWM duties —
// the shape of an unregulated hub (RCX, Power Functions, Technic Control) — and
// nothing SPIKE about it. Its "route" is the test itself: setOutput() is what a
// program's motor command would do, between batches. It never touches physics:
// it only answers the VirtualHub calls, and keeps what it was told.
//
// The encoder it reports to its "program" is the sum of the per-step deltaRad it
// is given (an incremental count, as a real tacho counts), so a test can compare
// that sum against the hinge's angle the physics measured.

const port = id => ({id, label: {en: `Output ${id}`, de: `Ausgang ${id}`}, kind: 'output', accepts: ['motor'],
    supplyVolts: 9, pwmLevels: 8, identifies: 'none'});

export const TWO_PORT_PROFILE = Object.freeze({
    id: 'test-two-port',
    name: {en: 'Two-port test hub', de: 'Zwei-Port-Testhub'},
    parts: [],
    ports: [port('A'), port('B')],
    internalDevices: [],
    clock: {controllerStepMs: 5},
    drive: 'pwm',
    routes: []
});

export class TwoPortTestHub {
    constructor ({id = 'test-hub'} = {}) {
        this.id = id;
        this.profile = TWO_PORT_PROFILE;
        /** port -> {duty, decay}: what the "program" set */
        this.outputs = {A: {duty: 0, decay: 'brake'}, B: {duty: 0, decay: 'brake'}};
        this.bound = [];
        this.timeMs = 0;
        /** port -> radians counted (Σ deltaRad), and the last speed reported */
        this.counts = {};
        this.speeds = {};
        this.headingDeg = 0;
        this.steps = 0;
        this.publishes = 0;
        this.plugged = false;
    }

    setOutput (port, duty, decay = 'brake') {
        this.outputs[port] = {duty, decay};
    }

    plug (bindings) {
        const ids = this.profile.ports.map(p => p.id);
        const out = [];
        for (const b of bindings) {
            if (!ids.includes(b.port)) {
                out.push({severity: 'error', code: 'port-unknown', message: `the test hub has no port '${b.port}'`});
                continue;
            }
            if (b.class === 'motor') {
                this.bound.push(b.port);
                this.counts[b.port] = 0;
                this.speeds[b.port] = 0;
            }
        }
        this.plugged = true;
        return out;
    }

    advanceTo (tMs) {
        this.timeMs = tMs;
        this.steps++;
    }

    readDrives () {
        return this.bound.map(port => ({port, mode: 'pwm', duty: this.outputs[port].duty, decay: this.outputs[port].decay}));
    }

    writeReadings (readings, pose = null) {
        for (const r of readings) {
            if (r.kind !== 'encoder') continue;
            this.counts[r.port] += r.deltaRad;
            this.speeds[r.port] = r.radPerSec;
        }
        if (pose) this.headingDeg = pose.headingDeg;
    }

    publish () {
        this.publishes++;
    }

    exportState () {
        return {timeMs: this.timeMs, outputs: structuredClone(this.outputs), counts: {...this.counts}};
    }

    importState (state) {
        this.timeMs = state.timeMs;
        this.outputs = structuredClone(state.outputs);
        this.counts = {...state.counts};
    }

    stateKey (state) {
        return JSON.stringify({timeMs: state.timeMs, outputs: state.outputs});
    }

    dispose () {
        this.plugged = false;
    }
}

/** The hub registry entry (registry/hubs.js). */
export const twoPortTestHub = {profile: TWO_PORT_PROFILE, createVirtualHub: options => new TwoPortTestHub(options)};

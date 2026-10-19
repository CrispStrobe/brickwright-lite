// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The RCX behind the Robot Lab's port boundary: a VirtualHub
// (hubs/hub-profile.js; docs/ROBOT-LAB-ARCHITECTURE.md §5.1, §7 R5;
// docs/ROBOT-LAB-RCX.md) around the clean-room bytecode VM
// (routes/rcx-vm/rcx-vm.js). A downloaded `.rcx` image (NQC → nqc-wasm, the
// same bytes the IR tower would send) runs RESIDENT on the Lab's one clock:
//
//   advanceTo(t)   the VM runs exactly up to t (simulated time, its own
//                  instruction timing: RcxVm `instrUs`), with the inputs the
//                  last step's readings gave (zero-order hold);
//   readDrives()   each bound output's state as a PortDrive: 'on' at power p
//                  → pwm duty ±(p+1)/8 with 'coast' decay (the firmware's
//                  on/float pattern, below), 'off' → brake, 'float' → coast;
//   writeReadings  each input's probe → the raw ADC value its device model
//                  gives (devices/rcx-sensors.js): touch, light, rotation.
//
// POWER LEVELS. The standard firmware keeps one 8-bit PWM pattern per output
// and rotates it every millisecond; a set bit drives the motor, a clear bit
// floats it ("on-float-on-float; brake is not used"). The eight patterns for
// power 0..7 are 00000001 … 11111111: power p drives (p+1) ms of every 8 ms
// (Dick Swan, LUGNET robotics #17185, 2002-01-31 — community, read from the
// ROM; his prose says "power level 4 … on for 4 msec", his table gives 5: the
// table is taken). The 8 ms pattern is shorter than nothing the physics
// resolves at 5 ms steps, so it is applied as its average: duty (p+1)/8 with
// the off phase floating (physics/actuators.js `pwm` + 'coast': the back-EMF
// damping acts only while driven). Not modelled: the firmware's 60 ms pause on
// a direction change ("to reduce tear and wear", RCX 2.0 Firmware Command
// Overview p. 101) and the RCX's 500 mA output current limit.

import {RcxVm} from '../../routes/rcx-vm/rcx-vm.js';
import {RCX_PROFILE, RCX_OUTPUTS, RCX_INPUTS} from './profile.js';
import {RCX_INPUT_MODELS, RAW_OPEN} from '../../devices/rcx-sensors.js';
import {deviceModels} from '../../devices/catalog.js';

/** Duty of power level p (0..7): (p + 1) of every 8 ms driven. */
export const RCX_DUTY = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8].map(n => n / 8));

/** The PortDrive an RCX output state is. */
export const driveOf = (port, out) => {
    if (!out || out.mode === 'float') return {port, mode: 'pwm', duty: 0, decay: 'coast'};
    if (out.mode === 'off') return {port, mode: 'pwm', duty: 0, decay: 'brake'};
    const level = Math.max(0, Math.min(7, Math.trunc(out.power)));
    return {port, mode: 'pwm', duty: (out.direction < 0 ? -1 : 1) * RCX_DUTY[level], decay: 'coast'};
};

const toBytes = bytes => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

/** How many recorded VM events (sound, display, messages, errors) the hub keeps for the UI. */
const EVENT_LOG = 50;

export class RcxVirtualHub {
    /**
     * @param {object} [options]
     * @param {string} [options.id] the hub's placed-part id
     * @param {object} [options.vm] RcxVm options (instrUs, seed)
     */
    constructor ({id = 'hub', vm = {}} = {}) {
        this.id = id;
        this.profile = RCX_PROFILE;
        this.vmOptions = vm;
        this.vm = new RcxVm(vm);
        /** The loaded image (plain byte array), or null. */
        this.image = null;
        /** Output port → true for the outputs a motor is bound to. */
        this.motorPorts = [];
        /** Input index (0..2) → device id (catalog.js) of the sensor plugged there, or null. */
        this.inputDevices = [null, null, null];
        /** Input index → what the VM reads (raw, or {raw, rotation}). */
        this.inputs = [RAW_OPEN, RAW_OPEN, RAW_OPEN];
        this.timeMs = 0;
        this.plugged = false;
        this.events = [];
        this.listeners = new Set();
    }

    /** Binds the model's motors to A–C and sensors to 1–3; refuses what the RCX cannot take. */
    plug (bindings) {
        const diagnostics = [];
        const ports = this.profile.ports;
        for (const b of bindings) {
            const spec = ports.find(p => p.id === b.port);
            if (!spec) {
                diagnostics.push({severity: 'error', code: 'port-unknown',
                    message: `${this.profile.name.en} has no port '${b.port}' (ports ${ports.map(p => p.id).join(', ')})`});
                continue;
            }
            const model = b.device ? deviceModels.get(b.device) : null;
            const cls = model ? model.class : (b.class === 'motor' ? 'motor' : 'sensor-lpf2');
            if (!spec.accepts.includes(cls)) {
                diagnostics.push({severity: 'error', code: 'port-refuses-device',
                    message: `${this.profile.name.en} ${spec.label.en} takes ${spec.accepts.join(' or ')}, not ${b.device || cls}`});
                continue;
            }
            if (b.class === 'motor') this.motorPorts.push(b.port);
            else {
                const index = RCX_INPUTS.indexOf(b.port);
                if (!RCX_INPUT_MODELS[b.device]) {
                    diagnostics.push({severity: 'error', code: 'port-refuses-device',
                        message: `${this.profile.name.en} cannot read ${b.device || b.sensor} on ${spec.label.en}`});
                    continue;
                }
                this.inputDevices[index] = b.device;
            }
        }
        this.motorPorts.sort();
        this.timeMs = 0;
        this.plugged = true;
        return diagnostics;
    }

    /**
     * Puts a compiled `.rcx` image into the brick (what a download does). The program
     * does not start until run() — as on the real RCX, where Run is a button.
     * @param {Uint8Array|ArrayBuffer|number[]} bytes
     * @returns {{ok: boolean, log: string}}
     */
    loadProgram (bytes) {
        const data = toBytes(bytes);
        const out = this.vm.load(data);
        if (!out.ok) return {ok: false, log: `not a usable .rcx image: ${out.error}${out.detail ? ` — ${out.detail}` : ''}`};
        this.image = Array.from(data);
        // The VM's clock is the hub's: a program loaded mid-scene starts its timers from now.
        this.vm.s.timeUs = this.vm.s.cpuUs = Math.round(this.timeMs * 1000);
        this._changed();
        return {ok: true, log: `${data.length} bytes, ${this.vm.program.tasks.filter(Boolean).length} task(s)`};
    }

    /** The Run button: starts task 0 now. */
    run () {
        if (!this.vm.program) return false;
        this.vm.run();
        this._changed();
        return true;
    }

    /** The Run button again: stops every task, the outputs float (StopAllTasks leaves them; a stopped brick floats). */
    stop () {
        if (!this.vm.program) return false;
        const timeUs = this.vm.s.timeUs;
        this.vm.load(new Uint8Array(this.image));
        this.vm.s.timeUs = this.vm.s.cpuUs = timeUs;
        this._changed();
        return true;
    }

    /** 'empty' (no program) | 'idle' | 'running' | 'stopped' | 'error'. */
    get status () {
        return this.vm.program ? this.vm.status : 'empty';
    }

    /** The VM runs up to tMs (the end of the step about to be simulated). */
    advanceTo (tMs) {
        const dt = tMs - this.timeMs;
        this.timeMs = tMs;
        if (dt <= 0) return;
        this.vm.advance(dt, {inputs: this.inputs});
    }

    readDrives () {
        const outputs = this.vm.s.outputs;
        return this.motorPorts.map(port => driveOf(port, outputs[RCX_OUTPUTS.indexOf(port)]));
    }

    /** Sensor probes → raw ADC values (encoders: the RCX outputs measure nothing). */
    writeReadings (readings) {
        for (const r of readings) {
            if (r.kind !== 'probe') continue;
            const index = RCX_INPUTS.indexOf(r.port);
            const device = index >= 0 ? this.inputDevices[index] : null;
            if (!device) continue;
            this.inputs[index] = RCX_INPUT_MODELS[device](r.raw);
        }
    }

    /** Hands the VM's recorded events to the UI; one notification. */
    publish () {
        const events = this.vm.drainEvents();
        if (events.length) this.events = this.events.concat(events).slice(-EVENT_LOG);
        this._changed();
    }

    /** fn(hub) on every publish and program change. Returns an unsubscribe. */
    onChange (fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _changed () {
        for (const fn of [...this.listeners]) fn(this);
    }

    /** The program image, the VM's state and the held inputs: all a mirror needs to redo a batch. */
    exportState () {
        return {timeMs: this.timeMs, image: this.image, vm: this.vm.snapshot(), inputs: this.inputs.map(i => (typeof i === 'object' ? {...i} : i))};
    }

    importState (state) {
        this.timeMs = state.timeMs;
        const mine = this.vm.program ? this.vm.program.fingerprint : null;
        if (state.vm.program !== mine) {
            if (state.image) this.vm.load(new Uint8Array(state.image));
            else this.vm = new RcxVm(this.vmOptions);
        }
        this.image = state.image ? state.image.slice() : null;
        this.vm.restore(state.vm);
        this.inputs = state.inputs.map(i => (typeof i === 'object' ? {...i} : i));
    }

    stateKey (state) {
        return JSON.stringify(state);
    }

    dispose () {
        this.plugged = false;
        this.listeners.clear();
    }
}

/** The hub registry's entry for the RCX (registry/hubs.js). */
export const rcxHub = Object.freeze({
    profile: RCX_PROFILE,
    createVirtualHub: ({id, vm} = {}) => new RcxVirtualHub({id, vm})
});

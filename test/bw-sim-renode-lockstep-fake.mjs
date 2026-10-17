// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// An in-process FAKE of the emulated SPIKE hub behind the lockstep contract
// (overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/contract.js;
// docs/ROBOT-LAB-SPIKE-EMULATION.md §2.1, §4 R13a–c). It stands in for the
// three pieces other owners build — the broker ops, the state service's
// `lockstep.step`, the port model's external shaft + duty average — and for
// the NuttX firmware itself, so the Robot Lab side can be tested end to end
// in node. A transport: `call(operation, args)` → Promise of a JSON reply.
//
// What it models, deterministically (integer milliseconds of virtual time):
//
//   PORT MODEL (Infra LegoLpf2ElectricalPort, as R13c proposes it): a 1 kHz
//   tick per port; in external-shaft mode the motor's position is the last
//   injected anchor extrapolated linearly (position + speed·Δt), reported to
//   the firmware as an LPF2 POS frame — integer degrees, C# Math.Round (half to
//   even) — every 10 ms; every tick samples the H-bridge drive (−10000…10000)
//   and the braking flag into the quantum's average (TakeDriveAverage).
//
//   FIRMWARE: a re-implementation, with attribution, of Brickwright's NuttX
//   hub program (CrispStrobe/brickwright-spike-prime-fw @ 68735cd,
//   apps/hubprogram, BSD-3-Clause, Copyright (c) 2026 Brickwright
//   contributors): motor.c `bw_motor_step` (reference ramp 2000/4000 °/s²,
//   distance-capped positioning, duty = ref·10000/1110 + 3·err + ∫/1000, all
//   integer arithmetic truncating like C), device.c's POS polling and speed
//   estimate ((position − previous)/elapsed, m°/ms = °/s) and its
//   brake/done rules, and program.c's interpreter for the firmware-program
//   ABI ops 0 (end: brake owned, wait done), 1 (speed), 2 (wait ms), 4 (jump),
//   6 (run for degrees, wait done). Its service loop runs every 10 ms of
//   virtual time (service.c): device tick, then program tick. The program
//   starts at the first service tick after lockstep.begin (the deferred START
//   of plan §2.6). FAKE-ONLY, not in the ABI: op 7 = op 6 without waiting,
//   so two motors can start a move in the same tick as a SPIKE motor pair
//   does (ABI v1 programs drive pairs with ops 1 + 2 instead).
//   Not modelled: sensor conditions (ops 3, 5: they fault here), the 120 s
//   program limit, MicroPython, the IMU.
//
// Faults for tests: {skewAtStep: k, skewNs} reports a clock off by skewNs at
// step k; {repeatSeqAtStep: k} repeats the previous seq at step k.

const FULL_CAPABILITIES = ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1',
    'nuttx-program/v1', 'lockstep/v1', 'motor-bridge-drive/v1', 'external-shaft/v1', 'nuttx-program-deferred-start/v1'];
export const FAKE_IMAGE = 'f'.repeat(16) + '0123456789abcdef'.repeat(3);

const TOPOLOGIES = {
    'default': {A: 'motor', B: 'motor', C: 'color', D: 'distance', E: 'force', F: 'none'},
    'six-motors': {A: 'motor', B: 'motor', C: 'motor', D: 'motor', E: 'motor', F: 'motor'}
};
const PORTS = 'ABCDEF';
const EAGAIN = -11;

const trunc = Math.trunc;
const clamp = (v, low, high) => (v < low ? low : v > high ? high : v);
/** C#'s Math.Round (MidpointRounding.ToEven). */
const roundEven = x => {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};

// ---- motor.c ----------------------------------------------------------------
const freshControl = () => ({requested: 0, reference: 0, duty: 0, target: 0, integral: 0, last: 0,
    positioning: 0, active: 0, settled: 0, timed: 0});
const motorSpeed = (m, speed) => {
    if (!m.active) Object.assign(m, freshControl());
    Object.assign(m, {requested: speed, positioning: 0, active: 1, settled: 0});
};
const motorPosition = (m, pos, delta, speed) => {
    if (!m.active) Object.assign(m, freshControl());
    Object.assign(m, {target: pos + delta * 1000, requested: speed, positioning: 1, active: 1, settled: 0});
};
const motorStep = (m, now, pos, speed) => {
    let desired = m.requested;
    let dt = m.timed ? (now > m.last ? now - m.last : 0) : 10;
    if (!m.timed || now > m.last) m.last = now;
    m.timed = 1;
    if (dt > 50) dt = 50;
    if (!m.active) { m.duty = 0; return 0; }
    if (m.positioning) {
        const remaining = m.target - pos;
        desired = clamp(trunc(remaining * 2 / 1000), -m.requested, m.requested);
        if (remaining >= -1000 && remaining <= 1000 && speed >= -20 && speed <= 20) {
            if (dt && ++m.settled >= 3) { m.active = 0; m.duty = 0; return 0; }
        } else m.settled = 0;
    }
    const step = trunc((desired === 0 ? 4000 : 2000) * dt / 1000);
    m.reference = clamp(desired, m.reference - step, m.reference + step);
    const error = m.reference - speed;
    m.integral = clamp(m.integral + error * dt, -2000000, 2000000);
    const output = trunc(m.reference * 10000 / 1110) + error * 3 + trunc(m.integral / 1000);
    m.duty = clamp(output, -10000, 10000);
    return m.duty;
};

// ---- the port model (external shaft, duty average) --------------------------
class FakePort {
    constructor (id, kind) {
        this.id = id;
        this.kind = kind;
        this.anchor = {deg: 0, dps: 0, ms: 0};
        this.drive = 0;
        this.braking = false;
        this.frames = [];
        this.sensor = null;
        this.avg = {sum: 0, last: 0, brakingTicks: 0, ticks: 0};
    }

    positionAt (ms) {
        return this.anchor.deg + this.anchor.dps * (ms - this.anchor.ms) / 1000;
    }

    /** One 1 ms tick ending at `ms`. */
    tick (ms) {
        if (this.kind !== 'motor') return;
        this.avg.sum += this.drive;
        this.avg.last = this.drive;
        if (this.braking) this.avg.brakingTicks++;
        this.avg.ticks++;
        if (ms % 10 === 0) this.frames.push(roundEven(this.positionAt(ms)));
    }

    takeDriveAverage () {
        const a = this.avg;
        this.avg = {sum: 0, last: 0, brakingTicks: 0, ticks: 0};
        return {mean: a.ticks ? a.sum / a.ticks : 0, last: a.last, brakingTicks: a.brakingTicks, ticks: a.ticks};
    }
}

// ---- device.c + program.c ---------------------------------------------------
class FakeFirmware {
    constructor (ports, program) {
        this.ports = ports;
        this.dev = ports.map(() => ({open: false, position: 0, previous: 0, sampled: 0, previousSampled: 0, valid: false,
            speed: 0, control: freshControl(), braking: false, deferred: false, delta: 0, velocity: 0}));
        this.program = program;
        this.p = {state: program ? 'ready' : 'empty', pc: 0, owned: 0, moving: -1, waiting: false, deadline: 0, ending: false,
            started: 0, error: 0};
        this.now = 0;
    }

    _open (i) {
        if (this.ports[i].kind !== 'motor') return -19;
        this.dev[i].open = true;
        return 0;
    }

    _poll (i) {
        const p = this.dev[i];
        const frames = this.ports[i].frames;
        this.ports[i].frames = [];
        let updated = false;
        for (const degrees of frames) {
            if (!updated && (!p.valid || this.now !== p.sampled)) {
                p.previous = p.position;
                p.previousSampled = p.valid ? p.sampled : this.now;
            }
            p.position = degrees * 1000;
            updated = true;
        }
        if (updated) {
            if (p.valid && this.now > p.previousSampled) p.speed = trunc((p.position - p.previous) / (this.now - p.previousSampled));
            p.sampled = this.now;
            p.valid = true;
        }
        return p.valid && this.now >= p.sampled && this.now - p.sampled <= 100 ? 0 : EAGAIN;
    }

    _setDuty (i, duty) { Object.assign(this.ports[i], {drive: duty, braking: false}); }
    _brakeBridge (i) { Object.assign(this.ports[i], {drive: 0, braking: true}); }

    speed (i, value) {
        if (value < -1110 || value > 1110) return -22;
        const rc = this._open(i);
        if (rc < 0) return rc;
        Object.assign(this.dev[i], {braking: false, deferred: false});
        motorSpeed(this.dev[i].control, value);
        return 0;
    }

    position (i, degrees, velocity) {
        if (degrees < -36000 || degrees > 36000 || velocity < 1 || velocity > 1110) return -22;
        let rc = this._open(i);
        if (rc < 0) return rc;
        rc = this._poll(i);
        const p = this.dev[i];
        p.braking = false;
        if (rc === EAGAIN) { Object.assign(p, {delta: degrees, velocity, deferred: true}); return 0; }
        p.deferred = false;
        motorPosition(p.control, p.position, degrees, velocity);
        return 0;
    }

    brake (i) {
        const p = this.dev[i];
        if (!p.open) return 0;
        p.control = freshControl();
        p.deferred = false;
        p.braking = true;
        this._brakeBridge(i);
        return 0;
    }

    done (i) {
        const p = this.dev[i];
        if (p.deferred || !p.valid) return 0;
        if (this.now < p.sampled || this.now - p.sampled > 100) return -5;
        if (p.braking) return p.speed >= -20 && p.speed <= 20 ? 1 : 0;
        return p.control.active ? 0 : 1;
    }

    deviceTick () {
        this.dev.forEach((p, i) => {
            if (!p.open) return;
            const rc = this._poll(i);
            if (rc === EAGAIN && !p.valid) return;
            if (p.deferred) { motorPosition(p.control, p.position, p.delta, p.velocity); p.deferred = false; }
            if (p.control.active && !p.braking) {
                const duty = motorStep(p.control, this.now, p.position, p.speed);
                if (p.control.active) this._setDuty(i, duty);
                else this._brakeBridge(i);
            }
        });
    }

    _fault (error) {
        for (let i = 0; i < 6; i++) if (this.p.owned & (1 << i)) this.brake(i);
        Object.assign(this.p, {state: 'fault', error});
    }

    start () {
        if (this.p.state !== 'ready') return;
        Object.assign(this.p, {state: 'running', pc: 0, owned: 0, moving: -1, waiting: false, ending: false, started: this.now});
    }

    programTick () {
        const p = this.p;
        if (p.state !== 'running') return;
        if (p.waiting) { if (this.now < p.deadline) return; p.waiting = false; }
        if (p.moving >= 0) {
            const rc = this.done(p.moving);
            if (rc < 0) { this._fault(rc); return; }
            if (!rc) return;
            p.moving = -1;
        }
        if (p.ending) {
            for (let i = 0; i < 6; i++) if (p.owned & (1 << i)) {
                const rc = this.done(i);
                if (rc < 0) { this._fault(rc); return; }
                if (!rc) return;
            }
            p.state = 'complete';
            return;
        }
        let budget = 32;
        while (budget--) {
            if (p.pc >= this.program.length) { this._fault(-71); return; }
            const [op, a, b, c] = this.program[p.pc];
            let rc;
            switch (op) {
            case 0:
                for (let i = 0; i < 6; i++) if (p.owned & (1 << i)) this.brake(i);
                p.ending = true;
                return;
            case 1:
                p.owned |= 1 << a;
                rc = this.speed(a, b);
                if (rc < 0) { this._fault(rc); return; }
                p.pc++;
                break;
            case 2:
                p.deadline = this.now + (a || 1);
                p.waiting = true;
                p.pc++;
                return;
            case 4:
                p.pc = a;
                break;
            case 6:
            case 7:
                p.owned |= 1 << a;
                rc = this.position(a, b, c);
                if (rc < 0) { this._fault(rc); return; }
                p.pc++;
                if (op === 6) { p.moving = a; return; }
                break;
            default:
                this._fault(-71);
                return;
            }
        }
    }

    /** service.c: every 10 ms, the device tick, then the program tick. */
    service (now) {
        this.now = now;
        this.deviceTick();
        this.programTick();
    }
}

const STATE_CODE = {empty: 0, ready: 1, running: 2, complete: 3, stopped: 4, fault: 5};

export class FakeSpikeRenode {
    /**
     * @param {object} [options]
     * @param {'default'|'six-motors'} [options.topology]
     * @param {number[][]} [options.program] firmware-program ABI instructions (+ fake op 7), uploaded before begin
     * @param {object} [options.faults] {skewAtStep, skewNs, repeatSeqAtStep}
     * @param {number} [options.latencyMs] each exchange resolves this much later (a real timer)
     * @param {string[]} [options.capabilities]
     */
    constructor ({topology = 'default', program = null, faults = {}, latencyMs = 0, capabilities = FULL_CAPABILITIES} = {}) {
        const layout = TOPOLOGIES[topology];
        if (!layout) throw new Error(`fake topology '${topology}' is not modelled`);
        this.topology = topology;
        this.ports = [...PORTS].map(id => new FakePort(id, layout[id]));
        this.firmware = new FakeFirmware(this.ports, program);
        this.faults = faults;
        this.latencyMs = latencyMs;
        this.capabilities = capabilities;
        // The supervisor's boot: RunFor 1.0 s.
        this.ms = 1000;
        this.seq = 0;
        this.steps = 0;
        this.session = false;
        this.lockstep = false;
        /** Every request, in order: [operation, args]. */
        this.log = [];
        /** The shafts each step received, with the virtual ms they anchor at. */
        this.received = [];
    }

    snapshot ({clockNs = this.ms * 1e6, seq = ++this.seq, drives = null} = {}) {
        const p = this.firmware.p;
        return {schemaVersion: 1, type: 'snapshot', seq, clockNs,
            target: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none', imageSha256: FAKE_IMAGE,
                capabilities: [...this.capabilities], limitations: []},
            lifecycle: {connectionGeneration: 1, nuttxProgram: {state: STATE_CODE[p.state], error: p.error}},
            ports: this.ports.map(port => ({id: port.id, attached: port.kind !== 'none', kind: port.kind})),
            motors: this.ports.filter(port => port.kind === 'motor').map(port => {
                const position = port.positionAt(this.ms);
                return {port: port.id, position, speedDps: port.anchor.dps, stalled: false,
                    demandDirection: Math.sign(port.drive), positionSource: 'external',
                    ...(drives ? {drive: drives[port.id]} : {})};
            }),
            sensors: this.ports.filter(port => port.sensor).map(port => ({port: port.id, ...port.sensor}))};
    }

    async call (operation, args) {
        this.log.push([operation, args]);
        if (this.latencyMs > 0) await new Promise(resolve => setTimeout(resolve, this.latencyMs));
        switch (operation) {
        case 'renode.spike.session.start':
            if (this.session) throw new Error('operation-failed');
            this.session = true;
            return {ok: true};
        case 'renode.spike.session.close':
            this.session = false;
            this.lockstep = false;
            return {ok: true};
        case 'renode.spike.lockstep.begin':
            if (!this.session || this.lockstep) throw new Error('operation-failed');
            this.lockstep = true;
            return JSON.stringify(this.snapshot());
        case 'renode.spike.lockstep.step':
            return JSON.stringify(this._step(args));
        case 'renode.spike.lockstep.end':
            this.lockstep = false;
            return {ok: true};
        default:
            throw new Error('unknown-method');
        }
    }

    _step ({quantumUs, expectClockNs, shafts, sensors}) {
        // The state service refuses a step whose expected clock is not the machine's (§2.2).
        if (!this.lockstep || expectClockNs !== this.ms * 1e6) throw new Error('operation-failed');
        this.steps++;
        for (const s of shafts) {
            const port = this.ports.find(p => p.id === s.port);
            if (port.kind !== 'motor') throw new Error('invalid-data');
            port.anchor = {deg: s.positionMdeg / 1000, dps: s.speedMdps / 1000, ms: this.ms};
        }
        this.received.push({ms: this.ms, shafts: shafts.map(s => ({...s}))});
        for (const s of sensors) this.ports.find(p => p.id === s.port).sensor = {kind: s.kind, values: {...s.values}};
        const end = this.ms + quantumUs / 1000;
        while (this.ms < end) {
            this.ms++;
            for (const port of this.ports) port.tick(this.ms);
            if (this.ms % 10 === 0) {
                if (this.firmware.p.state === 'ready') this.firmware.start();
                this.firmware.service(this.ms);
            }
        }
        const drives = Object.fromEntries(this.ports.filter(p => p.kind === 'motor').map(p => [p.id, p.takeDriveAverage()]));
        let clockNs = this.ms * 1e6;
        if (this.faults.skewAtStep === this.steps) clockNs += this.faults.skewNs ?? 1;
        const seq = this.faults.repeatSeqAtStep === this.steps ? this.seq : ++this.seq;
        return this.snapshot({clockNs, seq, drives});
    }

    /** The firmware program's state ('running', 'complete', 'fault', …). */
    get programState () {
        return this.firmware.p.state;
    }
}

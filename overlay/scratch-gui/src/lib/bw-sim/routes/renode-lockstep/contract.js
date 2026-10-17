// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The lockstep contract between the Robot Lab and an emulated SPIKE hub
// (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.1, §4 R13a/R13b). This module is the
// JS side's reading of it: the request it builds per 5 ms physics step and
// what it accepts back. It is written AGAINST the plan, before the other
// owners' pieces exist — the broker ops `renode.spike.lockstep.{begin,step,end}`
// (Lite native, brickwright-lite#1055), the state-service command `lockstep.step`
// (Runtime, renode-spike-prime#58) and the model's external shaft + duty
// average (Infra, renode-infrastructure-spike-prime#37). Pure data checks: no
// I/O, no physics, no hub.
//
// Per step k, covering [t_k, t_k + quantum]:
//
//   request  {quantumUs, expectClockNs: t_k,
//             shafts:  [{port, positionMdeg, speedMdps}]   integers, from the physics at t_k
//             sensors: [{port, kind, values}]              as `arena.inputs` (SPIKE units)
//             hub?:    {buttons, imuRaw}}                  prime-hub-io/v1, MicroPython only
//   reply    a brick-state/v1 snapshot taken after `RunFor quantum`:
//            {schemaVersion: 1, type: 'snapshot', seq, clockNs: t_k + quantum,
//             target: {imageSha256, capabilities[…'lockstep/v1', 'motor-bridge-drive/v1',
//                      'external-shaft/v1']}, lifecycle: {connectionGeneration, …},
//             ports: [{id, attached, kind}],
//             motors: [{port, position, speedDps, positionSource: 'external',
//                       drive: {mean, last, brakingTicks, ticks}}], …}
//
// `drive` is the Infra model's TakeDriveAverage() over the quantum: the mean
// and last sampled H-bridge drive (−10000…10000) and how many of the 1 kHz
// port ticks were braking. readStepFrame() hands it on as
// {port, meanDrive, lastDrive, brakingTicks, ticks}, the model's own names.
//
// A reply whose clock is not EXACTLY expectClockNs + quantum, whose sequence
// did not increase, or whose image/connection changed is a desync: it throws
// LockstepDesyncError and the session stops — never a retry, never a skipped
// step (§2.7).

/** The broker operations (the native owner adds them to native-renode-capability.js OPERATIONS). */
export const LOCKSTEP_OPS = Object.freeze({
    sessionStart: 'renode.spike.session.start',
    sessionClose: 'renode.spike.session.close',
    /** Resumes the guest the session starts halted: the Runtime runs quanta only on a running CPU. */
    run: 'renode.spike.run',
    begin: 'renode.spike.lockstep.begin',
    step: 'renode.spike.lockstep.step',
    end: 'renode.spike.lockstep.end'
});

/** Target capabilities a lockstep session needs (§4 R13b). */
export const LOCKSTEP_CAPABILITIES = Object.freeze(['lockstep/v1', 'motor-bridge-drive/v1', 'external-shaft/v1']);

/** The quanta the native validator admits (§4 R13a); 5 ms is one physics step. */
export const QUANTA_US = Object.freeze([5000, 10000]);

/** The Infra port model's tick rate: one drive sample per millisecond of virtual time. */
export const PORT_TICK_US = 1000;

export const PORTS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);

/** H-bridge drive full scale (LegoLpf2ElectricalPort.BridgeDrive). */
export const DRIVE_FULL_SCALE = 10000;

const INT32 = 2 ** 31;
const MAX_SPEED_MDPS = 2e6;
const SENSOR_KINDS = ['color', 'distance', 'force'];

/** The contract was broken by the other side (a malformed reply, a missing capability). */
export class LockstepContractError extends Error {
    constructor (message) {
        super(message);
        this.name = 'LockstepContractError';
        this.code = 'lockstep-contract';
    }
}

/** Lab and emulator disagree about time or identity: the session cannot continue. */
export class LockstepDesyncError extends Error {
    constructor (message) {
        super(message);
        this.name = 'LockstepDesyncError';
        this.code = 'lockstep-desync';
    }
}

const isPlain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o, keys, what) => {
    for (const k of Object.keys(o)) if (!keys.includes(k)) throw new TypeError(`${what}: unexpected key '${k}'`);
};

/**
 * Builds and checks one step request, as closed as the native validator will be
 * (§4 R13a): a malformed request is refused HERE, before any byte is sent.
 * @param {{quantumUs: number, expectClockNs: number, shafts: object[], sensors: object[], hub?: object}} r
 */
export const stepRequest = ({quantumUs, expectClockNs, shafts, sensors, hub}) => {
    if (!QUANTA_US.includes(quantumUs)) throw new TypeError(`lockstep step: quantumUs must be one of ${QUANTA_US.join(', ')}`);
    if (!Number.isSafeInteger(expectClockNs) || expectClockNs < 0) throw new TypeError('lockstep step: expectClockNs must be a non-negative integer');
    const seen = new Set();
    const port = (p, what) => {
        if (!PORTS.includes(p)) throw new TypeError(`${what}: port '${p}' is not A–F`);
        if (seen.has(`${what}:${p}`)) throw new TypeError(`${what}: port ${p} twice`);
        seen.add(`${what}:${p}`);
    };
    if (!Array.isArray(shafts) || shafts.length > PORTS.length) throw new TypeError('lockstep step: shafts must be a list of at most 6');
    const outShafts = shafts.map(s => {
        if (!isPlain(s)) throw new TypeError('shaft: not an object');
        onlyKeys(s, ['port', 'positionMdeg', 'speedMdps'], 'shaft');
        port(s.port, 'shaft');
        if (!Number.isInteger(s.positionMdeg) || Math.abs(s.positionMdeg) >= INT32) throw new TypeError(`shaft ${s.port}: positionMdeg must be an integer within ±2^31`);
        if (!Number.isInteger(s.speedMdps) || Math.abs(s.speedMdps) > MAX_SPEED_MDPS) throw new TypeError(`shaft ${s.port}: speedMdps must be an integer within ±2e6`);
        return {port: s.port, positionMdeg: s.positionMdeg, speedMdps: s.speedMdps};
    });
    if (!Array.isArray(sensors) || sensors.length > PORTS.length) throw new TypeError('lockstep step: sensors must be a list of at most 6');
    const outSensors = sensors.map(s => {
        if (!isPlain(s)) throw new TypeError('sensor: not an object');
        onlyKeys(s, ['port', 'kind', 'values'], 'sensor');
        port(s.port, 'sensor');
        if (!SENSOR_KINDS.includes(s.kind)) throw new TypeError(`sensor ${s.port}: kind must be ${SENSOR_KINDS.join('|')}`);
        if (!isPlain(s.values)) throw new TypeError(`sensor ${s.port}: values must be an object`);
        return {port: s.port, kind: s.kind, values: {...s.values}};
    });
    for (const s of outShafts) {
        if (outSensors.some(x => x.port === s.port)) throw new TypeError(`port ${s.port} is both a shaft and a sensor`);
    }
    const out = {quantumUs, expectClockNs, shafts: outShafts, sensors: outSensors};
    if (hub !== undefined && hub !== null) {
        if (!isPlain(hub)) throw new TypeError('lockstep step: hub must be an object');
        out.hub = hub;
    }
    return out;
};

/** A transport reply may arrive as JSON text (the native relay's state replies do). */
export const parseReply = reply => {
    if (typeof reply !== 'string') return reply;
    try {
        return JSON.parse(reply);
    } catch (_) {
        throw new LockstepContractError('the emulator replied with something that is not JSON');
    }
};

/** Identity of a session's image + connection: must not change while lockstep runs. */
export const frameIdentity = frame => `${frame.target.imageSha256}:${frame.lifecycle?.connectionGeneration ?? 0}`;

/**
 * Checks a snapshot's envelope (shape, capabilities, ports). Shared by the begin
 * frame and every step frame.
 */
export const readSnapshot = frame => {
    if (!isPlain(frame) || frame.schemaVersion !== 1 || frame.type !== 'snapshot') {
        throw new LockstepContractError('the emulator reply is not a brick-state/v1 snapshot');
    }
    const target = frame.target;
    if (!isPlain(target) || !/^[a-f0-9]{64}$/.test(target.imageSha256 || '') || !Array.isArray(target.capabilities)) {
        throw new LockstepContractError('the snapshot has no target identity');
    }
    const missing = LOCKSTEP_CAPABILITIES.filter(c => !target.capabilities.includes(c));
    if (missing.length) throw new LockstepContractError(`the emulated hub lacks ${missing.join(', ')}`);
    if (!Number.isSafeInteger(frame.seq) || frame.seq < 0 || !Number.isSafeInteger(frame.clockNs) || frame.clockNs < 0) {
        throw new LockstepContractError('the snapshot has no valid seq/clockNs');
    }
    if (!Array.isArray(frame.ports) || !frame.ports.every(p => isPlain(p) && PORTS.includes(p.id) && typeof p.attached === 'boolean' && typeof p.kind === 'string')) {
        throw new LockstepContractError('the snapshot has no valid ports[]');
    }
    if (!Array.isArray(frame.motors)) throw new LockstepContractError('the snapshot has no motors[]');
    return frame;
};

/**
 * Checks a step reply against the step that was sent and the session so far,
 * and reads its drives.
 * @param {object} frame the parsed reply
 * @param {{expectClockNs: number, lastSeq: number, identity: string, quantumUs: number, motorPorts: string[]}} expect
 *        expectClockNs: the clock the reply MUST carry (t_k + quantum)
 * @returns {{frame: object, clockNs: number, seq: number, drives: {port: string, meanDrive: number,
 *          lastDrive: number, brakingTicks: number, ticks: number}[], motors: object[]}}
 */
export const readStepFrame = (frame, {expectClockNs, lastSeq, identity, quantumUs, motorPorts}) => {
    readSnapshot(frame);
    if (frame.clockNs !== expectClockNs) {
        throw new LockstepDesyncError(`emulator clock ${frame.clockNs} ns, expected exactly ${expectClockNs} ns`);
    }
    if (frame.seq <= lastSeq) throw new LockstepDesyncError(`snapshot seq ${frame.seq} did not advance past ${lastSeq}`);
    if (frameIdentity(frame) !== identity) throw new LockstepDesyncError('the emulated image or connection changed during lockstep');
    const ticks = quantumUs / PORT_TICK_US;
    const drives = [];
    const motors = [];
    for (const port of motorPorts) {
        const matches = frame.motors.filter(m => isPlain(m) && m.port === port);
        if (matches.length !== 1) throw new LockstepContractError(`the snapshot has ${matches.length} motor entries for port ${port}`);
        const m = matches[0];
        const d = m.drive;
        if (m.positionSource !== 'external') throw new LockstepContractError(`motor ${port}: the emulator integrates its own shaft (positionSource ${m.positionSource})`);
        if (!isPlain(d) || !Number.isFinite(d.mean) || Math.abs(d.mean) > DRIVE_FULL_SCALE ||
            !Number.isFinite(d.last) || Math.abs(d.last) > DRIVE_FULL_SCALE ||
            !Number.isInteger(d.ticks) || d.ticks !== ticks ||
            !Number.isInteger(d.brakingTicks) || d.brakingTicks < 0 || d.brakingTicks > d.ticks) {
            throw new LockstepContractError(`motor ${port}: invalid drive report ${JSON.stringify(d)} (want ${ticks} ticks)`);
        }
        if (!Number.isFinite(m.position) || !Number.isFinite(m.speedDps)) throw new LockstepContractError(`motor ${port}: invalid position/speed`);
        drives.push({port, meanDrive: d.mean, lastDrive: d.last, brakingTicks: d.brakingTicks, ticks: d.ticks});
        motors.push({port, position: m.position, speedDps: m.speedDps});
    }
    return {frame, clockNs: frame.clockNs, seq: frame.seq, drives, motors};
};

/**
 * One port's drive report as a physics PortDrive: duty = mean/10000 (the zero-order
 * hold over the quantum, §1.5 item 2). Decay, as the plan reads the board's waveform
 * (§2.1; Infra owner question 2 is open): the accepted PWM — active-low on one leg,
 * the other leg high — shorts the winding in its off phase, so a driven quantum is
 * 'brake' (slow decay); an undriven quantum is 'brake' when the bridge braked for at
 * least half its ticks, else 'coast' (neither leg driven: the winding floats).
 */
export const driveToPortDrive = ({port, meanDrive, brakingTicks, ticks}) => {
    const duty = meanDrive / DRIVE_FULL_SCALE;
    const decay = duty !== 0 || 2 * brakingTicks >= ticks ? 'brake' : 'coast';
    return {port, mode: 'pwm', duty, decay};
};

/** The `arena.inputs` sensor values for a Robot Lab probe reading (renode-arena-bridge.js inputs()). */
export const sensorValues = (kind, raw) => {
    if (kind === 'color') {
        return {colorId: !(raw.color >= 0) ? 255 : raw.color, reflectionPercent: Math.round(raw.reflection || 0), ambientPercent: 0};
    }
    if (kind === 'distance') return {distanceMillimeters: Math.round(Number.isFinite(raw.distance) ? raw.distance : -1)};
    if (kind === 'force') return {forcePercent: Math.round(raw.force || 0), pressed: Boolean(raw.pressed)};
    throw new TypeError(`no LPF2 sensor model for '${kind}'`);
};

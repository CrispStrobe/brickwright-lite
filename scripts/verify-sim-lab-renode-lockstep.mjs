#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Robot Lab R13e, headless (docs/ROBOT-LAB-SPIKE-EMULATION.md §4 R13e, §7):
// the REAL SPIKE NuttX firmware in a REAL Renode, in lockstep with the Robot
// Lab physics, driving the shipped S1 driving base — no GUI, no Tauri.
//
//   Renode (stock 1.16.1 + the restaged lockstep package, launched with the
//   desktop supervisor's own monitor commands)
//     <- state service TCP (newline JSON, exactly as BrickStateFeed speaks it)
//     <- StateServiceTransport (below)  {call(op, args)} with the broker op names
//     <- openLockstepRoute (routes/renode-lockstep/route.js) — THE GUI's route code:
//        compileRouteProgram → LockstepProgram.upload (program.packet BEGIN/CHUNK/COMMIT,
//        guest free-running) → RenodeLockstepDriver.begin → START/STOP through
//        program.control.submit, the replies read from the step snapshots
//     <- SpikeFirmwareVirtualHub (hubs/spike/spike-firmware-hub.js, unchanged)
//     <- SimSession in-thread, one physics step per exchange (runner.js)
// Only the session's lifecycle differs from the pane: this script launched Renode
// itself (manageSession: false), where the pane's driver calls session.start/run.
//
// ONE Scratch program — the plan's R13e program (§4): both wheels forward at 300 °/s
// (tank 27 %) for 2 s, then stop — runs through both routes (BW_SIMLAB_SPEED_PCT and
// BW_SIMLAB_DRIVE_S change it; 30 % for 1.08 s is "≈ 360° of wheel"):
//   firmware: SB3Creator -> compileRouteProgram (the pane's call of the desktop's own
//             Scratch-to-firmware compiler) -> program ABI v1 -> the route's upload
//             (before lockstep) and START (inside it: deferred control) ->
//             the firmware's PI speed loop on the encoders, which ARE the physics;
//   Scratch:  test/helpers/sim-lab-vm.mjs (VM + spikeprime extension + virtual hub).
// (A two-wheel "run 360 degrees" has no firmware form: ABI op 6 moves one motor
// and blocks, and compileFirmwareProgram refuses two-motor position moves.)
//
// Measures and checks: encoder (the emulator's external shaft) vs physics per
// step (≤ 1°), the firmware's own LPF2 POS reading vs physics, distance vs the
// Scratch route (within 5 %), boot time, real-time factor. Every request is also
// passed through the desktop broker's closed validator (arena-inputs.js).
//
// Opt-in: needs a Renode executable and a lockstep-capable NuttX package
// (scripts/restage-spike-nuttx-package.mjs). Without them it SKIPS with a clear
// message and exits 0 (CI has no Renode).
//
//   BW_RENODE=/path/to/renode BW_SIMLAB_NUTTX_PACKAGE=/path/to/package \
//     node scripts/verify-sim-lab-renode-lockstep.mjs [--json out.json]

import {spawn} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const DEFAULT_RENODE = '/Volumes/backups/code/lego/tools/renode-1.16.1/Renode.app/Contents/MacOS/renode';
const DEFAULT_PACKAGE = '/Volumes/backups/code/lego/renode-lockstep-work/nuttx-pkg-lockstep';
const RENODE = process.env.BW_RENODE || DEFAULT_RENODE;
const PACKAGE = process.env.BW_SIMLAB_NUTTX_PACKAGE || DEFAULT_PACKAGE;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const BUDGET_MS = Number(process.env.BW_SIMLAB_BUDGET_MS || 6000);
const SPEED_PCT = Number(process.env.BW_SIMLAB_SPEED_PCT || 27);

const skip = why => {
    console.log(`SKIP verify-sim-lab-renode-lockstep: ${why}`);
    console.log('  Set BW_RENODE (a Renode 1.16.1 executable) and BW_SIMLAB_NUTTX_PACKAGE (a package from');
    console.log('  scripts/restage-spike-nuttx-package.mjs whose state service imports spike_lockstep).');
    process.exit(0);
};
if (!existsSync(RENODE)) skip(`no Renode at ${RENODE}`);
for (const f of ['nuttx.resc', 'nuttx-kernel.elf', 'nuttx-user.elf', 'state-config.json', 'scripts/spike-state-server.py', 'tools/spike_lockstep.py']) {
    if (!existsSync(path.join(PACKAGE, f))) skip(`the package ${PACKAGE} has no ${f} (not lockstep-capable)`);
}

const {SimSession, catalogFrom, MODELS_BASE} = await import(path.join(SIM, 'sim-session.js'));
const {loadJolt} = await import(path.join(SIM, 'physics/jolt-core.js'));
const {openLockstepRoute, compileRouteProgram} = await import(path.join(SIM, 'routes/renode-lockstep/route.js'));
const {LOCKSTEP_OPS} = await import(path.join(SIM, 'routes/renode-lockstep/contract.js'));
const {default: VirtualSpikeHubState} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js'));
const {PROGRAM_STATE, PROGRAM_OP} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js'));
const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
const {runOnSimLab} = await import(path.join(ROOT, 'test/helpers/sim-lab-vm.mjs'));
const require_ = createRequire(import.meta.url);
const {validLockstepBegin, validLockstepStep, validLockstepEnd, validNuttxProgramControl, validNuttxPacket} =
    require_(path.join(ROOT, 'overlay/scratch-vm/src/extension-support/arena-inputs.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const MODEL_TEXT = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, 'driving-base.ldr'), 'latin1');
const DEG = 180 / Math.PI;
const now = () => performance.now();

/** The °/s the Scratch route's `set movement speed 30` means for the base's medium motors. */
const scratchDps = (() => {
    const hub = new VirtualSpikeHubState();
    hub.data.sensors[0] = {kind: 'motor', deviceId: 48};
    return Math.round(hub.backend.percentToDps(0, SPEED_PCT));
})();
const DRIVE_S = Number(process.env.BW_SIMLAB_DRIVE_S || 2);
// BW_SIMLAB_FORM=move: the same drive as the pseudocode's `move forward … seconds` (the
// compiler's movement form, at `set movement speed`), instead of `start tank` + `wait`.
const FORM = process.env.BW_SIMLAB_FORM || 'tank';
const SCRATCH_BODY = FORM === 'move' ?
    `  set movement speed ${SPEED_PCT}\n  move forward ${DRIVE_S} seconds\n` :
    `  start tank ${SPEED_PCT} ${SPEED_PCT}\n  wait ${DRIVE_S} seconds\n  stop movement\n`;
/** The block tree as the VM deserializes it (literal tuples -> shadow blocks), for compileFirmwareProgram. */
const asVm = source => {
    const creator = new SB3Creator();
    creator.parse(source);
    if (creator.warnings.length) throw new Error(`the program does not parse: ${creator.warnings.join('; ')}`);
    const targets = creator.project.targets.map(t => {
        const blocks = structuredClone(t.blocks);
        let serial = 0;
        for (const block of Object.values(blocks)) {
            block.fields = Object.fromEntries(Object.entries(block.fields).map(([k, v]) => [k, {value: v[0]}]));
            block.inputs = Object.fromEntries(Object.entries(block.inputs).map(([k, v]) => {
                if (typeof v[1] === 'string') return [k, {block: v[1]}];
                const shadow = `literal-${serial++}`;
                blocks[shadow] = {opcode: 'text', shadow: true, fields: {TEXT: {value: v[1][1]}}};
                return [k, {block: shadow}];
            }));
        }
        return {isOriginal: true, blocks: {_blocks: blocks, getScripts: () => Object.keys(blocks).filter(id => blocks[id].topLevel)}};
    });
    return {runtime: {targets}};
};
const COMPILED = compileRouteProgram(asVm(`DEVICE SPIKE\nWHEN flag clicked:\n${SCRATCH_BODY}`));
if (COMPILED.error) throw COMPILED.error;
const PROGRAM = COMPILED.program;

const freePort = () => new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); });
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const monitorPath = p => `@${p.replace(/ /g, '\\ ')}`;

/** Launches Renode exactly as RenodeSupervisor::start_spike_profile does for NuttX (no GDB server: no debugger holds the CPU). */
const launchRenode = async () => {
    const config = JSON.parse(readFileSync(path.join(PACKAGE, 'state-config.json'), 'utf8'));
    const [monitorPort, statePort] = [await freePort(), await freePort()];
    const args = ['--disable-gui', '--hide-log', '-P', String(monitorPort),
        '-e', `include ${monitorPath(path.join(PACKAGE, 'nuttx.resc'))}`,
        '-e', `sysbus LoadELF ${monitorPath(path.join(PACKAGE, 'nuttx-user.elf'))}`,
        '-e', `sysbus LoadELF ${monitorPath(path.join(PACKAGE, 'nuttx-kernel.elf'))}`,
        '-e', 'cpu VectorTableOffset 0x08008000', '-e', `cpu SP ${config.boot.stack}`, '-e', `cpu PC ${config.boot.reset}`,
        '-e', 'emulation RunFor "1.0"',
        '-e', `include ${monitorPath(path.join(PACKAGE, 'scripts/spike-state-server.py'))}`,
        '-e', `spike_state_start "127.0.0.1" ${statePort} ${monitorPath(path.join(PACKAGE, 'state-config.json'))}`];
    const started = now();
    const child = spawn(RENODE, args, {cwd: PACKAGE, stdio: ['ignore', 'pipe', 'pipe'],
        env: {...process.env, ...(process.platform === 'darwin' ? {DOTNET_DefaultStackSize: '0x4000000'} : {})}});
    let tail = '';
    const keep = d => { tail = (tail + d).slice(-4000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let exited = null;
    child.on('exit', code => { exited = code; });
    for (;;) {
        if (exited !== null) throw new Error(`Renode exited (${exited}) before its state service listened:\n${tail}`);
        if (now() - started > 600000) throw new Error('Renode did not start its state service within 600 s');
        const ok = await new Promise(resolve => {
            const s = net.connect(statePort, '127.0.0.1');
            s.once('connect', () => { s.destroy(); resolve(true); });
            s.once('error', () => resolve(false));
        });
        if (ok) break;
        await pause(100);
    }
    return {child, monitorPort, statePort, bootWallMs: now() - started, tail: () => tail};
};

/** `start` over Renode's telnet monitor; returns once the emulation has started. */
const monitorCommand = (port, command) => new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1');
    let out = '';
    let sent = false;
    const timer = setTimeout(() => { s.destroy(); reject(new Error(`monitor '${command}' timed out: ${out}`)); }, 30000);
    s.on('data', d => {
        out += d.toString('latin1').replace(/\x1b\[[0-9;]*m/g, '');
        // The state service may print between prompts (a probe connection it dropped): match, never anchor.
        if (!sent && /\(machine-0\)/.test(out)) { sent = true; out = ''; s.write(`${command}\n`); return; }
        if (sent && /Starting emulation[\s\S]*\(machine-0\)/.test(out)) { clearTimeout(timer); s.destroy(); resolve(out); }
    });
    s.on('error', e => { clearTimeout(timer); reject(e); });
});

/**
 * The state service client: what BrickStateFeed (renode_brick_state.rs) does, in JS —
 * {schemaVersion, type: 'command', requestId, expectedSeq, command, arguments} out; a
 * `result` line, then the next snapshot, back. Exposed as a lockstep transport with the
 * broker's operation names, the replies shaped as the broker returns them.
 */
class StateServiceTransport {
    constructor (port) {
        this.port = port;
        this.lines = [];
        this.waiters = [];
        this.latest = null;
        this.next = 1;
        this.validated = {begin: 0, step: 0, end: 0, control: 0, packet: 0};
        /** One command at a time, as the native capability queue sends them. */
        this.tail = Promise.resolve();
        /** Every operation the route sent, in order (steps folded): the GUI route's sequence. */
        this.ops = [];
    }

    async connect () {
        this.socket = net.connect(this.port, '127.0.0.1');
        this.socket.setNoDelay(true);
        let pending = '';
        this.socket.on('data', d => {
            pending += d.toString('utf8');
            let i;
            while ((i = pending.indexOf('\n')) >= 0) {
                const line = JSON.parse(pending.slice(0, i));
                pending = pending.slice(i + 1);
                if (line.type === 'snapshot') this.latest = line;
                this.lines.push(line);
                this.waiters.splice(0).forEach(w => w());
            }
        });
        await new Promise((resolve, reject) => { this.socket.once('connect', resolve); this.socket.once('error', reject); });
        await this._take(l => l.type === 'snapshot', 10000);
    }

    async _take (match, timeoutMs) {
        const deadline = now() + timeoutMs;
        for (;;) {
            const i = this.lines.findIndex(match);
            if (i >= 0) return this.lines.splice(0, i + 1).at(-1);
            const left = deadline - now();
            if (left <= 0) throw new Error('state service reply timed out');
            await new Promise(resolve => {
                const t = setTimeout(resolve, left);
                this.waiters.push(() => { clearTimeout(t); resolve(); });
            });
        }
    }

    /** One command; resolves to {result, snapshot} (the snapshot the service sends after the result). */
    async command (command, args, timeoutMs = 10000) {
        const requestId = `r13e-${this.next++}`;
        const seq = this.latest.seq;
        this.lines = this.lines.filter(l => l.type !== 'snapshot');
        this.socket.write(`${JSON.stringify({schemaVersion: 1, type: 'command', requestId, expectedSeq: seq, command, arguments: args})}\n`);
        const result = await this._take(l => l.type === 'result' && l.requestId === requestId, timeoutMs);
        const snapshot = await this._take(l => l.type === 'snapshot' && l.seq > seq, timeoutMs);
        if (!result.accepted) throw new Error(`${command} refused: ${result.error}`);
        return {result, snapshot};
    }

    /** The lockstep transport ({call(op, args)}) the route uses: serialized like the broker's queue. */
    call (operation, args) {
        if (this.ops.at(-1)?.op !== operation || operation !== LOCKSTEP_OPS.step) this.ops.push({op: operation, n: 0});
        this.ops.at(-1).n++;
        const next = this.tail.then(() => this._call(operation, args));
        this.tail = next.catch(() => {});
        return next;
    }

    async _call (operation, args) {
        switch (operation) {
        case LOCKSTEP_OPS.stateRead: return this.latest;
        case LOCKSTEP_OPS.begin:
            if (!validLockstepBegin(args)) throw new Error('the broker would refuse this lockstep.begin');
            this.validated.begin++;
            return (await this.command('lockstep.begin', args)).result.data;
        case LOCKSTEP_OPS.step:
            if (!validLockstepStep(args)) throw new Error(`the broker would refuse this lockstep.step: ${JSON.stringify(args)}`);
            this.validated.step++;
            return (await this.command('lockstep.step', args)).result.data;
        case LOCKSTEP_OPS.end:
            if (!validLockstepEnd(args)) throw new Error('the broker would refuse this lockstep.end');
            this.validated.end++;
            return (await this.command('lockstep.end', args)).result.data;
        // renode.spike.program.packet: one NuttX program packet, acknowledged by the running
        // firmware; the broker returns the snapshot after it (renode_debugger.rs spike_program_packet).
        case LOCKSTEP_OPS.programPacket:
            if (!validNuttxPacket(args)) throw new Error('the broker would refuse this program packet');
            this.validated.packet++;
            return (await this.command('nuttx.program.packet', args, 15000)).snapshot;
        // renode.spike.program.control.submit: START/STOP that returns at once (inside lockstep);
        // the broker returns {snapshot, data: {requestSeq}} (spike_program_control).
        case LOCKSTEP_OPS.programControl: {
            if (!validNuttxProgramControl(args)) throw new Error('the broker would refuse this program control');
            this.validated.control++;
            const {result, snapshot} = await this.command('nuttx.program.control.submit', args);
            return {snapshot, data: result.data};
        }
        default: throw new Error(`no '${operation}' in the headless transport`);
        }
    }

    close () {
        this.socket?.destroy();
    }
}

const rotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
const along = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
/** Heading (degrees about the vertical) of a pose's forward axis. */
const yaw = q => { const f = rotate(q, [1, 0, 0]); return Math.atan2(-f[2], f[0]) * DEG; };
const turn = (q0, q1) => ((yaw(q1) - yaw(q0) + 540) % 360) - 180;
const percentile = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const report = {renode: RENODE, package: PACKAGE, program: PROGRAM, scratchDps};
let renode = null;
let transport = null;
const failures = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
try {
    renode = await launchRenode();
    report.bootWallMs = Math.round(renode.bootWallMs);
    console.log(`Renode up (models compiled, NuttX booted 1.0 s virtual) in ${(renode.bootWallMs / 1000).toFixed(1)} s wall`);
    // The state service drops a client idle for 5 s (socketTimeoutSeconds): everything slow
    // (the monitor's `start`, loading Jolt) happens before the client connects.
    await monitorCommand(renode.monitorPort, 'start');
    await loadJolt();
    transport = new StateServiceTransport(renode.statePort);
    await transport.connect();
    const first = transport.latest;
    report.capabilities = first.target.capabilities;
    report.imageSha256 = first.target.imageSha256;
    check(first.target.capabilities.includes('lockstep/v1') && first.target.capabilities.includes('nuttx-program-deferred-start/v1'),
        'the running target advertises lockstep/v1 and nuttx-program-deferred-start/v1');

    // The GUI's route: upload while the guest runs (BEGIN/CHUNK/COMMIT through
    // program.packet), then lockstep.begin; the S1 scene on the route's createHub.
    const uploadStarted = now();
    let uploadWallMs = null;
    let hub = null;
    const route = await openLockstepRoute({transport, manageSession: false, program: PROGRAM});
    const {driver, program} = route;
    uploadWallMs = Math.round(now() - uploadStarted);
    report.uploadWallMs = uploadWallMs;
    report.t0Ns = driver.t0Ns;
    const packets = transport.ops.filter(o => o.op === LOCKSTEP_OPS.programPacket).reduce((n, o) => n + o.n, 0);
    check(program.uploaded && program.stateName === 'ready' && packets === 2 + Math.ceil(PROGRAM.instructions.length * 16 / 10),
        `the route uploaded the compiled program before lockstep: ${packets} packets, state ${program.stateName} (${uploadWallMs} ms wall incl. lockstep.begin)`);
    const {session, issues} = await SimSession.fromText(MODEL_TEXT, {hubState: null, catalog: CATALOG,
        createHub: def => (hub = route.createHub(def))});
    check(session.lockstep === true && hub !== null, `the S1 scene runs in-thread in lockstep (issues: ${issues.filter(i => i.severity === 'error').length} errors)`);
    hub.sent = [];
    // Run: the route's START (program.control.submit, deferred inside lockstep).
    await program.start();
    report.startRequestSeq = program.sent[0]?.requestSeq ?? null;

    const mech = session.mechanism;
    const hubBody = mech.bodies.find(b => b.id === session.hubs[0].body);
    const hinges = mech.joints.filter(j => j.motor);
    const byPort = new Map(mech.actuators.map(a => [a.port, a.joint]));
    const angle0 = new Map([...byPort].map(([port, joint]) => [port, session.core.jointState(joint).angle]));
    const axle0 = [0, 1, 2].map(i => hinges.reduce((sum, j) => sum + j.point[i], 0) / hinges.length);
    const axle = () => {
        const pose = session.core.bodyPose(hubBody.id);
        return rotate(pose.rotation, [0, 1, 2].map(i => axle0[i] - hubBody.position[i])).map((v, i) => v + pose.position[i]);
    };
    const start = axle();
    const pose0 = session.core.bodyPose(hubBody.id).rotation;
    const steps = [];
    const wall0 = now();
    let state = null;
    let seenRunning = false;
    let doneAt = null;
    while (session.time < BUDGET_MS) {
        const t0 = now();
        session.tick(5);
        await session.idle();
        const p = hub.read.frame.lifecycle.nuttxProgram;
        state = p.state;
        if (state !== program.state) throw new Error(`the route's program state ${program.state} is not the snapshot's ${state}`);
        if (state === PROGRAM_STATE.RUNNING) seenRunning = true;
        steps.push({t: session.time, wallMs: now() - t0,
            angles: Object.fromEntries([...byPort].map(([port, joint]) => [port, (session.core.jointState(joint).angle - angle0.get(port)) * DEG])),
            guest: Object.fromEntries(hub.read.motors.map(m => [m.port, m.position])),
            firmware: {A: p.positions[0], B: p.positions[1]},
            duty: {A: p.duties[0], B: p.duties[1]}, fwClockMs: p.clockMs, clockNs: hub.read.clockNs,
            drives: hub.readDrives(), state});
        // After the program ends, 300 ms more so the base comes to rest (the Scratch run does too).
        if (seenRunning && state !== PROGRAM_STATE.RUNNING && (doneAt ??= session.time) <= session.time - 300) break;
        if (steps.length % 100 === 0) {
            const s = steps.at(-1);
            console.log(`  t=${s.t} ms  A ${s.angles.A.toFixed(1)}°  B ${s.angles.B.toFixed(1)}°  duty ${s.duty.A}/${s.duty.B}  state ${state}  ${(s.wallMs).toFixed(0)} ms/step`);
        }
    }
    const wallMs = now() - wall0;
    const end = axle();
    report.firmwareHeadingDeg = +turn(pose0, session.core.bodyPose(hubBody.id).rotation).toFixed(2);
    check(program.sent.length === 1 && program.sent[0].op === PROGRAM_OP.START && program.lastReplyOp === PROGRAM_OP.START && !program.failed,
        'the firmware answered the route\'s START (reply read from a step snapshot)');

    // Run again, then Pause mid-drive, as the pane does: START after a completed run goes out
    // as STOP + START (one mailbox request at a time, told apart by their operation), and
    // Pause is STOP with the clock running until the firmware has taken it.
    await program.start();
    let again = 0;
    while (program.state !== PROGRAM_STATE.RUNNING && again < 100) { session.tick(5); await session.idle(); again++; }
    const runningAgain = program.state === PROGRAM_STATE.RUNNING;
    for (let k = 0; k < 60; k++) { session.tick(5); await session.idle(); }
    const before = {...hub.read.motors.reduce((o, m) => ({...o, [m.port]: m.position}), {})};
    await program.stop();
    let stopSteps = 0;
    while (!(program.idle && program.state === PROGRAM_STATE.STOPPED) && stopSteps < 100) { session.tick(5); await session.idle(); stopSteps++; }
    for (let k = 0; k < 60; k++) { session.tick(5); await session.idle(); }
    const after = hub.read.motors.reduce((o, m) => ({...o, [m.port]: m.position}), {});
    report.rerun = {stepsToRunning: again, stepsToStopped: stopSteps, controls: program.sent.map(c => c.op),
        coastAfterStopDeg: Object.fromEntries(Object.keys(after).map(port => [port, +(after[port] - before[port]).toFixed(1)])),
        finalWheelSpeedDps: Object.fromEntries(hub.read.motors.map(m => [m.port, +m.speedDps.toFixed(1)])),
        finalDrives: hub.read.drives.map(d => ({port: d.port, meanDrive: d.meanDrive, brakingTicks: d.brakingTicks, ticks: d.ticks}))};
    check(runningAgain && program.state === PROGRAM_STATE.STOPPED && program.sent.map(c => c.op).join(',') === '3,4,3,4' &&
        hub.read.drives.every(d => d.meanDrive === 0 && d.brakingTicks === d.ticks),
        `Run again + Pause: controls ${report.rerun.controls.join(',')} (START, STOP, START, STOP), RUNNING after ${again} steps, STOPPED after ${stopSteps}; ` +
        `the firmware brakes both bridges (wheel speed 300 ms later ${JSON.stringify(report.rerun.finalWheelSpeedDps)} °/s)`);
    await driver.end();
    session.dispose();
    // The route's sequence of broker operations, steps folded.
    report.routeSequence = transport.ops.map(o => (o.n > 1 ? `${o.op.replace('renode.spike.', '')}×${o.n}` : o.op.replace('renode.spike.', '')));
    console.log(`route sequence: ${report.routeSequence.join(' → ')}`);

    // Encoder = physics: the emulator's motor position at the end of quantum k (its external
    // shaft, anchored at the physics angle sent at t_k, extrapolated by the sent speed) vs the
    // physics hinge at the end of step k; and the firmware's own POS reading (integer degrees,
    // LPF2 report every 10 ms) vs the physics.
    let worstGuest = 0;
    let worstFirmware = 0;
    let worstShaft = 0;
    for (let k = 0; k < steps.length; k++) {
        for (const port of ['A', 'B']) {
            worstGuest = Math.max(worstGuest, Math.abs(steps[k].guest[port] - steps[k].angles[port]));
            // The program status' positions are live only while the program runs.
            if (steps[k].state === PROGRAM_STATE.RUNNING) worstFirmware = Math.max(worstFirmware, Math.abs(steps[k].firmware[port] - steps[k].angles[port]));
        }
        const physics = k === 0 ? {A: 0, B: 0} : steps[k - 1].angles;
        for (const s of hub.sent[k].shafts) worstShaft = Math.max(worstShaft, Math.abs(s.positionMdeg / 1000 - physics[s.port]));
    }
    const last = steps.at(-1);
    const firmwareDistance = along(start, end);
    const exch = steps.map(s => s.wallMs);
    Object.assign(report, {steps: steps.length, simulatedMs: last.t, wallMs: Math.round(wallMs), programState: state,
        realTimeFactor: +(last.t / wallMs).toFixed(4),
        stepWallMs: {median: +percentile(exch, 0.5).toFixed(1), p90: +percentile(exch, 0.9).toFixed(1), max: +Math.max(...exch).toFixed(1)},
        wheels: {A: +last.angles.A.toFixed(2), B: +last.angles.B.toFixed(2)},
        worstShaftVsPhysicsDeg: +worstShaft.toFixed(4), worstGuestVsPhysicsDeg: +worstGuest.toFixed(4), worstFirmwarePosVsPhysicsDeg: +worstFirmware.toFixed(3),
        // The firmware's own millisecond clock against Renode's virtual time over the run.
        firmwareClockRate: +((last.fwClockMs - steps[0].fwClockMs) / ((last.clockNs - steps[0].clockNs) / 1e6)).toFixed(5),
        // Steady wheel speed over the middle half of the drive (physics), against the commanded one.
        maxDuty: Math.max(...steps.map(s => Math.max(Math.abs(s.duty.A), Math.abs(s.duty.B)))),
        firmwareDistanceMm: +(firmwareDistance * 1000).toFixed(1), validated: transport.validated});
    console.log(`${steps.length} steps (${last.t} ms simulated) in ${(wallMs / 1000).toFixed(1)} s wall: real-time factor ${report.realTimeFactor}; ` +
        `step wall median ${report.stepWallMs.median} ms, p90 ${report.stepWallMs.p90} ms`);
    const mid = steps.filter(x => x.t >= DRIVE_S * 250 && x.t <= DRIVE_S * 750);
    report.steadySpeedDps = +((mid.at(-1).angles.B - mid[0].angles.B) / ((mid.at(-1).t - mid[0].t) / 1000)).toFixed(1);
    console.log(`firmware clock ${report.firmwareClockRate} ms per virtual ms; steady wheel speed ${report.steadySpeedDps} °/s (commanded ${PROGRAM.instructions[1][2]})`);
    console.log(`wheels A ${report.wheels.A}°, B ${report.wheels.B}°; firmware program state ${state}; distance ${report.firmwareDistanceMm} mm`);
    check(seenRunning && state === PROGRAM_STATE.COMPLETE, `the firmware program ran and completed (final state ${state})`);
    check(worstShaft <= 0.0005 + 1e-9, `shafts sent = physics hinge angles to the milli-degree (worst ${worstShaft.toFixed(5)}°)`);
    check(worstGuest <= 1, `emulator encoders follow the physics within 1° (worst ${worstGuest.toFixed(4)}°)`);
    console.log(`     (the firmware's own LPF2 POS reading while running, integer degrees reported every 10 ms: worst ${worstFirmware.toFixed(2)}° from the physics)`);
    check(Math.abs(last.angles.A + last.angles.B) <= 0.05 * Math.abs(last.angles.B), `both wheels turned alike (A ${last.angles.A.toFixed(1)}°, B ${last.angles.B.toFixed(1)}°)`);
    check(transport.validated.step === hub.exchanges && transport.validated.packet === transport.ops.filter(o => o.op === LOCKSTEP_OPS.programPacket).reduce((n, o) => n + o.n, 0),
        `every step (${hub.exchanges}), program packet (${transport.validated.packet}) and control (${transport.validated.control}) request passed the desktop broker's validator`);

    const {track, hubId} = await runOnSimLab(`DEVICE SPIKE\nWHEN flag clicked:\n${SCRATCH_BODY}`, {modelText: MODEL_TEXT, timeLimitMs: DRIVE_S * 1000 + 2000});
    const scratch = along(track[0].axle, track.at(-1).axle);
    report.scratchDistanceMm = +(scratch * 1000).toFixed(1);
    report.scratchHeadingDeg = +turn(track[0].bodies[hubId].rotation, track.at(-1).bodies[hubId].rotation).toFixed(2);
    check(Math.abs(report.firmwareHeadingDeg - report.scratchHeadingDeg) <= 3,
        `heading firmware ${report.firmwareHeadingDeg}° vs Scratch ${report.scratchHeadingDeg}° (within 3°)`);
    // The Scratch route's wheel angles (its virtual hub's controller), to separate controller from physics.
    const scratchMech = (await import(path.join(SIM, 'sim-session.js'))).prepareModel(MODEL_TEXT, CATALOG, {mat: null}).mechanism;
    const jointOf = new Map(scratchMech.actuators.map(a => [a.port, a.joint]));
    const wheel = (entry, port) => entry.joints[jointOf.get(port)].angle * DEG;
    report.scratchWheels = Object.fromEntries(['A', 'B'].map(port => [port, +(wheel(track.at(-1), port) - wheel(track[0], port)).toFixed(2)]));
    report.scratchTrace = track.filter((_, i) => i % 3 === 0).map(e => ({t: Math.round(e.t), A: +(wheel(e, 'A') - wheel(track[0], 'A')).toFixed(1), B: +(wheel(e, 'B') - wheel(track[0], 'B')).toFixed(1)}));
    const perDeg = (mm, w) => mm / ((Math.abs(w.A) + Math.abs(w.B)) / 2);
    report.mmPerWheelDegree = {firmware: +perDeg(report.firmwareDistanceMm, report.wheels).toFixed(4), scratch: +perDeg(report.scratchDistanceMm, report.scratchWheels).toFixed(4)};
    console.log(`Scratch route: wheels A ${report.scratchWheels.A}°, B ${report.scratchWheels.B}°; mm per wheel degree firmware ${report.mmPerWheelDegree.firmware}, Scratch ${report.mmPerWheelDegree.scratch}`);
    report.distanceRatio = +(firmwareDistance / scratch).toFixed(4);
    check(Math.abs(report.mmPerWheelDegree.firmware / report.mmPerWheelDegree.scratch - 1) < 0.01,
        'the physics is one physics: distance per wheel degree agrees within 1 % across the routes');
    // The R13e acceptance: the same program's distance within 5 %. A miss here with the line above
    // passing is the two motor controllers (firmware PI + 2000 °/s² ramp vs the virtual hub's), not the physics.
    check(Math.abs(report.distanceRatio - 1) < 0.05, `distance firmware ${report.firmwareDistanceMm} mm vs Scratch ${report.scratchDistanceMm} mm: ratio ${report.distanceRatio} (within 5 %)`);
    report.trace = steps.filter((_, k) => k % 10 === 0 || k === steps.length - 1).map(s => ({t: s.t, angles: s.angles, guest: s.guest, firmware: s.firmware, duty: s.duty, state: s.state, fwClockMs: s.fwClockMs}));
} catch (error) {
    failures.push(error.message);
    console.error(`FAIL ${error.stack}`);
    if (renode) console.error(renode.tail());
} finally {
    transport?.close();
    renode?.child.kill('SIGKILL');
}
report.failures = failures;
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
console.log(failures.length ? `R13e headless lockstep: ${failures.length} failure(s)` : 'R13e headless lockstep: all checks passed');
process.exit(failures.length ? 1 : 0);

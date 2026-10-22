// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Shared real state-service transport for the Lab guest qualification scripts.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {LOCKSTEP_OPS} from '../../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/contract.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require_ = createRequire(import.meta.url);
const {validLockstepBegin, validLockstepStep, validLockstepEnd, validNuttxProgramControl, validNuttxPacket} =
    require_(path.join(ROOT, 'overlay/scratch-vm/src/extension-support/arena-inputs.js'));
const now = () => performance.now();

const freePort = () => new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => resolve(port)); });
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const monitorPath = p => `@${p.replace(/ /g, '\\ ')}`;

/** Launches Renode exactly as RenodeSupervisor::start_spike_profile does for NuttX (no GDB server: no debugger holds the CPU). */
export const launchRenode = async (RENODE, PACKAGE) => {
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
    const tail = await waitForRenodeStateService(child, statePort);
    return {child, monitorPort, statePort, bootWallMs: now() - started, tail};
};

// Separate child-startup supervision from the guest protocol so failures can be
// tested without running a firmware guest. Only this launcher's child is stopped.
export const waitForRenodeStateService = async (child, statePort, timeoutMs = 600000) => {
    const started = now();
    let tail = '';
    const keep = d => { tail = (tail + d).slice(-4000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let terminal = null;
    child.once('error', error => { terminal = `Renode spawn failed: ${error.code || error.message}`; });
    child.once('exit', (code, signal) => { terminal = `Renode exited (code=${code}, signal=${signal})`; });
    const closed = new Promise(resolve => child.once('close', resolve));
    try {
        for (;;) {
            if (terminal) throw new Error(`${terminal} before its state service listened`);
            if (now() - started > timeoutMs) throw new Error(`Renode did not start its state service within ${timeoutMs / 1000} s`);
            const ok = await new Promise(resolve => {
                const s = net.connect(statePort, '127.0.0.1');
                s.once('connect', () => { s.destroy(); resolve(true); });
                s.once('error', () => { s.destroy(); resolve(false); });
            });
            if (ok) return () => tail;
            await pause(100);
        }
    } catch (error) {
        if (child.pid && child.exitCode === null && child.signalCode === null) {
            child.kill('SIGTERM');
            await Promise.race([closed, pause(2000)]);
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }
        await Promise.race([closed, pause(2000)]);
        throw new Error(`${error.message}\nRenode startup output (last 4000 characters):\n${tail}`, {cause: error});
    }
};

/** `start` over Renode's telnet monitor; returns once the emulation has started. */
export const monitorCommand = (port, command) => new Promise((resolve, reject) => {
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
export class StateServiceTransport {
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


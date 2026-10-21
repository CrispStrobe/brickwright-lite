// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * One clock in the Robot Lab (docs/SIM-LAB-PLAN.md §4.9, "One clock";
 * overlay/scratch-gui/src/lib/bw-sim/sim-clock.js): the program's time and the
 * simulated time are the same clock, however slowly the physics worker answers.
 *
 * This runs the BROWSER's code path, not the headless lockstep of
 * test/helpers/sim-lab-vm.mjs: wall time is real, the Scratch VM steps on its
 * own setInterval (runtime.start(), 30 frames per second), the spikeprime
 * extension's timers are the adapter's (scratch-vm crispstrobe/adapter.js), the
 * physics runs in a real worker thread behind a SLOW TRANSPORT (every message to
 * it delayed by LATENCY_MS of wall time, as `--worker-latency` does in the
 * browser gate), and the pane's SimLabClock holds the VM back until the world
 * has caught up.
 *
 * The program: `wait 0.5 seconds`, `start moving`, `wait 1 seconds`, `stop
 * movement` on the S1 driving base. Judged from what the program and the world
 * each saw, never from the clock's own bookkeeping:
 *   - at EVERY VM step, the time the program reads (runtime.currentMSecs, what
 *     `wait` and `timer` use) has advanced exactly as far as the world
 *     (session.time) since the clock was installed;
 *   - the drive lasted 1.000 s of simulated time ± one VM frame (from the hub's
 *     motor controllers, sampled at every advance of the world);
 *   - it covered the same distance (± 1 %) with and without the slow transport;
 *   - the slow transport really was slow: the real-time factor dropped well below 1.
 *
 * And the judge can fail: the same slow transport with the pane's previous
 * clock (the world ticked by wall-clock frames, the program on wall time) ends
 * the 1 s drive early in simulated time.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const LATENCY_MS = 200;
const PROGRAM = 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  wait 0.5 seconds\n  start moving steering 0\n  wait 1 seconds\n  stop movement\n';
const DRIVE_MS = 1000;

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the program clock run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {loadSpikeProgram, registerVirtualHub} = await import('./helpers/spike-arena-vm.mjs');
    const {SimSession, catalogFrom, MODELS_BASE} = await import(path.join(SIM, 'sim-session.js'));
    const {SimLabClock} = await import(path.join(SIM, 'sim-clock.js'));
    const {PhysicsClient} = await import(path.join(SIM, 'physics', 'physics-client.js'));
    const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
    const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, 'driving-base.ldr'), 'latin1');
    const realTimeout = globalThis.setTimeout;
    const sleep = ms => new Promise(resolve => realTimeout(resolve, ms));

    /** A worker thread whose every incoming message is delayed by `latencyMs` of wall time. */
    const slowWorker = latencyMs => {
        const worker = new Worker(path.join(REPO, 'test/fixtures/bw-sim/physics-worker-host.mjs'), {argv: [fileURLToPath(import.meta.url)]});
        return {
            worker,
            port: {
                postMessage: (msg, transfer) => (latencyMs > 0 ? realTimeout(() => worker.postMessage(msg, transfer), latencyMs) : worker.postMessage(msg, transfer)),
                on: (event, fn) => worker.on(event, fn)
            }
        };
    };

    /**
     * The program on the driving base in real time. `clocked`: the pane's SimLabClock (what ships);
     * false: the pane's previous loop — the world ticked every 16 ms of wall time (clamped at 50 ms)
     * while the VM and the extension keep wall time.
     */
    /**
     * Wall-clock intervals the run starts (the extension's hub timer and locale poll never clear
     * theirs: in the browser the page lives on, here the process must end), cleared afterwards.
     */
    const trackIntervals = () => {
        const real = globalThis.setInterval;
        const made = [];
        globalThis.setInterval = (...args) => { const id = real(...args); made.push(id); return id; };
        return () => { globalThis.setInterval = real; for (const id of made) clearInterval(id); };
    };

    const run = async ({latencyMs, clocked, scale = 1}) => {
        const untrack = trackIntervals();
        const {hub, registration} = registerVirtualHub();
        const {worker, port} = slowWorker(latencyMs);
        const client = new PhysicsClient(port);
        let vm = null;
        let session = null;
        let clock = null;
        let ticker = null;
        try {
            ({session} = await SimSession.fromText(MODEL_TEXT, {hubState: hub, catalog: CATALOG, worker: client}));
            assert.equal(session.worker, true, `the physics runs in the worker: ${session.workerError}`);
            let extension;
            ({vm, extension} = await loadSpikeProgram(PROGRAM));
            vm.setCompatibilityMode(true);
            vm.start();
            extension.setConnectionMode({MODE: 'web-ble'});
            const connecting = extension.connectHub();
            for (let i = 0; i < 500 && !extension.isConnected(); i++) await sleep(10);
            await connecting;
            assert.ok(extension.isConnected(), 'the extension connected to the virtual hub');
            await sleep(300); // info response, device-notification request

            const samples = [];
            session.onAdvance(() => samples.push({t: session.time, driving: hub.motors.busy('A') && hub.motors.busy('B'),
                pose: session.core.bodyPose(session.bridge.hubBody).position.slice()}));
            const skews = [];
            const wall0 = performance.now();
            if (clocked) {
                clock = new SimLabClock();
                clock.timeScale = scale;
                clock.install(vm.runtime, session);
                // What the program reads at each step (_step emits ARCADE_FRAME right after it refreshes
                // currentMSecs) against what the world has applied, both since the clock went in.
                const program0 = vm.runtime.currentMSecs;
                const sim0 = session.time;
                vm.runtime.on('ARCADE_FRAME', () => skews.push((vm.runtime.currentMSecs - program0) - (session.time - sim0)));
            } else {
                let last = performance.now();
                ticker = setInterval(() => {
                    const now = performance.now();
                    session.tick(Math.min(50, now - last));
                    last = now;
                }, 16);
            }
            const start = session.time;
            vm.greenFlag();
            const deadline = performance.now() + 120000;
            let on = -1;
            let off = -1;
            for (;;) {
                await sleep(20);
                on = samples.findIndex(p => p.t > start && p.driving);
                off = on < 0 ? -1 : samples.findIndex((p, i) => i > on && !p.driving);
                // At rest: half a second of simulated time after the stop.
                if (off > 0 && session.time - samples[off].t > 500) break;
                if (session.failed) throw session.failed;
                assert.ok(performance.now() < deadline, `the program did not finish: ${JSON.stringify({on, off, time: session.time})}`);
            }
            const wallMs = performance.now() - wall0;
            const startedAt = samples[on - 1];
            const stoppedAt = samples[off - 1];
            const rest = samples.at(-1);
            return {
                spanMs: stoppedAt.t - startedAt.t,
                distance: Math.hypot(rest.pose[0] - startedAt.pose[0], rest.pose[2] - startedAt.pose[2]),
                frameMs: vm.runtime.currentStepTime,
                skews,
                rtf: (session.time - start) / wallMs,
                stats: {...session.stats},
                clockStats: clock ? {...clock.stats} : null
            };
        } finally {
            if (ticker) clearInterval(ticker);
            clock?.uninstall();
            try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
            session?.dispose();
            try { registration.unregister(); } catch { /* noop */ }
            await worker.terminate();
            untrack();
        }
    };

    const describe = r => `drove ${r.spanMs.toFixed(1)} ms simulated, ${(r.distance * 1000).toFixed(2)} mm; real-time factor ${r.rtf.toFixed(3)}; ` +
        `${r.stats.batches} batches, ${r.stats.redos} redone, ${r.stats.droppedMs} ms dropped` +
        (r.clockStats ? `; ${r.clockStats.steps} VM steps, ${r.clockStats.heldBack} held back for the world` : '');

    /**
     * Equal up to the rounding of a millisecond timestamp: currentMSecs is epoch (~1.7e12 ms) + program
     * ms, and a double that large resolves 2.4e-4 ms; a step of drift would be 33 ms.
     */
    const SAME_MS = 1e-3;

    let fast = null;

    test('one clock, fast worker: the program\'s 1 s drive is 1 s of simulated time, and program time is simulated time at every step', async t => {
        fast = await run({latencyMs: 0, clocked: true});
        t.diagnostic(`no latency: ${describe(fast)}`);
        assert.ok(Math.abs(fast.spanMs - DRIVE_MS) <= fast.frameMs + 1e-6, `the drive lasted ${fast.spanMs} ms simulated`);
        assert.ok(fast.skews.length > 30, `the VM stepped: ${fast.skews.length}`);
        assert.ok(fast.skews.every(s => Math.abs(s) < SAME_MS), `program time left simulated time: ${JSON.stringify(fast.skews.filter(s => Math.abs(s) >= SAME_MS).slice(0, 5))}`);
        assert.equal(fast.stats.droppedMs, 0, 'no simulated time was dropped');
    });

    for (const scale of [2, 4]) test(`one clock at ${scale}×: faster VM steps preserve drive duration, distance and timer alignment`, async t => {
        const accelerated = await run({latencyMs: 0, clocked: true, scale});
        t.diagnostic(`${scale}×: ${describe(accelerated)}`);
        assert.ok(accelerated.skews.length > 30 && accelerated.skews.every(s => Math.abs(s) < SAME_MS));
        assert.ok(Math.abs(accelerated.spanMs - DRIVE_MS) <= accelerated.frameMs + 1e-6);
        assert.ok(fast && Math.abs(accelerated.distance - fast.distance) <= 0.01 * fast.distance);
        assert.equal(accelerated.stats.droppedMs, 0);
        // RTF is reported, not gated: shared-host load and worker throughput
        // limit achievable speed. The scheduler control below proves extra steps.
    });

    test(`one clock, a worker ${LATENCY_MS} ms away: the program slows down with the world, the drive is the same`, async t => {
        const slow = await run({latencyMs: LATENCY_MS, clocked: true});
        t.diagnostic(`${LATENCY_MS} ms latency: ${describe(slow)}`);
        assert.ok(slow.rtf < 0.5, `the slow transport did slow the world down (real-time factor ${slow.rtf})`);
        assert.ok(slow.skews.length > 30 && slow.skews.every(s => Math.abs(s) < SAME_MS),
            `program time left simulated time: ${JSON.stringify(slow.skews.filter(s => Math.abs(s) >= SAME_MS).slice(0, 5))}`);
        assert.ok(Math.abs(slow.spanMs - DRIVE_MS) <= slow.frameMs + 1e-6, `the drive lasted ${slow.spanMs} ms simulated`);
        assert.ok(fast, 'the fast run ran first');
        assert.ok(Math.abs(slow.distance - fast.distance) <= 0.01 * fast.distance,
            `the drive covered ${slow.distance} m with the slow worker, ${fast.distance} m without`);
        assert.equal(slow.stats.droppedMs, 0, 'no simulated time was dropped');
    });

    test(`the judge can fail: wall-clock frames with a worker ${LATENCY_MS} ms away end the drive early in simulated time`, async t => {
        const old = await run({latencyMs: LATENCY_MS, clocked: false});
        t.diagnostic(`previous clock, ${LATENCY_MS} ms latency: ${describe(old)}`);
        assert.ok(old.spanMs < DRIVE_MS - 3 * old.frameMs, `the wall-clock run still drove ${old.spanMs} ms simulated`);
        assert.ok(fast && old.distance < 0.9 * fast.distance, `the wall-clock run still covered ${old.distance} m`);
    });
}

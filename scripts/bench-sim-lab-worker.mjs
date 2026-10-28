#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// How much MAIN-THREAD time one simulated second of the Sim Lab costs, with the
// physics on the main thread and with it in the worker (ROADMAP §4.9), for the
// S1 driving base and for a gear train of 100+ parts. Node's worker_threads run
// the same physics-host.js the browser's Web Worker runs; frames are 60 Hz and
// each frame waits for its batch (lockstep), so "main thread" is the time the
// UI thread is busy, not throughput.
//
//   node --import ./scripts/lib/register-gui-scope.mjs scripts/bench-sim-lab-worker.mjs [seconds]
//
// Main-thread time with the worker = tick() (export the controller state, post)
// + the reply's handling (compare, replay the controller, write the frames,
// mirror the poses). Round trip = post to reply, as the main thread sees it.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker, isMainThread, parentPort} from 'node:worker_threads';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const load = p => import(path.join(SIM, p));

if (!isMainThread) {
    const {createPhysicsHost} = await load('physics/physics-host.js');
    const {loadJolt, createPhysicsCore} = await load('physics/jolt-core.js');
    const {createSimRunner} = await load('sim-worker-protocol.js');
    const host = createPhysicsHost({loadJolt, createPhysicsCore, createSimRunner, post: (m, t) => parentPort.postMessage(m, t)});
    parentPort.on('message', m => host.handle(m));
} else {
    const {SimSession, prepareModel, catalogFrom, hubsOf} = await load('sim-session.js');
    const {compile} = await load('mech/compile.js');
    const {loadJolt} = await load('physics/jolt-core.js');
    const {PhysicsClient} = await load('physics/physics-client.js');
    const {default: HubState} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js'));
    const SECONDS = Number(process.argv[2]) || 10;
    const FRAME = 1000 / 60;
    const parts = JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8'));
    const CATALOG = catalogFrom(parts);

    /** Six bevel gearboxes on ports A–F and six idle 8-24-8 trains, housings clamped (test/bw-sim-gear-trains.test.mjs). */
    const gearTrain = () => {
        const fixture = name => JSON.parse(readFileSync(path.join(ROOT, `test/fixtures/bw-sim/gears/${name}.json`), 'utf8'));
        const model = {version: 1, parts: []};
        const copy = (name, k, port, dz) => {
            for (const p of fixture(name).parts) {
                model.parts.push({...p, id: `${name}-${k}-${p.id}`, position: [p.position[0] + k * 200, p.position[1], p.position[2] + dz],
                    ...(p.port ? {port} : {})});
            }
        };
        for (let k = 0; k < 6; k++) copy('bevel-12-20', k, 'ABCDEF'[k], 0);
        for (let k = 0; k < 6; k++) copy('8-24-8', k, undefined, 300);
        for (const p of model.parts) if (p.port === undefined) delete p.port;
        const mechanism = compile(model, CATALOG, {ground: false});
        for (const j of mechanism.joints.filter(x => x.motor)) {
            const housing = mechanism.bodies.find(b => b.id === j.body1);
            housing.motion = 'static';
            housing.massKg = 0;
        }
        for (const j of mechanism.joints.filter(x => x.type === 'hinge' && !x.motor && x.body1 !== 'world')) {
            const housing = mechanism.bodies.find(b => b.id === j.body1);
            if (housing && !mechanism.joints.some(x => x.body2 === housing.id)) { housing.motion = 'static'; housing.massKg = 0; }
        }
        // The first gearbox's frame carries the "hub" (a bench catalog says its beam is one):
        // the six motors are on its ports and the bridge drives them.
        const catalog = new Map(CATALOG);
        catalog.set('32524.dat', {...catalog.get('32524.dat'), hub: true});
        return {model, runModel: model, mechanism, catalog, parts: model.parts.length};
    };
    const drivingBase = () => {
        const text = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/driving-base.ldr'), 'latin1');
        const {model, runModel, mechanism} = prepareModel(text, CATALOG);
        return {model, runModel, mechanism, catalog: CATALOG, parts: model.parts.length};
    };

    const command = (hub, ports) => {
        if (ports.length === 2) { hub.motors.runAtSpeed('A', -555); hub.motors.runAtSpeed('B', 555); return; }
        for (const port of ports) hub.motors.runAtSpeed(port, 300);
    };

    const run = async (scene, worker) => {
        const hubState = new HubState();
        let session;
        if (worker) {
            const loaded = await worker.simLoad({mechanism: scene.mechanism, hubs: hubsOf(scene.model, scene.mechanism, scene.catalog), stepMs: 5});
            session = new SimSession({hubState, ...scene, worker, loaded});
        } else {
            session = new SimSession({hubState, ...scene, J: await loadJolt()});
        }
        const ports = [...new Set(scene.mechanism.joints.filter(j => j.motor).map(j => j.motor.port))];
        command(hubState, ports);
        // Warm up one simulated second, then measure.
        const frames = Math.round(SECONDS * 1000 / FRAME);
        let tickMs = 0;
        for (let i = 0; i < frames + 60; i++) {
            if (i === 60) { tickMs = 0; if (worker) Object.keys(session.stats).forEach(k => { session.stats[k] = 0; }); }
            const t0 = performance.now();
            session.tick(FRAME);
            tickMs += performance.now() - t0;
            await session.idle();
        }
        const s = session.stats;
        const out = worker ? {
            mainMsPerSimS: (tickMs + s.mainMs) / SECONDS,
            roundTripMs: s.roundTripMs / s.batches, maxRoundTripMs: s.maxRoundTripMs,
            workerMsPerSimS: s.workerMs / SECONDS, redos: s.redos, diverged: s.diverged
        } : {mainMsPerSimS: tickMs / SECONDS};
        out.encoderB = hubState.data.motors[1].position;
        session.dispose();
        return out;
    };

    const worker = new Worker(fileURLToPath(import.meta.url));
    const client = new PhysicsClient(worker);
    for (const [name, make] of [['S1 driving base', drivingBase], ['gear train', gearTrain]]) {
        const scene = make();
        const bodies = scene.mechanism.bodies.length;
        const here = await run(scene, null);
        const there = await run(make(), client);
        console.log(`${name} (${scene.parts} parts, ${bodies} bodies, ${scene.mechanism.joints.length} joints, ${scene.mechanism.gears.length} gear meshes), ${SECONDS} s simulated at 60 fps:`);
        if (here.encoderB !== there.encoderB) throw new Error(`the two runs differ: port B at ${here.encoderB} vs ${there.encoderB}`);
        console.log(`  (port B's encoder turned ${here.encoderB.toFixed(0)}° in both runs, to the last bit)`);
        console.log(`  main thread, physics here:       ${here.mainMsPerSimS.toFixed(1)} ms per simulated second`);
        console.log(`  main thread, physics in worker:  ${there.mainMsPerSimS.toFixed(1)} ms per simulated second ` +
            `(worker ${there.workerMsPerSimS.toFixed(1)} ms; round trip ${there.roundTripMs.toFixed(2)} ms mean, ${there.maxRoundTripMs.toFixed(1)} max; ` +
            `${there.redos} redone, ${there.diverged} diverged)`);
    }
    await worker.terminate();
}

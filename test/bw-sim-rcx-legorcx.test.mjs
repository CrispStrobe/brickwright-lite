// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * legorcx's BLOCKS into the Robot Lab RCX (docs/ROBOT-LAB-HUB-COVERAGE.md, RCX "legorcx blocks"):
 * the REAL bundled legorcx extension, unchanged, transpiles a sprite's green-flag script to NQC,
 * compiles it with the host compiler the GUI installs (runtime.nqcCompile, the shipped nqc-wasm)
 * and sends it with its own "send to RCX" block through runtime.rcxDownload, with "Robot Lab RCX"
 * chosen as the target. The program then runs in the scene's RCX, judged from the hub's output
 * drives and the bumper car's motion on the Lab clock, never from the extension's bookkeeping.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {bundledExtensionIds, loadExtensionClass, stubRuntime} from './helpers/bw-extensions.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {SimSession, MODELS_BASE, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {robotLabRcxTarget, ROBOT_LAB_RCX_TARGET} = await import(path.join(SIM, 'hubs/rcx/rcx-lab-target.js'));
const {registerRcxTarget, selectRcxTarget} = await import(path.join(GUI, 'src/lib/rcx/rcx-targets.js'));
const {installRcxDownloader} = await import(path.join(GUI, 'src/lib/rcx-download-hook.js'));
const {installNqcCompiler} = await import(path.join(GUI, 'src/lib/nqc-runtime-hook.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const BUMPER_CAR = readFileSync(path.join(GUI, MODELS_BASE, 'rcx-bumper-car.ldr'), 'utf8');

const num = (id, value) => ({[id]: {opcode: 'math_number', next: null, parent: null, inputs: {}, fields: {NUM: {name: 'NUM', value: String(value)}}, shadow: true, topLevel: false}});
/** whenflag → power AC 7 → AC on forward → wait 1 s → AC off. */
const script = () => ({
    hat: {opcode: 'event_whenflagclicked', next: 'power', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true},
    power: {opcode: 'legorcx_setPower', next: 'on', parent: 'hat', inputs: {POWER: {name: 'POWER', block: 'n7', shadow: 'n7'}},
        fields: {PORTS: {name: 'PORTS', value: 'AC'}}, shadow: false, topLevel: false},
    on: {opcode: 'legorcx_motorOn', next: 'wait', parent: 'power', inputs: {},
        fields: {PORTS: {name: 'PORTS', value: 'AC'}, DIR: {name: 'DIR', value: 'forward'}}, shadow: false, topLevel: false},
    wait: {opcode: 'legorcx_wait', next: 'off', parent: 'on', inputs: {SECONDS: {name: 'SECONDS', block: 'n1', shadow: 'n1'}},
        fields: {}, shadow: false, topLevel: false},
    off: {opcode: 'legorcx_motorOff', next: null, parent: 'wait', inputs: {}, fields: {PORTS: {name: 'PORTS', value: 'AC'}}, shadow: false, topLevel: false},
    ...num('n7', 7), ...num('n1', 1)
});

test('legorcx blocks, sent with its own "send to RCX" block, run in the Lab RCX: AC drive the bumper car for one second, then brake', async () => {
    const {session, issues} = await SimSession.fromText(BUMPER_CAR, {hubState: null, catalog: CATALOG, mat: null});
    assert.ok(session, issues.map(i => i.message).join('; '));
    const rcx = session.hubs.find(h => h.profile === 'rcx');
    assert.ok(rcx, 'the model\'s hub is an RCX');
    const hub = rcx.hub;
    try {
        const runtime = stubRuntime();
        const vm = {runtime};
        assert.equal(installNqcCompiler(vm), true);
        assert.equal(installRcxDownloader(vm), true);
        registerRcxTarget(runtime, robotLabRcxTarget(() => hub));
        selectRcxTarget(runtime, ROBOT_LAB_RCX_TARGET);
        const blocks = script();
        runtime.getEditingTarget = () => ({blocks: {_blocks: blocks}});

        const Cls = loadExtensionClass(bundledExtensionIds().get('legorcx'));
        const ext = new Cls(runtime);
        // The bundle's wrapper forwards each block to the extension instance it holds.
        const inner = ext._inst || ext;
        ext.transpile();
        assert.match(inner.lastCode, /SetPower\(OUT_A \+ OUT_C, 7\);[\s\S]*OnFwd\(OUT_A \+ OUT_C\);[\s\S]*Wait\(100\);[\s\S]*Off\(OUT_A \+ OUT_C\);/, inner.lastCode);
        assert.deepEqual(inner.lastUnsupported, []);
        await ext.sendToBrick({SLOT: 1});
        assert.match(ext.lastError(), /^compiled \d+ bytes for RCX2 \(locally\); sent to program 1$/, 'the block reports a local compile and a send');

        const x0 = session.core.bodyPose(rcx.body).position[0];
        let runningAt500 = null;
        for (let t = 5; t <= 2500; t += 5) {
            session.tick(5);
            if (t === 500) runningAt500 = hub.readDrives().map(d => [d.port, d.duty > 0]);
        }
        const moved = Math.abs(session.core.bodyPose(rcx.body).position[0] - x0);
        assert.deepEqual(runningAt500, [['A', true], ['C', true]], 'both outputs on after half a second');
        assert.ok(moved > 0.1, `the car drove ${moved.toFixed(3)} m`);
        assert.equal(hub.status, 'stopped', 'the program ended');
        assert.deepEqual(hub.readDrives().map(d => [d.port, d.duty, d.decay]), [['A', 0, 'brake'], ['C', 0, 'brake']], 'Off brakes both');
    } finally {
        session.dispose();
    }
});

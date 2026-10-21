// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * SPIKE projects in the Robot Lab, by extension id and route (test/helpers/spike-lab-routes.mjs):
 * the real Scratch VM with the GUI's load-time migration, the REAL bundled spikeprime extension,
 * a named transport to the virtual SPIKE hub, the Lab's Jolt physics. Judged by the physics
 * (the Wall stopper's shared judge, a hinge's angle), never by the extension's own state.
 *
 * What the code says the Lab does with each id (and so what is closed here):
 *  - A project saved against spikeprimeble, spikeprimeBTC, spikeprimeBridge or legospikeprimeBLE is
 *    rewritten to spikeprime when it is loaded (lib/spike-project-migration.js on
 *    vm.deserializeProject, installed by vm-manager-hoc.jsx; the opcode table is
 *    lib/spike-legacy-migration.js). The archived drivers load only from the gallery's debug entries
 *    (extension-library.jsx, legacySpikeDebug), never from a project.
 *  - The Lab's Run connects spikeprime only, and always over Web Bluetooth
 *    (sim-lab-pane.jsx run(): setMode('web-ble'), connectVirtualSpike). So a legacy project runs in
 *    the Lab as spikeprime over Web Bluetooth whatever transport it was written for.
 *  - The other two routes exist as virtual doubles a spikeprime program reaches when its connection
 *    mode names them: Scratch Link BLE (virtual-hub/scratch-link-ble.js, which offers the registered
 *    SPIKE 3 GATT peripheral) and Scratch Link BT / RFCOMM (virtual-hub/spike-classic-scratch-link.js,
 *    the hub on the 'legacy-v2' firmware target). Both drive the same hub state the Lab's physics owns.
 *
 * Wheel signs for the per-motor program: on the Wall stopper, A at -30 % and B at +30 % drive +x
 * (toward the wall), as the movement pair's steering 0 does.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const require = createRequire(import.meta.url);
const LEDGER = require('./fixtures/spike-legacy-ledger.json').extensions;
const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');

if (!existsSync(missing)) {
    test('the SPIKE route runs: their inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runSpikeProjectInLab, projectFromSource, asLegacyProject, modelText, FRAME_MS} = await import('./helpers/spike-lab-routes.mjs');
    const {judgeWallStopRun, reportWallStop} = await import('./helpers/wall-stop-lab-judge.mjs');
    const WALL = {modelText: modelText('wall-stopper.ldr'), mat: 'wall'};
    const BUDGET_MS = 15000;

    /** The shipped Wall stopper example, with the threshold as a parameter (cm). */
    const wallStopper = (below = 10) => 'DEVICE SPIKE\nWHEN flag clicked:\n  set movement motors A B\n  set movement speed 30\n' +
        `  start moving steering 0\n  wait until (spike distance D) < ${below}\n  stop movement\n`;

    /** Every non-menu opcode a legacy project names must be one the legacy extension really had (the frozen ledger). */
    const assertAuthentic = (project, legacyId) => {
        const ops = new Set(LEDGER[legacyId].blocks.map(b => `${legacyId}_${b.opcode}`));
        const menus = new Set(Object.keys(LEDGER[legacyId].menus || {}).map(m => `${legacyId}_menu_${m}`));
        const named = project.targets.flatMap(t => Object.values(t.blocks)).map(b => b.opcode).filter(op => op.startsWith(`${legacyId}_`));
        assert.ok(named.length > 0, `the project uses ${legacyId} blocks`);
        for (const op of named) assert.ok(ops.has(op) || menus.has(op), `${op} is a real ${legacyId} opcode`);
        assert.ok(!project.targets.some(t => Object.values(t.blocks).some(b => b.opcode.startsWith('spikeprime_'))), 'no spikeprime opcode is left in the legacy file');
    };

    /** The migration did its job: only spikeprime was asked for, no legacy opcode survived the load. */
    const assertMigrated = (run, legacyId) => {
        assert.deepEqual([...new Set(run.requested)], ['spikeprime'], `the VM asked only for spikeprime: ${run.requested}`);
        assert.ok(![...run.loadedOpcodes].some(op => op.startsWith(`${legacyId}_`)), `no ${legacyId} opcode is loaded: ${[...run.loadedOpcodes]}`);
    };

    /**
     * spikeprimeble's own blocks (frozen ledger): start motor [PORT] at [SPEED]%, distance sensor [PORT] (mm),
     * stop motor [PORT] with [ACTION]. Authored as sb3 JSON; the GUI's migration must turn them into spikeprime.
     */
    const spikeprimebleWallStopper = async (belowMm = 100) => {
        const project = await projectFromSource('DEVICE SPIKE\nWHEN flag clicked:\n  wait 1 seconds\n');
        const target = project.targets.find(t => Object.keys(t.blocks).length);
        const blocks = {};
        let n = 0;
        const key = () => `blk${n++}`;
        const hat = key();
        blocks[hat] = {opcode: 'event_whenflagclicked', next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0};
        let prev = hat;
        // PORT is a reporter-accepting menu (ledger): a shadow menu block, as the editor saves it. ACTION is a plain field.
        const port = (parent, letter) => {
            const k = key();
            blocks[k] = {opcode: 'spikeprimeble_menu_PORT', next: null, parent, inputs: {}, fields: {PORT: [letter, null]}, shadow: true, topLevel: false};
            return [1, k];
        };
        const stack = b => {
            const k = key();
            blocks[k] = {next: null, parent: prev, shadow: false, topLevel: false, fields: {}, ...b, inputs: {...b.inputs, ...(b.port ? {PORT: port(k, b.port)} : {})}};
            delete blocks[k].port;
            blocks[prev].next = k;
            prev = k;
        };
        stack({opcode: 'spikeprimeble_startMotor', port: 'A', inputs: {SPEED: [1, [4, '-30']]}});
        stack({opcode: 'spikeprimeble_startMotor', port: 'B', inputs: {SPEED: [1, [4, '30']]}});
        const wait = key(); const lt = key(); const dist = key();
        blocks[prev].next = wait;
        blocks[wait] = {opcode: 'control_wait_until', next: null, parent: prev, inputs: {CONDITION: [2, lt]}, fields: {}, shadow: false, topLevel: false};
        blocks[lt] = {opcode: 'operator_lt', next: null, parent: wait, inputs: {OPERAND1: [3, dist, [10, '']], OPERAND2: [1, [10, String(belowMm)]]}, fields: {}, shadow: false, topLevel: false};
        blocks[dist] = {opcode: 'spikeprimeble_getDistance', next: null, parent: lt, inputs: {PORT: port(dist, 'D')}, fields: {}, shadow: false, topLevel: false};
        prev = wait;
        stack({opcode: 'spikeprimeble_stopMotor', port: 'A', fields: {ACTION: ['brake', null]}});
        stack({opcode: 'spikeprimeble_stopMotor', port: 'B', fields: {ACTION: ['brake', null]}});
        target.blocks = blocks;
        project.extensions = ['spikeprimeble'];
        delete project.extensionURLs;
        return project;
    };

    const judgedWallRun = async (project, route, {thresholdMm = 100} = {}) => {
        const run = await runSpikeProjectInLab(project, {route, ...WALL, timeLimitMs: BUDGET_MS});
        const r = judgeWallStopRun(run, {thresholdMm, speedPercent: 30, frameMs: FRAME_MS});
        return {run, r};
    };
    const assertStoppedByReading = (t, run, r) => {
        assert.deepEqual(run.issues, [], 'no notes about the model');
        t.diagnostic(reportWallStop(r));
        assert.ok(r.startGap > 0.5, `the robot starts well away from the wall (${r.startGap} m)`);
        assert.ok(r.settled, 'the robot has come to rest');
        assert.deepEqual(r.failures, [], reportWallStop(r));
        assert.ok(r.ok);
    };

    test('(a) a spikeprimeble project (SPIKE 3 direct BLE) migrates to spikeprime and stops the Wall stopper by its reading, in the Lab over Web Bluetooth', async t => {
        const project = await spikeprimebleWallStopper(100);
        assertAuthentic(project, 'spikeprimeble');
        const {run, r} = await judgedWallRun(project, 'web-ble');
        assertMigrated(run, 'spikeprimeble');
        // spikeprimeble's millimetre distance becomes getDistanceIn with UNIT mm (the units note of the migration table).
        assert.ok(run.loadedOpcodes.has('spikeprime_getDistanceIn') && run.loadedOpcodes.has('spikeprime_startMotor') &&
            run.loadedOpcodes.has('spikeprime_stopMotor'), [...run.loadedOpcodes].join(', '));
        assert.equal(run.connectedProtocol, 'spike3');
        assert.deepEqual(run.sockets, [], 'Web Bluetooth: no Scratch Link socket was opened');
        assertStoppedByReading(t, run, r);
    });

    test('(b) a spikeprimeBTC project migrates to spikeprime and, run as the Lab runs it (Web Bluetooth), stops the Wall stopper by its reading', async t => {
        const project = asLegacyProject(await projectFromSource(wallStopper(10)), 'spikeprimeBTC');
        assertAuthentic(project, 'spikeprimeBTC');
        const {run, r} = await judgedWallRun(project, 'web-ble');
        assertMigrated(run, 'spikeprimeBTC');
        assert.equal(run.connectedProtocol, 'spike3');
        assertStoppedByReading(t, run, r);
    });

    test('(b) a spikeprimeBTC project over Scratch Link BT Classic (RFCOMM double, firmware 2.x): motor A turns 360 degrees in the physics', async () => {
        const project = asLegacyProject(await projectFromSource('DEVICE SPIKE\nWHEN flag clicked:\n  run motor A clockwise 360 degrees\n'), 'spikeprimeBTC');
        assertAuthentic(project, 'spikeprimeBTC');
        const run = await runSpikeProjectInLab(project, {route: 'scratchlink-bt', ...WALL, timeLimitMs: 4000});
        assertMigrated(run, 'spikeprimeBTC');
        assert.equal(run.connectedProtocol, 'repl', 'the 2.x REPL protocol answered');
        assert.ok(run.sockets.some(s => /^ws:\/\/127\.0\.0\.1:20111\/scratch\/bt$/.test(s.url) && s.by === 'VirtualSpikeClassicSocket'),
            `the Scratch Link BT socket reached the RFCOMM double: ${JSON.stringify(run.sockets)}`);
        const joint = run.mechanism.actuators.find(a => a.port === 'A').joint;
        const turned = run.track.at(-1).joints[joint].angle - run.track[0].joints[joint].angle;
        const degrees = turned * 180 / Math.PI;
        assert.ok(Math.abs(degrees - 360) < 3, `hinge ${joint} turned ${degrees.toFixed(2)} degrees`);
        const done = run.track.findIndex(p => !p.busy.A);
        assert.ok(done > 0 && run.track[done].t < 2500, `the motion ended (the motor released) at ${run.track[done]?.t} ms`);
        assert.ok(Math.abs(run.track.at(-1).joints[joint].velocity) < 0.05, 'and the hinge is at rest');
    });

    // The RFCOMM double (virtual-hub/spike-classic-scratch-link.js) once sent the 2.x port report only when
    // asked with trigger_current_state, which the extension sends once after connecting, so the extension's
    // distance stayed at its first reading and the robot hit the wall. It now streams the report on every
    // hub change, as a real 2.x hub streams it.
    test('(b) spikeprime over Scratch Link BT Classic stops the Wall stopper by its reading', async t => {
        const {run, r} = await judgedWallRun(await projectFromSource(wallStopper(10)), 'scratchlink-bt');
        assert.equal(run.connectedProtocol, 'repl');
        assertStoppedByReading(t, run, r);
    });

    test('(c) spikeprime over Scratch Link BLE (the BLE double, SPIKE 3 GATT) stops the Wall stopper by its reading', async t => {
        const {run, r} = await judgedWallRun(await projectFromSource(wallStopper(10)), 'scratchlink-ble');
        assert.deepEqual([...new Set(run.requested)], ['spikeprime']);
        assert.equal(run.connectedProtocol, 'spike3');
        assert.ok(run.sockets.length > 0 && run.sockets.every(s => /\/scratch\/ble$/.test(s.url) && s.by === 'VirtualScratchLinkBleSocket'),
            `every Scratch Link socket reached the BLE double: ${JSON.stringify(run.sockets)}`);
        assertStoppedByReading(t, run, r);
    });

    test('the judge can fail on a route: over Scratch Link BLE, a threshold the reading never passes drives into the wall', async t => {
        const {r} = await judgedWallRun(await projectFromSource(wallStopper(0)), 'scratchlink-ble');
        t.diagnostic(reportWallStop(r));
        assert.equal(r.ok, false);
        assert.ok(r.closestGap <= 0.001, `the blind program kept ${r.closestGap} m off the wall`);
        assert.ok(r.failures.some(f => f.startsWith('(a)')), reportWallStop(r));
    });
}

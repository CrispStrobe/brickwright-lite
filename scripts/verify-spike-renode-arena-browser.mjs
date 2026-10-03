#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// GUI + real managed guest/NuttX proof. Test transport, NOT a Tauri WebView ACL proof.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, appendFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve, sep, extname} from 'node:path';
import assert from 'node:assert/strict';
import {privateSpikeEvidenceDirectory} from './lib/private-spike-evidence.mjs';
import {proofModes, proofOperations, sixMotorSource, replacementSource, sixMotorPython,
    sixPositions, requireSixMoved, requireSharedMotors} from './lib/spike-nuttx-browser-proof.mjs';
const mode = process.env.BW_SPIKE_PROOF_MODE || 'guest';
if (!proofModes.includes(mode)) throw new Error('Unknown BW_SPIKE_PROOF_MODE');
const executable = process.env.BW_RENODE_ARENA_PROOF_DRIVER;
if (!executable) throw new Error('Build the pinned tools/renode-arena-proof driver and set BW_RENODE_ARENA_PROOF_DRIVER');
const evidence = resolve(privateSpikeEvidenceDirectory(), mode === 'guest' ? 'renode-gui' : `renode-gui-${mode}`);
await mkdir(evidence, {recursive: true, mode: 0o700});
const build = resolve(process.env.BW_SPIKE_BUILD_ROOT || 'packages/scratch-gui/build');
const driver = spawn(executable, [], {stdio: ['pipe', 'pipe', 'pipe']});
let pending, stderr = '';
driver.stderr.on('data', chunk => {stderr = (stderr + chunk).slice(-16384);});
const lines = createInterface({input: driver.stdout});
lines.on('line', line => {const waiter = pending; pending = null; waiter?.resolve(JSON.parse(line));});
driver.on('exit', () => {pending?.reject(new Error('Managed guest proof driver exited')); pending = null;});
let queue = Promise.resolve();
const operations = new Set(proofOperations);
const request = value => {
    const result = queue.then(() => new Promise((resolveRequest, reject) => {
        pending = {resolve: resolveRequest, reject}; driver.stdin.write(`${JSON.stringify(value)}\n`);
    }));
    queue = result.catch(() => {}); return result;
};
const types = {'.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png'};
const server = createServer(async (req, res) => {
    try {
        if (req.method === 'POST' && req.url === '/__arena_proof') {
            let body = '';
            for await (const chunk of req) {body += chunk; if (Buffer.byteLength(body) > 16384) throw new Error('oversized input');}
            const value = JSON.parse(body);
            if (!operations.has(value.operation) || Object.keys(value).length !== 2) throw new Error('unsupported test operation');
            const response = await request(value);
            await appendFile(`${evidence}/transport.jsonl`, JSON.stringify({operation: value.operation, response}) + '\n', {mode: 0o600});
            res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(response)); return;
        }
        const name = decodeURIComponent(req.url.split('?')[0]);
        const file = resolve(build, `.${name.endsWith('/') ? `${name}index.html` : name}`);
        if (!file.startsWith(`${build}${sep}`)) throw new Error('invalid path');
        const body = await readFile(file); res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'}); res.end(body);
    } catch (error) {res.writeHead(400); res.end(error.message);}
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser, page;
const checks = [], errors = [];
const check = name => {checks.push(name); console.log(`PASS ${name}`);};
const readFirmware = () => page.evaluate(() => {
    const p = window.__bwSpikeArena._pane, s = p.firmwareSession;
    const reply = s?.latestFrame?.lifecycle.nuttxProgramReply;
    return {frame: s?.latestFrame, state: s?.programState, storage: s?.storageSupported,
        count: reply?.length === 20 ? reply[14] | (reply[15] << 8) : null,
        loaded: s?.loaded, busy: p.state.storageBusy, owner: p.hubState.clockOwner,
        message: p.state.message, motors: p.hubState.data.motors,
        classicPorts: p.hubState.data.classicPorts, pose: {...p.bridge.sim.pose}};
});
const waitFirmwareReady = () => page.waitForFunction(() => {
    const frame = window.__bwSpikeArena?._pane.firmwareSession?.latestFrame;
    return frame?.target?.firmware === 'brickwright-nuttx' && frame.lifecycle?.phase === 'ready';
}, null, {timeout: 60000});
const waitFirmware = state => page.waitForFunction(wanted =>
    window.__bwSpikeArena?._pane.firmwareSession?.programState === wanted, state, {timeout: 30000});
async function loadSource (source, starts) {
    await page.evaluate(code => window.dispatchEvent(new CustomEvent('bw-load-pseudocode',
        {detail: {code, source: 'nuttx-browser-proof'}})), source);
    // Observe the real editor's compilation into Scratch, rather than inject rows.
    await page.waitForFunction(count => {
        const vm = window.__bwSpikeArena?._pane.vm;
        return vm?.runtime.targets.reduce((total, target) => total + Object.values(target.blocks._blocks)
            .filter(block => block.opcode === 'spikeprime_motorStart').length, 0) === count;
    }, starts, {timeout: 30000});
}
async function closeFirmware () {
    // A user switching execution closes the owned NuttX process. Stop alone
    // intentionally keeps a storage-capable session alive.
    await page.getByTestId('bw-spike-arena-execution').selectOption('native');
    await page.waitForFunction(() => !window.__bwSpikeArena._pane.firmwareSession &&
        window.__bwSpikeArena._pane.hubState.clockOwner !== 'renode');
    check('GUI close releases the owned NuttX session and firmware clock');
}
async function runNuttxProof () {
    await page.getByTestId('bw-spike-arena-execution').selectOption('nuttx');
    await page.getByTestId('bw-spike-nuttx-topology').selectOption('six-motors');
    if (mode === 'nuttx-python') {
        await page.getByTestId('bw-lang-row').getByRole('button', {name: '🐍 Py', exact: true}).click();
        const editor = page.getByTestId('bw-code-editor');
        await editor.locator('.cm-content[contenteditable=true], textarea').first().fill(sixMotorPython);
        await page.getByTestId('bw-spike-nuttx-python-run').click();
        await waitFirmwareReady();
        await waitFirmware(2);
        await page.waitForFunction(() => window.__bwSpikeArena._pane.firmwareSession.latestFrame
            .motors.every(m => m.position > 1 && m.demandDirection !== 0), null, {timeout: 30000});
        const active = await readFirmware(); requireSharedMotors(active);
        await page.getByTestId('bw-spike3-console').filter({hasText: 'BROWSER SIX ARM'}).waitFor();
        await page.screenshot({path: `${evidence}/python-running.png`});
        check('GUI Python editor runs on actual ARM and drives all six motors');
        await page.getByTestId('bw-spike-arena-stop').click();
        await waitFirmware(4);
        await page.waitForFunction(() => window.__bwSpikeArena._pane.firmwareSession.latestFrame
            .motors.every(m => m.demandDirection === 0), null, {timeout: 30000});
        const stopped = await readFirmware(); assert.equal(stopped.owner, 'renode');
        check('GUI Stop brakes all six Python-owned motors and retains the storage session');
        await writeFile(`${evidence}/frames.json`, JSON.stringify({active, stopped}, null, 2));
    } else {
        await loadSource(sixMotorSource, 6);
        const initialPose = await page.evaluate(() => ({...window.__bwSpikeArena._pane.bridge.sim.pose}));
        await page.getByTestId('bw-spike-arena-start').click();
        await waitFirmwareReady();
        await waitFirmware(3);
        const saved = await readFirmware(); requireSharedMotors(saved);
        assert.ok(Math.hypot(saved.pose.x - initialPose.x, saved.pose.y - initialPose.y) > 0.01 ||
            Math.abs(saved.pose.heading - initialPose.heading) > 0.01, 'A/B encoders must advance the shared arena pose');
        check('A–F observations reach the shared hub and A/B move the existing arena');
        await page.screenshot({path: `${evidence}/source-completed.png`});
        assert.ok(sixPositions(saved.frame).every(position => position > 1));
        assert.equal(saved.storage, true);
        assert.ok(saved.frame.motors.every(m => m.demandDirection === 0));
        const count = saved.count;
        assert.ok(Number.isInteger(count) && count > 2);
        check('actual GUI compilation executes A–F and completes in NuttX');
        await page.getByTestId('bw-spike-program-save').click();
        await page.waitForFunction(() => !window.__bwSpikeArena._pane.state.storageBusy &&
            /Program saved/.test(window.__bwSpikeArena._pane.state.message));
        await loadSource(replacementSource, 0);
        await page.getByTestId('bw-spike-arena-start').click();
        await page.waitForFunction(previousCount => {
            const s = window.__bwSpikeArena._pane.firmwareSession;
            const reply = s.latestFrame.lifecycle.nuttxProgramReply;
            return !s.uploading && s.programState === 3 && reply?.length === 20 &&
                (reply[14] | (reply[15] << 8)) !== previousCount;
        }, count, {timeout: 30000});
        const replacement = await readFirmware();
        assert.notEqual(replacement.count, count);
        await page.getByTestId('bw-spike-program-load').click();
        await page.waitForFunction(() => {
            const p = window.__bwSpikeArena._pane;
            return !p.state.storageBusy && p.firmwareSession.loaded && p.firmwareSession.programState === 1;
        });
        const loaded = await readFirmware();
        assert.equal(loaded.count, count);
        assert.ok(loaded.frame.motors.every(m => m.demandDirection === 0));
        const loadedClock = loaded.frame.clockNs;
        await page.waitForFunction(clock => window.__bwSpikeArena._pane.firmwareSession.latestFrame.clockNs > clock + 20000000,
            loadedClock, {timeout: 10000});
        const idleLoaded = await readFirmware();
        assert.equal(idleLoaded.state, 1);
        assert.ok(idleLoaded.frame.motors.every(m => m.demandDirection === 0));
        check('GUI Save/replace/Load restores READY without autorun');
        await page.getByTestId('bw-spike-arena-start').click();
        await waitFirmware(3);
        const restored = await readFirmware();
        assert.equal(restored.count, count);
        requireSixMoved(loaded.frame, restored.frame); requireSharedMotors(restored);
        check('Run loaded program executes the saved six-motor program instead of the replacement editor text');
        await writeFile(`${evidence}/frames.json`, JSON.stringify({saved, replacement, loaded, restored}, null, 2));
    }
    await closeFirmware();
}
try {
    browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage']});
    page = await browser.newPage({viewport: {width: 1500, height: 1000}, locale: 'en-US'});
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {localStorage.clear(); localStorage.setItem('bw-starter-v1-complete', '1'); localStorage.setItem('bw-right-pane-hidden', '0');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded'});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {code: 'DEVICE SPIKE\nWHEN flag clicked:\n  wait 1 seconds\n', source: 'arena-proof'}})));
    await page.getByTestId('bw-open-spike-arena').click();
    await page.waitForFunction(() => window.__bwSpikeArena?.bridge);
    await page.getByTestId('bw-spike-arena-sandbox').click();
    await page.evaluate(async operations => {
        const pane = window.__bwSpikeArena._pane;
        let requestId = 0;
        window.__TAURI_INTERNALS__ = {invoke: async (command, params) => {
            if (command === 'native_broker_open') {requestId = 0; return 'arena-test-transport';}
            if (command !== 'native_broker_request' || params.session !== 'arena-test-transport' || params.requestId !== requestId++) {
                throw new Error('Unexpected test broker request');
            }
            const payload = JSON.parse(params.payload);
            const prefix = 'renode.spike.';
            if (payload.kind !== 'capability' || !payload.operation.startsWith(prefix) || !operations.includes(payload.operation.slice(prefix.length))) {
                throw new Error('Unsupported test broker operation');
            }
            const response = await fetch('/__arena_proof', {method: 'POST', body: JSON.stringify({operation: payload.operation.slice(prefix.length), args: payload.args})});
            const reply = await response.json(); if (reply.error) throw new Error(reply.error);
            return JSON.stringify({kind: 'capability', result: typeof reply.result === 'string' ? reply.result : JSON.stringify(reply.result)});
        }};
        await pane.setSandbox({...pane.world, walls: [{shape: {type: 'rect', x: 70, y: 40, w: 4, h: 70}}]});
    }, proofOperations);
    if (mode !== 'guest') {
        await runNuttxProof();
        assert.deepEqual(errors, []);
        await page.screenshot({path: `${evidence}/arena.png`});
    } else {
    await page.getByTestId('bw-spike-arena-execution').selectOption('renode');
    await page.getByTestId('bw-spike-arena-start').click();
    await page.waitForFunction(() => window.__bwSpikeArena?.status === 'running', null, {timeout: 60000});
    await page.waitForFunction(() => {
        const p = window.__bwSpikeArena._pane;
        return p.bridge.sim.pose.x > 32 && p.hubState.data.motors[1].degPerSec === 0 && p.bridge.sim.readSensors().D.distance < 250;
    }, null, {timeout: 30000});
    const first = await page.evaluate(() => ({snapshot: window.__bwSpikeArena.snapshot, motors: window.__bwSpikeArena._pane.hubState.data.motors, owner: window.__bwSpikeArena._pane.hubState.clockOwner}));
    assert.equal(first.owner, 'renode'); check('GUI Run drives the shared world with real guest encoders and stops for arena distance');
    await page.getByTestId('bw-spike-arena-stop').click();
    await page.waitForFunction(() => !window.__bwSpikeArena._pane.firmwareSession && window.__bwSpikeArena._pane.hubState.clockOwner !== 'renode');
    check('GUI Stop closes the owned managed guest and restores native clock ownership');
    await page.evaluate(async () => {
        const p = window.__bwSpikeArena._pane;
        await p.setSandbox({...p.world, walls: [{shape: {type: 'rect', x: 65, y: 40, w: 4, h: 70}}],
            robot: {...p.world.robot, sensors: p.bridge.robot.sensors.map(sensor => sensor.kind === 'distance' ? {...sensor, heading: 180} : sensor.kind === 'force' ? {...sensor, x: -10} : sensor)}});
    });
    await page.getByTestId('bw-spike-arena-start').click();
    await page.waitForFunction(() => window.__bwSpikeArena?._pane.hubState.data.motors[1].stalled === true,
        null, {timeout: 60000});
    const contact = await page.evaluate(() => ({snapshot: window.__bwSpikeArena.snapshot, motors: window.__bwSpikeArena._pane.hubState.data.motors}));
    assert.equal(contact.motors[1].degPerSec, 0); check('arena wall load stalls the real guest motor without native controller stepping');
    await page.evaluate(() => window.__bwSpikeArena._pane.hubState.stopAll());
    await page.waitForFunction(() => !window.__bwSpikeArena._pane.firmwareSession && window.__bwSpikeArena._pane.hubState.clockOwner !== 'renode');
    check('shared hub Stop cancels the managed guest and clears the GUI session');
    await page.getByTestId('bw-spike-arena-execution').selectOption('native');
    await page.getByTestId('bw-spike-sandbox-drive-back').click();
    const x = await page.evaluate(() => window.__bwSpikeArena.snapshot.pose.x);
    await page.waitForFunction(before => window.__bwSpikeArena.snapshot.pose.x < before - 1, x);
    check('native sandbox driving works after guest cancellation on the same hub');
    assert.deepEqual(errors, []);
    await writeFile(`${evidence}/frames.json`, JSON.stringify({first, contact}, null, 2));
    await page.screenshot({path: `${evidence}/arena.png`});
    }
} catch (error) {
    process.exitCode = 1; console.error(error);
    if (page) console.error((await page.locator('body').first().innerText().catch(() => '')).slice(-2500));
} finally {
    await request({operation: 'session.close', args: {}}).catch(() => {});
    if (browser) await browser.close();
    driver.stdin.end(); lines.close();
    await new Promise(done => server.close(done));
    await writeFile(`${evidence}/result.json`, JSON.stringify({success: !process.exitCode, mode,
        boundary: 'browser test transport; production Rust policy and managed debugger; no Tauri WebView ACL claim',
        checks, errors, stderr}, null, 2));
}

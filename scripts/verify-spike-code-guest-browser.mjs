#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// GUI + real managed guest proof. The injected test host is NOT a Tauri ACL proof.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve, sep, extname} from 'node:path';
import assert from 'node:assert/strict';
import {privateSpikeEvidenceDirectory} from './lib/private-spike-evidence.mjs';
const executable = process.env.BW_RENODE_ARENA_PROOF_DRIVER;
if (!executable) throw new Error('Build the pinned tools/renode-arena-proof driver and set BW_RENODE_ARENA_PROOF_DRIVER');
const evidence = resolve(privateSpikeEvidenceDirectory(), 'renode-gui');
await mkdir(evidence, {recursive: true});
const build = resolve(process.env.BW_SPIKE_BUILD_ROOT || 'packages/scratch-gui/build');
const driver = spawn(executable, [], {stdio: ['pipe', 'pipe', 'pipe']});
let pending, stderr = '';
const calls = [];
driver.stderr.on('data', chunk => {stderr = (stderr + chunk).slice(-16384);});
const lines = createInterface({input: driver.stdout});
lines.on('line', line => {calls.push({time: Date.now(), reply: JSON.parse(line)}); const waiter = pending; pending = null; waiter?.resolve(JSON.parse(line));});
driver.on('exit', () => {pending?.reject(new Error('Managed guest proof driver exited')); pending = null;});
let queue = Promise.resolve();
const operations = new Set(['session.start', 'session.close', 'run', 'pause', 'state.read', 'arena.inputs.write', 'arena.program.load']);
const request = value => {
    const result = queue.then(() => new Promise((resolveRequest, reject) => {
        calls.push({time: Date.now(), request: value}); pending = {resolve: resolveRequest, reject}; driver.stdin.write(`${JSON.stringify(value)}\n`);
    }));
    queue = result.catch(() => {}); return result;
};
const types = {'.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png'};
const server = createServer(async (req, res) => {
    try {
        if (req.method === 'POST' && req.url === '/__arena_proof') {
            let body = '';
            for await (const chunk of req) {body += chunk; if (body.length > 16384) throw new Error('oversized input');}
            const value = JSON.parse(body);
            if (!operations.has(value.operation) || Object.keys(value).length !== 2) throw new Error('unsupported test operation');
            const response = await request(value); res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(response)); return;
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
try {
    browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage']});
    page = await browser.newPage({viewport: {width: 1500, height: 1000}});
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {localStorage.clear(); localStorage.setItem('bw-starter-v1-complete', '1'); localStorage.setItem('bw-right-pane-hidden', '0');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded'});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {code: 'DEVICE SPIKE\nWHEN flag clicked:\n  wait 1 seconds\n', source: 'arena-proof'}})));
    await page.getByTestId('bw-open-spike-arena').click();
    await page.waitForFunction(() => window.__bwSpikeArena?.bridge);
    await page.getByTestId('bw-spike-arena-sandbox').click();
    assert.equal(await page.getByTestId('bw-spike-firmware-run').count(), 0);
    check('firmware Code action is absent in a web-only GUI');
    await page.evaluate(async () => {
        const pane = window.__bwSpikeArena._pane;
        const operations = ['session.start', 'session.close', 'run', 'pause', 'state.read', 'arena.inputs.write', 'arena.program.load'];
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
    });
    const spawnX = await page.evaluate(() => window.__bwSpikeArena.snapshot.pose.x);
    const loadCode = async code => {
        await page.evaluate(code => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail:{code,source:'guest-program-proof'}})), code);
        await page.getByTestId('bw-spike-firmware-run').waitFor();
    };
    const runCode = async () => {
        await page.getByTestId('bw-spike-firmware-run').click();
        // Each Code Run compiles asynchronously. A previous completion message
        // cannot qualify the next run before its new owned session exists.
        await page.waitForFunction(() => Boolean(window.__bwSpikeArena?._pane?.firmwareSession), null, {timeout:30000});
    };
    await loadCode('DEVICE SPIKE\nWHEN flag clicked:\n  start tank 25 25\n  wait 0.5 seconds\n  stop movement\n');
    await runCode();
    await page.waitForFunction(() => window.__bwSpikeArena._pane.state.message === 'Firmware program completed.',null,{timeout:120000});
    await page.waitForFunction(() => !window.__bwSpikeArena._pane.firmwareSession);
    const first = await page.evaluate(() => ({snapshot:window.__bwSpikeArena.snapshot,motors:window.__bwSpikeArena._pane.hubState.data.motors}));
    assert.ok(first.snapshot.pose.x > spawnX + 3);check('actual Code text compiles and runs concurrent motors in the ARM guest, then completes');
    await loadCode('DEVICE SPIKE\nWHEN flag clicked:\n  set motor speed B 50\n  run motor B backward 90 degrees\n');
    await runCode();
    await page.waitForFunction(() => window.__bwSpikeArena._pane.state.message === 'Firmware program completed.' && !window.__bwSpikeArena._pane.firmwareSession,null,{timeout:120000});
    const position=await page.evaluate(()=>window.__bwSpikeArena._pane.hubState.data.motors[1].position);
    assert.ok(Math.abs(position+90)<.01);check('Code position command completes at the guest-controlled target');
    await loadCode('DEVICE SPIKE\nWHEN flag clicked:\n  start tank 25 25\n  wait until spike distance D in mm < 250\n  stop movement\n');
    await runCode();
    await page.waitForFunction(() => window.__bwSpikeArena._pane.state.message === 'Firmware program completed.' && !window.__bwSpikeArena._pane.firmwareSession,null,{timeout:120000});
    const contact=await page.evaluate(()=>({snapshot:window.__bwSpikeArena.snapshot,distance:window.__bwSpikeArena._pane.bridge.sim.readSensors().D.distance}));
    assert.ok(contact.distance<250);assert.ok(contact.snapshot.pose.x>32);check('Code sensor wait uses arena input read by the real ARM guest');
    await loadCode('DEVICE SPIKE\nWHEN flag clicked:\n  start tank 25 25\n  forever:\n    wait 1 seconds\n');
    await runCode();
    await page.waitForFunction(()=>window.__bwSpikeArena._pane.firmwareSession?.started && window.__bwSpikeArena.status === 'running' && window.__bwSpikeArena.snapshot.pose.x>32,null,{timeout:120000});
    await page.getByTestId('bw-spike3-stop').click();
    await page.waitForFunction(()=>!window.__bwSpikeArena._pane.firmwareSession && window.__bwSpikeArena._pane.hubState.clockOwner!=='renode');
    check('Code Stop cancels the owned guest and returns the shared hub');
    await page.getByTestId('bw-lang-row').getByRole('button', {name:'🐍 Py',exact:true}).click();
    const editor=page.getByTestId('bw-code-editor').locator('.cm-content[contenteditable="true"]');
    await editor.click();await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('import motor, runloop\nfrom hub import port\n\nasync def main():\n    await motor.run_for_degrees(port.B, -45, 555)\n\nrunloop.run(main())\n');
    await page.getByTestId('bw-spike-firmware-run').waitFor();
    await runCode();
    await page.waitForFunction(() => window.__bwSpikeArena._pane.state.message === 'Firmware program completed.' && !window.__bwSpikeArena._pane.firmwareSession,null,{timeout:120000});
    const pythonPosition=await page.evaluate(()=>window.__bwSpikeArena._pane.hubState.data.motors[1].position);
    assert.ok(Math.abs(pythonPosition+45)<.01);check('supported SPIKE 3 Python text compiles into instructions and completes in the guest');
    await loadCode('DEVICE SPIKE\nWHEN flag clicked:\n  start motor F forward\n');
    await page.getByTestId('bw-spike-firmware-run').click();
    await page.waitForFunction(()=>document.body.innerText.includes('Firmware guest supports motors A and B only'));
    assert.equal(await page.evaluate(()=>Boolean(window.__bwSpikeArena._pane.firmwareSession)),false);
    check('unsupported Code command refuses before runtime startup without fallback');
    assert.deepEqual(errors, []);
    await writeFile(`${evidence}/frames.json`, JSON.stringify({first, contact}, null, 2));
    await page.screenshot({path: `${evidence}/arena.png`});
} catch (error) {
    process.exitCode = 1; console.error(error);
    if (page) console.error(await page.evaluate(() => {const p=window.__bwSpikeArena?._pane;return {status:p?.state.status,message:p?.state.message,started:p?.firmwareSession?.started,closed:p?.firmwareSession?.closed,owner:p?.hubState.clockOwner};}));
    if (page) console.error((await page.locator('body').first().innerText().catch(() => '')).slice(-2500));
} finally {
    await request({operation: 'session.close', args: {}}).catch(() => {});
    if (browser) await browser.close();
    driver.stdin.end(); lines.close();
    await new Promise(done => server.close(done));
    await writeFile(`${evidence}/result.json`, JSON.stringify({success: !process.exitCode, checks, errors, stderr, calls}, null, 2));
}

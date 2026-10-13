#!/usr/bin/env node
/**
 * Two boards of one project in MakeCode's own simulators, sharing one radio:
 * a micro:bit remote and a Calliope mini car (the mint-unt.de callio:bit
 * tutorial). A real browser, the real host pages, the pinned simulators.
 *
 * One text holds both boards (the tutorial's two MakeCode programs, imported,
 * each under its board header). Each is exported and compiled for its own
 * target; the page that frames the two host pages relays `radiopacket`
 * between them, as the multi-board pane does. Pressing A on the remote must
 * move the car's motor A, B motor B, and with the relay cut nothing may move.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, relative, extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile, STATIC} from './lib/pxt-node.mjs';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {boardMakeCodeProjects} from '../overlay/scratch-gui/src/lib/bw-boards/makecode-boards.js';

const {chromium} = await import(process.env.BW_PLAYWRIGHT_MODULE || 'playwright');
const SB3Creator = (await import(pathToFileURL(resolve('packages/scratch-gui/src/lib/sb3-creator.js')).href)).default;

// The tutorial's two programs, as MakeCode writes them.
const REMOTE_TS = `radio.setGroup(1)
radio.setTransmitPower(7)
basic.forever(function () {
    if (input.buttonIsPressed(Button.A)) {
        radio.sendNumber(0)
    } else {
        radio.sendNumber(1)
    }
    if (input.buttonIsPressed(Button.B)) {
        radio.sendNumber(2)
    } else {
        radio.sendNumber(3)
    }
})
`;
const CAR_TS = `radio.setGroup(1)
radio.setTransmitPower(7)
radio.onReceivedNumber(function (receivedNumber) {
    if (receivedNumber == 0) {
        motors.dualMotorPower(Motor.A, 50)
    }
    if (receivedNumber == 1) {
        motors.dualMotorPower(Motor.A, 0)
    }
    if (receivedNumber == 2) {
        motors.dualMotorPower(Motor.B, 50)
    }
    if (receivedNumber == 3) {
        motors.dualMotorPower(Motor.B, 0)
    }
})
`;
// One text, two boards: each import's own lines under a board header in place
// of its DEVICE line.
const section = (ts, board, device, name) => {
    const {code, unsupported} = microbitToPseudocode(ts, {board});
    assert.deepEqual(unsupported, [], `${name}: the import refused something`);
    const lines = code.split('\n');
    const at = lines.findIndex(l => /^DEVICE\b/.test(l));
    assert.ok(at >= 0, `${name}: no DEVICE line`);
    lines[at] = `DEVICE ${device} AS ${name}:`;
    return lines.join('\n');
};
const PAIR = `${section(REMOTE_TS, 'microbit', 'MICROBIT', 'Remote')}\n${section(CAR_TS, 'calliopemini', 'CALLIOPEMINI', 'Car')}`;
const subjects = boardMakeCodeProjects(new SB3Creator().parse(process.env.BW_PAIR_TEXT || PAIR), {exportToMakeCode});
const boards = [];
for (const s of subjects) {
    if (s.target === 'microbit') {
        const cfg = JSON.parse(s.files['pxt.json']);
        s.files['pxt.json'] = JSON.stringify({...cfg, targetVersions: {target: '9.1.1'}});
    }
    const out = await compile(s.target, s.files);
    assert.equal(out.success, true, `${s.name}: ${JSON.stringify((out.diagnostics || []).slice(0, 3))}`);
    assert.deepEqual(out.netAttempts, [], `${s.name}: the compile reached for the network`);
    boards.push({name: s.name, target: s.target, js: out.outfiles['binary.js']});
}

const PARENT = `<!doctype html><meta charset="utf-8"><body>
${boards.map((b, i) => `<iframe id="b${i}" src="/${b.target}/sim/host.html" style="width:420px;height:420px"></iframe>`).join('')}
<script>
window.bw = {ready: [], motors: {}, packets: 0, relay: true, errors: []};
const frames = [...document.querySelectorAll('iframe')];
addEventListener('message', e => {
  const i = frames.findIndex(f => f.contentWindow === e.source);
  if (i < 0) return;
  const m = e.data || {};
  if (m.type === 'bw-makecode-host-ready') bw.ready[i] = true;
  else if (m.type === 'bw-makecode-error') bw.errors.push(m.message);
  else if (m.type === 'bw-makecode-motor') bw.motors[i + m.motor] = m.power;
  else if (m.type === 'radiopacket') {
    bw.packets++;
    if (bw.relay) frames.forEach((f, j) => { if (j !== i) f.contentWindow.postMessage({type: 'bw-makecode-radio-in', packet: m}, '*'); });
  }
});
window.bwRun = programs => frames.forEach((f, i) => f.contentWindow.postMessage({type: 'bw-makecode-run', js: programs[i], peerRadio: true}, '*'));
</script>`;
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/pair.html') { res.writeHead(200, {'content-type': 'text/html'}); res.end(PARENT); return; }
        const filename = resolve(STATIC, `.${pathname}`);
        const rel = relative(STATIC, filename);
        assert.ok(rel && rel !== '..' && !rel.startsWith('../'));
        const data = await readFile(filename);
        res.writeHead(200, {'content-type': ({'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
            '.css': 'text/css', '.svg': 'image/svg+xml'})[extname(filename)] || 'application/octet-stream'});
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end();
    }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
    const context = await browser.newContext({viewport: {width: 900, height: 480}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
    await page.goto(`${origin}/pair.html`);
    await page.waitForFunction(n => window.bw.ready.filter(Boolean).length === n, boards.length, {timeout: 30000});
    await page.evaluate(programs => window.bwRun(programs), boards.map(b => b.js));
    const sim = target => page.frames().find(f => f.url().startsWith(`${origin}/${target}/sim/simulator.html`));
    await page.waitForFunction(() => window.bw.packets > 4, null, {timeout: 30000});
    const remote = sim('microbit');
    assert.ok(remote && sim('calliopemini'), `both simulator frames: ${page.frames().map(f => f.url()).join(' ')}`);
    assert.equal(page.frames().filter(f => /simulator\.html/.test(f.url())).length, 2,
        'pxtsim must not open its own second simulator for the radio');
    const press = (button, down) => remote.evaluate(([b, d]) => { pxsim.board().buttonPairState[b].pressed = d; }, [button, down]);
    const motors = () => page.evaluate(() => ({...window.bw.motors}));
    const until = (want, ms = 10000) => page.waitForFunction(w => Object.entries(w).every(([k, v]) => window.bw.motors[k] === v),
        want, {timeout: ms});
    const rows = [];
    const step = async (label, act, want) => { await act(); await until(want); rows.push({label, motors: await motors()}); };
    await step('no button', async () => {}, {'1A': 0, '1B': 0});
    await step('A held', () => press('aBtn', true), {'1A': 50, '1B': 0});
    await step('A released', () => press('aBtn', false), {'1A': 0, '1B': 0});
    await step('B held', () => press('bBtn', true), {'1A': 0, '1B': 50});
    await step('B released', () => press('bBtn', false), {'1A': 0, '1B': 0});
    // The control: same boards, same button, no air between them.
    await page.evaluate(() => { window.bw.relay = false; });
    await page.waitForTimeout(500);
    const sent = await page.evaluate(() => window.bw.packets);
    await press('aBtn', true);
    await page.waitForFunction(n => window.bw.packets > n + 10, sent, {timeout: 10000});
    rows.push({label: 'A held, relay cut', motors: await motors()});
    assert.deepEqual(rows.at(-1).motors, {'1A': 0, '1B': 0}, 'with no relay the car must not hear the remote');
    assert.deepEqual(await page.evaluate(() => window.bw.errors), []);
    assert.deepEqual(errors, []);
    for (const row of rows) console.log(JSON.stringify(row));
    console.log(`PASS ${boards.map(b => `${b.name} (${b.target})`).join(' + ')}; packets ${await page.evaluate(() => window.bw.packets)}`);
} finally {
    await browser.close();
    server.close();
}

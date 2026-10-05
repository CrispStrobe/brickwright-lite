#!/usr/bin/env node
/**
 * CI-only production-browser proof: a program's FIRST pin write survives the
 * green flag, on every green flag (task B7 of docs/OPEN-TASKS-2026-09-29.md).
 *
 * MEASURED in a real browser against production before the fix (example
 * 54-motor-driver, whose program starts `turn on led` — P1.0, active low — and
 * then waits 2 s; every setPin on P1.0 and every board.reset() traced):
 *
 *   W  THE WIPE. The circuit designer clears its board when a run starts
 *      (board.reset(), every MCU pin re-armed quasi-high). That clear ran in a
 *      React effect after `bw-green-flag`, which the green flag dispatched on
 *      a setTimeout(0) AFTER vm.greenFlag() — so it raced the VM's first step.
 *      Round 1: the program's write at 68.7 ms, the clear at 174 ms, the LED
 *      dark for the whole 2 s wait. Two rounds in ten were wiped.
 *   B  STUCK IN BUILD. vm.greenFlag() calls stopAll() first, so a green flag
 *      emits PROJECT_STOP_ALL then PROJECT_START. The circuit tab relayed both,
 *      and the designer applied them as simulate-then-build: from the third
 *      green flag on there was no clear at all and board time stood still at
 *      250 ms, so the program wrote onto a frozen board.
 *
 * WHAT THIS HOLDS, per green flag (ROUNDS of them, with a stop between):
 *   1. the designer's clock runs — board time advances while the program waits
 *      (B fails here: the clock is frozen);
 *   2. the program's first write is what the board holds: P1.0 pushpull LOW,
 *      the LED lit, while the program is still in its wait (W fails here: the
 *      pin is the designer's quasi-high and the LED dark).
 * The gate waits on conditions only (waitForFunction), never on a sleep.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir, readFile} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';

const build = resolve(process.env.BW_BUILD || 'packages/scratch-gui/build');
const artifacts = resolve(process.env.GREEN_FLAG_ARTIFACTS || 'artifacts/green-flag-first-write');
const EXAMPLE = '54-motor-driver';
const PIN = 'P1.0';
const LED = 'LED_led';
const ROUNDS = 4;
// Board time the designer must advance after the program's first write before
// the reading is taken: two of its 50 ms ticks, five 20 ms LED windows. A
// frozen clock (defect B) cannot pass it.
const ADVANCE_NS = 100_000_000;
// A reading taken after the program's own `turn off led` (4 s of wall time
// later) says nothing about either defect — the runner was slower than the
// program. Such a round is repeated, at most this many times in all, and
// reported as too slow to observe if it never lands inside the wait.
const ATTEMPTS = 3;

const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};

const serveBuild = async () => {
    if (!existsSync(join(build, 'index.html'))) throw new Error(`Build first: ${build}/index.html is missing`);
    const server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escaped build');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    const first = Number(process.env.BW_PORT || 8291);
    for (let port = first; port < first + 20; port++) {
        const listening = await new Promise((done, fail) => {
            const onError = error => (error.code === 'EADDRINUSE' ? done(false) : fail(error));
            server.once('error', onError);
            server.listen(port, () => { server.removeListener('error', onError); done(true); });
        });
        if (listening) return {server, url: `http://localhost:${port}/`};
    }
    throw new Error('no free browser-proof port');
};

await mkdir(artifacts, {recursive: true});
let server;
let browser;
let page;
let url = process.env.PROOF_URL || process.env.BW_URL || null;
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
    return ok;
};

try {
    if (!url) ({server, url} = await serveBuild());
    browser = await chromium.launch({headless: true});
    page = await browser.newPage({viewport: {width: 1600, height: 1050}});
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => console.log(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    // The circuit tab mounted first, then its gallery loader found the way
    // verify-example-journey.mjs finds it.
    await page.getByRole('tab', {name: /circuit/i}).click();
    await page.waitForFunction(id => {
        const gui = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        if (!gui) return false;
        const key = Object.keys(gui).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (!key) return false;
        const queue = [gui[key]];
        for (let i = 0; i < 8000 && queue.length; i++) {
            const fiber = queue.shift();
            const node = fiber && fiber.stateNode;
            if (node && typeof node.loadExample === 'function' && Array.isArray(node.state && node.state.examples)) {
                window.__bwUiCircuitTab = node;
                return node.state.examples.some(e => e.id === id);
            }
            if (fiber && fiber.child) queue.push(fiber.child);
            if (fiber && fiber.sibling) queue.push(fiber.sibling);
        }
        return false;
    }, EXAMPLE, {timeout: 40000});
    const loaded = await page.evaluate(async id => {
        const tab = window.__bwUiCircuitTab;
        return tab.loadExample(tab.state.examples.find(e => e.id === id));
    }, EXAMPLE);
    check(`the gallery loads ${EXAMPLE}`, loaded && loaded.ok !== false, (loaded && loaded.error) || '');
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        return !!(vm && vm.runtime.circuitBoard && vm.runtime.stc && (vm.runtime.stc.pins || []).length
            && vm.runtime.targets.some(t => Object.values(t.blocks._blocks).some(b => b.opcode === 'event_whenflagclicked')));
    }, null, {timeout: 60000});

    const attempt = async () => {
        // The extension's record of what the program wrote is the program's
        // side of the comparison; cleared so this round's write is this round's.
        const startNs = await page.evaluate(() => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            vm.runtime._stc12Pins = Object.create(null);
            return String(vm.runtime.circuitBoard.timeNs);
        });
        // The real control, clicked as a learner clicks it.
        await page.evaluate(() => document.querySelector('[class*="green-flag"]').click());
        const wrote = await page.waitForFunction(() => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            return vm.runtime._stc12Pins && vm.runtime._stc12Pins.led === 0
                ? String(vm.runtime.circuitBoard.timeNs) : false;
        }, null, {timeout: 30000}).then(h => h.jsonValue()).catch(() => null);
        let ran = false;
        let reading = null;
        if (wrote !== null) {
            const t0 = Date.now();
            ran = await page.waitForFunction(ns => {
                const b = window.__brickwrightStore.getState().scratchGui.vm.runtime.circuitBoard;
                return b.timeNs >= BigInt(ns);
            }, String(BigInt(wrote) + BigInt(ADVANCE_NS)), {timeout: 30000}).then(() => true).catch(() => false);
            reading = await page.evaluate(({pin, led}) => {
                const vm = window.__brickwrightStore.getState().scratchGui.vm;
                const b = vm.runtime.circuitBoard;
                const ps = b.pinStates.get(pin.toLowerCase());
                return {
                    stillWaiting: vm.runtime._stc12Pins.led === 0,
                    mode: ps ? ps.mode : null, high: ps ? ps.driveHigh : null,
                    led: b.ledBrightness(led), boardNs: String(b.timeNs)
                };
            }, {pin: PIN, led: LED});
            reading.wallMs = Date.now() - t0;
        }
        await page.evaluate(() => document.querySelector('[class*="stop-all"]').click());
        await page.waitForFunction(() => !window.__brickwrightStore.getState().scratchGui.vmStatus.running,
            null, {timeout: 15000});
        return {startNs, wrote, ran, reading};
    };

    for (let round = 1; round <= ROUNDS; round++) {
        let r = null;
        for (let n = 1; n <= ATTEMPTS; n++) {
            r = await attempt();
            if (r.wrote === null || !r.ran || r.reading.stillWaiting) break;
            console.log(`round ${round}: attempt ${n} read after the program's own turn-off (${r.reading.wallMs} ms for ${ADVANCE_NS / 1e6} ms of board time) — repeated`);
        }
        if (!check(`round ${round}: the program wrote its first level (turn on led)`, r.wrote !== null)) break;
        const {reading} = r;
        const detail = `start ${r.startNs} ns, write at ${r.wrote} ns, now ${reading.boardNs} ns after ${reading.wallMs} ms; ${PIN} ${reading.mode}/${reading.high}; LED ${reading.led.toFixed(3)}`;
        check(`round ${round}: the designer's clock runs after the green flag (not left in build mode)`, r.ran, detail);
        check(`round ${round}: the reading is taken inside the program's wait (else the runner is too slow to observe)`, !r.ran || reading.stillWaiting, detail);
        check(`round ${round}: the board holds the program's first write (${PIN} pushpull low), not the start-of-run clear`,
            reading.mode === 'pushpull' && reading.high === false, detail);
        check(`round ${round}: the LED the program turned on is lit`, reading.led > 0.5, detail);
    }
    await page.screenshot({path: join(artifacts, 'final.png'), fullPage: true});
} catch (error) {
    failures.push(error && error.message ? error.message : String(error));
    console.log(`FAIL: ${error && error.stack ? error.stack : error}`);
} finally {
    if (page) await page.screenshot({path: join(artifacts, 'end.png'), fullPage: true}).catch(() => {});
    if (browser) await browser.close();
    if (server) server.close();
}

if (failures.length) {
    console.error(`\n${failures.length} green-flag first-write check(s) failed.`);
    process.exit(1);
}
console.log('\nthe first write survives every green flag');

#!/usr/bin/env node
/**
 * Browser acceptance for the FPGA gate-builder surface — the consolidated LOOK.
 *
 * Source-text gates (test/fpga-surface-flag.test.mjs) prove the code is wired;
 * only a real browser proves it RENDERS and behaves (the §7.4 lesson: every
 * source gate can pass while a render is wrong). This drives the flag-on build,
 * exercises the builder's key surfaces, saves screenshots to
 * artifacts/fpga-surface/, and fails the process if a check fails.
 *
 * Needs a FLAG-ON build (BW_ENABLE_FPGA=1) at packages/scratch-gui/build. On a
 * flag-OFF build the FPGA tab is absent, so — like the ngspice oracle — it says
 * so loudly and exits 0 (skips), which keeps it safe to run against any build.
 *
 * Run: (build flag-on, then) `node scripts/verify-fpga-surface.mjs`, or point it
 * at a served build with `PROOF_URL=http://host:port/ node scripts/verify-fpga-surface.mjs`.
 */
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The flag-ON build is the DEPLOY build (build_editor), which the browser job
// overwrites flag-OFF (build_editor_browser) before serving. To gate the FPGA
// surface, CI preserves the flag-on build to a sibling dir and points here.
const build = process.env.BW_FPGA_BUILD_DIR
    ? resolve(process.env.BW_FPGA_BUILD_DIR)
    : join(root, 'packages', 'scratch-gui', 'build');
const shots = join(root, 'artifacts', 'fpga-surface');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.map': 'application/json'};

let base = process.env.PROOF_URL;
let server = null;
if (!base) {
    if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');
    server = createServer(async (req, res) => {
        try {
            let path = decodeURIComponent(req.url.split('?')[0]);
            if (path.endsWith('/')) path += 'index.html';
            const file = join(build, normalize(path));
            if (!file.startsWith(build)) throw new Error('escape');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
    });
    await new Promise(done => server.listen(8631, done));
    base = 'http://localhost:8631/';
}

await mkdir(shots, {recursive: true});
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

const browser = await chromium.launch({args: ['--no-sandbox', '--disable-dev-shm-usage']});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.on('pageerror', e => console.log(`  browser pageerror: ${e.message}`));
await page.addInitScript(() => { try { localStorage.setItem('bw-fpga-enabled', '1'); } catch (e) {} });

try {
    await page.goto(base, {waitUntil: 'load', timeout: 120000});
    await page.waitForSelector('[role=tab]', {timeout: 120000});
    await page.waitForTimeout(2500);

    // Dismiss the welcome starter picker (× + Not now + strip the backdrop).
    const x = page.getByRole('button', {name: '×'}).first();
    if (await x.count()) await x.click().catch(() => {});
    await page.waitForTimeout(500);
    const nn = page.getByRole('button', {name: /Not now/i}).first();
    if (await nn.count()) await nn.click().catch(() => {});
    await page.evaluate(() => document.querySelectorAll('[data-testid="bw-starter-backdrop"],[class*="starter-journeys_backdrop"]')
        .forEach(el => el.remove()));

    const fpgaTab = page.getByRole('tab', {name: /FPGA/i}).first();
    if (!(await fpgaTab.count())) {
        console.log('SKIP: no ⬢ FPGA tab — this is a flag-off build. Build with BW_ENABLE_FPGA=1 to verify the surface.');
        await browser.close(); if (server) server.close(); process.exit(0);
    }
    await fpgaTab.click();
    await page.waitForTimeout(2000);
    const summary = page.getByText(/on a full canvas/i).first();
    if (await summary.count()) await summary.click().catch(() => {});
    await page.waitForSelector('.react-flow', {timeout: 60000});
    await page.waitForTimeout(1500);

    // 1. The palette renders with gate glyphs and the Display section.
    const paletteText = await page.locator('[data-testid="bw-fpga-palette"]').first().innerText();
    check('palette has Logic + Display sections', /LOGIC/i.test(paletteText) && /Display/i.test(paletteText), paletteText.split('\n').slice(0, 3).join(' '));
    check('palette previews gate glyphs', (await page.locator('[data-testid="bw-fpga-palette"] svg.bw-glyph').count()) > 0);

    // 2. The starter design is on the canvas.
    const nodes0 = await page.locator('.react-flow__node').count();
    check('the starter design mounts on the canvas', nodes0 >= 3, `${nodes0} nodes`);
    await page.locator('.react-flow').first().screenshot({path: join(shots, '01-builder.png')});

    // 3. The toolbar carries the editor affordances (undo/redo/truth-table/svg).
    for (const id of ['bw-fpga-rf-undo', 'bw-fpga-rf-redo', 'bw-fpga-rf-clear', 'bw-fpga-rf-tt', 'bw-fpga-rf-svg']) {
        check(`toolbar has ${id}`, (await page.locator(`[data-testid="${id}"]`).count()) > 0);
    }

    // 4. The board-pin and memory-map readouts reflect the live design.
    const pinmap = await page.locator('[data-testid="bw-fpga-rf-pinmap"]').first().innerText().catch(() => '');
    check('board-pin preview shows a pin mapping', /→\d/.test(pinmap), pinmap);
    const mmio = await page.locator('[data-testid="bw-fpga-rf-mmio"]').first().innerText().catch(() => '');
    check('memory-map preview shows an address mapping', /@0x/i.test(mmio), mmio);

    // 5. Run mode: values light up the wires.
    await page.locator('[data-testid="bw-fpga-rf-run"]').first().click();
    await page.waitForTimeout(800);
    const edgeLabels = await page.locator('.react-flow__edge .react-flow__edge-text, .react-flow__edgelabel-renderer').count();
    check('Run mode labels the wires with live values', edgeLabels > 0, `${edgeLabels} labels`);
    await page.locator('.react-flow').first().screenshot({path: join(shots, '02-run.png')});
    await page.screenshot({path: join(shots, '03-tab.png')});

    // 6. The demo board connects the Tang Nano to real breadboard parts. This
    // runs against the BROWSER BUNDLE, whose sidecars come from the generated
    // parts-data/index.js — unlike node tests, which read the parts-data
    // directory and so cannot see a stale index. It is the one check that
    // catches, where it actually bites, a Tang that registered as a 2-terminal
    // ['a','b'] stub (bw-circuit-ui's index dropping tang_nano_20k): every wire
    // to a header pin is then silently dropped and the board is dead. Uses the
    // DEFAULT LED demo (pins 15–18), so it needs no synthesis and is
    // deterministic.
    const demoBtn = page.getByRole('button', {name: /Wire up a demo board/i}).first();
    if (await demoBtn.count()) {
        await demoBtn.click();
        // onLiveCircuit shows the Circuit tab and builds the board there; wait
        // for the live circuit to publish with the Tang placed (dev/prod mounts
        // can be slow, so wait generously).
        let built = false;
        for (let i = 0; i < 30; i++) {
            built = await page.evaluate(() => {
                const c = window.__circuit;
                return !!(c && Array.isArray(c.parts)
                    && c.parts.some(p => (p.kind || p.type) === 'tang_nano_20k')
                    && c.parts.some(p => (p.kind || p.type) === 'led'));
            });
            if (built) break;
            await page.waitForTimeout(1000);
        }
        check('the demo board builds a Tang + LED circuit', built);
        if (built) {
            const r = await page.evaluate(async () => {
                const c = window.__circuit;
                const board = (c.board && typeof c.board.readPin === 'function') ? c.board : window.__board;
                const tang = (c.parts || []).find(p => (p.kind || p.type) === 'tang_nano_20k');
                const leds = (c.parts || []).filter(p => (p.kind || p.type) === 'led');
                const tp = c.getPart ? c.getPart(tang.id) : tang;
                const termCount = (tp && tp.terminals || []).length;
                let maxBr = 0;
                if (board && leds.length) {
                    try { board.setPower && board.setPower(true); } catch (e) { /* */ }
                    // The default demo hangs LEDs on pins 15–18; drive them high.
                    for (const pin of [15, 16, 17, 18]) {
                        try { board.setPin('p' + pin, 'pushpull', 1); } catch (e) { /* */ }
                    }
                    try { board.operatingPoint && board.operatingPoint(); board.advanceTo(board.getTime() + 0.05); } catch (e) { /* */ }
                    for (const l of leds) {
                        try { const b = board.ledBrightness(l.id); if (b > maxBr) maxBr = b; } catch (e) { /* */ }
                    }
                }
                return {termCount, maxBr};
            });
            // The Tang must expose its header pins, not the 2-terminal stub.
            check('the Tang part exposes its header pins (sidecar registered, not an [a,b] stub)',
                r.termCount > 2, `${r.termCount} terminals`);
            // …and the wiring must actually conduct: driving an output lights an LED.
            check('driving an FPGA output pin lights a demo-board LED through the solver',
                typeof r.maxBr === 'number' && r.maxBr > 0.1, `max brightness ${r.maxBr}`);
            await page.screenshot({path: join(shots, '04-demo-board.png')});
        }
    }
} catch (e) {
    check('the FPGA surface drive completed', false, e.message.split('\n')[0]);
}

await browser.close();
if (server) server.close();
console.log(`\n${failures.length ? `FPGA surface: ${failures.length} check(s) failed` : 'FPGA surface: all checks passed'}`);
process.exit(failures.length ? 1 : 0);

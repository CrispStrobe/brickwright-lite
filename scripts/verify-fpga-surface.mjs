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
const build = join(root, 'packages', 'scratch-gui', 'build');
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
} catch (e) {
    check('the FPGA surface drive completed', false, e.message.split('\n')[0]);
}

await browser.close();
if (server) server.close();
console.log(`\n${failures.length ? `FPGA surface: ${failures.length} check(s) failed` : 'FPGA surface: all checks passed'}`);
process.exit(failures.length ? 1 : 0);

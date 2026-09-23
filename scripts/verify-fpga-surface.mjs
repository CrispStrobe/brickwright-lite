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
 * BW_FPGA_REQUIRE_SURFACE=1 REMOVES THAT ESCAPE, and CI sets it. In a job whose
 * whole purpose is to build flag-on and look at the surface, "no FPGA tab" is
 * the loudest possible failure, not a reason to exit 0 — a skip there would be
 * a green check that proves nothing, which is exactly the decay this gate was
 * written against. Ask of any green check: what would be absent from this
 * output if the thing it tests were dead? Under the skip, nothing would be.
 *
 * The LEARNING-PATH half (§7) drives scripts/drive-fpga.mjs rather than
 * re-deriving how to open the surface. That helper is the one place the six
 * traps (the build flag, the starter backdrop, [role=tab], forceRenderTabPanel,
 * the lazy remount, treacherous text locators) are written down; a second copy
 * here would be a second thing to keep true.
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
import {openFpga} from './drive-fpga.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The flag-ON build is the DEPLOY build (build_editor), which the browser job
// overwrites flag-OFF (build_editor_browser) before serving. To gate the FPGA
// surface, CI preserves the flag-on build to a sibling dir and points here.
const build = process.env.BW_FPGA_BUILD_DIR
    ? resolve(process.env.BW_FPGA_BUILD_DIR)
    : join(root, 'packages', 'scratch-gui', 'build');
const shots = join(root, 'artifacts', 'fpga-surface');
// CI sets this: on a build made flag-on FOR this gate, a skip is a failure.
const REQUIRE = process.env.BW_FPGA_REQUIRE_SURFACE === '1';
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
const pageErrors = [];
page.on('pageerror', e => {
    pageErrors.push(e.message.split('\n')[0].slice(0, 200));
    console.log(`  browser pageerror: ${e.message}`);
});
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
        if (REQUIRE) {
            // The tab is missing from a build this job made flag-on ON PURPOSE,
            // so something real is wrong: the flag did not reach webpack, the
            // surface threw at render (which unmounts the WHOLE tree and leaves
            // no tabs at all), or the served directory is not the build made.
            check('the ⬢ FPGA tab is present (BW_FPGA_REQUIRE_SURFACE=1)', false,
                `${await page.locator('[role=tab]').count()} tab(s) on screen; ` +
                (pageErrors.length ? `first page error: ${pageErrors[0]}` : 'no page errors — check the build flag and the served dir'));
            await page.screenshot({path: join(shots, '00-no-fpga-tab.png')}).catch(() => {});
            console.log(`\nFPGA surface: ${failures.length} check(s) failed`);
            await browser.close(); if (server) server.close(); process.exit(1);
        }
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

    // 5b. The PicoRV32 soft-core is a REACHABLE example, and selecting it loads a
    // real RV32I CPU into the Verilog box (the browser-honest half of "a soft-core
    // through the FPGA chain"; its bitstream is proven by verify-soft-core-synth,
    // its shape by test/fpga-soft-core.test.mjs). Done here rather than in a new
    // gate so it costs the wait census no new sleep — the wait is for the CPU
    // appearing, not a fixed guess.
    const socBtn = page.getByRole('button', {name: /PicoRV32/i}).first();
    check('the PicoRV32 soft-core is offered as an example', (await socBtn.count()) > 0);
    if (await socBtn.count()) {
        await socBtn.click();
        const loaded = await page.waitForFunction(
            () => [...document.querySelectorAll('textarea')].some(t => /module\s+picorv32/.test(t.value || '')),
            {timeout: 15000}).then(() => true).catch(() => false);
        check('selecting it loads the real PicoRV32 core into the Verilog editor', loaded);
        const cst = await page.evaluate(() => [...document.querySelectorAll('textarea')].map(t => t.value || '').find(v => /IO_LOC/.test(v)) || '');
        check('its Tang Nano 20K LED constraints load into the .cst box', /"led\[5\]"\s+20/.test(cst));
        await page.screenshot({path: join(shots, '03b-soft-core.png')}).catch(() => {});
    }

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

// A render crash in the flagged surface does not always blank the tree — it can
// leave a pane half-built while every selector above still finds something. The
// console is the only witness to that, so it is a CHECK, not a log line.
check('the surface drove with no uncaught page errors', pageErrors.length === 0,
    pageErrors.slice(0, 3).join(' | '));

await browser.close();

// 7. THE LEARNING PATH, end to end: build a real circuit on the breadboard and
// have the grader drive it. Everything above is the builder's LOOK — palette,
// canvas, toolbar, run mode — and all of it can be right while the thing the
// surface exists for does nothing. This is the only check here that fails if
// grading is dead.
//
// Driven through scripts/drive-fpga.mjs so the six traps have one home. It
// opens its own page (the drive above ends on the Circuit tab, and a fresh one
// is cheaper to reason about than an unwound state machine) against the SAME
// server, and banks challenge progress so a realise challenge is reachable
// without walking the whole curriculum.
const UNLOCK = ['wire', 'not', 'and', 'or', 'nand', 'xor', 'mux2', 'half_adder', 'full_adder',
    'register', 'toggle',
    'not_real', 'and_real', 'or_real', 'nand_real', 'nor_real', 'xor_real',
    'half_adder_real', 'full_adder_real', 'ripple_adder_real', 'adder_chip_real',
    'register_real', 'toggle_real', 'counter_real'];
let d = null;
try {
    d = await openFpga(base.replace(/\/$/, ''), {progress: UNLOCK, shots});
    // The half adder is the smallest circuit that needs TWO chips and grades
    // two outputs (sum and carry), so a grader that only ever reads one output
    // fails here and passes on every single-gate challenge.
    const kinds = await d.buildCircuit('half_adder');
    const chips = Object.entries(kinds).filter(([k]) => k.startsWith('74hc'));
    check('⚙ builds the half adder from real 74HC chips on the breadboard',
        chips.length > 0, Object.entries(kinds).map(([k, n]) => `${n}×${k}`).join(' '));

    const verdict = await d.gradeChallenge('half_adder_real');
    // PASS is read STRUCTURALLY, not from the text: the ▸ next button renders
    // only when result.pass, so this says nothing about English and cannot be
    // satisfied by a verdict that merely mentions a hopeful word.
    const passed = (await d.page.locator('[data-testid="bw-fpga-next"]').count()) > 0;
    check('Check grades the REAL board against the truth table and passes it',
        passed, verdict.text.split('\n')[0]);
    // The verdict rendered below the fold for weeks once: present in the DOM,
    // invisible to the learner. Presence is not the claim; being on screen is.
    check('the verdict is on screen inside the panel, not below the fold', verdict.onScreen);
    await d.shot('05-learning-path');

    // 8. THE SEQUENTIAL PATH, which is a different machine end to end. Everything
    // above is combinational: set the switches, read the LEDs, done in one pass.
    // counter4_real is graded by CLOCKING the board eighteen times, which is the
    // longest grade in the curriculum, and it runs through the ASYNC grader — the
    // one that yields to the event loop so the page does not freeze, reports
    // progress on the button, and must put the button back when it finishes. None
    // of that existed in a browser gate before; it was covered only by node tests,
    // where there is no button, no yielding and no event loop to block.
    //
    // It is also the only place the RESET is driven through the UI: the board has
    // two switches now, and a build whose grader did not drive `rst` would hold
    // the counter cleared and fail every row after the first.
    const kinds4 = await d.buildCircuit('counter4');
    const chips4 = Object.entries(kinds4).filter(([k]) => k.startsWith('74hc'));
    check('⚙ builds the 4-bit counter from TWO 74HC74 packages',
        chips4.reduce((n, [, c]) => n + c, 0) === 2,
        Object.entries(kinds4).map(([k, n]) => `${n}×${k}`).join(' '));
    check('the counter board carries a clock AND a reset switch',
        (kinds4.switch || 0) === 2, `${kinds4.switch || 0} switch(es)`);

    const started = Date.now();
    const verdict4 = await d.gradeChallenge('counter4_real');
    const took = Date.now() - started;
    const passed4 = (await d.page.locator('[data-testid="bw-fpga-next"]').count()) > 0;
    check('Check clocks the real 4-bit counter through 18 cycles and passes it',
        passed4, verdict4.text.split('\n')[0]);
    check('the verdict is on screen inside the panel, not below the fold', verdict4.onScreen);
    // The async grader must hand the button back. gradeChallenge already waits
    // for the pending text to clear, so reaching here proves it did — but say so
    // as its own check, because "the verdict appeared" and "the UI recovered" are
    // different claims and only one of them is about the async grader.
    const buttonText = await d.page.locator('[data-testid="bw-fpga-check"]').innerText();
    check('the Check button comes back out of its counting state',
        !/Checking|Prüfe/i.test(buttonText), buttonText.replace(/\s+/g, ' ').slice(0, 40));
    // Not a threshold anything fails on — a MEASUREMENT, printed so the next
    // person knows what the longest grade costs in a real browser before they
    // add a longer one. The drive helper's own wait is 120 s.
    console.log(`  note: grading counter4_real in a browser took ${(took / 1000).toFixed(1)} s`);
    await d.shot('06-counter4');

    check('the learning path drove with no uncaught page errors', d.errors.length === 0,
        d.errors.slice(0, 3).join(' | '));
} catch (e) {
    check('the learning-path drive completed', false, e.message.split('\n')[0]);
    if (d) await d.shot('05-learning-path-failed').catch(() => {});
} finally {
    if (d) await d.close().catch(() => {});
}

if (server) server.close();
console.log(`\n${failures.length ? `FPGA surface: ${failures.length} check(s) failed` : 'FPGA surface: all checks passed'}`);
process.exit(failures.length ? 1 : 0);

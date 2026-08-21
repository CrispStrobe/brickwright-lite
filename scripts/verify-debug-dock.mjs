#!/usr/bin/env node
/**
 * Acceptance for the debugger dock and the serial console's input line.
 *
 * Two owner-reported gaps, pinned so they cannot come back quietly:
 *
 *  1. Settings → Workspace → Debugger → **Right** rendered a BLANK pane. The
 *     right dock lives inside the designer's own tree, and the only calls that
 *     ever requested the designer chunk while coding were for docks 'top' and
 *     'solo' — so 'right' (and 'off') showed the portal host, empty and white,
 *     over the stage column. Masked whenever the user had opened the Circuit
 *     tab first, which is why it survived earlier probes.
 *  2. The serial console was display-only: BBC BASIC printed its banner and a
 *     '>' prompt with no way to answer it.
 *
 * Checks run against a production build (npm run build:gui). With no PROOF_URL
 * this serves packages/scratch-gui/build itself; with one it drives whatever is
 * already there, which is how the CI gates are wired.
 *   node scripts/verify-debug-dock.mjs
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-debug-dock.mjs
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};

let server = null;
let url = process.env.PROOF_URL || process.env.BW_URL || null;
if (!url) {
    if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');
    server = createServer(async (req, res) => {
        try {
            let path = decodeURIComponent(req.url.split('?')[0]);
            if (path.endsWith('/')) path += 'index.html';
            const file = join(build, normalize(path));
            if (!file.startsWith(build)) throw new Error('escape');
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(await readFile(file));
        } catch { res.writeHead(404); res.end('not found'); }
    });
    // Concurrent sessions run these probes side by side; take the first free
    // port rather than dying on EADDRINUSE and losing the whole run.
    const first = Number(process.env.BW_PORT || 8131);
    let port = null;
    for (let p = first; p < first + 20 && port === null; p++) {
        try {
            await new Promise((done, fail) => {
                server.once('error', fail);
                server.listen(p, () => { server.removeListener('error', fail); done(); });
            });
            port = p;
        } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }
    if (port === null) throw new Error('no free port');
    url = `http://localhost:${port}/`;
}

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};
const browser = await chromium.launch();

/** Poll instead of sleeping a guessed interval: a CI runner boots a Z80 and a
 *  ROM image a good deal slower than this laptop, and a fixed wait is either
 *  flaky there or wasted here. Returns the last value either way, so a failing
 *  check reports what it actually saw. */
const waitFor = async (read, ok, timeoutMs, stepMs = 500) => {
    const until = Date.now() + timeoutMs;
    let value = await read();
    while (!ok(value) && Date.now() < until) {
        await new Promise(done => setTimeout(done, stepMs));
        value = await read();
    }
    return value;
};

/** What the stage-column portal host is showing right now. */
const hostState = page => page.evaluate(() => {
    const host = document.querySelector('[data-bw-circuit-stage-host]');
    if (!host) return {exists: false};
    const text = host.innerText || '';
    return {
        exists: true,
        shown: getComputedStyle(host).display !== 'none',
        children: host.children.length,
        // The full DebugPanel, not the compact status strip: run control and
        // the speed dial are what "the debugger is here" means.
        hasDebugger: /Speed|Tempo/.test(text) && /Run|Start/.test(text),
        // STRUCTURAL identity, not text: the squeezed-designer regression
        // passed the text check because the designer's instruments column
        // contains the panel's words. While coding, a debugger dock must
        // portal the PANEL (data-debugger-solo-pane), and must not be the
        // designer (its toolbar carries the SELECT mode chip).
        soloPane: !!host.querySelector('[data-debugger-solo-pane]'),
        looksLikeDesigner: /SELECT/.test(text),
        noCodeHint: !!host.querySelector('[data-no-code-indicator]'),
        hasSerial: !!host.querySelector('[data-testid="bw-serial-console"]'),
        hasSerialInput: !!host.querySelector('[data-testid="bw-serial-input"]'),
        text: text.slice(0, 120).replace(/\s+/g, ' ')
    };
});

const setDock = (page, value) => page.evaluate(v => {
    // Exactly what Settings → Workspace → Debugger dispatches.
    window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-debug-dock', value: v}}));
}, value);

try {
    // ── 1 + 2: mcu-class. The Circuit tab is never opened, which is the
    // condition that used to leave the pane blank. ────────────────────────
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.waitForTimeout(4000);

    // A displayed-but-empty host is an opaque white box over the stage.
    const fresh = await hostState(page);
    check('fresh load: the stage column is never a blank white overlay',
        !fresh.exists || !fresh.shown || fresh.children > 0,
        `shown=${fresh.shown} children=${fresh.children}`);

    // THE OWNER'S CASE (2026-08-17): a fresh project — no pins, no machine —
    // dock 'right' while coding. This must be the debugger shell saying WHY
    // it is empty, never a squeezed designer and never a blank strip.
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await page.waitForTimeout(1000);
    await setDock(page, 'right');
    const freshRight = await waitFor(() => hostState(page), s => s.soloPane, 15000);
    check('no-pins coding: dock "right" portals the panel shell, not the designer',
        freshRight.soloPane && !freshRight.looksLikeDesigner,
        `soloPane=${freshRight.soloPane} designer=${freshRight.looksLikeDesigner} text="${freshRight.text}"`);
    check('no-pins coding: the shell says why it is empty', freshRight.noCodeHint || freshRight.hasDebugger,
        `noCodeHint=${freshRight.noCodeHint}`);
    await setDock(page, 'top');
    const cm = page.locator('.cm-content').first();
    await cm.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('DEVICE STC12C5A60S2\nCLOCK 11059200\nPIN led1 = P1.0 OUTPUT ACTIVE LOW\n\nWHEN flag clicked:\nFOREVER:\ntoggle led1\nwait 0.15 seconds\n', {delay: 5});
    await page.locator('button', {hasText: 'To blocks'}).first().click({force: true});
    await page.waitForTimeout(1500);
    await page.locator('[role="tab"]', {hasText: 'Blocks'}).first().click();
    await page.waitForTimeout(2500);

    await setDock(page, 'right');
    const mcuRight = await waitFor(() => hostState(page), s => s.hasDebugger, 20000);
    check('mcu bench: dock "right" renders the full debugger', mcuRight.hasDebugger,
        `children=${mcuRight.children} text="${mcuRight.text}"`);
    check('mcu bench: while coding, dock "right" is the PANEL, not a squeezed designer',
        mcuRight.soloPane && !mcuRight.looksLikeDesigner,
        `soloPane=${mcuRight.soloPane} designer=${mcuRight.looksLikeDesigner}`);

    // Round trip: the other docks still work, and coming back to 'right'
    // (designer now loaded) is the path that always worked.
    await setDock(page, 'top');
    check('mcu bench: dock "top" still renders the debugger',
        (await waitFor(() => hostState(page), s => s.hasDebugger, 15000)).hasDebugger);
    await setDock(page, 'right');
    check('mcu bench: back to "right" holds',
        (await waitFor(() => hostState(page), s => s.hasDebugger, 15000)).hasDebugger);
    await page.close();

    // ── 3 + 4: machine-class. Z80 bench, BBC BASIC, dock right, then talk
    // to the machine through the console's input line. ────────────────────
    const bench = await browser.newPage({viewport: {width: 1600, height: 1000}});
    bench.on('dialog', d => d.accept());
    await bench.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-complete', '1');
        sessionStorage.clear();
    });
    await bench.goto(url, {waitUntil: 'networkidle', timeout: 90000});
    await bench.waitForSelector('[role="tab"]', {timeout: 60000});
    await bench.locator('[role="tab"]', {hasText: 'Circuit'}).first().click();
    await bench.waitForTimeout(2500);
    try {
        await bench.locator('input[placeholder*="earch"], input[type="search"]').first()
            .fill('Z80', {timeout: 4000});
        await bench.waitForTimeout(800);
    } catch { /* the example list may not be searchable in this build */ }
    await bench.locator('text=Z80 Breadboard Computer').first().click();
    await bench.waitForTimeout(600);
    // The example row now opens cui's confirm dialog (device chooser,
    // bbd2fc2) instead of a native confirm — accept it when it appears.
    const okBtn = bench.locator('button', {hasText: /^OK$/}).first();
    if (await okBtn.count()) await okBtn.click({timeout: 5000}).catch(() => {});
    await bench.waitForTimeout(3000);
    await bench.locator('button', {hasText: 'Build Machine'}).first().click({timeout: 15000});
    await bench.waitForTimeout(2500);
    await bench.locator('[data-build-machine] button', {hasText: 'BBC BASIC'}).first().click({timeout: 15000});

    const serialText = page => page.evaluate(() => {
        const el = document.querySelector('[data-testid="bw-serial-console"]');
        return el ? el.textContent : '';
    });
    const banner = await waitFor(() => serialText(bench),
        t => /BBC BASIC/.test(t) && t.includes('>'), 45000);
    check('z80 bench: BBC BASIC boots to a prompt', /BBC BASIC/.test(banner) && banner.includes('>'),
        banner.slice(0, 80).replace(/\s+/g, ' '));

    // The dock switch AFTER a boot: the machine's config and program are
    // replayed from the window stash, so the remounted panel comes back with
    // the same machine rather than an empty one.
    await bench.locator('[role="tab"]', {hasText: 'Blocks'}).first().click();
    await bench.waitForTimeout(2500);
    await setDock(bench, 'right');
    const machineRight = await waitFor(() => hostState(bench),
        s => s.hasDebugger && s.hasSerial && s.hasSerialInput, 45000);
    check('machine bench: dock "right" renders the full debugger', machineRight.hasDebugger,
        `children=${machineRight.children} text="${machineRight.text}"`);
    check('machine bench: the serial console survives the dock move', machineRight.hasSerial);
    check('machine bench: the console offers an input line', machineRight.hasSerialInput);

    // Talk to it. BBC BASIC echoes, so the line itself coming back is the
    // proof the bytes arrived; '4' is the proof it ran them.
    //
    // The dock move remounted the panel, which reboots the machine from the
    // stashed config + image — so the console starts over, and the baseline
    // for "what the machine said in reply" is what is on screen NOW, not the
    // banner captured before the move.
    const beforeTyping = await waitFor(() => serialText(bench),
        t => /BBC BASIC/.test(t) && t.includes('>'), 45000);
    const input = bench.locator('[data-testid="bw-serial-input"]').first();
    await input.click();
    await input.fill('PRINT 2+2');
    await input.press('Enter');
    const after = await waitFor(() => serialText(bench),
        t => /(^|\n)\s*4\s*(\n|$)/.test(t.slice(beforeTyping.length)), 25000);
    const tail = after.slice(beforeTyping.length);
    check('serial input: BBC BASIC echoes the typed line', /PRINT\s*2\+2/.test(tail),
        tail.slice(0, 80).replace(/\s+/g, ' '));
    check('serial input: PRINT 2+2 answers 4', /(^|\n)\s*4\s*(\n|$)/.test(tail),
        tail.slice(0, 120).replace(/\s+/g, ' '));
    await bench.close();
} finally {
    await browser.close();
    if (server) server.close();
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nOK — the debugger docks everywhere it is asked to, and the console talks back.');

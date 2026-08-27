#!/usr/bin/env node
/** Headless acceptance checks for the debugger-only right pane (dock 'solo'):
 *  the stage column carries ONLY the DebugPanel while coding, the stage-header
 *  toggle has all four views, and the instruments-column (compact) debugger
 *  still exists in the circuit-with-debugger view. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const port = 8107;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        // Read before the head goes out: writing 200 and then failing to read
        // leaves the catch unable to send a 404, and that throw kills the gate.
        const body = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch {
        console.log(`404 ${req.url}`);
        if (!res.headersSent) res.writeHead(404);
        res.end('not found');
    }
});
await new Promise(done => server.listen(port, done));

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
page.on('console', message => { if (message.type() === 'error') console.log(`browser error ${message.text()}`); });
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

try {
    // Start in solo mode with the circuit owning the stage column.
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        // The starter-journeys overlay covers the page on a first visit and
        // intercepts every click. Every other browser gate sets this; this one
        // did not, and since CI does not run it the rot went unnoticed.
        localStorage.setItem('bw-starter-v1-complete', '1');
        // The optional right pane now ships MINIMIZED — a fresh Circuit
        // workspace gives its width to the editor, and only an explicit saved
        // preference opens it. Without this the solo pane exists but has no
        // box, which read as "the pane is missing" rather than "it is closed".
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-stage-circuit', '1');
        localStorage.setItem('bw-hide-stage', '1');
        localStorage.setItem('bw-debug-dock', 'solo');
    });
    await page.goto(`http://localhost:${port}/`, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.waitForTimeout(2000);

    // Seed a program so the debugger has something to drive: the pseudocode
    // Code tab, then back to Blocks so the portal is active.
    const codeTab = page.locator('[role="tab"]', {hasText: 'Code'}).first();
    await codeTab.click();
    await page.waitForTimeout(2500);
    // The editor is CodeMirror 6; it is only a textarea while the chunk loads,
    // which is why waiting for one timed out rather than typing into it.
    const cm = page.locator('.cm-content').first();
    const type = async text => {
        if (await cm.count()) {
            await cm.click();
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
            await page.keyboard.press('Delete');
            await page.keyboard.insertText(text);
        } else {
            await page.locator('textarea').first().fill(text, {timeout: 8000});
        }
    };
    await type(`DEVICE STC12C5A60S2
CLOCK 11059200
PIN led1 = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  FOREVER:
    toggle led1
    wait 0.15 seconds
`);
    await page.waitForTimeout(500);
    // "To blocks" is what parses the program and lands it on runtime.stc —
    // typing alone declares nothing.
    await page.locator('button', {hasText: 'To blocks'}).first().click({force: true});
    await page.waitForTimeout(1200);
    const blocksTab = page.locator('[role="tab"]', {hasText: 'Blocks'}).first();
    await blocksTab.click();
    await page.waitForTimeout(2500);

    const host = page.locator('[data-bw-circuit-stage-host]');
    check('portal host exists while coding', await host.count() === 1);

    // Solo: the pane holds the debugger, not the designer.
    const hostText = (await host.count()) ? await host.innerText() : '';
    check('solo pane carries the debugger', /Run|Step|Halt|PC/i.test(hostText), hostText.slice(0, 120).replace(/\s+/g, ' '));
    const designerInHost = await host.locator('[data-panel-navigation]').count();
    check('solo pane has no designer panel strip', designerInHost === 0, `${designerInHost} strips`);

    // The pane is genuinely wide: the debugger is not squeezed into 320px.
    const hostBox = await host.boundingBox();
    check('solo pane is wider than the old 320px column', !!hostBox && hostBox.width > 340, hostBox ? `${Math.round(hostBox.width)}px` : 'no box');

    // The view button that produces this pane is now titled "Debugger" and
    // sets dock='right'; stage-header treats 'right' and 'solo' identically
    // (`if (dock === 'solo' || dock === 'right') return 'solo'`). The old
    // "Debugger only (full pane)" title no longer exists, so asserting it was
    // testing a name rather than the behaviour behind it.
    const soloBtn = page.locator('button[title*="Debugger" i]:visible').first();
    check('the view buttons offer the debugger pane', await soloBtn.count() >= 1);

    // There is no longer a "circuit WITH debugger" view to switch to — the
    // buttons are Circuit Designer (dock 'off'), Debugger (dock 'right'),
    // micro:bit, Arcade, Controller and Scratch Stage. The old
    // `[title="Switch to debugger"]` was the previous model's name for a view
    // that no longer exists, so this round trip is rewritten against what the
    // buttons actually do rather than deleted: the pane must still swap
    // cleanly between the designer and the debugger, which is the property
    // that regressed to a blank pane twice.
    const circuitBtn = page.locator('button[title*="Circuit Designer" i]:visible').first();
    await circuitBtn.click({force: true});
    // dock 'off' is a BARE circuit by design — stage-header says so in as many
    // words ("'off' → bare circuit"). So asserting the panel-navigation strip
    // comes back was asserting the opposite of the intent, and polling for it
    // page-wide for 15s only made the wrong expectation take longer to fail.
    // What this view actually promises is the circuit WITHOUT the debugger.
    let circuitShown = 0;
    for (let i = 0; i < 20 && circuitShown === 0; i++) {
        circuitShown = await page.locator('[data-circuit-toolbar], [data-circuit-view-switcher]').count();
        if (circuitShown === 0) await page.waitForTimeout(500);
    }
    check('circuit view: the designer is showing', circuitShown >= 1, `${circuitShown} circuit chrome elements`);
    const hostTextCircuit = await host.innerText();
    check('circuit view: the debugger is not in the pane',
        !/▶ Run|⏸ Pause/.test(hostTextCircuit), hostTextCircuit.slice(0, 90).replace(/\s+/g, ' '));
    check('circuit view records dock=off', await page.evaluate(() =>
        localStorage.getItem('bw-debug-dock')) === 'off');

    // And back again — the round trip holds, which is the actual regression.
    await soloBtn.click({force: true});
    await page.waitForTimeout(2000);
    const stripSolo = await host.locator('[data-panel-navigation]').count();
    check('debugger again: designer strip gone', stripSolo === 0, `${stripSolo} strips`);
    const hostTextBack = await host.innerText();
    check('debugger again: the pane carries the debugger, not a blank column',
        /Run|Step|Pause|Stop/i.test(hostTextBack), hostTextBack.slice(0, 90).replace(/\s+/g, ' '));
    // 'right' is what the button sets; stage-header renders it as the solo
    // view. Asserting 'solo' here was asserting the old dock name.
    check('localStorage records the debugger dock', await page.evaluate(() =>
        localStorage.getItem('bw-debug-dock')) === 'right');
} finally {
    await browser.close();
    server.close();
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nOK — the debugger-only pane behaves.');

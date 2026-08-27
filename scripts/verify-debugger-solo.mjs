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

    // The stage header offers all four views, solo selected. Webpack hashes
    // the icon filenames, so locate the buttons by their title text.
    const soloBtn = page.locator('[title="Debugger only (full pane)"]');
    check('stage header has the solo view button', await soloBtn.count() >= 1);

    // Switch to circuit-with-debugger: designer returns WITH the compact
    // debugger (the instruments-panel one the owner asked to keep).
    await page.locator('[title="Switch to debugger"]').first().click({force: true});
    await page.waitForTimeout(2500);
    const stripAfter = await host.locator('[data-panel-navigation]').count();
    check('circuit view: designer panel strip is back', stripAfter >= 1, `${stripAfter} strips`);
    const hostTextAfter = await host.innerText();
    check('circuit view still carries the compact debugger', /Run|Step|Halt|PC/i.test(hostTextAfter));

    // And back to solo via the header button — the round trip holds.
    await soloBtn.first().click({force: true});
    await page.waitForTimeout(1500);
    const stripSolo = await host.locator('[data-panel-navigation]').count();
    check('solo again: designer strip gone', stripSolo === 0, `${stripSolo} strips`);
    check('localStorage records the solo dock', await page.evaluate(() => localStorage.getItem('bw-debug-dock')) === 'solo');
} finally {
    await browser.close();
    server.close();
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nOK — the debugger-only pane behaves.');

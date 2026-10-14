#!/usr/bin/env node
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
let server = null;
let url = process.env.PROOF_URL || null;
if (!url) {
    if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: scratch-gui/build is missing');
    server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escape');
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(await readFile(file));
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    await new Promise((done, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', done);
    });
    url = `http://127.0.0.1:${server.address().port}/`;
}

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1024, height: 768}, locale: 'de-DE'});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    localStorage.setItem('bw-starter-v1-complete', '1');
    localStorage.setItem('bw-right-pane-hidden', '0');
    localStorage.setItem('bw-debug-dock', 'controller');
});

try {
    await page.goto(`${url}?locale=de`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm, null, {timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-settings-change', {
        detail: {key: 'bw-debug-dock', value: 'controller'}
    })));

    const edit = page.getByTestId('bw-ctl-mode-edit');
    const play = page.getByTestId('bw-ctl-mode-play');
    await edit.waitFor({state: 'visible', timeout: 30000});
    if (await edit.textContent() !== '✎' || await play.textContent() !== '▶') {
        throw new Error('Edit/Play mode controls are not icon-only');
    }
    if (await edit.getAttribute('aria-label') !== 'Bearbeiten' || await play.getAttribute('aria-label') !== 'Spielen') {
        throw new Error('icon controls lost their German accessible names');
    }
    const [editBox, playBox] = await Promise.all([edit.boundingBox(), play.boundingBox()]);
    if (!editBox || !playBox || editBox.width > 36 || playBox.width > 36 || playBox.x + playBox.width > 1024) {
        throw new Error(`mode controls do not fit the iPad viewport: ${JSON.stringify({editBox, playBox})}`);
    }

    // The controller is a stage dock. At tablet widths the stage's resize veil
    // can overlap it in headless Chromium even though the control is visible;
    // force targets the actual button while still exercising its React handler.
    await edit.click({force: true});
    const before = await page.locator('[data-testid^="bw-ctl-remove-"]').count();
    await page.getByText('+ Widget hinzufügen', {exact: true}).click({force: true});
    await page.getByRole('button', {name: 'Taste', exact: true}).click({force: true});
    const after = await page.locator('[data-testid^="bw-ctl-remove-"]').count();
    if (after !== before + 1) throw new Error(`widget was not added (${before} -> ${after})`);

    const undo = page.getByTestId('bw-global-undo');
    if (await undo.isDisabled()) throw new Error('global undo stayed disabled after a widget edit');
    await undo.click();
    await page.waitForFunction(expected =>
        document.querySelectorAll('[data-testid^="bw-ctl-remove-"]').length === expected, before);
    if (!(await undo.isDisabled())) throw new Error('global undo did not disable after exhausting widget history');

    // The same menu control must hand off to CodeMirror's native history when
    // the Code tab becomes active; it must not consume Widget history again.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: 3}})));
    const code = page.locator('[data-testid="bw-codemirror"] .cm-content');
    await code.waitFor({state: 'visible', timeout: 30000});
    const originalCode = await code.textContent();
    await code.click();
    await page.keyboard.type('undo_probe');
    await page.waitForFunction(() => {
        const button = document.querySelector('[data-testid="bw-global-undo"]');
        return button && !button.disabled && /\(code\)$/.test(button.title);
    });
    await undo.click();
    await page.waitForFunction(expected =>
        document.querySelector('[data-testid="bw-codemirror"] .cm-content')?.textContent === expected,
    originalCode);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
} finally {
    await browser.close();
    if (server) server.close();
}

console.log('ok iPad-width Widget icons fit and global undo restores Widget and Code edits');

#!/usr/bin/env node
/** Production-browser proof that a generated 8051 ASM listing stays offline. */
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {isHostedCompilerRequest} from './lib/offline-compiler-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages/scratch-gui/build');
const shots = join(root, 'artifacts/local-asm-listing');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
    '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2'};

async function serve () {
    if (!existsSync(join(build, 'index.html'))) throw new Error(`Build first: ${build}/index.html is missing`);
    const server = createServer(async (req, res) => {
        try {
            let rel = decodeURIComponent(req.url.split('?')[0]);
            if (rel.endsWith('/')) rel += 'index.html';
            const file = join(build, normalize(rel));
            if (!file.startsWith(build)) throw new Error('path escape');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    const port = Number(process.env.BW_PORT || 8161);
    await new Promise((done, reject) => server.once('error', reject).listen(port, done));
    return {server, url: `http://127.0.0.1:${port}/`};
}

async function waitFor (read, accept, timeoutMs = 60000) {
    const end = Date.now() + timeoutMs;
    let last;
    do {
        try { last = await read(); } catch (error) { last = {error: String(error.message || error)}; }
        if (accept(last)) return last;
        await new Promise(resolveWait => setTimeout(resolveWait, 250));
    } while (Date.now() < end);
    return last;
}

await mkdir(shots, {recursive: true});
let server;
let url = process.env.PROOF_URL;
if (!url) ({server, url} = await serve());
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const hosted = [];
const errors = [];
const results = [];
const record = (name, ok, detail = '') => {
    results.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.route('**/*', route => {
    if (isHostedCompilerRequest(route.request(), url)) {
        hosted.push(route.request().url());
        return route.abort('blockedbyclient');
    }
    return route.continue();
});
page.on('pageerror', error => errors.push(String(error.message || error)));
page.on('dialog', dialog => dialog.accept());
await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('bw-starter-v1-complete', '1');
    localStorage.setItem('bw-right-pane-hidden', '0');
});

try {
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.locator('[role="tab"]', {hasText: /^Code$/i}).first().click();
    const editor = page.locator('.cm-content').first();
    await editor.waitFor({state: 'visible', timeout: 60000});
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(`DEVICE STC12C5A60S2
CLOCK 11059200
PIN led = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  turn on led
  wait 0.02 seconds
  turn off led`);
    await page.locator('button', {hasText: /To blocks/i}).first().click({force: true});
    const blockCount = await waitFor(() => page.evaluate(() =>
        [...document.querySelectorAll('.blocklyDraggable')].filter(node => !node.closest('.blocklyFlyout')).length),
    count => count >= 3);
    record('the 8051 source became a real workspace', blockCount >= 3, `${blockCount} blocks`);

    await page.locator('[role="tab"]', {hasText: /^Code$/i}).first().click();
    await page.locator('button', {hasText: /ASM/}).first().click();
    const mode = page.locator('select').filter({has: page.locator('option[value="listing"]')}).first();
    await mode.selectOption('listing');
    const first = await waitFor(() => page.evaluate(() => ({
        text: document.querySelector('.cm-content')?.innerText || '',
        body: document.body.innerText
    })), value => /main\.c:\d+:/.test(value.text) && /^\s*[0-9A-F]{4,6}\s+[0-9A-F]{2}/mi.test(value.text), 120000);
    record('Listing mode shows source-interleaved linked addresses',
        /main\.c:\d+:/.test(first?.text || '') && /^\s*[0-9A-F]{4,6}\s+[0-9A-F]{2}/mi.test(first?.text || ''),
        `${(first?.text || '').length} chars`);
    record('the UI reports source mappings', /source mapping/i.test(first?.body || ''),
        (first?.body || '').match(/\d+ source mapping[^\n]*/i)?.[0] || 'missing');

    // A non-empty listing alone could be a stale cache hit. Change the actual
    // program, rebuild the workspace, and require a different linked artifact.
    const firstListing = first?.text || '';
    await page.locator('button', {hasText: /Pseudo/}).first().click();
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(`DEVICE STC12C5A60S2
CLOCK 11059200
PIN led = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  repeat 3:
    toggle led
    wait 0.01 seconds
  turn off led`);
    await page.locator('button', {hasText: /To blocks/i}).first().click({force: true});
    const changedBlocks = await waitFor(() => page.evaluate(() =>
        [...document.querySelectorAll('.blocklyDraggable')].filter(node => !node.closest('.blocklyFlyout')).length),
    count => count > blockCount);
    record('the changed 8051 source rebuilt the workspace', changedBlocks > blockCount,
        `${blockCount} → ${changedBlocks} blocks`);
    await page.locator('[role="tab"]', {hasText: /^Code$/i}).first().click();
    await page.locator('button', {hasText: /ASM/}).first().click();
    const second = await waitFor(() => page.locator('.cm-content').first().innerText(),
        text => text !== firstListing && /main\.c:\d+:/.test(text) &&
            /^\s*[0-9A-F]{4,6}\s+[0-9A-F]{2}/mi.test(text), 120000);
    record('a second source hash produces a distinct linked listing',
        Boolean(second && second !== firstListing && /main\.c:\d+:/.test(second)),
        `${firstListing.length} → ${(second || '').length} chars`);
    record('the listing editor is read-only', await editor.getAttribute('contenteditable') === 'false',
        `contenteditable=${await editor.getAttribute('contenteditable')}`);
    record('the listing made no hosted compiler request', hosted.length === 0, `${hosted.length} blocked`);
    record('no uncaught page errors', errors.length === 0, errors.join(' | '));
    await page.screenshot({path: join(shots, 'listing.png'), fullPage: true});
    await readFile(join(shots, 'listing.png'));
} catch (error) {
    errors.push(String(error.stack || error));
    try { await page.screenshot({path: join(shots, 'failure.png'), fullPage: true}); } catch { /* page died */ }
    record('gate completed', false, String(error.message || error));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}

const passed = results.filter(result => result.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (results.some(result => !result.ok)) process.exit(1);

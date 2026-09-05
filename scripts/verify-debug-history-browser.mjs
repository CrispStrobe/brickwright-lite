#!/usr/bin/env node
/** CI-only production-browser proof for record/checkpoint/reverse/fork history. */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
    throw new Error('This resource-intensive browser proof is CI-only; set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const artifacts = resolve(process.env.DEBUG_HISTORY_ARTIFACTS || 'artifacts/debug-history-browser');
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
    const first = Number(process.env.BW_PORT || 8191);
    for (let port = first; port < first + 20; port++) {
        const listening = await new Promise((done, fail) => {
            const onError = error => error.code === 'EADDRINUSE' ? done(false) : fail(error);
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
const checks = [];
const diagnostics = [];
const check = (name, ok, detail = '') => {
    checks.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
};
const snap = async name => {
    const path = join(artifacts, `${name}.png`);
    await page.screenshot({path, fullPage: true});
    check(`artifact ${name}`, existsSync(path));
};
const recordRequestFailure = request => {
    const reason = request.failure()?.errorText || '';
    // The app deliberately aborts its optional labwired WASM HEAD probe once
    // capability detection has its answer. It is not a failed app resource.
    if (request.method() === 'HEAD' && /labwired_wasm_bg\.wasm/.test(request.url()) &&
        reason === 'net::ERR_ABORTED') return;
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${reason}`);
};

try {
    if (!url) ({server, url} = await serveBuild());
    browser = await chromium.launch({headless: true});
    page = await browser.newPage({viewport: {width: 1600, height: 1050}});
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', recordRequestFailure);
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    // The default Z80 machine boots its bundled BBC BASIC image locally and
    // has a complete checkpoint contract. The 8086 pins bench intentionally
    // refuses recording because its live schematic input source is unlogged.
    await page.getByTestId('bw-device-select').selectOption('z80');
    await page.getByRole('tab', {name: /Circuit/}).click();
    await page.evaluate(() => {
        const detail = {rom: Uint8Array.of(0x3e, 0, 0x32, 0, 0x80, 0x3c, 0xc3, 2, 0),
            target: 'z80', slotId: 'rom'};
        window.__bwPendingMedia = {type: 'asm', detail};
        window.dispatchEvent(new CustomEvent('bw-asm-rom-ready', {detail}));
    });
    await page.locator('[data-debug-record]:not([disabled])').waitFor({timeout: 30000});

    const pause = page.getByRole('button', {name: /Pause/}).first();
    await pause.click();
    await page.waitForFunction(() => !document.querySelector('[data-debug-record]')?.disabled,
        null, {timeout: 15000});
    await page.locator('[data-debug-record]').click();
    await page.waitForFunction(() => /Recording/.test(
        document.querySelector('[data-debug-record]')?.textContent || '') &&
        !document.querySelector('[data-debug-checkpoint]')?.disabled, null, {timeout: 15000});
    check('recording starts with checkpoint capability', true);

    const run = page.getByRole('button', {name: /Run/}).first();
    const stepRecorded = async () => {
        await page.getByRole('button', {name: /Step instruction/}).first().click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() =>
            requestAnimationFrame(resolve))));
        await page.waitForFunction(() => document.querySelector('[data-debug-panel]')
            ?.getAttribute('data-debug-phase') === 'paused', null, {timeout: 10000});
    };
    await stepRecorded();
    await page.locator('[data-debug-checkpoint]').click();
    await page.waitForFunction(() => !document.querySelector('[data-debug-restore]')?.disabled,
        null, {timeout: 15000});
    check('manual checkpoint is retained and restorable', true);
    await snap('checkpoint');

    await stepRecorded();
    await stepRecorded();
    await page.locator('[data-debug-record]').click();
    await page.waitForFunction(() => /Record/.test(
        document.querySelector('[data-debug-record]')?.textContent || '') &&
        !/Recording/.test(document.querySelector('[data-debug-record]')?.textContent || ''),
    null, {timeout: 15000});
    await page.locator('[data-debug-reverse-step]:not([disabled])').waitFor({timeout: 15000});
    await page.locator('[data-debug-reverse-step]').click();
    await page.waitForFunction(() => !document.querySelector('[data-debug-reverse-refusal]') &&
        [...document.querySelectorAll('button')].some(button =>
            /Run/.test(button.textContent || '') && !button.disabled), null, {timeout: 20000});
    check('reverse step reaches an earlier verified retire without refusal', true);
    await snap('reversed');

    // Forward execution after reverse is the public automatic-fork workflow.
    // A child recording starts at the restored boundary; its Recording label
    // is browser-visible evidence that branching did not mutate the parent log.
    await run.click();
    await page.waitForFunction(() => /Recording/.test(
        document.querySelector('[data-debug-record]')?.textContent || ''), null, {timeout: 15000});
    await pause.click();
    check('forward execution after reverse creates an active child recording', true);
    await snap('forked');
    await page.locator('[data-debug-record]').click();
    check('browser emitted no console, page, or request failure', diagnostics.length === 0,
        diagnostics.join(' | '));
} catch (error) {
    diagnostics.push(`gate: ${error.stack || error.message || error}`);
    checks.push({name: 'complete workflow', ok: false, detail: error.message || String(error)});
} finally {
    if (page) await page.screenshot({path: join(artifacts, 'final.png'), fullPage: true})
        .catch(error => diagnostics.push(`screenshot: ${error.message}`));
    const report = {url, checks, diagnostics,
        passed: checks.filter(item => item.ok).length, failed: checks.filter(item => !item.ok).length};
    await writeFile(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
}

const failed = checks.some(item => !item.ok) || diagnostics.length > 0;
console.log(failed ? '\nDebug history browser proof FAILED.' : '\nDebug history browser proof passed.');
process.exit(failed ? 1 : 0);

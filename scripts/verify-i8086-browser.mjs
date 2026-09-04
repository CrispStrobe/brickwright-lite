#!/usr/bin/env node
/**
 * Production-browser acceptance for the 8086 ASM journey.
 *
 * One Chromium session drives two unchanged examples through the controls a
 * learner uses. `keys` proves selection, the local assembler, the DOS bench,
 * CGA pixels and live keyboard input. `pins` proves that the same route also
 * reaches the 8255 faces: closing PC0 changes the program's PA0..PA3 outputs.
 *
 * With PROOF_URL this drives an already-served production build. Without it,
 * the script serves packages/scratch-gui/build itself.
 */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {isHostedCompilerRequest} from './lib/offline-compiler-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const artifacts = resolve(process.env.I8086_BROWSER_ARTIFACTS || 'artifacts/i8086-browser');
const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

async function serveBuild () {
    if (!existsSync(join(build, 'index.html'))) {
        throw new Error(`Build first: ${join(build, 'index.html')} is missing`);
    }
    const server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escaped the build');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    const first = Number(process.env.BW_PORT || 8181);
    for (let port = first; port < first + 20; port++) {
        const listening = await new Promise((done, fail) => {
            const onError = error => {
                server.removeListener('listening', onListening);
                if (error.code === 'EADDRINUSE') done(false);
                else fail(error);
            };
            const onListening = () => {
                server.removeListener('error', onError);
                done(true);
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port);
        });
        if (listening) return {server, url: `http://localhost:${port}/`};
    }
    throw new Error('no free port for the production build');
}

await mkdir(artifacts, {recursive: true});
const results = [];
const diagnostics = [];
const record = (name, ok, detail = '') => {
    results.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

let server = null;
let browser = null;
let page = null;
let url = process.env.PROOF_URL || process.env.BW_URL || null;
const hostedCompilerRequests = [];
let interceptionControls = 0;

try {
    if (!url) ({server, url} = await serveBuild());
    browser = await chromium.launch({headless: true});
    page = await browser.newPage({viewport: {width: 1600, height: 1050}});
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
    page.on('requestfailed', request => diagnostics.push(
        `requestfailed: ${request.method()} ${request.url()} — ${request.failure()?.errorText || 'unknown'}`));
    page.on('response', response => {
        if (response.status() >= 400) diagnostics.push(
            `http ${response.status()}: ${response.request().method()} ${response.url()}`);
    });
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            diagnostics.push(`console.${message.type()}: ${message.text()}`);
        }
    });
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });

    // Keep the built app and its lazy chunks local, but make a hosted compiler
    // physically unreachable. The synthetic request is the positive control:
    // zero journey requests means something only after the interceptor proves
    // that it can see and stop one with the same method/origin/path shape.
    const appOrigin = new URL(url).origin;
    await page.route(requestUrl => {
        try { return new URL(requestUrl).origin !== appOrigin; } catch { return false; }
    }, route => {
        const request = route.request();
        if (!isHostedCompilerRequest(request, url)) return route.continue();
        if (new URL(request.url()).searchParams.get('bw-i8086-proof-control') === '1') {
            interceptionControls++;
        }
        else hostedCompilerRequests.push(request.url());
        return route.abort('blockedbyclient');
    });

    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.evaluate(async () => {
        try {
            await fetch('https://stc-compiler.vercel.app/compile?bw-i8086-proof-control=1', {
                method: 'POST', body: '{}'
            });
        } catch { /* the route must abort this request */ }
    });
    record('offline interceptor catches a foreign compiler POST', interceptionControls === 1,
        `caught ${interceptionControls}`);

    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const device = page.getByTestId('bw-device-select');
    await device.waitFor({state: 'visible', timeout: 15000});
    await device.selectOption('i8086');
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="bw-device-select"]')?.value === 'i8086',
    null, {timeout: 15000});
    await page.getByTestId('bw-lang-row').getByRole('button', {name: /ASM/}).click();

    const examples = page.getByTestId('bw-asm-examples');
    await examples.waitFor({state: 'visible', timeout: 15000});
    await examples.selectOption('keys');
    await page.waitForFunction(() =>
        /A Program That Waits For You/.test(document.querySelector('.cm-content')?.textContent || ''),
    null, {timeout: 15000});
    record('the shipped keyboard example loads through the picker', true);

    await page.getByTestId('bw-asm-assemble').click();
    await page.waitForFunction(() => /Assembled \d+ bytes in this browser.*booting the 8086 bench/.test(
        document.querySelector('[data-testid="bw-code-status"]')?.textContent || ''),
    null, {timeout: 30000});
    record('the ASM button reports the local route and boots the 8086 bench', true);

    await page.getByRole('tab', {name: /Circuit/}).click();

    await page.waitForFunction(() => /Type something\. ESC quits\./.test(
        document.querySelector('[data-testid="bw-serial-console"]')?.textContent || ''),
    null, {timeout: 30000});
    record('the running program prints its prompt', true);

    // Read the actual canvas. DOM text alone would stay green if the CGA face
    // stopped painting; requiring dark and foreground samples rejects both a
    // blank canvas and a one-colour fill.
    await page.waitForFunction(() => {
        const canvas = document.querySelector('[data-vdp-screen] canvas');
        if (!canvas || !canvas.width || !canvas.height) return false;
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0;
        let foreground = 0;
        for (let i = 0; i < data.length; i += 16) {
            const light = data[i] + data[i + 1] + data[i + 2];
            if (light < 24) dark++;
            else foreground++;
        }
        return dark > 100 && foreground > 40;
    }, null, {timeout: 30000, polling: 'raf'});
    const canvasSize = await page.locator('[data-vdp-screen] canvas').evaluate(
        canvas => `${canvas.width}x${canvas.height}`);
    record('the CGA face contains background and rendered foreground pixels', true, canvasSize);

    const input = page.getByTestId('bw-serial-input');
    await input.waitFor({state: 'visible', timeout: 15000});
    await input.fill('Z');
    await input.press('Enter');
    await page.waitForFunction(() => /Z\s+5A/.test(
        document.querySelector('[data-testid="bw-serial-console"]')?.textContent || ''),
    null, {timeout: 20000});
    record('a typed Z reaches INT 21h and the program answers with 5A', true);

    // A second unchanged example gives the DOS bench a port-driving program.
    // Reusing this page also exercises replacement and runner teardown rather
    // than paying for (and hiding behind) a fresh app load.
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await examples.selectOption('pins');
    await page.waitForFunction(() =>
        /An LED and a Switch on the 8255/.test(document.querySelector('.cm-content')?.textContent || ''),
    null, {timeout: 15000});
    record('the shipped 8255 example replaces the first example', true);

    await page.getByTestId('bw-asm-assemble').click();
    await page.getByRole('tab', {name: /Circuit/}).click();
    await page.waitForFunction(() => {
        const status = document.querySelector('[data-testid="bw-code-status"]')?.textContent || '';
        const led = document.querySelector('[data-testid="bw-led-ppi1-a-7"]');
        return /Assembled \d+ bytes in this browser.*booting the 8086 bench/.test(status) &&
            led && !/not driven/.test(led.getAttribute('aria-label') || '');
    }, null, {timeout: 30000});

    const topLed = page.getByTestId('bw-led-ppi1-a-7');
    const firstTopState = await topLed.getAttribute('aria-label');
    await page.waitForFunction(before => {
        const now = document.querySelector('[data-testid="bw-led-ppi1-a-7"]')?.getAttribute('aria-label');
        return now && now !== before && !/not driven/.test(now);
    }, firstTopState, {timeout: 5000, polling: 'raf'});
    record('the running 8255 program changes a driven output', true, firstTopState || 'no initial label');

    const pc0 = page.getByTestId('bw-switch-ppi1-c-0');
    await pc0.waitFor({state: 'visible', timeout: 15000});
    await pc0.click();
    await page.waitForFunction(() => [0, 1, 2, 3].every(bit =>
        /: on$/.test(document.querySelector(`[data-testid="bw-led-ppi1-a-${bit}"]`)
            ?.getAttribute('aria-label') || '')),
    null, {timeout: 5000, polling: 'raf'});
    record('closing 8255 PC0 makes the program drive PA0..PA3 high', true);

    record('the 8086 journey made no hosted compiler request', hostedCompilerRequests.length === 0,
        hostedCompilerRequests.join(' | '));
    record('the browser raised no uncaught page error',
        !diagnostics.some(line => line.startsWith('pageerror:')),
        diagnostics.filter(line => line.startsWith('pageerror:')).join(' | '));
} catch (error) {
    diagnostics.push(`gate: ${error.stack || error.message || error}`);
    if (page) {
        const state = await page.evaluate(() => ({
            pending: window.__bwPendingMedia && {
                type: window.__bwPendingMedia.type,
                target: window.__bwPendingMedia.detail?.target,
                bytes: window.__bwPendingMedia.detail?.rom?.length
            },
            consoles: document.querySelectorAll('[data-testid="bw-serial-console"]').length,
            debugPanels: document.querySelectorAll('[data-debug-panel-crash]').length,
            debugSlots: document.querySelectorAll('[data-debug-host-slot]').length,
            rightPane: localStorage.getItem('bw-right-pane-hidden')
        })).catch(e => ({diagnosticError: e.message}));
        diagnostics.push(`browser-state: ${JSON.stringify(state)}`);
    }
    record('the complete 8086 browser journey finishes', false, error.message || String(error));
} finally {
    if (page) {
        await page.screenshot({path: join(artifacts, 'final.png'), fullPage: true}).catch(error => {
            diagnostics.push(`screenshot: ${error.message}`);
        });
    }
    const report = {
        url, scenarios: results.length, passed: results.filter(result => result.ok).length,
        interceptionControls, hostedCompilerRequests, results, diagnostics
    };
    await writeFile(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
}

const failures = results.filter(result => !result.ok);
console.log(failures.length ? `\n${failures.length} 8086 browser check(s) failed.` :
    '\nAll 8086 production-browser checks passed.');
process.exit(failures.length ? 1 : 0);

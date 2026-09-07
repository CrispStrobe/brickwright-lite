#!/usr/bin/env node
/**
 * CI browser proof for the Circuit Designer Machine Loader.
 *
 * No gallery example and no palette entry places an 8086 today. This gate uses
 * the existing learner path instead: Circuit tab -> File -> Open circuit,
 * loading the existing reseated 8086 fixture, then Build Machine and the
 * landed timerdemo preset button. The preset must dispatch media into the
 * debugger, whose collector state changes from `none` to `empty`.
 *
 * A second, fresh page intercepts that preset's ROM with HTTP 404. It drives
 * the same controls and feeds the observed response through the same verdict
 * used by the green journey. The gate passes only when that mutation makes the
 * success verdict red and names both timerdemo and HTTP 404.
 */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages/scratch-gui/build');
const fixture = join(root, 'test/fixtures/reseat/e4-reseated-8086.json');
const artifacts = resolve(process.env.MACHINE_LOADER_ARTIFACTS || 'artifacts/machine-loader-rom-control');
const timerRom = 'i8086-timer-demo.bin';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};

export function requireTimerdemoDelivery ({status, event, panelState}) {
    if (status !== 200) throw new Error(`timerdemo preset fetch failed: HTTP ${status}`);
    if (!event) throw new Error('timerdemo preset fetched but bw-machine-media-load was not dispatched');
    if (event.profile !== 'timerdemo' || event.name !== timerRom) {
        throw new Error(`timerdemo dispatched wrong media: ${JSON.stringify(event)}`);
    }
    if (event.kind !== 'i8086' || event.slotId !== 'rom' || !(event.byteLength > 0)) {
        throw new Error(`timerdemo media has wrong machine/slot/bytes: ${JSON.stringify(event)}`);
    }
    if (panelState !== 'empty') {
        const kind = panelState === 'none' || panelState === null ? 'no collector' : `${panelState} refusal rows`;
        throw new Error(`timerdemo media did not reach an empty debugger collector: ${kind}`);
    }
    return true;
}

export function require8086OnBoard (circuit) {
    const kinds = new Set(['i8086', '8086', 'i8088', '8088']);
    if (!(circuit?.parts || []).some(part => kinds.has(part.kind))) {
        throw new Error('no 8086 on the board: Machine Loader cannot render');
    }
    return true;
}

async function serveBuild () {
    if (!existsSync(join(build, 'index.html'))) throw new Error(`Build first: ${build}/index.html is missing`);
    const server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escaped build');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': mime[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    const first = Number(process.env.BW_PORT || 8198);
    for (let port = first; port < first + 20; port++) {
        const listening = await new Promise((done, fail) => {
            const onError = error => error.code === 'EADDRINUSE' ? done(false) : fail(error);
            server.once('error', onError);
            server.listen(port, () => { server.removeListener('error', onError); done(true); });
        });
        if (listening) return {server, url: `http://localhost:${port}/`};
    }
    throw new Error('no free browser-proof port');
}

async function open8086Machine (page, url) {
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
        window.__p6aMediaEvents = [];
        window.addEventListener('bw-machine-media-load', event => {
            const detail = event.detail || {};
            window.__p6aMediaEvents.push({
                slotId: detail.slotId,
                kind: detail.kind,
                profile: detail.profile,
                name: detail.name,
                byteLength: detail.bytes && detail.bytes.length,
                romAt: detail.romAt
            });
        });
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: /Circuit/}).click();
    await page.getByText('File', {exact: true}).click();
    const chooserPromise = page.waitForEvent('filechooser', {timeout: 30000});
    await page.getByText(/Open circuit/, {exact: false}).click();
    await (await chooserPromise).setFiles(fixture);
    await page.locator('[data-build-machine]').waitFor({state: 'visible', timeout: 30000});
    const beforeBuild = await page.evaluate(() => window.__bwMachineExtracted ? 'bench' : 'no-bench');
    if (beforeBuild !== 'no-bench') throw new Error(`expected no bench before Build Machine, got ${beforeBuild}`);
    await page.locator('[data-build-machine]').getByRole('button', {name: /Build Machine/}).click();
    await page.getByTestId('bw-machine-preset-timerdemo').waitFor({state: 'visible', timeout: 30000});
    await page.locator('[data-debug-panel]').first().waitFor({state: 'visible', timeout: 30000});
    const beforeMedia = await page.locator('[data-debug-panel]').first()
        .getAttribute('data-debug-chip-refusal-state');
    if (beforeMedia !== 'none') {
        throw new Error(`expected extracted bench with no collector before media, got ${beforeMedia}`);
    }
    return {beforeBuild, beforeMedia};
}

async function driveTimerdemo (browser, url, {missing = false} = {}) {
    const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
    const diagnostics = [];
    page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
    });
    if (missing) {
        await page.route(`**/static/roms/${timerRom}`, route => route.fulfill({
            status: 404,
            body: 'missing by P6a mutation'
        }));
    }
    try {
        const states = await open8086Machine(page, url);
        const responsePromise = page.waitForResponse(response =>
            new URL(response.url()).pathname.endsWith(`/static/roms/${timerRom}`), {timeout: 30000});
        await page.getByTestId('bw-machine-preset-timerdemo').click();
        const response = await responsePromise;
        if (response.status() === 200) {
            await page.waitForFunction(() => {
                const event = window.__p6aMediaEvents?.find(item => item.profile === 'timerdemo');
                const panel = document.querySelector('[data-debug-panel]');
                const state = panel?.getAttribute('data-debug-chip-refusal-state');
                return event && state && state !== 'none';
            }, null, {timeout: 40000});
        } else {
            await page.waitForFunction(rom =>
                [...document.querySelectorAll('[data-build-machine] *')]
                    .some(node => (node.textContent || '').includes(`✗ ${rom}: HTTP 404`)),
            timerRom, {timeout: 15000});
        }
        const observed = await page.evaluate(profile => ({
            event: window.__p6aMediaEvents?.find(item => item.profile === profile) || null,
            panelState: document.querySelector('[data-debug-panel]')
                ?.getAttribute('data-debug-chip-refusal-state') || null
        }), 'timerdemo');
        return {status: response.status(), ...observed, states, diagnostics, page};
    } catch (error) {
        error.page = page;
        error.diagnostics = diagnostics;
        throw error;
    }
}

async function main () {
    if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
        throw new Error(
            'This resource-intensive browser proof is CI-only; set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly');
    }
    await mkdir(artifacts, {recursive: true});
    let server;
    let browser;
    let lastPage;
    const receipt = {};
    try {
        let url = process.env.PROOF_URL || process.env.BW_URL;
        if (!url) ({server, url} = await serveBuild());
        const {chromium} = await import('playwright');
        browser = await chromium.launch({headless: true});

        const circuit = JSON.parse(await readFile(fixture, 'utf8'));
        require8086OnBoard(circuit);
        const withoutCpu = structuredClone(circuit);
        withoutCpu.parts = withoutCpu.parts.filter(part =>
            !new Set(['i8086', '8086', 'i8088', '8088']).has(part.kind));
        let noCpuError = null;
        try { require8086OnBoard(withoutCpu); } catch (error) { noCpuError = error; }
        if (!noCpuError || !/no 8086 on the board/.test(noCpuError.message)) {
            throw new Error(`CPU-removal mutation stayed green: ${noCpuError?.message || 'no error'}`);
        }
        receipt.cpuMutation = {red: noCpuError.message};
        console.log(`PASS: mutation fired — ${noCpuError.message}`);

        const green = await driveTimerdemo(browser, url);
        lastPage = green.page;
        requireTimerdemoDelivery(green);
        receipt.green = {
            status: green.status,
            states: {...green.states, afterMedia: green.panelState},
            event: green.event
        };
        console.log(`PASS: timerdemo reached the debugger — ${JSON.stringify(receipt.green)}`);
        await green.page.screenshot({path: join(artifacts, 'timerdemo-loaded.png'), fullPage: true});
        await green.page.close();

        const mutation = await driveTimerdemo(browser, url, {missing: true});
        lastPage = mutation.page;
        let mutationError = null;
        try { requireTimerdemoDelivery(mutation); } catch (error) { mutationError = error; }
        if (!mutationError || !/timerdemo preset fetch failed: HTTP 404/.test(mutationError.message)) {
            throw new Error('missing-ROM mutation did not redden the gate by preset/status: '
                + (mutationError?.message || 'gate stayed green'));
        }
        if (mutation.event !== null) {
            throw new Error(`404 timerdemo dispatched media: ${JSON.stringify(mutation.event)}`);
        }
        receipt.mutation = {status: mutation.status, event: mutation.event, red: mutationError.message};
        console.log(`PASS: mutation fired — ${mutationError.message}`);
        await mutation.page.screenshot({path: join(artifacts, 'timerdemo-404.png'), fullPage: true});
        await mutation.page.close();

        await writeFile(join(artifacts, 'receipt.json'), JSON.stringify(receipt, null, 2));
    } catch (error) {
        if (lastPage) await lastPage.screenshot({path: join(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
        await writeFile(join(artifacts, 'failure.json'), JSON.stringify({
            error: error.stack || String(error),
            receipt
        }, null, 2)).catch(() => {});
        throw error;
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(done => server.close(done));
    }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) await main();

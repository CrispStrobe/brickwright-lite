#!/usr/bin/env node
/**
 * CI-only production-browser proof: the panel's refusal state follows the handle.
 *
 * THIS GATE IS A REDUCTION, AND SAYING SO IS THE POINT. It proves the RENDER —
 * that the panel reads debugChipRefusals() and draws what it returns — and it
 * does NOT prove the user journey, because there is no user journey to prove.
 * Measured 2026-09-06: no route a user can reach today produces a durable chip
 * refusal. The ASM tab always returns profile 'dos' (assemble-route.js:347 and
 * :402 — a .COM loaded as a ROM at F0000 executes nothing), so it boots the DOS
 * bench, which has no chips and no collector at all. The no-media route boots
 * the XT BIOS on PCXT8086, which does have chips, and its only refusal is
 * pic1's — present for FOUR STEPS out of 1,579,840 while the 8259 init sequence
 * is incomplete, then correctly cleared. Four steps inside a 1.58 M-step boot is
 * not observable from a browser; a gate that tried would be a race wearing a
 * check.
 *
 * So chipRefusals() has consumers and no reachable producer in the UI yet. The
 * ROM-format boot-media route (BREADBOARD8086, ppi1 at port 0) would give one,
 * and the 8255 mode-1 program in test/debug-chip-refusal-line.test.mjs is the
 * program for it — it needs a named control in the Machine Loader first, which
 * is the debugger lane's question. Recorded as a plan item under lane P.
 *
 * WHAT IS PROVED HERE, then. The panel exposes data-debug-chip-refusal-state on
 * its root, which is 'none' when the attached machine has no collector, 'empty'
 * when it has one that found nothing, and the row count otherwise. On the ASM
 * bench that value must be 'none' and no block may render. That is a real
 * assertion about real wiring: it fails if the panel stops reading the handle,
 * if the handle stops distinguishing the two, or if the block renders when the
 * model is empty. It does not, and does not claim to, prove a row reaching the
 * screen.
 *
 * THE POSITIVE PATH IS PROVED IN test/debug-chip-refusal-line.test.mjs — eight
 * assertions, six mutations red, against the vendored machine. That file is the
 * proof of the feature; this one is the proof of the wire.
 */
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
const artifacts = resolve(process.env.CHIP_REFUSAL_ARTIFACTS || 'artifacts/debug-chip-refusal-line');
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
    const first = Number(process.env.BW_PORT || 8231);
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

    /** Put a program in the ASM editor and boot the 8086 bench from it. */
    const assemble = async (source) => {
        await page.getByRole('tab', {name: 'Code', exact: true}).click();
        const device = page.getByTestId('bw-device-select');
        await device.waitFor({state: 'visible', timeout: 20000});
        await device.selectOption('i8086');
        await page.waitForFunction(() =>
            document.querySelector('[data-testid="bw-device-select"]')?.value === 'i8086',
        null, {timeout: 20000});
        await page.getByTestId('bw-lang-row').getByRole('button', {name: /ASM/}).click();
        const editor = page.locator('.cm-content').first();
        await editor.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.insertText(source);
        await page.getByTestId('bw-asm-assemble').click();
        await page.waitForFunction(() => /Assembled \d+ bytes in this browser/.test(
            document.querySelector('[data-testid="bw-code-status"]')?.textContent || ''),
        null, {timeout: 40000});
        await page.getByRole('tab', {name: /Circuit/}).click();
        await page.locator('[data-debug-panel]:visible').first().waitFor({timeout: 40000});
    };
    const refusalLines = () => page.evaluate(() =>
        [...document.querySelectorAll('[data-debug-chip-refusal]')].map(n => n.textContent.trim()));

    // ---- the ASM bench: a collector that is not there ----------------------
    // profile 'dos' on both assemble-route paths, so this is the DOS bench: no
    // chips, no collector. 'none' is the honest report and is DIFFERENT from
    // 'empty' — one says this machine cannot report refusals, the other says it
    // has nothing to report. They look identical on screen, which is why the
    // panel states which.
    await assemble(' mov al, 0A0h\n out 03h, al\nloop0:\n jmp loop0\n');
    const state = await page.locator('[data-debug-panel]').first()
        .getAttribute('data-debug-chip-refusal-state');
    check('the panel states the refusal state of the attached bench', state !== null,
        'data-debug-chip-refusal-state is absent, so the panel is not reading the handle at all');
    check('the ASM bench reports no collector rather than an empty one', state === 'none',
        `state was ${JSON.stringify(state)} — if this is 'empty' the DOS bench has gained a `
        + "collector and this gate can be promoted to drive a real refusal; if it is a number, "
        + 'a refusal became reachable and the reduction in this header is out of date');
    const blocks = await page.locator('[data-debug-chip-refusals]').count();
    check('no block renders when the model has nothing', blocks === 0, `found ${blocks}`);
    const lines = await refusalLines();
    check('and no lines', lines.length === 0, JSON.stringify(lines));
    await snap('asm-bench-no-collector');

    check('no page errors or failed requests', diagnostics.length === 0,
        diagnostics.slice(0, 4).join(' | '));
    await writeFile(join(artifacts, 'result.json'),
        JSON.stringify({url, state, blocks, lines, checks, diagnostics}, null, 2));
    console.log(`\nChip-refusal render wiring: ${checks.filter(c => c.ok).length}/${checks.length} checks passed.`);
} catch (error) {
    if (page) await page.screenshot({path: join(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
    await writeFile(join(artifacts, 'failure.txt'),
        `${error.stack || error}\n\ndiagnostics:\n${diagnostics.join('\n')}\n`).catch(() => {});
    throw error;
} finally {
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
}

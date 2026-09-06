#!/usr/bin/env node
/**
 * CI-only production-browser proof: the debugger says what a chip refused.
 *
 * The 8237 stores a memory-to-memory command bit and behaves as though it were
 * clear. From the program's side that is indistinguishable from a controller
 * that honoured the request and had nothing to copy, so a driver gets no data
 * and no reason. test/debug-chip-refusal-line.test.mjs proves the MODEL turns
 * that into a line; this proves the line reaches a real browser, through the
 * real runner, off a program the user assembled.
 *
 * BOTH DIRECTIONS, AND THE ABSENT CASE RUNS FIRST on purpose. A gate that only
 * checks the line appears cannot tell a working panel from one that shows the
 * warning always. Running a clean program first and requiring NO block, then the
 * refusing program and requiring exactly one line, makes the block's appearance
 * evidence about the program rather than about the page.
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

    // ---- the absent case, first ------------------------------------------
    // A program that asks for nothing the model declines. If the panel showed
    // its refusal block here, every check below would be worthless. The wait is
    // on the panel being present (inside assemble), never on elapsed time.
    await assemble(' mov al, 00h\n mov bl, al\nloop0:\n jmp loop0\n');
    const cleanBlocks = await page.locator('[data-debug-chip-refusals]').count();
    check('a program that refuses nothing shows no chip-refusal block', cleanBlocks === 0,
        `found ${cleanBlocks} block(s)`);
    const cleanLines = await refusalLines();
    check('and no chip-refusal lines', cleanLines.length === 0, JSON.stringify(cleanLines));
    await snap('clean-program-no-refusal');

    // ---- the refusing case -------------------------------------------------
    // Command register bit 0 is memory-to-memory: the write a DMA block-copy
    // driver makes, and the one the 8237 stores and does not act on.
    await assemble(' mov al, 01h\n out 08h, al\nloop0:\n jmp loop0\n');
    await page.locator('[data-debug-chip-refusal]').first().waitFor({timeout: 40000});
    const lines = await refusalLines();
    check('the block-copy request produces exactly one chip-refusal line',
        lines.length === 1, JSON.stringify(lines));
    const [line] = lines;
    check('the line names the part that refused', /^dma1:/.test(line), line);
    check('the line carries the SYMPTOM, not only the feature',
        /moves nothing and the temporary register reads back zero/.test(line), line);
    check('the line carries the address the program touched', /at 08h/.test(line), line);
    check('one occurrence prints no count', !/refusals/.test(line), line);
    const part = await page.locator('[data-debug-chip-refusal]').first()
        .getAttribute('data-debug-chip-refusal-part');
    check('the line is keyed by part so a joiner can use it', part === 'dma1', String(part));
    await snap('block-copy-refusal-line');

    check('no page errors or failed requests', diagnostics.length === 0,
        diagnostics.slice(0, 4).join(' | '));
    await writeFile(join(artifacts, 'result.json'),
        JSON.stringify({url, cleanLines, lines, checks, diagnostics}, null, 2));
    console.log(`\nChip-refusal line: ${checks.filter(c => c.ok).length}/${checks.length} checks passed.`);
} catch (error) {
    if (page) await page.screenshot({path: join(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
    await writeFile(join(artifacts, 'failure.txt'),
        `${error.stack || error}\n\ndiagnostics:\n${diagnostics.join('\n')}\n`).catch(() => {});
    throw error;
} finally {
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
}

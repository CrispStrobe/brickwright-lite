#!/usr/bin/env node
/**
 * CI-only production-browser proof: the debugger says what a chip refused.
 *
 * The 8255 accepts a mode-1 control word and runs it as mode 0. From the
 * program's side that is indistinguishable from a port that implemented the
 * handshake, so a driver waiting on the strobe acknowledgement waits on a bit
 * that never moves. test/debug-chip-refusal-line.test.mjs proves the MODEL turns
 * that into a line; this proves the line reaches a real browser, through the
 * real runner, off a program the user assembled.
 *
 * WHY THE 8255 AND NOT THE 8237, which is the chip the unit test drives. The
 * ASM route boots BREADBOARD8086, whose chips are `ppi1` and `uart1` — THERE IS
 * NO DMA CONTROLLER ON THIS BENCH. The 8237 lives on PCXT8086, the config the
 * BIOS and Machine Loader routes use. A first version of this gate wrote the
 * memory-to-memory command to port 08h and waited forty seconds for a line that
 * could never appear: the port decoded to nothing, so no chip refused anything,
 * and the timeout looked like a broken panel rather than a program aimed at
 * hardware that was not there. The gate proves the same thing either way — a
 * real program, a real refusal, one line — and it has to use a chip the bench
 * it runs on actually has. test/debug-chip-refusal-line.test.mjs asserts BOTH
 * benches, so a config change that removes this chip fails in node rather than
 * as a forty-second browser timeout.
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
    // ppi1 sits at port 0 on this bench, so its control port is 3. A control
    // word selecting mode 1 on group A is what a driver writes when it wants
    // the strobed handshake; the 8255 takes it and runs as mode 0.
    await assemble(' mov al, 0A0h\n out 03h, al\nloop0:\n jmp loop0\n');
    // WAIT, THEN SAY WHICH HALF FAILED. A bare 40-second timeout on the line
    // locator reports "not visible" and leaves you choosing between "the model
    // produced no row" and "the model produced a row the panel did not render" —
    // and the first time this gate went red, the answer was neither obvious nor
    // the one I assumed. The block (plural attribute) renders only when the model
    // returned at least one row, so its presence separates the two cleanly with
    // no extra plumbing: no block means the MODEL is empty, block without lines
    // means the RENDER dropped them.
    try {
        await page.locator('[data-debug-chip-refusal]').first().waitFor({timeout: 40000});
    } catch (timeout) {
        const trail = await page.evaluate(() => ({
            block: document.querySelectorAll('[data-debug-chip-refusals]').length,
            lines: document.querySelectorAll('[data-debug-chip-refusal]').length,
            phase: document.querySelector('[data-debug-panel]')?.getAttribute('data-debug-phase'),
            status: document.querySelector('[data-testid="bw-code-status"]')?.textContent?.slice(0, 160),
            debugAttrs: [...new Set([...document.querySelectorAll('[data-debug-panel] *')]
                .flatMap(n => [...n.attributes].map(a => a.name)
                    .filter(a => a.startsWith('data-debug-'))))].sort().slice(0, 40)
        }));
        const verdict = trail.block === 0
            ? 'THE MODEL RETURNED NO ROWS — the program did not reach a refusal on this bench. '
              + 'Check the config actually has the chip the program targets: the ASM route boots '
              + 'BREADBOARD8086 (ppi1, uart1) and has no DMA controller, so a write to an '
              + 'undecoded port refuses nothing and looks exactly like this.'
            : 'THE MODEL RETURNED ROWS AND THE PANEL DID NOT RENDER THEM — the block is present '
              + 'with no lines inside it, so the fault is in the render, not the collector.';
        throw new Error(`${verdict}\n  trail: ${JSON.stringify(trail)}\n  ${timeout.message}`);
    }
    const lines = await refusalLines();
    check('the mode-1 control word produces exactly one chip-refusal line',
        lines.length === 1, JSON.stringify(lines));
    const [line] = lines;
    check('the line names the part that refused', /^ppi1:/.test(line), line);
    check('the line carries the SYMPTOM, not only the feature',
        /waits on a bit that never moves/.test(line), line);
    check('the line carries the address the program touched', /at 03h/.test(line), line);
    check('one occurrence prints no count', !/refusals/.test(line), line);
    const part = await page.locator('[data-debug-chip-refusal]').first()
        .getAttribute('data-debug-chip-refusal-part');
    check('the line is keyed by part so a joiner can use it', part === 'ppi1', String(part));
    await snap('mode-1-refusal-line');

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

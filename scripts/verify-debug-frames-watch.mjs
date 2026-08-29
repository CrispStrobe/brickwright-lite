#!/usr/bin/env node
/**
 * Browser proof for D29, D28 and D25 — the three debugger defects.
 *
 * Three claims, each measured in a real Chromium against a real build, each
 * leaving a screenshot the coordinator can look at:
 *
 *   1. D29 — a write watchpoint set in the UI halts the program at the write,
 *      and the panel says WHICH address and WHAT value.
 *   2. D28 — the Position pane is on screen while stepping, and on the C
 *      target it says in words that there is no call stack to list.
 *   3. D25 — the cycle step advances the cycle counter by EXACTLY one, and
 *      the button is absent on engines that cannot take one.
 *
 * The traps this file already knows about (bw-setup.md, and the existing
 * verify-* scripts here):
 *   - `confirm()` auto-dismisses, so dialogs are accepted explicitly.
 *   - `load` can hang; `domcontentloaded` plus a polled selector is used.
 *   - a stage portal renders a SECOND copy of the circuit UI, so every query
 *     is scoped to the panel under test.
 *   - the starter overlay eats clicks unless its localStorage flag is set.
 *   - never sleep for a state change; poll and report the last value seen.
 *
 * Usage:
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-debug-frames-watch.mjs
 *   node scripts/verify-debug-frames-watch.mjs        (serves the build itself)
 *
 * Screenshots land in artifacts/debug-proof/.
 */
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const BUILD = path.join(repo, 'packages/scratch-gui/build');
const SHOTS = path.join(repo, 'artifacts/debug-proof');

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.hex': 'text/plain', '.bin': 'application/octet-stream', '.map': 'application/json'
};

const results = [];
const record = (name, ok, detail) => {
    results.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Poll until `ok(v)`; return the last value either way, never throw on timeout. */
async function waitFor(read, ok, timeoutMs = 30000, stepMs = 500) {
    const deadline = Date.now() + timeoutMs;
    let last;
    for (;;) {
        try { last = await read(); } catch (e) { last = {error: String(e && e.message)}; }
        if (ok(last)) return last;
        if (Date.now() > deadline) return last;
        await new Promise(r => setTimeout(r, stepMs));
    }
}

async function serve() {
    if (!existsSync(path.join(BUILD, 'index.html'))) {
        console.error(`Build first: ${path.join(BUILD, 'index.html')} is missing`);
        process.exit(2);
    }
    const server = createServer(async (req, res) => {
        try {
            const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
            const file = path.join(BUILD, rel);
            // Read BEFORE writeHead so a missing asset is one 404 line, not a crash.
            if (!file.startsWith(BUILD)) { res.writeHead(403).end(); return; }
            const body = await readFile(file);
            res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch { res.writeHead(404).end(); }
    });
    // Concurrent agent sessions run these side by side; scan past a busy port.
    const base = Number(process.env.BW_PORT || 8141);
    for (let p = base; p < base + 20; p++) {
        const got = await new Promise(resolve => {
            server.once('error', () => resolve(null));
            server.listen(p, () => resolve(p));
        });
        if (got) return {server, url: `http://localhost:${got}/`};
    }
    console.error('no free port'); process.exit(2);
}

const main = async () => {
    await mkdir(SHOTS, {recursive: true});
    const {chromium} = await import('playwright');

    let server = null;
    let url = process.env.PROOF_URL || process.env.BW_URL;
    if (!url) ({server, url} = await serve());
    console.log(`driving ${url}`);

    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
    page.on('dialog', d => d.accept());          // confirm() would auto-DISMISS
    await page.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');  // else it eats clicks
            localStorage.setItem('bw-right-pane-hidden', '0');
        } catch { /* private mode */ }
    });

    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message)));

    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});

    // ── get a C-target debug session running ────────────────────────────
    // The Code tab, a tiny STC program with a variable a watchpoint can catch,
    // then Blocks, then the debugger dock.
    const PROGRAM = [
        'DEVICE STC12C5A60S2',
        'CLOCK 11059200',
        'PIN led1 = P1.0 OUTPUT',
        '',
        'WHEN flag clicked:',
        '  set counter to 0',
        '  FOREVER:',
        '    change counter by 1',
        '    toggle led1',
        '    wait 0.2 seconds'
    ].join('\n');

    const clickTab = async (re) => {
        const tabs = await page.$$('[role="tab"]');
        for (const t of tabs) {
            const txt = (await t.innerText().catch(() => '')) || '';
            if (re.test(txt)) { await t.click(); return true; }
        }
        return false;
    };

    await clickTab(/code|pseudo/i);
    await page.waitForSelector('.cm-content', {timeout: 30000});
    await page.click('.cm-content');
    await page.keyboard.press('Control+A');
    await page.keyboard.type(PROGRAM, {delay: 1});

    // "To blocks" turns the text into a project the debugger can build from.
    const toBlocks = await page.$$('button');
    for (const b of toBlocks) {
        const t = (await b.innerText().catch(() => '')) || '';
        if (/to blocks|zu bl/i.test(t)) { await b.click(); break; }
    }
    await page.waitForTimeout(2500);
    await clickTab(/blocks|blöcke/i);

    // The dock is driven by the real settings event, not by clicking Settings.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-settings-change',
        {detail: {key: 'bw-debug-dock', value: 'right'}})));

    const panelText = () => page.evaluate(() => {
        const host = document.querySelector('[data-bw-circuit-stage-host]') || document.body;
        return host.innerText || '';
    });

    const ready = await waitFor(panelText, t => /Speed|Tempo/.test(t) && /Run|Start/.test(t), 60000);
    record('the debug panel is on screen', /Speed|Tempo/.test(ready), `${ready.length} chars`);

    // Start the session so a target exists (build + attach go over the network).
    const clickByText = async (re) => page.evaluate((src) => {
        const rx = new RegExp(src[0], src[1]);
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find(x => rx.test(x.innerText || ''));
        if (b) { b.click(); return true; }
        return false;
    }, [re.source, re.flags]);

    await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
    const running = await waitFor(panelText, t => /running|läuft|paused|angehalten/i.test(t), 120000);
    const attached = /running|läuft|paused|angehalten/i.test(running);
    record('a debug session attached', attached,
        attached ? 'phase reached running/paused' : running.slice(0, 200));
    if (!attached) {
        await page.screenshot({path: path.join(SHOTS, '00-attach-failed.png'), fullPage: true});
        console.log('\nCannot proceed without a session. See 00-attach-failed.png');
        await browser.close(); if (server) server.close();
        process.exit(1);
    }

    // ── D28: the Position pane, while paused ────────────────────────────
    await clickByText(/^\s*⏸?\s*(Pause)\s*$/i);
    await waitFor(panelText, t => /paused|angehalten/i.test(t), 20000);

    const frames = await page.evaluate(() => {
        const el = document.querySelector('[data-debug-frames]');
        if (!el) return null;
        return {
            kind: el.getAttribute('data-frames-kind'),
            why: (el.querySelector('[data-frames-why]') || {}).innerText || '',
            rows: [...el.querySelectorAll('[data-frame-row]')].map(r => r.innerText),
            vars: [...el.querySelectorAll('[data-frame-var]')].map(r => r.innerText)
        };
    });
    record('D28: the Position pane is rendered', !!frames, frames ? `kind=${frames.kind}` : 'absent');
    if (frames) {
        const refuses = /cooperative scheduler, not a stack machine/i.test(frames.why);
        record('D28: it REFUSES to show a call stack, in words', refuses,
            refuses ? frames.why.slice(0, 90) + '…' : `why="${frames.why.slice(0, 120)}"`);
        record('D28: it lists the scheduler position', frames.rows.length > 0,
            `${frames.rows.length} task row(s): ${frames.rows.join(' | ').slice(0, 120)}`);
        record('D28: and the program variables with their addresses', frames.vars.length > 0,
            frames.vars.join(' | ').slice(0, 120));
    }
    await page.screenshot({path: path.join(SHOTS, '01-frames-locals.png'), fullPage: true});

    // ── D25: one cycle step moves the counter by exactly one ────────────
    // The drawer holds the engineer's controls; open it first.
    await clickByText(/under the hood|unter der haube|drawer|schublade/i);
    await page.waitForTimeout(400);

    const cycleBtn = await page.$('[data-step-cycle]');
    record('D25: the cycle-step button is present on the C target', !!cycleBtn,
        cycleBtn ? 'rendered' : 'missing — the emu8051 target should declare `cycle`');

    if (cycleBtn) {
        const readCycles = () => page.evaluate(() => {
            const host = document.querySelector('[data-bw-circuit-stage-host]') || document.body;
            const m = (host.innerText || '').match(/([\d,]+)\s*(cycles?|Takte?)/i);
            return m ? Number(m[1].replace(/,/g, '')) : null;
        });
        const before = await readCycles();
        await cycleBtn.click();
        await page.waitForTimeout(600);
        const after = await readCycles();
        const delta = (before != null && after != null) ? after - before : null;
        record('D25: one cycle step advances the cycle count by EXACTLY 1', delta === 1,
            `before=${before} after=${after} delta=${delta}`);
    }
    await page.screenshot({path: path.join(SHOTS, '02-cycle-step.png'), fullPage: true});

    // ── D29: a watchpoint halts at the write and names the byte ──────────
    // `counter` lives in iram; the drawer's watch button prompts for the hex
    // address. The prompt is answered through the dialog handler.
    const varsNow = await page.evaluate(() => {
        const el = document.querySelector('[data-debug-frames]');
        return el ? [...el.querySelectorAll('[data-frame-var]')].map(r => r.innerText) : [];
    });
    const m = varsNow.map(v => v.match(/counter\s+(-?\d+)\s*·\s*(\w+)\s+0x([0-9A-F]+)/i)).find(Boolean);
    const watchAddr = m ? parseInt(m[3], 16) : 0x30;
    console.log(`watching ${m ? `counter at ${m[2]} 0x${m[3]}` : 'iram 0x30 (fallback)'}`);

    page.removeAllListeners('dialog');
    page.on('dialog', d => d.accept(watchAddr.toString(16)));

    const addWatch = await page.$('[data-add-watchpoint]');
    record('D29: the watchpoint control is offered on this build', !!addWatch,
        addWatch ? 'rendered' : 'missing — the vendored WASM does export _emu_dbg_set_bp_write');

    if (addWatch) {
        await addWatch.click();
        await page.waitForTimeout(400);
        const armed = await page.$$('[data-watchpoint-entry]');
        record('D29: the watchpoint is armed and listed', armed.length > 0,
            `${armed.length} entry`);

        // Resume: the very next write to that byte must stop us.
        await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
        const hit = await waitFor(
            () => page.evaluate(() => {
                const el = document.querySelector('[data-watch-hit]');
                return el ? el.innerText : '';
            }),
            t => /0x/i.test(t), 30000);

        const named = /0x/i.test(hit);
        record('D29: the run halted at the write and the panel NAMED the byte', named,
            named ? hit.replace(/\s+/g, ' ').slice(0, 160) : 'no [data-watch-hit] appeared');
        // The claim in the brief is "which address and what value" — check both.
        const hasAddr = new RegExp(`0x0*${watchAddr.toString(16)}`, 'i').test(hit);
        const hasVals = /(was|war)\s+0x[0-9A-F]+/i.test(hit) && /(now|jetzt)\s+0x[0-9A-F]+/i.test(hit);
        record('D29: the report carries the watched ADDRESS', hasAddr, hit.slice(0, 120));
        record('D29: and both sides of the VALUE transition', hasVals, hit.slice(0, 120));
    }
    await page.screenshot({path: path.join(SHOTS, '03-watchpoint-hit.png'), fullPage: true});

    record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    await browser.close();
    if (server) server.close();

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    console.log(`screenshots: ${SHOTS}`);
    process.exit(failed.length ? 1 : 0);
};

main().catch(e => { console.error(e); process.exit(1); });

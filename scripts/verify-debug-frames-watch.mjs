#!/usr/bin/env node
/**
 * Offline browser proof for D2, D29, D28 and D25.
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
import {isHostedCompilerRequest} from './lib/offline-compiler-policy.mjs';

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
    const hostedCompilerRequests = [];
    // Keep localhost available for the production bundle and its WASM assets,
    // but make the hosted compiler physically unreachable. Abort before the
    // request leaves Chromium and retain its URL as failure evidence.
    await page.route('**/*', route => {
        if (isHostedCompilerRequest(route.request(), url)) {
            hostedCompilerRequests.push(route.request().url());
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });
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
    //
    // Load the EXAMPLE rather than typing a program. The first version of this
    // script typed pseudocode into CodeMirror and it half-converted:
    // CodeMirror auto-indents, so the leading spaces compounded, the FOREVER
    // body was lost, and the project that reached the compiler was `set
    // counter to 0` and nothing else. The image then built with no yield
    // states, symbol extraction failed ("bw_task0: no code address for the
    // case labels of states [0]"), and the runner attached WITHOUT the 8051
    // debug target — which reported no watchpoints and no cycle step, and the
    // proof duly "failed" for a reason that had nothing to do with either
    // feature. A known-good bench removes the whole class of that mistake.
    //
    // `05-counter` is `debug-watches`'s own bench: DEVICE STC12C5A60S2, a
    // counter variable, and a button. Exactly the target D29's row was about.
    // NOT ONE waitForTimeout IN THIS FILE, deliberately. test/wait-census.test.mjs
    // ratchets the fixed sleeping CI does, and the first version of this script
    // added seven sleeps totalling 9.1 s — which the ratchet caught to the
    // millisecond (116.9 s -> 126.0 s, 261 -> 268). Every one of them was
    // standing in for a condition that can be waited on directly.
    //
    // GETTING A SESSION TOOK THREE ATTEMPTS AND EACH FAILED DIFFERENTLY. Worth
    // recording, because each failure looked like a broken feature:
    //
    //  1. Typing the program with leading indentation. CodeMirror auto-indents,
    //     so the spaces COMPOUNDED and the FOREVER body nested wrong; what
    //     reached the compiler was `set counter to 0` and nothing else, the
    //     image built with no yield states, symbol extraction failed, and the
    //     runner attached WITHOUT the 8051 target — reporting no watchpoints
    //     and no cycle step, i.e. exactly the two defects under test.
    //  2. Loading the 05-counter example and reading the Blocks tab. The blocks
    //     canvas was empty and the tab said "Costumes" — a SPRITE was selected.
    //     BrickWright programs live on the STAGE; the program was there all
    //     along, in a workspace nobody was looking at.
    //  3. Typing an unindented program with no circuit. The debugger refuses:
    //     "needs a program and a chip to drive". A program alone is not a
    //     session — the chip comes from the circuit.
    //
    // So: load the example, which carries BOTH halves, and select the stage.
    // `05-counter` is `debug-watches`'s own bench — DEVICE STC12C5A60S2 with a
    // counter variable and a button, the exact target D29's row was about.
    await page.locator('[role="tab"]', {hasText: /Circuit/i}).first().click();
    const search = page.locator('input[placeholder*="earch"], input[type="search"]').first();
    try {
        await search.waitFor({state: 'visible', timeout: 30000});
        await search.fill('counter');
    } catch { /* the example list may not be searchable in this build */ }

    const row = page.locator('text=/counter/i').first();
    await row.waitFor({state: 'visible', timeout: 30000});
    await row.click();

    // The example row opens cui's own confirm dialog (device chooser), not a
    // native confirm — accept it explicitly when it appears.
    try {
        const okBtn = page.locator('button:visible', {hasText: /^OK$/}).first();
        await okBtn.waitFor({timeout: 8000});
        await okBtn.click();
    } catch { /* some examples load without the chooser */ }

    // The load is done when the project is named after the example.
    const title = await waitFor(
        () => page.evaluate(() => {
            const el = document.querySelector('input[class*="title-field"], [class*="project-title"] input');
            return el ? el.value : '';
        }),
        t => /counter/i.test(t || ''), 60000, 500);
    record('the example bench loaded', /counter/i.test(title || ''), `project title: "${title}"`);

    // Keep the example's real solved circuit, but author the canonical program
    // through the public Code surface. The gallery currently selects a sprite
    // whose editor is empty; trusting that selection made this gate test zero
    // blocks. `insertText` sends the whole string without CodeMirror adding
    // indentation to an already-indented multiline paste.
    const selectedStage = await page.evaluate(() => {
        const state = window.__brickwrightStore?.getState();
        const vm = state?.scratchGui?.vm;
        const stage = vm?.runtime?.targets?.find(target => target && target.isStage);
        if (!vm || !stage) return {id: null, stateKeys: Object.keys(state || {}),
            guiKeys: Object.keys(state?.scratchGui || {}), hasVm: !!vm,
            targetCount: vm?.runtime?.targets?.length ?? null};
        vm.setEditingTarget(stage.id);
        return {id: stage.id};
    });
    record('the Stage target is selected for the hardware program', !!selectedStage.id,
        selectedStage.id || JSON.stringify(selectedStage));
    await page.locator('[role="tab"]', {hasText: /^Code$/i}).first().click();
    const cm = page.locator('.cm-content').first();
    await cm.waitFor({state: 'visible', timeout: 30000});
    await cm.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(`DEVICE STC12C5A60S2
CLOCK 11059200

PIN led = P1.0 OUTPUT ACTIVE LOW
PIN button = P3.2 INPUT ACTIVE LOW

WHEN flag clicked:
  set count to 0
  FOREVER:
    wait until read button
    change count by 1
    turn on led
    wait 0.25 seconds
    turn off led
    wait 0.25 seconds`);
    const authored = await page.evaluate(() => {
        const el = document.querySelector('.cm-content');
        return el ? el.innerText : '';
    });
    record('the counter program is in the editor',
        /DEVICE\s+STC12/i.test(authored) && /FOREVER/i.test(authored) && /change\s+count\s+by\s+1/i.test(authored),
        `${authored.length} chars`);

    await page.locator('button', {hasText: /To blocks/i}).first().click({force: true});
    await page.locator('[role="tab"]', {hasText: /^Blocks$/i}).first().click();

    // Count blocks in the MAIN workspace, which means excluding the palette.
    // `document.querySelector('.blocklyBlockCanvas')` returns the FLYOUT's
    // canvas first, so the scoped count read 0 while the unscoped one read 107
    // — the palette. Measured both ways in the same run before believing
    // either: the earlier unscoped version reported 107 blocks on a project
    // whose workspace held two.
    const blocks = await waitFor(
        () => page.evaluate(() => {
            const all = [...document.querySelectorAll('.blocklyDraggable')];
            return all.filter(b => !b.closest('.blocklyFlyout')).length;
        }),
        n => n > 3, 60000, 500);
    record('the program is on the stage workspace', blocks > 3,
        `${blocks} blocks in the workspace canvas`);

    // Does a CHIP exist? The debugger refuses without one, and its refusal
    // ("needs a program and a chip to drive") reads the same whether the
    // circuit failed to load or the program did — so ask the documented
    // diagnosis hooks directly rather than inferring from the refusal.
    const boardInfo = await page.evaluate(() => {
        const b = window.__activeBoard || window.__board;
        const c = window.__circuit;
        const parts = c && c.parts ? c.parts : (b && b.parts) || null;
        return {
            hasBoard: !!b,
            hasCircuit: !!c,
            partCount: Array.isArray(parts) ? parts.length : null,
            kinds: Array.isArray(parts) ? [...new Set(parts.map(p => p && p.kind))].slice(0, 12) : null
        };
    });
    record('a chip is on the board for the debugger to drive',
        !!(boardInfo.hasBoard && boardInfo.hasCircuit && boardInfo.kinds && boardInfo.kinds.includes('mcu')),
        JSON.stringify(boardInfo));

    // The dock is driven by the real settings event, not by clicking Settings.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-settings-change',
        {detail: {key: 'bw-debug-dock', value: 'right'}})));

    const debugPanel = page.locator('[data-debug-panel]:visible').first();
    await debugPanel.waitFor({state: 'visible', timeout: 30000});
    const panelText = () => debugPanel.innerText();
    const phase = () => debugPanel.getAttribute('data-debug-phase');

    const ready = await waitFor(panelText, t => /Speed|Tempo/.test(t) && /Run|Start/.test(t), 60000);
    record('the debug panel is on screen', /Speed|Tempo/.test(ready), `${ready.length} chars`);

    // Start the session so a target exists. The route above makes a hosted
    // compile impossible; success therefore proves the shipped local pipeline.
    const clickByText = async re => {
        const button = debugPanel.locator('button', {hasText: re}).first();
        await button.waitFor({state: 'visible', timeout: 15000});
        await button.click();
    };

    await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
    const running = await waitFor(phase, p => p === 'running', 120000);
    const attached = running === 'running';
    record('a debug session attached', attached,
        attached ? 'phase=running' : `last phase=${running}`);
    record('D2: the 8051 build made exactly zero hosted compiler requests',
        hostedCompilerRequests.length === 0,
        hostedCompilerRequests.length ? hostedCompilerRequests.join(' | ') : '0 POST /compile requests');
    if (!attached) {
        await page.screenshot({path: path.join(SHOTS, '00-attach-failed.png'), fullPage: true});
        console.log('\nCannot proceed without a session. See 00-attach-failed.png');
        await browser.close(); if (server) server.close();
        process.exit(1);
    }

    // ── D28: the Position pane, while paused ────────────────────────────
    await clickByText(/^\s*⏸?\s*(Pause)\s*$/i);
    const paused = await waitFor(phase, p => p === 'paused', 20000);
    record('the session is paused before inspecting or stepping', paused === 'paused',
        `phase=${paused}`);

    const frames = await debugPanel.evaluate(el => {
        el = el.querySelector('[data-debug-frames]');
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
    await clickByText(/under the hood|unter der haube/i);
    // Everything below lives inside the drawer's `open` branch, so a failed
    // toggle would read as "the feature is missing". Confirm it opened.
    const drawerOpen = await waitFor(
        () => debugPanel.locator('[data-watchpoints]').count().then(n => n > 0), v => v, 10000);
    record('the under-the-hood drawer opened', drawerOpen,
        drawerOpen ? 'watchpoints pane present' : 'toggle did not open the drawer');

    const cycleBtn = debugPanel.locator('[data-step-cycle]').first();
    const hasCycleBtn = await cycleBtn.count() > 0;
    record('D25: the cycle-step button is present on the C target', hasCycleBtn,
        hasCycleBtn ? 'rendered' : 'missing — the emu8051 target should declare `cycle`');

    if (hasCycleBtn) {
        const readCycles = () => debugPanel.evaluate(el => {
            const m = (el.innerText || '').match(/([\d.,]+)\s*(cycles?|Zyklen)\s*@/i);
            return m ? Number(m[1].replace(/[.,]/g, '')) : null;
        });
        const before = await readCycles();
        await cycleBtn.click();
        // Wait for the number to MOVE rather than for a fixed 600 ms. This is
        // strictly better than a sleep here: it cannot pass by reading a stale
        // value, and it cannot fail because the box was busy.
        const after = await waitFor(readCycles, v => v !== null && v !== before, 15000, 100);
        const delta = (before != null && after != null) ? after - before : null;
        record('D25: one cycle step advances the cycle count by EXACTLY 1', delta === 1,
            `before=${before} after=${after} delta=${delta}`);
    }
    await page.screenshot({path: path.join(SHOTS, '02-cycle-step.png'), fullPage: true});

    // ── D29: a watchpoint halts at the write and names the byte ──────────
    // `counter` lives in iram; the drawer's watch button prompts for the hex
    // address. The prompt is answered through the dialog handler.
    const varsNow = await debugPanel.evaluate(el => {
        el = el.querySelector('[data-debug-frames]');
        return el ? [...el.querySelectorAll('[data-frame-var]')].map(r => r.innerText) : [];
    });
    const m = varsNow.map(v => v.match(/^([^\n]+)[\s\S]*?(iram)\s+0x([0-9A-F]+)/i)).find(Boolean);
    record('D29: a rendered IRAM variable supplies the watch address', !!m,
        m ? `${m[1].trim()} at ${m[2]} 0x${m[3]}` : `variables: ${varsNow.join(' | ')}`);
    const watchAddr = m ? parseInt(m[3], 16) : null;
    if (watchAddr === null) {
        await browser.close(); if (server) server.close();
        process.exit(1);
    }
    console.log(`watching ${m[1].trim()} at ${m[2]} 0x${m[3]}`);

    page.removeAllListeners('dialog');
    page.on('dialog', d => d.accept(watchAddr.toString(16)));

    const addWatch = debugPanel.locator('[data-add-watchpoint]').first();
    const hasAddWatch = await addWatch.count() > 0;
    record('D29: the watchpoint control is offered on this build', hasAddWatch,
        hasAddWatch ? 'rendered' : 'missing — the vendored WASM does export _emu_dbg_set_bp_write');

    if (hasAddWatch) {
        await addWatch.click();
        // The armed entry is the condition; the prompt is answered by the
        // dialog handler above, so this resolves as soon as React repaints.
        const entry = debugPanel.locator('[data-watchpoint-entry]').first();
        await entry
            .waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        const entryText = await entry.count() ? await entry.innerText() : '';
        const armedAtAddress = new RegExp(`(?:0x)?0*${watchAddr.toString(16)}\\b`, 'i').test(entryText);
        record('D29: the watchpoint is armed and listed at that address', armedAtAddress,
            entryText || 'no entry');

        // Resume: the very next write to that byte must stop us.
        await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
        const resumed = await waitFor(phase, p => p === 'running', 15000, 25);
        record('D29: the session resumed with the watch armed', resumed === 'running',
            `phase=${resumed}`);
        const pressed = await page.evaluate(() => {
            const board = window.__activeBoard || window.__board;
            const circuit = window.__circuit;
            const button = circuit && Array.isArray(circuit.parts) &&
                circuit.parts.find(p => p && p.kind === 'button');
            if (!board || typeof board.setControl !== 'function' || !button) return null;
            board.setControl(button.id, 1);
            return button.id;
        });
        record('D29: the example button is pressed through the active solved board', !!pressed,
            pressed || 'no active-board button control');
        const hit = await waitFor(
            () => debugPanel.evaluate(root => {
                const el = root.querySelector('[data-watch-hit]');
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

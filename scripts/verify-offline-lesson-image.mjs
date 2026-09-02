#!/usr/bin/env node
/**
 * Offline browser proof for D2's second half: an AVR lesson bench starts with
 * the network switched off, on its shipped image.
 *
 * `verify-debug-frames-watch.mjs` is the same proof for the 8051 family, where
 * the answer is a compiler that runs in the browser. This is the other half:
 * families whose compiler CANNOT run in the browser, whose lessons declare
 * `environment: "simulation"`, and which therefore ship the image instead —
 * the pattern D7 established for the machine ROMs.
 *
 * Four claims, in one real Chromium against one real build:
 *
 *   1. With EVERY cross-origin request aborted, `debug-timing-bugs`'s own
 *      bench (`arduino-02-blink-without-delay`, DEVICE ARDUINO-UNO) reaches a
 *      running debug session.
 *   2. Nothing was asked of the hosted compiler — zero POSTs, and in fact zero
 *      cross-origin requests of any kind.
 *   3. The panel SAYS the image is prebuilt, and says it in the terms the
 *      learner needs: which bench, which compiler, when, and that an edit makes
 *      it stop applying.
 *   4. An EDIT falls through. After changing the program the shipped image no
 *      longer matches, the runner goes for the hosted compiler, the blocked
 *      request proves it went, and the panel fails honestly instead of running
 *      the old firmware under a new program's name. That last one is the whole
 *      safety property: a prebuilt image that quietly outlived its program
 *      would be worse than no prebuilt image at all.
 *
 * The traps this file inherits (bw-setup.md and the sibling verify-* scripts):
 * `confirm()` auto-DISMISSES so dialogs are accepted explicitly; `load` can
 * hang, so `domcontentloaded` plus a polled selector; a stage portal renders a
 * SECOND copy of the circuit UI, so every query is scoped to the panel under
 * test; the starter overlay eats clicks unless its localStorage flag is set;
 * and NOT ONE fixed sleep — `test/wait-census.test.mjs` ratchets those, and
 * every one of them stands in for a condition that can be waited on.
 *
 * Usage:
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-offline-lesson-image.mjs
 *   node scripts/verify-offline-lesson-image.mjs        (serves the build itself)
 *
 * Screenshots land in artifacts/offline-lesson-image/.
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
const SHOTS = path.join(repo, 'artifacts/offline-lesson-image');

/** D38's actual Wave 5 timing bench, not a neighboring AVR smoke fixture. */
const EXAMPLE = 'arduino-02-blink-without-delay';

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
async function waitFor (read, ok, timeoutMs = 30000, stepMs = 500) {
    const deadline = Date.now() + timeoutMs;
    let last;
    for (;;) {
        try { last = await read(); } catch (e) { last = {error: String(e && e.message)}; }
        if (ok(last)) return last;
        if (Date.now() > deadline) return last;
        await new Promise(r => setTimeout(r, stepMs));
    }
}

async function serve () {
    if (!existsSync(path.join(BUILD, 'index.html'))) {
        console.error(`Build first: ${path.join(BUILD, 'index.html')} is missing`);
        process.exit(2);
    }
    const server = createServer(async (req, res) => {
        try {
            const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
            const file = path.join(BUILD, rel);
            if (!file.startsWith(BUILD)) { res.writeHead(403).end(); return; }
            const body = await readFile(file);
            res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch { res.writeHead(404).end(); }
    });
    // Concurrent agent sessions run these side by side; scan past a busy port.
    const base = Number(process.env.BW_PORT || 8181);
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

    // THE NETWORK IS OFF. Not just the compiler: every request that leaves the
    // app's own origin is aborted before it leaves Chromium, which is the
    // condition a lesson declaring `environment: "simulation"` promises to work
    // under. The URLs are retained as evidence either way — a proof that only
    // counted compiler POSTs could pass while the page quietly fetched the
    // image from somewhere else.
    const offOrigin = [];
    const hostedCompilerRequests = [];
    await page.route('**/*', route => {
        const request = route.request();
        let sameOrigin = false;
        try { sameOrigin = new URL(request.url()).origin === new URL(url).origin; } catch { /* data: */ }
        if (sameOrigin || /^(data|blob):/.test(request.url())) return route.continue();
        offOrigin.push(`${request.method()} ${request.url()}`);
        if (isHostedCompilerRequest(request, url)) hostedCompilerRequests.push(request.url());
        return route.abort('blockedbyclient');
    });
    page.on('dialog', d => d.accept());          // confirm() would auto-DISMISS
    await page.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');  // else it eats clicks
            localStorage.setItem('bw-right-pane-hidden', '0');
        } catch { /* private mode */ }
    });

    const shoot = async name => {
        try {
            await page.screenshot({path: path.join(SHOTS, name), fullPage: true});
        } catch (e) {
            console.log(`could not write ${name}: ${e && e.message}`);
        }
    };

    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message)));
    let crashed = false;
    page.on('crash', () => { crashed = true; errors.push('THE RENDERER CRASHED'); });
    const console_ = [];
    page.on('console', m => {
        if (m.type() !== 'warning' && m.type() !== 'error') return;
        console_.push(`${m.type()}: ${m.text()}`.slice(0, 300));
        if (console_.length > 40) console_.shift();
    });

    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});

    // ── load the lesson's own bench ──────────────────────────────────────
    //
    // The example is loaded and NOT re-typed. That is the point: the shipped
    // image is keyed on the C this exact program emits, so authoring anything
    // else — even the same program spelled differently — would prove the
    // fallthrough path rather than the shipped one. (The sibling 8051 proof
    // types its program deliberately, for the opposite reason: there, what is
    // under test is a compiler.)
    await page.locator('[role="tab"]', {hasText: /Circuit/i}).first().click();
    const search = page.locator('input[placeholder*="earch"], input[type="search"]').first();
    // SWALLOWED-PRECONDITION, triaged 2026-09-02: filtering is a convenience; the row below has
    // its own 30s visible wait, so a genuine absence fails there.
    // gate-shapes-allow
    try {
        await search.waitFor({state: 'visible', timeout: 30000});
        await search.fill('blink without delay');
    } catch { /* the example list may not be searchable in this build */ }

    const row = page.locator('text=/blink without delay/i').first();
    await row.waitFor({state: 'visible', timeout: 30000});
    await row.click();
    // SWALLOWED-PRECONDITION, triaged 2026-09-02: the device chooser is optional; the title wait
    // below is the hard assertion an unaccepted chooser would fail.
    // gate-shapes-allow
    try {
        const okBtn = page.locator('button:visible', {hasText: /^OK$/}).first();
        await okBtn.waitFor({timeout: 8000});
        await okBtn.click();
    } catch { /* some examples load without the device chooser */ }

    const title = await waitFor(
        () => page.evaluate(() => {
            const el = document.querySelector('input[class*="title-field"], [class*="project-title"] input');
            return el ? el.value : '';
        }),
        t => /blink.*without.*delay/i.test(t || ''), 60000, 500);
    record('the D38 AVR lesson bench loaded', /blink.*without.*delay/i.test(title || ''),
        `project title: "${title}"`);

    // The Stage holds the hardware program; the gallery may leave a sprite
    // selected. Wait for the Stage to EXIST rather than assuming it does — the
    // project title lands before its targets do.
    const stage = await waitFor(
        () => page.evaluate(() => {
            const state = window.__brickwrightStore?.getState();
            const vm = state?.scratchGui?.vm;
            const targets = vm?.runtime?.targets || [];
            const found = targets.find(t => t && t.isStage);
            if (!vm || !found) return {id: null, hasVm: !!vm, targetCount: targets.length};
            vm.setEditingTarget(found.id);
            return {id: found.id, targetCount: targets.length,
                device: (vm.runtime.stc && vm.runtime.stc.device) || null};
        }),
        v => !!(v && v.id), 60000, 250);
    record('the Stage target is selected, and the project declares the AVR device',
        !!stage.id && /uno|atmega/i.test(String(stage.device || '')),
        stage.id ? `${stage.device} on ${stage.id}` : JSON.stringify(stage));
    if (!stage.id) {
        // The two things that can explain an empty target list, both worth
        // printing rather than guessing at: a request the offline route ate,
        // and whatever the page said about it.
        console.log(`blocked cross-origin requests:\n  ${offOrigin.join('\n  ') || '(none)'}`);
        if (console_.length) console.log(`console:\n  ${console_.join('\n  ')}`);
        await shoot('00-project-never-loaded.png');
    }

    // ── run it, with the network off ─────────────────────────────────────
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-settings-change',
        {detail: {key: 'bw-debug-dock', value: 'right'}})));
    const debugPanel = page.locator('[data-debug-panel]:visible').first();
    await debugPanel.waitFor({state: 'visible', timeout: 30000});

    const panelText = () => debugPanel.innerText().catch(e => `«unreadable: ${e && e.message}»`);
    const phase = () => debugPanel.getAttribute('data-debug-phase')
        .catch(e => `«unreadable: ${e && e.message}»`);

    const ready = await waitFor(panelText, t => /Speed|Tempo/.test(t) && /Run|Start/.test(t), 60000);
    record('the debug panel is on screen', /Speed|Tempo/.test(ready), `${ready.length} chars`);

    const clickByText = async re => {
        const button = debugPanel.locator('button', {hasText: re}).first();
        await button.waitFor({state: 'visible', timeout: 15000});
        await button.click();
    };

    // Keep every distinct (phase, status line) rather than only the value at
    // the deadline: setStatus() narrates the whole build, and a poll that keeps
    // only its last read throws the answer to "where did this stop?" away.
    const trace = [];
    const phaseAndMessage = async () => {
        const p = await phase();
        const line = `${p} — ${(await panelText()).replace(/\s+/g, ' ').slice(0, 110)}`;
        if (trace[trace.length - 1] !== line) trace.push(line);
        return p;
    };
    await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
    const running = await waitFor(phaseAndMessage, p => p === 'running' || p === 'error', 120000);
    const attached = running === 'running';
    record('D2: the AVR lesson attached with the network off', attached,
        attached ? 'phase=running'
            : `last phase=${running}${crashed ? ' — THE RENDERER CRASHED' : ''}`);
    record('D2: zero requests left the app\'s origin',
        offOrigin.length === 0,
        offOrigin.length ? offOrigin.slice(0, 5).join(' | ') : '0 cross-origin requests');

    // ── the honest sentence ──────────────────────────────────────────────
    const provenance = await debugPanel.evaluate(root => {
        const el = root.querySelector('[data-image-provenance]');
        return el ? {
            example: el.getAttribute('data-image-provenance'),
            toolchain: el.getAttribute('data-image-toolchain'),
            text: el.innerText,
            colour: getComputedStyle(el).color
        } : null;
    });
    record('D2: the panel says the image is prebuilt', !!provenance,
        provenance ? `for "${provenance.example}"` : 'no [data-image-provenance] line');
    if (provenance) {
        const says = {
            bench: provenance.example === EXAMPLE && provenance.text.includes(EXAMPLE),
            compiler: /avr-gcc/.test(provenance.text) && /avr-gcc/.test(provenance.toolchain || ''),
            when: /\d{4}-\d{2}-\d{2}/.test(provenance.text),
            offline: /without the network|ohne Netzwerk/i.test(provenance.text),
            expiry: /[Ee]dit the program|änderst/.test(provenance.text)
        };
        for (const [what, ok] of Object.entries(says)) {
            record(`D2: the sentence states the ${what}`, ok,
                ok ? '' : provenance.text.replace(/\s+/g, ' ').slice(0, 160));
        }
    }
    if (!attached) {
        console.log(`panel trace:\n  ${trace.join('\n  ')}`);
        if (console_.length) console.log(`console:\n  ${console_.join('\n  ')}`);
        await shoot('00-attach-failed.png');
        console.log('\nCannot proceed without a session. See 00-attach-failed.png');
        await browser.close(); if (server) server.close();
        process.exit(1);
    }

    // D38 is a scheduler-timebase repair. Merely attaching an AVR image would
    // not prove the repaired helper participates in a live program, so pause,
    // read the scheduler position, and measure the debugger's own program clock
    // across a resume/pause cycle. Poll the clock; a fixed sleep would turn a
    // slow VPS into a flaky timing assertion.
    await clickByText(/^\s*⏸?\s*(Pause)\s*$/i);
    const firstPause = await waitFor(phase, p => p === 'paused', 20000, 250);
    record('D38: the shipped program pauses', firstPause === 'paused', `phase=${firstPause}`);
    const frames = await debugPanel.evaluate(root => {
        const el = root.querySelector('[data-debug-frames]');
        return el ? {
            kind: el.getAttribute('data-frames-kind'),
            rows: [...el.querySelectorAll('[data-frame-row]')].map(row => row.innerText)
        } : null;
    });
    record('D38: the debugger exposes the repaired scheduler state',
        !!frames && frames.kind === 'scheduler' && frames.rows.length > 0,
        frames ? `${frames.kind}: ${frames.rows.join(' | ').slice(0, 140)}` : 'position pane absent');

    await clickByText(/under the hood|unter der haube/i);
    const readClockMs = () => debugPanel.evaluate(root => {
        const match = (root.innerText || '').match(/([\d,.]+)\s*ms\b/i);
        return match ? Number(match[1].replace(/,/g, '')) : null;
    });
    const beforeClock = await waitFor(readClockMs, n => Number.isFinite(n), 10000, 250);
    await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
    await waitFor(phase, p => p === 'running', 20000, 250);
    const advancedClock = await waitFor(readClockMs,
        n => Number.isFinite(n) && Number.isFinite(beforeClock) && n > beforeClock,
        20000, 100);
    await clickByText(/^\s*⏸?\s*(Pause)\s*$/i);
    const secondPause = await waitFor(phase, p => p === 'paused', 20000, 250);
    record('D38: program time advances across run and pause',
        Number.isFinite(advancedClock) && advancedClock > beforeClock && secondPause === 'paused',
        `${beforeClock} ms → ${advancedClock} ms; phase=${secondPause}`);
    await shoot('01-d38-prebuilt-timebase-offline.png');

    // ── the edit falls through ───────────────────────────────────────────
    //
    // The safety half. A prebuilt image that quietly outlived its program would
    // be worse than none: the learner would step through firmware that does not
    // correspond to the blocks in front of them. So the edited program must NOT
    // run on the shipped image — it must go for the compiler, and with the
    // network off, fail saying so.
    // Stop is ASSERTED, not attempted-and-swallowed. `debug-runner.stop()`
    // leaves `session` in place and `start()` skips `build()` whenever a session
    // exists, so a Stop that silently did not happen would make the edit below
    // re-run the OLD image and this check would "pass" having tested nothing.
    //
    // Keep the SAME pin signature and change the program itself. That is the
    // stronger stale-image test: teardown cannot be credited to a pin change,
    // while the canonical generated C and its image key must still change.
    await clickByText(/^\s*⏹?\s*(Stop)\s*$/i);
    const stopped = await waitFor(phase, p => p === 'idle', 20000, 250);
    record('the session stopped before the program was edited', stopped === 'idle',
        `phase=${stopped}`);
    await page.locator('[role="tab"]', {hasText: /^Code$/i}).first().click();
    const cm = page.locator('.cm-content').first();
    await cm.waitFor({state: 'visible', timeout: 30000});
    await cm.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    // Deliberately real code and not a comment, which might not reach the
    // emitted C at all.
    await page.keyboard.insertText(`DEVICE ARDUINO-UNO
CLOCK 16000000
PIN led = D13 OUTPUT

WHEN flag clicked:
  FOREVER:
    turn on led
    wait 0.25 seconds
    turn off led
    wait 0.25 seconds`);
    await page.locator('button', {hasText: /To blocks/i}).first().click({force: true});
    await page.locator('[role="tab"]', {hasText: /^Circuit$/i}).first().click().catch(() => {});

    const before = hostedCompilerRequests.length;
    await clickByText(/^\s*▶?\s*(Run|Start)\s*$/i);
    const afterEdit = await waitFor(phaseAndMessage, p => p === 'error' || p === 'running', 120000);
    record('D2: the edited program did NOT run on the prebuilt image',
        afterEdit === 'error',
        afterEdit === 'error' ? 'the build failed, as it must with no network'
            : `phase=${afterEdit} — an edited program reached a running session, which means ` +
              `it either matched a shipped image it should not have, or compiled somewhere`);
    record('D2: the edit fell through to the compiler, which the block caught',
        hostedCompilerRequests.length > before,
        hostedCompilerRequests.length > before
            ? `${hostedCompilerRequests.length - before} blocked POST(s) to ${hostedCompilerRequests[before]}`
            : 'no hosted compile was attempted — the fallthrough did not happen');
    const editedPanel = (await panelText()).replace(/\s+/g, ' ');
    record('D2: and the prebuilt sentence is GONE, not left describing the old image',
        !(await debugPanel.locator('[data-image-provenance]').count()),
        editedPanel.slice(0, 160));
    // The refusal itself. "Failed to fetch" is what the browser says; it names
    // neither what was attempted nor why this same bench started offline a
    // minute ago, and this is the ONE place a learner meets D2's residue.
    record('D2: the refusal explains the residue instead of saying "Failed to fetch"',
        /compiler service/.test(editedPanel) && /cannot run in a browser/.test(editedPanel) &&
        /Undo back to the lesson/.test(editedPanel),
        editedPanel.replace(/^.*?error/, 'error').slice(0, 260));
    await shoot('02-edited-program-falls-through.png');

    record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    if (console_.length) console.log(`console:\n  ${console_.join('\n  ')}`);

    await browser.close();
    if (server) server.close();

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    console.log(`screenshots: ${SHOTS}`);
    process.exit(failed.length ? 1 : 0);
};

main().catch(e => { console.error(e); process.exit(1); });

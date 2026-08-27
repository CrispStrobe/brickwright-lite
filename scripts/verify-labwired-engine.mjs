#!/usr/bin/env node
/** End-to-end proof for the HEAVY simulation tier.
 *
 *  Everything else about labwired is proven by unit tests against the adapter
 *  and by grepping the bundle. Neither answers the only question that matters:
 *  does picking it in a real browser actually run the project's firmware on it?
 *  This drives the GUI — write an STM32F030 program, open the debugger, choose
 *  the engine, run — and then insists the firmware MOVED, because "the panel
 *  said ready" is exactly the kind of plausible-and-wrong this tier has already
 *  produced once (a Map where an object was expected made a dead CPU look fine).
 *
 *  Skips rather than fails when a precondition is genuinely absent: the 20 MB
 *  engine is an optional deploy artifact, and the F030 build compiles against
 *  the remote stc-compiler. A missing engine or no network is not a regression
 *  in this code, and reporting it as one would train everyone to ignore the gate. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const port = 8121;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');

if (!existsSync(join(build, 'static', 'labwired', 'labwired_wasm.js'))) {
    console.log('SKIP — build/static/labwired is absent; run `node scripts/sync-labwired-wasm.mjs` and rebuild.');
    process.exit(0);
}

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        // Read before the head goes out: writing 200 and then failing to read
        // leaves the catch unable to send a 404, and that throw kills the gate.
        const body = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch {
        console.log(`404 ${req.url}`);
        if (!res.headersSent) res.writeHead(404);
        res.end('not found');
    }
});
await new Promise(done => server.listen(port, done));

const PROGRAM = `DEVICE STM32F030
PIN led1 = PA0 OUTPUT

WHEN flag clicked:
  forever:
    turn on led1
    wait 0.2 seconds
    turn off led1
    wait 0.2 seconds
`;

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 900}});
page.on('console', m => { if (m.type() === 'error') console.log(`browser error ${m.text().slice(0, 160)}`); });
page.on('pageerror', e => console.log(`PAGEERR ${String(e).slice(0, 160)}`));
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};
/** The panel's phase word and its message, read as a pair. Scraping the whole
 *  document instead picks up <style> text, which is how an earlier version of
 *  this gate reported a CSS rule as the status. */
const statusText = () => page.evaluate(() => {
    const st = [...document.querySelectorAll('strong')]
        .find(n => /^(error|ready|running|paused|building|attaching|idle|stepping)$/i.test(n.textContent.trim()));
    return st ? st.parentElement.innerText.replace(/\n/g, ' | ') : '';
});

let skip = null;
try {
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-debug-dock', 'solo');
        localStorage.setItem('bw-stage-circuit', '1');
    });
    await page.goto(`http://localhost:${port}/`, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    // The VM is not a global: it lives in the redux store, and the gates that
    // need it lift it onto window themselves. Same handle as the others use.
    await page.waitForFunction(() => {
        const st = window.__brickwrightStore;
        const vm = st && st.getState && st.getState().scratchGui && st.getState().scratchGui.vm;
        if (vm && vm.runtime) { window.__vm = vm; return true; }
        return false;
    }, {timeout: 60000});
    await page.waitForTimeout(2000);

    // Seed the program: typing alone declares nothing — "To blocks" is what
    // parses it onto the runtime and sets the device.
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await page.waitForTimeout(2500);
    // The editor is CodeMirror 6; it is only a textarea while the chunk loads.
    const cm = page.locator('.cm-content').first();
    if (await cm.count()) {
        await cm.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText(PROGRAM);
    } else {
        await page.locator('textarea').first().fill(PROGRAM, {timeout: 8000});
    }
    await page.waitForTimeout(600);
    for (const label of ['To blocks', 'Import', 'Zu Blöcken']) {
        try { await page.locator('button', {hasText: label}).first().click({timeout: 2500}); break; } catch {}
    }
    await page.waitForTimeout(2500);
    // The DEVICE line parses the program; it does not pick the board. That is
    // the device dropdown, and until it is set the runtime has no bwDeviceId —
    // so the debugger would build for "no chips" and the engine choice below
    // would be meaningless.
    await page.evaluate(() => {
        for (const sel of document.querySelectorAll('select')) {
            const opt = [...sel.options].find(o => /STM32F030/i.test(o.textContent));
            if (!opt) continue;
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', {bubbles: true}));
            return;
        }
    });
    await page.waitForTimeout(2500);
    const device = await page.evaluate(() => {
        const rt = window.__vm && window.__vm.runtime;
        return rt ? String(rt.bwDeviceId) : '(no vm)';
    });
    check('the program registered an STM32F030 device', /stm32/i.test(device), device);

    await page.locator('[role="tab"]', {hasText: 'Blocks'}).first().click();
    await page.waitForTimeout(2500);

    // The picker only lists the heavy tier once its engine has answered; the
    // probe is async, so this is a wait, not an assertion about first paint.
    const picker = page.locator('select').filter({has: page.locator('option')}).filter({hasText: /simulat|emulat|labwired/i}).first();
    let labels = [];
    for (let i = 0; i < 30; i++) {
        labels = await page.evaluate(() => [...document.querySelectorAll('select option')].map(o => o.textContent.trim()));
        if (labels.some(l => /labwired/i.test(l))) break;
        await page.waitForTimeout(1000);
    }
    check('the picker offers the labwired tier', labels.some(l => /labwired/i.test(l)), labels.join(' | ').slice(0, 200));
    if (!labels.some(l => /labwired/i.test(l))) throw new Error('no labwired option — nothing further to verify');

    // Select it by value, which is the kind string the runner routes on.
    const chosen = await page.evaluate(() => {
        for (const sel of document.querySelectorAll('select')) {
            const opt = [...sel.options].find(o => /labwired/i.test(o.textContent));
            if (!opt) continue;
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', {bubbles: true}));
            return opt.value;
        }
        return null;
    });
    check('selecting it sets the labwired kind', chosen === 'labwired', String(chosen));
    await page.waitForTimeout(800);

    // The dock ships collapsed, and a collapsed Run is in the DOM but not
    // visible — clicking it throws rather than doing nothing, which is how
    // this gate spent a run reporting "no status" instead of "never pressed".
    for (const t of ['\u2039', '\u2303']) {
        try { await page.locator(`button:text-is("${t}")`).first().click({timeout: 2500, force: true}); await page.waitForTimeout(1500); break; } catch {}
    }
    check('the Run control is reachable', await page.locator('button:has-text("Run")').first().isVisible().catch(() => false));

    // Run. The F030 image is compiled remotely, so this is where "no network"
    // shows up — as a skip below, not as a failed check.
    let pressed = false;
    for (const sel of ['button:text-is("▶ Run")', 'button:has-text("Run")']) {
        try { await page.locator(sel).first().click({timeout: 3000, force: true}); pressed = true; break; } catch {}
    }
    check('Run was actually pressed', pressed);

    let status = '';
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1500);
        status = await statusText();
        if (/bytes on labwired/i.test(status)) break;
        const whole = await page.evaluate(() => document.body.innerText.slice(0, 4000));
        if (/compil\w+ failed|network|fetch failed|could not reach/i.test(whole) && !/bytes on labwired/i.test(whole)) {
            skip = `the F030 build did not complete (likely no route to the compiler): ${whole.match(/[^\n]*(?:failed|network)[^\n]*/i)?.[0]?.slice(0, 120)}`;
            break;
        }
    }
    if (skip) throw new Error('SKIP');

    check('the run reports the firmware on labwired', /bytes on labwired/i.test(status), status.slice(0, 160));
    check('it is honest that a raw image has no symbols', /no symbols/i.test(status), status.slice(0, 160));

    // The point of the whole exercise: did the CPU actually execute? A target
    // that attaches and never advances is the exact failure this tier already
    // had once, and it looked completely healthy from the outside.
    const pcOf = () => page.evaluate(() => {
        const t = document.body.innerText;
        const m = t.match(/PC[^0-9a-fx]{0,4}(0x[0-9a-fA-F]+|\d+)/);
        return m ? m[1] : null;
    });
    const pc0 = await pcOf();
    check('the panel reports a program counter', pc0 !== null, String(pc0));
    let moved = false, pc1 = pc0;
    for (let i = 0; i < 20 && !moved; i++) {
        for (const sel of ['button:has-text("Step")', 'button:text-is("⤼ Step")']) {
            try { await page.locator(sel).first().click({timeout: 1500, force: true}); break; } catch {}
        }
        await page.waitForTimeout(400);
        pc1 = await pcOf();
        if (pc1 && pc0 && pc1 !== pc0) moved = true;
    }
    check('stepping advances the program counter on labwired', moved, `${pc0} → ${pc1}`);
} catch (e) {
    if (String(e.message) !== 'SKIP') {
        if (!failures.length) failures.push(String(e.message).slice(0, 160));
        else console.log(`(aborted: ${String(e.message).slice(0, 160)})`);
    }
} finally {
    await browser.close();
    server.close();
}

if (skip) {
    console.log(`\nSKIP — ${skip}`);
    process.exit(0);
}
if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nOK — the heavy tier runs the project it was handed.');

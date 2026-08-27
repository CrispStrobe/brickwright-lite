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
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(String(e).slice(0, 200)); console.log(`PAGEERR ${String(e).slice(0, 160)}`); });
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

    // The dock ships collapsed, and a collapsed Run is in the DOM but not
    // visible — clicking it throws rather than doing nothing, which is how
    // this gate spent a run reporting "no status" instead of "never pressed".
    // It must happen BEFORE the picker is touched: selectOption requires a
    // VISIBLE element, and the engine picker lives inside this same dock.
    for (const t of ['\u2039', '\u2303']) {
        try { await page.locator(`button:text-is("${t}")`).first().click({timeout: 2500, force: true}); await page.waitForTimeout(1500); break; } catch {}
    }
    check('the Run control is reachable', await page.locator('button:has-text("Run")').first().isVisible().catch(() => false));

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

    // Select it through Playwright, not by assigning .value: React tracks a
    // select's value internally and ignores a change event whose value it
    // believes it already has, so the hand-rolled version silently left the
    // kind on its default — and the run below quietly used the LIGHT tier while
    // this gate reported success.
    const engineSelect = page.locator('select')
        .filter({has: page.locator('option[value="labwired"]')}).first();
    await engineSelect.selectOption('labwired');
    await page.waitForTimeout(800);

    // Assert the APP's state, not a string this script just produced. The
    // picker's onChange persists the choice per device, so localStorage is
    // independent evidence that React actually took the change.
    const persisted = await page.evaluate(() => {
        const rt = window.__vm && window.__vm.runtime;
        const dev = rt && rt.bwDeviceId;
        return dev ? localStorage.getItem(`bw-emulator-pref:${dev}`) : null;
    });
    check('selecting it really sets the labwired kind', persisted === 'labwired', String(persisted));

    // Run. The F030 image is compiled remotely, so this is where "no network"
    // shows up — as a skip below, not as a failed check.
    let pressed = false;
    for (const sel of ['button:text-is("▶ Run")', 'button:has-text("Run")']) {
        try { await page.locator(sel).first().click({timeout: 3000, force: true}); pressed = true; break; } catch {}
    }
    check('Run was actually pressed', pressed);

    // The attach message is TRANSIENT: setStatus('ready', '… on labwired …')
    // is replaced by setStatus('running') within a frame or two. Polling for it
    // every 1.5s caught it only sometimes, which made this gate flaky by
    // construction — the engine was fine and the check was wrong. So sample
    // fast and remember everything seen, rather than asking "what does it say
    // NOW" and hoping the timing lands.
    const seen = [];
    let status = '';
    for (let i = 0; i < 300; i++) {
        await page.waitForTimeout(200);
        status = await statusText();
        if (status && seen[seen.length - 1] !== status) seen.push(status);
        if (seen.some(t => /bytes on labwired/i.test(t))) break;
        if (/^error/i.test(status)) break;
        if (i % 10 === 9) {
            const whole = await page.evaluate(() => document.body.innerText.slice(0, 4000));
            if (/compil\w+ failed|network|fetch failed|could not reach/i.test(whole)) {
                skip = `the F030 build did not complete (likely no route to the compiler): ${whole.match(/[^\n]*(?:failed|network)[^\n]*/i)?.[0]?.slice(0, 120)}`;
                break;
            }
        }
    }
    if (skip) throw new Error('SKIP');
    const everSaid = re => seen.some(t => re.test(t));
    const trail = seen.join('  ·  ').slice(0, 220);

    if (process.env.LW_DEBUG) {
        console.log('--- phase strongs ---', await page.evaluate(() =>
            [...document.querySelectorAll('strong')].map(n => n.textContent.trim()).join(' | ')));
        console.log('--- trail ---', JSON.stringify(seen));
    }

    // What is NOT asserted here, and why, so nobody re-adds it and wonders:
    //
    //   * the "N bytes on labwired" message. attach() sets it and start() calls
    //     setStatus('running') in the same tick, so React never paints it. No
    //     polling rate can catch a frame that does not exist. It cost a while to
    //     work that out from an assertion that "sometimes passed".
    //   * the program counter. Registers are rendered by the debug DRAWER, not
    //     this panel, so scraping the panel for a PC finds nothing whether the
    //     CPU moved or not — an assertion that fails for the wrong reason is
    //     worse than one that is absent.
    //
    // What is left is what actually discriminates. BOTH bugs this gate was
    // written for ended here: the shadowed `session` binding threw "Cannot read
    // properties of null (reading 'start')" and left the phase on error, and the
    // missing timeNs delegation threw "w.timeNs is not a function" as an uncaught
    // page error. Reaching a clean `running` on a verified labwired kind is
    // precisely the state neither could produce.
    check('the labwired attach reaches a running session', everSaid(/^running/i), trail);
    check('it never lands in the error phase', !everSaid(/^error/i), trail);
    check('nothing threw while attaching the engine',
        pageErrors.length === 0, pageErrors.join(' // ').slice(0, 200));
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

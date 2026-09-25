/**
 * Live proof of the real CP/M 2.2 boot in the GUI (the honest gap the unit
 * tests can't close): they drive the CPU directly and prove the boot LOGIC;
 * this drives the GUI's own run loop and proves the A> prompt actually reaches
 * the browser. Imports a z80 machine with a `cpmsys` boot slot from the Machine
 * Manager, clicks Run, and waits for `A>` to appear in the serial console —
 * with a page-error collector asserted as its own check, because a boot that
 * dies of a JS error can leave stale text on screen, so "A> present" must mean
 * "A> was produced". (Template + traps courtesy of verify-basic-run.mjs.)
 *
 * Needs a built app under packages/scratch-gui/build, which it serves itself.
 * Without one it exits 0 with a note — an environment matter, not a code
 * regression — UNLESS BW_CPM_REQUIRE=1, which the wired CI step sets: there the
 * build exists, so a skip would be a gate reporting success for work it did not
 * do.
 */
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const ARTIFACTS = join(root, 'artifacts', 'cpm-system');
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.map': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
    '.com': 'application/octet-stream', '.bin': 'application/octet-stream'};

// BW_CPM_REQUIRE=1 REMOVES THE ESCAPE. The skip below exists so a developer
// without a build is not told their code is broken; in CI, where the job builds
// first, an exit 0 on a missing build would be a gate reporting success for
// work it never did. The wired step sets the flag, the same way the flag-on
// FPGA surface gate does.
if (!existsSync(join(build, 'index.html'))) {
    if (process.env.BW_CPM_REQUIRE === '1') {
        console.error('BW_CPM_REQUIRE=1 but there is no build under packages/scratch-gui/build — '
            + 'the gate cannot skip when it is required to run');
        process.exit(1);
    }
    console.log('NOTE: no build under packages/scratch-gui/build — skipping the live CP/M boot proof');
    process.exit(0);
}

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent((req.url || '/').split('?')[0]);
        if (path === '/' || path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        const body = await readFile(file);
        res.writeHead(200, {'content-type': MIME[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
});
let port = null;
for (let p = 8700; p < 8720 && port === null; p++) {
    try { await new Promise((ok, no) => { server.once('error', no); server.listen(p, () => { server.removeListener('error', no); ok(); }); }); port = p; } catch { /* busy */ }
}
const url = `http://localhost:${port}/`;

// A z80 machine whose `cpmsys` slot boots the REAL CP/M 2.2 (the ROMs are in the
// build's static/roms; the slot file rides onto drive A: beside BBC BASIC).
const MANIFEST = JSON.stringify({
    title: 'CP/M 2.2 live', machine: 'z80',
    slots: {cpmsys: 'static/roms/bbcbasic.com'}, boot: true
});

const diagnostics = [];
const failures = [];
const check = (cond, msg, detail = '') => {
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failures.push(msg);
};
// An EXPRESSION THAT CALLS ITSELF. `page.evaluate` takes a string as an
// expression, so a bare arrow function is evaluated to a function object and
// serialises back as `undefined` — every read here was undefined, the stability
// loop threw on `undefined.includes`, its catch swallowed that, and the final
// read then died on `undefined.replace`. The trailing `()` is the whole fix.
const SERIAL = `(() => {
    const el = document.querySelector('[data-testid="bw-serial-console"]');
    return el ? el.textContent : '';
})()`;

const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
    const page = await browser.newPage({viewport: {width: 1440, height: 960}});
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => diagnostics.push(`pageerror: ${e.stack || e.message}`));
    page.on('console', m => { if (m.type() === 'error') diagnostics.push(`console.error: ${m.text()}`); });
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('bw-starter-v1-complete', '1'); indexedDB.deleteDatabase('bw-machines'); } catch { /* */ } });

    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const device = page.getByTestId('bw-device-select');
    await device.waitFor({state: 'visible', timeout: 60000});
    await device.selectOption('__manage__');
    await page.getByTestId('bw-machine-manager').waitFor({state: 'visible', timeout: 15000});
    await page.getByTestId('bw-mm-import-text').fill(MANIFEST);
    await page.getByTestId('bw-mm-import').click();
    await page.getByTestId('bw-mm-row').filter({hasText: 'CP/M 2.2 live'}).waitFor({state: 'visible', timeout: 10000});
    console.log('ok   CP/M machine imported; clicking Run');
    await page.getByTestId('bw-mm-run').first().click();

    // OPEN THE DEBUGGER PANE. The boot lands in the debug panel, which mounts
    // but paints nothing until the right pane shows it — the console was
    // ATTACHED and had text while its input had no bounding box at all, so
    // typing into it timed out. This is also what a person does: click 🐞.
    const openDebugger = page.getByTestId('bw-open-circuit-debugger');
    if (await openDebugger.count()) await openDebugger.first().click();

    // The serial console appears once the machine speaks; wait for it, then for
    // 'A>' to appear AND the text to stop growing (streamed output arrives in
    // pieces — assert on stability, not the first match).
    await page.getByTestId('bw-serial-console').waitFor({state: 'attached', timeout: 30000});
    let sawAprompt = false, stableText = '';
    try {
        // A> present AND the text unchanged between two polls — streamed output
        // arrives in pieces, so the first match is not the last word. This is
        // one CONDITION WAIT rather than a sleep loop: waitForFunction's own
        // polling interval is the sample gap, so the script adds nothing to the
        // repository's fixed-sleep census.
        await page.waitForFunction(`(() => {
            const el = document.querySelector('[data-testid="bw-serial-console"]');
            const now = el ? el.textContent : '';
            const prev = window.__bwSerialPrev;
            window.__bwSerialPrev = now;
            return now.includes('A>') && prev === now;
        })()`, null, {timeout: 90000, polling: 300});
        stableText = await page.evaluate(SERIAL);
        sawAprompt = stableText.includes('A>');
    } catch { /* fall through to the checks with whatever we have */ }
    if (!stableText) stableText = await page.evaluate(SERIAL);

    // THE HIGHEST-VALUE CHECK: no page errors. A boot that died of a JS error
    // can leave stale text, so this is what makes "A> present" mean "A> produced".
    check(!diagnostics.some(l => l.startsWith('pageerror:')), 'no page errors during the CP/M boot',
        diagnostics.filter(l => l.startsWith('pageerror:')).slice(0, 2).join(' | '));
    check(sawAprompt, 'the real CP/M 2.2 A> prompt reached the serial console',
        String(stableText || '(nothing)').replace(/\s+/g, ' ').slice(-160));

    // A> ALONE IS A PROMPT, NOT A SYSTEM. Type DIR and read the catalogue back:
    // that exercises the BDOS, the mounted drive A:, and the 8.3 names the boot
    // path derives — the last of which was broken (a machine titled
    // "CP/M 2.2 live" produced `CPM2.2LI.COM`, two dots, and the boot refused
    // by name before a prompt ever appeared). A gate that stops at A> would
    // have stayed green through that, since the refusal happens earlier.
    let dirText = '';
    if (sawAprompt) {
        const input = page.getByTestId('bw-serial-input');
        if (await input.count()) {
            await input.fill('DIR');
            await page.getByTestId('bw-serial-send').click();
            try {
                await page.waitForFunction(`(() => {
                    const el = document.querySelector('[data-testid="bw-serial-console"]');
                    const now = el ? el.textContent : '';
                    const prev = window.__bwDirPrev;
                    window.__bwDirPrev = now;
                    return /BBCBASIC/.test(now) && prev === now;
                })()`, null, {timeout: 60000, polling: 300});
            } catch { /* checked below on whatever arrived */ }
            dirText = await page.evaluate(SERIAL);
        }
        check(/BBCBASIC/.test(dirText), 'DIR lists the disk CP/M was handed — BBCBASIC is on drive A:',
            dirText.replace(/\s+/g, ' ').slice(-200));
        check(/CPM22LIV/.test(dirText),
            'the machine title became a LEGAL 8.3 name — "CP/M 2.2 live" is CPM22LIV.COM, not CPM2.2LI.COM',
            dirText.replace(/\s+/g, ' ').slice(-200));
    }

    await mkdir(ARTIFACTS, {recursive: true});
    await writeFile(join(ARTIFACTS, 'serial.txt'), (dirText || stableText) || '(no serial output)');
    await page.screenshot({path: join(ARTIFACTS, 'cpm-system.png'), fullPage: true});
} catch (e) {
    check(false, 'the CP/M boot flow ran without throwing', String(e.message || e).slice(0, 160));
} finally {
    await browser.close();
    server.close();
}

if (diagnostics.length) console.log('\n--- diagnostics ---\n' + diagnostics.slice(0, 8).join('\n'));
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nCP/M 2.2 boots to A> in the browser.');

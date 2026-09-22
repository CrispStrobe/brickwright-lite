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
 * Local-only (needs a built app under packages/scratch-gui/build). Exits 0 with
 * a note if the build is absent — an environment matter, not a code regression
 * the unit suite already covers — so it never reds main while it settles.
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

if (!existsSync(join(build, 'index.html'))) {
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
const serialText = () => `() => {
    const el = document.querySelector('[data-testid="bw-serial-console"]');
    return el ? el.textContent : '';
}`;

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

    // The serial console appears once the machine speaks; wait for it, then for
    // 'A>' to appear AND the text to stop growing (streamed output arrives in
    // pieces — assert on stability, not the first match).
    await page.getByTestId('bw-serial-console').waitFor({state: 'attached', timeout: 30000});
    let sawAprompt = false, stableText = '';
    try {
        await page.waitForFunction(`(${serialText()})().includes('A>')`, null, {timeout: 90000});
        // stability: two equal samples ~300ms apart
        for (let i = 0; i < 40; i++) {
            const a = await page.evaluate(serialText());
            await page.waitForTimeout(300);
            const b = await page.evaluate(serialText());
            if (a === b && b.includes('A>')) { stableText = b; break; }
        }
        sawAprompt = stableText.includes('A>');
    } catch { /* fall through to the checks with whatever we have */ }
    if (!stableText) stableText = await page.evaluate(serialText());

    // THE HIGHEST-VALUE CHECK: no page errors. A boot that died of a JS error
    // can leave stale text, so this is what makes "A> present" mean "A> produced".
    check(!diagnostics.some(l => l.startsWith('pageerror:')), 'no page errors during the CP/M boot',
        diagnostics.filter(l => l.startsWith('pageerror:')).slice(0, 2).join(' | '));
    check(sawAprompt, 'the real CP/M 2.2 A> prompt reached the serial console',
        stableText.replace(/\s+/g, ' ').slice(-160));

    await mkdir(ARTIFACTS, {recursive: true});
    await writeFile(join(ARTIFACTS, 'serial.txt'), stableText || '(no serial output)');
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

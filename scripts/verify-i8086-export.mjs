#!/usr/bin/env node
/** The 8086 artefact export, through the real UI (N10).
 *
 *  The unit test (test/i8086-export.test.mjs) proves the bytes and BOOTS the
 *  .img in the vendored machine. This proves the other half: that pressing the
 *  export buttons on the Code tab actually downloads those bytes, and that the
 *  .COM reflects the program on screen — judged by the DOWNLOADED artefact, the
 *  listing gate's discipline, never a status line.
 *
 *  It downloads the .COM and the .img for one program, asserts the .img is a
 *  1.44 MB bootable image (0x55AA) that carries the EXACT .COM from LBA 1, then
 *  changes the program and re-downloads: a different program must yield a
 *  different .COM (so the export is the live assembler output, not a fixed
 *  asset), and re-downloading the same program yields identical bytes (the
 *  assembler is reproducible).
 *
 *  Skips (exit 0) when there is no local build. Never starts a browser it cannot
 *  drive.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const port = 8129;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};

const PROOF_URL = process.env.PROOF_URL || null;
if (!PROOF_URL && !existsSync(build)) {
    console.log('SKIP — verify-i8086-export: no local build (packages/scratch-gui/build). Pass PROOF_URL to drive a deployed app.');
    process.exit(0);
}

const FLOPPY_BYTES = 80 * 2 * 18 * 512;   // 1,474,560

const server = PROOF_URL ? null : createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        const body = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
if (server) await new Promise(done => server.listen(port, done));
const APP = PROOF_URL || `http://localhost:${port}/`;
console.log(`driving ${APP}${PROOF_URL ? ' (PROOF_URL)' : ''}`);

const PROG_A = 'DEVICE 8086\n\nWHEN flag clicked:\n  say "ALPHA"\n';
const PROG_B = 'DEVICE 8086\n\nWHEN flag clicked:\n  say "BRAVO ZULU"\n';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 900}, acceptDownloads: true});
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(String(e).slice(0, 200)); console.log(`PAGEERR ${String(e).slice(0, 160)}`); });
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

async function waitFor (read, accept, timeoutMs = 60000, stepMs = 250) {
    const end = Date.now() + timeoutMs;
    let last;
    do { try { last = await read(); } catch (e) { last = {error: String((e && e.message) || e)}; }
        if (accept(last)) return last; await new Promise(r => setTimeout(r, stepMs)); } while (Date.now() < end);
    return last;
}

/** Type a program into the Code (pseudocode) editor, replacing what is there. */
async function typeProgram (text) {
    const cm = page.locator('.cm-content').first();
    if (await cm.count()) {
        await cm.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
        await page.keyboard.press('Delete');
        await page.keyboard.insertText(text);
    } else {
        await page.locator('textarea').first().fill(text, {timeout: 8000});
    }
    // The export button appears once the DEVICE line reads as an 8086.
    await waitFor(() => page.locator('[data-testid="bw-export-8086-com"]').isVisible().catch(() => false),
        v => v === true, 30000);
}

/** Click a download control and return the downloaded bytes. */
async function download (testid) {
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(`[data-testid="${testid}"]`).click()
    ]);
    const stream = await dl.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return {name: dl.suggestedFilename(), bytes: Buffer.concat(chunks)};
}

let skip = null;
try {
    await page.addInitScript(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    await page.goto(APP, {waitUntil: PROOF_URL ? 'domcontentloaded' : 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await waitFor(() => page.locator('.cm-content, textarea').first().isVisible().catch(() => false),
        v => v === true, 60000);

    await typeProgram(PROG_A);
    const comA = await download('bw-export-8086-com');
    const imgA = await download('bw-export-8086-img');

    check('the .COM download is a non-empty 8086 program', comA.bytes.length > 0 && comA.bytes.some(b => b !== 0),
        `${comA.name} ${comA.bytes.length} bytes`);
    check('the .img is a 1.44 MB bootable image (0x55AA)',
        imgA.bytes.length === FLOPPY_BYTES && imgA.bytes[510] === 0x55 && imgA.bytes[511] === 0xaa,
        `${imgA.name} ${imgA.bytes.length} bytes, sig ${imgA.bytes[510]?.toString(16)}${imgA.bytes[511]?.toString(16)}`);
    const carried = imgA.bytes.subarray(512, 512 + comA.bytes.length);
    check('the .img carries the EXACT .COM from LBA 1', Buffer.compare(carried, comA.bytes) === 0,
        'the bootable image and the standalone .COM disagree');

    await typeProgram(PROG_B);
    const comB = await download('bw-export-8086-com');
    check('a different program yields a different .COM (the export is the live assembler output)',
        Buffer.compare(comA.bytes, comB.bytes) !== 0, 'two different programs exported identical bytes');

    const comB2 = await download('bw-export-8086-com');
    check('re-exporting the same program yields byte-identical output (reproducible)',
        Buffer.compare(comB.bytes, comB2.bytes) === 0, 'the same program exported different bytes twice');

    check('nothing threw during the export', pageErrors.length === 0, pageErrors.join(' // ').slice(0, 200));
    await browser.close();
    if (server) server.close();
    if (failures.length) { console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`); process.exit(1); }
    console.log('\nOK — the Code tab exports the assembler\'s .COM and a bootable .img that carries it.');
    process.exit(0);
} catch (e) {
    await browser.close().catch(() => {});
    if (server) server.close();
    if (skip) { console.log(`SKIP — ${skip}`); process.exit(0); }
    console.error(`verify-i8086-export threw: ${e && e.stack ? e.stack : e}`);
    process.exit(1);
}

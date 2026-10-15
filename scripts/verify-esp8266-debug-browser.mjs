#!/usr/bin/env node
/**
 * CI browser proof: an ESP8266 flash image runs through the Debug panel's
 * firmware hand-off on bw-board's `esp8266` kind (the debug runner's
 * attachEsp8266Target), and the page shows its serial output.
 *
 * The hosted compiler does not serve `esp8266` in production yet, so the image
 * is not compiled here: it is bw-board's SDK-free blink fixture
 * (test/fixtures/esp8266/blink.bin at bw-board 3b03d226, from the esp8266js
 * fork's firmware/blink.c, MIT), embedded and sha256-checked, entering through
 * the same `bw-asm-rom-ready` firmware event a built image takes. The firmware
 * prints "blink" once, then "on" / "off" each time it toggles GPIO2, so the
 * serial console reaching "on" then "off" is the pin toggling as the program
 * itself reports it.
 */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
    throw new Error('This resource-intensive browser proof is CI-only; set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly');
}

const BLINK_SHA256 = 'e4b90dba7f352090190432a502021df65edd8d6c202387dabf57cacbc1d6cb50';
const BLINK_BASE64 =
    '6QIAAAwAEEAAgP4/EAAAAGJsaW5rCgBvbgoAb2ZmCgAAABBAgAMAABCA/j8UgP4/eEYAQBLB8CH8/zH8/wkxDATGAQAAAEJi' +
    'ACLCBDcy9jKgAAwULQMB9v/AAAAFLAAG//8AABCA/j8wBgBgMf7/QqCIwCAAKANC1BMbIsAgACkDMfn/wCAAKANKIsAgACkD' +
    'DfAAAAC0xAQc4gBA2DkAQD0CIfz/EsHwCTEB+//AAAAIMT0CEsEQDAKR+P+gCQAAHAAAYAw3Uf7/YqB9MHcBxgQAAADAIAA4' +
    'BTAwdTc29MAgAEkHGyJCAgBWdP4N8AAARAAQQCgGAGAkBgBgBADwP4gPAECoDwBAEsHwIfr/CTEyoITAIAA5AiH4/zKgiMAg' +
    'ACgCMtMTOiIx0P8MBMAgACkDMe//DKIB8v/AAAAx7/8MRMAgACgDCDFAIiDAIAApAxLBECKkAJHr/6AJAAAAACHB/8AgACgC' +
    'DfAAACBgAA3wAAAAAAwAYM+RiJ0h/v8MBMAgADgCIfz/KjMMEjAkkw3wAAAxbndiBAwAYCgMAGAsDABgCAwAYE0CIfL/Ufn/' +
    'wCAAaAJ80leWXVH3/wwCwCAAKQVR9v9h9v/AIAApBcAgACkGxgEAAMAgACkFG0QiBABWIv9B7v/GAQAAwCAAKQQbMyIDAFYi' +
    '/zHn/wwSwCAAKQMx6P/AIAA4AwfjCTAzBHzifPQwJIMN8AAADAwAYBAMAGAx/v9B/v/AIAA4A8AgAEgEMFhBMkIAUkIBQkIE' +
    'MFD1QEhBMDh1UkICMkIDQkIFDfAgDABgJAwAYKH+/wwGKpMGCAAAAIIFAFLFAQAUQACIoULECIB3ICbEApeV58AgAHkKS2Y3' +
    'tgkMBCpWfQRG+v8AIfH/wCAAOQIN8AAAFAwAYBgMAGAcDABgjQIh/P/AIAAoAhZyBJH6/wwFxgoAwCAAqAmKZYpEDAdGBQAA' +
    'AAdAoLCRskYAi3cbZmbHBEtVxgEAZ5TnBv3/AABNAiezAU0DRzXJMez/DBTAIABJAw3wAACA/j8HgP4/C4D+PzgIAGAQAwBg' +
    'CAMAYAQDAGAioOESwdBwIhEJscmh2ZHpgflxxdb/Mfb/Qq7PwCAAKAMMDEAiEMAgACJjACHy/zKgBMAgADkCBdv/BeH/Ien/' +
    '3QwF1v8h7f/h7P/9AjKh8zJhAMXe/zIhANAiwCez8CKh9CrdDELM7MAgACkPId7/DBwF0/8G9f/AIAApDiHb/wwMBdL/BvH/' +
    'AAAAAAAAADE=';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages/scratch-gui/build');
const artifacts = resolve(process.env.ESP8266_BROWSER_ARTIFACTS || 'artifacts/esp8266-debug-browser');
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};

async function serveBuild () {
    if (!existsSync(join(build, 'index.html'))) throw new Error(`Build first: ${build}/index.html is missing`);
    const server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escaped build');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': mime[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
    });
    const base = Number(process.env.BW_PORT || 8191);
    for (let port = base; port < base + 20; port++) {
        const listening = await new Promise((done, fail) => {
            const error = value => value.code === 'EADDRINUSE' ? done(false) : fail(value);
            server.once('error', error);
            server.listen(port, () => { server.removeListener('error', error); done(true); });
        });
        if (listening) return {server, url: `http://localhost:${port}/`};
    }
    throw new Error('no free browser-proof port');
}

await mkdir(artifacts, {recursive: true});
const results = [];
const diagnostics = [];
const check = (name, ok, detail = '') => {
    results.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) throw new Error(`${name}: ${detail || 'failed'}`);
};

const image = Buffer.from(BLINK_BASE64, 'base64');
let browser;
let page;
let server;
let url = process.env.PROOF_URL || process.env.BW_URL;
try {
    check('embedded blink image matches the bw-board fixture hash',
        createHash('sha256').update(image).digest('hex') === BLINK_SHA256);
    if (!url) ({server, url} = await serveBuild());
    browser = await chromium.launch({headless: true});
    page = await browser.newPage({viewport: {width: 1600, height: 1100}});
    page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', request => {
        const reason = request.failure()?.errorText || '';
        if (request.method() === 'HEAD' && /labwired_wasm_bg\.wasm/.test(request.url()) &&
            reason === 'net::ERR_ABORTED') return;
        diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${reason}`);
    });
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const select = page.getByTestId('bw-device-select');
    // The Code tab mounts its picker after the click; count once it is there
    // (counting immediately read 0 on a main run while the PR run read 1).
    await select.locator('option[value="esp8266"]').waitFor({state: 'attached', timeout: 30000}).catch(() => {});
    check('the Code-tab picker offers ESP8266',
        await select.locator('option[value="esp8266"]').count() === 1);
    await select.selectOption('esp8266');
    await page.getByRole('tab', {name: /Circuit/}).click();
    await page.evaluate(bytes => {
        const detail = {format: 'firmware', kind: 'esp8266', target: 'esp8266',
            firmware: {name: 'blink.bin', bytes: Uint8Array.from(bytes), text: null, fCpu: null},
            rom: null, image: null, listing: null};
        window.__bwPendingMedia = {type: 'asm', detail};
        window.dispatchEvent(new CustomEvent('bw-asm-rom-ready', {detail}));
    }, [...image]);
    const panel = page.locator('[data-debug-panel]').first();
    await panel.waitFor({state: 'visible', timeout: 30000});
    check('debug panel mounted after the firmware hand-off', await panel.count() === 1);
    await page.waitForFunction(() => {
        const phase = document.querySelector('[data-debug-panel]')?.getAttribute('data-debug-phase');
        return phase === 'running' || phase === 'error';
    }, null, {timeout: 60000});
    const phase = await panel.getAttribute('data-debug-phase');
    check('the ESP8266 image attached and runs on the esp8266 kind', phase === 'running',
        phase === 'error' ? (await panel.innerText()).slice(0, 400) : phase);
    const consoleBox = page.getByTestId('bw-serial-console');
    await page.waitForFunction(() => {
        const text = document.querySelector('[data-testid="bw-serial-console"]')?.textContent || '';
        const lines = text.split('\n');
        const on = lines.indexOf('on');
        return lines[0] === 'blink' && on > 0 && lines.indexOf('off', on) > on;
    }, null, {timeout: 60000});
    const serial = (await consoleBox.textContent()) || '';
    const lines = serial.split('\n');
    check('serial shows the banner, then GPIO2 on, then off', lines[0] === 'blink' &&
        lines.indexOf('on') > 0 && lines.indexOf('off', lines.indexOf('on')) > lines.indexOf('on'),
        lines.slice(0, 6).join(' | '));
    check('the firmware chip names the picked image', /blink\.bin/.test(await panel.innerText()));
    await page.screenshot({path: join(artifacts, '01-esp8266-running.png'), fullPage: true});
} catch (error) {
    diagnostics.push(`gate: ${error.stack || error.message}`);
    results.push({name: 'complete browser journey', ok: false, detail: error.message});
    if (page) await page.screenshot({path: join(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
} finally {
    await writeFile(join(artifacts, 'report.json'), `${JSON.stringify({url, results, diagnostics}, null, 2)}\n`);
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
}

const failed = results.filter(result => !result.ok);
const didFail = failed.length > 0 || diagnostics.length > 0;
console.log(didFail ? `\n${failed.length} ESP8266 browser check(s) failed.` : '\nESP8266 browser proof passed.');
process.exit(didFail ? 1 : 0);

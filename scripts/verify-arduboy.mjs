/**
 * Acceptance for the Arduboy console, in a browser, on the real build.
 *
 * The unit tests run the CPU directly; nothing they do proves the console
 * is reachable from the app. What can only break here:
 *
 *  1. the lazy `bw-arduboy` chunk actually resolves at runtime
 *  2. dropping a compiled .hex on the Code tab's Open button switches the
 *     right pane to the console instead of reporting "no MakeCode source"
 *  3. the canvas gets a picture — a real game drawing real pixels, which
 *     is the only claim that matters and the only one no unit test makes
 *  4. the buttons are wired to the running program
 *
 * Usage: PROOF_URL=http://localhost:8617/ node scripts/verify-arduboy.mjs
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {openCodeActions} from './lib-code-actions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const fixtures = join(root, 'test', 'fixtures', 'arduboy');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};

let server = null;
let url = process.env.PROOF_URL || process.env.BW_URL || null;
if (!url) {
    if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');
    server = createServer(async (req, res) => {
        let body = null;
        try {
            let path = decodeURIComponent(req.url.split('?')[0]);
            if (path.endsWith('/')) path += 'index.html';
            const file = join(build, normalize(path));
            if (!file.startsWith(build)) throw new Error('escape');
            body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        } catch (e) {
            // The 404 has to be decided BEFORE any header goes out: writing
            // a 200 and then failing to read the file throws
            // ERR_HTTP_HEADERS_SENT and takes the whole gate with it.
            res.writeHead(404);
        }
        res.end(body || 'not found');
    });
    // Concurrent sessions run these probes side by side; take the first
    // free port rather than dying on EADDRINUSE.
    const first = Number(process.env.BW_PORT || 8171);
    let port = null;
    for (let p = first; p < first + 20 && port === null; p++) {
        try {
            await new Promise((done, fail) => {
                server.once('error', fail);
                server.listen(p, () => {
                    server.removeListener('error', fail);
                    done();
                });
            });
            port = p;
        } catch (e) {
            if (e.code !== 'EADDRINUSE') throw e;
        }
    }
    if (port === null) throw new Error('no free port');
    url = `http://localhost:${port}/`;
}

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

/** Poll rather than guess an interval: a CI runner is slower than a laptop. */
const waitFor = async (read, ok, timeoutMs, stepMs = 400) => {
    const until = Date.now() + timeoutMs;
    let value = await read();
    while (!ok(value) && Date.now() < until) {
        await new Promise(done => setTimeout(done, stepMs));
        value = await read();
    }
    return value;
};

const browser = await chromium.launch();

try {
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    page.on('dialog', d => d.dismiss());
    page.on('console', message => {
        if (message.type() === 'error') console.log(`  browser error: ${message.text().slice(0, 160)}`);
    });
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        // The starter-journeys backdrop swallows every click otherwise.
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    // Open/Save moved into the `...` actions menu (31c5a815); a closed
    // <details> hides them, so wait for the menu and open it first.
    await openCodeActions(page);
    await page.waitForSelector('[data-testid="bw-open-file"]', {timeout: 30000});

    const input = page.locator('input[type="file"][accept*=".hex"]');
    check('the Open button offers .hex', await input.count() > 0);

    // ── the whole point: a compiled game, opened, running ──
    await input.setInputFiles(join(fixtures, 'rysk.hex'));

    const pane = page.locator('[data-testid="bw-arduboy-pane"]');
    let appeared = true;
    try {
        // gate-shapes-allow: the appearance IS the subject, and its absence sets `appeared` false, which check() reports and the next line throws on.
        await pane.waitFor({state: 'visible', timeout: 30000});
    } catch (e) {
        appeared = false;
    }
    check('a compiled .hex opens the Arduboy console', appeared,
        appeared ? '' : 'the pane never appeared — the lazy chunk or the dock switch');
    if (!appeared) throw new Error('nothing further can be checked');

    check('the status line says what it did',
        /Arduboy/i.test(await page.evaluate(() => document.body.innerText || '')));

    // Read the canvas back. A blank screen and a crashed emulator look the
    // same from outside, so count lit pixels rather than trusting the pane.
    const litPixels = async () => page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="bw-arduboy-screen"]');
        if (!canvas) return -1;
        const ctx = canvas.getContext('2d');
        const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let lit = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] > 128) lit++;
        return lit;
    });

    const lit = await waitFor(litPixels, n => n > 200, 30000);
    check('the game draws a picture on the canvas', lit > 200,
        `${lit} lit pixels of 8192`);
    check('and it is a picture, not a filled screen', lit > 0 && lit < 7000, `${lit} lit`);

    // Liveness, done properly. "The image changed on its own" is NOT the
    // test: this game's title screen is legitimately static until you press
    // something, so that check failed on a console that was running fine.
    // What distinguishes alive from frozen is that INPUT reaches the
    // program and the picture answers — which also makes the buttons a real
    // check rather than "clicking did not throw".
    const screen = () => page.evaluate(() => {
        const c = document.querySelector('[data-testid="bw-arduboy-screen"]');
        return c ? c.toDataURL() : '';
    });
    const before = await screen();
    const button = page.locator('[data-testid="bw-arduboy-a"]');
    check('the A button is on screen', await button.count() > 0);

    await button.click();
    await page.waitForTimeout(200);
    await button.click();
    const after = await waitFor(screen, image => image !== before, 15000);
    check('a button press reaches the running program and the screen answers',
        after !== before,
        after === before ? 'the picture never changed — a frozen console looks like this' : '');

    check('pause stops the console', await page.locator('[data-testid="bw-arduboy-pause"]').count() > 0);
} catch (e) {
    if (!/nothing further/.test(String(e && e.message))) {
        console.error(`FAIL unexpected: ${e && e.stack || e}`);
        failures.push('unexpected error');
    }
} finally {
    await browser.close();
    if (server) server.close();
}

console.log('');
if (failures.length) {
    console.error(`${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('All Arduboy checks passed.');

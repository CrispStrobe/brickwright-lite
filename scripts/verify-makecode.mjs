#!/usr/bin/env node
/**
 * Acceptance for the MakeCode importer, in a browser, on the real build.
 *
 * bw-makecode has 67 unit tests against real .hex files, and every one of
 * them would still pass if the Open button never called it. What only a
 * browser can prove:
 *
 *  1. dropping a MakeCode .hex on 📂 Open actually reaches the importer
 *     (the routing is by filename, in the JSX);
 *  2. the on-demand chunk loads at all — the importer is behind a
 *     dynamic import() and a webpack misconfiguration would show up
 *     here and in no test;
 *  3. what lands in the editor is the TRANSLATION, not the TypeScript;
 *  4. an Arcade game brings its sprites with it.
 *
 * Checks run against a production build (npm run build:gui). With no
 * PROOF_URL this serves packages/scratch-gui/build itself; with one it
 * drives whatever is already there, which is how the CI gates are wired.
 *   node scripts/verify-makecode.mjs
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-makecode.mjs
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const fixtures = join(root, 'test', 'fixtures', 'makecode');
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
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await page.waitForSelector('[data-testid="bw-open-file"]', {timeout: 30000});

    const input = page.locator('input[type="file"][accept*=".hex"]');
    const offersHex = await input.count() > 0;
    check('the Open button offers .hex', offersHex,
        offersHex ? '' : 'this build predates the MakeCode importer');
    if (!offersHex) {
        // Everything below drops a file on that input; without it the run
        // would die in a 30-second locator timeout and report nothing.
        console.error('\nthe importer is not in this build — nothing further can be checked');
        process.exitCode = 1;
        throw new Error('skip the rest');
    }

    const paneText = () => page.evaluate(() => document.body.innerText || '');

    // ── 1. a micro:bit project, translated all the way to pseudocode ──
    await input.setInputFiles(join(fixtures, 'microbit-blocks.hex'));
    let text = await waitFor(paneText, t => /pins test 1/.test(t), 30000);
    check('a MakeCode .hex is recognised and named', /pins test 1/.test(text),
        (text.match(/.{0,80}pins test 1.{0,60}/) || [''])[0].replace(/\s+/g, ' '));
    check('the on-demand importer chunk loaded', !/Could not read/.test(text));

    const code = await waitFor(
        () => page.evaluate(() => {
            const editor = document.querySelector('.cm-content') || document.querySelector('textarea');
            return editor ? (editor.innerText || editor.value || '') : '';
        }),
        t => /DEVICE MICROBIT/.test(t), 20000);
    check('what lands in the editor is the translation, not the TypeScript',
        /DEVICE MICROBIT/.test(code) && !/basic\.forever/.test(code),
        code.split('\n').slice(0, 4).join(' / '));
    check('and it is the program that was in the hex',
        /analog value of pin P0/.test(code), code.replace(/\s+/g, ' ').slice(0, 120));

    // ── 2. an Arcade game brings its sprites ──────────────────────────
    await input.setInputFiles(join(fixtures, 'arcade-assets.hex'));
    // Both locales, because the browser's language decides which string
    // the status line uses and a CI runner is not necessarily English.
    text = await waitFor(paneText, t => /sprite\(s\)/i.test(t), 30000);
    // The general form of the bug this file already caught once: a
    // message template that grew a parameter its call site did not pass
    // renders the word "undefined" into the status line, and every other
    // check still passes.
    // Scoped to the status SENTENCE, not the whole page: somewhere in a
    // large app the word will legitimately appear, and a gate that cries
    // wolf gets ignored.
    const statusLine = (text.match(/[^\n]*sprite\(s\)[^\n]*/i) || [''])[0];
    check('no status line leaks an undefined interpolation',
        !/\bundefined\b/.test(statusLine), statusLine.replace(/\s+/g, ' ').slice(0, 140));
    check('an Arcade game imports as sprites and costumes',
        /4 sprite\(s\)/i.test(text) && /4 (costume\(s\)|Kostüm\(e\))/i.test(text),
        (text.match(/.{0,40}sprite\(s\).{0,40}/i) || [''])[0].replace(/\s+/g, ' '));

    const arcadeCode = await page.evaluate(() => {
        const editor = document.querySelector('.cm-content');
        return editor ? editor.innerText : '';
    });
    check('with the sprite sections the game names',
        /SPRITE background:/.test(arcadeCode) && /SPRITE mySprite:/.test(arcadeCode),
        arcadeCode.split('\n').slice(0, 6).join(' / '));

    // ── 3. a file with nothing in it says so, rather than failing ─────
    await input.setInputFiles(join(fixtures, 'README.md'));
    text = await waitFor(paneText, t => /README/.test(t), 15000);
    check('a file that is not a MakeCode artefact is refused in words',
        /Don't know that file type|Unbekannter Dateityp/.test(text));
} catch (err) {
    if (!/skip the rest/.test(String(err && err.message))) throw err;
} finally {
    await browser.close();
    if (server) server.close();
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nMakeCode import verified in the browser.');

#!/usr/bin/env node
/**
 * CI-only production-browser proof for the example journey (Lane U).
 *
 * Three owner-reported defects, one session, each journey asserted separately.
 *
 *   J1  Picking a device AFTER loading an example must not leave the authored
 *       board under a retargeted program. `03-night-light` has benches for
 *       stc12, stc15, the Arduino boards, pico and stm32 — and NONE for stc89,
 *       so choosing STC89 must produce a NAMED refusal. That refusal already
 *       existed in setDevice; it was unreachable from this path because only
 *       the importer's own catalogue recorded which example was loaded.
 *   J2  The catalogue is browsed BEFORE the chip is chosen, so changing the
 *       device must not change how many examples are offered.
 *   J3  Loading an example overwrites the PROJECT NAME. The (i) beside that
 *       field says which example, and opens its intro.
 *
 * The example is loaded through the gallery's own loadExample, reached by the
 * React-fiber walk verify-aurora65-workstation.mjs already uses — a green gate's
 * drive rather than an invented selector.
 */
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
    throw new Error('This resource-intensive browser proof is CI-only; set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const artifacts = resolve(process.env.EXAMPLE_JOURNEY_ARTIFACTS || 'artifacts/example-journey');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};

const serveBuild = async () => {
    if (!existsSync(join(build, 'index.html'))) throw new Error(`Build first: ${build}/index.html is missing`);
    const server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escaped build');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    const first = Number(process.env.BW_PORT || 8261);
    for (let port = first; port < first + 20; port++) {
        const listening = await new Promise((done, fail) => {
            const onError = error => error.code === 'EADDRINUSE' ? done(false) : fail(error);
            server.once('error', onError);
            server.listen(port, () => { server.removeListener('error', onError); done(true); });
        });
        if (listening) return {server, url: `http://localhost:${port}/`};
    }
    throw new Error('no free browser-proof port');
};

await mkdir(artifacts, {recursive: true});
let server;
let browser;
let page;
let url = process.env.PROOF_URL || process.env.BW_URL || null;
const checks = [];
const diagnostics = [];
const check = (name, ok, detail = '') => {
    checks.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
};
const snap = async name => {
    const path = join(artifacts, `${name}.png`);
    await page.screenshot({path, fullPage: true});
    check(`artifact ${name}`, existsSync(path));
};
const recordRequestFailure = request => {
    const reason = request.failure()?.errorText || '';
    // The app deliberately aborts its optional labwired WASM HEAD probe once
    // capability detection has its answer. It is not a failed app resource.
    if (request.method() === 'HEAD' && /labwired_wasm_bg\.wasm/.test(request.url()) &&
        reason === 'net::ERR_ABORTED') return;
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()} ${reason}`);
};

try {
    if (!url) ({server, url} = await serveBuild());
    browser = await chromium.launch({headless: true});
    page = await browser.newPage({viewport: {width: 1600, height: 1050}});
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', recordRequestFailure);
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});

    // The circuit tab's own gallery loader, found the way a green gate finds it.
    const found = await page.waitForFunction(() => {
        const gui = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        if (!gui) return false;
        const key = Object.keys(gui).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (!key) return false;
        const queue = [gui[key]];
        for (let i = 0; i < 8000 && queue.length; i++) {
            const fiber = queue.shift();
            const node = fiber && fiber.stateNode;
            if (node && typeof node.loadExample === 'function' &&
                Array.isArray(node.state && node.state.examples)) {
                window.__bwUiCircuitTab = node;
                return node.state.examples.some(e => e.id === '03-night-light');
            }
            if (fiber && fiber.child) queue.push(fiber.child);
            if (fiber && fiber.sibling) queue.push(fiber.sibling);
        }
        return false;
    }, null, {timeout: 40000});
    check('the night-light example is published in the gallery', !!found);

    const loaded = await page.evaluate(async () => {
        const tab = window.__bwUiCircuitTab;
        const ex = tab.state.examples.find(e => e.id === '03-night-light');
        return tab.loadExample(ex);
    });
    check('the gallery loader opens it', loaded && loaded.ok !== false,
        (loaded && loaded.error) || '');

    // ---- J3: the (i) beside the project name --------------------------------
    const intro = page.getByTestId('bw-example-intro');
    await intro.waitFor({timeout: 30000});
    const introFor = await intro.getAttribute('data-example-id');
    check('an (i) appears beside the project name, naming the loaded example',
        introFor === '03-night-light', String(introFor));
    await intro.click();
    await page.getByTestId('bw-example-intro-panel').waitFor({timeout: 20000});
    const panel = (await page.getByTestId('bw-example-intro-panel').textContent() || '').trim();
    check('it opens a panel carrying the example', panel.length > 10, panel.slice(0, 120));
    await snap('example-intro-open');
    await intro.click();

    // ---- J2: the catalogue does not narrow with the device ------------------
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const device = page.getByTestId('bw-device-select');
    await device.waitFor({state: 'visible', timeout: 20000});
    const countItems = () => page.locator('[data-testid="bw-catalog-item"]').count();
    const openCatalog = async () => {
        const btn = page.getByText(/Load example/i).first();
        if (await btn.count()) await btn.click();
    };
    await openCatalog();
    const before = await countItems();
    check('the catalogue lists examples at all', before > 0, `saw ${before}`);
    const noNeeds = await page.evaluate(() =>
        !/Benötigt:|Needs:/.test(document.body.textContent || ''));
    check('no example is labelled with a device requirement', noNeeds);

    await device.selectOption('stc89c52rc');
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="bw-device-select"]')?.value === 'stc89c52rc',
    null, {timeout: 20000});
    await openCatalog();
    const after = await countItems();
    check('changing the device does not narrow the catalogue', after === before,
        `${before} before, ${after} after`);
    await snap('catalogue-unnarrowed');

    // ---- J1: the device pick must refuse, not leave a stale board -----------
    // stc89 has no bench for this example, so setDevice must say so by name.
    const status = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="bw-code-status"]');
        return (el && el.textContent) || '';
    });
    check('choosing a device the example has no circuit for is REFUSED by name',
        /cannot retarget|not available|Cannot/i.test(status), JSON.stringify(status.slice(0, 200)));
    await snap('device-refusal');

    check('no page errors or failed requests', diagnostics.length === 0,
        diagnostics.slice(0, 4).join(' | '));
    await writeFile(join(artifacts, 'result.json'),
        JSON.stringify({url, introFor, before, after, status, checks, diagnostics}, null, 2));
    console.log(`\nExample journey: ${checks.filter(c => c.ok).length}/${checks.length} checks passed.`);
} catch (error) {
    if (page) await page.screenshot({path: join(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
    await writeFile(join(artifacts, 'failure.txt'),
        `${error.stack || error}\n\ndiagnostics:\n${diagnostics.join('\n')}\n`).catch(() => {});
    throw error;
} finally {
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
}

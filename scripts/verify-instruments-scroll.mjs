#!/usr/bin/env node
/** Focused browser regression test for the Circuit Designer Instruments column. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(8099, done));

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1024, height: 768}});
try {
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:8099/', {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});

    const circuitTab = page.getByRole('tab', {name: /Circuit/});
    await circuitTab.click();
    await page.waitForSelector('.bw-circuit-designer:visible', {timeout: 60000});
    const designer = page.locator('.bw-circuit-designer:visible').last();
    const expand = designer.getByRole('button', {name: 'Expand instruments panel'});
    if (await expand.count()) await expand.click({force: true});
    const column = designer.locator('[data-instruments-column]');
    const scroll = designer.locator('[data-instruments-scroll]');
    if (await column.count() !== 1 || await scroll.count() !== 1) throw new Error('Instruments DOM is missing');

    const scope = designer.getByRole('button', {name: /Scope$/});
    const meter = designer.getByRole('button', {name: /Meter$/});
    if (await scope.count() !== 1 || await meter.count() !== 1) throw new Error('Scope/Meter controls are missing');
    await scope.click({force: true});
    await meter.click({force: true});
    await page.waitForTimeout(150);

    const before = await scroll.evaluate(el => ({
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
        bottom: el.getBoundingClientRect().bottom,
        viewport: window.innerHeight,
        designer: el.closest('.bw-circuit-designer')?.getBoundingClientRect().toJSON(),
        ancestors: (() => { const out = []; let n = el; for (let i = 0; i < 6 && n; i++, n = n.parentElement) out.push({tag: n.tagName, class: n.className, height: n.getBoundingClientRect().height, overflow: getComputedStyle(n).overflow}); return out; })(),
        scope: !!el.querySelector('[data-scope-module]'),
        meter: !!el.querySelector('[data-meter-module]')
    }));
    if (!before.scope || !before.meter || before.overflowY !== 'auto' || before.scrollHeight <= before.clientHeight || before.bottom > before.viewport + 1) {
        throw new Error(`Scope/Meter are not in a bounded scroll viewport: ${JSON.stringify(before)}`);
    }
    const after = await scroll.evaluate(el => {
        el.scrollTop = el.scrollHeight;
        const meterModule = el.querySelector('[data-meter-module]').getBoundingClientRect();
        return {scrollTop: el.scrollTop, meterTop: meterModule.top, viewportBottom: el.getBoundingClientRect().bottom};
    });
    if (after.scrollTop <= 0 || after.meterTop > after.viewportBottom + 1) {
        throw new Error(`Instruments did not scroll to Meter: ${JSON.stringify(after)}`);
    }

    const debuggerButton = page.getByRole('button', {name: /Circuit Designer with debugger|Switch to debugger/}).first();
    if (await debuggerButton.count()) {
        await debuggerButton.click({force: true});
        await page.waitForTimeout(300);
        const debugDesigner = page.locator('.bw-circuit-designer:visible').last();
        const debugColumn = debugDesigner.locator('[data-instruments-column]');
        const debugScroll = debugDesigner.locator('[data-instruments-scroll]');
        const debugMetrics = await debugScroll.evaluate(el => ({
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
            overflowY: getComputedStyle(el).overflowY,
            columnBottom: el.parentElement.getBoundingClientRect().bottom,
            viewport: window.innerHeight,
            panel: !!el.querySelector('[data-debugger-panel]'),
            noCode: !!el.querySelector('[data-no-code-indicator]')
        }));
        if (await debugColumn.count() !== 1 || !debugMetrics.panel || !debugMetrics.noCode || debugMetrics.overflowY !== 'auto' || debugMetrics.columnBottom > debugMetrics.viewport + 1) {
            throw new Error(`Debugger is cropped or missing: ${JSON.stringify(debugMetrics)}`);
        }
        console.log(`ok  debugger ${JSON.stringify(debugMetrics)}`);
    }
    console.log(`ok  scope+meter before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
} finally {
    await browser.close();
    server.close();
}

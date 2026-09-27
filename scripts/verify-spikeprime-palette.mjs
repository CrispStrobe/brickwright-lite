#!/usr/bin/env node
// Real-browser regression for the SPIKE extension picker and German palette.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
let server = null;
let url = process.env.PROOF_URL || null;
if (!url) {
    if (!existsSync(join(build, 'index.html'))) {
        throw new Error('Build first: packages/scratch-gui/build/index.html is missing');
    }
    server = createServer(async (req, res) => {
        try {
            let path = decodeURIComponent(req.url.split('?')[0]);
            if (path.endsWith('/')) path += 'index.html';
            const file = join(build, normalize(path));
            if (!file.startsWith(build)) throw new Error('path escape');
            const body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    await new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveListen);
    });
    url = `http://127.0.0.1:${server.address().port}/`;
}
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}, locale: 'de-DE'});
const failures = [];
page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
page.on('dialog', async dialog => {
    failures.push(`dialog: ${dialog.message()}`);
    await dialog.dismiss();
});
await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));

try {
    await page.goto(`${url}${url.includes('?') ? '&' : '?'}locale=de`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm, null, {timeout: 60000});
    const add = page.locator('button[title="Erweiterung hinzufügen"], button[title="Add Extension"]').first();
    await add.click({timeout: 30000});
    await page.getByText('LEGO SPIKE Prime / Robot Inventor', {exact: true}).click({timeout: 30000});
    try {
        await page.waitForFunction(() => {
            const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
            return vm?.runtime?._blockInfo?.some(category => category.id === 'spikeprime');
        }, null, {timeout: 60000});
    } catch (error) {
        const ids = await page.evaluate(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?._blockInfo
            ?.map(category => category.id));
        throw new Error(`${error.message}; loaded categories=${JSON.stringify(ids)}; ${failures.join(' | ')}`);
    }
    await page.waitForFunction(() => /Setze\s*3x3-Matrix/.test(document.body.textContent || ''), null,
        {timeout: 30000});
    const body = await page.locator('body').textContent();
    if (/Message index \d+ out of range/.test(body)) failures.push('the palette displayed a Blockly index error');
    if (!/Setze\s*3x3-Matrix/.test(body)) failures.push('the German 3x3 light-matrix block was not rendered');
} finally {
    await browser.close();
    if (server) server.close();
}

if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
console.log('ok SPIKE Prime opens from the extension gallery and renders its German palette');

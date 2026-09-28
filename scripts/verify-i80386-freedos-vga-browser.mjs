/**
 * Browser smoke for Machine Manager's named 386 media route. Synthetic disks
 * prove attachment and Widgets wiring; they are not a FreeDOS boot fixture.
 * Build packages/scratch-gui first, then run this script. Failures are fatal.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages/scratch-gui/build');
if (!existsSync(join(build, 'index.html'))) throw new Error('Build packages/scratch-gui first');
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const server = createServer(async (req, res) => {
    try {
        let route = decodeURIComponent((req.url || '/').split('?')[0]);
        if (route === '/' || route.endsWith('/')) route += 'index.html';
        const file = join(build, normalize(route));
        if (!file.startsWith(build + '/')) throw new Error('path escaped build');
        const body = await readFile(file);
        res.writeHead(200, {'content-type': mime[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch {
        res.writeHead(404); res.end('not found');
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const floppy = Buffer.alloc(360 * 1024);
const hdd = Buffer.alloc(306 * 4 * 17 * 512);
floppy[0] = 0xeb;
hdd[0] = 0xfa;
const localFile = (name, buffer) => ({name, mimeType: 'application/octet-stream', buffer});
const openManager = async page => {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        indexedDB.deleteDatabase('bw-machines');
        window.__free386Events = [];
        window.addEventListener('bw-machine-media-load', e => {
            const d = e.detail;
            if (d?.machinePreset === 'freedos-vga') window.__free386Events.push({
                slot: d.slotId, primaryBytes: d.bytes?.length,
                hddBytes: d.i80386Media?.hdd?.length,
                floppyBytes: d.i80386Media?.floppy?.length
            });
        });
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const device = page.getByTestId('bw-device-select');
    await device.waitFor({state: 'visible', timeout: 60000});
    await device.selectOption('__manage__');
    await page.getByTestId('bw-machine-manager').waitFor({state: 'visible'});
};
const errors = [];
try {
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    page.on('pageerror', error => errors.push(error.message));
    await openManager(page);
    await page.getByTestId('bw-mm-free386-floppy').setInputFiles(localFile('boot.img', floppy));
    await page.getByTestId('bw-mm-free386-hdd').setInputFiles(localFile('disk.img', hdd));
    await page.waitForFunction(() => typeof window.bwMirrorMachineVideo === 'function');
    await page.evaluate(() => {
        window.__free386Inputs = [];
        const mirror = window.bwMirrorMachineVideo;
        if (typeof mirror !== 'function') throw new Error('Widgets video bridge is absent');
        window.bwMirrorMachineVideo = payload => mirror({
            ...payload,
            keyInFn: sc => {
                const result = payload.keyInFn?.(sc);
                window.__free386Inputs.push({kind: 'key', code: sc, result});
                return result;
            },
            mouseInFn: event => {
                const result = payload.mouseInFn?.(event);
                window.__free386Inputs.push({kind: 'mouse', buttons: event.buttons, result});
                return result;
            }
        });
    });
    await page.getByTestId('bw-mm-free386-run').click();
    await page.getByTestId('bw-machine-manager').waitFor({state: 'detached', timeout: 90000});
    const seen = await page.evaluate(() => window.__free386Events);
    assert.ok(seen.some(e => e.slot === 'floppy' && e.primaryBytes === floppy.length &&
        e.hddBytes === hdd.length), 'both selected disks must reach the media event');
    const consoleFace = page.getByTestId('bw-machine-console');
    await consoleFace.waitFor({state: 'visible', timeout: 30000});
    const canvas = page.getByTestId('bw-machine-canvas');
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="bw-machine-canvas"]');
        return el?.width > 0 && el?.height > 0;
    }, null, {timeout: 30000});
    await canvas.click();
    await page.keyboard.press('a');
    await canvas.click({button: 'right'});
    const inputs = await page.evaluate(() => window.__free386Inputs);
    assert.ok(inputs.some(e => e.kind === 'key' && e.code === 0x1e),
        'Widgets keyboard must send PC set-1 A');
    assert.ok(inputs.some(e => e.kind === 'mouse' && e.buttons === 2 &&
        typeof e.result === 'boolean'),
        'Widgets pointer must reach the named PS/2 adapter');
    assert.deepEqual(errors, [], 'browser must have no uncaught page errors');
    console.log(`ok named 386 attached both synthetic disks; Widgets canvas ${await canvas.getAttribute('width')}x${await canvas.getAttribute('height')}; keyboard and PS/2 mouse forwarded`);
    await page.close();

} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}

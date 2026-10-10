import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {pixelsToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';

const build = resolve(import.meta.dirname, '../packages/scratch-gui/build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
    try {
        let name = decodeURIComponent(req.url.split('?')[0]);
        if (name.endsWith('/')) name += 'index.html';
        const file = join(build, normalize(name));
        if (!file.startsWith(build)) throw new Error('escape');
        const bytes = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch();
try {
    const creator = new SB3Creator();
    creator.parse(`DEVICE ARCADE
GLOBAL hero
SPRITE art:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "art" kind "Player" x 80 y 60 width 2 height 2
  arcade set costume of hero to 1
  arcade bounce hero on wall 1
  arcade ghost hero through sprites 1
  arcade set vx of hero to 60
  arcade set x of hero to 151
`);
    creator.applyCustomSVG('art', pixelsToSvg(parseImageLiteral('1 1\n1 1')));
    creator.addCustomSVGCostume('art', pixelsToSvg(parseImageLiteral('2 2 2\n2 2 2')), 'wide');
    const sb3 = [...new Uint8Array(await (await creator.generateSB3()).arrayBuffer())];
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !!window.__brickwrightStore?.getState()?.scratchGui?.vm,
        null, {timeout: 30000});
    const result = await page.evaluate(async bytes => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        await vm.loadProject(Uint8Array.from(bytes));
        vm.start();
        vm.greenFlag();
        // Explicit frames use the elapsed-time contract; eight immediate calls
        // without a delta advance almost no simulated motion.
        vm.quit();
        for (let i = 0; i < 8; i++) { vm.runtime._step(1000 / 30); await Promise.resolve(); }
        const state = vm.runtime.bwArcadeDeviceState;
        const hero = Object.values(state?.sprites || {}).find(sprite => sprite.id);
        const target = hero && state.spriteTargets[hero.id];
        return {width: hero?.width, height: hero?.height, costume: hero?.costume,
            vx: hero?.vx, x: hero?.x, ghostThroughSprites: hero?.ghostThroughSprites,
            maskLength: hero?.mask?.length,
            costumeCount: target?.getCostumes()?.length};
    }, sb3);
    assert.deepEqual(errors, []);
    assert.equal(result.width, 3);
    assert.equal(result.height, 2);
    assert.equal(result.costume, 1);
    assert.equal(result.maskLength, 6);
    assert.equal(result.costumeCount, 2);
    assert.equal(result.vx, -60, 'built GUI reversed velocity after touching the screen edge');
    assert.equal(result.ghostThroughSprites, true);
    assert.ok(result.x <= 158.5);
    console.log(JSON.stringify({case: 'Arcade image bounds in built GUI', result}));
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}

#!/usr/bin/env node
/** Hosted, real PXT game input/output proof. Not a CPU RTx benchmark. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, relative, extname} from 'node:path';
import {compile, STATIC} from './lib/pxt-node.mjs';
import {isArcadeSimulatorUrl} from './lib/arcade-controls.mjs';

const {chromium} = await import(process.env.BW_PLAYWRIGHT_MODULE || 'playwright');
const out = resolve(process.env.BW_ARCADE_PROOF_DIR || 'test-results/arcade-controls');
const source = `scene.setBackgroundColor(1)
info.setScore(0)
${['A', 'B', 'up', 'down', 'left', 'right'].map(name => `
controller.${name}.onEvent(ControllerButtonEvent.Pressed, function () {
    info.changeScoreBy(1)
    scene.setBackgroundColor(2)
    console.log("${name}:down:" + info.score())
})
controller.${name}.onEvent(ControllerButtonEvent.Released, function () {
    console.log("${name}:up:" + info.score())
})`).join('\n')}
console.log("READY:0")
`;
const compiled = await compile('arcade', {
    'pxt.json': JSON.stringify({name: 'brickwright-controls-proof', dependencies: {device: '*'}, files: ['main.ts']}),
    'main.ts': source
});
assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
assert.deepEqual(compiled.netAttempts, []);
assert.ok(compiled.outfiles['binary.js']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {};
for (const name of ['pxtworker.js', 'target.json', 'sim/pxtsim.js', 'sim/common-sim.js', 'sim/sim.js', 'sim/simulator.html', 'sim/host.html']) {
    hashes[name] = digest(await readFile(resolve(STATIC, 'arcade', name)));
}
const server = createServer(async (req, res) => {
    try {
        const filename = resolve(STATIC, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`);
        const rel = relative(STATIC, filename);
        assert.ok(rel && rel !== '..' && !rel.startsWith('../'));
        const data = await readFile(filename);
        res.writeHead(200, {'content-type': ({'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json'})[extname(filename)] || 'application/octet-stream'});
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end();
    }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const results = [];
await mkdir(out, {recursive: true});
try {
    for (const spec of [
        {name: 'desktop-mouse', viewport: {width: 640, height: 480}, hasTouch: false},
        {name: 'mobile-touch', viewport: {width: 360, height: 640}, hasTouch: true}
    ]) {
        const context = await browser.newContext({viewport: spec.viewport, hasTouch: spec.hasTouch});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
        await page.addInitScript(() => {
            window.bwProofSerial = '';
            window.bwProofReady = false;
            window.addEventListener('message', event => {
                if (event.source === window && event.data?.type === 'bw-makecode-host-ready') window.bwProofReady = true;
                if (event.source === window && event.data?.type === 'bw-makecode-serial') {
                    window.bwProofSerial += event.data.data;
                }
            });
        });
        await page.goto(`${origin}/arcade/sim/host.html`);
        await page.waitForFunction(() => window.bwProofReady);
        const run = () => page.evaluate(js => window.postMessage({type: 'bw-makecode-run', js}, location.origin), compiled.outfiles['binary.js']);
        await run();
        await page.waitForFunction(() => window.bwProofSerial.includes('READY:0'), null, {timeout: 30000});
        const frame = page.frames().find(item => isArcadeSimulatorUrl(item.url(), origin));
        assert.ok(frame, `actual PXT simulator iframe: ${JSON.stringify(page.frames().map(item => item.url()))}`);
        const initialPixels = await frame.locator('#game-screen').screenshot();
        for (const [name, selector] of [['A', '.button-a'], ['B', '.button-b'], ['up', '.dpad-up'], ['down', '.dpad-down'], ['left', '.dpad-left'], ['right', '.dpad-right']]) {
            const control = frame.locator(selector);
            const box = await control.boundingBox();
            assert.ok(box && box.width >= 12 && box.height >= 12, `${spec.name}: ${name} visible`);
            assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= spec.viewport.width + 1 && box.y + box.height <= spec.viewport.height + 1, `${name} inside viewport`);
            if (spec.hasTouch) await control.tap();
            else await control.click();
            await page.waitForFunction(button => window.bwProofSerial.includes(`${button}:down:`) && window.bwProofSerial.includes(`${button}:up:`), name, {timeout: 5000});
        }
        await frame.locator('#game-screen').press('ArrowRight');
        await page.waitForFunction(() => window.bwProofSerial.includes('right:down:7') && window.bwProofSerial.includes('right:up:7'), null, {timeout: 5000});
        const serial = await page.evaluate(() => window.bwProofSerial);
        assert.match(serial, /right:up:7/);
        const changedPixels = await frame.locator('#game-screen').screenshot();
        assert.notEqual(digest(initialPixels), digest(changedPixels), 'button-driven game changes display');
        await page.evaluate(() => window.postMessage({type: 'bw-makecode-stop'}, location.origin));
        await page.evaluate(() => { window.bwProofSerial = ''; });
        await run();
        await page.waitForFunction(() => window.bwProofSerial.includes('READY:0'), null, {timeout: 30000});
        const restarted = page.frames().find(item => isArcadeSimulatorUrl(item.url(), origin));
        assert.ok(restarted, 'restarted PXT simulator iframe');
        if (spec.hasTouch) await restarted.locator('.button-a').tap();
        else await restarted.locator('.button-a').click();
        await page.waitForFunction(() => window.bwProofSerial.includes('A:up:1'), null, {timeout: 5000});
        assert.deepEqual(errors, []);
        await page.screenshot({path: resolve(out, `${spec.name}.png`)});
        results.push({name: spec.name, viewport: spec.viewport, serial, restartSerial: await page.evaluate(() => window.bwProofSerial), initialPixelsSha256: digest(initialPixels), changedPixelsSha256: digest(changedPixels), errors});
        await context.close();
    }
    await writeFile(resolve(out, 'receipt.json'), JSON.stringify({schema: 'brickwright-pxt-controls/v1', sourceSha256: digest(source), compiledSha256: digest(compiled.outfiles['binary.js']), runtimeHashes: hashes, compilerNetworkAttempts: compiled.netAttempts, results, qualification: 'functional PXT browser input/output; not CPU RTx or complete PyBadge hardware'}, null, 2));
    console.log('PASS: actual PXT game responds to six mouse/touch controls, keyboard and restart on desktop/mobile viewports');
} catch (error) {
    await writeFile(resolve(out, 'failure.json'), JSON.stringify({error: String(error.stack || error), runtimeHashes: hashes, completedResults: results}, null, 2));
    throw error;
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}

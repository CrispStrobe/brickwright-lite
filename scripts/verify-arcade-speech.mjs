// Real GUI renderer/controller check. --source-extension registers the owned
// Arcade extension in an existing GUI build when a full build is load-gated.
import {createServer} from 'node:http';
import {readFileSync, writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const root = resolve(import.meta.dirname, '..');
const build = join(root, 'packages/scratch-gui/build');
const backgroundImageMode = process.argv.includes('--background-images');
const sourceMode = process.argv.includes('--source-extension');
const spriteReturnMode = process.argv.includes('--sprite-returns');
const nestedArrayMode = process.argv.includes('--nested-arrays');
const referenceArrayMode = process.argv.includes('--reference-arrays') || nestedArrayMode;
const literalImageMode = process.argv.includes('--literal-images');
const functionReturnMode = process.argv.includes('--function-returns') || literalImageMode;
const imageBlitMode = process.argv.includes('--image-blits');
const imageProjectileMode = process.argv.includes('--image-projectiles');
const creationOrderMode = process.argv.includes('--created-order');
const creationRegistrationMode = process.argv.includes('--created-registration');
const backgroundMode = process.argv.includes('--background');
const flagsMode = process.argv.includes('--flags');
const imageMode = process.argv.includes('--images');
const pixelMode = process.argv.includes('--pixels');
const sharedImageMode = process.argv.includes('--shared-images');
const imageProcedureMode = process.argv.includes('--image-procedures');
const generatedImageMode = process.argv.includes('--generated-images') || imageProcedureMode;
const entry = join(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js');
const require = createRequire(entry);
const guiRequire = createRequire(join(root, 'packages/scratch-gui/package.json'));
const module = {exports: {}};
// Manual source mode executes original CommonJS module bodies in the browser.
// It never stringifies compiled functions: Babel helpers must retain closures.
const dependencyBodies = {}, dependencyValues = {}, requiredModules = new Map();
if (sourceMode) runInNewContext(readFileSync(entry, 'utf8'), {module,
    require: spec => {
        if (spec === '../adapter') return (source, dependencies) => {
            for (const [key, value] of Object.entries(dependencies || {})) {
                if (typeof value === 'function') dependencyBodies[key] = requiredModules.get(value);
                else dependencyValues[key] = value;
            }
            return source;
        };
        const value = require(spec);
        if (typeof value === 'function') requiredModules.set(value, readFileSync(require.resolve(spec), 'utf8'));
        return value;
    }});
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
    try {
        let name = decodeURIComponent(req.url.split('?')[0]);
        if (name.endsWith('/')) name += 'index.html';
        const file = join(build, normalize(name));
        if (!file.startsWith(build + '/')) throw new Error('escape');
        const bytes = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch();
try {
    const imported = arcadeToPseudocode((backgroundImageMode ? `
let backgroundSurface=image.create(8,6)
backgroundSurface.fill(7)
scene.setBackgroundImage(backgroundSurface)
scene.setBackgroundColor(0)
let backgroundPhase=0
` : '') + (functionReturnMode ? `
function fib(n: number) { if (n < 2) { return n }; return fib(n - 1) + fib(n - 2) }
let functionResult = fib(6)
function makePicture(color: number) { let surface = ${literalImageMode ? 'img`2 2 2 2 2 2\n2 2 2 2 2 2\n2 2 2 2 2 2\n2 2 2 2 2 2`' : 'image.create(6, 4)'}; surface.fill(color); return surface }
let returnSample = 0
` : '') + (spriteReturnMode ? `
function createReturnedSprite(color: number) { let surface = image.create(6, 4); surface.fill(color); return sprites.create(surface, SpriteKind.Food) }
function forwardReturnedSprite(color: number) { return createReturnedSprite(color) }
function steerReturnedSprite(sprite: Sprite) { sprite.x += 10; return sprite }
let returnedHandle: Sprite = null
let returnedAlias: Sprite = null
` : '') + (creationRegistrationMode ? `
let priorRegistration = sprites.create(img\`1\`, SpriteKind.Food)
function installPaint(color: number) {
    let capturedColor = color
    sprites.onCreated(SpriteKind.Food, function(sprite) { sprite.image.fill(capturedColor) })
    capturedColor = 7
}
installPaint(3)
let afterRegistration = sprites.create(img\`1\`, SpriteKind.Food)
let priorColor = priorRegistration.image.getPixel(0, 0)
let afterColor = afterRegistration.image.getPixel(0, 0)
` : '') + (creationOrderMode ? `
let creationOrder = 0
function creationPaint(surface: Image, color: number) { surface.fill(color) }
sprites.onCreated(SpriteKind.Player, function(sprite) { creationPaint(sprite.image, 7); creationOrder = creationOrder * 10 + 1 })
sprites.onCreated(SpriteKind.Player, function(sprite) { creationPaint(sprite.image, 2); creationOrder = creationOrder * 10 + 2 })
` : '') + readFileSync(join(root,
        'test/fixtures/makecode/arcade-hat-speech.ts'), 'utf8') + (creationOrderMode ? `
let creationSample = mySprite.image.getPixel(0, 0)
let creationObserved = creationOrder
` : '') + (imageProjectileMode ? `
let payload = image.create(4, 2)
payload.fill(7)
let projectileWidth = 0
let projectileColor = 0
let projectileX = 0
let projectileVelocity = 0
sprites.onCreated(SpriteKind.Projectile, function(sprite) {
    projectileWidth = sprite.width
    projectileColor = sprite.image.getPixel(0, 0)
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function() {
    let shot = sprites.createProjectileFromSprite(payload, hat, 12, 0)
    projectileX = shot.x
    projectileVelocity = shot.vx
    shot.setVelocity(0, 0)
    shot.setPosition(20, 95)
    payload.setPixel(0, 0, 2)
})
` : '') + (imageBlitMode ? `
let copySurface = image.create(8, 6)
copySurface.fill(5)
let stamp = image.create(3, 2)
stamp.setPixel(0, 0, 2)
stamp.setPixel(2, 1, 7)
let imageHit = false
let imageMiss = false
controller.B.onEvent(ControllerButtonEvent.Pressed, function() {
    hat.setImage(copySurface)
    copySurface.drawTransparentImage(stamp, 2, 1)
    copySurface.drawImage(stamp, 0, 4)
    imageHit = copySurface.overlapsWith(stamp, 2, 1)
    imageMiss = copySurface.overlapsWith(stamp, 20, 20)
})
` : '') + (functionReturnMode ? `
controller.B.onEvent(ControllerButtonEvent.Pressed, function() {
    let surface = makePicture(7)
    hat.setImage(surface)
    returnSample = surface.getPixel(0, 0)
})
` : '') + (spriteReturnMode ? `
controller.B.onEvent(ControllerButtonEvent.Pressed, function() {
    returnedHandle = forwardReturnedSprite(7)
    returnedAlias = steerReturnedSprite(returnedHandle)
    returnedAlias.setPosition(140, 95)
})
` : '') + (backgroundImageMode ? `
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    backgroundPhase+=1
    if(backgroundPhase==1){scene.backgroundImage().setPixel(0,0,2);scene.setBackgroundColor(9)}
    else if(backgroundPhase==2){scene.setBackgroundImage(null);scene.setBackgroundColor(2)}
    else {scene.setBackgroundImage(img\`7 .\n. 2\`);scene.backgroundImage().setPixel(1,0,5)}
})
` : '') + (backgroundMode ? `
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    scene.setBackgroundColor(5)
})` : '') + (flagsMode ? `
let hidden = false
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    hidden = !hidden
    hat.setFlag(SpriteFlag.Invisible, hidden)
    hat.setFlag(SpriteFlag.Ghost, hidden)
    hat.setFlag(SpriteFlag.StayInScreen, true)
})` : '') + (imageMode ? `
let paint = 0
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    paint += 1
    if (paint == 1) { hat.image.fill(7) }
    else if (paint == 2) { hat.image.replace(7, 2); hat.image.flipX(); hat.image.flipY() }
    else { hat.image.fill(0) }
})` : '') + (pixelMode ? `
let pixelSample = 0
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    hat.image.fill(0)
    hat.image.fillRect(4, 4, 8, 8, 5)
    hat.image.drawLine(0, 0, 31, 31, 7)
    hat.image.setPixel(16, 16, 2)
    pixelSample = hat.image.getPixel(16, 16)
})` : '') + (sharedImageMode ? `
let shared = hat.image
let phase = 0
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    phase += 1
    if (phase == 1) { mySprite.setImage(shared); hat.image.fill(2) }
    else if (phase == 2) { hat.setImage(img\`1\`); hat.image.fill(7) }
    else { hat.setImage(shared); hat.image.fill(0) }
})` : '') + (generatedImageMode ? `
${imageProcedureMode ? `function paint(surface: Image, color: number) { let alias = surface; alias.fill(color) }
function forward(surface: Image, color: number) { paint(surface, color) }` : ''}
let generated = image.create(32, 32)
let phase = 0
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    phase += 1
    if (phase == 1) {
        ${imageProcedureMode ? 'forward(generated, 5)' : 'generated.fill(5)'}
        hat.setImage(generated)
        mySprite.setImage(generated.clone())
        generated.replace(5, 2)
    } else if (phase == 2) { ${imageProcedureMode ? 'forward(generated, 7)' : 'generated.fill(7)'} }
    else { ${imageProcedureMode ? 'forward(generated, 0)' : 'generated.fill(0)'} }
})` : '') + (referenceArrayMode ? `
let pictures=[${nestedArrayMode?'[':''}img\`7 7 7 7 7 7\n7 7 7 7 7 7\n7 7 7 7 7 7\n7 7 7 7 7 7\`${nestedArrayMode?']':''}]
let actors=${nestedArrayMode?'[[hat,mySprite]]':'[hat,mySprite]'}
let alias=actors
${nestedArrayMode?'let heldRow=actors[0]\nlet otherRow=alias[0]':''}
let arrayPhase=0
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){
    arrayPhase+=1
    for(let actor of ${nestedArrayMode?'heldRow':'alias'}){actor.setImage(${nestedArrayMode?'pictures[0][0]':'pictures[0]'})}
    if(arrayPhase==2){${nestedArrayMode?'pictures[0][0]':'pictures[0]'}.fill(2)}
})` : ''));
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator(); creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    for (const costume of imported.costumes) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    const bytes = [...new Uint8Array(await (await creator.generateSB3()).arrayBuffer())];
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => !!window.__brickwrightStore?.getState()?.scratchGui?.vm,
        null, {timeout: 60000});
    await page.evaluate(async ({bytes, source, argumentType, blockType, castBoolean, dependencyBodies, dependencyValues, valueBody}) => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        if (source) {
            let instance;
            const loadBody = body => {
                if (!body) throw new Error('Missing original diagnostic dependency body');
                const module = {exports:{}};
                new Function('module', 'exports', body)(module, module.exports);
                return module.exports;
            };
            const dependencies = {...dependencyValues};
            for (const [key, body] of Object.entries(dependencyBodies)) dependencies[key] = loadBody(body);
            const Scratch = {vm, ArgumentType: argumentType, BlockType: blockType,
                BWExtensionDependencies: dependencies, BWValues:loadBody(valueBody),
                Cast: new Function('return ({' + castBoolean + '})')(),
                extensions: {register: extension => { instance = extension; }}};
            new Function('Scratch', source)(Scratch);
            window.__bwSpeechExtension = instance;
            const service = vm.extensionManager._registerInternalExtension(instance);
            vm.extensionManager._loadedExtensions.set('arcade', service);
        }
        await vm.loadProject(Uint8Array.from(bytes));
        vm.runtime.bwDeviceId = 'arcade';
        vm.start(); vm.greenFlag();
        localStorage.setItem('bw-debug-dock', 'arcade');
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-debug-dock', value: 'arcade'}}));
    }, {bytes, source: sourceMode ? module.exports : null, dependencyBodies, dependencyValues,
        valueBody:sourceMode ? readFileSync(join(root,'overlay/scratch-vm/src/util/bw-values.js'),'utf8') : null,
        argumentType: guiRequire('./node_modules/scratch-vm/src/extension-support/argument-type'),
        blockType: guiRequire('./node_modules/scratch-vm/src/extension-support/block-type'),
        castBoolean: guiRequire('./node_modules/scratch-vm/src/util/cast').toBoolean.toString()});
    let creationOrder;
    if (creationOrderMode) {
        await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
            .flatMap(t=>Object.values(t.variables)).find(v=>v.name==='creationObserved')?.value === 12, null, {timeout:10000});
        creationOrder = await page.evaluate(() => {
            const values=window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
            return {sample:values.find(v=>v.name==='creationSample')?.value,order:values.find(v=>v.name==='creationObserved')?.value};
        });
        assert.deepEqual(creationOrder,{sample:2,order:12});
    }
    let creationRegistration;
    if (creationRegistrationMode) {
        await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
            .flatMap(t=>Object.values(t.variables)).find(v=>v.name==='afterColor')?.value === 7, null, {timeout:10000});
        creationRegistration = await page.evaluate(() => {
            const values=window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
            return {prior:values.find(v=>v.name==='priorColor')?.value,after:values.find(v=>v.name==='afterColor')?.value};
        });
        assert.deepEqual(creationRegistration,{prior:1,after:7});
    }
    if (functionReturnMode) await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .flatMap(t=>Object.values(t.variables)).find(v=>v.name==='functionResult')?.value === 8,null,{timeout:15000});
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    const state = () => page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        return Object.values(vm.runtime.bwArcadeDeviceState?.sprites || {})
            .map(({id, kind, x, y}) => ({id, kind, x, y}));
    });
    const before = await state();
    await page.getByTestId('bw-arcade-a').click();
    await page.waitForFunction(before => {
        const sprites = Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites);
        const player = sprites.find(s => s.kind === 'Player');
        const old = before.find(s => s.kind === 'Player');
        return player.x !== old.x || player.y !== old.y;
    }, before, {timeout: 10000});
    const afterController = await state();
    const rendered = await page.evaluate(async () => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        vm.quit();
        const sprites = Object.values(vm.runtime.bwArcadeDeviceState.sprites);
        const player = sprites.find(s => s.kind === 'Player');
        const hat = sprites.find(s => s.kind === 'Hat');
        for (const sprite of [player, hat]) {
            vm.runtime._primitives.arcade_setSpriteProperty({ID: sprite.id, PROPERTY: 'x', VALUE: 80}, {});
            vm.runtime._primitives.arcade_setSpriteProperty({ID: sprite.id, PROPERTY: 'y', VALUE: 60}, {});
        }
        for (let i = 0; i < 4; i++) vm.runtime._step();
        // The bubble's SVG skin loads asynchronously: poll the drawn frame for a
        // few animation frames rather than reading the first one.
        const canvas = vm.runtime.renderer.canvas;
        const capture = document.createElement('canvas'); capture.width = canvas.width; capture.height = canvas.height;
        const context = capture.getContext('2d');
        let data, bubblePixels = 0;
        for (let attempt = 0; attempt < 30 && bubblePixels <= 100; attempt++) {
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            vm.runtime.renderer.draw();
            context.clearRect(0, 0, capture.width, capture.height); context.drawImage(canvas, 0, 0);
            data = context.getImageData(0, 0, capture.width, capture.height).data;
            bubblePixels = 0;
            // The known white speech frame sits above the player and hat at
            // y=60, beyond their costume bounds. Count its actual stage pixels.
            for (let y = Math.floor(capture.height * 25 / 120); y < capture.height * 43 / 120; y++) {
                for (let x = Math.floor(capture.width * 40 / 160); x < capture.width * 120 / 160; x++) {
                    const offset = 4 * (y * capture.width + x);
                    if (data[offset] > 245 && data[offset + 1] > 245 && data[offset + 2] > 245) bubblePixels++;
                }
            }
        }
        window.__bwSpeechFrame = capture.toDataURL();
        const speech = Object.values(vm.runtime.bwArcadeDeviceState.speech || {});
        const renderState = window.__bwSpeechExtension && [...window.__bwSpeechExtension._speech.values()].map(entry => {
            const skin = vm.runtime.renderer._allSkins[entry.skinId];
            const drawable = vm.runtime.renderer._allDrawables[entry.drawableId];
            return {skin: entry.skinId, drawable: entry.drawableId, svgLength: entry.svg?.length,
                skinSize: skin?.size, visible: drawable?._visible, scale: drawable?._scale,
                position: drawable?._position, ownerVisible: entry.target?.visible};
        });
        const palette = vm.runtime.getBlocksXML().some(category => category.xml?.includes('arcade_spriteSay'));
        vm.runtime._primitives.arcade_setSpriteProperty({ID: hat.id, PROPERTY: 'x', VALUE: 140}, {});
        // Advance 600ms after separating the sprites. Immediate calls with no
        // delta measure wall time and cannot establish a 500ms expiry.
        for (let i = 0; i < 18; i++) { vm.runtime._step(1000 / 30); await Promise.resolve(); }
        const corner = Array.from(data.slice(4 * (5 * capture.width + 5), 4 * (5 * capture.width + 5) + 3));
        return {speech, bubblePixels, corner, palette, renderState, afterExpiry: Object.keys(vm.runtime.bwArcadeDeviceState.speech).length};
    });
    writeFileSync(join(root, 'test-results/arcade-speech-stage.png'),
        Buffer.from((await page.evaluate(() => window.__bwSpeechFrame)).split(',')[1], 'base64'));
    assert.equal(rendered.speech[0]?.text, 'Excuse Me!');
    assert.ok(rendered.bubblePixels > 100, JSON.stringify(rendered));
    // Without a background, Lite shows the project's default Stage backdrop (a
    // gradient from #87CEEB at this corner) where PXT shows black: a named gap
    // in docs/OPEN-TASKS-2026-09-29.md F3. The check is that nothing drawn for
    // speech or sprites reaches the corner.
    if (backgroundImageMode) assert.deepEqual(rendered.corner, [120,220,82]);
    else rendered.corner.forEach((v, i) => assert.ok(Math.abs(v - [135,206,235][i]) <= 2, JSON.stringify(rendered.corner)));
    assert.equal(rendered.palette, true);
    assert.equal(rendered.afterExpiry, 0);
    let background;
    if (backgroundMode) {
        await page.getByTestId('bw-arcade-b').click();
        background = await page.evaluate(async () => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (let i = 0; i < 4; i++) vm.runtime._step();
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            const capture = () => {
                vm.runtime.renderer.draw();
                const canvas = vm.runtime.renderer.canvas;
                const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
                const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
                return Array.from(ctx.getImageData(5, 5, 1, 1).data).slice(0, 3);
            };
            const color = vm.runtime.bwArcadeDeviceState.backgroundColor;
            const yellow = capture();
            const samples = [];
            for (let value = 0; value < 16; value++) {
                vm.runtime._primitives.arcade_setBackgroundColor({COLOR: value}, {});
                await new Promise(done => requestAnimationFrame(done));
                samples.push(capture());
            }
            vm.greenFlag();
            for (let i = 0; i < 4; i++) vm.runtime._step();
            const black = capture();
            return {color, yellow, black, samples, validDrawables: vm.runtime.renderer._drawList.every(id => !!vm.runtime.renderer._allDrawables[id])};
        });
        assert.equal(background.color, 5);
        assert.deepEqual(background.yellow, [255, 246, 9]);
        assert.deepEqual(background.black, [0, 0, 0]);
        assert.equal(background.validDrawables, true);
        const palette = ['000000', 'ffffff', 'ff2121', 'ff93c4', 'ff8135', 'fff609', '249ca3', '78dc52', '003fad', '87f2ff', '8e2ec4', 'a4839f', '5c406c', 'e5cdc4', '91463d', '000000'];
        assert.deepEqual(background.samples, palette.map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))));
    }
    let flags;
    if (flagsMode) {
        const captureHat = () => page.evaluate(async () => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (let i = 0; i < 4; i++) vm.runtime._step();
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            vm.runtime.renderer.draw();
            const canvas = vm.runtime.renderer.canvas;
            const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
            const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
            const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
            let coloredPixels = 0;
            // Only the hat is positioned here (x=140,y=60).
            for (let y = Math.floor(copy.height * 45 / 120); y < copy.height * 75 / 120; y++) {
                for (let x = Math.floor(copy.width * 125 / 160); x < copy.width * 155 / 160; x++) {
                    const offset = 4 * (y * copy.width + x);
                    if (pixels[offset] || pixels[offset + 1] || pixels[offset + 2]) coloredPixels++;
                }
            }
            const state = vm.runtime.bwArcadeDeviceState;
            const hat = Object.values(state.sprites).find(s => s.kind === 'Hat');
            const player = Object.values(state.sprites).find(s => s.kind === 'Player');
            const target = state.spriteTargets[hat.id];
            return {coloredPixels, mask: hat.flags, visible: target.visible, stayInScreen: hat.stayInScreen,
                keyDown: vm.runtime.ioDevices.keyboard.getKeyIsDown('z'),
                hiddenValue: vm.runtime.targets.flatMap(t => Object.values(t.variables || {})).find(v => v.name === 'hidden')?.value,
                overlaps: vm.runtime._primitives.arcade_spriteOverlaps({A: hat.id, B: player.id}, {}),
                palette: vm.runtime.getBlocksXML().some(category => category.xml?.includes('arcade_setSpriteFlag'))};
        });
        const visible = await captureHat();
        await page.getByTestId('bw-arcade-b').click();
        const hidden = await captureHat();
        await page.getByTestId('bw-arcade-b').click();
        const restored = await captureHat();
        assert.ok(visible.coloredPixels > 20, JSON.stringify(visible));
        assert.equal(hidden.coloredPixels, 0);
        assert.equal(hidden.visible, false); assert.equal(hidden.mask, 7304);
        assert.equal(hidden.stayInScreen, true); assert.equal(hidden.palette, true);
        assert.equal(restored.visible, true, JSON.stringify({visible, hidden, restored})); assert.equal(restored.mask, 8);
        assert.equal(restored.coloredPixels, visible.coloredPixels);
        flags = {visible, hidden, restored};
    }
    let imageProjectiles;
    if (imageProjectileMode) {
        await page.getByTestId('bw-arcade-b').click();
        imageProjectiles = await page.evaluate(async () => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (let i = 0; i < 6; i++) vm.runtime._step();
            const state = vm.runtime.bwArcadeDeviceState;
            const shot = Object.values(state.sprites).find(s => s.kind === 'Projectile');
            const target = state.spriteTargets[shot.id];
            for (let i = 0; i < 120; i++) {
                const skin = vm.runtime.renderer._allDrawables[target.drawableID]?.skin;
                if (skin?._svgImageLoaded) break;
                await new Promise(done => requestAnimationFrame(done));
            }
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');
            copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
            const data=ctx.getImageData(0,0,copy.width,copy.height).data;
            let coloredPixels=0;
            for(let y=copy.height*90/120;y<copy.height*100/120;y++)for(let x=copy.width*10/160;x<copy.width*30/160;x++){
                const i=4*(y*copy.width+x);if(data[i]||data[i+1]||data[i+2])coloredPixels++;
            }
            const vars=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
            return {width:vars.projectileWidth,color:vars.projectileColor,sourceX:vars.projectileX,
                initialVelocity:vars.projectileVelocity,pixels:[...shot.image.pixels],coloredPixels,
                palette:vm.runtime.getBlocksXML().some(c=>c.xml?.includes('arcade_spawnImageProjectile'))};
        });
        assert.deepEqual(imageProjectiles,{width:4,color:7,sourceX:140,initialVelocity:12,
            pixels:[2,7,7,7,7,7,7,7],coloredPixels:72,palette:true});
    }
    let imageBlits;
    if (imageBlitMode) {
        await page.getByTestId('bw-arcade-b').click();
        imageBlits = await page.evaluate(async () => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (let i = 0; i < 5; i++) vm.runtime._step();
            const deadline=performance.now()+5000;
            while (Object.values(vm.runtime.bwArcadeDeviceState.spriteTargets).some(t=>
                vm.runtime.renderer._allDrawables[t.drawableID]?.skin?._svgImageLoaded === false) && performance.now()<deadline)
                await new Promise(done=>requestAnimationFrame(done));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas, copy=document.createElement('canvas');
            copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
            const data=ctx.getImageData(0,0,copy.width,copy.height).data;
            const counts={red:0,green:0,yellow:0};
            for(let y=copy.height*45/120;y<copy.height*75/120;y++)for(let x=copy.width*125/160;x<copy.width*155/160;x++){
                const i=4*(y*copy.width+x);
                if(data[i]===255&&data[i+1]===33&&data[i+2]===33)counts.red++;
                if(data[i]===120&&data[i+1]===220&&data[i+2]===82)counts.green++;
                if(data[i]===255&&data[i+1]===246&&data[i+2]===9)counts.yellow++;
            }
            const vars=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
            const hat=Object.values(vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.kind==='Hat');
            return {counts,hit:vars.imageHit,miss:vars.imageMiss,opaque:hat.mask.reduce((a,b)=>a+b,0),
                palette:['arcade_blitImage','arcade_imagesOverlap'].every(op=>vm.runtime.getBlocksXML().some(c=>c.xml?.includes(op)))};
        });
        assert.deepEqual(imageBlits,{counts:{red:18,green:18,yellow:360},hit:true,miss:false,opaque:44,palette:true});
    }
    let spriteReturns;
    if (spriteReturnMode) {
        await page.getByTestId('bw-arcade-b').click();
        spriteReturns = await page.evaluate(async () => {
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            for(let i=0;i<8;i++){vm.runtime._step();await Promise.resolve();}
            const deadline=performance.now()+5000;
            while(Object.values(vm.runtime.bwArcadeDeviceState.spriteTargets).some(t=>
                vm.runtime.renderer._allDrawables[t.drawableID]?.skin?._svgImageLoaded === false) && performance.now()<deadline)
                await new Promise(done=>requestAnimationFrame(done));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
            let green=0;
            for(let y=copy.height*85/120;y<copy.height*105/120;y++)for(let x=copy.width*130/160;x<copy.width*150/160;x++){
                const i=4*(y*copy.width+x);if(pixels[i]===120&&pixels[i+1]===220&&pixels[i+2]===82)green++;
            }
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
            const sprite=vm.runtime.bwArcadeDeviceState.sprites[values.returnedHandle];
            return {alias:values.returnedHandle===values.returnedAlias,x:sprite.x,y:sprite.y,width:sprite.width,height:sprite.height,green};
        });
        assert.deepEqual(spriteReturns,{alias:true,x:140,y:95,width:6,height:4,green:216});
    }
    let backgroundImages;
    if (backgroundImageMode) {
        const capture=()=>page.evaluate(async()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            for(let i=0;i<5;i++){vm.runtime._step();await Promise.resolve();}
            const deadline=performance.now()+5000;
            while(vm.runtime.renderer._allDrawables.some(d=>d?.skin?._svgImageLoaded===false) && performance.now()<deadline)await new Promise(done=>requestAnimationFrame(done));
            vm.runtime.renderer.draw();const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const p=ctx.getImageData(0,0,copy.width,copy.height).data;
            const colors={green:0,red:0,yellow:0};
            for(let y=0;y<18;y++)for(let x=0;x<24;x++){
                const i=4*(y*copy.width+x),rgb=[p[i],p[i+1],p[i+2]].join(',');
                if(rgb==='120,220,82')colors.green++;if(rgb==='255,33,33')colors.red++;if(rgb==='255,246,9')colors.yellow++;
            }
            window.__bwBackgroundFrame=copy.toDataURL();
            const i=4*(30*copy.width+30),image=vm.runtime.bwArcadeDeviceState.backgroundImage;
            return {colors,outside:[p[i],p[i+1],p[i+2]],size:image?[image.width,image.height]:null,
                palette:['arcade_setBackgroundImage','arcade_backgroundImage'].every(op=>vm.runtime.getBlocksXML().some(c=>c.xml?.includes(op)))};
        });
        await page.getByTestId('bw-arcade-b').click();const mutated=await capture();
        assert.deepEqual(mutated,{colors:{green:423,red:9,yellow:0},outside:[135,242,255],size:[8,6],palette:true});
        await page.getByTestId('bw-arcade-b').click();const cleared=await capture();
        writeFileSync(join(root,'test-results/arcade-background-cleared-stage.png'),Buffer.from((await page.evaluate(()=>window.__bwBackgroundFrame)).split(',')[1],'base64'));
        assert.deepEqual(cleared,{colors:{green:0,red:432,yellow:0},outside:[255,33,33],size:null,palette:true});
        await page.getByTestId('bw-arcade-b').click();const literal=await capture();
        assert.deepEqual(literal,{colors:{green:9,red:414,yellow:9},outside:[255,33,33],size:[2,2],palette:true});
        await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.greenFlag());const restarted=await capture();
        assert.deepEqual(restarted,{colors:{green:432,red:0,yellow:0},outside:[0,0,0],size:[8,6],palette:true});
        backgroundImages={mutated,cleared,literal,restarted};
    }
    let functionReturns;
    if (functionReturnMode) {
        await page.getByTestId('bw-arcade-b').click();
        functionReturns = await page.evaluate(async () => {
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            for(let i=0;i<5;i++){vm.runtime._step();await Promise.resolve();}
            const deadline=performance.now()+5000;
            while(Object.values(vm.runtime.bwArcadeDeviceState.spriteTargets).some(t=>
                vm.runtime.renderer._allDrawables[t.drawableID]?.skin?._svgImageLoaded === false) && performance.now()<deadline)
                await new Promise(done=>requestAnimationFrame(done));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
            let green=0;
            for(let y=copy.height*45/120;y<copy.height*75/120;y++)for(let x=copy.width*125/160;x<copy.width*155/160;x++){
                const i=4*(y*copy.width+x);if(pixels[i]===120&&pixels[i+1]===220&&pixels[i+2]===82)green++;
            }
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
            const hat=Object.values(vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.kind==='Hat');
            return {result:values.functionResult,sample:values.returnSample,width:hat.width,height:hat.height,green,
                palette:['arcade_callFunction','arcade_functionArgument','arcade_returnValue'].every(op=>vm.runtime.getBlocksXML().some(c=>c.xml?.includes(op)))};
        });
        assert.deepEqual(functionReturns,{result:8,sample:7,width:6,height:4,green:216,palette:true});
    }
    let referenceArrays;
    if (referenceArrayMode) {
        const capture = () => page.evaluate(async () => {
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            for(let i=0;i<15;i++){vm.runtime._step();await new Promise(done=>requestAnimationFrame(done));}
            const sprites=Object.values(vm.runtime.bwArcadeDeviceState.sprites);
            const hat=sprites.find(s=>s.kind==='Hat'),player=sprites.find(s=>s.kind==='Player');
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
            let green=0,red=0;
            for(let y=copy.height*45/120;y<copy.height*75/120;y++)for(let x=copy.width*125/160;x<copy.width*155/160;x++){
                const i=4*(y*copy.width+x);if(pixels[i]===120&&pixels[i+1]===220&&pixels[i+2]===82)green++;
                if(pixels[i]===255&&pixels[i+1]===33&&pixels[i+2]===33)red++;
            }
            const palette=vm.runtime.getBlocksXML().map(c=>c.xml||'').join('');
            return {alias:values.actors===values.alias,shared:hat.image===player.image,colors:[...new Set(hat.image.pixels)],width:hat.width,height:hat.height,green,red,
                palette:['createReference','referenceValues','referenceTruthy','referenceItem','referenceLength','referenceRandom','referenceRemove','referenceTake','referenceIndexOf','mutateReference'].every(op=>palette.includes('arrays_'+op))};
        });
        await page.getByTestId('bw-arcade-b').click();const green=await capture();
        assert.deepEqual(green,{alias:true,shared:true,colors:[7],width:6,height:4,green:216,red:0,palette:true});
        await page.getByTestId('bw-arcade-b').click();const red=await capture();
        assert.deepEqual(red,{alias:true,shared:true,colors:[2],width:6,height:4,green:0,red:216,palette:true});
        const nestedRows=nestedArrayMode ? await page.evaluate(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
            return typeof values.heldRow==='string' && values.heldRow===values.otherRow;
        }) : undefined;
        if(nestedArrayMode)assert.equal(nestedRows,true);
        referenceArrays={green,red,nestedRows};
    }
    let images;
    if (imageMode) {
        const capture = () => page.evaluate(async () => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (let i = 0; i < 5; i++) vm.runtime._step();
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            vm.runtime.renderer.draw();
            const canvas = vm.runtime.renderer.canvas;
            const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
            const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
            const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
            let green = 0, red = 0, colored = 0;
            for (let y = Math.floor(copy.height * 45 / 120); y < copy.height * 75 / 120; y++) {
                for (let x = Math.floor(copy.width * 125 / 160); x < copy.width * 155 / 160; x++) {
                    const i = 4 * (y * copy.width + x);
                    if (pixels[i] || pixels[i+1] || pixels[i+2]) colored++;
                    if (pixels[i] === 120 && pixels[i+1] === 220 && pixels[i+2] === 82) green++;
                    if (pixels[i] === 255 && pixels[i+1] === 33 && pixels[i+2] === 33) red++;
                }
            }
            const state = vm.runtime.bwArcadeDeviceState;
            const hat = Object.values(state.sprites).find(s => s.kind === 'Hat');
            return {green, red, colored, colors: [...new Set(hat.image?.pixels || [])],
                opaque: hat.mask?.reduce((a,b) => a+b, 0),
                palette: vm.runtime.getBlocksXML().some(c => c.xml?.includes('arcade_mutateSpriteImage'))};
        });
        await page.getByTestId('bw-arcade-b').click(); const green = await capture();
        await page.getByTestId('bw-arcade-b').click(); const red = await capture();
        await page.getByTestId('bw-arcade-b').click(); const transparent = await capture();
        assert.ok(green.green > 100, JSON.stringify(green)); assert.deepEqual(green.colors, [7]);
        assert.ok(red.red > 100, JSON.stringify(red)); assert.deepEqual(red.colors, [2]);
        assert.equal(transparent.colored, 0); assert.deepEqual(transparent.colors, [0]);
        assert.equal(transparent.opaque, 0); assert.equal(transparent.palette, true);
        images = {green, red, transparent};
    }
    let pixels;
    if (pixelMode) {
        await page.getByTestId('bw-arcade-b').click();
        pixels = await page.evaluate(async () => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (let i = 0; i < 5; i++) vm.runtime._step();
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            vm.runtime.renderer.draw();
            const canvas = vm.runtime.renderer.canvas;
            const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
            const ctx = copy.getContext('2d'); ctx.drawImage(canvas,0,0);
            const data = ctx.getImageData(0,0,copy.width,copy.height).data;
            const counts = {red:0,green:0,yellow:0};
            for(let y=Math.floor(copy.height*45/120);y<copy.height*75/120;y++) {
                for(let x=Math.floor(copy.width*125/160);x<copy.width*155/160;x++) {
                    const i=4*(y*copy.width+x);
                    if(data[i]===255 && data[i+1]===33 && data[i+2]===33) counts.red++;
                    if(data[i]===120 && data[i+1]===220 && data[i+2]===82) counts.green++;
                    if(data[i]===255 && data[i+1]===246 && data[i+2]===9) counts.yellow++;
                }
            }
            const hat = Object.values(vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.kind==='Hat');
            const xml = vm.runtime.getBlocksXML().map(c=>c.xml||'').join('');
            return {counts, sample: vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='pixelSample')?.value,
                center: hat.image?.pixels[16*32+16], opaque: hat.mask?.reduce((a,b)=>a+b,0),
                palette: ['arcade_setSpritePixel','arcade_spritePixel','arcade_drawSpriteImage'].every(op=>xml.includes(op))};
        });
        for (const count of Object.values(pixels.counts)) assert.ok(count>0,JSON.stringify(pixels));
        assert.equal(pixels.sample,2); assert.equal(pixels.center,2); assert.equal(pixels.opaque,88); assert.equal(pixels.palette,true);
    }
    let sharedImages;
    if (sharedImageMode || generatedImageMode) {
        await page.evaluate(() => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            for (const sprite of Object.values(vm.runtime.bwArcadeDeviceState.sprites)) {
                vm.runtime._primitives.arcade_setSpriteProperty({ID:sprite.id,PROPERTY:'x',VALUE:sprite.kind==='Hat'?110:40},{});
                vm.runtime._primitives.arcade_setSpriteProperty({ID:sprite.id,PROPERTY:'y',VALUE:60},{});
            }
        });
        const capture = () => page.evaluate(async () => {
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            for(let i=0;i<5;i++)vm.runtime._step();
            // SVG decoding is asynchronous; wait for the current skins rather
            // than assuming two animation frames finish every browser load.
            const deadline=performance.now()+5000;
            while (Object.values(vm.runtime.bwArcadeDeviceState.spriteTargets).some(t => {
                const skin=vm.runtime.renderer._allDrawables[t.drawableID]?.skin;
                return skin && skin._svgImageLoaded === false;
            }) && performance.now()<deadline) await new Promise(done=>requestAnimationFrame(done));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas, copy=document.createElement('canvas');
            copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
            const data=ctx.getImageData(0,0,copy.width,copy.height).data;
            const colored = center => {
                let count=0;
                for(let y=Math.floor(copy.height*40/120);y<copy.height*80/120;y++)
                    for(let x=Math.floor(copy.width*(center-20)/160);x<copy.width*(center+20)/160;x++) {
                        const i=4*(y*copy.width+x);if(data[i]||data[i+1]||data[i+2])count++;
                    }
                return count;
            };
            const state=vm.runtime.bwArcadeDeviceState, hat=Object.values(state.sprites).find(s=>s.kind==='Hat'),
                player=Object.values(state.sprites).find(s=>s.kind==='Player');
            return {same:hat.image===player.image,hatColors:[...new Set(hat.image?.pixels||[])],
                playerColors:[...new Set(player.image?.pixels||[])],hatPixels:colored(110),playerPixels:colored(40),
                masks:[hat.mask?.reduce((a,b)=>a+b,0),player.mask?.reduce((a,b)=>a+b,0)],
                targets:[hat,player].map(s=>{const t=state.spriteTargets[s.id];const d=vm.runtime.renderer._allDrawables[t.drawableID];
                    return {x:s.x,y:s.y,targetX:t.x,targetY:t.y,visible:t.visible,size:t.size,skin:d?.skin?.size,drawableVisible:d?._visible,drawablePosition:d?._position,svgLoaded:d?.skin?._svgImageLoaded,naturalWidth:d?.skin?._svgImage?.naturalWidth};}),
                canvas:[copy.width,copy.height]};
        });
        await page.getByTestId('bw-arcade-b').click();const shared=await capture();
        await page.getByTestId('bw-arcade-b').click();const separate=await capture();
        await page.getByTestId('bw-arcade-b').click();const erased=await capture();
        if (generatedImageMode) {
            assert.equal(shared.same,false);assert.deepEqual(shared.hatColors,[2]);assert.deepEqual(shared.playerColors,[5]);
            assert.equal(shared.hatPixels,9216,JSON.stringify(shared));assert.equal(shared.playerPixels,9216,JSON.stringify(shared));
            assert.deepEqual(separate.hatColors,[7]);assert.deepEqual(separate.playerColors,[5]);
            assert.equal(separate.hatPixels,9216);assert.equal(separate.playerPixels,9216);
            assert.equal(erased.hatPixels,0);assert.equal(erased.playerPixels,9216);assert.deepEqual(erased.masks,[0,1024]);
            const palette = await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.getBlocksXML().map(c=>c.xml||'').join(''));
            for (const opcode of ['createImage','cloneImage','imageProperty','mutateImage','imagePixel','setImagePixel','drawImage','spawnImageSprite']) assert.ok(palette.includes('arcade_'+opcode),opcode);
        } else {
        assert.equal(shared.same,true);assert.deepEqual(shared.hatColors,[2]);assert.deepEqual(shared.playerColors,[2]);
        assert.equal(shared.hatPixels,9216,JSON.stringify(shared));assert.equal(shared.playerPixels,9216,JSON.stringify(shared));
        assert.equal(separate.same,false);assert.deepEqual(separate.hatColors,[7]);assert.deepEqual(separate.playerColors,[2]);
        assert.equal(separate.playerPixels,9216);assert.equal(separate.hatPixels,9);
        assert.equal(erased.same,true);assert.deepEqual(erased.masks,[0,0]);assert.equal(erased.hatPixels,0);assert.equal(erased.playerPixels,0);
        }
        sharedImages={shared,separate,erased};
    }
    assert.deepEqual(errors, []);
    await page.screenshot({path: join(root, 'test-results/arcade-speech-controller.png')});
    console.log(JSON.stringify({case: 'pinned hat overlap speech', sourceExtension: sourceMode,
        before, afterController, background, flags, images, pixels, sharedImages, creationOrder, creationRegistration, imageProjectiles, imageBlits, functionReturns, spriteReturns, backgroundImages, referenceArrays, ...rendered}));
} finally {
    await browser.close(); await new Promise(done => server.close(done));
}

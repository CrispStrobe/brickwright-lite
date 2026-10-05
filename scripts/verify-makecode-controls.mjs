import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve, extname, normalize} from 'node:path';
import {chromium} from 'playwright';
import {openCodeActions} from './lib-code-actions.mjs';
import {makeCodeSourceHex} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';

const root = resolve(import.meta.dirname, '..');
const build = join(root, 'packages/scratch-gui/build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        const bytes = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
try {
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await openCodeActions(page);
    const input = page.locator('input[type="file"][accept*=".hex"]');
    const vmState = () => page.evaluate(() => {
        const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
        return vm && {device: vm.runtime.bwDeviceId,
            sprites: vm.runtime.targets.filter(t => !t.isStage).map(t => ({name: t.getName(), x: t.x, y: t.y})),
            buttons: vm.runtime.bwArcadeDeviceState?.buttons,
            widgets: vm.runtime.controllerPanel?.getWidgetNames()};
    });
    const importFile = async name => {
        await input.setInputFiles(join(root, 'test/fixtures/makecode', name));
        await page.waitForFunction(name => document.body.innerText.includes(name), name, {timeout: 30000});
    };
    await importFile('arcade-assets.hex');
    await page.evaluate(() => { document.querySelector('[data-testid="bw-code-actions"]').open = false; });
    await page.getByRole('button', {name: /To blocks/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.targets.some(t => t.getName() === 'mySprite'), null, {timeout: 30000});
    await page.evaluate(() => { const vm = window.__brickwrightStore.getState().scratchGui.vm; vm.greenFlag(); });
    await page.evaluate(() => {
        localStorage.setItem('bw-debug-dock', 'arcade');
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-debug-dock', value: 'arcade'}}));
    });
    await page.getByTestId('bw-arcade-up').waitFor({state: 'visible', timeout: 20000});
    const before = await vmState();
    const up = page.getByTestId('bw-arcade-up');
    await up.dispatchEvent('pointerdown', {pointerId: 1});
    await page.waitForTimeout(150);
    await up.dispatchEvent('pointerup', {pointerId: 1});
    await page.waitForTimeout(500);
    const after = await vmState();
    const yOf = (state, name) => state.sprites.find(sprite => sprite.name === name)?.y;
    assert.equal(yOf(after, 'mySprite'), yOf(before, 'mySprite') + 30,
        'Arcade console ▲ did not move the imported player');
    console.log(JSON.stringify({case: 'translated arcade up', before, after, errors}));

    await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        const panel = vm.runtime.controllerPanel;
        panel.addWidget('pad', 'dpad', {}, {x: 24, y: 24});
        panel.setMode('play');
        localStorage.setItem('bw-debug-dock', 'controller');
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-debug-dock', value: 'controller'}}));
    });
    const widget = page.getByTestId('bw-ctl-widget-pad');
    await widget.waitFor({state: 'visible', timeout: 20000});
    await widget.getByRole('button', {name: '▲'}).click();
    await page.waitForTimeout(300);
    const widgetState = await vmState();
    assert.equal(yOf(widgetState, 'mySprite'), yOf(after, 'mySprite') + 30,
        'Controller D-pad widget ▲ did not move the imported player');
    console.log(JSON.stringify({case: 'controller widget arcade up', state: widgetState, errors}));

    await openCodeActions(page);
    await page.getByTestId('bw-makecode-run').click();
    await page.getByTestId('bw-makecode-pane').waitFor({state: 'visible', timeout: 60000});
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-makecode-state"]')?.innerText === 'Running', null, {timeout: 60000});
    let sim;
    for (let i = 0; i < 120 && !sim; i++) {
        sim = page.frames().find(f => f.url().includes('makecode/arcade/sim/simulator.html'));
        if (!sim) await page.waitForTimeout(250);
    }
    if (!sim) throw new Error('Arcade simulator frame did not load');
    const sample = () => sim.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
        const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
        let hash = 0, lit = 0;
        if (d) for (let i = 0; i < d.length; i += 4) {
            const v = d[i] + d[i + 1] + d[i + 2];
            hash = (Math.imul(hash, 33) + v) | 0;
            if (v > 30) lit++;
        }
        return {width: c.width, height: c.height, hash, lit};
    }));
    await sim.locator('canvas').first().waitFor({state: 'attached', timeout: 30000});
    await sim.waitForFunction(() => {
        const c = document.querySelector('canvas');
        if (!c || !c.width) return false;
        const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
        if (!d) return false;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true;
        return false;
    }, null, {timeout: 30000});
    const simBefore = await sample();
    await sim.evaluate(() => {
        window.__bwKeys = [];
        document.body.addEventListener('keydown', e => window.__bwKeys.push({type: e.type, key: e.key}), true);
        document.body.addEventListener('keyup', e => window.__bwKeys.push({type: e.type, key: e.key}), true);
    });
    const board = await sim.evaluate(() => {
        const b = window.pxsim?.board?.();
        return b && {gameplayerKeys: Object.keys(b.gameplayer || {}),
            keymapKeys: Object.keys(b.keymapState || {}), activePlayer: b.activePlayer};
    });
    const originalUp = page.getByTestId('bw-makecode-control-up');
    const buttonStates = () => sim.evaluate(() => {
        const buttons = window.pxsim?.board?.()?.gameplayer?.buttons;
        return buttons && Object.entries(buttons).map(([key, value]) => ({key,
            pressed: value?.pressed, isPressed: value?.isPressed?.(), keys: Object.keys(value || {}).slice(0, 8)}));
    });
    const buttonBefore = await buttonStates();
    const rect = await originalUp.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    const buttonHeld = await buttonStates();
    await page.mouse.up();
    await page.waitForTimeout(400);
    const simAfter = await sample();
    const originalKeys = await sim.evaluate(() => window.__bwKeys);
    assert.deepEqual(originalKeys, [{type: 'keydown', key: 'ArrowUp'}, {type: 'keyup', key: 'ArrowUp'}],
        'MakeCode pane ▲ did not reach the original Arcade simulator');
    assert.ok(simBefore[0]?.lit > 50 && simAfter[0]?.lit > 50,
        'original Arcade game did not paint its screen');
    console.log(JSON.stringify({case: 'original arcade', frame: !!sim, board, before: simBefore, after: simAfter,
        keys: originalKeys, buttonBefore, buttonHeld,
        buttons: sim && await sim.evaluate(() => [...document.querySelectorAll('button,svg [role=button]')].map(x => ({tag: x.tagName, id: x.id, title: x.getAttribute('title'), aria: x.getAttribute('aria-label')})).slice(0, 35)), errors}));
    await page.getByTestId('bw-makecode-widgets-toggle').click();
    const inlinePad = page.getByTestId('bw-makecode-widgets').getByTestId('bw-ctl-widget-pad');
    await inlinePad.waitFor({state: 'visible', timeout: 20000});
    await inlinePad.getByRole('button', {name: '▲'}).click();
    await page.waitForTimeout(200);
    const widgetKeys = await sim.evaluate(() => window.__bwKeys);
    assert.deepEqual(widgetKeys.slice(2), originalKeys,
        'inline Controller D-pad did not reach the original Arcade simulator');
    console.log(JSON.stringify({case: 'original arcade widget up', keys: widgetKeys, errors}));
    await page.screenshot({path: '/tmp/bw-makecode-original-arcade.png'});

    await input.setInputFiles(join(root, 'test/fixtures/makecode/calliope-images.hex'));
    await page.waitForFunction(() => document.body.innerText.includes('Stoppuhr'), null, {timeout: 30000});
    await openCodeActions(page);
    await page.getByTestId('bw-makecode-run').click();
    await page.getByTestId('bw-makecode-pane').waitFor({state: 'visible', timeout: 60000});
    const calliopeState = await page.getByTestId('bw-makecode-state').innerText();
    let calliope;
    for (let i = 0; i < 120 && !calliope; i++) {
        calliope = page.frames().find(f => f.url().includes('makecode/calliopemini/sim/simulator.html'));
        if (!calliope) await page.waitForTimeout(250);
    }
    if (calliope) {
        await calliope.locator('body').waitFor({state: 'attached', timeout: 30000});
        await calliope.evaluate(() => {
            window.__bwKeys = [];
            document.body.addEventListener('keydown', e => window.__bwKeys.push({type: e.type, key: e.key}), true);
            document.body.addEventListener('keyup', e => window.__bwKeys.push({type: e.type, key: e.key}), true);
        });
        await page.getByTestId('bw-makecode-control-a').click();
    }
    console.log(JSON.stringify({case: 'calliope A', state: calliopeState, frame: !!calliope,
        keys: calliope && await calliope.evaluate(() => window.__bwKeys), errors}));
    assert.ok(calliope, 'real Calliope app did not open a simulator frame');
    assert.deepEqual(await calliope.evaluate(() => window.__bwKeys),
        [{type: 'keydown', key: 'a'}, {type: 'keyup', key: 'a'}],
        'MakeCode pane A did not reach the Calliope simulator');

    // This is pinned PXT micro:bit example microbit-96d26b51436a46f3.
    // Its A handler increments the game score and displays it.
    const source = await readFile(join(root, 'test/fixtures/makecode/microbit-button-score.ts'), 'utf8');
    const name = 'microbit-button-score';
    const files = {'main.ts': source,
        'pxt.json': JSON.stringify({name, dependencies: {core: '*', radio: '*', microphone: '*'}, files: ['main.ts']})};
    const hex = makeCodeSourceHex(files, {name, target: 'microbit'});
    await input.setInputFiles({name: `${name}.hex`, mimeType: 'application/octet-stream', buffer: Buffer.from(hex)});
    await page.waitForFunction(() => document.body.innerText.includes('microbit-button-score.hex'), null,
        {timeout: 30000});
    await openCodeActions(page);
    await page.getByTestId('bw-makecode-run').click();
    await page.locator('[data-testid="bw-makecode-pane"][data-target="microbit"]')
        .waitFor({state: 'visible', timeout: 60000}).catch(async error => {
            console.log(JSON.stringify({case: 'microbit launch failure',
                pane: await page.getByTestId('bw-makecode-pane').getAttribute('data-target').catch(() => null),
                text: (await page.locator('body').innerText()).slice(-3500), errors}));
            throw error;
        });
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-makecode-state"]')?.innerText === 'Running',
        null, {timeout: 60000});
    let microbit;
    for (let i = 0; i < 120 && !microbit; i++) {
        microbit = page.frames().find(f => f.url().includes('makecode/microbit/sim/simulator.html'));
        if (!microbit) await page.waitForTimeout(250);
    }
    assert.ok(microbit, 'real micro:bit app did not open a simulator frame');
    await microbit.waitForFunction(() => {
        try { return !!window.pxsim?.board?.()?.ledMatrixState?.image?.data; }
        catch { return false; }
    },
        null, {timeout: 30000});
    const leds = () => microbit.evaluate(() => Array.from(window.pxsim.board().ledMatrixState.image.data));
    const ledBefore = await leds();
    await page.getByTestId('bw-makecode-control-a').click();
    await microbit.waitForFunction(before => {
        const data = window.pxsim?.board?.()?.ledMatrixState?.image?.data;
        return data && Array.from(data).some((v, i) => v !== before[i]);
    }, ledBefore, {timeout: 10000});
    const ledAfter = await leds();
    console.log(JSON.stringify({case: 'microbit corpus A',
        pane: await page.getByTestId('bw-makecode-pane').getAttribute('data-target'),
        ledBefore, ledAfter, errors}));

    // A pinned Arcade source sample contains one stationary taco player.
    // After its one-second speech bubble ends, held ▶ must visibly move it.
    const tacoSource = await readFile(join(root, 'test/fixtures/makecode/arcade-taco-move.ts'), 'utf8');
    const tacoName = 'arcade-taco-move';
    const tacoFiles = {'main.ts': tacoSource,
        'pxt.json': JSON.stringify({name: tacoName, dependencies: {device: '*'}, files: ['main.ts']})};
    const tacoHex = makeCodeSourceHex(tacoFiles,
        {name: tacoName, target: 'arcade', editorUrl: 'https://arcade.makecode.com/'});
    await input.setInputFiles({name: `${tacoName}.hex`, mimeType: 'application/octet-stream', buffer: Buffer.from(tacoHex)});
    await page.waitForFunction(file => document.body.innerText.includes(file), `${tacoName}.hex`, {timeout: 30000});
    await openCodeActions(page);
    await page.getByTestId('bw-makecode-run').click();
    await page.locator('[data-testid="bw-makecode-pane"][data-target="arcade"]')
        .waitFor({state: 'visible', timeout: 60000});
    let taco;
    for (let i = 0; i < 120 && !taco; i++) {
        taco = page.frames().find(f => f.url().includes('makecode/arcade/sim/simulator.html'));
        if (!taco) await page.waitForTimeout(250);
    }
    assert.ok(taco, 'taco Arcade simulator did not open');
    const tacoHash = () => taco.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!data) return null;
        let hash = 0;
        for (let i = 0; i < data.length; i += 4) {
            hash = (Math.imul(hash, 33) + data[i] + data[i + 1] + data[i + 2]) | 0;
        }
        return hash;
    });
    await taco.waitForFunction(() => {
        const c = document.querySelector('canvas');
        const data = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
        return data && data.some((v, i) => i % 4 !== 3 && v > 30);
    }, null, {timeout: 30000});
    await page.waitForTimeout(1800);
    const tacoIdle = await tacoHash();
    await page.waitForTimeout(300);
    const tacoIdle2 = await tacoHash();
    const right = page.getByTestId('bw-makecode-control-right');
    const rightRect = await right.boundingBox();
    await page.mouse.move(rightRect.x + rightRect.width / 2, rightRect.y + rightRect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const tacoMoved = await tacoHash();
    console.log(JSON.stringify({case: 'arcade taco movement', tacoIdle, tacoIdle2, tacoMoved, errors}));
    assert.equal(tacoIdle, tacoIdle2, 'Arcade taco screen was changing without input');
    assert.notEqual(tacoIdle, tacoMoved, 'Arcade taco did not visibly move on ▶');
    if (!await page.getByTestId('bw-makecode-widgets').isVisible()) {
        await page.getByTestId('bw-makecode-widgets-toggle').click();
    }
    const tacoPadRight = page.getByTestId('bw-makecode-widgets').getByRole('button', {name: '►'});
    const tacoRect = await tacoPadRight.boundingBox();
    await page.mouse.move(tacoRect.x + tacoRect.width / 2, tacoRect.y + tacoRect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const tacoWidgetMoved = await tacoHash();
    console.log(JSON.stringify({case: 'arcade taco widget movement', tacoMoved, tacoWidgetMoved, errors}));
    assert.notEqual(tacoMoved, tacoWidgetMoved, 'Arcade taco did not visibly move from Controller widget ▶');

    // This pinned Arcade sample creates unnamed sprites on a timer. The
    // onCreated callback must receive each runtime handle and position it.
    const asteroidSource = await readFile(join(root, 'test/fixtures/makecode/arcade-created-asteroids.ts'), 'utf8');
    const asteroidName = 'arcade-created-asteroids';
    const asteroidFiles = {'main.ts': asteroidSource,
        'pxt.json': JSON.stringify({name: asteroidName, dependencies: {device: '*'}, files: ['main.ts']})};
    const asteroidHex = makeCodeSourceHex(asteroidFiles,
        {name: asteroidName, target: 'arcade', editorUrl: 'https://arcade.makecode.com/'});
    await input.setInputFiles({name: `${asteroidName}.hex`, mimeType: 'application/octet-stream',
        buffer: Buffer.from(asteroidHex)});
    await page.waitForFunction(file => document.body.innerText.includes(file), `${asteroidName}.hex`,
        {timeout: 30000});
    await openCodeActions(page);
    await page.getByRole('button', {name: /To blocks/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.targets
        .some(target => target.getName() === '__arcadeTemplate1'), null, {timeout: 30000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
        return Object.values(vm?.runtime?.bwArcadeDeviceState?.sprites || {})
            .some(sprite => sprite.kind === 'Asteroid' && sprite.id &&
                (sprite.x !== 80 || sprite.y !== 60) && sprite.costume >= 1);
    }, null, {timeout: 12000});
    const asteroids = await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        return Object.values(vm.runtime.bwArcadeDeviceState?.sprites || {})
            .filter(sprite => sprite.kind === 'Asteroid' && sprite.id)
            .map(sprite => ({id: sprite.id, x: sprite.x, y: sprite.y, costume: sprite.costume,
                costumeCount: vm.runtime.bwArcadeDeviceState.spriteTargets[sprite.id]?.sprite?.costumes?.length}));
    });
    assert.ok(asteroids.every(sprite => sprite.x >= 0 && sprite.x <= 160 &&
        sprite.y >= 0 && sprite.y <= 120 && sprite.costume >= 1 && sprite.costume <= 2 &&
        sprite.costumeCount === 3), 'onCreated did not position and paint the imported asteroids');
    console.log(JSON.stringify({case: 'imported asteroid creation callback', asteroids, errors}));

    const fireSource = await readFile(join(root, 'test/fixtures/makecode/arcade-fire-overlap.ts'), 'utf8');
    const fireName = 'arcade-fire-overlap';
    const fireFiles = {'main.ts': fireSource,
        'pxt.json': JSON.stringify({name: fireName, dependencies: {device: '*'}, files: ['main.ts']})};
    const fireHex = makeCodeSourceHex(fireFiles,
        {name: fireName, target: 'arcade', editorUrl: 'https://arcade.makecode.com/'});
    await input.setInputFiles({name: `${fireName}.hex`, mimeType: 'application/octet-stream',
        buffer: Buffer.from(fireHex)});
    await page.waitForFunction(file => document.body.innerText.includes(file), `${fireName}.hex`,
        {timeout: 30000});
    await openCodeActions(page);
    await page.getByRole('button', {name: /To blocks/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.targets
        .some(target => target.getName() === '__arcadeTemplate2'), null, {timeout: 30000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime
        ?.bwArcadeDeviceState?.countdownActive === true, null, {timeout: 3000});
    await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        vm.postIOData('keyboard', {key: ' ', isDown: true});
        vm.postIOData('keyboard', {key: ' ', isDown: false});
    });
    const fireState = () => page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        const sprites = Object.values(vm.runtime.bwArcadeDeviceState?.sprites || {});
        const variables = vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
        return {player: sprites.find(sprite => sprite.kind === 'Player' && sprite.id),
            fires: sprites.filter(sprite => sprite.kind === 'FireSource' && sprite.id),
            lives: variables.find(variable => variable.name === 'lives')?.value,
            countdownActive: vm.runtime.bwArcadeDeviceState?.countdownActive};
    });
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
        const sprites = Object.values(vm?.runtime?.bwArcadeDeviceState?.sprites || {});
        return sprites.some(sprite => sprite.kind === 'Player' && sprite.id) &&
            sprites.some(sprite => sprite.kind === 'FireSource' && sprite.id &&
                (sprite.x !== 80 || sprite.y !== 60));
    }, null, {timeout: 12000});
    const fireBefore = await fireState();
    assert.equal(fireBefore.countdownActive, false, 'A did not stop the imported countdown');
    await page.evaluate(() => {
        const panel = window.__brickwrightStore.getState().scratchGui.vm.runtime.controllerPanel;
        panel.addWidget('fire-pad', 'dpad', {}, {x: 24, y: 24});
        panel.setMode('play');
        localStorage.setItem('bw-debug-dock', 'controller');
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-debug-dock', value: 'controller'}}));
    });
    const firePad = page.getByTestId('bw-ctl-widget-fire-pad').getByRole('button', {name: '►'});
    await firePad.waitFor({state: 'visible', timeout: 20000});
    const fireRect = await firePad.boundingBox();
    await page.mouse.move(fireRect.x + fireRect.width / 2, fireRect.y + fireRect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    const fireSteered = await fireState();
    assert.ok(fireSteered.player.x > fireBefore.player.x,
        'Controller widget did not steer the imported handle-valued player');
    const collisionId = fireSteered.fires[0]?.id;
    assert.ok(collisionId, 'timed fire sprite did not spawn');
    await page.evaluate(id => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        const state = vm.runtime.bwArcadeDeviceState;
        const player = Object.values(state.sprites).find(sprite => sprite.kind === 'Player' && sprite.id);
        state.sprites[id].x = player.x;
        state.sprites[id].y = player.y;
    }, collisionId);
    await page.waitForFunction(({id, lives}) => {
        const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
        const variables = vm?.runtime?.targets.flatMap(target => Object.values(target.variables || {})) || [];
        return !vm?.runtime?.bwArcadeDeviceState?.sprites?.[id] &&
            Number(variables.find(variable => variable.name === 'lives')?.value) > Number(lives);
    }, {id: collisionId, lives: fireSteered.lives}, {timeout: 5000});
    console.log(JSON.stringify({case: 'imported fire handles and overlap', before: fireBefore,
        steered: fireSteered, after: await fireState(), collisionId, errors}));

    const projectileSource = await readFile(join(root, 'test/fixtures/makecode/arcade-side-projectile.ts'), 'utf8');
    const projectileName = 'arcade-side-projectile';
    const projectileFiles = {'main.ts': projectileSource,
        'pxt.json': JSON.stringify({name: projectileName, dependencies: {device: '*'}, files: ['main.ts']})};
    const projectileHex = makeCodeSourceHex(projectileFiles,
        {name: projectileName, target: 'arcade', editorUrl: 'https://arcade.makecode.com/'});
    await input.setInputFiles({name: `${projectileName}.hex`, mimeType: 'application/octet-stream',
        buffer: Buffer.from(projectileHex)});
    await page.waitForFunction(file => document.body.innerText.includes(file), `${projectileName}.hex`,
        {timeout: 30000});
    await openCodeActions(page);
    await page.getByRole('button', {name: /To blocks/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.targets
        .some(target => Object.values(target.blocks?._blocks || {})
            .some(block => block.opcode === 'arcade_setSpriteAutoDestroy')), null, {timeout: 30000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    await page.waitForFunction(() => {
        const state = window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.bwArcadeDeviceState;
        return Object.values(state?.sprites || {}).some(sprite => sprite.kind === 'Projectile' &&
            sprite.id && sprite.y === 10 && sprite.vx === 40 && sprite.autoDestroy);
    }, null, {timeout: 4000}).catch(async error => {
        console.log(JSON.stringify({case: 'side projectile diagnosis', state: await page.evaluate(() => {
            const vm = window.__brickwrightStore?.getState()?.scratchGui?.vm;
            const state = vm?.runtime?.bwArcadeDeviceState;
            return {arcade: state && {sprites: state.sprites, nextSpriteId: state.nextSpriteId},
                targets: vm?.runtime?.targets?.map(target => target.getName())};
        }), errors}));
        throw error;
    });
    const projectileId = await page.evaluate(() => {
        const state = window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState;
        return Object.values(state.sprites).find(sprite => sprite.kind === 'Projectile' && sprite.id)?.id;
    });
    assert.ok(projectileId, 'imported projectile has no handle');
    await page.waitForFunction(id => {
        const state = window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.bwArcadeDeviceState;
        return state?.nextSpriteId >= 1 && !state.sprites?.[id];
    }, projectileId, {timeout: 8000});
    console.log(JSON.stringify({case: 'imported side projectile and auto destruction', projectileId, errors}));

    const consoleSource = await readFile(join(root, 'test/fixtures/makecode/arcade-console-log.ts'), 'utf8');
    const consoleName = 'arcade-console-log';
    const consoleFiles = {'main.ts': consoleSource,
        'pxt.json': JSON.stringify({name: consoleName, dependencies: {device: '*'}, files: ['main.ts']})};
    const consoleHex = makeCodeSourceHex(consoleFiles,
        {name: consoleName, target: 'arcade', editorUrl: 'https://arcade.makecode.com/'});
    await input.setInputFiles({name: `${consoleName}.hex`, mimeType: 'application/octet-stream',
        buffer: Buffer.from(consoleHex)});
    await page.waitForFunction(file => document.body.innerText.includes(file), `${consoleName}.hex`,
        {timeout: 30000});
    await openCodeActions(page);
    await page.getByRole('button', {name: /To blocks/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.targets
        .some(target => Object.values(target.blocks?._blocks || {})
            .some(block => block.opcode === 'arcade_log')), null, {timeout: 30000});
    await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        vm.greenFlag();
        localStorage.setItem('bw-debug-dock', 'arcade');
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-debug-dock', value: 'arcade'}}));
    });
    await page.getByTestId('bw-arcade-serial').waitFor({state: 'visible', timeout: 5000});
    assert.equal((await page.getByTestId('bw-arcade-serial').innerText()).trimEnd(), 'Hello World!\nmsg sent!');
    console.log(JSON.stringify({case: 'imported Arcade serial log', errors}));

    const backgroundSource = await readFile(join(root,
        'test/fixtures/makecode/arcade-random-background.ts'), 'utf8');
    const backgroundName = 'arcade-random-background';
    const backgroundFiles = {'main.ts': backgroundSource,
        'pxt.json': JSON.stringify({name: backgroundName, dependencies: {device: '*'}, files: ['main.ts']})};
    const backgroundHex = makeCodeSourceHex(backgroundFiles,
        {name: backgroundName, target: 'arcade', editorUrl: 'https://arcade.makecode.com/'});
    await input.setInputFiles({name: `${backgroundName}.hex`, mimeType: 'application/octet-stream',
        buffer: Buffer.from(backgroundHex)});
    await page.waitForFunction(file => document.body.innerText.includes(file), `${backgroundName}.hex`,
        {timeout: 30000});
    await openCodeActions(page);
    await page.getByRole('button', {name: /To blocks/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.targets
        .some(target => target.getName() === 'background' && target.sprite.costumes.length === 15),
    null, {timeout: 30000});
    const background = await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        vm.greenFlag();
        for (let i = 0; i < 5; i++) vm.runtime._step();
        const target = vm.runtime.targets.find(item => item.getName() === 'background');
        return {costumes: target.sprite.costumes.length, selected: target.currentCostume,
            visible: target.visible};
    });
    assert.equal(background.costumes, 15);
    assert.ok(background.selected >= 0 && background.selected < 15 && background.visible);
    console.log(JSON.stringify({case: 'imported random Arcade background', background, errors}));
    assert.deepEqual(errors, [], 'browser page errors');
    console.log('MakeCode and Arcade controller paths verified in the browser.');
} finally { await browser.close(); server.close(); }

#!/usr/bin/env node
// Real Code -> Blocks -> controller -> restart -> export/file reimport journey.
// VM access below observes state/renderer only; it does not install or steer code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {MULTIPLAYER_MOVEMENT_SOURCE} from '../test/fixtures/arcade-multiplayer-movement.mjs';
import {MULTIPLAYER_PLAYERS_SOURCE} from '../test/fixtures/arcade-multiplayer-players.mjs';
import {ARRAY_PICK_RANDOM_SOURCE} from '../test/fixtures/arcade-array-pick-random.mjs';
import {NAMESPACE_AUGMENTATION_SOURCE} from '../test/fixtures/arcade-namespace-augmentation.mjs';
import {STATIC_CALLBACK_SOURCE} from '../test/fixtures/arcade-static-callback-helpers.mjs';
import {TYPED_HELPER_SOURCE} from '../test/fixtures/arcade-typed-helper.mjs';
import {MULTIFILE_ARCADE_FILES} from '../test/fixtures/arcade-multifile-source.mjs';
import {DESTROY_KIND_CONTROLLER_SOURCE} from '../test/fixtures/arcade-destroy-kind.mjs';
import {DISCARDED_PROJECTILE_SOURCE} from '../test/fixtures/arcade-discarded-projectiles.mjs';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {ROTATION_CONTROLLER_SOURCE, ROTATION_CONTROLLER_INITIAL_PIXELS} from '../test/fixtures/arcade-rotation-controller.mjs';

const imported = arcadeToPseudocode(ROTATION_CONTROLLER_SOURCE);
assert.deepEqual(imported.unsupported, [], 'fixture imports without named gaps');
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const out = path.resolve(option('--out') || process.env.BW_ROTATION_REPORT ||
    'test-results/arcade-rotation-browser-current.json');
await fs.mkdir(path.dirname(out), {recursive: true});
const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const report = {generatedAt: new Date().toISOString(),
    authoring: 'visible Code entry → To blocks → controller → Stop/restart → From blocks → Arcade download → file reimport',
    unsupported: imported.unsupported, skinBoundary: 'visible renderer skin only; transient allocation boundedness is covered by rotation-viewport runtime tests',
    samples: [], errors: [], consoleErrors: [], failedRequests: []};
let page;
try {
    page = await browser.newPage({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.consoleErrors.push(message.text()); });
    page.on('requestfailed', request => report.failedRequests.push({url: request.url(), reason: request.failure()?.errorText}));
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'arcade');
    });
    await page.goto(process.env.BW_BASE_URL || process.env.PROOF_URL || 'http://127.0.0.1:8620/',
        {waitUntil: 'domcontentloaded', timeout: 90000});
    report.pageScripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
    if (process.env.BW_EXPECT_GUI_BUNDLE) assert.ok(report.pageScripts.some(src => src.endsWith(process.env.BW_EXPECT_GUI_BUNDLE)),
        'browser must load the qualified production GUI bundle');
    await page.waitForFunction(() => Boolean(window.__brickwrightStore?.getState()?.scratchGui?.vm),
        null, {timeout: 60000});
    await page.evaluate(() => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        window.__bwRotationObservation = {blockErrors: [], diagnostics: []};
        runtime.on('BLOCKS_ERROR', error => window.__bwRotationObservation.blockErrors.push(String(error)));
        runtime.on('ARCADE_RUNTIME_DIAGNOSTIC', issue => window.__bwRotationObservation.diagnostics.push(issue));
    });
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const editor = page.locator('[data-testid="bw-code-editor"] .cm-content');
    await editor.waitFor({state: 'visible', timeout: 30000});
    await page.getByTestId('bw-device-select').selectOption('arcade');
    // Retargeting applies its existing buffer asynchronously before publishing
    // the selected device; wait for completion before authoring the new game.
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.bwDeviceId === 'arcade',
        null, {timeout: 30000});
    await editor.fill(imported.code);
    const apply = async () => {
        await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
        await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
            .some(target => Object.values(target.blocks._blocks).some(block =>
                block.opcode === 'arcade_setSpriteProperty' &&
                ['rotation', 'rotationDegrees'].includes(block.fields?.PROPERTY?.value))),
        null, {timeout: 30000});
        await page.getByText('Blocks loaded.', {exact: true}).waitFor({state: 'visible', timeout: 30000});
        await page.waitForFunction(() => {
            const vm = window.__brickwrightStore.getState().scratchGui.vm;
            return vm.extensionManager.isExtensionLoaded('arcade') &&
                typeof vm.runtime._primitives.arcade_createImage === 'function' &&
                typeof vm.runtime._primitives.arcade_setSpriteProperty === 'function';
        }, null, {timeout: 30000});
    };
    await apply();
    // Prove the successful apply survives leaving Code: the editor must actually
    // disappear before using the generated Blocks project's console controls.
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await editor.waitFor({state: 'hidden', timeout: 30000});
    // Select the product's actual console view after DEVICE ARCADE is applied.
    await page.getByTitle('Game Console', {exact: true}).click();
    const flag = page.locator('[class*="green-flag_green-flag"]').first();
    const stop = page.locator('[class*="stop-all_stop-all"]').first();
    const waitPhase = phase => page.waitForFunction(expected => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        return runtime.targets.flatMap(target => Object.values(target.variables)).some(variable =>
            variable.name.replace(/^(?:Game_)+/, '') === 'phase' && variable.value === expected);
    }, phase, {timeout: 30000});
    const observe = () => page.evaluate(palette => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        const variables = Object.fromEntries(runtime.targets.flatMap(target => Object.values(target.variables))
            .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), variable.value]));
        const world = runtime.bwArcadeDeviceState;
        const actor = world?.sprites?.[variables.actor];
        const target = world?.spriteTargets?.[variables.actor];
        const drawable = runtime.renderer._allDrawables[target?.drawableID];
        const skin = drawable?.skin || drawable?._skin;
        runtime.renderer.draw();
        const canvas = runtime.renderer.canvas;
        const copy = document.createElement('canvas');
        copy.width = canvas.width; copy.height = canvas.height;
        const context = copy.getContext('2d');
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
        const rgb = palette.map(colour => colour ? colour.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16)) : null);
        const histogram = Array(16).fill(0);
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) {
            const colour = rgb.findIndex(value => value && value.every((channel, offset) => pixels[index + offset] === channel));
            if (colour >= 0) histogram[colour]++;
            for (let offset = 0; offset < 4; offset++) hash = Math.imul(hash ^ pixels[index + offset], 16777619);
        }
        const paletteScreen = [], offPaletteSamples = [];
        for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) {
            const px = Math.floor((x + 0.5) * copy.width / 160);
            const py = Math.floor((y + 0.5) * copy.height / 120);
            const offset = (py * copy.width + px) * 4;
            const colour = rgb.findIndex(value => value && value.every((channel, i) => pixels[offset + i] === channel));
            paletteScreen.push(colour);
            if (colour < 0) offPaletteSamples.push({x, y, rgba: Array.from(pixels.slice(offset, offset + 4))});
        }
        return {phase: variables.phase, data: actor?.data, rotation: actor?.rotation,
            rotationDegrees: actor?.rotationDegrees, width: actor?.width, height: actor?.height,
            skin: skin?.size ? Array.from(skin.size) : null,
            canvas: [copy.width, copy.height], histogram, hash: hash >>> 0, paletteScreen, offPaletteSamples,
            blockErrors: window.__bwRotationObservation.blockErrors,
            diagnostics: window.__bwRotationObservation.diagnostics};
    }, ARCADE_PALETTE);
    const sample = async (label, phase, data, angle, huge = false) => {
        await waitPhase(phase);
        await page.waitForFunction(expected => {
            const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
            const vars = Object.fromEntries(runtime.targets.flatMap(t => Object.values(t.variables))
                .map(v => [v.name.replace(/^(?:Game_)+/, ''), v.value]));
            return runtime.bwArcadeDeviceState?.sprites?.[vars.actor]?.data === expected;
        }, data, {timeout: 30000});
        // VM assignments finish before the browser decodes the new SVG. Wait
        // for the actual renderer resource, including slow/shared CI hosts.
        await page.waitForFunction(() => {
            const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
            const vars = Object.fromEntries(runtime.targets.flatMap(t => Object.values(t.variables))
                .map(v => [v.name.replace(/^(?:Game_)+/, ''), v.value]));
            const target = runtime.bwArcadeDeviceState?.spriteTargets?.[vars.actor];
            const drawable = runtime.renderer._allDrawables[target?.drawableID];
            const skin = drawable?.skin || drawable?._skin;
            return skin?._svgImageLoaded === true;
        }, null, {timeout: 30000});
        const actual = await observe();
        report.samples.push({label, ...actual});
        assert.deepEqual(actual.blockErrors, [], `${label}: no VM block errors`);
        assert.deepEqual(actual.diagnostics, [], `${label}: no runtime diagnostics`);
        assert.equal(actual.data, data, `${label}: sprite data survives without numeric coercion`);
        assert.ok(Math.abs(actual.rotation - angle) < 1e-9, `${label}: angle`);
        assert.ok(actual.skin && actual.skin[0] <= 640 && actual.skin[1] <= 480,
            `${label}: actual SVG skin fits160×120 palette pixels at4SVG units/pixel`);
        if (huge) {
            assert.ok(actual.width > 10000 && actual.height > 10000, 'logical rotated sprite really is huge');
            assert.ok([2, 5, 9, 7, 8, 10].some(index => actual.histogram[index] > 0), 'huge sprite visibly renders');
        } else {
            for (const colour of [2, 5, 9, 7, 8, 10]) assert.ok(actual.histogram[colour] > 0,
                `${label}: asymmetric source colour${colour} is visible`);
        }
        return actual;
    };
    const press = async name => page.getByTestId(`bw-arcade-${name}`).click();
    await flag.click();
    await page.getByTestId('bw-arcade-a').waitFor({state: 'visible', timeout: 30000});
    const initial = await sample('initial', 0, 'ready', 0);
    const mismatchPixels = initial.paletteScreen.reduce((count, colour, index) =>
        count + Number(colour !== ROTATION_CONTROLLER_INITIAL_PIXELS[index]), 0);
    report.originalPixelComparison = {oracle: 'pinned PXT Arcade4.2.1 full-stage exported fixture',
        pixels: ROTATION_CONTROLLER_INITIAL_PIXELS.length, mismatchPixels};
    assert.equal(mismatchPixels, 0, 'full-stage pixels match original PXT, including footprint outside the rotated bbox');
    assert.deepEqual(initial.offPaletteSamples, [], 'logical pixel centres remain palette colours');
    for (let cycle = 0; cycle < 2; cycle++) {
        await press('a');
        const quarter = await sample(`quarter${cycle}`, 1, 'quarter', Math.PI / 2);
        await press('b');
        const half = await sample(`half${cycle}`, 2, 'half', Math.PI);
        assert.notEqual(quarter.hash, initial.hash, '90degree rotation changes asymmetric visible pixels');
        assert.notEqual(half.hash, initial.hash, '180degree rotation changes asymmetric visible pixels');
        assert.notEqual(quarter.hash, half.hash, 'different angles produce distinct visible arrangements');
        await press('right');
        await sample(`huge${cycle}`, 3, 'huge', 0.6, true);
        await press('down');
        const restored = await sample(`restored${cycle}`, 0, 'ready', 0);
        assert.equal(restored.hash, initial.hash, 'reset restores exact rendered pixels');
    }
    await stop.click();
    await flag.click();
    const restarted = await sample('restarted', 0, 'ready', 0);
    assert.equal(restarted.hash, initial.hash, 'Stop/restart restores exact pixels');
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByRole('button', {name: 'From blocks ⇨', exact: true}).click();
    await page.waitForFunction(() => {
        const element = document.querySelector('[data-testid="bw-code-editor"] .cm-content');
        const code = element?.cmTile?.root?.view?.state?.doc?.toString();
        return code?.includes('rotationDegrees') && code.includes('quarter');
    }, null, {timeout: 30000});
    const decompiled = await editor.evaluate(element => element.cmTile.root.view.state.doc.toString());
    assert.match(decompiled, /\bdata\b/);
    assert.match(decompiled, /4096/);
    const actions = page.getByTestId('bw-code-actions');
    if (!(await actions.getAttribute('open'))) await actions.locator('summary').click();
    const downloaded = page.waitForEvent('download', {timeout: 30000});
    await page.getByTestId('bw-makecode-arcade-export').click();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /\.mkcd$/);
    const downloadedPath = path.join(path.dirname(out), 'arcade-rotation-export.mkcd');
    await download.saveAs(downloadedPath);
    const bytes = await fs.readFile(downloadedPath);
    assert.ok(bytes.length > 100, 'actual exported project downloaded');
    if (!(await actions.getAttribute('open'))) await actions.locator('summary').click();
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'arcade-rotation-export.mkcd', mimeType: 'application/octet-stream', buffer: bytes});
    await page.getByText(/Imported the Arcade game.*arcade-rotation-export\.mkcd/).first()
        .waitFor({state: 'visible', timeout: 30000});
    const reimportedCode = await editor.evaluate(element => element.cmTile.root.view.state.doc.toString());
    assert.match(reimportedCode, /rotationDegrees/);
    assert.doesNotMatch(reimportedCode, /# unsupported/i);
    if (await actions.getAttribute('open')) await actions.locator('summary').click();
    await apply();
    await flag.click();
    const reimported = await sample('reimported', 0, 'ready', 0);
    assert.equal(reimported.hash, initial.hash, 'download/file reimport restores exact initial image');
    await press('a');
    const reimportQuarter = await sample('reimport-quarter', 1, 'quarter', Math.PI / 2);
    assert.equal(reimportQuarter.hash, report.samples.find(s => s.label === 'quarter0').hash,
        'exported/reimported controller rotation preserves pixels');
    report.export = {filename: download.suggestedFilename(), bytes: bytes.length};
    // Creation reporters used as statements must survive the actual native
    // file importer and remain executable consumers in the Blocks workspace.
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const discardedSource = DISCARDED_PROJECTILE_SOURCE.replace('origin.setPosition(40,50)', 'origin.setPosition(80,60)') + `
controller.B.onEvent(ControllerButtonEvent.Pressed, function() {
    sprites.createProjectileFromSprite(img\`7 7 7\n7 7 7\`,origin,0,0)
})`;
    const project = makeCodeProjectFile({'main.ts': discardedSource, 'pxt.json': JSON.stringify({
        name: 'Discarded projectiles', dependencies: {device: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Discarded projectiles'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'discarded-projectiles.mkcd', mimeType: 'application/json', buffer: Buffer.from(project)});
    await page.getByText(/Imported the Arcade game.*discarded-projectiles/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    const oldStage = await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
    await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
    await page.waitForFunction(id => {
        const stage = window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
        return stage && stage.id !== id;
    }, oldStage);
    await page.getByText('Blocks loaded.', {exact: true}).waitFor({state: 'visible'});
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    const count = n => page.waitForFunction(expected => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .flatMap(t => Object.values(t.variables)).some(v => v.name === 'created' && v.value === expected), n);
    await count(3);
    const initialCreation = await page.evaluate(() => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        return {count: Object.values(runtime.bwArcadeDeviceState.sprites).filter(s => s.id).length,
            consumers: runtime.targets.flatMap(t => Object.values(t.blocks._blocks)).filter(b => b.opcode === 'arcade_spawnProjectile').length};
    });
    assert.equal(initialCreation.count, 4);assert.equal(initialCreation.consumers, 4);
    await page.getByTestId('bw-arcade-b').click();await count(4);
    await page.waitForFunction(() => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        runtime.renderer.draw();const canvas = runtime.renderer.canvas, copy = document.createElement('canvas');
        copy.width = canvas.width;copy.height = canvas.height;const ctx = copy.getContext('2d');ctx.drawImage(canvas, 0, 0);
        const rgba = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
        return rgba[0] === 120 && rgba[1] === 220 && rgba[2] === 82;
    });
    report.discardedProjectiles = {nativeFileImport: true, allThreeApis: true, initial: initialCreation,
        controllerCreatesExactlyOnce: true, visibleCenterRgb: [120, 220, 82], sourceNameCollisionsCoveredByUnitRoundtrip: true};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-discarded-projectiles.png'});
    // Import a new native project, then exercise the collection loop through
    // visible Code/Blocks controls and the real controller pane.
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const destructionSource = DESTROY_KIND_CONTROLLER_SOURCE + '\nplayer.setImage(img`7 7 7\n7 7 7`)';
    const destruction = arcadeToPseudocode(destructionSource);
    assert.deepEqual(destruction.unsupported, []);
    assert.ok(destruction.costumes.some(costume => costume.mode === 'add'), 'fixture includes implicit appended artwork');
    const destructionProject = makeCodeProjectFile({'main.ts': destructionSource,
        'pxt.json': JSON.stringify({name: 'Destroy kind', dependencies: {device: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Destroy kind'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'destroy-kind.mkcd', mimeType: 'application/json', buffer: Buffer.from(destructionProject)});
    await page.getByText(/Imported the Arcade game.*destroy-kind/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    const beforeDestructionStage = await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
    await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
    await page.waitForFunction(id => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id && window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id !== id,
        beforeDestructionStage);
    await page.getByText('Blocks loaded.', {exact: true}).waitFor({state: 'visible'});
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    const destructionState = async (live, destroyed) => {
        await page.waitForFunction(({live, destroyed}) => {
            const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
            return Object.values(runtime.bwArcadeDeviceState.sprites).filter(s => s.id).length === live &&
                runtime.targets.flatMap(t => Object.values(t.variables)).some(v => v.name === 'destroyed' && v.value === destroyed);
        }, {live, destroyed});
    };
    await destructionState(2, 0);
    await page.getByTestId('bw-arcade-b').click();await destructionState(1, 1);
    await page.getByTestId('bw-arcade-a').click();await destructionState(2, 1);
    await page.getByTestId('bw-arcade-b').click();await destructionState(1, 2);
    report.destroyKind = {nativeFileImport: true, codeToBlocks: true, controllerCycles: 2, otherKindSurvives: true, callbacks: 2};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-destroy-kind.png'});
    // Applied import artwork belongs to the live project. Pasting a fresh
    // program must not replay uploads addressed to templates it no longer has.
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const snapshotArt = () => page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .filter(t => t.isOriginal).map(t => ({name: t.getName(), costumes: t.sprite.costumes.map(c =>
            ({assetId: c.asset.assetId, bytes: Array.from(c.asset.data)}))})));
    const beforeRepeat = await snapshotArt();
    assert.ok(beforeRepeat.some(target => target.costumes.length > 1), 'native import installed the appended costume');
    const applyArtworkCode = async () => {
        const priorStage = await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
        await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
        await page.waitForFunction(id => {
            const stage = window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
            return stage && stage.id !== id;
        }, priorStage);
        await page.getByText('Blocks loaded.', {exact: true}).waitFor({state: 'visible'});
    };
    await applyArtworkCode();
    assert.deepEqual(await snapshotArt(), beforeRepeat, 'repeat conversion preserves exact imported costume bytes');
    await editor.fill('DEVICE ARCADE\nSPRITE Fresh:\nWHEN flag clicked:\n  set freshValue to 37');
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .flatMap(t => Object.values(t.variables)).some(v => v.name === 'freshValue' && Number(v.value) === 37));
    report.codeArtworkOwnership = {implicitAppendedCostume: true, repeatExactCostumeBytes: true, freshPastedProgramLoadsWithoutStaleUploadWarnings: true};
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const multifileProject = makeCodeProjectFile(MULTIFILE_ARCADE_FILES, {target: 'arcade', name: 'Multi file'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'multifile.mkcd', mimeType: 'application/json', buffer: Buffer.from(multifileProject)});
    await page.getByText(/Imported the Arcade game.*multifile/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    const waitMultifile = expected => page.waitForFunction(expected => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        const values = Object.fromEntries(runtime.targets.flatMap(t => Object.values(t.variables))
            .map(v => [v.name.replace(/^Game_/, ''), Number(v.value)]));
        return Object.entries(expected).every(([name, value]) => values[name] === value);
    }, expected);
    const initialMultifile = {observed: 1243, finalOrder: 1243, first: 6, second: 39, third: 8, actorX: 23, callbackValue: 0};
    await waitMultifile(initialMultifile);
    await page.getByTestId('bw-arcade-b').click();
    await waitMultifile({callbackValue: 43});
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)
        .some(sprite => sprite.id && sprite.x === 43));
    report.multifileSource = {nativeFileImport: true, codeToBlocks: true, initial: initialMultifile,
        controllerValue: 43, controllerMovesSprite: true, unlistedSourceIgnored: true};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-multifile.png'});
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const typedProject = makeCodeProjectFile({'main.ts': TYPED_HELPER_SOURCE,
        'pxt.json': JSON.stringify({name: 'Typed helper', dependencies: {device: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Typed helper'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'typed-helper.mkcd', mimeType: 'application/json', buffer: Buffer.from(typedProject)});
    await page.getByText(/Imported the Arcade game.*typed-helper/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    await waitMultifile({observed: 363, removed: 40, remaining: 3, controllerValue: 0, actorX: 0});
    await page.getByTestId('bw-arcade-b').click();
    await waitMultifile({controllerValue: 120, remaining: 2, actorX: 89.5});
    report.typedHelper = {nativeFileImport: true, codeToBlocks: true, arrayAliasPreserved: true,
        observed: 363, initialLength: 3, controllerShift: 120, remainingLength: 2, spriteX: 89.5};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-typed-helper.png'});
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const callbackProject = makeCodeProjectFile({'main.ts': STATIC_CALLBACK_SOURCE,
        'pxt.json': JSON.stringify({name: 'Callback helpers', dependencies: {device: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Callback helpers'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'callback-helpers.mkcd', mimeType: 'application/json', buffer: Buffer.from(callbackProject)});
    await page.getByText(/Imported the Arcade game.*callback-helpers/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    await waitMultifile({trace: 123, total: 12, recursive: 20, chosen: 12, buttonResult: 0});
    await page.getByTestId('bw-arcade-b').click();
    await waitMultifile({buttonResult: 50});
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)
        .some(sprite => sprite.id && sprite.x === 27));
    report.staticCallbackHelpers = {nativeFileImport: true, codeToBlocks: true, trace: 123, total: 12,
        recursive: 20, chosen: 12, controllerResult: 50, spriteX: 27};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-callback-helpers.png'});
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const namespaceProject = makeCodeProjectFile({'main.ts': NAMESPACE_AUGMENTATION_SOURCE,
        'pxt.json': JSON.stringify({name: 'Namespace augmentation', dependencies: {device: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Namespace augmentation'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'namespace-augmentation.mkcd', mimeType: 'application/json', buffer: Buffer.from(namespaceProject)});
    await page.getByText(/Imported the Arcade game.*namespace-augmentation/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    await waitMultifile({observed: 192, observedScore: 7});
    await page.getByTestId('bw-arcade-b').click();
    await waitMultifile({observed: 197, observedScore: 9});
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)
        .some(sprite => sprite.id && sprite.x === 36));
    report.namespaceAugmentation = {nativeFileImport: true, codeToBlocks: true,
        initialObserved: 192, initialScore: 7, controllerObserved: 197, controllerScore: 9, spriteX: 36};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-namespace-augmentation.png'});
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const randomProject = makeCodeProjectFile({'main.ts': ARRAY_PICK_RANDOM_SOURCE,
        'pxt.json': JSON.stringify({name: 'Array random', dependencies: {device: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Array random'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'array-random.mkcd', mimeType: 'application/json', buffer: Buffer.from(randomProject)});
    await page.getByText(/Imported the Arcade game.*array-random/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    await waitMultifile({calls: 1, pixel: 5, observedX: 41, length: 2, membership: 40});
    await page.getByTestId('bw-arcade-b').click();
    await waitMultifile({observedX: 45});
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)
        .some(sprite => sprite.id && sprite.x === 45));
    report.arrayPickRandom = {nativeFileImport: true, codeToBlocks: true, calls: 1, pixel: 5,
        nestedArrayLength: 2, membershipChecks: 40, initialSpriteX: 41, controllerSpriteX: 45};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-array-random.png'});
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const multiplayerProject = makeCodeProjectFile({'main.ts': MULTIPLAYER_PLAYERS_SOURCE,
        'pxt.json': JSON.stringify({name: 'Multiplayer players', dependencies: {device: '*', multiplayer: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Multiplayer players'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'multiplayer-players.mkcd', mimeType: 'application/json', buffer: Buffer.from(multiplayerProject)});
    await page.getByText(/Imported the Arcade game.*multiplayer-players/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    await waitMultifile({count: 4, number: 3, index: 1, fourth: 4, copied: 4, restored: 1});
    const playerBefore = await page.evaluate(() => {
        const vars=window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
        return vars.find(v=>v.name.replace(/^Game_/,'')==='observedX').value;
    });
    await page.getByTestId('bw-arcade-b').click();
    await waitMultifile({observedX: playerBefore + 5});
    await page.waitForFunction(x => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)
        .some(sprite => sprite.id && sprite.x === x), playerBefore + 5);
    report.multiplayerPlayers = {nativeFileImport: true, codeToBlocks: true, count: 4,
        number: 3, index: 1, copiedArrayLength: 4, initialSpriteX: playerBefore, controllerSpriteX: playerBefore + 5,
        boundary: 'Controller B runs a callback using player sprite lookup; mp.moveWithButtons is not implemented by this journey'};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-multiplayer-players.png'});
    await stop.click();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const movementProject = makeCodeProjectFile({'main.ts': MULTIPLAYER_MOVEMENT_SOURCE,
        'pxt.json': JSON.stringify({name: 'Multiplayer movement', dependencies: {device: '*', multiplayer: '*'}, files: ['main.ts']})},
    {target: 'arcade', name: 'Multiplayer movement'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'multiplayer-movement.mkcd', mimeType: 'application/json', buffer: Buffer.from(movementProject)});
    await page.getByText(/Imported the Arcade game.*multiplayer-movement/).first().waitFor({state: 'visible'});
    assert.doesNotMatch(await editor.evaluate(element => element.cmTile.root.view.state.doc.toString()), /# unsupported/i);
    await applyArtworkCode();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await flag.click();
    const playerSelect = page.getByTestId('bw-arcade-player');
    const movementState = () => page.evaluate(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)
        .map(sprite => ({x: sprite.x, vx: sprite.vx})));
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites).length === 3);
    await playerSelect.selectOption('2');
    const right = page.getByTestId('bw-arcade-right');
    const holdRight = async () => {await right.hover();await page.mouse.down();};
    const waitMoving = index => page.waitForFunction(index => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)[index].vx === 60,index);
    await holdRight();await waitMoving(1);
    const separate = await movementState();assert.equal(separate[0].vx,0);assert.equal(separate[2].vx,0);
    // Changing controller releases buttons held on the previous controller.
    await playerSelect.selectOption('1');await page.mouse.up();
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)[1].vx === 0);
    await page.getByTestId('bw-arcade-b').click();
    await page.waitForFunction(() => {
        const state=window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState;
        return state.controlledSprites[2][0].sprite === Object.values(state.sprites)[2];
    });
    await playerSelect.selectOption('2');await holdRight();await waitMoving(2);
    const rebound = await movementState();assert.equal(rebound[0].vx,0);assert.equal(rebound[1].vx,0);
    await page.mouse.up();
    await page.waitForFunction(() => Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites)[2].vx === 0);
    report.multiplayerMovement = {nativeFileImport: true, codeToBlocks: true, selectedPlayer: 2,
        independentSpeed: 60, otherPlayersStationary: true, releasedOnSelectionChange: true,
        reboundToReplacement: true, releasedOnPointerUp: true};
    await page.screenshot({path: out.replace(/\.json$/, '') + '-multiplayer-movement.png'});
    await playerSelect.selectOption('1');
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.consoleErrors.filter(message =>
        /Workspace Update Error|Extension ["']arcade["'] did not load|Built-in extension arcade failed/.test(message)),
    [], 'Blocks workspace and Arcade loader report no failures');
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.failure = error.stack || String(error);
    if (page) {
        report.failureUrl = page.url();
        report.failureRuntime = await page.evaluate(() => {
            const runtime = window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime;
            return {variables: runtime?.targets.flatMap(t => Object.values(t.variables))
                .map(v => ({name: v.name, value: v.value})),
                sprites: Object.entries(runtime?.bwArcadeDeviceState?.sprites || {})
                    .map(([id, s]) => ({id, data: s.data, rotation: s.rotation, width: s.width, height: s.height})),
                observation: window.__bwRotationObservation, device: runtime?.bwDeviceId,
                loadedExtensions: Array.from(window.__brickwrightStore?.getState()?.scratchGui?.vm?.extensionManager?._loadedExtensions?.keys() || []),
                pendingExtensions: Array.from(window.__brickwrightStore?.getState()?.scratchGui?.vm?.extensionManager?._pendingBuiltinLoads?.keys() || []),
                stepping: Boolean(runtime?._steppingInterval), vmStatus: window.__brickwrightStore?.getState()?.scratchGui?.vmStatus,
                threads: runtime?.threads.map(t => ({status: t.status, stack: t.stack})),
                primitives: ['arcade_createImage', 'arcade_setSpriteProperty', 'arcade_createImageSprite']
                    .map(op => [op, typeof runtime?._primitives?.[op]]),
                targets: runtime?.targets.map(t => ({name: t.getName(), isOriginal: t.isOriginal,
                    hats: Object.values(t.blocks._blocks).filter(b => b.topLevel)
                        .map(b => ({id:b.id, opcode:b.opcode, next:b.next}))}))};
        }).catch(error => ({error: String(error)}));
        report.failureText = (await page.locator('body').innerText().catch(() => '')).slice(-12000);
        await page.screenshot({path: out.replace(/\.json$/, '') + '-failure.png'}).catch(() => {});
    }
    throw error;
} finally {
    await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
    console.log(JSON.stringify({status: report.status, samples: report.samples.length, report: path.basename(out)}));
}

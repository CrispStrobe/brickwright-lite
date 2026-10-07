#!/usr/bin/env node
// Real Code -> Blocks -> controller -> restart -> export/file reimport journey.
// VM access below observes state/renderer only; it does not install or steer code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {ROTATION_CONTROLLER_SOURCE} from '../test/fixtures/arcade-rotation-controller.mjs';

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
        return {phase: variables.phase, data: actor?.data, rotation: actor?.rotation,
            rotationDegrees: actor?.rotationDegrees, width: actor?.width, height: actor?.height,
            skin: skin?.size ? Array.from(skin.size) : null,
            canvas: [copy.width, copy.height], histogram, hash: hash >>> 0,
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
        await page.waitForTimeout(100);
        const actual = await observe();
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
        report.samples.push({label, ...actual});
        return actual;
    };
    const press = async name => page.getByTestId(`bw-arcade-${name}`).click();
    await flag.click();
    await page.getByTestId('bw-arcade-a').waitFor({state: 'visible', timeout: 30000});
    const initial = await sample('initial', 0, 'ready', 0);
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
    assert.match(download.suggestedFilename(), /\.hex$/);
    const downloadedPath = path.join(path.dirname(out), 'arcade-rotation-export.hex');
    await download.saveAs(downloadedPath);
    const bytes = await fs.readFile(downloadedPath);
    assert.ok(bytes.length > 100, 'actual exported project downloaded');
    if (!(await actions.getAttribute('open'))) await actions.locator('summary').click();
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'arcade-rotation-export.hex', mimeType: 'application/octet-stream', buffer: bytes});
    await page.getByText(/Imported the Arcade game.*arcade-rotation-export\.hex/).first()
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
    assert.deepEqual(report.errors, []);
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

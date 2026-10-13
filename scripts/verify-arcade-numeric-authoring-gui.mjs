#!/usr/bin/env node
// Actual full IDE controls only. Blockly/VM access observes, never mutates.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {openCodeActions} from './lib-code-actions.mjs';
import {makeCodeProjectFile, readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {runPxtArcade} from '../test/helpers/pxt-arcade-runtime.mjs';
import {numericAuthoringFiles, numericSample} from '../test/fixtures/arcade-numeric-authoring-game.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const base = process.env.PROOF_URL;
assert.ok(base, 'PROOF_URL must identify the admitted full production build');
assert.ok(process.env.BW_GUI_BUILD_RECEIPT, 'An admitted exact-source official build receipt is required');
assert.ok(process.env.BW_GUI_BUILD_ARCHIVE, 'The sole already acquired official archive is required');
const receipt = JSON.parse(await readFile(process.env.BW_GUI_BUILD_RECEIPT, 'utf8'));
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const pins = JSON.parse(await readFile(path.join(root, 'vendor-pins.json'), 'utf8'));
assert.equal(receipt.sourceSha, source, 'Harness and admitted build must use the exact reviewed source');
assert.equal(receipt.producerSha, pins['sb3-creator']);
assert.equal(receipt.arraysValuesSha, pins['arrays-values']);
assert.equal(receipt.sdk.version, '4.2.1');
assert.equal(receipt.sdk.pxtVersion, '13.2.1');
assert.equal(receipt.sdk.targetCommit, '2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea');
const sdkRoot = path.join(root, 'packages/scratch-gui/static/makecode/arcade');
const targetBytes = await readFile(path.join(sdkRoot, 'target.json'));
const sdkVersions = JSON.parse(targetBytes).versions;
assert.equal(sdkVersions.target, receipt.sdk.version);
assert.equal(sdkVersions.pxt, receipt.sdk.pxtVersion);
assert.equal(sdkVersions.commits, `https://github.com/microsoft/pxt-arcade/commits/${receipt.sdk.targetCommit}`);
assert.equal(digest(targetBytes), receipt.sdk.targetSha256, 'Original comparison SDK target must match admitted production SDK');
assert.equal(digest(await readFile(path.join(sdkRoot, 'pxtworker.js'))), receipt.sdk.workerSha256);
assert.equal(receipt.build.conclusion, 'success');
assert.equal(receipt.build.checkoutSha, source);
for (const key of ['runId', 'jobId', 'artifactId']) assert.match(String(receipt.build[key]), /^\d+$/);
assert.equal(receipt.build.runUrl, `https://github.com/CrispStrobe/brickwright-lite/actions/runs/${receipt.build.runId}`);
assert.equal(digest(await readFile(process.env.BW_GUI_BUILD_ARCHIVE)), receipt.build.archiveSha256);
assert.ok(Object.keys(receipt.assets).length, 'Receipt must inventory the actual extracted build assets');
const out = path.resolve(process.env.BW_NUMERIC_GUI_REPORT_DIR || 'test-results/arcade-numeric-authoring-gui');
await mkdir(out, {recursive: true});
const report = {status: 'running', source, receipt, journeys: [], samples: [], original: [], pageErrors: [], bundleObservations: [],
    boundary: 'Owned numeric/settings/source-loop authoring only. Random values are bounded, not seeded or compared across independent runs. Script preparation is not GUI qualification.'};
const browser = await chromium.launch(process.env.BW_BROWSER ? {executablePath: process.env.BW_BROWSER} : {});
let page;
const bodyChecks = [];
const editor = () => page.getByTestId('bw-code-editor').locator('.cm-content');
const codeTab = async () => { await page.getByRole('tab', {name: 'Code', exact: true}).click(); await editor().waitFor({state: 'visible'}); };
const readCode = () => editor().evaluate(element => element.cmTile.root.view.state.doc.toString());
const fresh = async () => {
    const context = await browser.newContext({viewport: {width: 1600, height: 1100}, acceptDownloads: true});
    const tab = await context.newPage();
    tab.on('dialog', dialog => dialog.accept());
    tab.on('pageerror', error => report.pageErrors.push(error.message));
    tab.on('response', response => {
        const url = new URL(response.url()), prefix = new URL(base);
        if (url.origin !== prefix.origin || !(/\.js$/.test(url.pathname) || /\/makecode\/arcade\/target\.json$/.test(url.pathname))) return;
        bodyChecks.push((async () => {
            const name = decodeURIComponent(url.pathname.slice(prefix.pathname.endsWith('/') ? prefix.pathname.length : prefix.pathname.lastIndexOf('/') + 1));
            const sha256 = digest(await response.body());
            assert.equal(sha256, receipt.assets[name], `Actual served production JS ${name} must match admitted artifact`);
            report.bundleObservations.push({name, sha256});
        })().catch(error => { (report.bundleFailures ||= []).push(String(error)); }));
    });
    await tab.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('bw-starter-v1-complete', '1'); localStorage.setItem('bw-right-pane-hidden', '0'); });
    await tab.goto(base, {waitUntil: 'domcontentloaded', timeout: 90000});
    await tab.waitForFunction(() => !!window.__brickwrightStore?.getState()?.scratchGui?.vm, null, {timeout: 60000});
    await tab.evaluate(() => { window.__bwNumericErrors = []; window.__brickwrightStore.getState().scratchGui.vm.runtime.on('BLOCKS_ERROR', error => window.__bwNumericErrors.push(String(error))); });
    return tab;
};
const apply = async () => {
    const prior = await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id);
    await page.getByRole('button', {name: /To blocks/}).first().click();
    await page.waitForFunction(id => { const next = window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id; return Boolean(next && next !== id); }, prior);
    await page.getByText('Blocks loaded.', {exact: true}).waitFor();
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await page.waitForFunction(() => window.Blockly?.getMainWorkspace()?.getAllBlocks(false).some(block => block.type === 'arcade_clampNumber'));
};
const openFile = async file => {
    await codeTab(); await openCodeActions(page);
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles(file);
    await page.getByText(/Imported the Arcade game/).first().waitFor({timeout: 60000});
    assert.doesNotMatch(await page.getByTestId('bw-code-status').innerText(), /unsupported|not translated|could not|partial/i);
    assert.doesNotMatch(await readCode(), /# unsupported:/);
};
const fieldInfo = spec => page.evaluate(({opcode, input, value}) => {
    const workspace = window.Blockly.getMainWorkspace();
    const block = workspace.getAllBlocks(false).find(block => block.type === opcode && (value === undefined || block.getInputTargetBlock(input)?.getDescendants(false).some(node => node.inputList.flatMap(i => i.fieldRow).some(f => String(f.getValue()) === value))));
    const child = block?.getInputTargetBlock(input);
    const candidates = [];
    const walk = node => { if (!node) return; for (const input of node.inputList) for (const field of input.fieldRow) if (field.name) candidates.push({node, field}); for (const next of node.getChildren(false)) walk(next); };
    walk(child);
    const selected = candidates.find(({field}) => value === undefined || String(field.getValue()) === value);
    const field = selected?.field;
    if (!field) throw new Error(`Missing ${opcode}.${input} field`);
    const rect = field.getSvgRoot().getBoundingClientRect(), svg = workspace.getParentSvg().getBoundingClientRect();
    return {id: selected.node.id, name: field.name, value: field.getValue(), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, left: svg.left + workspace.getMetrics().absoluteLeft, right: svg.right, top: svg.top};
}, spec);
const reachField = async spec => {
    const field = await fieldInfo(spec), center = {x: (field.left + field.right) / 2, y: field.top + 160};
    await page.mouse.move(center.x, center.y); await page.mouse.wheel(field.x - center.x, field.y - center.y);
    await page.waitForFunction(({id, name}) => {
        const block = window.Blockly.getMainWorkspace().getBlockById(id), field = block?.getField(name), rect = field?.getSvgRoot().getBoundingClientRect();
        return Boolean(rect && block.getSvgRoot().contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)));
    }, field);
    return fieldInfo(spec);
};
const editNumber = async (spec, value) => {
    const field = await reachField(spec); await page.mouse.click(field.x, field.y);
    const input = page.locator('input.blocklyHtmlInput'); await input.waitFor({state: 'visible'}); await input.fill(String(value)); await input.press('Enter');
    await page.waitForFunction(({id, name, value}) => String(window.Blockly.getMainWorkspace().getBlockById(id)?.getFieldValue(name)) === value, {...field, value: String(value)});
};
const editMenu = async (spec, choice, required) => {
    const field = await reachField(spec); await page.mouse.click(field.x, field.y);
    const items = page.getByRole('menuitemcheckbox'); await items.first().waitFor({state: 'visible'});
    const labels = await items.allTextContents(); for (const text of required) assert.ok(labels.includes(text), `${text} is a real visible choice`);
    await page.getByRole('menuitemcheckbox', {name: choice, exact: true}).click();
    await page.waitForFunction(({id, name, choice}) => window.Blockly.getMainWorkspace().getBlockById(id)?.getFieldValue(name) === choice, {...field, choice});
    report.journeys.push({action: 'visible dropdown edit', opcode: spec.opcode, choice, labels});
};
const observe = () => page.evaluate(() => {
    const vm = window.__brickwrightStore.getState().scratchGui.vm;
    const variables = Object.fromEntries(vm.runtime.targets.filter(t => t.isOriginal).flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^(?:Game_)+/, ''), v.value]));
    return {variables, errors: window.__bwNumericErrors};
});
const waitSample = sample => page.waitForFunction(sample => {
    const variables = Object.fromEntries(window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.filter(t => t.isOriginal).flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^(?:Game_)+/, ''), v.value]));
    return Object.entries(sample).every(([key, value]) => variables[key] === value);
}, sample);
const frame = () => page.evaluate(() => {
    const renderer = window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;
    // Read the last presented production canvas; no renderer/VM primitive call.
    const canvas = document.createElement('canvas'); canvas.width = renderer.canvas.width; canvas.height = renderer.canvas.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(renderer.canvas, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data, pixels = [];
    for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) { const i = (Math.floor((y + .5) * canvas.height / 120) * canvas.width + Math.floor((x + .5) * canvas.width / 160)) * 4; pixels.push((rgba[i] + (rgba[i + 1] << 8) + (rgba[i + 2] << 16) + 0xff000000) >>> 0); }
    return pixels;
});
const compareFrame = async original => {
    for (let attempt = 0; attempt < 100; attempt++) { const pixels = await frame(); if (pixels.every((pixel, index) => pixel === original[index])) return digest(Buffer.from(Uint32Array.from(pixels).buffer)); await page.waitForTimeout(100); }
    assert.deepEqual(await frame(), original, 'Actual visible Stage HUD and sprite match the original presentation');
};
const original = async (files, options, pressed) => {
    const sample = numericSample({...options, pressed});
    const source = files['main.ts'];
    const actualName = key => new RegExp(`\\b(?:let|var|const)\\s+((?:Game_)*${key})\\b`).exec(source)?.[1] || key;
    const actualSample = Object.fromEntries(Object.entries(sample).map(([key, value]) => [actualName(key), value]));
    const result = await runPxtArcade(files, {buttonActions: {afterGlobals: {[actualName('ready')]: 1}, steps: pressed ? [{button: 5, held: true, delay: 80}, {button: 5, held: false, delay: 80}] : []}, waitForGlobals: actualSample, inspectDisplay: true, waitForDisplay: true});
    const globals = Object.fromEntries(Object.entries(result).map(([key, value]) => [key.replace(/^(?:Game_)+/, ''), value]));
    for (const [key, value] of Object.entries(sample)) assert.equal(globals[key], value, `original ${key}`);
    assert.ok(globals.noise >= 0 && globals.noise < 1, 'Real entropy is bounded; no equality against another run');
    report.original.push({sample, screenSha256: digest(Buffer.from(Uint32Array.from(result.$display.screen).buffer))}); return result.$display.screen;
};
const cycle = async (label, options, files) => {
    if (!await page.getByTestId('bw-arcade-a').isVisible()) await page.getByTitle('Game Console', {exact: true}).click();
    await page.locator('[class*="green-flag_green-flag"]:visible').first().click();
    await waitSample(numericSample(options)); const initial = await observe();
    assert.deepEqual(initial.errors, []); assert.ok(initial.variables.noise >= 0 && initial.variables.noise < 1);
    const initialFrame = await compareFrame(await original(files, options, false));
    await page.getByTestId('bw-arcade-a').click(); await waitSample(numericSample({...options, pressed: true}));
    const pressedFrame = await compareFrame(await original(files, options, true));
    const pressed = await observe(); assert.deepEqual(pressed.errors, []);
    report.samples.push({label, initial, pressed, initialFrame, pressedFrame}); await page.getByTitle('Stop', {exact: true}).first().click();
};
const paletteCreate = async () => {
    await page.locator('.scratchCategoryId-arcade').click();
    let point;
    for (let attempt = 0; attempt < 80; attempt++) {
        point = await page.evaluate(() => {
            const flyout = window.Blockly.getMainWorkspace().getFlyout().getWorkspace(), block = flyout.getAllBlocks(false).find(b => b.type === 'arcade_clampNumber');
            const rect = block?.getSvgRoot().getBoundingClientRect(); return rect && {x: rect.x + 40, y: rect.y + rect.height / 2};
        });
        assert.ok(point, 'New clamp reporter is present in actual Arcade flyout');
        if (point.y > 130 && point.y < 900) break;
        await page.mouse.move(220, 500); await page.mouse.wheel(0, point.y > 900 ? 450 : -450); await page.waitForTimeout(60);
    }
    assert.ok(point.y > 130 && point.y < 900, 'Clamp is reachable by real palette scrolling');
    const before = await page.evaluate(() => window.Blockly.getMainWorkspace().getAllBlocks(false).filter(b => b.type === 'arcade_clampNumber').map(b => b.id));
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(700, 350, {steps: 20}); await page.mouse.up();
    await page.waitForFunction(ids => window.Blockly.getMainWorkspace().getAllBlocks(false).filter(b => b.type === 'arcade_clampNumber').some(b => !ids.includes(b.id)), before);
    // Remove the selected orphan through the normal keyboard to keep the game executable.
    await page.keyboard.press('Delete');
    await page.waitForFunction(ids => window.Blockly.getMainWorkspace().getAllBlocks(false).filter(b => b.type === 'arcade_clampNumber').every(b => ids.includes(b.id)), before);
    report.journeys.push('Real Arcade palette scroll, clamp drag into workspace, keyboard delete');
};
try {
    const files = numericAuthoringFiles(), fixture = path.join(out, 'numeric-authoring.mkcd');
    await writeFile(fixture, makeCodeProjectFile(files, {target: 'arcade'})); report.fixtureSha256 = digest(await readFile(fixture));
    page = await fresh(); await codeTab(); await page.getByTestId('bw-device-select').selectOption('arcade'); await openFile(fixture); await apply();
    const blockTypes = await page.evaluate(() => window.Blockly.getMainWorkspace().getAllBlocks(false).map(b => b.type));
    for (const opcode of ['arcade_randomNumber', 'arcade_mathBinary', 'arcade_percentChance', 'arcade_clampNumber', 'arcade_settingsWrite', 'arcade_settingsRead', 'arcade_sourceWhile']) assert.ok(blockTypes.includes(opcode), `${opcode} is a real imported block`);
    await cycle('unchanged-import', {}, files);
    await paletteCreate();
    await editNumber({opcode: 'arcade_clampNumber', input: 'MAX', value: '10'}, 12);
    await editMenu({opcode: 'arcade_mathBinary', input: 'OP', value: 'min'}, 'max', ['min', 'max', 'randomRange']);
    await editMenu({opcode: 'arcade_settingsRead', input: 'TYPE', value: 'StringArray'}, 'String', ['StringArray', 'String']);
    await editMenu({opcode: 'arcade_settingsRead', input: 'TYPE', value: 'String'}, 'StringArray', ['StringArray', 'String']);
    const edited = {maximum: 12, operation: 'max'}; await cycle('visible-block-edits', edited, numericAuthoringFiles(edited));
    await codeTab(); await page.getByRole('button', {name: /From blocks/}).first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.cmTile.root.view.state.doc.toString().includes('arcade clamp minimum'));
    const code = await readCode(); assert.match(code, /arcade repeat while/); assert.match(code, /StringArray/); assert.match(code, /maximum .*12/); assert.ok(code.includes('猫'));
    await editor().click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText(code.replace('猫', 'PLAY')); await apply();
    const finalOptions = {...edited, message: 'PLAY'}, finalFiles = numericAuthoringFiles(finalOptions);
    await cycle('edited-Code-to-Blocks', finalOptions, finalFiles);
    await page.getByText('File', {exact: true}).first().click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Save to your computer', {exact: true}).click()]);
    const archive = path.join(out, 'numeric-authoring.sb3'); await download.saveAs(archive);
    const bytes = await readFile(archive), zip = await JSZip.loadAsync(bytes); assert.ok(zip.file('project.json')); report.sb3 = {sha256: digest(bytes), bytes: bytes.length};
    await page.context().close(); page = await fresh(); await page.getByText('File', {exact: true}).first().click();
    const chooser = page.waitForEvent('filechooser'); await page.getByText('Load from your computer', {exact: true}).click(); await (await chooser).setFiles(archive);
    await page.waitForFunction(() => typeof window.__brickwrightStore.getState().scratchGui.vm.runtime._primitives.arcade_clampNumber === 'function');
    await cycle('fresh-SB3-reopen', finalOptions, finalFiles);
    await codeTab(); await page.getByRole('button', {name: /From blocks/}).first().click(); await openCodeActions(page);
    const [exported] = await Promise.all([page.waitForEvent('download'), page.getByTestId('bw-makecode-arcade-export').click()]);
    const exportedPath = path.join(out, 'numeric-authoring-export.mkcd'); await exported.saveAs(exportedPath);
    const exportedBytes = await readFile(exportedPath), embedded = await readMakeCodeProjectText(exportedBytes.toString('utf8'), 'mkcd');
    report.export = {sha256: digest(exportedBytes), bytes: exportedBytes.length};
    await original(embedded.files, finalOptions, false); await original(embedded.files, finalOptions, true);
    await openFile(exportedPath); await apply(); await cycle('actual-export-reimport', finalOptions, embedded.files);
    await Promise.all(bodyChecks); assert.deepEqual(report.bundleFailures || [], []); assert.ok(report.bundleObservations.length); assert.deepEqual(report.pageErrors, []);
    await page.screenshot({path: path.join(out, 'numeric-authoring.png')}); report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failure = String(error.stack || error);
    if (page) { report.failureSample = await observe().catch(e => ({error: String(e)})); report.body = (await page.locator('body').innerText()).slice(-14000); await page.screenshot({path: path.join(out, 'failure.png')}).catch(() => {}); }
    throw error;
} finally {
    await Promise.allSettled(bodyChecks); await writeFile(path.join(out, 'current.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close();
}

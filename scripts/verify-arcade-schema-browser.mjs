#!/usr/bin/env node
// Real native dropdown editing and SB3 persistence; VM/Blockly access observes
// fields, SVG coordinates and results only. All edits use visible UI controls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import JSZip from 'jszip';
const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const out = path.resolve(arg('--out') || 'test-results/arcade-schema-browser/current.json');
await fs.mkdir(path.dirname(out), {recursive: true});
const source = `DEVICE ARCADE
GLOBAL left
GLOBAL top
GLOBAL product
GLOBAL empty
GLOBAL negative
GLOBAL compared
GLOBAL axis
GLOBAL actor
GLOBAL image
SPRITE Game:
WHEN flag clicked:
  set left to calculate value 100 op "+" with 20
  set top to calculate value 120 op "*" with 2
  set product to calculate value 7 op "+" with 6
  set empty to undefined value
  set negative to convert value 5 op "+"
  set compared to 0
  IF compare value 7 op "<" with 6 THEN:
    set compared to 1
  set axis to arcade controller x step 10
  set image to arcade new image width 3 height 2
  arcade mutate image fill image color 2 replacement 0
  set actor to arcade create image image template "Game" kind "Player"
  arcade set position of actor x left y top
`;
const report = {generatedAt: new Date().toISOString(), authoring: 'Code → visible Blocks dropdown edits → From blocks → To blocks → File save/reopen',
    edits: [], samples: [], warnings: [], errors: []};
const browser = await chromium.launch(process.env.BW_BROWSER ? {executablePath: process.env.BW_BROWSER} : {});
let page;
try {
    page = await browser.newPage({viewport: {width: 1600, height: 1200}, acceptDownloads: true});
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) report.warnings.push(message.text()); });
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(process.env.BW_BASE_URL || process.env.PROOF_URL || 'http://127.0.0.1:8620/', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm);
    const editor = page.locator('[data-testid="bw-code-editor"] .cm-content');
    const codeTab = () => page.getByRole('tab', {name: 'Code', exact: true}).click();
    const blocksTab = async () => {
        await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
        await editor.waitFor({state: 'hidden'});
        await page.waitForFunction(() => window.Blockly?.getMainWorkspace()?.getAllBlocks(false).some(b => b.type === 'arrays_valueBinary'));
    };
    const apply = async () => {
        await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
        await page.getByText('Blocks loaded.', {exact: true}).waitFor();
        await blocksTab();
    };
    await codeTab();
    await page.getByTestId('bw-device-select').selectOption('arcade');
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.bwDeviceId === 'arcade');
    await editor.fill(source);
    await apply();
    // Identify a visible field by its block and assignment, then click its
    // observed SVG bounds. No setFieldValue or VM project mutation is used.
    const edit = async (type, variable, fieldName, choice) => {
        const bounds = await page.evaluate(({type, variable, fieldName}) => {
            const workspace = window.Blockly.getMainWorkspace();
            const block = workspace.getAllBlocks(false).find(b => b.type === type &&
                (!variable || b.getParent()?.getField('VARIABLE')?.getText() === variable));
            if (!block) throw new Error(`Missing authored block ${type}/${variable}`);
            const fieldBlock = type === 'arcade_controllerStep' ? block.getInputTargetBlock('AXIS') : block;
            const field = fieldBlock?.getField(fieldName);
            if (!field) throw new Error(`Missing native field ${type}/${fieldName}`);
            const rect = field.getSvgRoot().getBoundingClientRect();
            return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, before: field.getValue()};
        }, {type, variable, fieldName});
        assert.ok(bounds.x > 0 && bounds.y > 0 && bounds.y < 1200, 'dropdown is visibly reachable');
        await page.mouse.click(bounds.x, bounds.y);
        const item = page.getByRole('menuitemcheckbox', {name: choice, exact: true});
        await item.waitFor({state: 'visible'});
        const itemBounds = await item.boundingBox();
        assert.ok(itemBounds, 'menu choice is visibly reachable');
        await page.mouse.click(itemBounds.x + itemBounds.width / 2, itemBounds.y + itemBounds.height / 2);
        await page.waitForFunction(({type, variable, fieldName, choice}) => {
            const block = window.Blockly.getMainWorkspace().getAllBlocks(false).find(b => b.type === type &&
                (!variable || b.getParent()?.getField('VARIABLE')?.getText() === variable));
            return (type === 'arcade_controllerStep' ? block?.getInputTargetBlock('AXIS') : block)?.getFieldValue(fieldName) === choice;
        }, {type, variable, fieldName, choice});
        report.edits.push({type, variable, fieldName, before: bounds.before, choice});
    };
    await edit('arrays_valueBinary', 'left', 'OP', '-');
    await edit('arrays_valueBinary', 'top', 'OP', '/');
    await edit('arrays_valueBinary', 'product', 'OP', '*');
    await edit('arrays_specialValue', 'empty', 'KIND', 'null');
    await edit('arrays_valueUnary', 'negative', 'OP', '-');
    await edit('arrays_valueCompare', null, 'OP', '>=');
    await edit('arcade_controllerStep', 'axis', 'axes', 'y');
    const expected = {left: 80, top: 60, product: 42, empty: null, negative: -5, compared: 1, axis: 0};
    const run = async label => {
        await page.locator('[class*="green-flag_green-flag"]').first().click();
        await page.waitForFunction(() => {
            const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
            return runtime.targets.flatMap(t => Object.values(t.variables)).some(v => v.name.replace(/^(?:Game_)+/, '') === 'product' && v.value === 42);
        });
        const values = await page.evaluate(() => Object.fromEntries(window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
            .flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^(?:Game_)+/, ''), v.value])));
        const actual = Object.fromEntries(Object.keys(expected).map(name => [name, values[name]]));
        const position = await page.evaluate(() => {
            const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
            const actor = runtime.targets.flatMap(t => Object.values(t.variables)).find(v => v.name.replace(/^(?:Game_)+/, '') === 'actor');
            const sprite = runtime.bwArcadeDeviceState?.sprites?.[actor?.value];
            return sprite ? {x: sprite.x, y: sprite.y} : null;
        });
        report.samples.push({label, values: actual, position});
        assert.deepEqual(position, {x: 80, y: 60}, 'edited subtraction/division position the actual Arcade sprite');
        assert.deepEqual(actual, expected, `${label} keeps arithmetic, special value, comparison and axis semantics`);
    };
    await run('native-dropdown-edits');
    await codeTab();
    await page.getByRole('button', {name: '⇨ From blocks', exact: true}).click();
    const decompiled = await editor.evaluate(element => element.cmTile.root.view.state.doc.toString());
    for (const word of ['100 op "-" with 20', '120 op "/" with 2', '7 op "*" with 6', 'null value', '5 op "-"', '7 op ">=" with 6', 'arcade controller y step 10']) assert.ok(decompiled.includes(word), word);
    report.decompiled = decompiled;
    await apply();
    await run('code-blocks-reconstruction');
    await page.getByText('File', {exact: true}).first().click();
    const downloaded = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /\.sb3$/);
    const archive = path.join(path.dirname(out), 'native-menu-edits.sb3');
    await download.saveAs(archive);
    // Replace the current project first, so reopening cannot accidentally
    // pass by observing the project that was already in memory.
    await codeTab();
    await editor.fill(source);
    await apply();
    await page.getByText('File', {exact: true}).first().click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Load from your computer', {exact: true}).click();
    await (await chooser).setFiles(archive);
    // Existing project replacement confirmation is part of the actual UI.
    const replace = page.getByRole('button', {name: 'Replace', exact: true});
    if (await replace.isVisible().catch(() => false)) await replace.click();
    await page.waitForFunction(() => window.Blockly.getMainWorkspace().getAllBlocks(false)
        .some(b => b.type === 'arrays_specialValue' && b.getFieldValue('KIND') === 'null'));
    const reopenedAxis = await page.evaluate(() => window.Blockly.getMainWorkspace().getAllBlocks(false)
        .find(b => b.type === 'arcade_controllerStep')?.getInputTargetBlock('AXIS')?.getFieldValue('axes'));
    assert.equal(reopenedAxis, 'y', 'actual native axis dropdown survives saved archive reopening');
    await run('saved-sb3-reopened');
    report.archive = {filename: download.suggestedFilename(), bytes: (await fs.stat(archive)).size};
    // Recreate only the five documented historical schema shapes in an owned
    // fixture archive, then load it through the real File chooser. This tests
    // migration before Blocks can discard obsolete inputs, not merely Code
    // reconstruction of a project that never entered the native workspace.
    const zip = await JSZip.loadAsync(await fs.readFile(archive));
    const legacyProject = JSON.parse(await zip.file('project.json').async('string'));
    for (const target of legacyProject.targets) for (const block of Object.values(target.blocks)) {
        const slot = block.opcode === 'arrays_specialValue' ? 'KIND' :
            /^arrays_value(Binary|Unary|Compare)$/.test(block.opcode) ? 'OP' : null;
        if (slot) { block.inputs[slot] = [1, [10, block.fields[slot][0]]]; delete block.fields[slot]; }
        if (block.opcode === 'arcade_controllerStep') {
            block.fields.AXIS = ['y', null];
            const menuId = block.inputs.AXIS[1];
            delete block.inputs.AXIS;
            delete target.blocks[menuId];
        }
    }
    zip.file('project.json', JSON.stringify(legacyProject));
    const legacyPath = path.join(path.dirname(out), 'legacy-menu-shapes.sb3');
    await fs.writeFile(legacyPath, await zip.generateAsync({type: 'nodebuffer'}));
    await codeTab(); await editor.fill(source); await apply();
    await page.getByText('File', {exact: true}).first().click();
    const legacyChooser = page.waitForEvent('filechooser');
    await page.getByText('Load from your computer', {exact: true}).click();
    await (await legacyChooser).setFiles(legacyPath);
    if (await replace.isVisible().catch(() => false)) await replace.click();
    await page.waitForFunction(() => window.Blockly.getMainWorkspace().getAllBlocks(false)
        .some(b => b.type === 'arrays_specialValue' && b.getFieldValue('KIND') === 'null'));
    await run('legacy-sb3-preload-migration');
    await codeTab();
    await page.getByRole('button', {name: '⇨ From blocks', exact: true}).click();
    const migratedCode = await editor.evaluate(element => element.cmTile.root.view.state.doc.toString());
    assert.match(migratedCode, /arcade controller (?:y|"y") step 10/, 'legacy y axis survives actual visible workspace load');
    assert.ok(migratedCode.includes('100 op "-" with 20'));
    assert.ok(migratedCode.includes('120 op "/" with 2'));
    report.migratedCode = migratedCode;
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings.filter(s => /Ignoring non-existent (input|field) (OP|KIND|AXIS)|Workspace Update Error/.test(s)), []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failure = error.stack || String(error);
    if (page) {
        report.failureText = (await page.locator('body').innerText().catch(() => '')).slice(-10000);
        await page.screenshot({path: path.join(path.dirname(out), 'failure.png')}).catch(() => {});
    }
    throw error;
} finally {
    await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    console.log(JSON.stringify({status: report.status, edits: report.edits.length, samples: report.samples.length}));
}

#!/usr/bin/env node
/** Real-browser acceptance for the shipped LEGO SPIKE SB3 round trip. */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';

const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');
const url = process.env.PROOF_URL || 'http://localhost:8617/';
const artifacts = resolve('artifacts/lego-spike-roundtrip');
await mkdir(artifacts, {recursive: true});

const program = `DEVICE SPIKE

GLOBAL dist = 0

WHEN flag clicked:
  start motor A forward
  wait 250 ms
  set dist to spike distance B
  display text "GO"
  stop motor A
`;
const creator = new SB3Creator();
creator.parse(program);
const fixture = resolve(artifacts, 'spike-roundtrip-input.sb3');
await writeFile(fixture, Buffer.from(await (await creator.generateSB3()).arrayBuffer()));

const expected = ['event_whenflagclicked', 'spikeprime_motorStart', 'control_wait',
    'data_setvariableto', 'spikeprime_getDistance', 'spikeprime_displayText', 'spikeprime_motorStop'];
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('dialog', dialog => dialog.accept());

const opcodes = async () => page.evaluate(() => {
    const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
    return [...new Set((vm?.runtime?.targets || []).flatMap(target =>
        Object.values(target.blocks?._blocks || {}).map(block => block.opcode)))].sort();
});
const assertOpcodes = (actual, label) => {
    const missing = expected.filter(opcode => !actual.includes(opcode));
    if (missing.length) throw new Error(`${label} lost opcodes: ${missing.join(', ')}`);
    console.log(`  ok: ${label} contains all ${expected.length} required opcodes`);
};

try {
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.getByText('File', {exact: true}).click();
    const chooserPromise = page.waitForEvent('filechooser', {timeout: 30000});
    await page.getByText('Load from your computer', {exact: true}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(fixture);
    await page.waitForFunction(required => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        const found = new Set((vm?.runtime?.targets || []).flatMap(target =>
            Object.values(target.blocks?._blocks || {}).map(block => block.opcode)));
        return required.every(opcode => found.has(opcode));
    }, expected, {timeout: 45000});
    assertOpcodes(await opcodes(), 'loaded SB3');

    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByRole('button', {name: /From blocks/}).first().click();
    try {
        await page.waitForFunction(() => {
            const text = document.querySelector('.cm-content')?.textContent || '';
            return text.includes('start motor A forward') && text.includes('spike distance B') &&
                text.includes('stop motor A');
        }, null, {timeout: 30000});
    } catch (error) {
        const text = await page.locator('.cm-content').textContent().catch(() => 'editor absent');
        await page.screenshot({path: resolve(artifacts, 'code-roundtrip-failure.png'), fullPage: true});
        throw new Error(`From blocks did not produce canonical SPIKE text: ${text}`, {cause: error});
    }
    // The three phrases above are motor calls; none touches the DECLARATION line, so this gate
    // could go green while `GLOBAL dist = 0` produced a variable named "dist = 0" plus a second
    // uninitialized "dist". "Round trip passed" is a sentence about the round trip that a reader
    // hears as one about the page.
    //
    // What this can and cannot prove, stated because it is easy to over-read: the fixture is
    // built HERE by the vendored compiler, so the bytes uploaded already reflect whatever this
    // checkout parses. That means this assertion covers the deployed DECOMPILER — it must render
    // exactly one canonical declaration — and says nothing about the deployed PARSER, which never
    // sees the source text. The parse side is covered by test/lego-spike-roundtrip.test.mjs,
    // which asserts the variable table directly.
    // Read the editor's LINES, not its textContent: CodeMirror renders each line as its own
    // element and concatenates them without newlines, so `GLOBAL dist` arrived glued to the
    // following `STAGE:` and a naive split invented a declaration that was not there.
    const declarations = await page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')]
        .map(line => (line.textContent || '').trim())
        .filter(line => /^(GLOBAL|LOCAL)\b/.test(line)));
    if (declarations.length !== 1 || declarations[0] !== 'GLOBAL dist') {
        await page.screenshot({path: resolve(artifacts, 'declaration-failure.png'), fullPage: true});
        throw new Error(`expected exactly one declaration "GLOBAL dist", got ${JSON.stringify(declarations)}`);
    }
    await page.screenshot({path: resolve(artifacts, 'code-roundtrip.png'), fullPage: true});

    await page.getByRole('button', {name: /To blocks/}).first().click();
    // The old VM still contains every expected opcode while compilation is
    // starting, so an opcode-only wait can resolve before replacement begins.
    // The importer publishes this message only after vm.loadProject resolves.
    await page.getByText('Compiled to blocks and loaded. Switch to the Code tab to see them.',
        {exact: true}).waitFor({timeout: 30000});
    await page.waitForFunction(required => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        const found = new Set((vm?.runtime?.targets || []).flatMap(target =>
            Object.values(target.blocks?._blocks || {}).map(block => block.opcode)));
        return required.every(opcode => found.has(opcode));
    }, expected, {timeout: 30000});
    assertOpcodes(await opcodes(), 'Code-to-blocks result');

    await page.getByText('File', {exact: true}).click();
    const downloadPromise = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    const download = await downloadPromise;
    const saved = resolve(artifacts, 'spike-roundtrip-saved.sb3');
    await download.saveAs(saved);
    const savedProject = JSON.parse(await (await JSZip.loadAsync(await readFile(saved)))
        .file('project.json').async('string'));
    const savedOpcodes = [...new Set(savedProject.targets.flatMap(target =>
        Object.values(target.blocks).map(block => block.opcode)))].sort();
    assertOpcodes(savedOpcodes, 'downloaded SB3');
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
    console.log('LEGO SPIKE browser round trip passed.');
} finally {
    await browser.close();
}

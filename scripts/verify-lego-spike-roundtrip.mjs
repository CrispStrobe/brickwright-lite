#!/usr/bin/env node
/**
 * Real-browser acceptance for the shipped LEGO SPIKE surfaces:
 *  1. the SB3 round trip (archive -> Code tab -> blocks -> saved archive);
 *  2. the Pybricks simulator pane: a Python program from the Code tab, run by
 *     Pybricks MicroPython compiled to wasm, lights the hub face's matrix and
 *     turns the port-A motor to 90 degrees, then stops.
 * Both halves are SPIKE, so they share this gate and its one CI shard.
 */
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

// The Pybricks half. Three pixels on a diagonal, and a motor turned to a
// target: both are things the program must DO (the matrix starts dark, the
// motor starts at 0), so a pane that mounts but never runs cannot pass. The
// program then waits forever, so the lit matrix and the held angle are read
// while it runs (Pybricks clears the display when a program ends), and the
// gate stops it with the pane's own Stop button.
const pybricksProgram = `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port
from pybricks.tools import wait

hub = PrimeHub()
hub.display.off()
hub.display.pixel(0, 0, 100)
hub.display.pixel(2, 2, 100)
hub.display.pixel(4, 4, 100)
motor = Motor(Port.A)
motor.run_target(500, 90)
print("target reached", motor.angle())
while True:
    wait(100)
`;
const LIT = [0, 12, 24];

async function pybricksPane () {
    const pane = await browser.newPage({viewport: {width: 1600, height: 1000}});
    const errors = [];
    pane.on('pageerror', error => errors.push(error.message));
    pane.on('dialog', dialog => dialog.accept());
    await pane.addInitScript(source => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        // The Code tab restores its last buffer from this key: the program is
        // in the Code tab exactly as if the learner had typed it.
        localStorage.setItem('bw-code-autosave', JSON.stringify({lang: 'python', code: source}));
    }, pybricksProgram);
    try {
        await pane.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
        // A SPIKE with a motor on port A, set the way the Virtual SPIKE Prime
        // panel sets it; the Pybricks pane takes its ports from that hub.
        await pane.waitForFunction(() => Boolean(window.__brickwrightVirtualSpike?.hubState), null, {timeout: 30000});
        await pane.evaluate(() => window.__brickwrightVirtualSpike.setPort('A', 'motor'));
        await pane.getByRole('tab', {name: 'Code', exact: true}).click();
        // Derived from the program, not restated: a precondition that repeats a
        // literal from the subject goes red first when the subject changes.
        const targetLine = pybricksProgram.trim().split('\n').filter(line => line.includes('run_target'))[0];
        await pane.waitForFunction(line => (document.querySelector('.cm-content')?.textContent || '')
            .includes(line), targetLine, {timeout: 30000});
        if (await pane.locator('[data-testid="bw-pybricks-sim-pane"]').count()) {
            throw new Error('precondition: the Pybricks pane must not be mounted before Run on SPIKE');
        }
        await pane.getByRole('button', {name: '▶ Run on SPIKE (Pybricks)'}).click();
        await pane.locator('[data-testid="bw-pybricks-sim-pane"]').waitFor({timeout: 30000});
        console.log('  ok: Run on SPIKE mounted the Pybricks pane');

        // The hub face: exactly the three pixels the program lit.
        try {
            await pane.waitForFunction(lit => {
                const cells = [...document.querySelectorAll('[data-testid="bw-pybricks-matrix"] > div')];
                const on = cells.map((c, i) => (Number(c.dataset.brightness) > 0 ? i : -1)).filter(i => i >= 0);
                return cells.length === 25 && on.length === lit.length && lit.every(i => on.includes(i));
            }, LIT, {timeout: 45000});
        } catch (error) {
            const state = await pane.evaluate(() => ({
                status: document.querySelector('[data-testid="bw-pybricks-status"]')?.textContent,
                output: document.querySelector('[data-testid="bw-pybricks-output"]')?.textContent,
                pixels: [...document.querySelectorAll('[data-testid="bw-pybricks-matrix"] > div')].map(c => c.dataset.brightness)
            }));
            await pane.screenshot({path: resolve(artifacts, 'pybricks-matrix-failure.png'), fullPage: true});
            throw new Error(`hub face matrix never showed pixels ${LIT}: ${JSON.stringify(state)}`, {cause: error});
        }
        console.log(`  ok: hub face matrix lit exactly pixels ${LIT.join(', ')}`);

        // Port A: the motor row reads about 90 degrees, and the program says
        // run_target returned (the angle is where it ended, not passing by).
        const angleOf = () => pane.evaluate(() => {
            const text = document.querySelector('[data-testid="bw-pybricks-port-A"]')?.textContent || '';
            const m = text.match(/(-?\d+)°/);
            return m ? Number(m[1]) : null;
        });
        try {
            await pane.waitForFunction(() => {
                const out = document.querySelector('[data-testid="bw-pybricks-output"]')?.textContent || '';
                const row = document.querySelector('[data-testid="bw-pybricks-port-A"]')?.textContent || '';
                const m = row.match(/(-?\d+)°/);
                return out.includes('target reached') && m && Math.abs(Number(m[1]) - 90) <= 3;
            }, null, {timeout: 45000});
        } catch (error) {
            const output = await pane.locator('[data-testid="bw-pybricks-output"]').textContent().catch(() => '');
            await pane.screenshot({path: resolve(artifacts, 'pybricks-motor-failure.png'), fullPage: true});
            throw new Error(`port-A motor did not settle at ~90°: row reads ${await angleOf()}°, output ${JSON.stringify(output)}`,
                {cause: error});
        }
        console.log(`  ok: port-A motor reads ${await angleOf()}° (target 90)`);
        await pane.screenshot({path: resolve(artifacts, 'pybricks-pane-running.png'), fullPage: true});

        // Stop, with the pane's own button; the run must actually end.
        await pane.locator('[data-testid="bw-pybricks-run"]').click();
        await pane.waitForFunction(() =>
            document.querySelector('[data-testid="bw-pybricks-status"]')?.textContent === 'Ready', null, {timeout: 30000});
        console.log('  ok: Stop ended the program');
        if (errors.length) throw new Error(`Pybricks pane page errors: ${errors.join(' | ')}`);
        console.log('Pybricks SPIKE simulator pane passed.');
    } finally {
        await pane.close();
    }
}

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

    await pybricksPane();
} finally {
    await browser.close();
}

#!/usr/bin/env node
// Browser gate for the micro:bit-matrix FACEPLATE TRIPLET — the reference
// proof that the Controller panel is a live faceplate system: input widgets
// WRITE program variables, a display widget READS one, and a running program
// closes the loop. In-DOM, end to end:
//
//   press button widget A  →  variable btnA=1  →  the RUNNING program sets
//   `screen`  →  the matrix face lights the pattern.
//
//   PROOF_URL=http://localhost:8623/ node scripts/verify-faceplate-matrix.mjs
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openCodeActions } from './lib-code-actions.mjs';

const URL_ = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const ARTIFACTS = path.resolve('artifacts/faceplate-matrix');
const fail = (m) => { throw new Error(m); };
const pass = (m) => console.log(`PASS ${m}`);

// Patterns: idle = one corner dot; A = an X; B = a bar. Distinct popcounts so
// the face assertions cannot alias.
const IDLE = 1;                       // bit 0
const PAT_A = 0b10001_01010_00100_01010_10001;   // X, 9 dots
const PAT_B = 0b00000_00000_11111_00000_00000;   // middle row, 5 dots

const SRC = `WHEN flag clicked:
  set btnA to 0
  set btnB to 0
  FOREVER:
    IF btnA = 1 THEN:
      set screen to ${PAT_A}
    ELSE:
      IF btnB = 1 THEN:
        set screen to ${PAT_B}
      ELSE:
        set screen to ${IDLE}
`;

const browser = await chromium.launch();
let page;
let exitCode = 0;
const pageErrors = [];
try {
page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.addInitScript(() => {
    localStorage.setItem('bw-starter-v1-complete', '1');
    localStorage.setItem('bw-right-pane-hidden', '0');
});
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('dialog', dialog => dialog.accept());
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => {
    const st = window.__brickwrightStore;
    const vm = st && st.getState && st.getState().scratchGui && st.getState().scratchGui.vm;
    if (vm && vm.runtime) { window.__vm = vm; return true; }
    return false;
}, { timeout: 60000 });
pass('app loaded');

// ---- program into the VM --------------------------------------------------
await page.getByRole('tab', { name: /^Code$/ }).first().click();
const editor = page.locator('[data-testid="bw-codemirror"] .cm-content, .cm-content').first();
await editor.waitFor({ state: 'visible', timeout: 30000 });
await editor.click();
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
await page.keyboard.press('Delete');
await page.evaluate((src) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', src);
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, SRC);
await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent.includes('set btnA to 0'),
    { timeout: 10000 });
await page.getByRole('button', { name: /to blocks/i }).first().click();
await page.waitForFunction(() => {
    const s = window.__vm.runtime.getTargetForStage();
    if (!s) return false;
    const names = Object.values(s.variables || {}).map((v) => v.name);
    return ['btnA', 'btnB', 'screen'].every((n) => names.includes(n));
}, { timeout: 15000 });
pass('program compiled; btnA/btnB/screen exist on the stage');

// ---- faceplate: matrix display + two buttons, variable-bound ---------------
const controllerButton = () => page.locator('button[title="Controller"]:visible').first();
if (!await controllerButton().count()) fail('no visible Controller button in the open right pane');
await controllerButton().click();
await page.waitForFunction(() => Boolean(window.__vm.runtime.controllerPanel), { timeout: 10000 });
await page.evaluate(() => {
    const p = window.__vm.runtime.controllerPanel;
    for (const n of ['scr', 'a', 'b']) { try { p.removeWidget(n); } catch { /* absent */ } }
    p.addWidget('scr', 'matrix');
    p.bindToVariable('scr', 'screen');
    p.addWidget('a', 'button');
    p.bindToVariable('a', 'btnA');
    p.addWidget('b', 'button');
    p.bindToVariable('b', 'btnB');
    p.setMode('play');
});
const canvas = page.locator('[data-testid="bw-controller-canvas"]:visible').first();
await canvas.waitFor({ timeout: 10000 });
const panel = canvas.locator('xpath=..');
const face = panel.locator('[data-testid="bw-ctl-matrix-scr"]');
await face.waitFor({ timeout: 10000 });
const dotCount = await face.locator('[data-lit]').count();
if (dotCount !== 25) fail(`matrix face has ${dotCount} dots, expected 25`);
pass('matrix face renders 5x5 (25 dots)');

// ---- run the program and close the loop ------------------------------------
await page.evaluate(() => window.__vm.greenFlag());
const litCount = () => face.locator('[data-lit="1"]').count();
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 1;
}, { timeout: 15000 }).catch(async () => fail(`idle pattern never showed (lit=${await litCount()})`));
pass('program running: idle pattern (1 dot) reaches the face');

// press-and-hold button A (a real pointer event on the widget face)
const buttons = panel.locator('button').filter({ hasText: '●' });
const nBtns = await buttons.count();
if (nBtns !== 2) fail(`expected exactly 2 button widgets, found ${nBtns}`);
pass('two button widgets rendered (2)');
await buttons.first().dispatchEvent('pointerdown');
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 9;
}, { timeout: 10000 }).catch(async () => fail(`X pattern never showed while A held (lit=${await litCount()})`));
pass('button A held → btnA=1 → program draws the X (9 dots) — FULL LOOP');
await buttons.first().dispatchEvent('pointerup');
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 1;
}, { timeout: 10000 }).catch(async () => fail(`did not return to idle (lit=${await litCount()})`));
pass('release → back to idle');
await buttons.nth(1).dispatchEvent('pointerdown');
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 5;
}, { timeout: 10000 }).catch(async () => fail(`bar pattern never showed while B held (lit=${await litCount()})`));
pass('button B held → middle-row bar (5 dots)');
await buttons.nth(1).dispatchEvent('pointerup');

// ---- the gallery example loads its faceplate ready-wired --------------------
{
    // the Controller view is full-width — leave it or the editor (and its
    // catalog toggle) stays hidden
    if (!await controllerButton().count()) fail('Controller button disappeared before catalog phase');
    await controllerButton().click();
    await page.getByRole('tab', { name: /^Code$/ }).first().click();
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await page.evaluate(() => {
        const p = window.__vm.runtime.controllerPanel;
        for (const n of p.getWidgetNames()) p.removeWidget(n);
    });
    // the catalog control only renders with a device chosen
    const deviceSelect = page.locator('[data-testid="bw-device-select"]:visible');
    await deviceSelect.selectOption({ value: 'microbit' });
    await page.waitForFunction(() =>
        document.querySelector('[data-testid="bw-device-select"]:not([hidden])')?.value === 'microbit',
    { timeout: 10000 });
    // The catalog toggle lives inside the Code tab's `...` actions menu since
    // the UI consolidation (31c5a815). Open it, or the toggle is in the DOM and
    // unreachable — which reads exactly like "the control is gone".
    await openCodeActions(page);
    const togglePresent = await page.locator('[data-testid="bw-catalog-toggle"]').count();
    if (!togglePresent) {
        const ids = await page.evaluate(() =>
            [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))].slice(0, 25));
        fail('no catalog toggle after leaving controller view; visible testids: ' + JSON.stringify(ids));
    }
    await page.locator('[data-testid="bw-catalog-toggle"]:visible').click();
    await page.locator('[data-testid="bw-catalog-search"]').fill('faceplate');
    const item = page.locator('[data-testid="bw-catalog-item"]').first();
    await item.waitFor({ state: 'visible', timeout: 10000 })
        .catch(() => fail('mb05-faceplate-matrix not in the catalog (vendored examples stale?)'));
    await item.click();
    await page.waitForFunction(() => {
        const p = window.__vm.runtime.controllerPanel;
        const scr = p && p.getWidget('scr');
        return scr && scr.type === 'matrix' && scr.binding?.variableName === 'screen';
    }, { timeout: 15000 });
    const restored = await page.evaluate(() => {
        const p = window.__vm.runtime.controllerPanel;
        const names = p.getWidgetNames();
        const scr = p.getWidget('scr');
        return { names, scrType: scr && scr.type,
            bound: scr && scr.binding && scr.binding.variableName };
    });
    if (!(restored.names.includes('scr') && restored.scrType === 'matrix' && restored.bound === 'screen')) {
        fail(`faceplate not restored from files.controller: ${JSON.stringify(restored)}`);
    }
    pass(`catalog example restores the faceplate (widgets: ${restored.names.join(',')}, scr→screen)`);
}

// ---- sevenseg display: the numeric face follows a variable live -------------
{
    await page.evaluate(() => {
        const p = window.__vm.runtime.controllerPanel;
        try { p.removeWidget('num'); } catch { /* absent */ }
        p.addWidget('num', 'sevenseg');
        p.bindToVariable('num', 'screen');   // reuse the live program variable
        p.setMode('play');
    });
    // The matrix phase above already proves the running program closes the
    // button -> variable -> display loop.  Here, isolate the seven-segment
    // binding contract from catalog-load/green-flag timing by changing the
    // real Scratch stage variable that production's binding pump reads.
    const setScreen = async value => page.evaluate(nextValue => {
        const stage = window.__vm.runtime.getTargetForStage();
        const variable = stage && stage.lookupVariableByNameAndType('screen', '');
        if (!variable) throw new Error('catalog project has no stage variable named screen');
        variable.value = nextValue;
    }, value);
    await setScreen(IDLE);
    // re-open the controller view to see the face
    if (!await controllerButton().count()) fail('Controller button disappeared before sevenseg phase');
    await controllerButton().click();
    const liveCanvas = page.locator('[data-testid="bw-controller-canvas"]:visible').first();
    await liveCanvas.waitFor({ timeout: 10000 });
    const livePanel = liveCanvas.locator('xpath=..');
    const seg = livePanel.locator('[data-testid="bw-ctl-sevenseg-num"]');
    await seg.waitFor({ timeout: 10000 });
    // The face reads the live Scratch variable and right-aligns its value.
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="bw-ctl-sevenseg-num"]');
        return el && el.getAttribute('data-shown') === '   1';
    }, { timeout: 15000 }).catch(async () => fail('sevenseg never showed 1: data-shown='
        + JSON.stringify(await seg.getAttribute('data-shown'))));
    pass('sevenseg shows the live variable (right-aligned "   1")');
    // The X-pattern value does not fit four digits -> dashes (overflow).
    await setScreen(PAT_A);
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="bw-ctl-sevenseg-num"]');
        return el && el.getAttribute('data-shown') === '----';
    }, { timeout: 10000 }).catch(async () => fail('overflow contract broken: data-shown='
        + JSON.stringify(await seg.getAttribute('data-shown'))));
    pass('overflow renders dashes (8-digit value on a 4-digit face)');
}

if (pageErrors.length) fail(`page error(s): ${pageErrors.join('; ')}`);
console.log('FACEPLATE GATE: PASS');
} catch (error) {
    exitCode = 1;
    console.error(`FACEPLATE GATE: FAIL — ${error.stack || error.message}`);
    await mkdir(ARTIFACTS, { recursive: true });
    const diagnostic = { error: error.message, pageErrors };
    if (page) {
        await page.screenshot({ path: path.join(ARTIFACTS, 'failure.png'), fullPage: true }).catch(() => {});
        diagnostic.url = page.url();
        diagnostic.model = await page.evaluate(() => {
            const panel = window.__vm && window.__vm.runtime && window.__vm.runtime.controllerPanel;
            if (!panel) return null;
            return panel.getWidgetNames().map(name => {
                const widget = panel.getWidget(name);
                return {
                    name,
                    type: widget && widget.type,
                    binding: widget && widget.binding,
                    state: widget && widget.state
                };
            });
        }).catch(e => ({ dumpError: e.message }));
    }
    await writeFile(path.join(ARTIFACTS, 'failure-model.json'),
        `${JSON.stringify(diagnostic, null, 2)}\n`);
} finally {
    await browser.close();
}
process.exit(exitCode);

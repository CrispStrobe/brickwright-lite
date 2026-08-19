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
import { createRequire } from 'node:module';
let chromium;
for (const base of ['../package.json', '/Users/christianstrobele/code/wt-fable/bw-circuit-ui/package.json']) {
    try { ({ chromium } = createRequire(new URL(base, import.meta.url))('playwright')); break; }
    catch { try { ({ chromium } = createRequire(base)('playwright')); break; } catch { /* next */ } }
}

const URL_ = process.env.PROOF_URL || 'http://localhost:8623/';
const fail = (m) => { console.error(`FAIL ${m}`); process.exitCode = 1; };
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
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => fail('page error: ' + String(e).slice(0, 150)));
await page.goto(URL_, { waitUntil: 'load' });
await page.waitForFunction(() => {
    const st = window.__brickwrightStore;
    const vm = st && st.getState && st.getState().scratchGui && st.getState().scratchGui.vm;
    if (vm && vm.runtime) { window.__vm = vm; return true; }
    return false;
}, { timeout: 60000 });
pass('app loaded');

// ---- program into the VM --------------------------------------------------
await page.getByRole('tab', { name: /^Code$/ }).first().click()
    .catch(async () => { await page.getByText('Code', { exact: true }).first().click(); });
await page.waitForTimeout(600);
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
await page.waitForTimeout(400);
await page.getByRole('button', { name: /to blocks/i }).first().click();
await page.waitForTimeout(1500);
const varsOk = await page.evaluate(() => {
    const s = window.__vm.runtime.getTargetForStage();
    const names = Object.values(s.variables || {}).map((v) => v.name);
    return ['btnA', 'btnB', 'screen'].every((n) => names.includes(n));
});
varsOk ? pass('program compiled; btnA/btnB/screen exist on the stage')
    : fail('stage variables missing after To blocks');

// ---- faceplate: matrix display + two buttons, variable-bound ---------------
await page.locator('[title="Controller"]').first().click();
await page.waitForTimeout(1000);
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
await page.waitForTimeout(600);
const face = page.locator('[data-testid="bw-ctl-matrix-scr"]');
await face.waitFor({ timeout: 10000 }).catch(() => fail('matrix face did not render'));
const dotCount = await face.locator('[data-lit]').count();
dotCount === 25 ? pass('matrix face renders 5x5 (25 dots)')
    : fail(`matrix face has ${dotCount} dots`);

// ---- run the program and close the loop ------------------------------------
await page.evaluate(() => window.__vm.greenFlag());
const litCount = () => face.locator('[data-lit="1"]').count();
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 1;
}, { timeout: 15000 })
    .then(() => pass('program running: idle pattern (1 dot) reaches the face'))
    .catch(async () => fail(`idle pattern never showed (lit=${await litCount()})`));

// press-and-hold button A (a real pointer event on the widget face)
const buttons = page.locator('[data-testid="bw-controller-panel"] button, button')
    .filter({ hasText: '●' });
const nBtns = await buttons.count();
nBtns >= 2 ? pass(`two button widgets rendered (${nBtns})`)
    : fail(`expected 2 button widgets, found ${nBtns}`);
await buttons.first().dispatchEvent('pointerdown');
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 9;
}, { timeout: 10000 })
    .then(() => pass('button A held → btnA=1 → program draws the X (9 dots) — FULL LOOP'))
    .catch(async () => fail(`X pattern never showed while A held (lit=${await litCount()})`));
await buttons.first().dispatchEvent('pointerup');
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 1;
}, { timeout: 10000 })
    .then(() => pass('release → back to idle'))
    .catch(async () => fail(`did not return to idle (lit=${await litCount()})`));
await buttons.nth(1).dispatchEvent('pointerdown');
await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bw-ctl-matrix-scr"]');
    return el && el.querySelectorAll('[data-lit="1"]').length === 5;
}, { timeout: 10000 })
    .then(() => pass('button B held → middle-row bar (5 dots)'))
    .catch(async () => fail(`bar pattern never showed while B held (lit=${await litCount()})`));
await buttons.nth(1).dispatchEvent('pointerup');

// ---- the gallery example loads its faceplate ready-wired --------------------
{
    // the Controller view is full-width — leave it or the editor (and its
    // catalog toggle) stays hidden
    await page.locator('[title="Controller"]').first().click().catch(() => {});
    await page.waitForTimeout(600);
    await page.getByRole('tab', { name: /^Code$/ }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const p = window.__vm.runtime.controllerPanel;
        for (const n of p.getWidgetNames()) p.removeWidget(n);
    });
    // the catalog control only renders with a device chosen
    await page.locator('[data-testid="bw-device-select"]').selectOption({ value: 'microbit' }).catch(() => {});
    await page.waitForTimeout(400);
    const togglePresent = await page.locator('[data-testid="bw-catalog-toggle"]').count();
    if (!togglePresent) {
        const ids = await page.evaluate(() =>
            [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))].slice(0, 25));
        fail('no catalog toggle after leaving controller view; visible testids: ' + JSON.stringify(ids));
    } else {
        await page.locator('[data-testid="bw-catalog-toggle"]').click();
    await page.locator('[data-testid="bw-catalog-search"]').fill('faceplate');
    await page.waitForTimeout(600);
    const item = page.locator('[data-testid="bw-catalog-item"]').first();
    if (await item.count()) {
        await item.click();
        await page.waitForTimeout(2500);
        const restored = await page.evaluate(() => {
            const p = window.__vm.runtime.controllerPanel;
            const names = p.getWidgetNames();
            const scr = p.getWidget('scr');
            return { names, scrType: scr && scr.type,
                bound: scr && scr.binding && scr.binding.variableName };
        });
        (restored.names.includes('scr') && restored.scrType === 'matrix' && restored.bound === 'screen')
            ? pass(`catalog example restores the faceplate (widgets: ${restored.names.join(',')}, scr→screen)`)
            : fail(`faceplate not restored from files.controller: ${JSON.stringify(restored)}`);
    } else {
        fail('mb05-faceplate-matrix not in the catalog (vendored examples stale?)');
    }
    }
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
    // the catalog scene replaced the project — restart the program so the
    // idle loop drives `screen` again
    await page.evaluate(() => window.__vm.greenFlag());
    // re-open the controller view to see the face
    await page.locator('[title="Controller"]').first().click().catch(() => {});
    await page.waitForTimeout(800);
    const seg = page.locator('[data-testid="bw-ctl-sevenseg-num"]');
    await seg.waitFor({ timeout: 10000 }).catch(() => fail('sevenseg face did not render'));
    // the program is still running: idle keeps screen=1 -> face shows "   1"
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="bw-ctl-sevenseg-num"]');
        return el && el.getAttribute('data-shown') === '   1';
    }, { timeout: 15000 })
        .then(() => pass('sevenseg shows the live variable (right-aligned "   1")'))
        .catch(async () => fail('sevenseg never showed 1: data-shown='
            + JSON.stringify(await seg.getAttribute('data-shown'))));
    // drive the variable to the X pattern value via button A: 18157905 does
    // not fit 4 digits -> dashes (the overflow contract)
    const btnA = page.locator('button').filter({ hasText: '●' }).first();
    await btnA.dispatchEvent('pointerdown');
    await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="bw-ctl-sevenseg-num"]');
        return el && el.getAttribute('data-shown') === '----';
    }, { timeout: 10000 })
        .then(() => pass('overflow renders dashes (8-digit value on a 4-digit face)'))
        .catch(async () => fail('overflow contract broken: data-shown='
            + JSON.stringify(await seg.getAttribute('data-shown'))));
    await btnA.dispatchEvent('pointerup');
}

await browser.close();
console.log(process.exitCode ? 'FACEPLATE GATE: FAIL' : 'FACEPLATE GATE: PASS');
process.exit(process.exitCode || 0);

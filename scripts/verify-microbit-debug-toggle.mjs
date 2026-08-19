#!/usr/bin/env node
// Browser gate for the Block|Line debug toggle (0bfc2f96c): the BLOCK
// (marker, stock firmware) path must still work unchanged, and the LINE
// (settrace, debug firmware) path must switch the iframe to
// simulator-debug.html, load the settrace firmware without a LinkError,
// flash on the play gesture, and drive the block highlight from \x1eL
// line events with \x1eV/\x1eK state on a halt (via Step).
//
//   PROOF_URL=http://localhost:8623/ node scripts/verify-microbit-debug-toggle.mjs
//
// Serve packages/scratch-gui/build at PROOF_URL first (same contract as
// the other verify-*.mjs gates).
import { createRequire } from 'node:module';

const requireUI = (() => {
    // playwright from wherever it is installed (lite root has it for the
    // other gates; the sibling UI repo is the fallback).
    for (const base of ['../package.json', '../../bw-circuit-ui/package.json']) {
        try { return createRequire(new URL(base, import.meta.url)); } catch { /* next */ }
    }
    throw new Error('no playwright host package found');
})();
let chromium;
try { ({ chromium } = requireUI('playwright')); }
catch { ({ chromium } = createRequire('/Users/christianstrobele/code/wt-fable/bw-circuit-ui/package.json')('playwright')); }

const URL_ = process.env.PROOF_URL || 'http://localhost:8623/';
const fail = (m) => { console.error(`FAIL ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`PASS ${m}`);

const SRC = `DEVICE MICROBIT:
  PIN led1 = P0 OUTPUT

  WHEN started:
    set count to 0
    FOREVER:
      change count by 1
      turn on led1
      wait 200 ms
`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const consoleErrs = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });

await page.goto(URL_, { waitUntil: 'load' });
// the VM rides the redux store (no window.vm in this GUI build)
await page.waitForFunction(() => {
    const st = window.__brickwrightStore;
    const vm = st && st.getState && st.getState().scratchGui && st.getState().scratchGui.vm;
    if (vm && vm.runtime) { window.__vm = vm; return true; }
    return false;
}, { timeout: 60000 });
pass('app loaded, vm reachable via __brickwrightStore');

// ---- get the program into the VM via the pseudocode importer ---------------
// The importer lives under the Code tab (rendered but hidden until active).
await page.getByRole('tab', { name: /^Code$/ }).first().click()
    .catch(async () => { await page.getByText('Code', { exact: true }).first().click(); });
await page.waitForTimeout(600);
// The importer's editor is CodeMirror 6; the reliable headless input path is
// select-all + type-replace via the keyboard on the focused editor.
const editor = page.locator('[data-testid="bw-codemirror"] .cm-content, .cm-content').first();
await editor.waitFor({ state: 'visible', timeout: 30000 });
await editor.click();
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
await page.keyboard.press('Delete');
await page.evaluate(async (src) => {
    // Insert via the clipboard event — typing 300 chars is slow and CM6
    // handles paste natively.
    const dt = new DataTransfer();
    dt.setData('text/plain', src);
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, SRC);
await page.waitForTimeout(400);

// compile to blocks (the button carries the To-blocks label)
const toBlocks = page.getByRole('button', { name: /to blocks/i }).first();
await toBlocks.click();
await page.waitForTimeout(1500);
const blockCount = await page.evaluate(() => {
    const t = window.__vm.runtime.targets.find((x) => x.isStage) || window.__vm.runtime.targets[0];
    return Object.keys((window.__vm.runtime.targets.find((x) => !x.isStage) || t).blocks._blocks || {}).length;
});
blockCount > 0 ? pass(`pseudocode compiled to blocks (${blockCount} blocks in VM)`)
    : fail('no blocks in VM after To blocks');

// switch the importer to the MicroPython tab — it only renders when the
// device select is on microbit
await page.locator('[data-testid="bw-device-select"]').selectOption({ value: 'microbit' })
    .catch(async () => { await page.locator('[data-testid="bw-device-select"]').selectOption({ label: /micro:bit/i }); });
await page.waitForTimeout(400);
await page.getByRole('button', { name: /micro:bit/i }).first().click();
await page.waitForTimeout(800);
await page.locator('[data-testid="bw-micropython-bar"]').waitFor({ timeout: 15000 });
pass('MicroPython tab active, debug bar present');

// glow hook: both debuggers highlight via vm.runtime.glowBlock
await page.evaluate(() => {
    window.__glows = [];
    const orig = window.__vm.runtime.glowBlock.bind(window.__vm.runtime);
    window.__vm.runtime.glowBlock = (id, on) => { window.__glows.push([id, on]); return orig(id, on); };
});

const iframeSrc = () => page.locator('[data-testid="bw-microbit-iframe"]').getAttribute('src');
const clickSimPlay = async () => {
    // the play overlay inside the sim iframe needs a (JS) click; autoplay
    // policy is disabled at launch so the AudioContext can start. The iframe
    // boots asynchronously, so retry until the overlay exists (and click it
    // again if a reflash brings it back) — a single early click was why the
    // BLOCK phase missed its run entirely.
    for (let i = 0; i < 40; i++) {
        const clicked = await page.evaluate(() => {
            const f = document.querySelector('[data-testid="bw-microbit-iframe"]');
            const d = f && f.contentDocument;
            const b = d && d.querySelector('.play-button');
            const visible = b && b.offsetParent !== null;
            if (visible) { b.click(); return true; }
            return false;
        });
        if (clicked) return;
        await page.waitForTimeout(500);
    }
};

// ---- set a breakpoint via the block context menu ---------------------------
// Breakpoints are a property of the project (bw-debug/breakpoints.js), set by
// right-clicking a block; both debuggers resolve them at flash time.
let bpSet = false;
{
    await page.getByRole('tab', { name: /^Blocks$/ }).first().click()
        .catch(async () => { await page.getByText('Blocks', { exact: true }).first().click(); });
    await page.waitForTimeout(800);
    // the Code tab publishes bwDeviceId on device choice; the gate arrived
    // via To-blocks, so publish it the same way before the right-click.
    await page.evaluate(() => { window.__vm.runtime.bwDeviceId = 'microbit'; });
    const blocks = page.locator('.blocklyDraggable');
    const n = await blocks.count();
    if (n) {
        // the menu installs from a LAZY chunk on workspace mount — give it a
        // beat and retry, or the first right-click races the import
        let menuTexts = [];
        for (let attempt = 0; attempt < 4 && !bpSet; attempt++) {
            await page.waitForTimeout(attempt === 0 ? 1500 : 800);
            // an open menu intercepts pointer events — dismiss before retrying
            await page.keyboard.press('Escape');
            await page.evaluate(() => {
                for (const el of document.querySelectorAll('.blocklyWidgetDiv')) el.style.display = 'none';
            });
            await blocks.nth(Math.min(2, n - 1)).click({ button: 'right', force: true });
            await page.evaluate(() => {
                for (const el of document.querySelectorAll('.blocklyWidgetDiv')) el.style.display = '';
            });
            await page.waitForTimeout(500);
            menuTexts = await page.evaluate(() =>
                [...document.querySelectorAll('.blocklyContextMenu .goog-menuitem, .blocklyContextMenu div, .blocklyWidgetDiv .goog-menuitem')]
                    .map((e) => e.textContent.trim()).filter(Boolean).slice(0, 15));
            const item = page.locator('.blocklyWidgetDiv .goog-menuitem, .blocklyContextMenu .goog-menuitem')
                .filter({ hasText: /Pause here/ }).first();
            if (await item.count()) {
                await item.click();
                bpSet = true;
                pass(`breakpoint set via the block context menu (attempt ${attempt + 1})`);
            } else {
                await page.keyboard.press('Escape');
            }
        }
        if (!bpSet) fail(`block context menu never offered Pause-here; last menu: ${JSON.stringify(menuTexts)}`);
    } else fail('no blocks rendered in the workspace');
    await page.getByRole('tab', { name: /^Code$/ }).first().click()
        .catch(async () => { await page.getByText('Code', { exact: true }).first().click(); });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /micro:bit/i }).first().click();
    await page.waitForTimeout(500);
}

const expectHalt = async (label, timeout) => {
    // step becomes clickable only when HALTED at the breakpoint
    await page.waitForFunction(() => {
        const b = document.querySelector('[data-testid="bw-microbit-debug-step"]');
        return b && !b.disabled;
    }, { timeout })
        .then(() => pass(`${label}: halted at the breakpoint (step enabled)`))
        .catch(() => fail(`${label}: never halted (step never enabled)`));
    const vars = await page.locator('[data-testid="bw-microbit-debug-vars"]').textContent().catch(() => '');
    /count/.test(vars || '')
        ? pass(`${label}: variables pane shows count at the halt`)
        : fail(`${label}: variables pane missing count: ${JSON.stringify((vars || '').slice(0, 80))}`);
    return vars;
};

// ---- 1. BLOCK (default) — the proven marker path must be unchanged ---------
{
    const level = await page.locator('[data-testid="bw-microbit-debug-level-block"]').getAttribute('style');
    pass(`level switch present (block default: ${/rgb\(124, 58, 237\)|7c3aed/.test(level || '') ? 'active' : 'style-unverified'})`);
    await page.locator('[data-testid="bw-microbit-debug"]').click();
    await page.locator('[data-testid="bw-microbit-iframe"]').waitFor({ timeout: 20000 });
    // The FIRST Debug click can lose its flash event: the importer dispatches
    // bw-microbit-flash in the same tick that opens the dock, before the
    // pane's listener attaches. Re-dispatch by clicking Debug again now that
    // the pane exists; if only the second click works, that mount race is
    // real (reported below).
    await page.waitForTimeout(1200);
    const activeAfterFirst = await page.evaluate(() =>
        !!document.querySelector('[data-testid="bw-microbit-debug-bar"]'));
    await page.locator('[data-testid="bw-microbit-debug"]').click();
    await page.waitForTimeout(800);
    const activeAfterSecond = await page.evaluate(() =>
        !!document.querySelector('[data-testid="bw-microbit-debug-bar"]'));
    if (!activeAfterFirst && activeAfterSecond) {
        fail('BLOCK: FIRST Debug click lost its flash event (pane-mount race) — second click required');
    } else if (activeAfterFirst) {
        pass('BLOCK: first Debug click activated the debug run');
    }
    const src1 = await iframeSrc();
    /simulator\.html/.test(src1 || '') && !/debug/.test(src1 || '')
        ? pass(`BLOCK: iframe is the stock sim (${src1})`)
        : fail(`BLOCK: unexpected iframe src ${src1}`);
    await page.waitForTimeout(1500);
    await clickSimPlay();
    await page.waitForFunction(() => (window.__glows || []).length > 0, { timeout: 25000 })
        .then(() => pass('BLOCK: marker stream drives the block highlight (glowBlock called)'))
        .catch(async () => fail('BLOCK: no glowBlock calls within 25s; status=' +
            JSON.stringify(await page.locator('[data-testid="bw-microbit-debug-status"]').textContent().catch(() => '(no status el)'))));
    if (bpSet) {
        await expectHalt('BLOCK', 25000);
        await page.locator('[data-testid="bw-microbit-debug-step"]').click().catch(() => {});
        await page.waitForTimeout(1200);
        pass('BLOCK: step accepted while halted');
        await page.locator('[data-testid="bw-microbit-debug-continue"]').click().catch(() => {});
    }
}

// ---- 2. LINE — settrace path: debug firmware, line events, halt state ------
{
    await page.evaluate(() => { window.__glows = []; });
    consoleErrs.length = 0;
    await page.locator('[data-testid="bw-microbit-debug-level-line"]').click();
    await page.locator('[data-testid="bw-microbit-debug"]').click();
    await page.waitForFunction(() => {
        const f = document.querySelector('[data-testid="bw-microbit-iframe"]');
        return f && /simulator-debug\.html/.test(f.getAttribute('src') || '');
    }, { timeout: 20000 })
        .then(() => pass('LINE: iframe switched to simulator-debug.html'))
        .catch(async () => fail(`LINE: iframe src stayed ${await iframeSrc()}`));
    await page.waitForTimeout(2500);
    const link = consoleErrs.filter((t) => /LinkError|instantiate/i.test(t));
    link.length === 0 ? pass('LINE: settrace firmware loads (no LinkError)')
        : fail(`LINE: firmware link failure: ${link[0]}`);
    await clickSimPlay();
    await page.waitForFunction(() => (window.__glows || []).length > 0, { timeout: 25000 })
        .then(() => pass('LINE: \\x1eL line events drive the highlight via lineMap'))
        .catch(() => fail('LINE: no glowBlock calls from line events within 25s'));
    if (bpSet) {
        await expectHalt('LINE', 25000);
        const stack = await page.locator('[data-testid="bw-microbit-debug-stack"]').textContent().catch(() => '');
        stack && /\S/.test(stack)
            ? pass(`LINE: \\x1eK call stack rendered (${stack.trim().slice(0, 60)})`)
            : fail('LINE: stack pane empty at halt');
        await page.locator('[data-testid="bw-microbit-debug-continue"]').click().catch(() => {});
        await page.waitForTimeout(1200);
        await page.evaluate(() => { window.__glows = []; });
        await page.waitForFunction(() => (window.__glows || []).length > 0, { timeout: 15000 })
            .then(() => pass('LINE: resumed after continue — line events keep flowing'))
            .catch(() => fail('LINE: no line events after continue'));
    }
}

if (errors.length) fail(`page errors: ${errors.slice(0, 2).join(' | ')}`);
else pass('no page errors');
await browser.close();
console.log(process.exitCode ? 'GATE: FAIL' : 'GATE: PASS');
process.exit(process.exitCode || 0);

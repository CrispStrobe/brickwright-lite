#!/usr/bin/env node
// Browser smoke for the Controller panel (the Mindstorms-style input
// surface): the stage-header Controller button opens the panel, a widget
// can be added from the palette, the vm.runtime.controllerPanel GUI
// handoff resolves, and operating the widget in the DOM moves the model.
//
//   PROOF_URL=http://localhost:8623/ node scripts/verify-controller-panel.mjs
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const fail = (m) => { console.error(`FAIL ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`PASS ${m}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
try {
await page.goto(process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => {
  const st = window.__brickwrightStore;
  const vm = st && st.getState && st.getState().scratchGui && st.getState().scratchGui.vm;
  if (vm && vm.runtime) { window.__vm = vm; return true; }
  return false;
}, { timeout: 60000 });

// 1. the stage-header Controller button
const showRight = page.getByRole('button', {name: 'Show right panel'});
if (await showRight.count()) await showRight.click();
const btn = page.locator('button[title="Controller"]:visible');
await btn.waitFor({state: 'visible', timeout: 15000});
await btn.click();

// 2. the panel renders with the Add Widget affordance
const canvas = page.getByTestId('bw-controller-canvas');
await canvas.waitFor({state: 'visible', timeout: 15000});
const add = page.getByText('+ Add Widget', {exact: true});
await add.waitFor({state: 'visible', timeout: 10000});
pass('controller panel renders (+ Add Widget present)');
const addFromPalette = async (label, expectedTestId) => {
  const closeInspector = page.getByTestId('bw-ctl-insp-ok');
  if (await closeInspector.count()) await closeInspector.click();
  await add.click();
  const item = page.getByText(label, {exact: true});
  await item.waitFor({state: 'visible', timeout: 5000});
  await item.click();
  const widget = page.getByTestId(expectedTestId);
  await widget.waitFor({state: 'visible', timeout: 10000});
  return widget;
};

// 3. add a slider
await addFromPalette('Slider', 'bw-ctl-widget-slider1');
pass('added a Slider widget via the palette');

// 4. the GUI handoff: vm.runtime.controllerPanel resolves and holds the widget
const model = await page.evaluate(() => {
  const p = window.__vm.runtime.controllerPanel;
  if (!p) return { ok: false };
  const widgets = p._widgets ? [...p._widgets.values()] : [];
  return { ok: true, count: widgets.length, first: widgets[0] && { name: widgets[0].name, type: widgets[0].type, value: widgets[0].state && widgets[0].state.value } };
});
model.ok ? pass(`vm.runtime.controllerPanel resolves (${model.count} widget(s): ${JSON.stringify(model.first)})`)
  : fail('vm.runtime.controllerPanel is not set');

// 5. operate the slider in the DOM and confirm the MODEL moves
const range = page.locator('input[type="range"]').first();
if (await range.count()) {
  const before = await page.evaluate(() => {
    const p = window.__vm.runtime.controllerPanel;
    const w = [...p._widgets.values()][0];
    return w.state.value;
  });
  await range.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, el.max || 100);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(value => window.__vm.runtime.controllerPanel.getWidget('slider1')?.state.value !== value, before);
  const after = await page.evaluate(() => {
    const p = window.__vm.runtime.controllerPanel;
    const w = [...p._widgets.values()][0];
    return w.state.value;
  });
  after !== before ? pass(`operating the slider updates the model (${before} -> ${after})`)
    : fail(`slider moved in DOM but model stuck at ${after}`);
} else {
  fail('no range input rendered for the slider widget');
}
// ═══ Widgets-editor scenes ═══════════════════════════════════════════════

// helper: the selected widget's live layout, straight from the model
const layoutOf = (name) => page.evaluate((n) => {
    const w = window.__vm.runtime.controllerPanel.getWidget(n);
    return w ? { ...w.layout } : null;
}, name);

// -- edit mode + select ------------------------------------------------------
await page.evaluate(() => window.__vm.runtime.controllerPanel.setMode('edit'));
await page.waitForFunction(() => window.__vm.runtime.controllerPanel.mode === 'edit');
const card = page.locator('[data-testid="bw-ctl-widget-slider1"]');
await card.waitFor({ timeout: 10000 }).catch(() => fail('positioned widget wrapper missing'));
await card.dispatchEvent('pointerdown', { pointerId: 9, clientX: 300, clientY: 300 });
await card.dispatchEvent('pointerup', { pointerId: 9 });
await page.getByTestId('bw-ctl-inspector').waitFor({state: 'visible', timeout: 5000});
pass('click selects; inspector opens');

// -- drag with grid snap -----------------------------------------------------
{
    const before = await layoutOf('slider1');
    const bb = await card.boundingBox();
    await page.mouse.move(bb.x + 10, bb.y + 10);
    await page.mouse.down();
    await page.mouse.move(bb.x + 10 + 37, bb.y + 10 + 21, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(({x, y}) => {
        const L = window.__vm.runtime.controllerPanel.getWidget('slider1')?.layout;
        return L && (L.x !== x || L.y !== y);
    }, before);
    const after = await layoutOf('slider1');
    const moved = after.x !== before.x || after.y !== before.y;
    const snapped = after.x % 8 === 0 && after.y % 8 === 0;
    (moved && snapped)
        ? pass(`drag moves with 8px grid snap (${before.x},${before.y} -> ${after.x},${after.y})`)
        : fail(`drag/snap broken: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
}

// -- resize handle ------------------------------------------------------------
{
    const handle = page.locator('[data-testid="bw-ctl-resize-slider1"]');
    await handle.waitFor({ timeout: 5000 }).catch(() => fail('no resize handle on selection'));
    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + 7, hb.y + 7);
    await page.mouse.down();
    await page.mouse.move(hb.x + 7 + 45, hb.y + 7 + 30, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => {
        const L = window.__vm.runtime.controllerPanel.getWidget('slider1')?.layout;
        return Number.isFinite(L?.w) && Number.isFinite(L?.h);
    });
    const L = await layoutOf('slider1');
    (typeof L.w === 'number' && L.w % 8 === 0 && typeof L.h === 'number' && L.h % 8 === 0)
        ? pass(`corner resize sets snapped w/h (${L.w}x${L.h})`)
        : fail(`resize broken: ${JSON.stringify(L)}`);
}

// -- rotate via the inspector (deterministic) --------------------------------
{
    await page.locator('[data-testid="bw-ctl-insp-rotation"]').fill('45');
    await page.waitForFunction(() => window.__vm.runtime.controllerPanel.getWidget('slider1')?.layout.rotation === 45);
    await card.waitFor({state: 'visible'});
    const L = await layoutOf('slider1');
    const style = await card.getAttribute('style');
    (L.rotation === 45 && /rotate\(45deg\)/.test(style || ''))
        ? pass('rotation 45deg lands in layout AND the transform')
        : fail(`rotation broken: layout=${L.rotation} style=${JSON.stringify((style || '').slice(0, 120))}`);
}

// -- colour + label -----------------------------------------------------------
{
    await page.locator('[data-testid="bw-ctl-insp-color"]')
        .evaluate((el) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, '#ff0000');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
    await page.locator('[data-testid="bw-ctl-insp-label"]').fill('Throttle');
    await page.waitForFunction(() => {
        const L = window.__vm.runtime.controllerPanel.getWidget('slider1')?.layout;
        return L?.color === '#ff0000' && L?.label === 'Throttle';
    });
    await page.getByTestId('bw-ctl-title-slider1').getByText('Throttle', {exact: true}).waitFor({state: 'visible'});
    const L = await layoutOf('slider1');
    const title = await page.locator('[data-testid="bw-ctl-title-slider1"]').textContent();
    (L.color === '#ff0000' && L.label === 'Throttle' && title.trim() === 'Throttle')
        ? pass('colour + label set and rendered')
        : fail(`colour/label broken: ${JSON.stringify(L)} title=${JSON.stringify(title)}`);
}

// -- rename keeps the binding -------------------------------------------------
{
    await page.evaluate(() => window.__vm.runtime.controllerPanel.bindToVariable('slider1', 'speed'));
    const nameInput = page.locator('[data-testid="bw-ctl-insp-name"]');
    await nameInput.fill('throttle');
    await nameInput.press('Enter');
    await page.waitForFunction(() => {
        const p = window.__vm.runtime.controllerPanel;
        return !p.getWidget('slider1') && p.getWidget('throttle')?.binding?.variableName === 'speed';
    });
    const r = await page.evaluate(() => {
        const p = window.__vm.runtime.controllerPanel;
        const w = p.getWidget('throttle');
        return { old: !!p.getWidget('slider1'), exists: !!w,
            binding: w && w.binding && w.binding.variableName };
    });
    (!r.old && r.exists && r.binding === 'speed')
        ? pass('rename via inspector keeps the variable binding')
        : fail(`rename broken: ${JSON.stringify(r)}`);
}

// -- free text ---------------------------------------------------------------
{
    const note = await addFromPalette('text', 'bw-ctl-widget-text1');
    await page.evaluate(() => window.__vm.runtime.controllerPanel.setWidgetLayout('text1', {x: 240, y: 24}));
    await note.click({force: true, position: {x: 5, y: 5}});
    await page.getByTestId('bw-ctl-inspector').waitFor({state: 'visible', timeout: 5000});
    await page.getByTestId('bw-ctl-insp-cfg-text').fill('HELLO FACE');
    const shown = await page.locator('[data-testid="bw-ctl-text-text1"]').textContent();
    shown === 'HELLO FACE'
        ? pass('free-text decoration renders its edited text')
        : fail(`text decoration broken: ${JSON.stringify(shown)}`);
}

// -- free image via upload ----------------------------------------------------
{
    const pic = await addFromPalette('image', 'bw-ctl-widget-image1');
    await page.evaluate(() => window.__vm.runtime.controllerPanel.setWidgetLayout('image1', {x: 240, y: 120}));
    await pic.click({force: true, position: {x: 5, y: 5}});
    await page.getByTestId('bw-ctl-inspector').waitFor({state: 'visible', timeout: 5000});
    const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('[data-testid="bw-ctl-insp-upload"]').setInputFiles({
        name: 'dot.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => {
        const img = document.querySelector('img[data-testid="bw-ctl-image-image1"]');
        return img && /^data:image\/png/.test(img.getAttribute('src') || '');
    }, { timeout: 10000 })
        .then(() => pass('image decoration: upload lands as a dataURL <img>'))
        .catch(() => fail('image upload never rendered'));
    const libBtn = await page.locator('[data-testid="bw-ctl-insp-library"]').count();
    if (!libBtn) fail('no library button');
    else {
        await page.locator('[data-testid="bw-ctl-insp-library"]').click();
        // the lazy chunk + costume catalogue load, then the modal grid renders
        const opened = await page.waitForFunction(() => {
            const items = document.querySelectorAll('[class*="library-item"], [class*="libraryItem"]');
            return items.length > 10;
        }, { timeout: 20000 }).then(() => true).catch(() => false);
        opened ? pass('Scratch-library picker opens with the costume catalogue')
            : fail('library modal never rendered its items');
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
            const closers = document.querySelectorAll('[class*="header-close"], [aria-label="Close"]');
            if (closers[0]) closers[0].click();
        });
        await page.waitForFunction(() => document.querySelectorAll('[class*="library-item"], [class*="libraryItem"]').length === 0);
    }
}

// -- everything survives save/reload -----------------------------------------
{
    const roundtrip = await page.evaluate(async () => {
        const mod = await import('./chunks/bw-board.js').catch(() => null);
        const p = window.__vm.runtime.controllerPanel;
        const json = p.toJSON();
        // restore through the SAME class (reachable via the panel's constructor)
        const P = p.constructor;
        const r = P.fromJSON(JSON.parse(JSON.stringify(json)));
        const th = r.getWidget('throttle');
        const note = r.getWidget('text1');
        const pic = r.getWidget('image1');
        return {
            throttle: th && { layout: th.layout, binding: th.binding },
            noteText: note && note.config.text,
            picSrc: pic && pic.config.src.slice(0, 20),
        };
    });
    (roundtrip.throttle && roundtrip.throttle.layout.rotation === 45
        && roundtrip.throttle.layout.color === '#ff0000'
        && roundtrip.throttle.layout.label === 'Throttle'
        && roundtrip.throttle.binding.variableName === 'speed'
        && roundtrip.noteText === 'HELLO FACE'
        && String(roundtrip.picSrc).startsWith('data:image/png'))
        ? pass('save/reload: layout + colour + label + binding + text + image all survive')
        : fail(`round-trip broken: ${JSON.stringify(roundtrip)}`);
}

if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);
} catch (error) {
    fail(error.stack || error.message);
} finally {
    if (process.exitCode) {
        await mkdir(path.resolve('artifacts'), {recursive: true});
        await page.screenshot({path: path.resolve('artifacts/verify-controller-panel-failure.png'), fullPage: true}).catch(() => {});
        await writeFile(path.resolve('artifacts/verify-controller-panel-page-errors.txt'), `${pageErrors.join('\n')}\n`).catch(() => {});
    }
    await browser.close();
}
console.log(process.exitCode ? 'CONTROLLER SMOKE: FAIL' : 'CONTROLLER SMOKE: PASS');

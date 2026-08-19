#!/usr/bin/env node
// Browser smoke for the Controller panel (the Mindstorms-style input
// surface): the stage-header Controller button opens the panel, a widget
// can be added from the palette, the vm.runtime.controllerPanel GUI
// handoff resolves, and operating the widget in the DOM moves the model.
//
//   PROOF_URL=http://localhost:8623/ node scripts/verify-controller-panel.mjs
import { createRequire } from 'node:module';
let chromium;
for (const base of ['../package.json', '/Users/christianstrobele/code/wt-fable/bw-circuit-ui/package.json']) {
    try { ({ chromium } = createRequire(new URL(base, import.meta.url).pathname ? new URL(base, import.meta.url) : base)('playwright')); break; }
    catch { try { ({ chromium } = createRequire(base)('playwright')); break; } catch { /* next */ } }
}
const fail = (m) => { console.error(`FAIL ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`PASS ${m}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerr]', String(e).slice(0, 120)));
await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:8623/', { waitUntil: 'load' });
await page.waitForFunction(() => {
  const st = window.__brickwrightStore;
  const vm = st && st.getState && st.getState().scratchGui && st.getState().scratchGui.vm;
  if (vm && vm.runtime) { window.__vm = vm; return true; }
  return false;
}, { timeout: 60000 });

// 1. the stage-header Controller button
const btn = page.locator('[title="Controller"]').first();
await btn.waitFor({ timeout: 15000 }).catch(() => fail('no Controller button in the stage header'));
await btn.click();
await page.waitForTimeout(1200);

// 2. the panel renders with the Add Widget affordance
const add = page.getByText('+ Add Widget').first();
(await add.count()) ? pass('controller panel renders (+ Add Widget present)')
  : fail('panel did not render — no Add Widget');

// 3. add a slider
await add.click();
await page.waitForTimeout(400);
const sliderItem = page.getByText(/^Slider$/).first();
if (await sliderItem.count()) {
  await sliderItem.click();
  await page.waitForTimeout(600);
  pass('added a Slider widget via the palette');
} else {
  const texts = await page.evaluate(() => [...document.querySelectorAll('button, [role="menuitem"]')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 20));
  fail('no Slider entry after Add Widget; saw: ' + JSON.stringify(texts));
}

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
  await page.waitForTimeout(400);
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
await browser.close();
console.log(process.exitCode ? 'CONTROLLER SMOKE: FAIL' : 'CONTROLLER SMOKE: PASS');

/**
 * Production proof: the full MCU chain, user-visible, on the deployed app.
 *
 * For each device it authors a blink+print program in the Code tab, runs it
 * through the circuit debugger, and asserts five things a USER would see:
 *   1. the Level-1 position display moves while running
 *   2. the bench LED visibly blinks (wokwi shadow-DOM glow changes)
 *   3. serial output is visible in the page (innerText, not textContent)
 *   4. pause freezes the position display
 *   5. block step moves it again
 *
 * Probe law, learned the hard way (each clause cost a real debugging pass):
 *   - accept dialogs explicitly; goto with domcontentloaded (load can hang)
 *   - interact only with VISIBLE elements — a stage portal renders a second,
 *     hidden copy of the circuit UI and `.first()` loves it
 *   - user-visible text means innerText: textContent happily reads the
 *     hidden Code tab's source and "proves" serial that isn't there
 *   - LED glow lives in the wokwi component's SHADOW DOM opacity — outer
 *     SVG innerHTML/length/substring-count metrics all miss in-place value
 *     changes
 *   - never assert on window.__board: it is the DESIGNER's board and lies
 *     during a debug session (window.__activeBoard exists for diagnosis,
 *     but this script asserts what the USER sees, not internals)
 *   - the hosted compile takes seconds; wait ~12 s after Run before judging
 *
 * Usage:
 *   node scripts/proof-production.mjs                # both devices, prod URL
 *   node scripts/proof-production.mjs pico           # one device
 *   PROOF_URL=http://localhost:8601 node scripts/proof-production.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';

const DEVICES = {
  nano: {
    program: `DEVICE ARDUINO-NANO
PIN led1 = D13 OUTPUT

WHEN flag clicked:
  FOREVER:
    turn on led1
    wait 0.5 seconds
    turn off led1
    wait 0.5 seconds

WHEN flag clicked:
  FOREVER:
    print "hi from nano"
    wait 1 seconds
`,
    serial: 'hi from nano',
  },
  pico: {
    program: `DEVICE PICO
PIN led1 = GP15 OUTPUT

WHEN flag clicked:
  FOREVER:
    turn on led1
    wait 0.5 seconds
    turn off led1
    wait 0.5 seconds

WHEN flag clicked:
  FOREVER:
    print "hi from pico"
    wait 1 seconds
`,
    serial: 'hi from pico',
  },
};

async function proveDevice(browser, name, cfg) {
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());
  const results = {};
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    await page.click('text=Code ⇄ Blocks');
    await page.waitForTimeout(1200);
    await page.locator('textarea').first().fill(cfg.program);
    await page.click('text=⇦ To blocks');
    await page.waitForTimeout(2500);

    await page.click('text=🔌 Circuit');
    await page.waitForTimeout(2000);
    const vis = (sel) => page.locator(sel).locator('visible=true');
    const sw = vis('text=Switch to debugger');
    if (await sw.count()) { await sw.first().click(); await page.waitForTimeout(2000); }

    await vis('button:has-text("▶ Run")').first().click();
    await page.waitForTimeout(12000); // hosted compile + boot

    const panel = () => page.evaluate(() =>
      [...document.querySelectorAll('div,span,pre,code')]
        .filter(e => e.children.length === 0 && /state \d|RUNNING|PAUSED|ms ·/i.test(e.textContent))
        .map(e => e.textContent.trim().slice(0, 80))
        .filter((v, i, a) => a.indexOf(v) === i).slice(0, 12));
    const glow = () => page.evaluate(() =>
      [...document.querySelectorAll('*')].filter(e => e.tagName === 'WOKWI-LED')
        .map(e => (e.shadowRoot?.innerHTML.match(/opacity:[^;"]*/g) || []).join(',')).join('|'));

    // 1. Position moves. Sample TWICE per state: a deduplicated list can
    //    saturate once both states have appeared, so compare state VALUES
    //    across a window rather than one pair of snapshots.
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      for (const t of await panel()) { const m = t.match(/state (\d+)/); if (m) seen.add(m[1]); }
      await page.waitForTimeout(400);
    }
    results.positionLive = seen.size >= 2 ||
      JSON.stringify(await panel()) !== JSON.stringify(await panel());

    // 2. LED glow changes across blink phases.
    const glows = new Set();
    for (let i = 0; i < 8; i++) { glows.add(await glow()); await page.waitForTimeout(250); }
    results.ledBlinks = glows.size >= 2;

    // 3. Serial user-visible.
    results.serialVisible = await page.evaluate(
      (needle) => document.body.innerText.includes(needle), cfg.serial);

    // 4. Pause freezes.
    await vis('button:has-text("⏸ Pause")').first().click();
    await page.waitForTimeout(1000);
    const p1 = await panel();
    await page.waitForTimeout(1500);
    const p2 = await panel();
    results.pauseFrozen = JSON.stringify(p1) === JSON.stringify(p2)
      && p1.some(t => /PAUSED/.test(t));

    // 5. Step moves.
    await vis('button:has-text("⏭ Step")').first().click();
    await page.waitForTimeout(1500);
    results.stepMoves = JSON.stringify(await panel()) !== JSON.stringify(p1);
  } catch (e) {
    results.error = String(e).slice(0, 200);
  } finally {
    await page.close();
  }
  return results;
}

const only = process.argv[2];
const browser = await chromium.launch();
let failed = false;
for (const [name, cfg] of Object.entries(DEVICES)) {
  if (only && name !== only) continue;
  const r = await proveDevice(browser, name, cfg);
  const line = ['positionLive', 'ledBlinks', 'serialVisible', 'pauseFrozen', 'stepMoves']
    .map(k => `${k}=${r[k] ? 'PASS' : 'FAIL'}`).join(' ');
  console.log(`${name}: ${line}${r.error ? ' ERROR: ' + r.error : ''}`);
  if (r.error || Object.values(r).some(v => v === false)) failed = true;
}
await browser.close();
process.exit(failed ? 1 : 0);

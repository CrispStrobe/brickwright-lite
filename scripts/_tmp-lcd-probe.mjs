// In-browser verification of the I2C LCD chain on the DEPLOYED app:
// load "I2C LCD: hello + counter" (stc12) in the Circuit tab, run the
// debugger, and read what the LCD FACE actually shows.
import { chromium } from 'playwright';

const url = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 2000, height: 1100}});
page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
await page.waitForSelector('[role="tab"]', {timeout: 60000});
await page.locator('[role="tab"]', {hasText: 'Circuit'}).first().click();
await page.waitForTimeout(2500);

// Find and load the example (search narrows the list).
try {
    await page.locator('input[placeholder*="earch"]').last().fill('I2C LCD', {timeout: 4000});
    await page.waitForTimeout(600);
} catch { /* not searchable */ }
await page.locator('text=I2C LCD: hello').first().click();
await page.waitForTimeout(600);
const ok = page.locator('button', {hasText: /^OK$/}).first();
if (await ok.count()) await ok.click().catch(() => {});
await page.waitForTimeout(3500);

// Run the debugger from whatever pane offers it.
const run = page.locator('button', {hasText: /^▶?\s*Run$/}).first();
if (await run.count()) {
    await run.click({force: true});
    console.log('clicked Run');
} else {
    console.log('NO RUN BUTTON FOUND');
}
await page.waitForTimeout(6000);

const state = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('text, [data-lcd] *, div')]
        .map(e => e.textContent && e.textContent.trim())
        .filter(t => t && /HI BRICKWRIGHT|COUNT/.test(t));
    const b = window.__activeBoard;
    let lcd = null;
    try {
        if (b && b.getParts) {
            const part = b.getParts().find(p => p.kind === 'char_lcd_i2c');
            if (part && b.getDeviceState) lcd = b.getDeviceState(part.id);
        }
    } catch (e) { lcd = 'err: ' + e.message; }
    return {
        faceHits: texts.slice(0, 3),
        deviceDisplay: lcd && lcd.display ? lcd.display : lcd,
        boardSource: window.__bwBoardSource || null,
    };
});
console.log('LCD PROBE:', JSON.stringify(state));
await page.screenshot({path: '/tmp/eyes-lcd.png'});
await browser.close();

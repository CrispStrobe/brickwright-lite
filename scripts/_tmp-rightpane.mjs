// Eyes on the Code-tab right pane: load an example so pins exist, open the
// Code tab, screenshot the right pane, and measure what overlaps what.
import { chromium } from 'playwright';

const url = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 2000, height: 1100}});
page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
await page.waitForSelector('[role="tab"]', {timeout: 60000});

// Load an example through the Circuit tab so a program with pins exists.
await page.locator('[role="tab"]', {hasText: 'Circuit'}).first().click();
await page.waitForTimeout(2500);
try {
    await page.locator('input[placeholder*="earch"]').last().fill('Blink an LED', {timeout: 4000});
    await page.waitForTimeout(500);
} catch { /* fine */ }
await page.locator('text=Blink an LED').first().click();
await page.waitForTimeout(500);
const ok = page.locator('button', {hasText: /^OK$/}).first();
if (await ok.count()) await ok.click().catch(() => {});
await page.waitForTimeout(3000);

// Now the Code tab.
await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
await page.waitForTimeout(2500);
await page.screenshot({path: '/tmp/eyes-rightpane.png'});

const m = await page.evaluate(() => {
    const solo = document.querySelector('[data-debugger-solo-pane]');
    const noCode = document.querySelector('[data-no-code-indicator]');
    const headerBtns = [...document.querySelectorAll('button')].filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.y < 120 && r.x > 1200;
    }).map(b => ({label: b.getAttribute('aria-label') || b.textContent.slice(0, 12), y: Math.round(b.getBoundingClientRect().y), x: Math.round(b.getBoundingClientRect().x), h: Math.round(b.getBoundingClientRect().height)}));
    const r = solo ? solo.getBoundingClientRect() : null;
    const first = solo ? solo.firstElementChild : null;
    const fr = first ? first.getBoundingClientRect() : null;
    return {
        soloPane: r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null,
        firstChildTop: fr ? Math.round(fr.y) : null,
        noCodeTop: noCode ? Math.round(noCode.getBoundingClientRect().y) : null,
        headerButtonsNearby: headerBtns.slice(0, 6),
    };
});
console.log('RIGHTPANE:', JSON.stringify(m));
await browser.close();

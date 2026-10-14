// Eyes-on verification: screenshot the About dialog and the Circuit tab
// layout, and MEASURE what the owner measures.
import { chromium } from 'playwright';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 2000, height: 1100}});
page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
await page.waitForSelector('[role="tab"]', {timeout: 60000});

// 1. About dialog
await page.locator('div[class*="menu-bar"] >> text=Settings').first().click();
await page.waitForTimeout(300);
const about = page.locator('text=About').first();
if (await about.count()) {
    await about.click();
    await page.waitForTimeout(600);
    const dlg = page.locator('[class*="dialog"]').last();
    if (await dlg.count()) {
        const m = await dlg.evaluate(el => {
            const bad = [];
            const box = el.getBoundingClientRect();
            for (const p of el.querySelectorAll('p, td, h1, h2, div')) {
                const r = p.getBoundingClientRect();
                if (r.right > box.right + 2 && p.textContent.trim()) {
                    bad.push(p.textContent.slice(0, 40));
                }
                if (bad.length > 4) break;
            }
            return {clipped: bad, scrollX: el.scrollWidth > el.clientWidth + 2};
        });
        console.log('ABOUT overflow-right elements:', JSON.stringify(m.clipped));
        console.log('ABOUT horizontal scroll needed:', m.scrollX);
        await page.screenshot({path: '/tmp/eyes-about.png'});
        await page.keyboard.press('Escape');
    } else console.log('ABOUT: dialog not found');
} else console.log('ABOUT: menu item not found');
await page.waitForTimeout(300);

// 2. Circuit tab layout
await page.locator('[role="tab"]', {hasText: 'Circuit'}).first().click();
await page.waitForTimeout(3000);
const layout = await page.evaluate(() => {
    const canvas = document.querySelector('[data-canvas]');
    const panel = document.querySelector('[data-debugger-solo-pane]') ||
        [...document.querySelectorAll('div')].find(d => /Debugger|Run/.test(d.textContent) && d.getBoundingClientRect().width < 500 && d.getBoundingClientRect().width > 100);
    const win = {w: document.documentElement.clientWidth, h: document.documentElement.clientHeight};
    const c = canvas ? canvas.getBoundingClientRect() : null;
    return {
        win,
        canvas: c ? {x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), right: Math.round(c.right), bottom: Math.round(c.bottom)} : null,
        rightPaneVisible: panel ? (panel.getBoundingClientRect().right <= win.w + 1) : 'panel-not-found',
        rightPaneRight: panel ? Math.round(panel.getBoundingClientRect().right) : null,
    };
});
console.log('LAYOUT:', JSON.stringify(layout));
const chain = await page.evaluate(() => {
    const el = document.querySelector('[data-canvas]');
    const out = [];
    let n = el;
    for (let i = 0; n && i < 10; i++) {
        const r = n.getBoundingClientRect();
        out.push({tag: n.tagName, cls: (n.className && String(n.className).slice(0, 30)) || (n.dataset ? Object.keys(n.dataset)[0] : ''), w: Math.round(r.width), x: Math.round(r.x)});
        n = n.parentElement;
    }
    return out;
});
console.log('CHAIN:', JSON.stringify(chain));
await page.screenshot({path: '/tmp/eyes-circuit.png'});
await browser.close();

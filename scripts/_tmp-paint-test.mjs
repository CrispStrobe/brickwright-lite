import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('dialog', d => d.accept());
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.addInitScript(() => { localStorage.clear(); });
await page.goto(process.env.BW_URL, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click();
await page.waitForTimeout(2500);
await page.locator('input[placeholder*="earch"], input[type="search"]').first().fill('VDP');
await page.waitForTimeout(800);
await page.locator('text=/6502 \\+ VDP/i').first().click();
await page.waitForTimeout(3500);
await page.locator('button', { hasText: 'Build Machine' }).first().click();
await page.waitForTimeout(1500);
// Load Tali? No — no preset needed: use the FILE path? Use the asm stash via evaluate:
// dispatch a prebuilt ROM directly through the media event, staying on the Circuit tab.
await page.evaluate(() => {
  const rom = new Uint8Array(0x8000).fill(0xea);
  rom.set([0xa9,0xe0,0x8d,0x01,0x40,0xa9,0x81,0x8d,0x01,0x40,0xa9,0xf5,0x8d,0x01,0x40,0xa9,0x87,0x8d,0x01,0x40,0x4c,0x14,0x80], 0);
  rom[0x7ffa]=0; rom[0x7ffb]=0x80; rom[0x7ffc]=0; rom[0x7ffd]=0x80; rom[0x7ffe]=0; rom[0x7fff]=0x80;
  window.dispatchEvent(new CustomEvent('bw-machine-media-load', { detail: { slotId: 'rom', bytes: rom, kind: 'eater6502', name: 'probe.bin' } }));
});
await page.waitForTimeout(6000);
const r1 = await page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find(c => c.width === 256 && c.height === 192);
  if (!c) return 'no vdp canvas';
  const d = c.getContext('2d').getImageData(96, 96, 1, 1).data;
  return `mid px before: ${d[0]},${d[1]},${d[2]},${d[3]}`;
});
console.log('R1:', r1);
// rAF liveness
console.log('RAF-alive:', await page.evaluate(() => new Promise(res => {
  let n = 0; const probe = () => { n++; if (n < 10) requestAnimationFrame(probe); else res('rAF ticks fine'); };
  requestAnimationFrame(probe); setTimeout(() => res('rAF DEAD after ' + n), 2000);
})));
// manual paint from the live target
console.log('MANUAL:', await page.evaluate(() => {
  const t = window.__benchTarget; if (!t) return 'no target';
  const v = t.video(); if (!v) return 'no frame';
  const c = [...document.querySelectorAll('canvas')].find(c => c.width === 256 && c.height === 192);
  if (!c) return 'no canvas';
  c.getContext('2d').putImageData(new ImageData(v.rgba, v.width, v.height), 0, 0);
  const d = c.getContext('2d').getImageData(96, 96, 1, 1).data;
  return `after manual paint: ${d[0]},${d[1]},${d[2]},${d[3]} (frame ${v.frame})`;
}));
await page.waitForTimeout(1500);
console.log('R2:', await page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find(c => c.width === 256 && c.height === 192);
  const d = c.getContext('2d').getImageData(96, 96, 1, 1).data;
  return `mid px 1.5s after manual: ${d[0]},${d[1]},${d[2]},${d[3]}`;
}));
await page.screenshot({ path: '/tmp/paint-test.png' });
await browser.close();

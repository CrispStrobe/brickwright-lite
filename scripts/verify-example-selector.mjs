#!/usr/bin/env node
/** Browser acceptance for the Code-tab example selector and game gallery. */
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

const NEW_GAMES = [
    'Skyline Swoop', 'Contrail Panic', 'Aegis Arc', 'Prism Lock', 'Core Cascade', 'Neon Relay',
    'Rift Rally', 'Slipstream Circuit', 'Abyss Lift', 'Wardlight', 'Pantry Prowl', 'Nimbus Volley',
    'Ember Parry', 'Tidegate Rush', 'Blue-Line Breaker', 'Orbit Hoops', 'Comet Strikers', 'Echo Trench',
    'Whisker Relay', 'Helix Rush', 'Moonbank Hop', 'Crosswind Courier', 'Lumen Stack', 'Plasma Posse',
    'Halo Lockdown', 'Carrier Kestrel', 'Skycourt Surge', 'Chromafall Reactor', 'Cratercoil', 'Magma Lift'
];

try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();

    const device = page.locator('[data-testid="bw-device-select"]');
    await device.waitFor({timeout: 10000});
    const firstDevice = await device.locator('option').first().textContent();
    check('Code starts in no-chip mode', await device.inputValue() === '' && /no chips/i.test(firstDevice || ''),
        `value=${await device.inputValue()} label=${firstDevice}`);

    const games = page.locator('[data-testid="bw-load-example"]');
    const labels = await games.locator('option').allTextContents();
    const missing = NEW_GAMES.filter(name => !labels.some(label => label.includes(name)));
    check('all quality-approved games are visible in the gallery', missing.length === 0,
        missing.length ? `missing: ${missing.join(', ')}` : `${NEW_GAMES.length} present`);
    check('the hardware catalog is hidden in no-chip mode',
        await page.locator('[data-testid="bw-catalog-toggle"]').count() === 0);

    await games.selectOption('sky_skim');
    await page.waitForFunction(() => /Skyline Swoop/.test(document.querySelector('.cm-content')?.textContent || ''),
        null, {timeout: 10000});
    const source = await page.locator('.cm-content').textContent();
    check('a game loads as editable pseudocode', /Skyline Swoop/.test(source || '') && /WHEN flag clicked/.test(source || ''));

    await device.selectOption('arduino-uno');
    const catalogToggle = page.locator('[data-testid="bw-catalog-toggle"]');
    await catalogToggle.waitFor({timeout: 10000});
    check('choosing hardware swaps the game selector for the catalog',
        await games.count() === 0 && await catalogToggle.count() === 1);
    await catalogToggle.click();
    const catalogItems = page.locator('[data-testid="bw-catalog-item"]');
    await catalogItems.first().waitFor({timeout: 15000});
    const before = await catalogItems.count();
    check('the Arduino catalog is substantial', before > 20, `${before} examples`);

    const search = page.locator('[data-testid="bw-catalog-search"]');
    await search.fill('blink');
    await page.waitForTimeout(250);
    const after = await catalogItems.count();
    const filtered = await catalogItems.allTextContents();
    check('catalog search narrows to matching examples',
        after > 0 && after < before && filtered.every(label => /blink/i.test(label)), `${before} -> ${after}`);
} catch (error) {
    check('example-selector browser journey completes', false, String(error).slice(0, 300));
} finally {
    await browser.close();
}

console.log(failures.length ? `\n${failures.length} example-selector check(s) failed.` : '\nAll example-selector checks passed.');
process.exit(failures.length ? 1 : 0);

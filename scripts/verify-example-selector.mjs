#!/usr/bin/env node
/** Browser acceptance for the Code-tab example selector and game gallery. */
import {chromium} from 'playwright';
import {openCodeActions} from './lib-code-actions.mjs';

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
    // The packaged GUI keeps the VM in Redux rather than exporting a global.
    // Expose the same object the other browser gates use so this journey can
    // prove that selection changes both the editor text and the live runtime.
    await page.waitForFunction(() => {
        const store = window.__brickwrightStore;
        const vm = store?.getState?.()?.scratchGui?.vm;
        if (vm?.runtime) {
            window.__vm = vm;
            return true;
        }
        return false;
    }, null, {timeout: 60000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();

    const device = page.locator('[data-testid="bw-device-select"]');
    await device.waitFor({timeout: 10000});
    const firstDevice = await device.locator('option').first().textContent();
    check('Code starts in no-chip mode', await device.inputValue() === '' && /no chips/i.test(firstDevice || ''),
        `value=${await device.inputValue()} label=${firstDevice}`);

    // Open / Save / examples / catalog live behind the `⋯` menu since the UI
    // consolidation. Opening it is the user's click, not a shortcut around one:
    // everything below still has to find and use the real control.
    check('the Code tab offers an actions menu', await openCodeActions(page));

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
    // The device select sits OUTSIDE the menu, and re-rendering the menu's
    // contents does not close it — but assert that rather than assume it.
    await openCodeActions(page);
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

    // Reproduce the target-family regression with a real pin-bearing program.
    // A controlled <select> used to snap straight back to Arduino here because
    // retargetPseudocode had no pools for micro:bit/Arcade/SAMD51. Testing only
    // an empty project cannot see that failure.
    await search.fill('traffic light');
    const trafficLight = page.locator('[data-testid="bw-catalog-item"][title="14-traffic-light"]');
    await trafficLight.waitFor({timeout: 10000});
    await trafficLight.click();
    await page.waitForFunction(() => /PIN\s+red\s*=/.test(document.querySelector('.cm-content')?.textContent || ''),
        null, {timeout: 10000});

    const targetCases = [
        ['microbit', ['P0', 'P1', 'P2']],
        ['arcade', ['D0', 'D1', 'D2']],
        ['pybadge', ['D13', 'D12', 'D11']],
        ['pybadge-lc', ['D0', 'D1', 'D2']],
        ['samd51', ['PA8', 'PA9', 'PA10']]
    ];
    for (const [target, pins] of targetCases) {
        await device.selectOption(target);
        await page.waitForFunction(({target, pins}) => {
            const select = document.querySelector('[data-testid="bw-device-select"]');
            const source = document.querySelector('.cm-content')?.textContent || '';
            return select?.value === target && source.includes(`DEVICE ${target.toUpperCase()}`) &&
                pins.every(pin => source.includes(`= ${pin} OUTPUT`));
        }, {target, pins}, {timeout: 15000});
        const runtimeDevice = await page.evaluate(() => window.__vm?.runtime?.bwDeviceId);
        const status = await page.locator('[role="status"]').last().textContent().catch(() => '');
        check(`pin-bearing program selects ${target}`,
            await device.inputValue() === target && runtimeDevice === target && !/Cannot retarget/i.test(status || ''),
            `select=${await device.inputValue()} runtime=${runtimeDevice}`);
        if (target === 'microbit') {
            check('micro:bit target reveals its generated-code tab',
                await page.getByRole('button', {name: /micro:bit/i}).count() > 0);
        }
    }
} catch (error) {
    check('example-selector browser journey completes', false, String(error).slice(0, 300));
} finally {
    await browser.close();
}

console.log(failures.length ? `\n${failures.length} example-selector check(s) failed.` : '\nAll example-selector checks passed.');
process.exit(failures.length ? 1 : 0);

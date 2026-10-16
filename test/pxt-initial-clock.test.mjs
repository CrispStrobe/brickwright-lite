// Clock-only platform controls: no compiler, simulator or application imports.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {preparePxtInitialClock, assertPxtInitialClock} from './helpers/pxt-initial-clock.mjs';

let browser;
const hostDelay = () => new Promise(resolve => setTimeout(resolve, 150));
before(async () => {
    browser = await chromium.launch({headless: true, timeout: 10000, args: [
        '--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'
    ]});
}, {timeout: 12000});
after(async () => { await browser?.close(); });

test('initial clock stays zero across host delay and navigation; only runFor releases authored timers', {timeout: 5000}, async () => {
    const context = await browser.newContext({serviceWorkers: 'block', offline: true});
    const requests = [];
    await context.route('**/*', route => { requests.push(route.request().url()); return route.abort('blockedbyclient'); });
    try {
        await preparePxtInitialClock(context);
        await hostDelay();
        const page = await context.newPage();
        const zero = {date: 0, performance: 0, origin: 0};
        assert.deepEqual(await assertPxtInitialClock(page), {initial: zero, current: zero});
        await hostDelay();
        await page.goto('data:text/html,' + encodeURIComponent(`<script>
            globalThis.calls=[];
            setTimeout(()=>calls.push({kind:'timeout',date:Date.now(),time:performance.now()}),10);
            requestAnimationFrame(time=>calls.push({kind:'frame',date:Date.now(),time}));
        </script>`));
        await hostDelay();
        assert.deepEqual(await assertPxtInitialClock(page), {initial: zero, current: zero});
        assert.deepEqual(await page.evaluate(() => calls), []);
        await page.clock.runFor(9);
        assert.deepEqual(await page.evaluate(() => calls), []);
        await page.clock.runFor(1);
        assert.deepEqual(await page.evaluate(() => calls), [{kind: 'timeout', date: 10, time: 10}]);
        await page.clock.runFor(6);
        assert.deepEqual(await page.evaluate(() => calls), [
            {kind: 'timeout', date: 10, time: 10}, {kind: 'frame', date: 16, time: 16}
        ]);
        assert.deepEqual(requests, []);
    } finally { await context.close(); }
});

test('a live context is refused before clock setup', {timeout: 3000}, async () => {
    const context = await browser.newContext({serviceWorkers: 'block', offline: true});
    try {
        await context.newPage();
        await assert.rejects(preparePxtInitialClock(context), /requires an empty browser context/);
    } finally { await context.close(); }
});

test('missing initial clock observation cannot pass guest startup admission', {timeout: 3000}, async () => {
    const context = await browser.newContext({serviceWorkers: 'block', offline: true});
    try {
        const page = await context.newPage();
        await assert.rejects(assertPxtInitialClock(page), /was not paused at Date\/performance zero/);
    } finally { await context.close(); }
});

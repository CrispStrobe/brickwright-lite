// Clock-only platform controls: no compiler, simulator or application imports.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {preparePxtInitialClock, assertPxtInitialClock, bootstrapPxtProfilerClock} from './helpers/pxt-initial-clock.mjs';

let browser;
const hostDelay = () => new Promise(resolve => setTimeout(resolve, 150));
before(async () => {
    browser = await chromium.launch({headless: true, timeout: 10000,
        ...(process.env.BW_PXT_CLOCK_BROWSER_EXECUTABLE ?
            {executablePath: process.env.BW_PXT_CLOCK_BROWSER_EXECUTABLE} : {}), args: [
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

test('a full-frame positive bootstrap preserves actual relative frames, intervals and timeouts', {timeout: 8000}, async () => {
    const observations = [];
    for (const positive of [false, true]) {
        const context = await browser.newContext({serviceWorkers: 'block', offline: true});
        try {
            await preparePxtInitialClock(context);
            const page = await context.newPage();
            await assertPxtInitialClock(page);
            if (positive) {
                assert.deepEqual(await bootstrapPxtProfilerClock(page), {
                    initial: {date: 0, performance: 0, origin: 0},
                    current: {date: 16, performance: 16, origin: 0}, version: '1.62.1', frameMs: 16
                });
            }
            await page.evaluate(() => {
                const origin = performance.now();
                globalThis.relativeCalls = [];
                const record = kind => relativeCalls.push({kind, at: performance.now() - origin});
                setTimeout(() => record('timeout'), 10);
                let intervals = 0;
                const interval = setInterval(() => {
                    record('interval');
                    if (++intervals === 2) clearInterval(interval);
                }, 10);
                requestAnimationFrame(() => {
                    record('frame');
                    requestAnimationFrame(() => record('frame'));
                });
            });
            await hostDelay();
            assert.deepEqual(await page.evaluate(() => relativeCalls), []);
            await page.clock.runFor(32);
            observations.push(await page.evaluate(() => relativeCalls));
        } finally { await context.close(); }
    }
    const expected = [
        {kind: 'timeout', at: 10}, {kind: 'interval', at: 10},
        {kind: 'frame', at: 16}, {kind: 'interval', at: 20}, {kind: 'frame', at: 32}
    ];
    assert.deepEqual(observations, [expected, expected]);
});

test('profiler bootstrap refuses an already-started guest and cannot run twice', {timeout: 5000}, async () => {
    for (const existingGuest of [false, true]) {
        const context = await browser.newContext({serviceWorkers: 'block', offline: true});
        try {
            await preparePxtInitialClock(context);
            const page = await context.newPage();
            if (existingGuest) {
                await page.evaluate(() => { globalThis.__bwPxtRuntime = {}; });
                await assert.rejects(bootstrapPxtProfilerClock(page), /fresh pre-guest page/);
                await assertPxtInitialClock(page);
            } else {
                await bootstrapPxtProfilerClock(page);
                await assert.rejects(bootstrapPxtProfilerClock(page), /was not paused/);
            }
        } finally { await context.close(); }
    }
});

test('guest startup during the bootstrap advance is refused after the actual timer runs', {timeout: 5000}, async () => {
    const context = await browser.newContext({serviceWorkers: 'block', offline: true});
    try {
        await preparePxtInitialClock(context);
        const page = await context.newPage();
        await page.evaluate(() => {
            setTimeout(() => { globalThis.__bwPxtRuntime = {startedAt: performance.now()}; }, 8);
        });
        await assert.rejects(bootstrapPxtProfilerClock(page), /lost its fresh pre-guest document/);
        assert.deepEqual(await page.evaluate(() => ({
            started: __bwPxtRuntime.startedAt,
            published: Object.hasOwn(globalThis, '__bwPxtProfilerBootstrap'),
            now: performance.now()
        })), {started: 8, published: false, now: 16});
    } finally { await context.close(); }
});

test('only one pending bootstrap can own a page', {timeout: 5000}, async () => {
    const context = await browser.newContext({serviceWorkers: 'block', offline: true});
    try {
        await preparePxtInitialClock(context);
        const page = await context.newPage();
        const first = bootstrapPxtProfilerClock(page);
        await assert.rejects(bootstrapPxtProfilerClock(page), /already pending/);
        assert.equal((await first).current.performance, 16);
    } finally { await context.close(); }
});

test('actual navigation across the advance boundary invalidates the retained document handle', {timeout: 5000}, async () => {
    const context = await browser.newContext({serviceWorkers: 'block', offline: true});
    try {
        await preparePxtInitialClock(context);
        const page = await context.newPage();
        const originalRunFor = page.clock.runFor;
        let advances = 0;
        // Exercise real navigation at the await boundary and still invoke the
        // original clock advance with the original receiver and requested time.
        page.clock.runFor = async function (ms) {
            assert.equal(ms, 16);
            await page.goto('data:text/html,<title>replacement document</title>');
            const result = await originalRunFor.call(this, ms);
            advances++;
            return result;
        };
        try {
            await assert.rejects(bootstrapPxtProfilerClock(page));
            assert.equal(advances, 1);
            assert.deepEqual(await page.evaluate(() => ({
                title: document.title, initial: __bwPxtInitialClock,
                now: performance.now(), published: Object.hasOwn(globalThis, '__bwPxtProfilerBootstrap')
            })), {title: 'replacement document', initial: {date: 0, performance: 0, origin: 0},
                now: 16, published: false});
        } finally { page.clock.runFor = originalRunFor; }
    } finally { await context.close(); }
});

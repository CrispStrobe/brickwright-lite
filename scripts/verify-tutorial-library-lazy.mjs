#!/usr/bin/env node
/**
 * Same-probe browser receipt for P15's tutorial deck/card/modal boundary.
 *
 * TUTORIAL_LIBRARY_EAGER_BASELINE=1 runs the five cold activation samples and
 * all successful user journeys against the eager implementation. It records
 * the expected missing named chunk as one red topology check, then skips the
 * impossible failed-fetch and stale-completion cases without waiting for a
 * request that cannot exist.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const eagerBaseline = process.env.TUTORIAL_LIBRARY_EAGER_BASELINE === '1';
// Five cold eager activations from hosted run 34046270772. This is deliberately
// not overridable from CI: a changed acceptance limit must be reviewable source.
const acceptedBaselineMs = 151.3;
const acceptedBaselineRun = 34046270772;
const acceptedBaselineSha = '3be9424d11a9d9f5eb33a2143ca0fea461f88528';
const relativeLimitMs = acceptedBaselineMs === null ? null : acceptedBaselineMs * 1.15;
const absoluteLimitMs = 1000;
const maxLongTaskMs = 100;
const repetitions = 5;
const OUT = path.resolve('artifacts/tutorial-library-lazy');
const TUTORIAL_CHUNK = /\/chunks\/tutorial-library\.js(?:[?#]|$)/;
const DECK_ID = 'intro-move-sayhello';
const EXPECTED_DECKS = 29;

await mkdir(OUT, {recursive: true});
let failed = 0;
const checks = [];
const record = (name, ok, detail = '') => {
    checks.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
};
const receipt = {
    schema: 'brickwright/tutorial-library-lazy/v1',
    url,
    eagerBaseline,
    repetitions,
    acceptedBaselineMs,
    acceptedBaselineRun,
    acceptedBaselineSha,
    relativeLimitMs,
    absoluteLimitMs,
    maxLongTaskMs,
    checks,
    journeys: {}
};
const setPhase = phase => {
    receipt.phase = phase;
    console.log(`PHASE: ${phase}`);
};
process.once('SIGTERM', () => {
    receipt.timedOut = true;
    writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    process.exit(124);
});

const browser = await chromium.launch({headless: true});
let sessionNumber = 0;
const pageUrl = search => {
    const next = new URL(url);
    for (const [key, value] of new URLSearchParams(search)) next.searchParams.set(key, value);
    next.searchParams.set('tutorial-proof', String(++sessionNumber));
    return next.href;
};
const makeSession = async (search = '') => {
    const context = await browser.newContext({
        viewport: {width: 1600, height: 1000},
        serviceWorkers: 'block'
    });
    // Playwright disables the HTTP cache when routing is enabled. That makes
    // each context a genuinely cold chunk probe; Wistia is irrelevant to card
    // readiness and must not contaminate the receipt.
    await context.route('**/*', route => {
        const host = new URL(route.request().url()).hostname;
        return host === 'fast.wistia.com' ? route.abort('blockedbyclient') : route.continue();
    });
    const page = await context.newPage();
    const chunkRequests = [];
    const pageErrors = [];
    page.on('request', request => {
        if (TUTORIAL_CHUNK.test(request.url())) chunkRequests.push({url: request.url(), at: Date.now()});
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('crash', () => pageErrors.push('THE RENDERER CRASHED'));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        const probe = window.__BW_TUTORIAL_PERF__ = {longTasks: []};
        if (typeof PerformanceObserver === 'function') {
            try {
                probe.observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        probe.longTasks.push({at: entry.startTime, ms: entry.duration});
                    }
                });
                probe.observer.observe({entryTypes: ['longtask']});
            } catch { /* unsupported browsers retain an empty long-task receipt */ }
        }
    });
    await page.goto(pageUrl(search), {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        if (!vm?.runtime) return false;
        window.__vm = vm;
        return true;
    }, null, {timeout: 60000});
    return {context, page, chunkRequests, pageErrors};
};

const twoFrames = page => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
const tutorialItem = (page, id = DECK_ID) =>
    page.locator(`[data-testid="library-item"][data-library-item-id="${id}"]`);
const waitForUsableModal = async page => {
    const modal = page.locator('[data-testid="tutorial-library-modal"]');
    await modal.waitFor({state: 'visible', timeout: 30000});
    const item = tutorialItem(page);
    await item.waitFor({state: 'visible', timeout: 30000});
    const thumbnailReady = await item.locator('img').first().evaluate(image => {
        if (image.complete) return image.naturalWidth > 0;
        return new Promise(resolve => {
            image.addEventListener('load', () => resolve(true), {once: true});
            image.addEventListener('error', () => resolve(false), {once: true});
        });
    });
    if (!thumbnailReady) throw new Error('Getting Started tutorial thumbnail failed to load');
    await twoFrames(page);
    return modal;
};
const openTutorials = async page => {
    await page.locator('[data-testid="file-menu-toggle"]').click();
    const opener = page.locator('[data-testid="tutorial-library-open"]');
    await opener.waitFor({state: 'visible', timeout: 15000});
    const startedAt = await page.evaluate(() => performance.now());
    await opener.click();
    await waitForUsableModal(page);
    return page.evaluate(start => {
        const readyAt = performance.now();
        const probe = window.__BW_TUTORIAL_PERF__;
        for (const entry of probe?.observer?.takeRecords?.() || []) {
            probe.longTasks.push({at: entry.startTime, ms: entry.duration});
        }
        return {
            startedAt: start,
            readyAt,
            durationMs: readyAt - start,
            longTasks: (probe?.longTasks || []).filter(task => task.at >= start && task.at < readyAt),
            resources: performance.getEntriesByType('resource')
                .filter(entry => /\/chunks\/tutorial-library\.js$/.test(new URL(entry.name).pathname))
                .map(entry => ({name: new URL(entry.name).pathname, startTime: entry.startTime,
                    responseEnd: entry.responseEnd, transferSize: entry.transferSize}))
        };
    }, startedAt);
};
const cardState = page => page.evaluate(() => {
    const cards = window.__brickwrightStore.getState().scratchGui.cards;
    return {visible: cards.visible, activeDeckId: cards.activeDeckId, step: cards.step};
});
const waitForCard = async (page, deckId = DECK_ID, step = 0) => {
    const card = page.locator(`[data-testid="tutorial-card"][data-tutorial-deck-id="${deckId}"]` +
        `[data-tutorial-step="${step}"]`);
    await card.waitFor({state: 'visible', timeout: 30000});
    await page.locator('[data-testid="tutorial-card-body"]').waitFor({state: 'visible', timeout: 30000});
    await twoFrames(page);
    return card;
};
const median = numbers => {
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

try {
    setPhase('hidden-default');
    let session = await makeSession();
    await twoFrames(session.page);
    receipt.journeys.hidden = {chunkRequests: session.chunkRequests, pageErrors: session.pageErrors};
    record('the default editor does not request or render the hidden tutorial boundary',
        session.chunkRequests.length === 0 &&
        await session.page.locator('[data-testid="tutorial-library-modal"], [data-testid="tutorial-card"]').count() === 0 &&
        session.pageErrors.length === 0,
        `${session.chunkRequests.length} request(s); ${session.pageErrors.join(' | ') || 'clean'}`);
    await session.context.close();

    setPhase('cold-activation-samples');
    const samples = [];
    for (let index = 0; index < repetitions; index++) {
        session = await makeSession();
        const activation = await openTutorials(session.page);
        const itemCount = await session.page.locator(
            '[data-testid="tutorial-library-modal"] [data-testid="library-item"][data-library-item-id]'
        ).count();
        const sample = {index, ...activation, itemCount, chunkRequests: session.chunkRequests,
            pageErrors: session.pageErrors};
        samples.push(sample);
        const longest = Math.max(0, ...activation.longTasks.map(task => task.ms));
        record(`cold tutorial activation ${index + 1} stays under one second`,
            activation.durationMs <= absoluteLimitMs, `${activation.durationMs.toFixed(1)} ms`);
        record(`cold tutorial activation ${index + 1} adds no task longer than 100 ms`,
            longest <= maxLongTaskMs, `${activation.longTasks.length} task(s), longest ${longest.toFixed(1)} ms`);
        record(`cold tutorial activation ${index + 1} exposes the complete deck catalog`,
            itemCount === EXPECTED_DECKS, `${itemCount} item(s)`);
        record(`cold tutorial activation ${index + 1} emits no uncaught page errors`,
            session.pageErrors.length === 0, session.pageErrors.join(' | ') || 'clean');

        if (index === 0) {
            await tutorialItem(session.page).click();
            await waitForCard(session.page);
            let state = await cardState(session.page);
            record('selecting Getting Started activates the exact deck synchronously',
                state.visible && state.activeDeckId === DECK_ID && state.step === 0, JSON.stringify(state));
            await session.page.locator('[data-testid="tutorial-card-next"]').click();
            await waitForCard(session.page, DECK_ID, 1);
            const image = session.page.locator('[data-testid="tutorial-card-image"]');
            await image.waitFor({state: 'visible', timeout: 15000});
            const imageReady = await image.evaluate(node => node.complete && node.naturalWidth > 0);
            state = await cardState(session.page);
            record('owned card navigation reaches the first image step',
                imageReady && state.step === 1, JSON.stringify(state));
            await session.page.locator('[data-testid="tutorial-card-show-all"]').click();
            await waitForUsableModal(session.page);
            record('card-to-library reopening deduplicates the tutorial payload',
                session.chunkRequests.length === (eagerBaseline ? 0 : 1),
                `${session.chunkRequests.length} request(s)`);
            await session.page.screenshot({path: path.join(OUT, '01-success.png'), fullPage: true});
        }
        await session.context.close();
    }
    const medianMs = median(samples.map(sample => sample.durationMs));
    receipt.successfulActivation = {samples, medianMs};
    record('the candidate pins an accepted eager median before enforcing its relative ceiling',
        eagerBaseline || acceptedBaselineMs !== null,
        eagerBaseline ? `baseline median ${medianMs.toFixed(1)} ms` : 'accepted baseline is not pinned');
    if (!eagerBaseline && relativeLimitMs !== null) {
        record('the five-sample candidate median stays within 115% of the eager median',
            medianMs <= relativeLimitMs, `${medianMs.toFixed(1)} ms; limit ${relativeLimitMs.toFixed(1)} ms`);
    }

    setPhase('deep-link-get-started');
    session = await makeSession('tutorial=getStarted');
    await waitForCard(session.page);
    const linkedState = await cardState(session.page);
    record('?tutorial=getStarted selects the exact first deck and step',
        linkedState.visible && linkedState.activeDeckId === DECK_ID && linkedState.step === 0 &&
        session.pageErrors.length === 0,
        `${JSON.stringify(linkedState)}; ${session.pageErrors.join(' | ') || 'clean'}`);
    receipt.journeys.getStarted = {state: linkedState, chunkRequests: session.chunkRequests,
        pageErrors: session.pageErrors};
    await session.context.close();

    setPhase('deep-link-all');
    session = await makeSession('tutorial=all');
    await waitForUsableModal(session.page);
    const allCount = await session.page.locator(
        '[data-testid="tutorial-library-modal"] [data-testid="library-item"][data-library-item-id]'
    ).count();
    record('?tutorial=all opens the populated tutorial library',
        allCount === EXPECTED_DECKS && session.pageErrors.length === 0,
        `${allCount} item(s); ${session.pageErrors.join(' | ') || 'clean'}`);
    receipt.journeys.all = {itemCount: allCount, chunkRequests: session.chunkRequests,
        pageErrors: session.pageErrors};
    await session.context.close();

    const successfulRequestCounts = samples.map(sample => sample.chunkRequests.length).concat([
        receipt.journeys.getStarted.chunkRequests.length,
        receipt.journeys.all.chunkRequests.length
    ]);
    record('the tutorial body has the candidate named-chunk topology',
        !eagerBaseline && successfulRequestCounts.every(count => count === 1),
        eagerBaseline ? `eager baseline: ${successfulRequestCounts.join(', ')} request(s)` :
            `${successfulRequestCounts.join(', ')} request(s)`);

    if (eagerBaseline) {
        setPhase('eager-baseline-complete');
        receipt.failureRetry = {skipped: true, reason: 'eager baseline has no tutorial chunk request to abort'};
        receipt.staleClose = {skipped: true, reason: 'eager baseline has no pending tutorial chunk completion'};
        console.log('BASELINE: failed-fetch/retry and stale-close probes skipped without waiting.');
    } else {
        setPhase('failure-retry');
        session = await makeSession();
        let first = true;
        await session.page.route(TUTORIAL_CHUNK, route => {
            if (first) {
                first = false;
                return route.abort('failed');
            }
            return route.continue();
        });
        await session.page.locator('[data-testid="file-menu-toggle"]').click();
        await session.page.locator('[data-testid="tutorial-library-open"]').click();
        const retry = session.page.locator('[data-testid="tutorial-library-retry"]');
        await retry.waitFor({state: 'visible', timeout: 30000});
        record('a failed tutorial chunk exposes retry without a populated body',
            session.chunkRequests.length === 1 &&
            await session.page.locator('[data-testid="tutorial-library-modal"], [data-testid="tutorial-card"]').count() === 0,
            `${session.chunkRequests.length} request(s)`);
        const secondRequest = session.page.waitForEvent('request', {
            predicate: request => TUTORIAL_CHUNK.test(request.url()), timeout: 30000
        });
        await retry.click();
        await secondRequest;
        await waitForUsableModal(session.page);
        record('retry makes one new request and restores the requested tutorial mode',
            session.chunkRequests.length === 2, `${session.chunkRequests.length} request(s)`);
        receipt.failureRetry = {chunkRequests: session.chunkRequests, pageErrors: session.pageErrors};
        await session.page.screenshot({path: path.join(OUT, '02-failure-retried.png'), fullPage: true});
        await session.context.close();

        setPhase('stale-close');
        session = await makeSession();
        let heldRoute;
        const held = new Promise(resolve => { heldRoute = resolve; });
        await session.page.route(TUTORIAL_CHUNK, route => heldRoute(route));
        await session.page.locator('[data-testid="file-menu-toggle"]').click();
        await session.page.locator('[data-testid="tutorial-library-open"]').click();
        const route = await held;
        await session.page.locator('[data-testid="tutorial-library-loading"]').waitFor({state: 'visible', timeout: 15000});
        await session.page.locator('[data-testid="tutorial-library-cancel"]').click();
        const response = session.page.waitForResponse(value => TUTORIAL_CHUNK.test(value.url()), {timeout: 30000});
        await route.continue();
        await response;
        await twoFrames(session.page);
        const visibility = await session.page.evaluate(() => {
            const gui = window.__brickwrightStore.getState().scratchGui;
            return {tips: gui.modals.tipsLibrary, cards: gui.cards.visible};
        });
        record('closing while the chunk is held prevents stale completion from reopening tutorial UI',
            !visibility.tips && !visibility.cards &&
            await session.page.locator('[data-testid="tutorial-library-modal"], [data-testid="tutorial-card"]').count() === 0,
            JSON.stringify(visibility));
        receipt.staleClose = {chunkRequests: session.chunkRequests, visibility, pageErrors: session.pageErrors};
        await session.page.screenshot({path: path.join(OUT, '03-stale-close.png'), fullPage: true});
        await session.context.close();
    }
} catch (error) {
    receipt.failurePhase = receipt.phase;
    record('the tutorial-library browser journey ran to completion', false,
        error?.stack || error?.message || String(error));
} finally {
    setPhase(receipt.timedOut ? receipt.phase : 'complete');
    await writeFile(path.join(OUT, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    await browser.close();
}

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
console.log(`proof: ${OUT}`);
process.exit(failed ? 1 : 0);

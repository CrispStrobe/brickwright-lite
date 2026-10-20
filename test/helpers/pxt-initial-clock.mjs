import {createRequire} from 'node:module';

const FRAME_MS = 16;
const pendingBootstraps = new WeakSet();

// Configure an empty context before any document can start a flowing clock.
// Playwright records pauseAt for new documents; the first clock read replays it.
export async function preparePxtInitialClock(context) {
    if (context.pages().length !== 0) throw new Error('Initial PXT clock requires an empty browser context');
    await context.clock.pauseAt(0);
    // Context initialization follows the clock's own context scripts. Apply its
    // recorded pause synchronously, before document scripts or native timers.
    await context.addInitScript(() => {
        const initial = Object.freeze({date: Date.now(), performance: performance.now(), origin: performance.timeOrigin});
        Object.defineProperty(globalThis, '__bwPxtInitialClock', {value: initial});
    });
}

export async function assertPxtInitialClock(page) {
    return page.evaluate(() => {
        const initial = globalThis.__bwPxtInitialClock;
        const current = {date: Date.now(), performance: performance.now(), origin: performance.timeOrigin};
        if (!initial || Object.values(initial).some(value => value !== 0) ||
            Object.values(current).some(value => value !== 0)) {
            throw new Error('Initial PXT clock was not paused at Date/performance zero before guest startup');
        }
        return {initial, current};
    });
}

// PXT uses zero as an inactive profiler offset. Start its Runtime on a positive
// complete frame boundary, preserving the document's relative RAF phase. Keep
// the original paused-zero admission above; this is a separate observed step.
export async function bootstrapPxtProfilerClock(page) {
    const playwrightRequire = createRequire(import.meta.resolve('playwright'));
    const {version} = playwrightRequire('playwright-core/package.json');
    if (version !== '1.62.1') throw new Error(`Unqualified PXT clock scheduler version: ${version}`);
    if (pendingBootstraps.has(page)) throw new Error('PXT profiler bootstrap is already pending');
    pendingBootstraps.add(page);
    let token;
    let primaryError;
    try {
        await assertPxtInitialClock(page);
        token = await page.evaluateHandle(() => {
            const initial = globalThis.__bwPxtInitialClock;
            if (!initial || Object.values(initial).some(value => value !== 0) ||
                Date.now() !== 0 || performance.now() !== 0 || performance.timeOrigin !== 0) {
                throw new Error('PXT profiler bootstrap lost the paused-zero document');
            }
            if (globalThis.__bwPxtRuntime || globalThis.pxsim?.runtime ||
                Object.hasOwn(globalThis, '__bwPxtProfilerBootstrap')) {
                throw new Error('PXT profiler bootstrap requires a fresh pre-guest page');
            }
            return Object.freeze({initial, document});
        });
        await page.clock.runFor(FRAME_MS);
        return await page.evaluate(({token, version, frameMs}) => {
            if (globalThis.__bwPxtRuntime || globalThis.pxsim?.runtime ||
                token.document !== document || token.initial !== globalThis.__bwPxtInitialClock ||
                Object.hasOwn(globalThis, '__bwPxtProfilerBootstrap')) {
                throw new Error('PXT profiler bootstrap lost its fresh pre-guest document');
            }
            const initial = globalThis.__bwPxtInitialClock;
            const current = {date: Date.now(), performance: performance.now(), origin: performance.timeOrigin};
            if (!initial || Object.values(initial).some(value => value !== 0) ||
                current.date !== frameMs || current.performance !== frameMs || current.origin !== 0) {
                throw new Error('PXT profiler clock did not advance by one complete frame before guest startup');
            }
            const observation = Object.freeze({initial, current: Object.freeze(current), version, frameMs});
            Object.defineProperty(globalThis, '__bwPxtProfilerBootstrap', {value: observation});
            return observation;
        }, {token, version, frameMs: FRAME_MS});
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        try {
            await token?.dispose();
        } catch (cleanupError) {
            if (primaryError) throw new AggregateError([primaryError, cleanupError],
                'PXT profiler bootstrap and handle cleanup failed', {cause: primaryError});
            throw cleanupError;
        } finally { pendingBootstraps.delete(page); }
    }
}

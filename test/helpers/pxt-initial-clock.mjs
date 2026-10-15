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

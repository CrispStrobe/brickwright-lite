/**
 * Open the Code tab's `⋯` actions menu, for the browser probes that drive the
 * controls inside it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The UI consolidation in 31c5a815 moved Open / Save / MakeCode share+export /
 * "Load example" / the hardware catalog out of the tab row and into a single
 * `<details data-testid="bw-code-actions">` menu. A closed `<details>` keeps its
 * children in the DOM but not on screen, so every probe that reached one of
 * those controls directly kept RESOLVING the locator and then timing out on
 * actionability — `verify-example-selector`'s `selectOption('sky_skim')` sat for
 * 30 s against an element Playwright had already found. "In the DOM" and
 * "reachable" stopped being the same thing, and only the second one is the
 * claim these gates make.
 *
 * So this is the click the user now makes, and nothing more: the journey still
 * has to reach the real control and use it. It is idempotent — a probe may call
 * it before every interaction without toggling the menu shut again — and it
 * WAITS for the menu to report open rather than assuming the click landed.
 *
 * A build with no menu at all (the controls inline, as before 31c5a815) returns
 * false rather than throwing, so a probe pointed at an older deploy fails on its
 * own assertion about the control instead of on this helper.
 */
export async function openCodeActions (page, {timeout = 30000} = {}) {
    const menu = page.locator('[data-testid="bw-code-actions"]');
    try {
        // The Code importer is asynchronous: after selecting the tab the menu
        // may not exist yet. Locator.waitFor observes it being attached;
        // count() was a one-shot read that raced the lazy chunk.
        await menu.waitFor({state: 'attached', timeout});
    } catch (error) {
        if (await menu.count() === 0) return false;
        throw error;
    }
    if (await menu.evaluate(el => el.open)) return true;
    await menu.locator('summary').click({timeout});
    await page.waitForFunction(
        () => !!document.querySelector('[data-testid="bw-code-actions"]')?.open,
        null, {timeout});
    return true;
}

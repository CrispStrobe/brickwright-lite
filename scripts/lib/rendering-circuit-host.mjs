/** Self-contained so Playwright can serialize it into the selected DOM root. */
export function bindRenderingCircuitHost (root) {
    // A rejected/new root must never leave a previous host usable by the proof.
    delete globalThis.__bwRenderingCircuitTab;
    if (!root?.isConnected) return false;
    const box = root.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    const key = Object.keys(root).find(name =>
        name.startsWith('__reactFiber') || name.startsWith('__reactInternalInstance'));
    const seen = new Set();
    for (let fiber = key ? root[key] : null; fiber; fiber = fiber.return) {
        if (seen.has(fiber)) throw new Error('Circuit host ancestry is cyclic');
        seen.add(fiber);
        const host = fiber.stateNode;
        if (typeof host?.loadExample === 'function' && typeof host.setState === 'function' &&
            Object.hasOwn(host.state || {}, 'circuitData')) {
            globalThis.__bwRenderingCircuitTab = host;
            return true;
        }
    }
    return false;
}

/** Node-side locator orchestration; only the binder runs inside the page. */
export async function bindReadyRenderingCircuitHost (designer) {
    await designer.waitFor({state: 'visible', timeout: 60000});
    await designer.locator('[data-canvas]').waitFor({state: 'visible', timeout: 60000});
    return designer.evaluate(bindRenderingCircuitHost);
}

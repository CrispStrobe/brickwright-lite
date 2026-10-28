/**
 * Resolution hook: `playwright` -> the timing wrapper, for everyone except the
 * wrapper itself.
 *
 * The self-exemption is the whole of the trick. Without it the wrapper's own
 * `import 'playwright'` resolves back to the wrapper and the process deadlocks
 * on its own module graph — the same shape as a gate that scans the tree it
 * lives in, which is how this campaign's sharpest finding read.
 *
 * `nextResolve` skips this hook, so the exempted request lands on the real
 * package with no further redirection.
 */
const WRAPPER = new URL('./observe-timeouts-playwright.mjs', import.meta.url).href;

export async function resolve (specifier, context, nextResolve) {
    if (specifier === 'playwright' && context.parentURL !== WRAPPER) {
        return {url: WRAPPER, shortCircuit: true};
    }
    return nextResolve(specifier, context);
}

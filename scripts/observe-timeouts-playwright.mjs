/**
 * A `playwright` that keeps time.
 *
 * Re-exports the real module with Browser / BrowserContext / Page / Locator
 * proxied, so every awaited call is timed and attributed to the CALLER's
 * file:line — the same key `threshold-inventory.mjs` reports a literal under,
 * which is what lets the two be joined without anyone maintaining a mapping.
 *
 * Three things it deliberately does NOT do:
 *
 *  - change behaviour. Arguments pass through untouched, results and rejections
 *    pass through untouched. A wrapper that alters what it measures is not an
 *    instrument.
 *  - swallow errors. A recording failure is caught (telemetry must not fail a
 *    sweep) but a PAGE failure is rethrown after being recorded, because a wait
 *    that TIMED OUT is the most informative observation there is.
 *  - guess an effective timeout. It records the literal the call actually
 *    passed, and `null` when the call passed none — an inherited default is a
 *    different fact from a written bound, and merging them would invent
 *    evidence for numbers nobody wrote.
 */
import * as real from 'playwright';

const obs = globalThis.__observeTimeouts;

// Methods whose duration is bounded by a timeout — the ones worth a p90. Other
// methods are timed too (they cost wall-clock and a reader may want it) but are
// tagged so the aggregator can keep them out of the threshold join.
const BOUNDED = new Set([
    'waitFor', 'waitForSelector', 'waitForFunction', 'waitForURL', 'waitForLoadState',
    'waitForEvent', 'waitForRequest', 'waitForResponse', 'waitForNavigation',
    'goto', 'reload', 'click', 'dblclick', 'fill', 'press', 'type', 'check', 'uncheck',
    'hover', 'selectOption', 'setInputFiles', 'focus', 'tap', 'dragTo',
    'textContent', 'innerText', 'innerHTML', 'getAttribute', 'isVisible', 'isEnabled',
    'boundingBox', 'screenshot', 'count', 'allTextContents'
]);

// A fixed sleep is not a bound: it always costs exactly what it was given, so
// timing it returns the literal. Recorded under its own type so the report can
// say how much of the sweep is unconditional sleeping — which is the larger
// number in these scripts and the one nobody has counted.
const FIXED_SLEEP = new Set(['waitForTimeout']);

const REPO = obs?.rootURL || '';

/** The first stack frame inside the repo that is not this instrument. */
const callSite = () => {
    const stack = new Error().stack || '';
    for (const line of stack.split('\n').slice(2)) {
        const m = line.match(/\(?(file:\/\/\/[^\s)]+):(\d+):(\d+)\)?$/);
        if (!m) continue;
        const url = m[1];
        if (url.includes('/observe-timeouts')) continue;
        if (url.includes('/node_modules/')) continue;
        if (REPO && !url.startsWith(REPO)) continue;
        return {file: decodeURIComponent(url.slice(REPO.length)), line: Number(m[2])};
    }
    return null;
};

/** The `timeout:` a call passed explicitly, or null. */
const explicitTimeout = (args) => {
    for (const a of args) {
        if (a && typeof a === 'object' && !Array.isArray(a) && typeof a.timeout === 'number') return a.timeout;
    }
    return null;
};

const describe = (args) => {
    const first = args[0];
    if (typeof first === 'string') return first.length > 120 ? `${first.slice(0, 117)}…` : first;
    if (typeof first === 'function') return '<function>';
    return undefined;
};

// WHAT AN OBJECT IS, BY WHAT IT DOES.
//
// The first two attempts keyed on `constructor.name`, and playwright ships
// bundled so the names are neither stable nor documented: a Browser reported
// `Browser2` through one path and `''` through another, and a Page is `_Page`.
// Matching `Page` wrapped the Browser and NOTHING BELOW IT — the run recorded
// exactly two calls, `newPage` and `close`, and would have reported a clean
// sweep of zero waits over a sweep that made hundreds.
//
// That is the grep-hit mistake in miniature: a name found by inspection is not
// a contract, and three different spellings of the same class are
// indistinguishable from three different classes. Duck-typing asks the question
// that actually matters — does this thing have the methods we are here to time?
const fns = (v, ...names) => names.every((n) => typeof v[n] === 'function');

const duckKind = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    try {
        if (fns(v, 'newPage', 'close')) return fns(v, 'newContext') ? 'Browser' : 'BrowserContext';
        if (fns(v, 'goto', 'evaluate', 'waitForSelector')) return 'Page';
        if (fns(v, 'evaluate', 'waitForSelector', 'locator')) return 'Frame';
        if (fns(v, 'waitFor', 'click', 'first')) return 'Locator';
        if (fns(v, 'locator', 'getByRole')) return 'FrameLocator';
    } catch { /* an exotic getter; not ours */ }
    return null;
};
const isWrappable = (v) => duckKind(v) !== null;

const wrapped = new WeakMap();

function wrap (target) {
    if (!target || typeof target !== 'object') return target;
    if (wrapped.has(target)) return wrapped.get(target);
    const kind = duckKind(target) || 'unknown';
    const proxy = new Proxy(target, {
        get (t, prop, receiver) {
            const value = Reflect.get(t, prop, receiver);
            if (typeof value !== 'function' || typeof prop !== 'string') return value;
            return function (...args) {
                const site = callSite();
                const started = performance.now();
                const finish = (outcome) => {
                    if (!site || !obs) return;
                    const type = FIXED_SLEEP.has(prop) ? 'sleep'
                        : BOUNDED.has(prop) ? 'bounded' : 'other';
                    obs.record({
                        type,
                        file: site.file,
                        line: site.line,
                        kind,
                        method: prop,
                        arg: describe(args),
                        timeout: explicitTimeout(args),
                        ms: Math.round((performance.now() - started) * 10) / 10,
                        outcome
                    });
                };
                let out;
                try {
                    out = value.apply(t, args);
                } catch (e) {
                    finish('throw');
                    throw e;
                }
                if (out && typeof out.then === 'function') {
                    return out.then((v) => { finish('ok'); return isWrappable(v) ? wrap(v) : v; },
                        (e) => { finish(/[Tt]imeout/.test(String(e && e.message)) ? 'timeout' : 'reject'); throw e; });
                }
                finish('sync');
                return isWrappable(out) ? wrap(out) : out;
            };
        }
    });
    wrapped.set(target, proxy);
    return proxy;
}

const wrapBrowserType = (bt) => new Proxy(bt, {
    get (t, prop, receiver) {
        const value = Reflect.get(t, prop, receiver);
        if (prop !== 'launch' && prop !== 'launchPersistentContext' && prop !== 'connect') return value;
        return (...args) => value.apply(t, args).then(wrap);
    }
});

export const chromium = wrapBrowserType(real.chromium);
export const firefox = wrapBrowserType(real.firefox);
export const webkit = wrapBrowserType(real.webkit);
export const devices = real.devices;
export const errors = real.errors;
export const request = real.request;
export const selectors = real.selectors;
export const expect = real.expect;
export default {chromium, firefox, webkit, devices, errors, request, selectors, expect};

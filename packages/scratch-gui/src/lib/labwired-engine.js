/**
 * Load the labwired-wasm engine, or say honestly that it is not here.
 *
 * THE HEAVY TIER, AND WHY IT IS OPTIONAL
 * --------------------------------------
 * STM32-PATH.md fixes two tiers permanently. The light tier is the hand-rolled
 * CortexM0Machine — M0-class, peripherals capped at what our codegen emits —
 * and it is always present because it is a few hundred KB of JS. The heavy tier
 * is labwired, which reaches F103/F4/F7, RISC-V and Xtensa, and is a 20 MB
 * artifact (about 2 MB brotli). It is fetched by `npm run sync:labwiredwasm`
 * into static/labwired/, which .gitignore covers and webpack copies wholesale,
 * so a checkout that has not run it simply does not have the engine — and still
 * builds.
 *
 * That is the whole reason this module exists rather than a plain import: the
 * engine's PRESENCE is a build-time choice, so its availability has to be a
 * runtime question — and the import below is `webpackIgnore`d precisely so that
 * a build without the artifact still succeeds instead of failing to compile. A picker entry for an engine that cannot load is the lie
 * bw-board's debug-target-factory header warns about — the reason 'rp2040js'
 * waited for its compile route before appearing in the list.
 *
 * `web`, not `nodejs`. The published artifact carries both glues; the nodejs
 * one require()s and reads the module off disk, which does not survive a
 * browser bundle. The web glue takes an explicit init(url) and fetches the
 * module at runtime — the same shape the emu8051 artifact already uses here, so
 * no webpack wasm experiment is needed.
 *
 * @module
 */

/** Cached across calls: the artifact is 20 MB and instantiating twice is waste. */
let cached = null;
let attempted = false;

/**
 * @returns {Promise<object|null>} the instantiated module, or null when the
 *   artifact was never fetched into this build. Never throws for absence —
 *   absence is an answer, and callers branch on it.
 */
export async function loadLabwired () {
    if (cached) return cached;
    if (attempted) return cached;      // a previous failure is remembered, not retried per keystroke
    attempted = true;
    try {
        // `webpackIgnore: true` is the load-bearing part. Webpack must NOT
        // resolve this at build time: the artifact is fetched by
        // `npm run sync:labwiredwasm` into static/, and a build that has not
        // run it must still SUCCEED — with the engine simply unavailable —
        // rather than fail to compile. A bare dynamic import of a literal path
        // would make the 20 MB download a build dependency of the whole app.
        // Browser only, and said so rather than discovered. The `web` glue
        // fetches its module from a URL, so outside a document there is no base
        // to resolve against — `new URL('static/…', '/')` throws "Invalid base
        // URL", which would land in the catch below and report "not available"
        // for entirely the wrong reason.
        const base = (typeof document !== 'undefined' && document.baseURI)
            || (typeof location !== 'undefined' && location.href)
            || null;
        if (!base) {
            loadLabwired.lastError = 'labwired-wasm is browser-only: the web glue resolves its '
                + 'module against a document base, and there is none here. Node consumers want '
                + 'the nodejs glue (see bw-board test/labwired-adapter.test.mjs).';
            return null;
        }
        const glue = new URL('static/labwired/labwired_wasm.js', base).href;
        const mod = await import(/* webpackIgnore: true */ glue);
        // The web glue's default export is init(url); it fetches and
        // instantiates the module itself.
        if (typeof mod.default === 'function') {
            await mod.default(new URL('static/labwired/labwired_wasm_bg.wasm', base).href);
        }
        cached = mod;
        return cached;
    } catch (e) {
        // Absent, or failed to instantiate. Either way the caller must not
        // offer it. The message is kept for the diagnostics panel rather than
        // swallowed — an engine that silently is not there is the failure this
        // whole session has been about.
        loadLabwired.lastError = e && e.message ? e.message : String(e);
        return null;
    }
}

/** Cached availability answer, independent of whether the engine was loaded. */
let present = null;

/**
 * Cheap availability probe for UI that must decide whether to OFFER the engine.
 * Resolves false rather than throwing when the artifact was never fetched.
 *
 * IT USED TO CALL loadLabwired(), AND THE WORD "cheap" WAS THE ONLY CHEAP THING
 * ABOUT IT. debug-panel.jsx probes at mount to decide whether the heavy tier
 * belongs in the target picker, so every first load of the app downloaded AND
 * instantiated the engine to answer a yes/no question — measured against the
 * deployed site on 2026-09-04: 8.5 MB over 26 requests, of which 3.40 MB was
 * labwired_wasm_bg.wasm and 3.41 MB its glue chunk. First render took 7.6 to
 * 9.7 seconds from a datacentre with a warm DNS cache and an empty HTTP cache.
 * Roughly 80% of the bytes a first-time visitor waited for were an optional
 * engine most of them never open.
 *
 * `verify-labwired-lazy-bundle.mjs` could not see this and is not at fault: it
 * asserts WHERE the code sits in the bundle, which was and still is correct.
 * The engine was never in the entry bundle — it was fetched from it at startup.
 * Location and traffic are different claims.
 *
 * A HEAD asks the only question the picker needs: is the artifact deployed. It
 * transfers no body. Some hosts answer HEAD poorly, so a one-byte ranged GET is
 * the fallback before concluding absence.
 *
 * WHAT THIS TRADES, stated rather than quietly reversed. The old probe proved
 * the engine INSTANTIATES; this proves it is DEPLOYED. So a corrupt artifact
 * would now be offered and fail when selected — the "entry that fails when
 * clicked" the module header rightly calls worse than no entry. That guarantee
 * cost every visitor 6.8 MB on every load, and loadLabwired() still reports the
 *real failure honestly at selection time, where the person is already waiting for
 * an engine. If the guarantee is wanted back, the way to buy it is a build-time
 * checksum in the artifact manifest, not a download on first paint.
 */
export async function isLabwiredAvailable () {
    if (cached) return true;                     // already instantiated: certainly here
    if (present !== null) return present;
    const base = (typeof document !== 'undefined' && document.baseURI)
        || (typeof location !== 'undefined' && location.href)
        || null;
    if (!base || typeof fetch !== 'function') {
        present = false;
        return present;
    }
    const url = new URL('static/labwired/labwired_wasm_bg.wasm', base).href;
    try {
        let res = await fetch(url, {method: 'HEAD'});
        // A host that dislikes HEAD must not be read as "engine absent".
        if (!res.ok) res = await fetch(url, {headers: {Range: 'bytes=0-0'}});
        present = res.ok || res.status === 206;
    } catch (e) {
        loadLabwired.lastError = e && e.message ? e.message : String(e);
        present = false;
    }
    return present;
}

/** Test seam: forget the cache so a suite can exercise both branches. */
export function _resetLabwiredCache () {
    cached = null;
    attempted = false;
    present = null;
    delete loadLabwired.lastError;
}

export default loadLabwired;

/**
 * Where the SDCC toolchain comes from — and why it is not in this app.
 *
 * SDCC is GPL-2.0-or-later. Brickwright is BSD-3-Clause. Until now the compiler
 * itself was tracked in this repository and `webpack.config.js` copied it into
 * `static/sdcc-wasm/` in the build output, which `tauri.conf.json` bundles
 * wholesale — so the shipping Mac build carried 8.7 MB of GPL binaries inside a
 * BSD-3 application. Measured 2026-09-07 in CI's own github-pages artifact: 101
 * files under `static/sdcc-wasm/`.
 *
 * The binaries now live in their own GPL repository, with COPYING, the written
 * offer of corresponding source, and the SHA-256 of each binary:
 *   https://github.com/CrispStrobe/sdcc-wasm
 * served at the origin below. Nothing GPL is copied into this build any more;
 * the toolchain is fetched only when a user asks for it.
 *
 * THREE MODES, one setting:
 *   online (DEFAULT) — no WASM at all. `localTargetSupported()` returns false,
 *     so `intercept.js` simply does not claim the request and the existing
 *     hosted compiler serves it. This needs no request or response mapping: the
 *     callers already POST to that service for every target this bundle cannot
 *     link, and have since before the local path existed.
 *   local — opt-in. Fetched once from the GPL origin and kept in Cache Storage
 *     so it survives going offline.
 *   dev — the old in-build path, for a web build that still copies the files.
 *     Never the default, and it must never put files in the app bundle.
 *
 * NOTE the honest cost of the default. `intercept.js` says a supported request
 * must never silently fall back to the network after a local failure, "because
 * that would turn offline/debug failures into surprising network traffic". With
 * `online` as the default, the five STC parts that used to compile in-page now
 * need either a network or an explicit opt-in. That is a real regression for an
 * offline learner, accepted deliberately: shipping GPL binaries inside a BSD-3
 * app is not a trade that a convenience can win.
 */

export const GPL_TOOLCHAIN_ORIGIN = 'https://crispstrobe.github.io/sdcc-wasm/';
export const TOOLCHAIN_MODE_KEY = 'bw-sdcc-toolchain';
export const TOOLCHAIN_CACHE = 'bw-sdcc-wasm-v1';

/** Every file `loadToolchain` asks for, so the cache can be filled in one pass. */
export const TOOLCHAIN_FILES = Object.freeze([
    'cc1.js', 'cc1.wasm',
    'sdcc.js', 'sdcc.wasm',
    'sdas8051.js', 'sdas8051.wasm',
    'sdld.js', 'sdld.wasm',
    'runtime.json'
]);

export function getToolchainMode (storage) {
    const store = storage || (typeof localStorage === 'undefined' ? null : localStorage);
    let raw = null;
    try {
        raw = store && store.getItem(TOOLCHAIN_MODE_KEY);
    } catch {
        raw = null; // private mode, or storage refused — the default is the safe one
    }
    return raw === 'local' || raw === 'dev' ? raw : 'online';
}

export function setToolchainMode (mode, storage) {
    const store = storage || (typeof localStorage === 'undefined' ? null : localStorage);
    const value = mode === 'local' || mode === 'dev' ? mode : 'online';
    try {
        if (store) store.setItem(TOOLCHAIN_MODE_KEY, value);
    } catch { /* refused; the getter falls back to online */ }
    return value;
}

/** True only when this bundle is allowed to compile in-page at all. */
export function localToolchainEnabled (storage) {
    return getToolchainMode(storage) !== 'online';
}

const fileUrl = (base, name) => new URL(`static/sdcc-wasm/${name}`, base).href;

/**
 * Fill the cache from the GPL origin. Returns the names actually stored, so a
 * caller can report what it got rather than assuming all of them.
 */
export async function primeToolchainCache (base = GPL_TOOLCHAIN_ORIGIN, deps = {}) {
    const caches_ = deps.caches || (typeof caches === 'undefined' ? null : caches);
    const fetch_ = deps.fetch || (typeof fetch === 'undefined' ? null : fetch);
    if (!caches_ || !fetch_) throw new Error('Cache Storage or fetch is unavailable');
    const cache = await caches_.open(TOOLCHAIN_CACHE);
    const stored = [];
    for (const name of TOOLCHAIN_FILES) {
        const url = fileUrl(base, name);
        if (await cache.match(url)) { stored.push(name); continue; }
        const response = await fetch_(url);
        if (!response.ok) throw new Error(`${name} returned ${response.status} from ${base}`);
        await cache.put(url, response.clone());
        stored.push(name);
    }
    return stored;
}

/**
 * A `resolve(name)` backed by the cache.
 *
 * It must hand back blob: URLs, not the network URL. The glue is loaded with
 * `import()`, which does NOT consult Cache Storage, so a patched `fetch` would
 * cache the .wasm and still go to the network for the .js — offline in name
 * only. Reading the cache here and importing a blob covers both, because
 * `locateFile` routes the .wasm through the same resolver.
 */
export async function cachedResolver (base = GPL_TOOLCHAIN_ORIGIN, deps = {}) {
    const caches_ = deps.caches || (typeof caches === 'undefined' ? null : caches);
    const URL_ = deps.URL || URL;
    const cache = caches_ ? await caches_.open(TOOLCHAIN_CACHE) : null;
    const urls = new Map();
    if (cache) {
        for (const name of TOOLCHAIN_FILES) {
            const hit = await cache.match(fileUrl(base, name));
            if (hit) urls.set(name, URL_.createObjectURL(await hit.blob()));
        }
    }
    // A name the cache does not hold falls back to the origin, so a partly
    // filled cache degrades to slow rather than to broken.
    return name => urls.get(name) || fileUrl(base, name);
}

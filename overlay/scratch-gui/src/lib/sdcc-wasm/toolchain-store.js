/**
 * Where a downloaded toolchain is kept — one interface, two backings.
 *
 * The browser keeps it in Cache Storage, which is the right primitive there and
 * the only one that survives going offline. Node has no Cache Storage and no
 * blob URLs, so a command line cannot share the browser's store and must not
 * pretend to: it keeps a directory.
 *
 * The interface exists so that `primeToolchainCache` — with its progress,
 * cancellation and resume-from-partial — is ONE algorithm testable without a
 * browser. Fetching straight from the origin in Node would have been simpler
 * and would have proved almost nothing about the code that matters, because it
 * exercises neither the resume, nor the cancel, nor the partial degradation,
 * and those three are what a download manager is made of.
 *
 * READ THIS BEFORE TRUSTING A GREEN SUITE: a passing Node run is evidence about
 * the ALGORITHM, not about Cache Storage. The browser backing is exercised only
 * where a browser runs.
 */

/** Cache Storage, keyed by the absolute URL each file is fetched from. */
export function cacheStorageStore (caches_, cacheName) {
    let opened = null;
    const cache = async () => (opened || (opened = await caches_.open(cacheName)));
    return {
        kind: 'cache-storage',
        async has (url) {
            return Boolean(await (await cache()).match(url));
        },
        async put (url, response) {
            await (await cache()).put(url, response);
        },
        async read (url) {
            const hit = await (await cache()).match(url);
            return hit ? await hit.blob() : null;
        },
        async remove (url) {
            return (await cache()).delete ? (await cache()).delete(url) : false;
        }
    };
}

/**
 * A directory, one file per toolchain member. The URL is the key everywhere
 * else, so the basename is derived from it rather than passed alongside — two
 * places naming one file is how a store and its index drift apart.
 */
export function fileSystemStore (dir, fsp, path) {
    const nameOf = url => {
        const clean = String(url).split('?')[0].split('#')[0];
        const base = clean.slice(clean.lastIndexOf('/') + 1);
        // A store that can be made to write outside its directory is not a
        // store. Refuse rather than sanitise, so a surprising name is loud.
        if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
            throw new Error(`refusing to store an entry named ${JSON.stringify(base)} from ${url}`);
        }
        return base;
    };
    const full = url => path.join(dir, nameOf(url));
    return {
        kind: 'filesystem',
        dir,
        async has (url) {
            // Named BEFORE the try. The catch below means "not present"; if it
            // also swallowed an illegal name, the guard above would be dead code
            // and a malformed URL would read as a simple cache miss — quietly
            // re-downloading forever instead of saying what is wrong.
            const target = full(url);
            try {
                const stat = await fsp.stat(target);
                // A ZERO-BYTE FILE IS NOT A DOWNLOAD. A cancellation between
                // open and write leaves one, and treating it as present is how a
                // resume skips the file it was meant to finish.
                return stat.isFile() && stat.size > 0;
            } catch {
                return false;
            }
        },
        async put (url, body) {
            // Accepts a Response or raw bytes, so ONE algorithm feeds both
            // backings: Cache Storage wants the Response, a directory wants the
            // bytes, and the caller should not have to know which it has.
            const bytes = body && typeof body.arrayBuffer === 'function'
                ? Buffer.from(await body.arrayBuffer())
                : body;
            await fsp.mkdir(dir, {recursive: true});
            // Written to a temporary name and renamed, so an interrupted write
            // never leaves a short file that `has` would call present.
            const target = full(url);
            const tmp = `${target}.partial`;
            await fsp.writeFile(tmp, bytes);
            await fsp.rename(tmp, target);
        },
        async read (url) {
            const target = full(url);
            try {
                return await fsp.readFile(target);
            } catch {
                return null;
            }
        },
        async remove (url) {
            const target = full(url);
            try {
                await fsp.unlink(target);
                return true;
            } catch {
                return false;
            }
        },
        async bytes (url) {
            const target = full(url);
            try {
                return (await fsp.stat(target)).size;
            } catch {
                return 0;
            }
        }
    };
}

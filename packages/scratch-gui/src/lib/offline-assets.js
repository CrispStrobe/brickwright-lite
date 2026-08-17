// Brickwright offline asset library (Tauri native app, Option B — see PLAN.md
// §25). We host and bundle NOTHING: this enumerates the md5exts of the bundled
// library manifests and asks the Rust downloads-manager to fetch them from
// Scratch's own CDN to the user's device, where the local asset server
// (127.0.0.1:20112) then serves them so the library works offline. `storage.js`
// tries that local cache first and falls back to the CDN on a miss.

import costumes from './libraries/costumes.json';
import backdrops from './libraries/backdrops.json';
import sounds from './libraries/sounds.json';
import sprites from './libraries/sprites.json';

const ASSET_HOST = 'https://assets.scratch.mit.edu';

// Pack name shared with the Rust side + the local server path `/library/…`.
export const LIBRARY_PACK = 'library';

// One-file pack (Option C): the whole CC BY-SA library (mascots excluded) as a
// single ~40 MB zip, so a user grabs it in one request instead of ~1300. Hosted
// as a Release asset — we redistribute only this vetted, attributed subset.
const LIBRARY_PACK_URL =
    'https://github.com/CrispStrobe/brickwright-lite/releases/download/library-pack-v1/brickwright-library.zip';

// Trademarked Scratch characters — excluded from the offline set (not CC
// licensed; see PLAN.md §25). Kept in lockstep with build-library-pack.mjs so
// the cached count reconciles with the hosted pack.
const MASCOT = /^(cat|scratch cat|gobo|pico|nano|giga|tera)\b/i;

const mascotMd5exts = () => {
    const set = new Set();
    costumes.forEach(c => {
        if (MASCOT.test((c.name || '').trim()) && c.md5ext) set.add(c.md5ext);
    });
    sprites.forEach(s => {
        if (MASCOT.test((s.name || '').trim())) {
            (s.costumes || []).forEach(c => {
                if (c.md5ext) set.add(c.md5ext);
            });
        }
    });
    return set;
};

// Every unique library asset md5ext across costumes/backdrops/sounds and the
// costumes+sounds nested in sprite entries, minus the trademarked mascots (which
// stay on the CDN — a local cache miss falls through to it).
const collectMd5exts = () => {
    const exclude = mascotMd5exts();
    const set = new Set();
    const add = asset => {
        if (asset && asset.md5ext && !exclude.has(asset.md5ext)) set.add(asset.md5ext);
    };
    costumes.forEach(add);
    backdrops.forEach(add);
    sounds.forEach(add);
    sprites.forEach(sprite => {
        (sprite.costumes || []).forEach(add);
        (sprite.sounds || []).forEach(add);
    });
    return Array.from(set);
};

// Total number of distinct library assets (for the UI's "x / N" display).
export const libraryTotal = () => collectMd5exts().length;

// {url, name} items for the Rust `download_pack` command. `name` is the cache
// filename the local server exposes at `/library/<name>`; `url` mirrors exactly
// the CDN URL scratch-storage uses, so we cache byte-identical assets.
const libraryDownloadItems = () => collectMd5exts().map(md5ext => ({
    name: md5ext,
    url: `${ASSET_HOST}/internalapi/asset/${md5ext}/get/`
}));

const tauri = () => (typeof window !== 'undefined' && window.__TAURI__) || null;

// True only inside the Tauri app (the manager is a no-op on the web).
export const isNativeApp = () => {
    const t = tauri();
    return !!(t && t.core && typeof t.core.invoke === 'function');
};

// How many library assets are already cached on disk.
export const cachedCount = async () => {
    const t = tauri();
    if (!t || !t.core) return 0;
    try {
        const names = await t.core.invoke('pack_present', {pack: LIBRARY_PACK});
        // Count only asset files (md5-named), not the bundled LICENSE/CREDITS.
        return Array.isArray(names) ?
            names.filter(n => (/^[0-9a-f]{32}\./).test(n)).length : 0;
    } catch (e) {
        return 0;
    }
};

// Download the whole library to the offline cache. `onProgress({done, total,
// failed})` fires as it goes. Resolves to the number successfully cached.
export const downloadLibrary = async onProgress => {
    const t = tauri();
    if (!t || !t.core) throw new Error('offline downloads are only available in the app');
    let unlisten = null;
    if (onProgress && t.event && typeof t.event.listen === 'function') {
        unlisten = await t.event.listen('download-progress', event => {
            const p = event.payload || {};
            if (p.pack === LIBRARY_PACK) onProgress(p);
        });
    }
    try {
        // Prefer the one-file pack (single ~40 MB request). If it's unreachable
        // (offline, or the release moved), fall back to fetching each library
        // asset from the Scratch CDN individually.
        try {
            return await t.core.invoke('download_pack_zip', {
                pack: LIBRARY_PACK,
                url: LIBRARY_PACK_URL
            });
        } catch (e) {
            return await t.core.invoke('download_pack', {
                pack: LIBRARY_PACK,
                items: libraryDownloadItems()
            });
        }
    } finally {
        if (unlisten) unlisten();
    }
};

// Delete the offline library cache to reclaim disk.
export const removeLibrary = async () => {
    const t = tauri();
    if (!t || !t.core) return;
    try {
        await t.core.invoke('remove_pack', {pack: LIBRARY_PACK});
    } catch (e) {
        // best-effort
    }
};

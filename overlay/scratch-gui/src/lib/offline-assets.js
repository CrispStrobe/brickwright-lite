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

// Every unique library asset md5ext across costumes/backdrops/sounds and the
// costumes+sounds nested in sprite entries.
const collectMd5exts = () => {
    const set = new Set();
    const add = asset => {
        if (asset && asset.md5ext) set.add(asset.md5ext);
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
        return Array.isArray(names) ? names.length : 0;
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
        return await t.core.invoke('download_pack', {
            pack: LIBRARY_PACK,
            items: libraryDownloadItems()
        });
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

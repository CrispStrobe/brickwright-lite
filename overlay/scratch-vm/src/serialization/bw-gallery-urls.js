// SPDX-License-Identifier: BSD-3-Clause
/**
 * bw-gallery-urls — write the pinned gallery URL of every gallery extension a
 * project uses into the saved project, as TurboWarp does (task E5 of
 * docs/OPEN-TASKS-2026-09-29.md).
 *
 * Called from the hook scripts/apply-vm-overlay.mjs patches into the installed
 * scratch-vm/src/virtual-machine.js `toJSON`, which both the project save
 * (saveProjectSb3) and every in-app project read go through.
 *
 * WHY. A project names its extensions by id. Stock sb3 writes only the ids; a
 * gallery extension's id means nothing to an editor that does not already know
 * where that extension lives, so the project reopened with every block of it
 * broken. TurboWarp solves this with a top-level `extensionURLs` map (id -> URL
 * the extension was loaded from); stock Scratch ignores the key and
 * scratch-parser accepts it. Lite now writes the same map, placed right after
 * `extensions` as TurboWarp does.
 *
 * WHAT IS WRITTEN. Only ids the extension manager loaded from an exact pinned
 * gallery URL (ExtensionManager.galleryURLForLoadedExtension): never a bundled
 * or lazy built-in id, never a URL the user typed, never a URL a project file
 * supplied. On load (ExtensionManager.loadProjectExtension) the same map is
 * honoured only for pinned gallery URLs, so what Lite writes is exactly what it
 * will read back.
 */

/**
 * Add `extensionURLs` to a serialized project. Returns the project unchanged
 * (same object) when no gallery extension is in use or for a sprite, which has
 * no `extensions` list.
 * @param {object} json result of sb3.serialize
 * @param {object} extensionManager the VM's ExtensionManager
 * @returns {object} the project to stringify
 */
const save = (json, extensionManager) => {
    if (!json || !Array.isArray(json.extensions) || !extensionManager ||
        typeof extensionManager.galleryURLForLoadedExtension !== 'function') {
        return json;
    }
    const urls = Object.create(null);
    let count = 0;
    for (const id of json.extensions) {
        const url = extensionManager.galleryURLForLoadedExtension(id);
        if (typeof url === 'string') {
            urls[id] = url;
            count++;
        }
    }
    if (!count) return json;
    // Rebuilt rather than assigned so the key sits after `extensions`, where
    // TurboWarp writes it; the file reads the same either way.
    const out = Object.create(null);
    for (const key of Object.keys(json)) {
        if (key === 'extensionURLs') continue;
        out[key] = json[key];
        if (key === 'extensions') out.extensionURLs = urls;
    }
    return out;
};

module.exports = {save};

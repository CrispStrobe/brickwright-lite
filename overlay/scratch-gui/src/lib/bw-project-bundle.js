/**
 * Carry the Circuit, Code and Widgets tabs inside the .sb3, in ONE format.
 *
 * THE PROBLEM
 * -----------
 * "Save to Computer" writes `vm.saveProjectSb3()` — sprites, blocks, costumes,
 * sounds. Nothing else. The other three tabs live only in this browser's
 * localStorage (`bw-circuit-autosave`, `bw-code-autosave`, `bw-ctl-widget-*`),
 * so a project that spans all four tabs COULD NOT BE MOVED BETWEEN MACHINES AT
 * ALL: the file the user carefully saved never contained three quarters of it,
 * and clearing site data, private browsing or a new device lost the rest.
 *
 * WHY ONE FORMAT AND NOT TWO
 * --------------------------
 * A .sb3 is a ZIP. scratch-vm's deserializer reads `project.json` and then
 * fetches only the assets that project.json NAMES by md5ext — verified by
 * reading it: nothing enumerates the archive, there is no manifest and no
 * whitelist. Unknown entries are never opened.
 *
 * So an extra `brickwright/state.json` entry is invisible to every existing
 * reader. Backwards compatibility is not a promise we maintain, it is a property
 * of the container:
 *
 *   - vanilla Scratch and older Brickwright open our files as ordinary projects
 *   - we open theirs, find no bundle, and treat that as "legacy, no circuit"
 *
 * A second format would double the load paths and give a user two files to keep
 * together. The same trick is already used in this codebase by MediaPanel, which
 * packs and unpacks `brickwright-media.json` inside a .zip.
 */

const BUNDLE_PATH = 'brickwright/state.json';
const BUNDLE_VERSION = 1;

/**
 * The localStorage keys that are PROJECT CONTENT, as opposed to per-device UI
 * preference. Theme, panel toggles, instrument visibility and the rest are
 * deliberately NOT carried: they belong to the person and the screen, not the
 * project, and copying them between machines would be a surprise.
 */
const EXACT_KEYS = ['bw-circuit-autosave', 'bw-code-autosave', 'bw-ctl-widgets'];
// The old per-widget prefix stays on the allowlist so a file saved while it
// was documented (nothing ever wrote such keys, but a hand-built bundle
// might) still restores; the panel itself serializes to ONE key above.
const KEY_PREFIXES = ['bw-ctl-widget-'];

const isContentKey = key =>
    EXACT_KEYS.indexOf(key) !== -1 || KEY_PREFIXES.some(p => key.startsWith(p));

/** Read the content keys out of localStorage. Returns {} when unavailable. */
const collectState = () => {
    const out = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && isContentKey(key)) out[key] = localStorage.getItem(key);
        }
    } catch (e) {
        // Private mode, or storage disabled. An empty bundle is correct here:
        // there is nothing to carry, and refusing to save would be worse.
    }
    return out;
};

const loadJSZip = async () => {
    const mod = await import('jszip');
    return mod.default || mod;
};

/**
 * Add the Brickwright bundle to a freshly serialized .sb3 blob.
 *
 * Returns the ORIGINAL blob unchanged if there is nothing to add or if the
 * repack fails — saving the Scratch half is strictly better than saving
 * nothing, and this must never be the reason an export dies.
 *
 * @param {Blob} blob - the .sb3 produced by vm.saveProjectSb3()
 * @returns {Promise<Blob>} the blob to hand to the download
 */
const attachBrickwrightState = async blob => {
    // Save-what-you-SEE, not what the debounced autosaves last wrote: the
    // circuit autosave only updates on an EDIT, so a loaded-but-untouched
    // example saved the PREVIOUS bench (measured: the screen showed the
    // 27-part calculator while the file carried the 4-part demo). Ask the
    // live tabs to flush their current state synchronously before reading.
    // Widgets never persisted at all until this event existed — the panel
    // lives on vm.runtime and its listener writes `bw-ctl-widgets` here.
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bw-project-bundle-collect'));
        }
    } catch (e) { /* a listener throwing must never break the save */ }
    const state = collectState();
    if (Object.keys(state).length === 0) return blob;
    try {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        zip.file(BUNDLE_PATH, JSON.stringify({
            version: BUNDLE_VERSION,
            savedAt: new Date().toISOString(),
            state
        }));
        return await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[brickwright] could not attach tab state to the project', e);
        return blob;
    }
};

/**
 * Restore the Brickwright bundle from a loaded .sb3.
 *
 * @param {ArrayBuffer} buffer - the raw file the user opened
 * @returns {Promise<{found: boolean, keys: number}>} what was restored
 */
const extractBrickwrightState = async buffer => {
    try {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(buffer);
        const entry = zip.file(BUNDLE_PATH);
        if (!entry) return {found: false, keys: 0};   // a legacy or vanilla project
        const doc = JSON.parse(await entry.async('text'));
        if (!doc || typeof doc.state !== 'object' || doc.state === null) {
            return {found: false, keys: 0};
        }
        let keys = 0;
        for (const key of Object.keys(doc.state)) {
            // Honour the same allowlist on the way IN. A file is untrusted input,
            // and a bundle must not be able to set arbitrary localStorage keys.
            if (!isContentKey(key)) continue;
            const value = doc.state[key];
            if (typeof value !== 'string') continue;
            try {
                localStorage.setItem(key, value);
                keys++;
            } catch (e) { /* storage full or disabled; skip this key */ }
        }
        return {found: true, keys};
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[brickwright] could not read tab state from the project', e);
        return {found: false, keys: 0};
    }
};

export {attachBrickwrightState, extractBrickwrightState, isContentKey, BUNDLE_PATH, BUNDLE_VERSION};

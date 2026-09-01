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
const BUNDLE_FORMAT = 'brickwright-state';
const BUNDLE_VERSION = 2;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const SECTION_LIMITS = Object.freeze({code: 512 * 1024, circuit: 1024 * 1024,
    controller: 512 * 1024});
const KNOWN_SECTIONS = Object.freeze(['code', 'circuit', 'controller', 'legacyWidgets']);
let preservedBundle = null;

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

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const decodeSection = (name, value) => {
    if (!isRecord(value)) throw new Error(`${name} must be an object`);
    const limit = SECTION_LIMITS[name];
    if (limit && JSON.stringify(value).length > limit) throw new Error(`${name} exceeds ${limit} bytes`);
    if (name === 'code' && (typeof value.lang !== 'string' || typeof value.code !== 'string')) {
        throw new Error('code must contain string lang and code');
    }
    if (name === 'circuit' && !Array.isArray(value.parts)) {
        throw new Error('circuit must contain a parts array');
    }
    if (name === 'controller' && !Array.isArray(value.widgets)) {
        throw new Error('controller must contain a widgets array');
    }
    return value;
};

const decodeStored = (name, value) => {
    if (typeof value !== 'string') throw new Error(`${name} storage value must be a string`);
    return decodeSection(name, JSON.parse(value));
};

/** Convert allowlisted storage strings into the typed v2 state. */
const encodeProjectState = raw => {
    const state = {};
    if (raw['bw-code-autosave'] !== undefined) {
        state.code = decodeStored('code', raw['bw-code-autosave']);
    }
    if (raw['bw-circuit-autosave'] !== undefined) {
        state.circuit = decodeStored('circuit', raw['bw-circuit-autosave']);
    }
    if (raw['bw-ctl-widgets'] !== undefined) {
        state.controller = decodeStored('controller', raw['bw-ctl-widgets']);
    }
    const legacyWidgets = Object.fromEntries(Object.entries(raw)
        .filter(([key, value]) => KEY_PREFIXES.some(prefix => key.startsWith(prefix)) &&
            typeof value === 'string'));
    if (Object.keys(legacyWidgets).length) state.legacyWidgets = legacyWidgets;
    return state;
};

/** Convert a typed v2 state into the exact storage records consumed by mounted tabs. */
const decodeProjectState = state => {
    if (!isRecord(state)) throw new Error('state must be an object');
    const raw = {};
    if (state.code !== undefined) raw['bw-code-autosave'] = JSON.stringify(decodeSection('code', state.code));
    if (state.circuit !== undefined) {
        raw['bw-circuit-autosave'] = JSON.stringify(decodeSection('circuit', state.circuit));
    }
    if (state.controller !== undefined) {
        raw['bw-ctl-widgets'] = JSON.stringify(decodeSection('controller', state.controller));
    }
    if (state.legacyWidgets !== undefined) {
        if (!isRecord(state.legacyWidgets)) throw new Error('legacyWidgets must be an object');
        for (const [key, value] of Object.entries(state.legacyWidgets)) {
            if (!KEY_PREFIXES.some(prefix => key.startsWith(prefix)) || typeof value !== 'string') {
                throw new Error(`invalid legacy widget ${key}`);
            }
            raw[key] = value;
        }
    }
    return raw;
};

const migrateV1 = doc => {
    if (!isRecord(doc.state)) throw new Error('v1 state must be an object');
    const raw = {};
    for (const [key, value] of Object.entries(doc.state)) {
        if (!isContentKey(key)) continue;
        if (typeof value !== 'string') throw new Error(`${key} must be a string`);
        raw[key] = value;
    }
    // Validate every recognized section before returning any of it.
    return decodeProjectState(encodeProjectState(raw));
};

/** Pure parser: classify and normalize before anything touches localStorage. */
const parseBundleDocument = text => {
    if (typeof text !== 'string' || text.length > MAX_BUNDLE_BYTES) {
        return {outcome: 'invalid', reason: `bundle exceeds ${MAX_BUNDLE_BYTES} bytes`,
            report: {action: 'refused', supportedVersion: BUNDLE_VERSION}};
    }
    let doc;
    try { doc = JSON.parse(text); } catch (error) {
        return {outcome: 'invalid', reason: `invalid JSON: ${error.message}`,
            report: {action: 'refused', supportedVersion: BUNDLE_VERSION}};
    }
    if (!isRecord(doc)) return {outcome: 'invalid', reason: 'document must be an object'};
    const version = doc.version === undefined ? 1 : doc.version;
    if (!Number.isInteger(version) || version < 1) {
        return {outcome: 'invalid', reason: 'version must be a positive integer'};
    }
    if (version > BUNDLE_VERSION) return {outcome: 'future', version, passthrough: doc,
        passthroughText: text,
        report: {action: 'preserved-not-applied', version, supportedVersion: BUNDLE_VERSION}};
    try {
        if (version === 1) return {outcome: 'loaded', version, state: migrateV1(doc),
            report: {action: 'migrated-and-applied', version, supportedVersion: BUNDLE_VERSION}};
        if (doc.format !== BUNDLE_FORMAT) {
            return {outcome: 'invalid', version, reason: `format must be ${BUNDLE_FORMAT}`};
        }
        const state = decodeProjectState(doc.state);
        const unknownSections = Object.fromEntries(Object.entries(doc.state)
            .filter(([key]) => !KNOWN_SECTIONS.includes(key)));
        return {outcome: 'loaded', version, state, passthrough: doc, unknownSections,
            report: {action: 'applied', version, supportedVersion: BUNDLE_VERSION,
                unknownSections: Object.keys(unknownSections)}};
    } catch (error) {
        return {outcome: 'invalid', version, reason: error.message};
    }
};

const contentSnapshot = storage => {
    const snapshot = {};
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && isContentKey(key)) snapshot[key] = storage.getItem(key);
    }
    return snapshot;
};

const writeSnapshot = (storage, state) => {
    for (const key of Object.keys(contentSnapshot(storage))) storage.removeItem(key);
    for (const [key, value] of Object.entries(state)) storage.setItem(key, value);
};

/** Replace the project namespace as one transaction, restoring it on any failure. */
const replaceProjectState = (storage, next) => {
    const previous = contentSnapshot(storage);
    try {
        writeSnapshot(storage, next);
        return {outcome: 'loaded', keys: Object.keys(next).length, previous};
    } catch (error) {
        try {
            writeSnapshot(storage, previous);
            return {outcome: 'storage-failed', keys: 0, rolledBack: true, reason: error.message};
        } catch (rollbackError) {
            return {outcome: 'storage-failed', keys: 0, rolledBack: false,
                reason: error.message, rollbackReason: rollbackError.message};
        }
    }
};

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
    if (Object.keys(state).length === 0 && !preservedBundle) return blob;
    try {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        let document;
        if (preservedBundle?.outcome === 'future') {
            zip.file(BUNDLE_PATH, preservedBundle.text);
        } else {
            const previous = preservedBundle?.outcome === 'loaded' ? preservedBundle.document : {};
            const priorState = isRecord(previous.state) ? previous.state : {};
            const unknown = Object.fromEntries(Object.entries(priorState)
                .filter(([key]) => !KNOWN_SECTIONS.includes(key)));
            document = {...previous, format: BUNDLE_FORMAT, version: BUNDLE_VERSION,
                savedAt: new Date().toISOString(), state: {...unknown, ...encodeProjectState(state)}};
        }
        if (document) zip.file(BUNDLE_PATH, JSON.stringify(document));
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
 * @returns {Promise<object>} named load outcome and what was restored
 */
const extractBrickwrightState = async buffer => {
    try {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(buffer);
        const entry = zip.file(BUNDLE_PATH);
        if (!entry) {
            preservedBundle = null;
            const result = replaceProjectState(localStorage, {});
            return result.outcome === 'loaded' ? {...result, outcome: 'legacy', found: false} : result;
        }
        if (entry._data?.uncompressedSize > MAX_BUNDLE_BYTES) {
            preservedBundle = null;
            return {outcome: 'invalid', keys: 0, found: false,
                reason: `bundle exceeds ${MAX_BUNDLE_BYTES} bytes`};
        }
        const parsed = parseBundleDocument(await entry.async('text'));
        if (parsed.outcome === 'future') {
            preservedBundle = {outcome: 'future', text: parsed.passthroughText};
            return {...parsed, keys: 0, found: false};
        }
        if (parsed.outcome !== 'loaded') {
            preservedBundle = null;
            return {...parsed, keys: 0, found: false};
        }
        const result = replaceProjectState(localStorage, parsed.state);
        preservedBundle = result.outcome === 'loaded' && parsed.version === BUNDLE_VERSION ?
            {outcome: 'loaded', document: parsed.passthrough} : null;
        return {...result, version: parsed.version, found: result.outcome === 'loaded'};
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[brickwright] could not read tab state from the project', e);
        return {outcome: 'invalid', found: false, keys: 0, reason: e.message};
    }
};

export {
    attachBrickwrightState, extractBrickwrightState, parseBundleDocument, replaceProjectState,
    encodeProjectState, decodeProjectState, isContentKey, BUNDLE_PATH, BUNDLE_FORMAT, BUNDLE_VERSION
};

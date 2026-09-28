/**
 * Editable artwork lives beside, never instead of, Scratch costume assets.
 * Scratch reads project.json and its SVG/PNG assets; it ignores this ZIP entry.
 * A source record is used only when its renderedMd5ext still matches the
 * costume in project.json. This prevents a stale source from silently replacing
 * artwork edited by Scratch or an older Brickwright.
 */
const ARTWORK_PATH = 'brickwright/artwork/v1.json';
const ARTWORK_FORMAT = 'brickwright-artwork';
const ARTWORK_VERSION = 3;
const MAX_ARTWORK_BYTES = 64 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;

let documents = new WeakMap();
let preservedFuture = null;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const byteLength = value => new TextEncoder().encode(value).byteLength;
const assetName = costume => costume && (costume.asset?.assetId ?
    `${costume.asset.assetId}.${costume.dataFormat}` : costume.md5ext || costume.md5);
const originals = vm => (vm?.runtime?.targets || []).filter(target => target.isOriginal !== false);
const costumeSignature = project => JSON.stringify((project.targets || []).map(target =>
    [target.isStage, target.name, (target.costumes || []).map(costume => costume.md5ext)]));
const loadZip = async () => {
    const module = await import('jszip');
    return module.default || module;
};

const validateLayers = (layers, expectedSize = null) => {
    if (!Array.isArray(layers) || !layers.length) throw new Error('artwork document must contain layers');
    const ids = new Set();
    let pixelSize = null;
    for (const layer of layers) {
        if (!isObject(layer) || typeof layer.id !== 'string' || !['vector', 'bitmap', 'pixel'].includes(layer.type) ||
            typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' ||
            typeof layer.locked !== 'boolean' || !Number.isFinite(layer.opacity) ||
            layer.opacity < 0 || layer.opacity > 1 || !isObject(layer.content) ||
            !['asset', 'svg', 'data-uri', 'pixels'].includes(layer.content.kind)) {
            throw new Error('invalid artwork layer');
        }
        if (ids.has(layer.id)) throw new Error('duplicate artwork layer');
        ids.add(layer.id);
        if (layer.content.kind === 'pixels') {
            const value = layer.content.value;
            if (layer.type !== 'pixel' || !isObject(value) || !Number.isInteger(value.width) ||
                !Number.isInteger(value.height) || value.width < 1 || value.height < 1 ||
                value.width > 128 || value.height > 128 || !Array.isArray(value.pixels) ||
                value.pixels.length !== value.width * value.height ||
                !value.pixels.every(pixel => Number.isInteger(pixel) && pixel >= 0 && pixel <= 15)) {
                throw new Error('invalid pixel source');
            }
            const size = `${value.width}x${value.height}`;
            if ((pixelSize && pixelSize !== size) || (expectedSize && expectedSize !== size)) {
                throw new Error('mismatched pixel layer size');
            }
            pixelSize = size;
        } else if (typeof layer.content.value !== 'string') {
            throw new Error('invalid artwork content');
        }
    }
    return pixelSize;
};

const validateDocument = doc => {
    if (!isObject(doc) || ![1, 2, 3].includes(doc.version)) {
        throw new Error('artwork document must contain layers');
    }
    if (doc.version === 2 || (doc.version === 3 && Object.prototype.hasOwnProperty.call(doc, 'palette'))) {
        if (!Array.isArray(doc.palette) || doc.palette.length !== 16 || doc.palette[0] !== null ||
            !doc.palette.slice(1).every(colour => /^#[0-9a-f]{6}$/i.test(colour))) {
            throw new Error('invalid artwork palette');
        }
    } else if (doc.version === 1 && Object.prototype.hasOwnProperty.call(doc, 'palette')) {
        throw new Error('palette requires artwork document version 2');
    }
    if (Object.prototype.hasOwnProperty.call(doc, 'pixelScale') && (!Number.isInteger(doc.pixelScale) ||
        doc.pixelScale < 1 || doc.pixelScale > 64)) throw new Error('invalid pixel scale');
    const pixelSize = validateLayers(doc.layers);
    if (Object.prototype.hasOwnProperty.call(doc, 'activeLayerId') &&
        !doc.layers.some(layer => layer.id === doc.activeLayerId)) throw new Error('invalid active layer');
    if (byteLength(JSON.stringify(doc)) > MAX_DOCUMENT_BYTES) throw new Error('artwork document is too large');
    if (doc.animation) {
        if (doc.version !== 3 || !pixelSize || !isObject(doc.animation) ||
            !Array.isArray(doc.animation.frames) || doc.animation.frames.length < 2 ||
            doc.animation.frames.length > 64 || typeof doc.animation.activeFrameId !== 'string') {
            throw new Error('invalid artwork animation');
        }
        const frameIds = new Set();
        for (const frame of doc.animation.frames) {
            if (!isObject(frame) || typeof frame.id !== 'string' || !frame.id || frameIds.has(frame.id) ||
                !Number.isInteger(frame.durationMs) || frame.durationMs < 20 || frame.durationMs > 10000 ||
                typeof frame.activeLayerId !== 'string') throw new Error('invalid artwork frame');
            frameIds.add(frame.id);
            if (!Array.isArray(frame.layers) || !frame.layers.some(layer => layer.id === frame.activeLayerId)) {
                throw new Error('invalid artwork frame layers');
            }
            validateLayers(frame.layers, pixelSize);
            if (!frame.layers.every(layer => layer.type === 'pixel' && layer.content.kind === 'pixels')) {
                throw new Error('animation frames require pixel layers');
            }
        }
        if (!frameIds.has(doc.animation.activeFrameId)) throw new Error('invalid active frame');
        const active = doc.animation.frames.find(frame => frame.id === doc.animation.activeFrameId);
        if (JSON.stringify(active.layers) !== JSON.stringify(doc.layers) ||
            active.activeLayerId !== doc.activeLayerId) throw new Error('active frame differs from costume source');
    } else if (doc.version === 3) {
        throw new Error('version 3 artwork requires animation');
    }
    return doc;
};

const fromRendered = costume => ({
    version: 1,
    layers: [{id: 'base',
        type: costume.dataFormat === 'svg' ? 'vector' : 'bitmap',
        name: 'Artwork',
        visible: true,
        locked: false,
        opacity: 1,
        content: {kind: 'asset', value: assetName(costume)}}]
});

/**
 * Store a richer document after an editor operation has rendered its Scratch asset.
 * @param {object} costume Scratch costume receiving the source
 * @param {object} document Editable artwork document
 * @returns {void}
 */
const setCostumeDocument = (costume, document) => {
    if (!costume) return;
    // The VM can finish writing the new asset after the editor calls updateSvg.
    // The editor source generated that render, so bind it to the final md5ext at save.
    documents.set(costume, {renderedMd5ext: assetName(costume),
        pendingRender: true,
        document: validateDocument(document)});
};

/**
 * A legacy editor changed the flattened asset. Its former layered source is now stale.
 * @param {object} costume Scratch costume whose source must be invalidated
 * @returns {void}
 */
const resetCostumeDocument = costume => {
    if (costume) documents.delete(costume);
};

/**
 * Preserve source when Scratch duplicates a costume into a new object.
 * @param {object} original Original costume
 * @param {object} copy Newly created costume
 * @returns {void}
 */
const copyCostumeDocument = (original, copy) => {
    if (!original || !copy) return;
    const record = documents.get(original);
    if (!record || (!record.pendingRender && record.renderedMd5ext !== assetName(original))) return;
    documents.set(copy, {renderedMd5ext: assetName(copy),
        pendingRender: record.pendingRender,
        document: JSON.parse(JSON.stringify(record.document))});
};

const getCostumeDocument = costume => {
    const record = costume && documents.get(costume);
    if (record && (record.pendingRender || record.renderedMd5ext === assetName(costume))) return record.document;
    return costume ? fromRendered(costume) : null;
};

/**
 * Read-only preflight: malformed source must not stop an otherwise valid SB3 opening.
 * @param {ArrayBuffer} input Raw SB3 bytes
 * @returns {Promise<object>} Validated source records or a named failure
 */
const inspectArtwork = async input => {
    try {
        const JSZip = await loadZip();
        const zip = await JSZip.loadAsync(input);
        const entry = zip.file(ARTWORK_PATH);
        if (!entry) return {outcome: 'legacy', records: []};
        if (entry._data?.uncompressedSize > MAX_ARTWORK_BYTES) throw new Error('artwork bundle is too large');
        const raw = await entry.async('text');
        if (byteLength(raw) > MAX_ARTWORK_BYTES) throw new Error('artwork bundle is too large');
        const payload = JSON.parse(raw);
        if (!isObject(payload) || payload.format !== ARTWORK_FORMAT ||
            !Number.isInteger(payload.version) || payload.version < 1 ||
            !Array.isArray(payload.costumes)) throw new Error('invalid artwork bundle');
        const project = JSON.parse(await zip.file('project.json').async('text'));
        if (payload.version > ARTWORK_VERSION) {
            return {outcome: 'future', records: [], raw, signature: costumeSignature(project)};
        }
        const records = [];
        for (const record of payload.costumes) {
            if (!isObject(record) || !Number.isInteger(record.targetIndex) ||
                !Number.isInteger(record.costumeIndex) || typeof record.renderedMd5ext !== 'string') {
                throw new Error('invalid artwork reference');
            }
            const costume = project.targets?.[record.targetIndex]?.costumes?.[record.costumeIndex];
            if (!costume || costume.md5ext !== record.renderedMd5ext) continue;
            validateDocument(record.document);
            if (record.document.version > payload.version) throw new Error('artwork document exceeds bundle version');
            // Every asset reference must point to the matching render or another ZIP asset.
            for (const layer of record.document.layers) {
                if (layer.content.kind === 'asset' && !zip.file(layer.content.value)) {
                    throw new Error(`missing artwork asset ${layer.content.value}`);
                }
            }
            records.push(record);
        }
        return {outcome: 'loaded', records};
    } catch (error) {
        return {outcome: 'invalid', records: [], reason: error.message};
    }
};

/**
 * Call only after vm.loadProject succeeds; no source crosses a project boundary.
 * @param {object} inspection Preflight result
 * @param {object} vm Loaded Scratch VM
 * @returns {object} Number of source documents restored
 */
const applyArtwork = (inspection, vm) => {
    documents = new WeakMap();
    preservedFuture = inspection?.outcome === 'future' ?
        {raw: inspection.raw, signature: inspection.signature} : null;
    if (inspection?.outcome !== 'loaded') return {outcome: inspection?.outcome || 'legacy', count: 0};
    const targets = originals(vm);
    let count = 0;
    for (const record of inspection.records) {
        const costume = targets[record.targetIndex]?.sprite?.costumes?.[record.costumeIndex];
        if (assetName(costume) !== record.renderedMd5ext) continue;
        documents.set(costume, {renderedMd5ext: record.renderedMd5ext, document: record.document});
        count++;
    }
    return {outcome: 'loaded', count};
};

/**
 * Write artwork into an already-open SB3 ZIP, sharing its compression pass.
 * @param {object} zip Loaded JSZip archive
 * @param {object} vm Loaded Scratch VM
 * @returns {Promise<boolean>} Whether the entry was written
 */
const writeArtworkToZip = async (zip, vm) => {
    try {
        const project = JSON.parse(await zip.file('project.json').async('text'));
        if (preservedFuture && preservedFuture.signature === costumeSignature(project)) {
            zip.file(ARTWORK_PATH, preservedFuture.raw);
            return true;
        }
        const targets = originals(vm);
        const costumes = [];
        for (let targetIndex = 0; targetIndex < project.targets.length; targetIndex++) {
            const target = project.targets[targetIndex];
            for (let costumeIndex = 0; costumeIndex < (target.costumes || []).length; costumeIndex++) {
                const saved = target.costumes[costumeIndex];
                const live = targets[targetIndex]?.sprite?.costumes?.[costumeIndex];
                if (!saved.md5ext || !zip.file(saved.md5ext)) continue;
                const record = live && assetName(live) === saved.md5ext && documents.get(live);
                const document = record && (record.pendingRender || record.renderedMd5ext === saved.md5ext) ?
                    record.document : fromRendered(saved);
                costumes.push({targetIndex,
                    costumeIndex,
                    renderedMd5ext: saved.md5ext,
                    document: validateDocument(document)});
            }
        }
        const version = Math.max(1, ...costumes.map(record => record.document.version));
        zip.file(ARTWORK_PATH, JSON.stringify({format: ARTWORK_FORMAT, version, costumes}));
        return true;
    } catch (error) {
        // A source failure may not turn a valid Scratch project into an unsaveable one.
        // eslint-disable-next-line no-console
        console.warn('[brickwright] could not attach artwork source', error);
        return false;
    }
};

/**
 * Standalone helper for callers that have not opened the SB3 ZIP already.
 * @param {Blob} blob Scratch VM's SB3
 * @param {object} vm Loaded Scratch VM
 * @returns {Promise<Blob>} SB3 with optional source entry
 */
const attachArtwork = async (blob, vm) => {
    try {
        const JSZip = await loadZip();
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        if (!await writeArtworkToZip(zip, vm)) return blob;
        return await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[brickwright] could not repack artwork source', error);
        return blob;
    }
};

export {ARTWORK_PATH, ARTWORK_FORMAT, ARTWORK_VERSION, inspectArtwork, applyArtwork,
    attachArtwork, writeArtworkToZip, getCostumeDocument, setCostumeDocument,
    resetCostumeDocument, copyCostumeDocument};

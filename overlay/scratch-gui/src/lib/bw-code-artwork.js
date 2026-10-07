/** Live artwork transaction for the Code ↔ Blocks authoring journey.
 * Declarations choose slots; the current VM supplies their actual artwork.
 * Never carry a source snapshot across a different loaded project.
 */
import {ARTWORK_PATH, ARTWORK_FORMAT, getCostumeDocument} from './bw-artwork-bundle.js';

const copy = value => JSON.parse(JSON.stringify(value));
const originals = vm => (vm.runtime?.targets || []).filter(target => target.isOriginal !== false);
const targetKey = target => target.isStage ? 'stage' : `sprite:${target.name || target.getName?.()}`;
const slotKey = (costume, index) => index === 0 ? `base:${costume._shapeSpec || ''}` :
    `costume:${costume._spec || costume.name}`;
const unique = (items, key, label) => {
    const result = new Map();
    for (const item of items) {
        const id = key(item);
        if (result.has(id)) throw new Error(`Cannot preserve artwork: ambiguous ${label} ${id}`);
        result.set(id, item);
    }
    return result;
};

const captureCodeArtwork = (vm, declarations) => {
    const targets = originals(vm);
    const byTarget = unique(targets, targetKey, 'target');
    const slots = new Map();
    for (const target of declarations.targets || []) {
        const key = targetKey(target);
        const live = byTarget.get(key);
        if (!live) continue;
        if ((target.costumes || []).length !== (live.sprite?.costumes || []).length) {
            throw new Error(`Cannot preserve artwork: costume declarations differ for ${target.name}`);
        }
        const rows = (target.costumes || []).map((costume, index) => ({
            key: slotKey(costume, index), costume: live.sprite.costumes[index]
        }));
        slots.set(key, unique(rows, row => row.key, 'costume declaration'));
    }
    return {targets, slots, byTarget};
};

const codeArtworkMatches = (vm, context) => {
    if (!context) return false;
    const current = originals(vm);
    return current.length === context.targets.length &&
        current.every((target, index) => target === context.targets[index]);
};

/** Modify an owned generated ZIP/project before vm.loadProject. Raw asset bytes
 * and descriptors come from the live VM, so edits made after From blocks count.
 * Changed/deleted declarations keep the compiler's newly generated artwork.
 */
const retainCodeArtwork = (zip, project, vm, context, uploads = []) => {
    if (!codeArtworkMatches(vm, context)) return false;
    const records = [];
    for (const [targetIndex, generated] of (project.targets || []).entries()) {
        const key = targetKey(generated);
        const live = context.byTarget.get(key);
        const prior = context.slots.get(key);
        if (!live || !prior) continue;
        const liveCostumes = live.sprite?.costumes || [];
        const liveCurrent = liveCostumes[live.currentCostume];
        let retainedCurrent = -1;
        const used = new Set();
        for (let index = 0; index < (generated.costumes || []).length; index++) {
            const generatedCostume = generated.costumes[index];
            const declaration = slotKey(generatedCostume, index);
            if (used.has(declaration)) throw new Error(`Cannot preserve artwork: ambiguous costume declaration ${declaration}`);
            used.add(declaration);
            const row = prior.get(declaration);
            if (!row || (index === 0 && uploads.some(upload => upload.sprite === generated.name && upload.mode !== 'add'))) continue;
            const costume = liveCostumes.includes(row.costume) ? row.costume : null;
            if (!costume) throw new Error(`Cannot preserve artwork: missing costume ${generated.name}/${declaration}`);
            const asset = costume.asset;
            // updateSvg may publish the new Asset before refreshing legacy md5ext.
            // The Asset owns both the current bytes and their content identity.
            const filename = asset?.assetId && ['svg', 'png'].includes(asset.dataFormat) ?
                `${asset.assetId}.${asset.dataFormat}` : null;
            if (!asset?.data || !filename) {
                throw new Error(`Cannot preserve artwork: asset unavailable for ${generated.name}/${costume.name}`);
            }
            // VM costume descriptors include an Asset object. Keep the portable
            // descriptor fields, not host object internals or rasterized copies.
            const descriptor = {};
            for (const field of ['assetId', 'name', 'md5ext', 'dataFormat', 'bitmapResolution',
                'rotationCenterX', 'rotationCenterY']) {
                if (costume[field] !== undefined) descriptor[field] = costume[field];
            }
            descriptor.md5ext = filename;
            descriptor.assetId = asset.assetId;
            descriptor.dataFormat = asset.dataFormat;
            // Keep the declaration metadata for subsequent Code generations.
            for (const field of ['_spec', '_shapeSpec']) {
                if (generatedCostume[field] !== undefined) descriptor[field] = generatedCostume[field];
            }
            generated.costumes[index] = descriptor;
            zip.file(filename, asset.data);
            const document = copy(getCostumeDocument(costume));
            records.push({targetIndex, costumeIndex: index, renderedMd5ext: filename, document});
            if (costume === liveCurrent) retainedCurrent = index;
        }
        if (retainedCurrent >= 0) generated.currentCostume = retainedCurrent;
        else generated.currentCostume = Math.min(generated.currentCostume || 0,
            Math.max(0, (generated.costumes || []).length - 1));
    }
    if (records.length) zip.file(ARTWORK_PATH, JSON.stringify({format: ARTWORK_FORMAT,
        version: Math.max(...records.map(record => record.document.version)), costumes: records}));
    zip.file('project.json', JSON.stringify(project));
    return true;
};

// Compression and artwork inspection are asynchronous. A user can keep drawing
// in Costumes while Code is busy; do not replace that newer edit with this ZIP.
const revisionDescriptor = costume => JSON.stringify(['name', 'rotationCenterX', 'rotationCenterY',
    'bitmapResolution'].map(key => costume[key]));
const captureCodeArtworkRevision = (vm, context) => {
    if (!codeArtworkMatches(vm, context)) throw new Error('The loaded project changed while preparing artwork.');
    return originals(vm).map(target => ({target, currentCostume: target.currentCostume,
        costumes: (target.sprite?.costumes || []).map(costume => ({costume, asset: costume.asset,
            id: costume.asset?.assetId, format: costume.asset?.dataFormat,
            bytes: costume.asset?.data ? new Uint8Array(costume.asset.data).slice() : null,
            descriptor: revisionDescriptor(costume), document: JSON.stringify(getCostumeDocument(costume))}))}));
};
const codeArtworkRevisionMatches = (vm, revision) => {
    const current = originals(vm);
    return current.length === revision.length && revision.every((row, targetIndex) => {
        const target = current[targetIndex];
        const costumes = target.sprite?.costumes || [];
        return target === row.target && target.currentCostume === row.currentCostume &&
            costumes.length === row.costumes.length && row.costumes.every((saved, index) => {
                const costume = costumes[index]; const asset = costume?.asset;
                return costume === saved.costume && asset === saved.asset && asset?.assetId === saved.id &&
                    asset?.dataFormat === saved.format && revisionDescriptor(costume) === saved.descriptor &&
                    JSON.stringify(getCostumeDocument(costume)) === saved.document &&
                    (saved.bytes ? asset?.data?.length === saved.bytes.length &&
                        saved.bytes.every((byte, byteIndex) => asset.data[byteIndex] === byte) : !asset?.data);
            });
    });
};

export {captureCodeArtwork, codeArtworkMatches, retainCodeArtwork,
    captureCodeArtworkRevision, codeArtworkRevisionMatches};

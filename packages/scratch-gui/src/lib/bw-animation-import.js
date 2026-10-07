/** Native animation import preparation. Resources are editor artwork, not actors.
 * Prepare and validate everything before committing to an owned generated ZIP.
 */
import {newAnimationResourceId, validateDocument, ARTWORK_PATH, ARTWORK_FORMAT} from './bw-artwork-bundle.js';
import {animationResourceFromDocument} from './bw-animation-resources.js';
import {pixelsToSvg} from './bw-makecode/pixel-image.js';
import {ASSET_LIBRARY_ROLE, validateAssetLibraries} from './bw-asset-library.js';

export const prepareAnimationImport = resources => {
    const ids = new Set();
    return resources.map(native => {
        let document = native.document && JSON.parse(JSON.stringify(native.document));
        if (!document) {
            const frames = native.frames.map((frame, index) => ({id: `frame-${index}`, durationMs: native.intervalMs,
                activeLayerId: 'pixels', layers: [{id: 'pixels', name: 'Pixels', type: 'pixel', visible: true,
                    locked: false, opacity: 1, content: {kind: 'pixels', value: {width: native.width,
                        height: native.height, pixels: Array.from(frame.pixels)}}}]}));
            document = {version: 5, palette: [...native.palette], pixelScale: 3,
                layers: JSON.parse(JSON.stringify(frames[0]?.layers)), activeLayerId: 'pixels',
                animation: {resource: {id: newAnimationResourceId(), name: native.name},
                    activeFrameId: frames[0]?.id, frames}};
        }
        validateDocument(document);
        const rendered = animationResourceFromDocument(document);
        if (ids.has(rendered.id)) throw new Error('Duplicate imported animation resource identity');
        ids.add(rendered.id);
        // Native data is authoritative, including when a companion was supplied.
        if (rendered.width !== native.width || rendered.height !== native.height ||
            rendered.frames.length !== native.frames.length ||
            JSON.stringify(rendered.palette) !== JSON.stringify(native.palette) ||
            rendered.frames.some((frame, i) => frame.durationMs !== native.intervalMs ||
                frame.pixels.some((pixel, j) => pixel !== native.frames[i].pixels[j]))) {
            throw new Error(`Imported animation source differs from native asset ${native.id}`);
        }
        return {...native, document};
    });
};

/** hashBytes must return the storage MD5 of the exact UTF-8 SVG bytes. */
export const installAnimationImport = async (zip, resources, hashBytes) => {
    if (!resources.length) return;
    // Revalidate the pending plan, which may have waited through user edits.
    const prepared = prepareAnimationImport(resources);
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const old = zip.file(ARTWORK_PATH);
    const payload = old ? JSON.parse(await old.async('text')) :
        {format: ARTWORK_FORMAT, version: 7, costumes: [], libraries: []};
    if (payload.format !== ARTWORK_FORMAT || payload.version > 7 || !Array.isArray(payload.costumes)) {
        throw new Error('Cannot install animations into unsupported artwork source');
    }
    validateAssetLibraries(project, payload.libraries || []);
    const existing = new Set(payload.costumes.map(record => record.document?.animation?.resource?.id).filter(Boolean));
    for (const resource of prepared) if (existing.has(resource.document.animation.resource.id)) {
        throw new Error('Imported animation identity already exists in this project');
    }
    let name = 'Arcade artwork';
    while (project.targets.some(target => target.name === name)) name += '_';
    const library = {isStage: false, name, variables: {}, lists: {}, broadcasts: {}, blocks: {},
        comments: {}, costumes: [], sounds: [], currentCostume: 0, volume: 100, layerOrder: project.targets.length,
        visible: false, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'};
    const targetIndex = project.targets.length, assets = [], records = [];
    const reservedNames = new Set(prepared.map(resource => resource.document.animation.resource.name));
    const costumeNames = new Set();
    for (const resource of prepared) {
        const document = resource.document, rendered = animationResourceFromDocument(document);
        const svg = pixelsToSvg({width: rendered.width, height: rendered.height, pixels: rendered.frames.find(frame => frame.id === document.animation.activeFrameId).pixels},
            {palette: rendered.palette, scale: document.pixelScale || 3});
        const bytes = new TextEncoder().encode(svg);
        const assetId = await hashBytes(bytes);
        if (!/^[a-f0-9]{32}$/.test(assetId)) throw new Error('Invalid animation render storage identity');
        const md5ext = `${assetId}.svg`, costumeIndex = library.costumes.length;
        // Different resource UUIDs may render identical pixels and share an
        // authored name. Scratch rejects identical costume records, so allocate
        // distinct carrier names without changing the source documents.
        let costumeName = rendered.name, suffix = 2;
        while (costumeNames.has(costumeName) || (costumeName !== rendered.name && reservedNames.has(costumeName))) {
            const ending = ` ${suffix++}`;
            costumeName = rendered.name.slice(0, 80 - ending.length) + ending;
        }
        costumeNames.add(costumeName);
        library.costumes.push({name: costumeName, assetId, md5ext, dataFormat: 'svg', bitmapResolution: 1,
            rotationCenterX: rendered.width * (document.pixelScale || 3) / 2,
            rotationCenterY: rendered.height * (document.pixelScale || 3) / 2});
        assets.push({md5ext, bytes});
        records.push({targetIndex, costumeIndex, renderedMd5ext: md5ext, document});
    }
    project.targets.push(library);
    const libraries = [...(payload.libraries || []), {targetIndex, role: {...ASSET_LIBRARY_ROLE}}];
    validateAssetLibraries(project, libraries);
    const next = {...payload, version: 7, libraries, costumes: [...payload.costumes, ...records]};
    // No mutations before all resources, hashes and bindings have passed.
    for (const asset of assets) zip.file(asset.md5ext, asset.bytes);
    zip.file('project.json', JSON.stringify(project));
    zip.file(ARTWORK_PATH, JSON.stringify(next));
};

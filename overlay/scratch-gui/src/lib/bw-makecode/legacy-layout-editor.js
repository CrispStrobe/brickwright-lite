/** Colour-index layout editing preserves the original legacy image expression.
 * Layout artwork is shared by its existing frame references; tile definitions,
 * wall flags, scene timing and runtime aliases are not rewritten.
 */
import {svgToPixels, editablePixelSize} from './pixel-image.js';
import {imageToSvg} from './arcade-assets.js';
import {getCostumeDocument, setCostumeDocument} from '../bw-artwork-bundle.js';

const literal = (blocks, block, name) => {
    const input = block.inputs?.[name];
    const value = input && input.block === input.shadow && blocks[input.shadow];
    return value?.fields?.TEXT?.value ?? value?.fields?.NUM?.value ?? null;
};
const originals = vm => (vm?.runtime?.targets || []).filter(target => target.isOriginal !== false);
const svgText = costume => costume?.asset?.decodeText?.() ||
    (costume?.asset?.data ? new TextDecoder().decode(costume.asset.data) : null);

const artworkOf = (vm, target, command) => {
    const blocks = target.blocks._blocks;
    let image = blocks[command.inputs?.IMAGE?.block];
    const seen = new Set();
    while (image?.opcode === 'arcade_cloneImage' && !seen.has(image.id)) {
        seen.add(image.id); image = blocks[image.inputs?.IMAGE?.block];
    }
    if (image?.opcode !== 'arcade_frameImage') return {reason: 'computedImage'};
    const name = literal(blocks, image, 'TEMPLATE');
    const key = literal(blocks, image, 'KEY');
    if (['INDEX', 'START', 'COUNT'].some(field => literal(blocks, image, field) === null)) return {reason: 'computedImage'};
    const index = Number(literal(blocks, image, 'INDEX'));
    const start = Number(literal(blocks, image, 'START'));
    const count = Number(literal(blocks, image, 'COUNT'));
    if (!name || !key || count !== 1 || index !== 0 || !Number.isInteger(start) || start < 0) return {reason: 'computedImage'};
    // Runtime frame definitions override the reporter's template; do not edit
    // an unrelated costume when an authored definition can change this key.
    if (originals(vm).some(candidate => Object.values(candidate.blocks?._blocks || {}).some(block =>
        /[Ff]rame/.test(block.opcode) && block.opcode !== 'arcade_frameImage' && block.opcode !== 'arcade_frameDeltaTime' &&
        block.inputs?.KEY && (literal(candidate.blocks._blocks, block, 'KEY') === key || literal(candidate.blocks._blocks, block, 'KEY') === null)))) {
        return {reason: 'mutableFrames'};
    }
    const matches = originals(vm).filter(candidate => candidate.getName?.() === name);
    if (matches.length !== 1) return {reason: 'missingArtwork'};
    const artworkTarget = matches[0], costume = artworkTarget.getCostumes?.()[start];
    if (!costume) return {reason: 'missingArtwork'};
    const document = getCostumeDocument(costume);
    const layer = document?.layers?.[0];
    if (document && (document.animation || document.layers.length !== 1 ||
        !((layer.type === 'pixel' && layer.content?.kind === 'pixels') ||
          (layer.type === 'vector' && layer.content?.kind === 'asset' && layer.content.value === `${costume.assetId}.svg`)) || !layer.visible || layer.locked || layer.opacity !== 1)) return {reason: 'layeredArtwork'};
    const svg = svgText(costume), pixels = svg && svgToPixels(svg);
    if (!pixels || !editablePixelSize(pixels.width, pixels.height)) return {reason: 'unsupportedArtwork'};
    return {artworkTarget, costume, svg, pixels, document};
};

const sourceOf = (vm, target, command) => {
    const scale = Number(literal(target.blocks._blocks, command, 'SCALE'));
    return [2, 3, 4, 5].includes(scale) ? {...artworkOf(vm, target, command), scale} : {reason: 'computedScale'};
};

export function findLegacyLayoutBlocks (vm) {
    const refs = [];
    for (const target of originals(vm)) for (const command of Object.values(target.blocks?._blocks || {})) {
        if (command.opcode !== 'arcade_setLegacyTilemap') continue;
        const source = sourceOf(vm, target, command);
        const data = source.pixels ? {columns: source.pixels.width, rows: source.pixels.height,
            tileSize: 1 << source.scale, indices: Array.from(source.pixels.pixels),
            walls: new Array(source.pixels.width * source.pixels.height).fill(0),
            images: Array.from({length: 16}, (_, colour) => ({width: 1 << source.scale, height: 1 << source.scale,
                pixels: new Array((1 << source.scale) ** 2).fill(colour), displayName: String(colour)}))} : null;
        refs.push({targetId: target.id, targetName: target.getName(), blockId: command.id,
            kind: 'legacyLayout', data, editable: Boolean(data), reason: source.reason || null,
            artworkTargetId: source.artworkTarget?.id, artworkAssetId: source.costume?.assetId,
            originalSvg: source.svg});
    }
    return refs;
}

export function writeLegacyLayout (vm, ref, data) {
    if (!ref || !data) return false;
    const target = vm?.runtime?.getTargetById?.(ref.targetId);
    const command = target?.blocks?.getBlock?.(ref.blockId);
    if (command?.opcode !== 'arcade_setLegacyTilemap') return false;
    const source = sourceOf(vm, target, command);
    if (!source.pixels || source.svg !== ref.originalSvg || source.artworkTarget.id !== ref.artworkTargetId ||
        source.costume.assetId !== ref.artworkAssetId || data.tileSize !== 1 << source.scale ||
        !editablePixelSize(data.columns, data.rows) || !Array.isArray(data.indices) || data.indices.length !== data.columns * data.rows ||
        data.indices.some(value => !Number.isInteger(value) || value < 0 || value > 15)) return false;
    const storage = vm.runtime.storage;
    if (!storage?.createAsset) return false;
    if (!Array.isArray(data.walls) || data.walls.length !== data.indices.length || data.walls.some(value => value !== 0) ||
        !Array.isArray(data.images) || data.images.length !== 16 || data.images.some((image, colour) =>
            !image || !Array.isArray(image.pixels) || image.width !== data.tileSize || image.height !== data.tileSize || image.pixels.length !== data.tileSize ** 2 ||
            image.pixels.some(pixel => pixel !== colour))) return false;
    if (!writeArtwork(vm, source, {width: data.columns, height: data.rows, pixels: data.indices})) return false;
    vm.emitTargetsUpdate?.();
    vm.runtime.emitProjectChanged?.();
    return true;
}

const writeArtwork = (vm, source, image) => {
    const storage = vm.runtime.storage;
    if (!storage?.createAsset || !editablePixelSize(image.width, image.height) ||
        !Array.isArray(image.pixels) || image.pixels.length !== image.width * image.height ||
        image.pixels.some(pixel => !Number.isInteger(pixel) || pixel < 0 || pixel > 15)) return false;
    const document = source.document && JSON.parse(JSON.stringify(source.document));
    if (document?.layers[0].content.kind === 'pixels') document.layers[0].content.value =
        {width: image.width, height: image.height, pixels: image.pixels.slice()};
    const pixelScale = document?.pixelScale || 4;
    const svg = imageToSvg({width: image.width, height: image.height, pixels: image.pixels}, {scale: pixelScale, palette: source.pixels.palette});
    const asset = storage.createAsset(storage.AssetType.ImageVector, storage.DataFormat.SVG,
        new TextEncoder().encode(svg), null, true);
    if (document?.layers[0].content.kind === 'asset') document.layers[0].content.value = `${asset.assetId}.svg`;
    const costume = source.costume;
    const center = [image.width * pixelScale / 2, image.height * pixelScale / 2];
    if (vm.runtime.renderer) {
        vm.runtime.renderer.updateSVGSkin(costume.skinId, svg, center);
        costume.size = vm.runtime.renderer.getSkinSize(costume.skinId);
    }
    Object.assign(costume, {asset, assetId: asset.assetId, md5: `${asset.assetId}.svg`, dataFormat: 'svg',
        bitmapResolution: 1, rotationCenterX: center[0], rotationCenterY: center[1]});
    if (document) setCostumeDocument(costume, document);
    return true;
};

const WALL_PAIRS = {'<': [[0, 1], [1, 0]], '>': [[1, 0], [0, 1]],
    '<=': [[0, 0], [1, 0]], '>=': [[0, 0], [0, 1]],
    '==': [[0, 0], [0, 1]], '===': [[0, 0], [0, 1]],
    '!=': [[0, 1], [0, 0]], '!==': [[0, 1], [0, 0]]};
const wallOf = (blocks, command) => {
    const block = blocks[command.inputs?.WALL?.block];
    const names = block?.opcode === 'arrays_valueCompare' ? ['LEFT', 'RIGHT'] : ['OPERAND1', 'OPERAND2'];
    const op = block?.opcode === 'arrays_valueCompare' ? block.fields?.OP?.value || literal(blocks, block, 'OP') :
        {operator_lt: '<', operator_gt: '>', operator_equals: '=='}[block?.opcode];
    if (!Object.prototype.hasOwnProperty.call(WALL_PAIRS, op)) return null;
    const left = literal(blocks, block, names[0]), right = literal(blocks, block, names[1]);
    if (left === null || right === null || !Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return null;
    const a = Number(left), b = Number(right);
    const value = {'<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b,
        '==': a === b, '===': a === b, '!=': a !== b, '!==': a !== b}[op];
    return {block, names, op, value, fingerprint: JSON.stringify([block.id, block.opcode, op, block.inputs, left, right])};
};

export function findLegacyTileDefinitions (vm) {
    const refs = [];
    for (const target of originals(vm)) for (const command of Object.values(target.blocks?._blocks || {})) {
        if (command.opcode !== 'arcade_setLegacyTile') continue;
        const source = artworkOf(vm, target, command), rawIndex = literal(target.blocks._blocks, command, 'INDEX');
        const index = rawIndex === null ? null : Number(rawIndex);
        const wall = wallOf(target.blocks._blocks, command);
        const reason = !Number.isInteger(index) || index < 0 || index > 15 ? 'computedIndex' : source.reason;
        refs.push({targetId: target.id, targetName: target.getName(), blockId: command.id, index,
            reason: reason || null, editable: !reason, wallEditable: Boolean(wall), wallFingerprint: wall?.fingerprint,
            originalSvg: source.svg, artworkAssetId: source.costume?.assetId, artworkTargetId: source.artworkTarget?.id,
            data: source.pixels ? {width: source.pixels.width, height: source.pixels.height,
                pixels: Array.from(source.pixels.pixels), wall: wall?.value ?? null} : null});
    }
    return refs;
}

export function writeLegacyTileDefinition (vm, ref, data) {
    if (!ref || !data) return false;
    const current = findLegacyTileDefinitions(vm).find(candidate => candidate.targetId === ref.targetId && candidate.blockId === ref.blockId);
    if (!current?.editable || current.index !== ref.index || current.originalSvg !== ref.originalSvg ||
        current.artworkAssetId !== ref.artworkAssetId || current.artworkTargetId !== ref.artworkTargetId ||
        current.wallFingerprint !== ref.wallFingerprint || (current.wallEditable ? typeof data.wall !== 'boolean' : data.wall !== null)) return false;
    const target = vm.runtime.getTargetById(ref.targetId), command = target.blocks.getBlock(ref.blockId);
    const wall = wallOf(target.blocks._blocks, command);
    const source = artworkOf(vm, target, command);
    if (!writeArtwork(vm, source, data)) return false;
    if (wall && data.wall !== wall.value) {
        const values = WALL_PAIRS[wall.op][data.wall ? 0 : 1];
        for (let index = 0; index < 2; index++) {
            const shadow = target.blocks.getBlock(wall.block.inputs[wall.names[index]].shadow);
            const name = shadow.fields.NUM ? 'NUM' : 'TEXT';
            target.blocks.changeBlock({id: shadow.id, element: 'field', name, value: String(values[index])}, vm.runtime);
        }
        if (vm.editingTarget?.id === target.id) vm.emitWorkspaceUpdate?.();
    }
    vm.emitTargetsUpdate?.();
    vm.runtime.emitProjectChanged?.();
    return true;
}

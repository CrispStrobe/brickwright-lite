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

const sourceOf = (vm, target, command) => {
    const blocks = target.blocks._blocks;
    const scale = Number(literal(blocks, command, 'SCALE'));
    if (![2, 3, 4, 5].includes(scale)) return {reason: 'computedScale'};
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
    return {artworkTarget, costume, svg, pixels, scale, document};
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
            image.width !== data.tileSize || image.height !== data.tileSize || image.pixels.length !== data.tileSize ** 2 ||
            image.pixels.some(pixel => pixel !== colour))) return false;
    const document = source.document && JSON.parse(JSON.stringify(source.document));
    if (document?.layers[0].content.kind === 'pixels') document.layers[0].content.value =
        {width: data.columns, height: data.rows, pixels: data.indices.slice()};
    const pixelScale = document?.pixelScale || 4;
    const svg = imageToSvg({width: data.columns, height: data.rows, pixels: data.indices}, {scale: pixelScale, palette: source.pixels.palette});
    const asset = storage.createAsset(storage.AssetType.ImageVector, storage.DataFormat.SVG,
        new TextEncoder().encode(svg), null, true);
    if (document?.layers[0].content.kind === 'asset') document.layers[0].content.value = `${asset.assetId}.svg`;
    const costume = source.costume;
    const center = [data.columns * pixelScale / 2, data.rows * pixelScale / 2];
    if (vm.runtime.renderer) {
        vm.runtime.renderer.updateSVGSkin(costume.skinId, svg, center);
        costume.size = vm.runtime.renderer.getSkinSize(costume.skinId);
    }
    Object.assign(costume, {asset, assetId: asset.assetId, md5: `${asset.assetId}.svg`, dataFormat: 'svg',
        bitmapResolution: 1, rotationCenterX: center[0], rotationCenterY: center[1]});
    if (document) setCostumeDocument(costume, document);
    vm.emitTargetsUpdate?.();
    vm.runtime.emitProjectChanged?.();
    return true;
}

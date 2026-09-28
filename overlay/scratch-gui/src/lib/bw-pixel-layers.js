import {ARCADE_PALETTE, blankImage, pixelsToSvg, resizeCanvas} from './bw-makecode/pixel-image.js';

const makeLayer = (id, name, image) => ({id, name, visible: true, locked: false,
    opacity: 1, type: 'pixel', pixels: image.pixels});

const composeLayers = (layers, width, height) => {
    const pixels = new Uint8Array(width * height);
    for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        for (let i = 0; i < pixels.length; i++) {
            if (layer.pixels[i]) pixels[i] = layer.pixels[i];
        }
    }
    return {width, height, pixels};
};

// Preserve the historical single-layer SVG byte format for fully opaque art.
// Opacity needs separate SVG groups because palette indices cannot represent
// blended colours without losing the independently editable layer pixels.
const layersToSvg = (layers, width, height, scale, palette = ARCADE_PALETTE) => {
    if (layers.every(layer => !layer.visible || layer.opacity === 0 || layer.opacity === 1)) {
        return pixelsToSvg(composeLayers(layers, width, height), {scale, palette});
    }
    const groups = layers.filter(layer => layer.visible && layer.opacity > 0).map(layer => {
        const svg = pixelsToSvg({width, height, pixels: layer.pixels}, {scale, palette});
        const rects = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length);
        return `<g opacity="${layer.opacity}">${rects}</g>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" ` +
        `viewBox="0 0 ${width * scale} ${height * scale}" shape-rendering="crispEdges">${groups.join('')}</svg>`;
};

const sourceLayers = (document, width, height) => {
    if (!document?.layers?.length || !document.layers.every(layer =>
        layer.type === 'pixel' && layer.content.kind === 'pixels' &&
        layer.content.value.width === width && layer.content.value.height === height)) return null;
    return document.layers.map(layer => ({id: layer.id, name: layer.name, visible: layer.visible,
        locked: layer.locked, opacity: layer.opacity, type: 'pixel',
        pixels: Uint8Array.from(layer.content.value.pixels)}));
};

const resizeLayers = (layers, width, height, nextWidth, nextHeight) => layers.map(layer => ({
    ...layer, pixels: resizeCanvas({width, height, pixels: layer.pixels}, nextWidth, nextHeight).pixels
}));

const serializeLayers = (layers, width, height) => layers.map(layer => ({id: layer.id, type: 'pixel', name: layer.name,
    visible: layer.visible, locked: layer.locked, opacity: layer.opacity,
    content: {kind: 'pixels', value: {width, height, pixels: Array.from(layer.pixels)}}}));

const layersDocument = (layers, width, height, scale, activeLayerId, palette = ARCADE_PALETTE,
    animation = null) => {
    const customPalette = palette.some((colour, index) => colour !== ARCADE_PALETTE[index]);
    return {version: animation ? 3 : customPalette ? 2 : 1,
        ...(customPalette ? {palette: [...palette]} : {}), pixelScale: scale, activeLayerId,
        layers: serializeLayers(layers, width, height),
        ...(animation ? {animation: {activeFrameId: animation.activeFrameId,
            frames: animation.frames.map(frame => ({id: frame.id, durationMs: frame.durationMs,
                activeLayerId: frame.activeLayerId,
                layers: serializeLayers(frame.layers, width, height)}))}} : {})};
};

const sourceFrames = (document, width, height) => {
    if (document?.version !== 3 || !document.animation) return null;
    const frames = document.animation.frames.map(frame => ({id: frame.id, durationMs: frame.durationMs,
        activeLayerId: frame.activeLayerId, layers: sourceLayers({layers: frame.layers}, width, height)}));
    return frames.every(frame => frame.layers) ? frames : null;
};

const blankLayer = (id, name, width, height) => makeLayer(id, name, blankImage(width, height));

const selectionRect = (start, end) => ({x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]), width: Math.abs(start[0] - end[0]) + 1,
    height: Math.abs(start[1] - end[1]) + 1});

const containsCell = (selection, x, y) => selection && x >= selection.x && y >= selection.y &&
    x < selection.x + selection.width && y < selection.y + selection.height;

const clearSelectedPixels = (pixels, width, selection) => {
    const next = new Uint8Array(pixels);
    for (let y = selection.y; y < selection.y + selection.height; y++) {
        next.fill(0, (y * width) + selection.x, (y * width) + selection.x + selection.width);
    }
    return next;
};

const copySelectedPixels = (pixels, width, selection) => {
    const copied = new Uint8Array(selection.width * selection.height);
    for (let y = 0; y < selection.height; y++) {
        for (let x = 0; x < selection.width; x++) {
            copied[(y * selection.width) + x] = pixels[((selection.y + y) * width) + selection.x + x];
        }
    }
    return {width: selection.width, height: selection.height, pixels: copied};
};

const pasteSelectedPixels = (clipboard, width, height, x, y) => {
    const pixels = new Uint8Array(width * height);
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(width, x + clipboard.width);
    const bottom = Math.min(height, y + clipboard.height);
    if (right <= left || bottom <= top) return null;
    for (let py = top; py < bottom; py++) {
        for (let px = left; px < right; px++) {
            pixels[(py * width) + px] = clipboard.pixels[((py - y) * clipboard.width) + px - x];
        }
    }
    return {pixels, selection: {x: left, y: top, width: right - left, height: bottom - top}};
};

const stampBrushInto = (pixels, width, height, x, y, value, size = 1, mirror = false) => {
    const before = Math.floor((size - 1) / 2);
    const after = size - before - 1;
    for (let dy = -before; dy <= after; dy++) {
        for (let dx = -before; dx <= after; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            pixels[(py * width) + px] = value;
            if (mirror) pixels[(py * width) + width - 1 - px] = value;
        }
    }
};

const replaceColourPixels = (pixels, width, height, selection, from, to) => {
    const next = new Uint8Array(pixels);
    if (from === to) return next;
    const region = selection || {x: 0, y: 0, width, height};
    for (let y = region.y; y < region.y + region.height; y++) {
        for (let x = region.x; x < region.x + region.width; x++) {
            const index = (y * width) + x;
            if (next[index] === from) next[index] = to;
        }
    }
    return next;
};

const outlinePixels = (pixels, width, height, selection, colour) => {
    const next = new Uint8Array(pixels);
    if (!colour) return next;
    const region = selection || {x: 0, y: 0, width, height};
    const inside = (x, y) => x >= region.x && y >= region.y &&
        x < region.x + region.width && y < region.y + region.height;
    for (let y = region.y; y < region.y + region.height; y++) {
        for (let x = region.x; x < region.x + region.width; x++) {
            const index = (y * width) + x;
            if (pixels[index]) continue;
            if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
                .some(([nx, ny]) => inside(nx, ny) && pixels[(ny * width) + nx])) next[index] = colour;
        }
    }
    return next;
};

const moveSelectedPixels = (pixels, width, height, selection, requestedDx, requestedDy) => {
    const dx = Math.max(-selection.x, Math.min(width - selection.x - selection.width, requestedDx));
    const dy = Math.max(-selection.y, Math.min(height - selection.y - selection.height, requestedDy));
    const next = clearSelectedPixels(pixels, width, selection);
    for (let y = 0; y < selection.height; y++) {
        for (let x = 0; x < selection.width; x++) {
            const original = ((selection.y + y) * width) + selection.x + x;
            const destination = ((selection.y + y + dy) * width) + selection.x + x + dx;
            next[destination] = pixels[original];
        }
    }
    return {pixels: next, selection: {...selection, x: selection.x + dx, y: selection.y + dy}};
};

// Transform palette indices rather than a rendered image. A selection affects
// only its rectangle; a whole-canvas quarter turn swaps canvas dimensions.
const transformPixels = (pixels, width, height, selection, operation) => {
    const region = selection || {x: 0, y: 0, width, height};
    const turn = operation === 'rotate-cw' || operation === 'rotate-ccw';
    if (!['flip-h', 'flip-v', 'rotate-cw', 'rotate-ccw'].includes(operation)) return null;
    const regionWidth = turn ? region.height : region.width;
    const regionHeight = turn ? region.width : region.height;
    const outWidth = turn && !selection ? height : width;
    const outHeight = turn && !selection ? width : height;
    if (regionWidth > outWidth || regionHeight > outHeight) return null;
    const left = selection ? Math.min(region.x, outWidth - regionWidth) : 0;
    const top = selection ? Math.min(region.y, outHeight - regionHeight) : 0;
    const out = selection ? clearSelectedPixels(pixels, width, region) : null;
    const next = selection ? out : new Uint8Array(outWidth * outHeight);
    for (let y = 0; y < region.height; y++) {
        for (let x = 0; x < region.width; x++) {
            let tx; let ty;
            switch (operation) {
            case 'flip-h': tx = region.width - 1 - x; ty = y; break;
            case 'flip-v': tx = x; ty = region.height - 1 - y; break;
            case 'rotate-cw': tx = region.height - 1 - y; ty = x; break;
            default: tx = y; ty = region.width - 1 - x;
            }
            next[((top + ty) * outWidth) + left + tx] =
                pixels[((region.y + y) * width) + region.x + x];
        }
    }
    return {pixels: next, width: outWidth, height: outHeight,
        selection: selection ? {x: left, y: top, width: regionWidth, height: regionHeight} : null};
};

export {blankLayer, clearSelectedPixels, composeLayers, containsCell, copySelectedPixels, layersDocument, layersToSvg,
    moveSelectedPixels, outlinePixels, pasteSelectedPixels, replaceColourPixels, resizeLayers, selectionRect, sourceLayers,
    sourceFrames, stampBrushInto, transformPixels};

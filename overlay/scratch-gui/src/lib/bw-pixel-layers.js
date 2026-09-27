import {blankImage, resizeCanvas} from './bw-makecode/pixel-image.js';

const makeLayer = (id, name, image) => ({id, name, visible: true, locked: false,
    opacity: 1, type: 'pixel', pixels: image.pixels});

const composeLayers = (layers, width, height) => {
    const pixels = new Uint8Array(width * height);
    for (const layer of layers) {
        if (!layer.visible) continue;
        for (let i = 0; i < pixels.length; i++) {
            if (layer.pixels[i]) pixels[i] = layer.pixels[i];
        }
    }
    return {width, height, pixels};
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

const layersDocument = (layers, width, height, scale, activeLayerId) => ({
    version: 1, pixelScale: scale, activeLayerId,
    layers: layers.map(layer => ({id: layer.id, type: 'pixel', name: layer.name,
        visible: layer.visible, locked: layer.locked, opacity: layer.opacity,
        content: {kind: 'pixels', value: {width, height, pixels: Array.from(layer.pixels)}}}))
});

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

export {blankLayer, clearSelectedPixels, composeLayers, containsCell, layersDocument,
    moveSelectedPixels, resizeLayers, selectionRect, sourceLayers};

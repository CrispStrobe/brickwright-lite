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

export {blankLayer, composeLayers, layersDocument, resizeLayers, sourceLayers};

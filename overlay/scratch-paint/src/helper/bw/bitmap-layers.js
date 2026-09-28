import paper from '@scratch/paper';
import {ART_BOARD_WIDTH, ART_BOARD_HEIGHT, CENTER} from '../view';
import {createCanvas, getRaster, getRasterLayer} from '../layer';

const rasters = () => {
    getRaster(); // Ensure the base raster exists.
    return getRasterLayer().children.filter(item => item instanceof paper.Raster);
};
const id = () => `bitmap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const getBitmapLayers = () => rasters().map(raster => ({
    id: raster.data.bwBitmapLayerId || 'base',
    name: raster.data.bwBitmapLayerName || 'Artwork',
    visible: raster.visible,
    opacity: raster.opacity,
    active: raster === getRaster()
}));
const setActiveBitmapLayer = layerId => {
    const target = rasters().find(raster => raster.data.bwBitmapLayerId === layerId);
    if (!target) return false;
    for (const raster of rasters()) raster.data.bwBitmapActive = raster === target;
    return true;
};
const addBitmapLayer = name => {
    const raster = new paper.Raster(createCanvas());
    raster.parent = getRasterLayer();
    raster.guide = true;
    raster.locked = true;
    raster.position = CENTER;
    raster.data.bwBitmapLayerId = id();
    raster.data.bwBitmapLayerName = name;
    setActiveBitmapLayer(raster.data.bwBitmapLayerId);
    return raster.data.bwBitmapLayerId;
};
const deleteBitmapLayer = layerId => {
    const layers = rasters();
    if (layers.length < 2) return false;
    const target = layers.find(raster => raster.data.bwBitmapLayerId === layerId);
    if (!target) return false;
    const index = layers.indexOf(target);
    const nextActiveId = layers[index === 0 ? 1 : index - 1].data.bwBitmapLayerId;
    target.remove();
    setActiveBitmapLayer(nextActiveId);
    return true;
};
const setBitmapLayerVisibility = (layerId, visible) => {
    const target = rasters().find(raster => raster.data.bwBitmapLayerId === layerId);
    if (!target) return false;
    target.visible = visible;
    return true;
};
const setBitmapLayerOpacity = (layerId, opacity) => {
    const target = rasters().find(raster => raster.data.bwBitmapLayerId === layerId);
    if (!target) return false;
    target.opacity = Math.max(0, Math.min(1, Number(opacity)));
    return true;
};
const moveBitmapLayer = (layerId, direction) => {
    const layers = rasters();
    const index = layers.findIndex(raster => raster.data.bwBitmapLayerId === layerId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= layers.length) return false;
    getRasterLayer().insertChild(next, layers[index]);
    return true;
};
const getCompositeBitmapRaster = activeReplacement => {
    const canvas = createCanvas();
    const context = canvas.getContext('2d');
    for (const raster of rasters()) {
        if (!raster.visible) continue;
        context.globalAlpha = raster.opacity;
        context.drawImage(raster === getRaster() && activeReplacement ? activeReplacement.canvas : raster.canvas, 0, 0);
    }
    context.globalAlpha = 1;
    const composite = new paper.Raster(canvas);
    composite.remove();
    composite.position = CENTER;
    return composite;
};
const getBitmapLayerDocument = activeReplacement => {
    const layers = rasters();
    if (layers.length < 2) return null;
    return {version: 1, activeLayerId: getRaster().data.bwBitmapLayerId, layers: layers.map(raster => ({
        id: raster.data.bwBitmapLayerId,
        type: 'bitmap',
        name: raster.data.bwBitmapLayerName,
        visible: raster.visible,
        locked: false,
        opacity: raster.opacity,
        content: {kind: 'data-uri', value: (raster === getRaster() && activeReplacement ?
            activeReplacement.canvas : raster.canvas).toDataURL('image/png')}
    }))};
};
const loadBitmapLayers = async (document, isCurrent = () => true) => {
    if (!document || !Array.isArray(document.layers) || document.layers.length < 2 ||
        !document.layers.every(layer => layer.type === 'bitmap' && layer.content?.kind === 'data-uri')) return false;
    const images = await Promise.all(document.layers.map(layer => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = layer.content.value;
    })));
    if (!isCurrent()) return false;
    getRasterLayer().removeChildren();
    document.layers.forEach((layer, index) => {
        const canvas = createCanvas(ART_BOARD_WIDTH, ART_BOARD_HEIGHT);
        canvas.getContext('2d').drawImage(images[index], 0, 0);
        const raster = new paper.Raster(canvas);
        raster.parent = getRasterLayer();
        raster.guide = true;
        raster.locked = true;
        raster.position = CENTER;
        raster.visible = layer.visible;
        raster.opacity = layer.opacity;
        raster.data.bwBitmapLayerId = layer.id;
        raster.data.bwBitmapLayerName = layer.name;
        raster.data.bwBitmapActive = layer.id === document.activeLayerId;
    });
    if (!rasters().some(raster => raster.data.bwBitmapActive)) rasters()[0].data.bwBitmapActive = true;
    return true;
};

export {getBitmapLayers, setActiveBitmapLayer, addBitmapLayer, deleteBitmapLayer,
    setBitmapLayerVisibility, setBitmapLayerOpacity, moveBitmapLayer,
    getCompositeBitmapRaster, getBitmapLayerDocument, loadBitmapLayers};

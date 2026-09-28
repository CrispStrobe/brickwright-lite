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
const layersToSvg = (layers, width, height, scale) => {
    if (layers.every(layer => !layer.visible || layer.opacity === 0 || layer.opacity === 1)) {
        return pixelsToSvg(composeLayers(layers, width, height), {scale});
    }
    const groups = layers.filter(layer => layer.visible && layer.opacity > 0).map(layer => {
        const svg = pixelsToSvg({width, height, pixels: layer.pixels}, {scale});
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
    x < selection.x + selection.width && y < selection.y + selection.height &&
    (!selection.mask || Boolean(selection.mask[((y - selection.y) * selection.width) + x - selection.x]));

const cropMask = (full, width, height) => {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!full[(y * width) + x]) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    if (maxX < 0) return null;
    const croppedWidth = maxX - minX + 1;
    const croppedHeight = maxY - minY + 1;
    const mask = new Uint8Array(croppedWidth * croppedHeight);
    for (let y = 0; y < croppedHeight; y++) {
        for (let x = 0; x < croppedWidth; x++) {
            mask[(y * croppedWidth) + x] = full[((minY + y) * width) + minX + x];
        }
    }
    return {x: minX, y: minY, width: croppedWidth, height: croppedHeight, mask};
};

const lassoSelection = (points, width, height) => {
    if (!points.length) return null;
    const mask = new Uint8Array(width * height);
    const mark = (x, y) => {
        if (x >= 0 && y >= 0 && x < width && y < height) mask[(y * width) + x] = 1;
    };
    for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        let x = ax;
        let y = ay;
        const dx = Math.abs(bx - ax);
        const dy = -Math.abs(by - ay);
        const sx = ax < bx ? 1 : -1;
        const sy = ay < by ? 1 : -1;
        let error = dx + dy;
        while (true) {
            mark(x, y);
            if (x === bx && y === by) break;
            const doubled = 2 * error;
            if (doubled >= dy) { error += dy; x += sx; }
            if (doubled <= dx) { error += dx; y += sy; }
        }
    }
    if (points.length >= 3) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let inside = false;
                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const [xi, yi] = points[i];
                    const [xj, yj] = points[j];
                    if ((yi > y) !== (yj > y) &&
                        x < ((xj - xi) * (y - yi) / (yj - yi)) + xi) inside = !inside;
                }
                if (inside) mark(x, y);
            }
        }
    }
    return cropMask(mask, width, height);
};

const paletteRgb = ARCADE_PALETTE.map(colour => colour ? [1, 3, 5].map(i =>
    parseInt(colour.slice(i, i + 2), 16)) : null);
const colourDistance = (a, b) => {
    if (a === 0 || b === 0) return a === b ? 0 : Infinity;
    return Math.hypot(...paletteRgb[a].map((channel, index) => channel - paletteRgb[b][index])) / Math.sqrt(3);
};

const wandSelection = (pixels, width, height, startX, startY, tolerance = 0) => {
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return null;
    const start = (startY * width) + startX;
    const colour = pixels[start];
    const mask = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    mask[start] = 1;
    while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1,
            y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
        for (const next of neighbours) {
            if (next < 0 || mask[next] || colourDistance(colour, pixels[next]) > tolerance) continue;
            mask[next] = 1;
            queue[tail++] = next;
        }
    }
    return cropMask(mask, width, height);
};

const clearSelectedPixels = (pixels, width, selection) => {
    const next = new Uint8Array(pixels);
    for (let y = selection.y; y < selection.y + selection.height; y++) {
        for (let x = selection.x; x < selection.x + selection.width; x++) {
            if (containsCell(selection, x, y)) next[(y * width) + x] = 0;
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
            if (!containsCell(selection, selection.x + x, selection.y + y)) continue;
            const original = ((selection.y + y) * width) + selection.x + x;
            const destination = ((selection.y + y + dy) * width) + selection.x + x + dx;
            next[destination] = pixels[original];
        }
    }
    return {pixels: next, selection: {...selection, x: selection.x + dx, y: selection.y + dy}};
};

export {blankLayer, clearSelectedPixels, composeLayers, containsCell, lassoSelection, layersDocument, layersToSvg,
    moveSelectedPixels, resizeLayers, selectionRect, sourceLayers, wandSelection};

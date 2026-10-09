// Mutable Arcade images. Independent of the renderer; transparent color 0
// participates in collisions only after a nonzero pixel is written.
module.exports = function imageEngine(palette, initializePxtOperations) {
    const operations = initializePxtOperations();
    const adapter = image => ({_width: image.width, _height: image.height, data: image.pixels,
        makeWritable() {}, color: c => Number(c) & 15,
        pix: (x, y) => (x | 0) + (y | 0) * image.width,
        inRange: (x, y) => (x | 0) >= 0 && (y | 0) >= 0 && (x | 0) < image.width && (y | 0) < image.height,
        clamp: (x, y) => [Math.max(0, Math.min(image.width - 1, x | 0)), Math.max(0, Math.min(image.height - 1, y | 0))]});
    const draw = (image, operation, ...args) => {
        if (!operations[operation]) return false;
        operations[operation](adapter(image), ...args.map(value => Number(value) || 0));
        return true;
    };
    const blit = (image, source, operation, x, y) => {
        if (!['drawImage', 'drawTransparentImage', 'overlapsWith'].includes(operation)) return false;
        return operations[operation](adapter(image), adapter(source), Number(x) || 0, Number(y) || 0);
    };
    const decode = (costume, size) => {
        const data = costume?.asset?.data;
        if (!data || !size || !Number.isInteger(size.width) || !Number.isInteger(size.height)) return null;
        const svg = typeof data === 'string' ? data : Array.from(data, b => String.fromCharCode(b)).join('');
        const root = /<svg\b[^>]*>/i.exec(svg);
        if (!root || !/shape-rendering="crispEdges"/.test(root[0])) return null;
        const body = svg.slice(root.index + root[0].length).replace(/<\/svg>\s*$/i, '');
        if (body.replace(/<rect\b[^>]*\/\s*>/gi, '').trim()) return null;
        const pixels = new Uint8Array(size.width * size.height);
        const attr = (tag, name) => new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(tag)?.[1];
        const declaredPalette = attr(root[0], 'data-bw-palette');
        let sourcePalette = palette;
        if (declaredPalette !== undefined) {
            const colors = declaredPalette.split(',');
            if (colors.length !== 15 || !colors.every(color => /^#[0-9a-f]{6}$/i.test(color))) return null;
            sourcePalette = [null, ...colors.map(color => color.toLowerCase())];
        }
        const declaredScale = attr(root[0], 'data-bw-pixel-scale');
        if (declaredScale !== undefined && (!/^\d+$/.test(declaredScale) || Number(declaredScale) < 1)) return null;
        const scale = declaredScale === undefined ? 4 : Number(declaredScale);
        const rootWidth = Number(attr(root[0], 'width')), rootHeight = Number(attr(root[0], 'height'));
        if (rootWidth !== size.width * scale || rootHeight !== size.height * scale) return null;
        for (const rect of body.matchAll(/<rect\b([^>]*)\/\s*>/gi)) {
            const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(k => Number(attr(rect[1], k)) / scale);
            const fill = (attr(rect[1], 'fill') || '').toLowerCase();
            const declaredIndex = attr(rect[1], 'data-bw-color-index');
            let color = sourcePalette.findIndex((c, i) => i > 0 && c?.toLowerCase() === fill);
            if (declaredIndex !== undefined) {
                if (!/^(?:[1-9]|1[0-5])$/.test(declaredIndex)) return null;
                color = Number(declaredIndex);
                if (!sourcePalette[color] || sourcePalette[color].toLowerCase() !== fill) return null;
            } else if (declaredPalette !== undefined) return null;
            if (color < 0 || ![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 0 || h < 0 ||
                x + w > size.width || y + h > size.height) return null;
            for (let row = y; row < y + h; row++) pixels.fill(color, row * size.width + x, row * size.width + x + w);
        }
        return {width: size.width, height: size.height, pixels,
            ...(declaredPalette !== undefined ? {palette: sourcePalette} : {})};
    };
    const mutate = (image, operation, color, replacement) => {
        const {width, height, pixels} = image;
        if (operation === 'fill') pixels.fill(Number(color) & 15);
        else if (operation === 'replace') {
            for (let i = 0; i < pixels.length; i++) if (pixels[i] === Number(color)) pixels[i] = Number(replacement) & 15;
        } else if (operation === 'flipX' || operation === 'flipY') {
            const horizontal = operation === 'flipX';
            for (let y = 0; y < (horizontal ? height : Math.floor(height / 2)); y++) {
                for (let x = 0; x < (horizontal ? Math.floor(width / 2) : width); x++) {
                    const a = y * width + x;
                    const b = horizontal ? y * width + width - 1 - x : (height - 1 - y) * width + x;
                    const t = pixels[a]; pixels[a] = pixels[b]; pixels[b] = t;
                }
            }
        } else return false;
        return true;
    };
    // Shift mutable pixels with the same signed32 offsets and zero-filled
    // clipping as the original PXT ImageMethods.scroll. Keep buffer identity.
    const copyFrom = (image, source) => {
        // Arcade mutable images use 4-bit indexed pixels. PXT refuses a
        // dimension mismatch, and copies zero pixels without replacing data.
        if (image.width !== source.width || image.height !== source.height) return false;
        image.pixels.set(source.pixels);
        return true;
    };
    const scroll = (image, dx, dy) => {
        dx = Number(dx) | 0; dy = Number(dy) | 0;
        if (!dx && !dy) return;
        const {width, height, pixels} = image;
        const before = pixels.slice();
        pixels.fill(0);
        const startX = Math.max(0, dx), endX = Math.min(width, width + dx);
        const startY = Math.max(0, dy), endY = Math.min(height, height + dy);
        if (startX >= endX || startY >= endY) return;
        for (let y = startY; y < endY; y++) {
            const start = (y - dy) * width + startX - dx;
            pixels.set(before.subarray(start, start + endX - startX), y * width + startX);
        }
    };
    const svg = (image, paletteOverride = image.palette || palette) => {
        const {width, height, pixels} = image;
        const customPalette = paletteOverride !== palette && paletteOverride.some((color, index) =>
            index > 0 && color?.toLowerCase() !== palette[index]?.toLowerCase());
        if (customPalette && (paletteOverride.length !== 16 || paletteOverride[0] !== null ||
            !paletteOverride.slice(1).every(color => /^#[0-9a-f]{6}$/i.test(color)))) {
            throw new Error('Invalid Arcade image palette');
        }
        const rects = [];
        for (let y = 0; y < height; y++) for (let x = 0; x < width;) {
            const color = pixels[y * width + x]; const start = x++;
            while (x < width && pixels[y * width + x] === color) x++;
            if (color) rects.push('<rect x="' + start * 4 + '" y="' + y * 4 + '" width="' + (x - start) * 4 +
                '" height="4" fill="' + paletteOverride[color] + '"' +
                (customPalette ? ' data-bw-color-index="' + color + '"' : '') + '/>');
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width * 4 + '" height="' + height * 4 +
            '" viewBox="0 0 ' + width * 4 + ' ' + height * 4 + '" shape-rendering="crispEdges"' + (customPalette ? ' data-bw-pixel-scale="4" data-bw-palette="' +
                paletteOverride.slice(1).map(color => color.toLowerCase()).join(',') + '"' : '') + '>' + rects.join('') + '</svg>';
    };
    // Scaled and rotated sprites (task F4): the pinned simulator's own routines.
    // Its args are a RefCollection; getAt is all of it these use.
    const collection = values => ({getAt: i => values[i]});
    const drawScaledRotated = (image, source, x, y, sx, sy, angle) =>
        operations.drawScaledRotatedImage(adapter(image), adapter(source), collection([x | 0, y | 0, sx, sy, angle]));
    const overlapsScaledRotated = (image, x, y, source, sx, sy, angle) =>
        operations.checkOverlapsScaledRotatedImage(adapter(image), adapter(source), collection([x | 0, y | 0, sx, sy, angle]));
    const overlapsTwoScaledRotated = (image, x, y, imageSx, imageSy, imageAngle, source, sx, sy, angle) =>
        operations.checkOverlapsTwoScaledRotatedImages(adapter(image), adapter(source),
            collection([x | 0, y | 0, imageSx, imageSy, imageAngle, sx, sy, angle]));
    return {decode, mutate, scroll, copyFrom, svg, draw, blit, getPixel: (image, x, y) => operations.getPixel(adapter(image), x, y),
        drawScaledRotated, overlapsScaledRotated, overlapsTwoScaledRotated};
};

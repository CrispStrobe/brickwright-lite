/**
 * Palette pixel art ↔ costumes: the data half of the pixel editor, and of the
 * costume → Arcade image export.
 *
 * A pixel image is {width, height, pixels: Uint8Array} of palette indices, the
 * shape arcade-assets.js already decodes MakeCode's art into (index 0 is
 * transparent). Costumes are stored the way that module emits them — an SVG of
 * crisp-edged rects, one per run of a colour, at an integer scale — so:
 *
 *   svgToPixels     reads that SVG back EXACTLY (it is our own format: rects on
 *                   an integer grid, fills from the palette). A costume that is
 *                   not in it returns null, and the caller rasterizes instead.
 *   quantizeRgba    turns any raster (a drawn costume, a photo) into palette
 *                   pixels at a chosen size — nearest colour in RGB, alpha below
 *                   half is transparent. Lossy by nature, and the caller shows a
 *                   preview rather than pretending otherwise.
 *   pixelsToSvg     is arcade-assets' imageToSvg (one emitter, not two).
 *   toImgLiteral    writes MakeCode's `img` literal, the form export needs.
 *
 * Pure functions, no DOM, so every one is unit-tested in Node.
 *
 * @module
 */
import {ARCADE_PALETTE, imageToSvg} from './arcade-assets.js';

export {ARCADE_PALETTE};

const hexToRgb = hex => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};

/** The palette index whose colour is nearest to [r, g, b] (index 0, transparent, excluded). */
export function nearestIndex (rgb, palette = ARCADE_PALETTE) {
    let best = 1;
    let bestD = Infinity;
    for (let i = 1; i < palette.length; i++) {
        const p = hexToRgb(palette[i]);
        if (!p) continue;
        const d = ((p[0] - rgb[0]) ** 2) + ((p[1] - rgb[1]) ** 2) + ((p[2] - rgb[2]) ** 2);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    return best;
}

/** A blank image. */
export function blankImage (width, height) {
    return {width, height, pixels: new Uint8Array(width * height)};
}

/**
 * Read one of our rect-SVG costumes back into palette pixels, or null when the
 * SVG is not in that form (anything else: the caller rasterizes and quantizes).
 *
 * @param {string} svg
 * @param {Array<string|null>} [palette]
 * @returns {{width: number, height: number, pixels: Uint8Array, scale: number}|null}
 */
export function svgToPixels (svg, palette = ARCADE_PALETTE) {
    const text = String(svg || '');
    const root = /<svg\b([^>]*)>/i.exec(text);
    if (!root) return null;
    const attr = (s, name) => {
        const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(s);
        return m ? m[1] : null;
    };
    const rects = [...text.matchAll(/<rect\b([^>]*)\/?>/gi)].map(m => m[1]);
    // Our form has nothing but rects inside the root (and possibly nothing, for
    // an all-transparent image). Anything else — paths, groups with transforms,
    // images — is someone else's drawing.
    const body = text.slice(root.index + root[0].length).replace(/<\/svg>\s*$/i, '');
    if (body.replace(/<rect\b[^>]*\/?>(<\/rect>)?/gi, '').trim() !== '') return null;
    const w = Number(attr(root[1], 'width'));
    const h = Number(attr(root[1], 'height'));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const nums = rects.map(r => ['x', 'y', 'width', 'height'].map(k => Number(attr(r, k))));
    if (nums.some(n => n.some(v => !Number.isInteger(v) || v < 0))) return null;
    // The scale is the largest integer dividing every coordinate and size, and
    // the canvas; our emitter uses 4, but a costume saved at another scale reads too.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let scale = [w, h, ...nums.flat()].filter(v => v > 0).reduce(gcd);
    if (!scale) scale = 1;
    const width = w / scale;
    const height = h / scale;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width > 512 || height > 512) return null;
    const lookup = new Map(palette.map((c, i) => [c && c.toLowerCase(), i]).filter(([c]) => c));
    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < rects.length; i++) {
        const fill = (attr(rects[i], 'fill') || '').toLowerCase();
        const index = lookup.get(fill);
        if (index === undefined) return null;          // a colour not in the palette: not ours
        const [x, y, rw, rh] = nums[i].map(v => v / scale);
        for (let yy = y; yy < y + rh; yy++) {
            for (let xx = x; xx < x + rw; xx++) {
                if (xx < width && yy < height) pixels[(yy * width) + xx] = index;
            }
        }
    }
    return {width, height, pixels, scale};
}

/**
 * Any raster as palette pixels at width × height — box-sampled from the source
 * RGBA, nearest palette colour, alpha under half transparent.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels, 4 bytes each
 * @param {number} srcW source width
 * @param {number} srcH source height
 * @param {number} width target width
 * @param {number} height target height
 * @param {Array<string|null>} [palette]
 * @returns {{width: number, height: number, pixels: Uint8Array}}
 */
export function quantizeRgba (rgba, srcW, srcH, width, height, palette = ARCADE_PALETTE) {
    const out = blankImage(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const x0 = Math.floor((x * srcW) / width);
            const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / width));
            const y0 = Math.floor((y * srcH) / height);
            const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / height));
            let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
            for (let yy = y0; yy < y1; yy++) {
                for (let xx = x0; xx < x1; xx++) {
                    const k = ((yy * srcW) + xx) * 4;
                    const alpha = rgba[k + 3];
                    // Colour is averaged over the opaque part only, so a sprite's
                    // edge does not darken toward the transparent background.
                    r += rgba[k] * alpha; g += rgba[k + 1] * alpha; b += rgba[k + 2] * alpha;
                    a += alpha;
                    n++;
                }
            }
            if (!n || a / n < 128) continue;              // mostly transparent: index 0
            out.pixels[(y * width) + x] = nearestIndex([r / a, g / a, b / a], palette);
        }
    }
    return out;
}

/** Pixels as one of our rect-SVG costumes. */
export function pixelsToSvg (image, opts = {}) {
    return imageToSvg(image, opts);
}

/** MakeCode's `img` literal for these pixels (hex digits, '.' for transparent). */
export function toImgLiteral (image, indent = '    ') {
    const rows = [];
    for (let y = 0; y < image.height; y++) {
        const cells = [];
        for (let x = 0; x < image.width; x++) {
            const i = image.pixels[(y * image.width) + x];
            cells.push(i === 0 ? '.' : i.toString(16));
        }
        rows.push(`${indent}${cells.join(' ')}`);
    }
    return `img\`\n${rows.join('\n')}\n\``;
}

/** Flood fill from (x, y) with palette index `to` (4-connected). Returns a new image. */
export function floodFill (image, x, y, to) {
    const {width, height} = image;
    const pixels = new Uint8Array(image.pixels);
    const from = pixels[(y * width) + x];
    if (from === to) return {width, height, pixels};
    const stack = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
        const k = (cy * width) + cx;
        if (pixels[k] !== from) continue;
        pixels[k] = to;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return {width, height, pixels};
}

/** The image resized to width × height, anchored top-left (crop or pad with transparent). */
export function resizeCanvas (image, width, height) {
    const out = blankImage(width, height);
    for (let y = 0; y < Math.min(height, image.height); y++) {
        for (let x = 0; x < Math.min(width, image.width); x++) {
            out.pixels[(y * width) + x] = image.pixels[(y * image.width) + x];
        }
    }
    return out;
}

/**
 * MakeCode Arcade artwork → costumes we can actually put on a sprite.
 *
 * An Arcade game is mostly pictures. They arrive two ways and this
 * module reads both:
 *
 *   `img\`. . 5 5 .\n. 5 5 5 5\`` — an inline literal in main.ts, one
 *       character per pixel, the character set fixed by the target's
 *       `img` shim (see IMAGE_CHARS).
 *   *.g.jres — the asset gallery, base64 of MakeCode's own image buffer:
 *       `87 04 <w:u16> <h:u16> 00 00`, then the pixels COLUMN by column,
 *       4 bits each, low nibble first, each column padded to a byte.
 *       Column-major, which is the detail that decides whether you get a
 *       sprite or a diagonal smear.
 *
 * Output is SVG rather than a bitmap, because that is what the Code
 * tab's costume path already takes (`addCustomSVGCostume` /
 * `applyCustomSVG`, the same route the SVG-upload table uses). Pixels
 * become rects, runs of one colour merge into one rect, and colour 0 is
 * left out — so transparency is transparency and a 16x16 sprite is a
 * few dozen rects rather than 256.
 *
 * @module
 */

/**
 * The default Arcade palette, from pxt-arcade's own documentation.
 * Index 0 is transparent; index 15 is black, as is the (unused) 0 entry.
 */
export const ARCADE_PALETTE = [
    null,        // 0 — transparent
    '#ffffff', '#ff2121', '#ff93c4', '#ff8135',
    '#fff609', '#249ca3', '#78dc52', '#003fad',
    '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c',
    '#e5cdc4', '#91463d', '#000000'
];

/**
 * Which characters mean which palette index, from the `img` shim's
 * `groups` annotation in pxt-arcade: ["0.", "1#", "2T", ... "fFW"].
 * Both the hex digit and the mnemonic letters are legal in one literal.
 */
const IMAGE_CHARS = ['0.', '1#', '2T', '3t', '4N', '5n', '6G', '7g', '8', '9', 'aAR', 'bBP', 'cCp', 'dDO', 'eEY', 'fFW'];

const CHAR_TO_INDEX = (() => {
    const map = new Map();
    IMAGE_CHARS.forEach((chars, index) => {
        for (const c of chars) map.set(c, index);
    });
    return map;
})();

/**
 * Parse an `img` template literal's text.
 *
 * @param {string} text the characters between the backticks
 * @returns {{width: number, height: number, pixels: Uint8Array}|null}
 *   null when the rows are ragged or empty — an image we would have to
 *   guess at is not an image we should invent.
 */
export function parseImageLiteral (text) {
    // Spaces separate the pixel characters and carry nothing; every
    // other character in the literal is a palette index.
    const rows = String(text || '').split('\n')
        .map(row => [...row].filter(c => CHAR_TO_INDEX.has(c)))
        .filter(row => row.length);
    if (!rows.length) return null;
    const width = rows[0].length;
    if (rows.some(row => row.length !== width)) return null;
    const height = rows.length;
    const pixels = new Uint8Array(width * height);
    rows.forEach((row, y) => row.forEach((c, x) => {
        pixels[(y * width) + x] = CHAR_TO_INDEX.get(c);
    }));
    return {width, height, pixels};
}

const decodeBase64 = text => {
    if (typeof atob === 'function') {
        const binary = atob(text);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }
    return new Uint8Array(Buffer.from(text, 'base64'));   // Node, for the tests
};

/**
 * Decode one `image/x-mkcd-f4` buffer.
 *
 * @param {string} base64
 * @returns {{width: number, height: number, pixels: Uint8Array}|null}
 */
export function decodeMkcdImage (base64) {
    const bytes = decodeBase64(base64);
    if (bytes.length < 8 || bytes[0] !== 0x87 || bytes[1] !== 0x04) return null;
    const width = bytes[2] | (bytes[3] << 8);
    const height = bytes[4] | (bytes[5] << 8);
    const stride = Math.ceil(height / 2);
    if (!width || !height || bytes.length < 8 + (width * stride)) return null;
    const pixels = new Uint8Array(width * height);
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const byte = bytes[8 + (x * stride) + (y >> 1)];
            pixels[(y * width) + x] = (y % 2 === 0) ? (byte & 0x0F) : (byte >> 4);
        }
    }
    return {width, height, pixels};
}

/**
 * Read a project's `*.g.jres` gallery.
 *
 * @param {string} text the file contents
 * @returns {Object<string, {width: number, height: number, pixels: Uint8Array}>}
 *   keyed by the display name when there is one, else the jres id
 */
export function parseJres (text) {
    let jres;
    try {
        jres = JSON.parse(text);
    } catch (e) {
        return {};
    }
    const out = {};
    for (const [id, entry] of Object.entries(jres)) {
        if (!entry || typeof entry !== 'object' || typeof entry.data !== 'string') continue;
        if (entry.mimeType && !/x-mkcd-f4/.test(entry.mimeType)) continue;
        const image = decodeMkcdImage(entry.data);
        if (image) out[entry.displayName || id] = image;
    }
    return out;
}

/**
 * Render a decoded image as SVG.
 *
 * Runs of one colour along a row become a single rect: a 160x120
 * background is 19 200 pixels and perhaps a few hundred rects, which is
 * the difference between a costume the paint editor can open and one it
 * cannot.
 *
 * @param {{width: number, height: number, pixels: Uint8Array}} image
 * @param {object} [opts]
 * @param {number} [opts.scale] SVG units per pixel (default 4, so a
 *   16x16 sprite lands at a Scratch-ish 64x64)
 * @param {Array<string|null>} [opts.palette]
 * @returns {string}
 */
export function imageToSvg (image, opts = {}) {
    const scale = opts.scale || 4;
    const palette = opts.palette || ARCADE_PALETTE;
    const {width, height, pixels} = image;
    const rects = [];
    for (let y = 0; y < height; y++) {
        let x = 0;
        while (x < width) {
            const colour = pixels[(y * width) + x];
            let run = 1;
            while (x + run < width && pixels[(y * width) + x + run] === colour) run++;
            const fill = palette[colour];
            if (fill) {
                rects.push(`<rect x="${x * scale}" y="${y * scale}" width="${run * scale}" ` +
                    `height="${scale}" fill="${fill}"/>`);
            }
            x += run;
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" ` +
        `viewBox="0 0 ${width * scale} ${height * scale}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

/** A 1x1 transparent stand-in, for a sprite whose art we could not read. */
export const EMPTY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"></svg>';

/**
 * Named tile resources, using the pinned PXT image resource protocol.
 * Format reference (MIT, Microsoft):
 * https://github.com/microsoft/pxt/blob/v13.2.1/pxtlib/tilemap.ts
 * This module serializes Brickwright's own edited pixels; no binary is copied.
 */
import {decodeMkcdImage} from './arcade-assets.js';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
    'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
    'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with']);
export const validTileId = id => typeof id === 'string' && id.split('.').length > 1 &&
    id.split('.').every(part => IDENTIFIER.test(part) && !RESERVED.has(part));

/** Read tile resources separately from image aliases; ambiguous aliases refuse resolution. */
export function parseTileAssetEntries (text) {
    let jres;
    try { jres = JSON.parse(text); } catch (error) { return []; }
    if (!jres || typeof jres !== 'object') return [];
    const entries = [];
    for (const [key, entry] of Object.entries(jres)) {
        if (!entry || typeof entry !== 'object' || !entry.tilemapTile || typeof entry.data !== 'string') continue;
        const image = decodeMkcdImage(entry.data);
        if (!image) continue;
        const namespace = entry.namespace || jres['*']?.namespace || 'myTiles';
        if (typeof namespace !== 'string') continue;
        const tileId = entry.id || (key.includes('.') ? key : `${namespace.replace(/\.$/, '')}.${key}`);
        if (!validTileId(tileId)) continue;
        const tile = {...image, tileId, displayName: typeof entry.displayName === 'string' && entry.displayName ? entry.displayName : tileId.split('.').pop()};
        entries.push({key,tile,aliases:[...new Set([tileId,key,tileId.split('.').pop(),tile.displayName])],factoryDisplayName:entry.displayName});
    }
    return entries;
}


export function parseTileAssets (text) {
    const out = Object.create(null);
    for (const {tile,aliases} of parseTileAssetEntries(text)) for (const key of aliases) {
        if (Object.prototype.hasOwnProperty.call(out,key) && out[key]?.tileId !== tile.tileId) out[key] = null;
        else if (!Object.prototype.hasOwnProperty.call(out,key)) out[key] = tile;
    }
    return out;
}

/** Column-major 4bpp data, including 32-bit padding for every image column. */
export function encodeTileImage (image) {
    const {width, height, pixels} = image;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535 ||
        !pixels || pixels.length !== width * height || Array.from(pixels).some(pixel => !Number.isInteger(pixel) || pixel < 0 || pixel > 15)) {
        throw new Error('Invalid tile image');
    }
    const stride = Math.ceil(height / 8) * 4;
    const bytes = new Uint8Array(8 + width * stride);
    bytes.set([0x87, 4, width & 255, width >> 8, height & 255, height >> 8]);
    for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
        bytes[8 + x * stride + (y >> 1)] |= pixels[y * width + x] << (y % 2 ? 4 : 0);
    }
    if (typeof btoa === 'function') return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    return Buffer.from(bytes).toString('base64');
}

/** Collect resources across all maps without conflating distinct names or edited pixels. */
export class TileAssetExporter {
    constructor (warnings = []) { this.entries = new Map(); this.warnings = warnings; this.reservedIds = new Set(); }

    reserve (images) {
        for (const image of images) if (validTileId(image?.tileId)) this.reservedIds.add(image.tileId);
    }

    register (image, index) {
        const data = encodeTileImage(image);
        const named = validTileId(image.tileId);
        const originalId = named ? image.tileId : `myTiles.tile${index}`;
        const displayName = typeof image.displayName === 'string' && image.displayName.trim() ? image.displayName.trim() : originalId.split('.').pop();
        let id = originalId;
        let suffix = 2;
        const reserved = candidate => this.reservedIds.has(candidate) && (!named || candidate !== originalId);
        while (this.entries.has(id) || reserved(id)) {
            const previous = this.entries.get(id);
            if (!reserved(id) && previous?.data === data && previous.displayName === displayName) return id;
            id = `${originalId}_${suffix++}`;
        }
        if (id !== originalId && image.tileId) this.warnings.push(`Tile ${originalId} has conflicting edits or names; exported separately as ${id}`);
        this.entries.set(id, {data, displayName, tilemapTile: true, mimeType: 'image/x-mkcd-f4', dataEncoding: 'base64'});
        return id;
    }

    inlineSource () {
        const namespaces = new Map();
        for (const [id, entry] of this.entries) {
            const at = id.lastIndexOf('.'), namespace = id.slice(0, at), name = id.slice(at + 1);
            const image = decodeMkcdImage(entry.data);
            const rows = Array.from({length: image.height}, (_, y) => Array.from(image.pixels.slice(y * image.width, (y + 1) * image.width))
                .map(pixel => pixel ? pixel.toString(16) : '.').join(' '));
            if (!namespaces.has(namespace)) namespaces.set(namespace, []);
            namespaces.get(namespace).push(`    //% fixedInstance blockIdentity=images._tile\n    export const ${name} = img\`\n${rows.join('\n')}\n\`;`);
        }
        return [...namespaces].map(([namespace, declarations]) =>
            `namespace ${namespace} {\n${declarations.join('\n')}\n}\n`).join('\n');
    }

    files () {
        if (!this.entries.size) return {};
        const namespaces = new Map();
        for (const [id] of this.entries) {
            const at = id.lastIndexOf('.'), namespace = id.slice(0, at), name = id.slice(at + 1);
            if (!namespaces.has(namespace)) namespaces.set(namespace, []);
            namespaces.get(namespace).push(`    //% fixedInstance jres blockIdentity=images._tile\n    export const ${name} = image.ofBuffer(hex\`\`);`);
        }
        return {
            'tilemap.g.jres': `${JSON.stringify(Object.fromEntries(this.entries), null, 4)}\n`,
            'tilemap.g.ts': [...namespaces].map(([namespace, declarations]) =>
                `namespace ${namespace} {\n${declarations.join('\n')}\n}\n`).join('\n')
        };
    }
}

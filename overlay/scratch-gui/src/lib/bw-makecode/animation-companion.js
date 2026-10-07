/** Optional rich animation source beside native MakeCode assets.
 * Native images remain authoritative. This format restores source only after
 * exact validation; it makes no claim that an original editor keeps the file.
 */
import {validateDocument} from '../bw-artwork-bundle.js';
import {animationResourceFromDocument} from '../bw-animation-resources.js';
import {ARCADE_PALETTE, remapPalette} from './pixel-image.js';
import {encodeAnimationJres, decodeAnimationJres} from './animation-jres.js';

export const ANIMATION_COMPANION_PATH = 'brickwright-animation.json';
export const ANIMATION_COMPANION_FORMAT = 'brickwright-animation';
export const ANIMATION_COMPANION_VERSION = 1;
export const ANIMATION_COMPANION_LIMITS = Object.freeze({bytes: 16 * 1024 * 1024, resources: 128});
export class AnimationCompanionError extends Error {
    constructor (code, message) { super(message); this.name = 'AnimationCompanionError'; this.code = code; }
}
const fail = (code, message) => { throw new AnimationCompanionError(code, message); };
const copy = value => JSON.parse(JSON.stringify(value));
const bytes = value => new TextEncoder().encode(value).length;
const bounded = text => {
    if (text.length > ANIMATION_COMPANION_LIMITS.bytes || bytes(text) > ANIMATION_COMPANION_LIMITS.bytes) {
        fail('RESOURCE_LIMIT', 'Animation companion exceeds byte limit');
    }
};
const paletteOf = (palette = ARCADE_PALETTE) => {
    if (!Array.isArray(palette) || palette.length !== 16 ||
        !(palette[0] === null || /^#[0-9a-f]{6}$/i.test(palette[0])) ||
        !palette.slice(1).every(colour => typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour))) {
        fail('PALETTE', 'Animation companion requires a valid project palette');
    }
    return [null, ...palette.slice(1).map(colour => colour.toLowerCase())];
};
const list = (value, label) => {
    if (!Array.isArray(value)) fail('SCHEMA', `${label} must be an array`);
    if (value.length > ANIMATION_COMPANION_LIMITS.resources) fail('RESOURCE_LIMIT', `${label} exceeds resource count limit`);
};
const projectionOf = animation => ({width: animation.width, height: animation.height,
    intervalMs: animation.intervalMs, frames: animation.frames.map(frame => Array.from(frame.pixels))});
const projectedSource = (document, palette) => {
    let normalized;
    try {
        validateDocument(document);
        if (document.version !== 4) fail('DOCUMENT', 'Animation companion source requires resource document version4');
        normalized = animationResourceFromDocument(document);
    } catch (error) {
        if (error instanceof AnimationCompanionError) throw error;
        fail('DOCUMENT', `Invalid animation companion source: ${error.message}`);
    }
    const samePalette = normalized.palette.every((colour, i) =>
        String(colour).toLowerCase() === String(palette[i]).toLowerCase());
    return {resource: normalized, projection: {width: normalized.width, height: normalized.height,
        intervalMs: normalized.frames[0].durationMs, frames: normalized.frames.map(frame => {
            const image = {width: normalized.width, height: normalized.height, pixels: frame.pixels};
            return Array.from(samePalette ? image.pixels : remapPalette(image, normalized.palette, palette).pixels);
        })}};
};
const nativeOf = animation => {
    // Reuse native policy/index validation without coercing the caller's pixels.
    try {
        const entry = encodeAnimationJres({...animation, namespace: ''});
        return decodeAnimationJres(entry);
    } catch (error) { fail('NATIVE_ASSET', `Invalid native animation: ${error.message}`); }
};
const matching = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sameProjection = (left, right) => left && left.width === right.width && left.height === right.height &&
    left.intervalMs === right.intervalMs && Array.isArray(left.frames) && left.frames.length === right.frames.length &&
    left.frames.every((pixels, f) => Array.isArray(pixels) && pixels.length === right.frames[f].length &&
        pixels.every((pixel, i) => pixel === right.frames[f][i]));
const validRecords = (records, palette) => {
    list(records, 'Animation companion resources');
    const nativeIds = new Set(), uuids = new Set();
    for (const record of records) {
        if (!record || typeof record.nativeId !== 'string' || !record.nativeId.trim() ||
            record.nativeId.length > 160 || /[\u0000-\u001f\u007f]/.test(record.nativeId)) fail('IDENTITY', 'Invalid companion native asset ID');
        if (nativeIds.has(record.nativeId)) fail('DUPLICATE_NATIVE_ID', `Duplicate companion native asset ID: ${record.nativeId}`);
        nativeIds.add(record.nativeId);
        const source = projectedSource(record.document, palette);
        const uuid = source.resource.id.toLowerCase();
        if (uuids.has(uuid)) fail('DUPLICATE_UUID', `Duplicate companion resource UUID: ${source.resource.id}`);
        uuids.add(uuid);
        if (!sameProjection(record.nativeProjection, source.projection)) fail('PROJECTION', `Companion source projection differs: ${record.nativeId}`);
    }
};

/** All entries must describe the actual emitted native asset, after palette remapping. */
export function encodeAnimationCompanion (entries, projectPalette) {
    list(entries, 'Animation companion entries');
    const palette = paletteOf(projectPalette), resources = [];
    let total = 0;
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') fail('SCHEMA', 'Invalid companion entry');
        let document;
        try {
            const documentText = JSON.stringify(entry.document);
            if (typeof documentText !== 'string') fail('DOCUMENT', 'Animation source must be serializable JSON');
            bounded(documentText);
            document = JSON.parse(documentText);
        } catch (error) {
            if (error instanceof AnimationCompanionError) throw error;
            fail('DOCUMENT', 'Animation source must be serializable JSON');
        }
        const source = projectedSource(document, palette);
        let native;
        try { native = decodeAnimationJres(entry.nativeEntry); }
        catch (error) { fail('NATIVE_ASSET', `Invalid emitted animation: ${error.message}`); }
        if (entry.nativeId !== native.id) fail('IDENTITY', 'Companion nativeId must equal the canonical emitted native asset ID');
        const nativeProjection = projectionOf(native);
        if (!sameProjection(nativeProjection, source.projection)) fail('PROJECTION', `Emitted native asset differs from rich source: ${entry.nativeId}`);
        const record = {nativeId: entry.nativeId, document, nativeProjection};
        total += bytes(JSON.stringify(record));
        if (total > ANIMATION_COMPANION_LIMITS.bytes) fail('RESOURCE_LIMIT', 'Animation companion exceeds byte limit');
        resources.push(record);
    }
    validRecords(resources, palette);
    const text = JSON.stringify({format: ANIMATION_COMPANION_FORMAT, version: ANIMATION_COMPANION_VERSION, palette, resources});
    bounded(text);
    return text;
}

/** Native resources survive absent/stale rich metadata; invalid metadata fails atomically. */
export function recoverAnimationCompanion (companionText, nativeAnimations, projectPalette) {
    const palette = paletteOf(projectPalette);
    // Companion record limits must not impose a new native-gallery count limit.
    if (!Array.isArray(nativeAnimations)) fail('SCHEMA', 'Native animation resources must be an array');
    const native = new Map();
    for (const animation of nativeAnimations) {
        const normalized = nativeOf(animation);
        if (native.has(normalized.id)) fail('DUPLICATE_NATIVE_ID', `Duplicate native asset ID: ${normalized.id}`);
        native.set(normalized.id, normalized);
    }
    let payload = null;
    if (companionText !== undefined && companionText !== null) {
        if (typeof companionText !== 'string') fail('SCHEMA', 'Animation companion must be JSON text');
        bounded(companionText);
        try { payload = JSON.parse(companionText); }
        catch { fail('JSON', 'Animation companion JSON is malformed'); }
        if (!payload || payload.format !== ANIMATION_COMPANION_FORMAT) fail('SCHEMA', 'Unknown animation companion format');
        if (payload.version !== ANIMATION_COMPANION_VERSION) fail('VERSION', 'Unsupported animation companion version');
        payload.palette = paletteOf(payload.palette);
        validRecords(payload.resources, payload.palette);
    }
    const records = new Map((payload?.resources || []).map(record => [record.nativeId, record]));
    const warnings = [], resources = [];
    for (const [nativeId, animation] of native) {
        const record = records.get(nativeId);
        let reason = !payload ? 'missing-companion' : !record ? 'no-record' :
            !matching(payload.palette, palette) ? 'project-palette-changed' :
                !sameProjection(record.nativeProjection, projectionOf(animation)) ? 'stale-projection' : null;
        if (!reason && (animation.frames.length < 2 || animation.intervalMs < 20 || animation.intervalMs > 10000)) {
            reason = 'outside-editor-bounds';
        }
        if (reason) {
            resources.push({nativeId, document: null, reason});
            if (record) warnings.push(`Animation ${JSON.stringify(nativeId)} rich source not restored: ${reason}`);
        } else {
            const document = copy(record.document);
            document.animation.resource.name = animation.name;
            resources.push({nativeId, document});
        }
    }
    for (const nativeId of records.keys()) if (!native.has(nativeId)) warnings.push(`Animation ${JSON.stringify(nativeId)} companion has no native asset`);
    return {resources, warnings};
}

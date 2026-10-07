/**
 * Native MakeCode animation JRES interchange (frames and uniform timing only).
 * Format evidence: Microsoft PXT 13.2.1, sprite.encodeAnimationString,
 * TilemapProject.generateAnimation and emitProjectImages in the pinned worker.
 * PXT is MIT licensed; this independent codec follows that documented-in-source
 * format: base64 ASCII hex of four LE u16 values (interval,width,height,count),
 * then row-major Bitmap nibbles, low nibble first, each frame byte padded.
 * This differs from the column-major image/x-mkcd-f4 image resource format.
 * Names/IDs are native asset references, not Brickwright editable-source UUIDs.
 */
export const ANIMATION_JRES_MIME = 'application/mkcd-animation';
export const ANIMATION_JRES_LIMITS = Object.freeze({dimension: 160, frames: 64, packedBytes: 1024 * 1024, identityCharacters: 160});
export class AnimationJresError extends Error {
    constructor (code, message) { super(message); this.name = 'AnimationJresError'; this.code = code; }
}
const fail = (code, message) => { throw new AnimationJresError(code, message); };
const integer = (value, max, code, label) => {
    if (!Number.isInteger(value) || value < 1 || value > max) fail(code, `Animation ${label} must be an integer in 1..${max}`);
};
const layout = (width, height, count, interval) => {
    integer(width, ANIMATION_JRES_LIMITS.dimension, 'DIMENSIONS', 'width');
    integer(height, ANIMATION_JRES_LIMITS.dimension, 'DIMENSIONS', 'height');
    integer(count, ANIMATION_JRES_LIMITS.frames, 'FRAME_COUNT', 'frame count');
    integer(interval, 65535, 'INTERVAL', 'intervalMs');
    const stride = Math.ceil(width * height / 2), size = 8 + stride * count;
    if (size > ANIMATION_JRES_LIMITS.packedBytes) fail('RESOURCE_LIMIT', 'Animation exceeds packed resource byte limit');
    return {stride, size};
};
const identity = (entry, key, fallbackNamespace) => {
    const printable = value => typeof value === 'string' && value.trim().length > 0 &&
        value.length <= ANIMATION_JRES_LIMITS.identityCharacters && !/[\u0000-\u001f\u007f]/.test(value);
    const namespace = entry.namespace ?? fallbackNamespace ?? 'myAnimations';
    if (namespace !== '' && !printable(namespace)) fail('IDENTITY', 'Animation namespace must be empty or bounded nonblank printable text');
    const ns = namespace.replace(/\.$/, '');
    if (namespace !== '' && !printable(ns)) fail('IDENTITY', 'Animation namespace is empty');
    const raw = entry.id ?? key;
    if (!printable(raw)) fail('IDENTITY', 'Animation asset ID must be bounded nonblank printable text');
    // Consume explicit IDs as PXT does after Package.parseJRes: an already
    // qualified ID stays qualified; a short ID receives the namespace once.
    // For app-normalized raw gallery entries, `key` is a fallback ID, not an
    // instruction to reproduce Package.parseJRes's double-prefix edge case.
    const short = ns && raw.startsWith(`${ns}.`) ? raw.slice(ns.length + 1) : raw;
    const qualified = ns ? `${ns}.${short}` : short;
    if (!printable(short) || qualified.length > ANIMATION_JRES_LIMITS.identityCharacters) {
        fail('IDENTITY', 'Animation qualified asset ID exceeds identity bounds');
    }
    const name = entry.displayName ?? short;
    // Microsoft PXT validateAssetName character rules: asset references place
    // this name directly inside a tagged template without escaping punctuation.
    // A richer Brickwright display name needs an explicit mapping outside here.
    if (typeof name !== 'string' || !name.trim() || name.length > 80 ||
        /[\u0000-\u001f\u0021-\u002c\u002e\u002f\u003a-\u0040\u005b-\u005e\u0060\u007b-\u007f]/.test(name)) {
        fail('NAME', 'Animation display name must contain 1..80 characters admissible in native MakeCode asset names');
    }
    return {id: qualified, short, namespace: ns, name};
};
const base64Encode = text => {
    if (typeof btoa === 'function') return btoa(text);
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'ascii').toString('base64');
    fail('ENCODING', 'Base64 encoder is unavailable');
};
const base64Decode = text => {
    if (typeof text !== 'string') fail('ENCODING', 'Animation data must be canonical base64 ASCII hex');
    // Bound before scanning, decoding or allocating attacker-controlled data.
    if (text.length > Math.ceil(ANIMATION_JRES_LIMITS.packedBytes * 2 / 3) * 4) {
        fail('RESOURCE_LIMIT', 'Animation encoded resource exceeds byte limit');
    }
    if (!text.length || text.length % 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
        fail('ENCODING', 'Animation data must be canonical base64 ASCII hex');
    }
    const decoded = typeof atob === 'function' ? atob(text) :
        typeof Buffer !== 'undefined' ? Buffer.from(text, 'base64').toString('latin1') :
            fail('ENCODING', 'Base64 decoder is unavailable');
    if (base64Encode(decoded) !== text || decoded.length % 2 || !/^[\da-f]+$/i.test(decoded)) {
        fail('ENCODING', 'Animation payload must be exact ASCII hexadecimal bytes');
    }
    return decoded;
};

/** Encode row-major palette indices (0..15). No layers or private metadata. */
export function encodeAnimationJres (animation) {
    if (!animation || typeof animation !== 'object') fail('RESOURCE', 'Animation resource is missing');
    const {width, height, intervalMs, frames} = animation;
    if (!Array.isArray(frames)) fail('FRAME_COUNT', 'Animation frames must be an array');
    const {stride, size} = layout(width, height, frames.length, intervalMs);
    const native = identity({id: animation.id, namespace: animation.namespace, displayName: animation.name});
    // Validate everything before packing; Uint8 coercion must not hide bad input.
    for (const frame of frames) {
        if (!frame || (!Array.isArray(frame.pixels) && !ArrayBuffer.isView(frame.pixels)) ||
            frame.pixels.length !== width * height) fail('FRAME_PIXELS', 'Animation frame pixel count differs from dimensions');
        if (frame.durationMs !== undefined && frame.durationMs !== intervalMs) fail('UNEQUAL_TIMING', 'Animation frame durations must equal intervalMs');
        for (const index of frame.pixels) if (!Number.isInteger(index) || index < 0 || index > 15) {
            fail('PALETTE_INDEX', 'Animation pixels must be palette indices 0..15');
        }
    }
    const bytes = new Uint8Array(size);
    [intervalMs, width, height, frames.length].forEach((value, i) => { bytes[i * 2] = value & 255; bytes[i * 2 + 1] = value >>> 8; });
    frames.forEach((frame, f) => {
        for (let i = 0; i < frame.pixels.length; i++) bytes[8 + f * stride + (i >> 1)] |= frame.pixels[i] << ((i & 1) * 4);
    });
    return {id: native.short, namespace: native.namespace, mimeType: ANIMATION_JRES_MIME,
        data: base64Encode(Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')), displayName: native.name};
}

/**
 * Decode a native entry with explicit/Package-normalized id and namespace.
 * An explicit empty namespace keeps IDs unqualified, as original PXT does;
 * an omitted namespace retains the app convenience default myAnimations.
 * Callers may instead supply app-normalized raw-gallery key/default namespace;
 * a qualified fallback key is treated as canonical (never double-prefixed).
 * This function does not perform Package.parseJRes or choose generated factory
 * aliases: retain the original gallery key when generating images.g.ts.
 */
export function decodeAnimationJres (entry, {key, namespace} = {}) {
    if (!entry || typeof entry !== 'object' || entry.mimeType !== ANIMATION_JRES_MIME) fail('MIME', 'Expected native animation JRES MIME');
    if (entry.dataEncoding !== undefined && entry.dataEncoding !== 'base64') fail('ENCODING', 'Only packed native animation encoding is supported');
    const native = identity(entry, key, namespace);
    const hex = base64Decode(entry.data);
    if (hex.length < 16) fail('LENGTH', 'Animation header is truncated');
    const read = offset => parseInt(hex.slice(offset * 2, offset * 2 + 2), 16);
    const u16 = offset => read(offset) | (read(offset + 1) << 8);
    const intervalMs = u16(0), width = u16(2), height = u16(4), count = u16(6);
    const {stride, size} = layout(width, height, count, intervalMs);
    if (hex.length !== size * 2) fail('LENGTH', 'Animation payload length differs from header');
    const frames = [];
    for (let f = 0; f < count; f++) {
        const pixels = new Uint8Array(width * height);
        for (let i = 0; i < pixels.length; i++) pixels[i] = (read(8 + f * stride + (i >> 1)) >>> ((i & 1) * 4)) & 15;
        if ((pixels.length & 1) && (read(8 + (f + 1) * stride - 1) & 240)) fail('PADDING', 'Animation frame has nonzero unused pixel nibble');
        frames.push({pixels});
    }
    return {id: native.id, name: native.name, width, height, intervalMs, frames};
}

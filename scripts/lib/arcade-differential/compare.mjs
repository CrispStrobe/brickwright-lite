// Pure comparison of two recordings (original PXT vs Brickwright). No I/O.
//
// A recording is {status, samples:[{k,t,frame,sprites,score,life,globals}], frames:[{pix,palette}]}
// where `frame` indexes `frames` (pixels are stored once per distinct frame).
import {createHash} from 'node:crypto';

export const DEFAULTS = Object.freeze({positionTolerance: 0.01, numberTolerance: 1e-6});

const rgbCache = new WeakMap();
/** RGB bytes for a stored frame, resolved through its own palette (palette index order is irrelevant). */
export function frameRgb(frame) {
    if (!frame) return null;
    let rgb = rgbCache.get(frame);
    if (rgb) return rgb;
    const colors = frame.palette.map(h => parseInt(h, 16) || 0);
    rgb = new Uint32Array(frame.pix.length);
    for (let i = 0; i < frame.pix.length; i++) rgb[i] = colors[parseInt(frame.pix[i], 16)] ?? 0;
    rgbCache.set(frame, rgb);
    return rgb;
}

export function frameHash(frame) {
    const rgb = frameRgb(frame);
    return rgb ? createHash('sha1').update(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength)).digest('hex').slice(0, 16) : null;
}

/** Pack per-sample pixel strings into a table of distinct frames. */
export function packSamples(samples) {
    const frames = [], index = new Map();
    const packed = samples.map(({pix, palette, ...rest}) => {
        if (pix === undefined) return {...rest, frame: null};
        const key = pix + '|' + palette.join(',');
        if (!index.has(key)) { index.set(key, frames.length); frames.push({pix, palette}); }
        return {...rest, frame: index.get(key)};
    });
    return {samples: packed, frames};
}

const near = (a, b, tol) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol);

/** Pixel difference of two stored frames: {count, bbox} or null when equal. */
export function pixelDiff(a, b) {
    const ra = frameRgb(a), rb = frameRgb(b);
    if (!ra || !rb) return ra === rb ? null : {count: -1, bbox: null, missing: !ra ? 'original' : 'brickwright'};
    let count = 0, x0 = 160, y0 = 120, x1 = -1, y1 = -1;
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) {
        count++; const x = i % 160, y = (i / 160) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return count ? {count, bbox: {x0, y0, x1, y1}} : null;
}

/** Anonymous region class of a pixel difference. */
export function regionOf(diff) {
    if (!diff?.bbox) return 'no-frame';
    const {x0, y0, x1, y1} = diff.bbox;
    if (diff.count > 160 * 120 / 2) return 'most-of-frame';
    if (y1 < 14) return 'top-band';
    if (y0 >= 106) return 'bottom-band';
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 24 * 24) return 'small-region';
    return 'large-region';
}

/** Anonymous cause label of one difference; position drift and count direction are bucketed. */
export function causeName(diff) {
    switch (diff.type) {
    case 'pixels': return 'pixels:' + diff.region;
    case 'sprite-count': return 'sprite-count:' + (diff.brickwright > diff.original ? 'brickwright-has-more' : 'original-has-more');
    case 'sprite-position': {
        const d = Math.abs(diff.original - diff.brickwright);
        return 'sprite-position:' + (d < 1 ? 'subpixel' : d < 8 ? 'few-pixels' : 'large');
    }
    default: return diff.type;
    }
}

/** Differences between two samples. Order is the priority used for the primary cause. */
export function sampleDiffs(a, b, framesA, framesB, opt = DEFAULTS) {
    const diffs = [];
    const sa = a.sprites || [], sb = b.sprites || [];
    if (sa.length !== sb.length) diffs.push({type: 'sprite-count', original: sa.length, brickwright: sb.length});
    for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
        const p = sa[i], q = sb[i];
        for (const field of ['kind', 'z', 'visible']) {
            const equal = field === 'kind' ? (p.kindName && q.kindName ? p.kindName === q.kindName : p.kind === q.kind) : p[field] === q[field];
            if (!equal) diffs.push({type: 'sprite-' + (field === 'kind' ? 'kind' : field === 'z' ? 'z' : 'visibility'), index: i, original: p[field], brickwright: q[field]});
        }
        for (const field of ['x', 'y']) if (!near(p[field], q[field], opt.positionTolerance)) diffs.push({type: 'sprite-position', index: i, field, original: p[field], brickwright: q[field]});
        // An unreadable image (null) is unknown, not different.
        if (p.image && q.image && p.image !== q.image) diffs.push({type: 'sprite-image', index: i, original: p.image, brickwright: q.image});
    }
    if (!near(a.score, b.score, opt.numberTolerance)) diffs.push({type: 'score', original: a.score, brickwright: b.score});
    if (a.life !== b.life) diffs.push({type: 'life', original: a.life, brickwright: b.life});
    for (const name of Object.keys(a.globals || {})) {
        if (!(name in (b.globals || {}))) continue; // unreadable on one side is not a difference
        if (!near(a.globals[name], b.globals[name], opt.numberTolerance)) diffs.push({type: 'global', name, original: a.globals[name], brickwright: b.globals[name]});
    }
    const fa = a.frame === null || a.frame === undefined ? null : framesA[a.frame], fb = b.frame === null || b.frame === undefined ? null : framesB[b.frame];
    const px = pixelDiff(fa, fb);
    if (px) diffs.push({type: 'pixels', region: b.textPrompt ? 'text-prompt' : regionOf(px), ...px});
    return diffs;
}

/** Key of the observable state of one sample on its own side (used to deduplicate runs). */
function stateKey(s, frames) {
    const r = v => typeof v === 'number' ? Math.round(v * 256) : v;
    return JSON.stringify([frameHash(s.frame === null || s.frame === undefined ? null : frames[s.frame]),
        (s.sprites || []).map(p => [p.kindName ?? p.kind, r(p.x), r(p.y), p.z, p.visible, p.image]), s.score, s.life, s.globals]);
}

/** Consecutive-duplicate-free list of {sample, firstK, firstT, lastK}. */
export function distinctStates(samples, frames) {
    const out = [];
    let last = null;
    for (const s of samples) {
        const key = stateKey(s, frames);
        if (key === last) { out.at(-1).lastK = s.k; continue; }
        last = key; out.push({sample: s, firstK: s.k, firstT: s.t, lastK: s.k});
    }
    return out;
}

const median = values => { if (!values.length) return 0; const v = values.slice().sort((a, b) => a - b); return v[v.length >> 1]; };

/** Compare one script run. Returns {class, ...detail}; both recordings must be status 'ok'. */
export function compareRecordings(orig, bw, opt = DEFAULTS) {
    const n = Math.min(orig.samples.length, bw.samples.length);
    const lengthNote = orig.samples.length !== bw.samples.length ? {originalSamples: orig.samples.length, brickwrightSamples: bw.samples.length} : undefined;
    // 1. Frame-aligned: sample k of each side is the same simulated instant.
    let first = null, differingSamples = 0;
    for (let k = 0; k < n; k++) {
        const diffs = sampleDiffs(orig.samples[k], bw.samples[k], orig.frames, bw.frames, opt);
        if (diffs.length) { differingSamples++; if (!first) first = {k, t: orig.samples[k].t, diffs}; }
    }
    // Random draws consumed so far at each sample: where the two streams first part company.
    let firstDrawMismatchK = null;
    for (let k = 0; k < n; k++) {
        const x = orig.samples[k].draws, y = bw.samples[k].draws;
        if (typeof x === 'number' && typeof y === 'number' && x !== y) { firstDrawMismatchK = k; break; }
    }
    const draws = firstDrawMismatchK === null ? undefined : {firstMismatchK: firstDrawMismatchK,
        original: orig.samples[firstDrawMismatchK].draws, brickwright: bw.samples[firstDrawMismatchK].draws};
    if (!first && !lengthNote) return {class: 'identical', samples: n};
    // 2. Sequence of distinct states, so a pure timing offset is its own class.
    const da = distinctStates(orig.samples.slice(0, n), orig.frames), db = distinctStates(bw.samples.slice(0, n), bw.frames);
    const m = Math.min(da.length, db.length);
    let sequenceMatch = da.length === db.length, firstSeqMismatch = null;
    for (let i = 0; i < m; i++) {
        if (sampleDiffs(da[i].sample, db[i].sample, orig.frames, bw.frames, opt).length) { sequenceMatch = false; firstSeqMismatch = i; break; }
    }
    if (!first) return {class: 'diverges', samples: n, primaryCause: 'run-length:' + (orig.samples.length < bw.samples.length ? 'original-ended-first' : 'brickwright-ended-first'),
        causes: ['run-length'], note: lengthNote};
    if (sequenceMatch) {
        const offsets = da.map((s, i) => db[i].firstT - s.firstT);
        return {class: 'same-states-different-timing', distinctStates: da.length, differingSamples, samples: n,
            medianOffsetMs: median(offsets), maxAbsOffsetMs: Math.max(...offsets.map(Math.abs)), firstDifference: first};
    }
    return {class: 'diverges', samples: n, differingSamples, firstDifference: first, ...(draws && {randomDraws: draws}),
        primaryCause: causeName(first.diffs[0]),
        causes: [...new Set(first.diffs.map(d => d.type))],
        sequence: {original: da.length, brickwright: db.length, firstMismatch: firstSeqMismatch,
            prefix: firstSeqMismatch === null ? (da.length < db.length ? 'original-shorter' : 'brickwright-shorter') : undefined}};
}

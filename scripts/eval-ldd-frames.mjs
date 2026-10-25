#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// How well does the geometry-derived LDD frame (model/ldd-frame.js) agree with an
// LDD↔LDraw mapping file (`ldraw.xml`, the file LDD shipped and LeoCAD / Studio / lxf2ldr
// maintain)? Prints a scorecard; docs/ROBOT-LAB-LDD-FRAMES.md has the method and the
// numbers measured with it.
//
// ldraw.xml carries no licence statement, so it is NOT in this repository and nothing
// derived from it per part is: point this script at a local copy. It is read as data
// (a tag scanner over <Transformation …/> and <Brick …/>); nothing in it is executed.
//
// WHAT A <Transformation> ROW MEANS (LeoCAD common/lc_lxf.cpp applies it the same way):
//   ldraw="P.dat" tx ty tz (LDD units, 1 = 25 LDU, y up) ax ay az angle (radians).
//   An LDraw-part-local point q (LDU, LDraw axes) is, in the LDD part's own frame,
//       d = Rn · (F·q/25 − t),   Rn = rotation by −angle about (ax, ay, az), F = diag(1, −1, −1).
//   So the LDD part's ORIGIN sits at q = 25·F·t in the LDraw part, and the LDD axes are the
//   columns of M = F·Rnᵀ (as LDraw directions). This script scores frames as that (o, M).
//
// SCORING: a predicted frame (o', M') agrees with the file's (o, M) when some proper
// symmetry g: p ↦ L·p + c of the LDraw part (canonical-frame.js symmetryGroup: the 24
// axis-aligned turns that map the part onto itself, plus n-fold turns about a round
// part's axis) takes one onto the other: L·M' = M (entries within 1e-3) and
// |L·o' + c − o| ≤ tolerance (default 0.5 LDU) — a symmetric part has several correct
// frames, and the file may list any of them.
//
// Each disagreement is classified:
//   no-rule        the rule declines the part (no stud grid, no Technic line)
//   rotation       the rule's axes are wrong (no symmetry reconciles them)
//   translation    the axes agree (mod symmetry) but the origin is off by more than the tolerance
// and parts the file maps but the library lacks (or that do not flatten) are counted
// apart as not-in-library / no-geometry.
//
// Usage:
//   node scripts/eval-ldd-frames.mjs --ldraw-xml <ldraw.xml> --ldraw <LDraw library dir>
//        [--split train|test|all] [--tolerance 0.5] [--limit N] [--parts a.dat,b.dat]
//        [--list] (one line per disagreement — local use only, never commit the output)
//        [--cache <file.jsonl>] (reuse/save the per-part geometry: it takes ~1 s per part)
// The split is a fixed hash of the LDraw file name (FNV-1a, even = train), so the rule's
// training parts and the held-out parts never mix.

import {readFileSync, existsSync, appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bounds, flattenPart, parseLDraw} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {analysePart, axisAngle, mul, mulVec} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/canonical-frame.js';
import {F, lddFrameOf} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-frame.js';
import {derivePart, libReader, resolveAlias} from './derive-part-meta.mjs';

// ---- the mapping file --------------------------------------------------------------------

const ATTR = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
const elements = (xml, name) => [...xml.replace(/<!--[\s\S]*?-->/g, '').matchAll(new RegExp(`<${name}\\b([^>]*?)/?>`, 'g'))]
    .map(m => Object.fromEntries([...m[1].matchAll(ATTR)].map(a => [a[1], a[2]])));

/**
 * The <Transformation> rows of an ldraw.xml, by lower-case LDraw file name. A file listed
 * twice keeps its FIRST row (LeoCAD's std::map insert keeps the first too).
 * @param {string} xml
 * @returns {Map<string, {tx: number, ty: number, tz: number, axis: number[], angle: number}>}
 */
export const parseLdrawXml = xml => {
    const out = new Map();
    for (const a of elements(xml, 'Transformation')) {
        if (!a.ldraw) continue;
        const key = a.ldraw.toLowerCase();
        const nums = ['tx', 'ty', 'tz', 'ax', 'ay', 'az', 'angle'].map(k => Number(a[k]));
        if (out.has(key) || nums.some(v => !Number.isFinite(v))) continue;
        out.set(key, {tx: nums[0], ty: nums[1], tz: nums[2], axis: nums.slice(3, 6), angle: nums[6]});
    }
    return out;
};

/** A row as the LDD frame inside the LDraw part: origin o (LDU) and axes M (columns). */
export const frameOfRow = row => {
    const o = mulVec(F, [row.tx * 25, row.ty * 25, row.tz * 25]);
    const M = mul(F, axisAngle(row.axis, row.angle));
    return {o, M};
};

// ---- the split -------------------------------------------------------------------------

export const fnv1a = s => {
    let h = 0x811c9dc5;
    for (const ch of s) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
};
export const splitOf = part => (fnv1a(part.toLowerCase()) % 2 === 0 ? 'train' : 'test');

// ---- geometry --------------------------------------------------------------------------

const IDENTITY_M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/**
 * The file whose geometry a part number stands for: through `~Moved to` (resolveAlias) and
 * through an `=` alias (an official file that only references another part, unmoved).
 */
export const resolvePart = (part, read) => {
    let p = resolveAlias(part, read);
    for (let hop = 0; hop < 8; hop++) {
        const text = read(`parts/${p.toLowerCase()}`);
        if (text === undefined) return p;
        const parsed = parseLDraw(text);
        if (!/^=/.test(parsed.header.description.trim()) || parsed.refs.length !== 1 || parsed.polys.length) return p;
        const {file, x} = parsed.refs[0];
        if (!x.m.every((v, i) => Math.abs(v - IDENTITY_M[i]) < 1e-9) || x.t.some(v => Math.abs(v) > 1e-9)) return p;
        p = resolveAlias(file.replace(/\\/g, '/'), read);
    }
    return p;
};

/**
 * What the evaluator needs of one LDraw part: its derived PartMeta (connectors), its
 * category and its proper symmetries.
 * @returns {{part, real, desc, category, bottom, connectors, symmetries: {m, t}[], axial: object[], anchor}|{part, error}}
 *          bottom: the mesh's lowest point (greatest LDraw y)
 */
export const geometryOf = (part, read) => {
    if (read(`parts/${part.toLowerCase()}`) === undefined) return {part, error: 'not-in-library'};
    const real = resolvePart(part, read);
    const d = derivePart(real, read);
    if (!d.meta) return {part, real, error: 'no-geometry', desc: d.desc};
    const flat = flattenPart(real, read);
    if (!flat.polys.length) return {part, real, error: 'no-geometry', desc: d.desc};
    const a = analysePart(d.meta, flat.polys);
    const cs = d.meta.connectors;
    const anchor = cs.length ? [0, 1, 2].map(k => cs.reduce((s, c) => s + c.position[k], 0) / cs.length) : a.stats.centroid;
    return {
        part, real, desc: d.desc, category: d.meta.category, bottom: bounds(flat.polys).max[1],
        connectors: cs.map(c => ({type: c.type, position: c.position, axis: c.axis, ...(c.length ? {length: c.length} : {}),
            ...(c.closedEnd ? {closedEnd: c.closedEnd} : {})})),
        symmetries: a.group.elements.filter(e => e.proper).map(e => ({m: e.m, t: e.t})),
        axial: a.group.axial.map(x => ({axis: x.axis, order: x.order})),
        anchor
    };
};

/** Every proper symmetry as p ↦ m·p + t: the group's elements, and n-fold turns composed with them. */
export const symmetriesOf = geo => {
    const out = [{m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0]}, ...(geo.symmetries || [])];
    for (const {axis, order} of geo.axial || []) {
        for (let k = 1; k < order; k++) {
            const m = axisAngle(axis, 2 * Math.PI * k / order);
            const c = geo.anchor;
            const turn = {m, t: c.map((v, i) => v - mulVec(m, c)[i])};
            for (const g of geo.symmetries || []) out.push({m: mul(turn.m, g.m), t: mulVec(turn.m, g.t).map((v, i) => v + turn.t[i])});
            out.push(turn);
        }
    }
    return out;
};

/**
 * Does the predicted frame agree with the file's, modulo the part's symmetries?
 * @returns {{agree: boolean, rotation: boolean, offset: number|null}} offset: the smallest origin
 *          distance (LDU) among the symmetries that reconcile the axes, null when none does
 */
export const compareFrames = (pred, truth, symmetries, tolerance = 0.5) => {
    let best = null;
    for (const g of symmetries) {
        const LM = mul(g.m, pred.M);
        if (!LM.every((v, i) => Math.abs(v - truth.M[i]) < 1e-3)) continue;
        const o = mulVec(g.m, pred.o).map((v, i) => v + g.t[i]);
        const d = Math.hypot(o[0] - truth.o[0], o[1] - truth.o[1], o[2] - truth.o[2]);
        if (best === null || d < best) best = d;
    }
    return {agree: best !== null && best <= tolerance + 1e-6, rotation: best !== null, offset: best};
};

/** Score one part: {part, category, split, verdict, rule, offset}. */
export const scorePart = (geo, row, tolerance = 0.5) => {
    const base = {part: geo.part, split: splitOf(geo.part), category: geo.category || 'none'};
    if (geo.error) return {...base, verdict: geo.error};
    const pred = lddFrameOf({connectors: geo.connectors, category: geo.category}, {bottom: geo.bottom});
    if (!pred) return {...base, verdict: 'no-rule'};
    const c = compareFrames(pred, frameOfRow(row), symmetriesOf(geo), tolerance);
    return {...base, rule: pred.rule, verdict: c.agree ? 'agree' : c.rotation ? 'translation' : 'rotation', offset: c.offset};
};

// ---- the scorecard ---------------------------------------------------------------------

const VERDICTS = ['agree', 'rotation', 'translation', 'no-rule', 'not-in-library', 'no-geometry'];

/**
 * Tally scored parts per category (and per rule).
 * @returns {{rows: {key, n, scored, agree, rate, counts}[], total: object}}
 */
export const tally = (scores, by = s => s.category) => {
    const groups = new Map();
    const add = (key, s) => {
        if (!groups.has(key)) groups.set(key, {key, counts: Object.fromEntries(VERDICTS.map(v => [v, 0]))});
        groups.get(key).counts[s.verdict]++;
    };
    for (const s of scores) {
        add(by(s), s);
        add('ALL', s);
    }
    const rows = [...groups.values()].map(g => {
        const scored = g.counts.agree + g.counts.rotation + g.counts.translation + g.counts['no-rule'];
        return {...g, n: VERDICTS.reduce((s, v) => s + g.counts[v], 0), scored, agree: g.counts.agree, rate: scored ? g.counts.agree / scored : 0};
    });
    rows.sort((a, b) => (a.key === 'ALL') - (b.key === 'ALL') || b.scored - a.scored || String(a.key).localeCompare(String(b.key)));
    return {rows, total: rows.find(r => r.key === 'ALL')};
};

export const formatScorecard = (scores, title = 'scorecard') => {
    const lines = [title];
    const table = (label, t) => {
        lines.push('', `${label.padEnd(16)} ${'n'.padStart(5)} ${'scored'.padStart(6)} ${'agree'.padStart(6)} ${'rate'.padStart(6)}  ` +
            VERDICTS.slice(1).map(v => v.padStart(v.length)).join(' '));
        for (const r of t.rows) {
            lines.push(`${String(r.key).padEnd(16)} ${String(r.n).padStart(5)} ${String(r.scored).padStart(6)} ${String(r.agree).padStart(6)} ` +
                `${(100 * r.rate).toFixed(1).padStart(5)}%  ` + VERDICTS.slice(1).map(v => String(r.counts[v]).padStart(v.length)).join(' '));
        }
    };
    table('category', tally(scores));
    table('rule', tally(scores.filter(s => s.rule || s.verdict === 'no-rule'), s => s.rule || '(none)'));
    return lines.join('\n');
};

/**
 * Evaluate every part the mapping file and the library share.
 * @param {{xml: string, read: (p: string) => string|undefined, split?: string, tolerance?: number,
 *          parts?: string[], limit?: number, cache?: string}} options
 */
export const evaluate = ({xml, read, split = 'all', tolerance = 0.5, parts, limit, cache}) => {
    const rows = parseLdrawXml(xml);
    let names = [...rows.keys()].sort();
    if (parts) names = names.filter(p => parts.includes(p));
    if (split !== 'all') names = names.filter(p => splitOf(p) === split);
    if (limit) names = names.slice(0, limit);
    const cached = new Map();
    if (cache && existsSync(cache)) {
        for (const line of readFileSync(cache, 'utf8').split('\n')) if (line) { const g = JSON.parse(line); cached.set(g.part, g); }
    }
    return names.map(p => {
        let geo = cached.get(p);
        if (!geo) {
            try {
                geo = geometryOf(p, read);
            } catch (e) {
                geo = {part: p, error: 'no-geometry', message: String(e?.message || e)};
            }
            if (cache) appendFileSync(cache, `${JSON.stringify(geo)}\n`);
        }
        return scorePart(geo, rows.get(p), tolerance);
    });
};

const main = () => {
    const args = process.argv.slice(2);
    const opt = name => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const xmlPath = opt('--ldraw-xml');
    const lib = opt('--ldraw');
    if (!xmlPath || !lib) {
        process.stderr.write('usage: node scripts/eval-ldd-frames.mjs --ldraw-xml <ldraw.xml> --ldraw <LDraw library dir> [--split train|test|all] [--tolerance 0.5] [--list] [--cache f.jsonl]\n');
        process.exit(2);
    }
    const split = opt('--split') || 'all';
    const tolerance = Number(opt('--tolerance') || 0.5);
    const scores = evaluate({
        xml: readFileSync(xmlPath, 'utf8'), read: libReader(path.resolve(lib)), split, tolerance,
        parts: opt('--parts')?.split(',').map(s => s.trim().toLowerCase()), limit: Number(opt('--limit')) || undefined, cache: opt('--cache')
    });
    process.stdout.write(`${formatScorecard(scores, `LDD frames from geometry vs ${path.basename(xmlPath)}: split ${split}, tolerance ${tolerance} LDU`)}\n`);
    if (args.includes('--list')) {
        for (const s of scores.filter(x => x.verdict !== 'agree')) {
            process.stdout.write(`${s.part}\t${s.category}\t${s.rule || ''}\t${s.verdict}\t${s.offset === null || s.offset === undefined ? '' : s.offset.toFixed(2)}\n`);
        }
    }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

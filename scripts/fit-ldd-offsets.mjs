#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Fit LEGO Digital Designer's part frames to LDraw's, from LDD's own connection
// points — TOOLING ONLY. It reads a local LDD installation's part data that the
// owner points it at (read-only) and prints NUMBERS: per part, the rotation and
// offset that take an LDD part-local point to the LDraw part-local point, with the
// fit residual. No LDD data is in this repository, and none may be committed:
// only fitted numbers may be, with a note of where they came from (as
// model/ldd-parts.js does for its 27 rows).
//
// INPUT: LDD's part primitives, `Primitives/<designID>.xml` (inside LDD's
// `Assets/db.lif`; extract the archive first — this script does not read .lif).
// Each holds `<Connectivity>` with `<Axel …>` elements: the Technic holes, pins and
// axles, each an axis-angle rotation (`angle` in degrees about `ax ay az`) and a
// point (`tx ty tz`, LDD units: 1 = 25 LDU, y up) with a `length`. Studs
// (`Custom2DField`) are not used: a part without Axel elements is reported, not fitted.
//
// UNVERIFIED CONVENTION: which local axis an Axel runs along, and whether its point is
// the line's start or its centre, was not checked against LDD data (none was
// available). The fitter therefore tries all twelve (±x/±y/±z × start/centre) and
// keeps the one with the smallest total residual over every part — a wrong
// convention cannot fit a library of beams, pins and cross blocks — and prints every
// convention's total so the choice can be judged. `--axel-axis` / `--anchor` fix it.
//
// THE FIT, per part: LDD lines (centre, direction) against the part's derived line
// connectors (parts.json pinhole/axlehole/pin/axle). The rotation is one of the 24
// axis rotations Q composed with LDraw's flip F = diag(1, −1, −1) (both libraries
// draw parts axis-aligned; all 27 rows of ldd-parts.js are such rotations); the
// offset comes from pairing one LDD line with each parallel LDraw line and is then
// averaged over every matched pair. The residual is the RMS distance between mapped
// LDD line centres and their LDraw partners, both ways (an unmatched line counts).
// Fits within 1e-6 LDU of the best are reported as `ambiguous` (the connector set's
// own symmetry: a straight beam fits flipped end for end). LDD's Axel `type` numbers are
// not documented here either: which LDraw connector type each one is gets learnt from
// the parts whose fits pair it unambiguously (a beam's holes are pin holes), and then
// keeps a cross block's axle hole off its pin hole.
//
//   p_LDraw = 25 · F · Q · q_LDD + d          (LDU)
// and in ldd-parts.js's row form (lxf-model.js lddToLdraw): Q = Rot(axis, angle),
// translation t = F·d / 25 (LDD units).
//
// CROSS-CHECK: for every design ID in model/ldd-parts.js the fitted transform is
// compared with the row's, modulo the LDraw part's connector symmetry (a fit that
// flips a symmetric beam is the same fit): rotation difference (degrees) and offset
// difference (LDU). The rows keep LDD's 0.02-unit (0.5 LDU) sub-offsets, so an
// agreement shows ~0.5 LDU.
//
// Usage:
//   node scripts/fit-ldd-offsets.mjs --ldd <dir with Primitives/ (or the Primitives dir)> \
//        [--parts 32523,4519] [--axel-axis y|-y|x|-x|z|-z --anchor start|centre] [--out fit.json]

import {readFileSync, writeFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SIGNED_PERMUTATIONS, axisAngle, connectorsMap, det, describe, mul, mulVec, transpose} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/canonical-frame.js';
import {LDD_PARTS, LDD_UNIT_LDU} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldd-parts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTS_FILE = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json');

const F = Object.freeze([1, 0, 0, 0, -1, 0, 0, 0, -1]);
const PROPER = SIGNED_PERMUTATIONS.filter(m => det(m) > 0);
const LINE_TYPES = new Set(['pinhole', 'axlehole', 'pin', 'axle']);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => scale(a, 1 / (len(a) || 1));
const r6 = v => Math.round(v * 1e6) / 1e6 + 0;

// ---- reading LDD primitives -----------------------------------------------------------------

const attrsOf = text => Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1], m[2]]));

/**
 * The Axel elements of one LDD primitive XML (and how many stud fields it has).
 * @returns {{designId: string|null, name: string|null, axels: {angle: number, axis: number[], point: number[], length: number, type: string|null}[], fields: number}}
 */
export const parsePrimitive = xml => {
    const text = xml.replace(/<!--[\s\S]*?-->/g, '');
    const annotation = /<Annotation\b([^>]*)>/i.exec(text);
    const name = annotation ? (attrsOf(annotation[1]).designname ?? null) : null;
    const id = /<Design\b[^>]*\bdesignID\s*=\s*"([^"]+)"/i.exec(text) || /<Decoration\b[^>]*\bdesignID\s*=\s*"([^"]+)"/i.exec(text);
    const axels = [...text.matchAll(/<Axel\b([^>]*?)\/?>/gi)].map(m => {
        const a = attrsOf(m[1]);
        const num = k => (a[k] === undefined ? 0 : Number(a[k]));
        return {angle: num('angle'), axis: [num('ax'), num('ay'), num('az')], point: [num('tx'), num('ty'), num('tz')],
            length: num('length'), type: a.type ?? null};
    });
    return {designId: id ? id[1] : null, name, axels, fields: (text.match(/<Custom2DField\b/gi) || []).length};
};

/** The twelve candidate conventions. */
export const CONVENTIONS = Object.freeze(['x', '-x', 'y', '-y', 'z', '-z'].flatMap(axis => ['start', 'centre'].map(anchor => Object.freeze({axis, anchor}))));
const AXIS_VEC = {x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1]};

/** LDD lines (LDD units) of a parsed primitive under a convention. */
export const lddLines = (prim, {axis, anchor}) => prim.axels.map(a => {
    const R = len(a.axis) > 0 ? axisAngle(a.axis, a.angle * Math.PI / 180) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const dir = unit(mulVec(R, AXIS_VEC[axis]));
    const centre = anchor === 'start' ? add(a.point, scale(dir, a.length / 2)) : a.point;
    return {centre, dir, length: a.length, type: a.type};
});

/** The part's line connectors (LDU). */
export const ldrawLines = meta => (meta.connectors || []).filter(c => LINE_TYPES.has(c.type) && c.axis)
    .map(c => ({centre: c.position, dir: unit(c.axis), length: c.length ?? 0, type: c.type}));

// ---- the fit --------------------------------------------------------------------------------

const parallel = (a, b) => Math.abs(dot(a, b)) > 0.9998; // 1°

/**
 * Nearest parallel partner distances, both ways: {rms, max, pairs}. With a type map (LDD
 * Axel type → LDraw connector type), a line pairs only with a line of its mapped type.
 */
const score = (mapped, ours, typeMap) => {
    const fits = (l, o) => !typeMap || !(l.type in typeMap) || typeMap[l.type] === o.type;
    const one = (from, to, flip) => from.map(l => {
        let best = Infinity; let who = -1;
        to.forEach((o, j) => {
            if (!parallel(l.dir, o.dir) || !(flip ? fits(o, l) : fits(l, o))) return;
            const d = len(sub(l.centre, o.centre));
            if (d < best) { best = d; who = j; }
        });
        return {d: best, who};
    });
    const ab = one(mapped, ours, false); const ba = one(ours, mapped, true);
    const all = [...ab, ...ba].map(x => x.d);
    const rms = Math.sqrt(all.reduce((s, d) => s + (Number.isFinite(d) ? d * d : 1e12), 0) / all.length);
    return {rms, max: Math.max(...all), pairs: ab};
};

/**
 * Fit one part. `ours` from ldrawLines, `theirs` from lddLines; `typeMap` (LDD Axel type →
 * LDraw connector type, learnt over the library by fitLibrary) keeps an axle hole off a pin hole.
 * @returns {null|{Q: number[], A: number[], d: number[], rms: number, max: number, ambiguous: number, fits: object[]}}
 *          A = F·Q (the rotation part, without the 25 scale); null when there is nothing to fit
 */
export const fitPart = (ours, theirs, typeMap) => {
    if (!ours.length || !theirs.length) return null;
    const fits = [];
    for (const Q of PROPER) {
        const A = mul(F, Q);
        const dirs = theirs.map(l => mulVec(A, l.dir));
        for (const o of ours) {
            if (!parallel(dirs[0], o.dir)) continue;
            let d = sub(o.centre, scale(mulVec(A, theirs[0].centre), LDD_UNIT_LDU));
            const place = () => theirs.map((l, i) => ({centre: add(scale(mulVec(A, l.centre), LDD_UNIT_LDU), d), dir: dirs[i], type: l.type}));
            let s = score(place(), ours, typeMap);
            // Refine: the mean offset over the matched pairs.
            const matched = s.pairs.map((p, i) => [p, i]).filter(([p]) => p.who >= 0);
            if (matched.length) {
                d = scale(matched.reduce((acc, [p, i]) => add(acc, sub(ours[p.who].centre, scale(mulVec(A, theirs[i].centre), LDD_UNIT_LDU))), [0, 0, 0]), 1 / matched.length);
                s = score(place(), ours, typeMap);
            }
            // The connector types this fit pairs each LDD Axel type with.
            const induced = {};
            s.pairs.forEach((p, i) => { if (p.who >= 0) (induced[theirs[i].type] ||= new Set()).add(ours[p.who].type); });
            fits.push({Q, A, d: d.map(r6), rms: s.rms, max: s.max, induced});
        }
    }
    if (!fits.length) return null;
    fits.sort((a, b) => a.rms - b.rms);
    const best = fits[0];
    const equal = fits.filter(f => f.rms <= best.rms + 1e-6);
    // The same transform reached from two seeds is one fit.
    const distinct = equal.filter((f, i) => equal.findIndex(g => g.Q.every((v, k) => v === f.Q[k]) && len(sub(g.d, f.d)) < 1e-6) === i);
    return {...best, ambiguous: distinct.length, fits: distinct};
};

/** A fit in ldd-parts.js row form: {translation (LDD units), axis, angle (radians)}. */
export const rowForm = fit => {
    const w = describe(fit.Q);
    const axis = w.kind === 'identity' ? [1, 0, 0] : w.axis;
    const angle = w.kind === 'identity' ? 0 : w.degrees * Math.PI / 180;
    // describe() reports a positive angle about a canonical axis; make sure the pair reproduces Q.
    const Rq = axisAngle(axis, angle);
    const sign = Rq.every((v, i) => Math.abs(v - fit.Q[i]) < 1e-9) ? 1 : -1;
    return {translation: mulVec(F, fit.d).map(v => r6(v / LDD_UNIT_LDU)), axis: axis.map(r6), angle: r6(sign * angle)};
};

/** A ldd-parts.js row as p = 25·A·q + d (A = F·Rot(axis, angle), d = 25·F·t). */
export const rowTransform = row => ({A: mul(F, axisAngle(row.axis, row.angle)), d: scale(mulVec(F, row.translation), LDD_UNIT_LDU)});

/** The LDraw part's connector symmetries (proper and improper maps about its connector centroid). */
export const connectorSymmetries = meta => {
    const cs = meta.connectors || [];
    const c = scale(cs.reduce((acc, k) => add(acc, k.position), [0, 0, 0]), 1 / (cs.length || 1));
    return SIGNED_PERMUTATIONS.map(m => ({m, t: sub(c, mulVec(m, c))})).filter(g => connectorsMap(cs, cs, g));
};

const angleBetween = (A, B) => {
    const R = mul(transpose(A), B);
    return Math.acos(Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2))) * 180 / Math.PI;
};

/**
 * Fitted vs recorded, modulo the part's connector symmetry g: min over g of the
 * rotation difference between A_fit and g·A_row and the offset between d_fit and g(d_row).
 */
export const compareWithRow = (fit, row, meta) => {
    const r = rowTransform(row);
    let best = {angleDeg: Infinity, offsetLDU: Infinity};
    for (const g of connectorSymmetries(meta)) {
        if (det(g.m) < 0) continue; // a reflection would make the row's frame improper
        const angleDeg = angleBetween(fit.A, mul(g.m, r.A));
        const offsetLDU = len(sub(fit.d, add(mulVec(g.m, r.d), g.t)));
        if (angleDeg < best.angleDeg - 1e-9 || (Math.abs(angleDeg - best.angleDeg) < 1e-9 && offsetLDU < best.offsetLDU)) best = {angleDeg, offsetLDU};
    }
    return {angleDeg: r6(best.angleDeg), offsetLDU: r6(best.offsetLDU), agree: best.angleDeg < 1 && best.offsetLDU < 1};
};

// ---- the library --------------------------------------------------------------------------

/** design ID → LDraw part: ldd-parts.js where it knows the design, else `<designID>.dat` when the catalogue has it. */
const partFor = (designId, catalogue) => LDD_PARTS.get(designId)?.part ?? (catalogue.has(`${designId}.dat`) ? `${designId}.dat` : null);

/** The Primitives directory under `dir` (or `dir` itself). */
export const primitivesDir = dir => {
    if (/\.lif$/i.test(dir)) throw new Error(`${dir}: extract LDD's db.lif first and pass the directory holding Primitives/ (this script does not read .lif archives)`);
    const sub1 = path.join(dir, 'Primitives');
    return existsSync(sub1) && statSync(sub1).isDirectory() ? sub1 : dir;
};

/**
 * Fit every primitive in `dir` that maps to a catalogue part.
 * @param {string} dir
 * @param {{parts?: object[], only?: string[], convention?: {axis: string, anchor: string}}} [options]
 */
export const fitLibrary = (dir, {parts, only, convention} = {}) => {
    const catalogue = new Map((parts ?? JSON.parse(readFileSync(PARTS_FILE, 'utf8')).parts).map(p => [p.part, p]));
    const pdir = primitivesDir(dir);
    const items = [];
    for (const f of readdirSync(pdir).filter(n => /^\d+[a-z]?\.xml$/i.test(n)).sort()) {
        const designId = f.replace(/\.xml$/i, '');
        if (only && !only.includes(designId)) continue;
        const part = partFor(designId, catalogue);
        const prim = parsePrimitive(readFileSync(path.join(pdir, f), 'utf8'));
        items.push({designId, part, prim, meta: part ? catalogue.get(part) : null});
    }
    const fitAll = (conv, typeMap) => items.map(it => {
        if (!it.meta) return {designId: it.designId, part: null, skipped: 'no catalogue part for this design ID'};
        if (!it.prim.axels.length) return {designId: it.designId, part: it.part, skipped: `no Axel connections (${it.prim.fields} stud fields; studs are not fitted)`};
        const fit = fitPart(ldrawLines(it.meta), lddLines(it.prim, conv), typeMap);
        return fit ? {designId: it.designId, part: it.part, fit} : {designId: it.designId, part: it.part, skipped: 'no parallel lines to pair'};
    });
    /**
     * Which LDraw connector type each LDD Axel type is, learnt from the parts that say so
     * unambiguously: a part whose equally good fits all pair an Axel type with one LDraw type
     * votes for that; the majority wins. A cross block alone cannot tell its axle hole from its
     * pin hole (both one hole long); a beam's pin holes can.
     */
    const learnTypes = rows => {
        const votes = {};
        for (const r of rows) {
            if (!r.fit || r.fit.rms > 0.5) continue;
            const maps = r.fit.fits.map(f => f.induced);
            for (const t of Object.keys(maps[0])) {
                const all = new Set(maps.flatMap(m => [...(m[t] || [])]));
                if (all.size !== 1) continue;
                const [ours] = all;
                (votes[t] ||= {})[ours] = (votes[t][ours] || 0) + 1;
            }
        }
        return Object.fromEntries(Object.entries(votes).map(([t, v]) => [t, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));
    };
    const total = rows => rows.reduce((s, r) => s + (r.fit ? r.fit.rms : 0), 0);
    const tried = (convention ? [convention] : CONVENTIONS).map(conv => {
        const typeMap = learnTypes(fitAll(conv));
        return {conv, typeMap, rows: fitAll(conv, typeMap)};
    });
    tried.sort((a, b) => total(a.rows) - total(b.rows));
    const chosen = tried[0];
    const results = chosen.rows.map(r => {
        if (!r.fit) return r;
        const row = LDD_PARTS.get(r.designId);
        return {designId: r.designId, part: r.part, lines: items.find(i => i.designId === r.designId).prim.axels.length,
            residualLDU: r6(r.fit.rms), maxLDU: r6(r.fit.max), ambiguous: r.fit.ambiguous,
            rotation: r.fit.A.map(r6), offsetLDU: r.fit.d, row: rowForm(r.fit),
            ...(row ? {crossCheck: compareWithRow(r.fit, row, catalogue.get(r.part))} : {})};
    });
    return {
        convention: chosen.conv,
        typeMap: chosen.typeMap,
        conventions: tried.map(t => ({...t.conv, totalResidualLDU: r6(total(t.rows))})),
        parts: results
    };
};

const main = () => {
    const args = process.argv.slice(2);
    const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
    const dir = opt('--ldd');
    if (!dir) {
        process.stderr.write('usage: fit-ldd-offsets.mjs --ldd <LDD Primitives dir> [--parts id,id] [--axel-axis y --anchor start] [--out file]\n');
        process.exit(2);
    }
    const convention = opt('--axel-axis') ? {axis: opt('--axel-axis'), anchor: opt('--anchor') || 'start'} : undefined;
    if (convention && !CONVENTIONS.some(c => c.axis === convention.axis && c.anchor === convention.anchor)) {
        process.stderr.write('--axel-axis is one of x -x y -y z -z, --anchor start or centre\n');
        process.exit(2);
    }
    const result = fitLibrary(dir, {only: opt('--parts')?.split(','), convention});
    const doc = {$comment: `Fitted by scripts/fit-ldd-offsets.mjs on ${new Date().toISOString().slice(0, 10)} from LDD part data at ${path.resolve(dir)} (not included; only these numbers may be committed, with this note). p_LDraw = 25·rotation·q_LDD + offsetLDU; row = model/ldd-parts.js form.`, ...result};
    const text = `${JSON.stringify(doc, null, 1)}\n`;
    if (opt('--out')) writeFileSync(opt('--out'), text);
    else process.stdout.write(text);
    const checked = result.parts.filter(p => p.crossCheck);
    process.stderr.write(`convention ${result.convention.axis}/${result.convention.anchor}; fitted ${result.parts.filter(p => p.rotation).length}, ` +
        `skipped ${result.parts.filter(p => p.skipped).length}; ldd-parts.js rows checked ${checked.length}, agreeing ${checked.filter(p => p.crossCheck.agree).length}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

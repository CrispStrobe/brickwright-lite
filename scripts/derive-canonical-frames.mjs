#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Precompute every part's canonical frame (overlay/.../bw-sim/part-meta/canonical-frame.js)
// from its LDraw geometry, for the catalogue (parts.json) and the whole vendored LDraw subset
// (static/ldraw/parts/*.dat):
//
//   parts.json            `mirrorOf` on every catalogue part: {part, transform: {m, t}} — the
//                         part whose shape is this one's under p ↦ m·p + t (m improper; the
//                         part itself when it is its own mirror image, then with its `others`
//                         improper symmetries) — or null (chiral, no
//                         counterpart in the catalogue). The editor's mirror command reads it
//                         (editor/editor-parity.js mirrorPoses).
//   canonical-frames.json per part: frame (centroid, principal axes, moments), connector
//                         lattice, symmetry group, palette placement rotation; and across the
//                         catalogue + vendored subset: mirror pairs and duplicates (an LDraw
//                         `~Moved to` alias, a print of the same mould, two numbers for one
//                         shape).
//
// Run after `derive-part-meta.mjs --generate` (which rewrites the derived entries without
// `mirrorOf`); test/bw-sim-canonical-frame.test.mjs fails while any part lacks it.
//
// Usage:
//   node scripts/derive-canonical-frames.mjs            write both files, print a summary
//   node scripts/derive-canonical-frames.mjs --check    exit 1 when either file is stale
//   node scripts/derive-canonical-frames.mjs --misses   the area each near-symmetry misses
//                                                       (the measurement behind AREA_TOL)

import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {flattenPart, parseLDraw} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {
    AREA_TOL, SIGNED_PERMUTATIONS, analysePart, areaOffSurface, connectorsMap, describe, findPairs, invert,
    mirrorSymmetry, mul, mulVec, placementRotation, transpose
} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/canonical-frame.js';
import {partsFileText} from './migrate-parts-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTS_FILE = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json');
export const FRAMES_FILE = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/canonical-frames.json');
const LIB = path.join(ROOT, 'overlay/scratch-gui/static/ldraw');

export const libReader = lib => p => {
    const f = path.join(lib, p.toLowerCase());
    return existsSync(f) ? readFileSync(f, 'latin1') : undefined;
};

const r4 = v => Math.round(v * 1e4) / 1e4 + 0;
const vec = v => v.map(r4);

/** What kind of duplicate two LDraw files are, from their headers. */
const duplicateKind = (a, b, read) => {
    const desc = p => parseLDraw(read(`parts/${p}`) || '').header.description;
    const moved = [a, b].find(p => /^~Moved to /i.test(desc(p)));
    if (moved) return `alias: ${moved} is "${desc(moved)}"`;
    const base = p => p.replace(/\.dat$/i, '');
    if (/p\d+[a-z]?$/i.test(base(a)) || /p\d+[a-z]?$/i.test(base(b))) return 'print: the same mould with a pattern';
    return 'same geometry under two numbers';
};

/** Analyse the catalogue and the vendored subset. */
export const analyseAll = (read = libReader(LIB), parts = JSON.parse(readFileSync(PARTS_FILE, 'utf8')).parts) => {
    const catalogue = parts.map(meta => analysePart(meta, flattenPart(meta.part, read).polys));
    const inCatalogue = new Set(parts.map(p => p.part.toLowerCase()));
    const vendored = readdirSync(path.join(LIB, 'parts')).filter(f => /\.dat$/i.test(f) && !inCatalogue.has(f.toLowerCase())).sort();
    const extra = vendored.map(f => analysePart({part: f}, flattenPart(f, read).polys, {meshOnly: true}));
    return {catalogue, extra};
};

/** mirrorOf for every catalogue part, from the catalogue's mirror pairs and each part's group. */
export const mirrorOfAll = (catalogue, pairs) => {
    const out = new Map();
    for (const a of catalogue) {
        const s = mirrorSymmetry(a.group);
        // The part's other improper symmetries: the editor mirrors with the one that best matches
        // the world mirror at the part's pose, so a beam mirrored across its own plane stays put.
        const others = a.group.elements.filter(e => !e.proper && e !== s).map(e => ({m: e.m, t: vec(e.t)}));
        out.set(a.meta.part, s ? {part: a.meta.part, transform: {m: s.m, t: vec(s.t)}, ...(others.length ? {others} : {})} : null);
    }
    for (const {a, b, transform} of pairs.mirrors) {
        // Each side's map is the other's inverse, so mirroring twice is the identity.
        out.set(a, {part: b, transform: {m: transform.m, t: vec(transform.t)}});
        const inv = invert(transform);
        out.set(b, {part: a, transform: {m: inv.m, t: vec(inv.t)}});
    }
    return out;
};

/** A symmetry element as text-sized data: what it is (rotation axis + degrees, reflection normal, …), its shift, its miss. */
const elementRow = e => ({...e.what, ...(e.what.axis ? {axis: vec(e.what.axis)} : {}), ...(e.what.normal ? {normal: vec(e.what.normal)} : {}),
    t: vec(e.t), missedArea: e.missedArea});

/** The canonical-frames.json document. */
export const framesDocument = ({catalogue, extra}, pairs, libraryPairs, read) => ({
    $comment: 'Written by scripts/derive-canonical-frames.mjs from the vendored LDraw geometry (part-meta/canonical-frame.js) — do not edit by hand. LDraw frame (LDU, -y up); matrices row-major, p\' = m·p + t. frame.axes are the principal axes of the surface (columns), largest variance first; symmetry elements map the part onto itself (connectors exactly, at most AREA_TOL of the surface off by more than MESH_TOL); mirrors/duplicates span the catalogue and every vendored part file.',
    areaTolerance: AREA_TOL,
    parts: Object.fromEntries(catalogue.map(a => [a.meta.part, {
        frame: {origin: vec(a.stats.centroid), axes: [0, 1, 2].map(i => vec([a.frame.E[i], a.frame.E[3 + i], a.frame.E[6 + i]])),
            moments: vec(a.frame.moments), aligned: a.frame.aligned},
        lattice: {directions: a.lattice.directions.map(d => ({axis: vec(d.axis), count: d.count})), pitch: a.lattice.pitch, pitchByType: a.lattice.pitchByType},
        symmetry: {order: a.group.order, properOrder: a.group.properOrder, chiral: a.group.chiral,
            elements: a.group.elements.filter(e => e.what.kind !== 'identity').map(elementRow), axial: a.group.axial},
        placement: placementRotation(a.meta)
    }])),
    library: {
        scanned: catalogue.length + extra.length,
        mirrors: libraryPairs.mirrors.map(p => ({...p, transform: {m: p.transform.m, t: vec(p.transform.t), missedArea: p.transform.missedArea}})),
        duplicates: libraryPairs.duplicates.map(p => ({...p, kind: duplicateKind(p.a, p.b, read), transform: {m: p.transform.m, t: vec(p.transform.t)}})),
        duplicateGroups: libraryPairs.groups
    }
});

/** One part (or one pair) per line: the file is read by people and diffed by git. */
export const framesText = doc => {
    const {parts, library, ...head} = doc;
    const lines = Object.entries(parts).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    const list = xs => (xs.length ? `[\n${xs.map(x => `   ${JSON.stringify(x)}`).join(',\n')}\n  ]` : '[]');
    return `{\n${Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n "parts": {\n${lines.join(',\n')}\n },\n` +
        ` "library": {\n  "scanned": ${library.scanned},\n  "mirrors": ${list(library.mirrors)},\n  "duplicates": ${list(library.duplicates)},\n` +
        `  "duplicateGroups": ${JSON.stringify(library.duplicateGroups)}\n }\n}\n`;
};

/** Every near-symmetry (connectors match, mesh misses 0 < share < 20 %): the AREA_TOL measurement. */
const misses = catalogue => {
    const rows = [];
    for (const a of catalogue) {
        for (const P of SIGNED_PERMUTATIONS) {
            const m = mul(mul(a.frame.E, P), transpose(a.frame.E)).map(v => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) + 0 : v));
            const w = describe(m);
            if (w.kind === 'identity') continue;
            const c = a.stats.centroid; const mc = mulVec(m, c);
            const g = {m, t: [c[0] - mc[0], c[1] - mc[1], c[2] - mc[2]]};
            if (!connectorsMap(a.meta.connectors || [], a.meta.connectors || [], g)) continue;
            const off = areaOffSurface(a.stats, g, a.index, 0.2);
            if (off.missed > 0 && off.missed < 0.2) rows.push({part: a.meta.part, name: a.meta.name, what: w.kind, missed: off.missed});
        }
    }
    return rows.sort((x, y) => x.missed - y.missed);
};

const main = () => {
    const args = process.argv.slice(2);
    const read = libReader(LIB);
    const json = JSON.parse(readFileSync(PARTS_FILE, 'utf8'));
    const all = analyseAll(read, json.parts);
    if (args.includes('--misses')) {
        for (const r of misses(all.catalogue)) process.stdout.write(`${(r.missed * 100).toFixed(3).padStart(7)} %  ${r.part}  ${r.what}  ${r.name}\n`);
        return;
    }
    const pairs = findPairs(all.catalogue);
    const libraryPairs = findPairs([...all.catalogue.map(a => ({...a, meshOnly: true})), ...all.extra]);
    const mirrorOf = mirrorOfAll(all.catalogue, pairs);
    for (const p of json.parts) p.mirrorOf = mirrorOf.get(p.part);
    const partsText = partsFileText(json);
    const frames = framesText(framesDocument(all, pairs, libraryPairs, read));
    JSON.parse(frames); // it is JSON
    if (args.includes('--check')) {
        const stale = [[PARTS_FILE, partsText], [FRAMES_FILE, frames]]
            .filter(([f, text]) => !existsSync(f) || readFileSync(f, 'utf8') !== text).map(([f]) => path.relative(ROOT, f));
        if (stale.length) {
            process.stderr.write(`canonical frames are stale in ${stale.join(', ')}: run node scripts/derive-canonical-frames.mjs\n`);
            process.exit(1);
        }
        process.stdout.write('canonical frames: parts.json mirrorOf and canonical-frames.json are current\n');
        return;
    }
    writeFileSync(PARTS_FILE, partsText);
    writeFileSync(FRAMES_FILE, frames);
    const self = [...mirrorOf.values()].filter((v, i) => v && v.part === json.parts[i].part).length;
    process.stdout.write(`${all.catalogue.length} catalogue parts, ${all.extra.length} further vendored files\n` +
        `mirror pairs in the catalogue: ${pairs.mirrors.map(p => `${p.a}↔${p.b}`).join(', ') || 'none'}\n` +
        `own mirror image: ${self}; chiral without a counterpart: ${[...mirrorOf.values()].filter(v => v === null).length}\n` +
        `library mirror pairs: ${libraryPairs.mirrors.map(p => `${p.a}↔${p.b}`).join(', ') || 'none'}\n` +
        `library duplicates: ${libraryPairs.groups.map(g => g.join('=')).join(', ') || 'none'}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

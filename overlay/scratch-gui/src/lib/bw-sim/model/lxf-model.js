// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LEGO Digital Designer's LXFML (the XML inside an .lxf ZIP, IMAGE100.LXFML)
// → PlacedModel. Pure text in, model and refusals out; no DOM (node --test
// runs it), so the few elements it needs are read with a small tag scanner.
//
// What is read: LXFML version 5 (LDD 4.x), every <Part> inside <Bricks> with
// its designID, first material and first <Bone transformation="…">. A design that is
// a catalogue part (`<designID>.dat`) whose frame the geometry rules of model/ldd-frame.js
// derive with confidence (importFrame: a stud-grid part — brick, plate, tile, slope — or a simple
// Technic shape: a pin, an axle, a bush, a straight beam; docs/ROBOT-LAB-LDD-FRAMES.md) is placed
// with that derived frame and a warning `lxf-derived-frame`. Any other catalogue part is placed
// where its connectors meet the parts already placed (model/ldd-snap.js "snap to connections",
// warning `lxf-snapped-frame`), or refused as `lxf-unplaced-design` when nothing tells where.
// No per-part frame is recorded (model/ldd-parts.js). Every other part
// is a refusal with code `lxf-unknown-design` naming the design number; a material LDraw's
// colour table has no LEGO number for keeps the part in the catalog default
// colour and says so (`lxf-unknown-material`); a mirrored or stretched bone is
// `lxf-bad-transform`. Cameras, groups, rigid systems and building
// instructions are LDD-only and are not read.

import {det3} from '../contracts.js';
import {LDD_UNIT_LDU} from './ldd-parts.js';
import {lddFrameOf, rowOfFrame, importFrame} from './ldd-frame.js';
import {Anchors, placedConnectors, snapFrames} from './ldd-snap.js';
import {BUILTIN_KINDS} from '../kinds/index.js';
import {MAX_COORDINATE} from './ldraw-model.js';

/** The colour an unmapped material gets: LDraw 71, light bluish grey (the Technic default). */
export const LXF_FALLBACK_COLOUR = 71;

/** An .lxf/.lxfml that cannot be read at all (not a refusal of one part: the whole file). */
export class LxfError extends Error {
    constructor (code, message) {
        super(message);
        this.name = 'LxfError';
        this.code = code;
    }
}

const ATTR = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const decode = s => s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({lt: '<', gt: '>', quot: '"', apos: "'", amp: '&'}[e]));
const attrs = text => {
    const out = {};
    for (const m of text.matchAll(ATTR)) out[m[1]] = decode(m[2] ?? m[3]);
    return out;
};

/** Every start/end tag in document order: {name, attrs, open, close}. Comments, PIs and CDATA are skipped. */
const tags = xml => {
    const clean = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '');
    const out = [];
    for (const m of clean.matchAll(/<(\/?)([A-Za-z_][\w.-]*)([^>]*?)(\/?)>/g)) {
        out.push({name: m[2], attrs: m[1] ? {} : attrs(m[3]), open: !m[1], close: Boolean(m[1] || m[4])});
    }
    return out;
};

/** Rotation by `angle` (radians) about unit `axis`, row-major 3×3 acting on column vectors. */
export const axisAngle = (axis, angle) => {
    const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const [x, y, z] = axis.map(v => v / n);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    return [
        t * x * x + c, t * x * y - s * z, t * x * z + s * y,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c
    ];
};

const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
// LDD numbers are floats (0.99999994); snap what is a float away from a round value.
const tidy = (v, step) => {
    const r = Math.round(v / step) * step;
    const out = Math.abs(v - r) < step * 1e-3 ? r : v;
    return Object.is(out, -0) ? 0 : Number(out.toFixed(6));
};

/**
 * One LXFML bone placed as an LDraw part (see model/ldd-parts.js for the formula).
 * @param {number[]} bone the 12 numbers of `transformation`: 3×3 rotation by rows of
 *        basis images (row k is where local axis k goes), then the translation
 * @param {{translation: number[], axis: number[], angle: number}|{translation: number[], rotation: number[]}} row
 *        the part's frame difference: a table row (axis-angle), or a derived one (ldd-frame.js rowOfFrame:
 *        `rotation` is Rn itself, row-major)
 * @returns {{rotation: number[], position: number[]}} LDraw rotation (row-major) and position (LDU)
 */
export const lddToLdraw = (bone, row) => {
    // The bone's k-th triple is the image of local axis k: those are the COLUMNS of B.
    const B = [bone[0], bone[3], bone[6], bone[1], bone[4], bone[7], bone[2], bone[5], bone[8]];
    const b = bone.slice(9, 12);
    const Rn = row.rotation || axisAngle(row.axis, -row.angle);
    const BR = mul(B, Rn);
    const F = [1, 0, 0, 0, -1, 0, 0, 0, -1];
    const rotation = mul(mul(F, BR), F).map(v => tidy(v, 1));
    const t = mulVec(BR, row.translation);
    const position = mulVec(F, [b[0] - t[0], b[1] - t[1], b[2] - t[2]]).map(v => tidy(v * LDD_UNIT_LDU, 0.5));
    return {rotation, position};
};

/**
 * A design placed by its shape: the catalogue part of the same number, when the geometry rule
 * derives its LDD frame with a rule trusted for import (ldd-frame.js importFrame).
 * @returns {{part: string, translation: number[], rotation: number[]}|null}
 */
const derivedRow = (design, catalog) => {
    if (!catalog || !/^[0-9A-Za-z]+$/.test(design)) return null;
    const part = `${design.toLowerCase()}.dat`;
    const meta = catalog.get(part);
    if (!meta) return null;
    const frame = importFrame(meta);
    return frame ? {part, ...rowOfFrame(frame)} : null;
};

/** Every design ID an LXFML names, of its parts and its elements (for a caller that loads those parts into the catalogue first). */
export const lxfDesigns = xml => {
    const out = new Set();
    for (const m of String(xml).matchAll(/<(?:Part|Brick)\b[^>]*\bdesignID\s*=\s*["']([^"']+)["']/g)) out.add(m[1].trim());
    return [...out];
};

/** The catalogue part an LDD design is, when it is one with no recorded row (null: none). */
export const lddCataloguePart = (design, catalog) => {
    if (!catalog || !/^[0-9A-Za-z]+$/.test(design)) return null;
    const part = `${design.toLowerCase()}.dat`;
    return catalog.get(part) ? part : null;
};

/**
 * Read LXFML text into a PlacedModel.
 * @param {string} xml
 * @param {{colours: Map<number, number>, catalog?: Map<string, object>}} options colours: LEGO colour number →
 *        LDraw code (ldd-parts.js lddColours); catalog: LDraw part → PartMeta (the Robot Lab's catalogue), for
 *        the derived frame of a design outside ldd-parts.js
 * @returns {{model: {version: 1, parts: object[]}, refusals: object[]}}
 * @throws {LxfError} when the text is not LXFML this reader understands
 */
export const parseLxfml = (xml, {colours, catalog}) => {
    const list = tags(xml);
    const root = list.find(t => t.open);
    if (!root || root.name !== 'LXFML') throw new LxfError('lxf-unreadable', 'not an LXFML document');
    const major = Number(root.attrs.versionMajor);
    if (major !== 5) throw new LxfError('lxf-version', `LXFML version ${root.attrs.versionMajor || '?'} is not supported (only version 5, LDD 4)`);
    // Every <Part> of <Bricks>, in file order: {designID, materials, bone, brick} — brick: the <Brick> (LEGO's
    // element) around it, {designID, parts: [records]}; an element LDD builds of several parts (an EV3 motor:
    // its body and its hub) names the element's design, the one LDraw has.
    const records = [];
    let inBricks = false;
    let part = null;
    let brick = null;
    for (const t of list) {
        if (t.name === 'Bricks') {
            inBricks = t.open && !t.close;
            continue;
        }
        if (!inBricks) continue;
        if (t.name === 'Brick') {
            brick = t.open && !t.close ? {designID: String(t.attrs.designID || '').trim(), parts: []} : null;
            continue;
        }
        if (t.name === 'Part' && t.open) {
            part = {designID: t.attrs.designID, materials: t.attrs.materials, bone: null, brick};
            if (brick) brick.parts.push(part);
            if (t.close) { records.push(part); part = null; }
        } else if (t.name === 'Bone' && t.open && part && part.bone === null) {
            part.bone = t.attrs.transformation || '';
        } else if (t.name === 'Part' && !t.open && part) {
            records.push(part);
            part = null;
        }
    }
    const refusals = [];
    const placed = new Array(records.length).fill(null);
    const anchors = catalog ? new Anchors() : null;
    /** design → {meta, part, items: [{i, bone, color}]}: designs whose frame the model's connections decide */
    const pending = new Map();
    /** Places record i as `partName` with frame row `row`; false when its bone places it out of range. */
    const put = (i, {design, bone, color}, partName, row) => {
        const {rotation, position} = lddToLdraw(bone, row);
        // A bone with absurd numbers (1e308) places nothing a model can hold: refused like a bad one.
        if (![...rotation, ...position].every(Number.isFinite) || position.some(v => Math.abs(v) > MAX_COORDINATE)) {
            refusals.push({code: 'lxf-bad-transform', design, message: `LDD design ${design}: its transformation places it out of range`});
            return false;
        }
        placed[i] = {part: partName, color, position, rotation};
        const meta = catalog && catalog.get(partName);
        if (anchors && meta) anchors.add(placedConnectors(meta, {rotation, position}));
        return true;
    };
    records.forEach((rec, i) => {
        let design = String(rec.designID || '').trim();
        // An element LDD builds of several parts whose own designs no catalogue part has, but the element's design
        // does: its first part (the body) stands for the element, placed as the element's part; the rest are in it.
        const el = rec.brick;
        if (el && el.parts.length > 1 && el.designID && catalog && !lddCataloguePart(design, catalog) && lddCataloguePart(el.designID, catalog)) {
            if (el.parts[0] !== rec) {
                refusals.push({severity: 'warning', code: 'lxf-part-of-element', design,
                    message: `LDD design ${design} is a piece of element ${el.designID}, placed whole; it is left out`});
                return;
            }
            design = el.designID;
        }
        const derived = derivedRow(design, catalog);
        const catalogued = derived ? null : lddCataloguePart(design, catalog);
        if (!derived && !catalogued) {
            refusals.push({code: 'lxf-unknown-design', design, message: `LDD design ${design || '?'} has no LDraw part in the Robot Lab`});
            return;
        }
        const bone = rec.bone ? rec.bone.split(',').map(Number) : null;
        if (!bone || bone.length !== 12 || bone.some(v => !Number.isFinite(v)) ||
            Math.abs(det3([bone[0], bone[3], bone[6], bone[1], bone[4], bone[7], bone[2], bone[5], bone[8]]) - 1) > 1e-3) {
            refusals.push({code: 'lxf-bad-transform', design, message: `LDD design ${design}: its transformation is missing, mirrored or stretched`});
            return;
        }
        const material = Number(String(rec.materials || '').split(',')[0]);
        let color = colours.get(material);
        if (color === undefined) {
            color = LXF_FALLBACK_COLOUR;
            refusals.push({severity: 'warning', code: 'lxf-unknown-material', design,
                message: `LDD design ${design}: material ${rec.materials || '?'} has no LDraw colour; it is light bluish grey`});
        }
        const item = {design, bone, color};
        if (derived) {
            if (put(i, item, derived.part, derived)) {
                refusals.push({severity: 'warning', code: 'lxf-derived-frame', design,
                    message: `LDD design ${design}: placed as ${derived.part} with its LDD frame worked out from the part's shape`});
            }
        } else {
            if (!pending.has(design)) pending.set(design, {meta: catalog.get(catalogued), part: catalogued, items: []});
            pending.get(design).items.push({i, ...item});
        }
    });
    if (pending.size) {
        const snapInput = new Map([...pending].map(([design, d]) => [design, {meta: d.meta, bones: d.items.map(x => x.bone)}]));
        const solved = snapFrames({pending: snapInput, anchors, place: lddToLdraw, rowOf: rowOfFrame, kinds: BUILTIN_KINDS.connectors,
            frameOf: meta => lddFrameOf(meta)});
        for (const [design, d] of pending) {
            const s = solved.get(design);
            if (!s) {
                for (let k = 0; k < d.items.length; k++) {
                    refusals.push({code: 'lxf-unplaced-design', design, message: `LDD design ${design} is ${d.part}, but where its LDD frame ` +
                        'sits in the part could not be worked out from its connections in this model'});
                }
                continue;
            }
            for (const item of d.items) {
                if (!put(item.i, item, d.part, s.row)) continue;
                refusals.push({severity: 'warning', code: 'lxf-snapped-frame', design,
                    message: `LDD design ${design}: placed as ${d.part} where its connectors meet the model's (${Math.floor(s.score + 1e-6)} connections over ` +
                        `${s.instances} part${s.instances === 1 ? '' : 's'}${s.ambiguous ? '; another placement fits as well' : ''})`});
            }
        }
    }
    const parts = placed.filter(Boolean).map((p, k) => ({id: `p${k + 1}`, ...p}));
    return {model: {version: 1, parts}, refusals};
};

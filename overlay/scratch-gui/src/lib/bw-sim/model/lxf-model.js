// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LEGO Digital Designer's LXFML (the XML inside an .lxf ZIP, IMAGE100.LXFML)
// → PlacedModel. Pure text in, model and refusals out; no DOM (node --test
// runs it), so the few elements it needs are read with a small tag scanner.
//
// What is read: LXFML version 5 (LDD 4.x), every <Part> inside <Bricks> with
// its designID, first material and first <Bone transformation="…">. A design in
// model/ldd-parts.js's table is placed with its recorded frame. Any other design
// whose number is a catalogue part (`<designID>.dat`) and whose frame the
// geometry rule of model/ldd-frame.js derives with confidence (a stud-grid part:
// brick, plate, tile, slope — docs/ROBOT-LAB-LDD-FRAMES.md) is placed with that
// derived frame and a warning `lxf-derived-frame`. Every other part
// is a refusal with code `lxf-unknown-design` naming the design number; a material LDraw's
// colour table has no LEGO number for keeps the part in the catalog default
// colour and says so (`lxf-unknown-material`); a mirrored or stretched bone is
// `lxf-bad-transform`. Cameras, groups, rigid systems and building
// instructions are LDD-only and are not read.

import {det3} from '../contracts.js';
import {LDD_PARTS, LDD_UNIT_LDU} from './ldd-parts.js';
import {lddFrameOf, rowOfFrame, DERIVED_RULES} from './ldd-frame.js';
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
 * A design outside the table: the catalogue part of the same number, when the geometry rule
 * derives its LDD frame with a rule trusted for import (ldd-frame.js DERIVED_RULES).
 * @returns {{part: string, translation: number[], rotation: number[]}|null}
 */
const derivedRow = (design, catalog) => {
    if (!catalog || !/^[0-9A-Za-z]+$/.test(design)) return null;
    const part = `${design.toLowerCase()}.dat`;
    const meta = catalog.get(part);
    if (!meta) return null;
    const frame = lddFrameOf(meta);
    if (!frame || !DERIVED_RULES.has(frame.rule)) return null;
    return {part, ...rowOfFrame(frame)};
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
    const parts = [];
    const refusals = [];
    let inBricks = false;
    let part = null; // {designID, materials, bone}
    const finish = () => {
        const design = String(part.designID || '').trim();
        let row = LDD_PARTS.get(design);
        let derived = null;
        if (!row) {
            derived = derivedRow(design, catalog);
            if (!derived) {
                refusals.push({code: 'lxf-unknown-design', design, message: `LDD design ${design || '?'} has no LDraw part in the Robot Lab`});
                return;
            }
            row = derived;
        }
        const bone = part.bone ? part.bone.split(',').map(Number) : null;
        if (!bone || bone.length !== 12 || bone.some(v => !Number.isFinite(v)) ||
            Math.abs(det3([bone[0], bone[3], bone[6], bone[1], bone[4], bone[7], bone[2], bone[5], bone[8]]) - 1) > 1e-3) {
            refusals.push({code: 'lxf-bad-transform', design, message: `LDD design ${design}: its transformation is missing, mirrored or stretched`});
            return;
        }
        const material = Number(String(part.materials || '').split(',')[0]);
        let color = colours.get(material);
        if (color === undefined) {
            color = LXF_FALLBACK_COLOUR;
            refusals.push({severity: 'warning', code: 'lxf-unknown-material', design,
                message: `LDD design ${design}: material ${part.materials || '?'} has no LDraw colour; it is light bluish grey`});
        }
        const {rotation, position} = lddToLdraw(bone, row);
        // A bone with absurd numbers (1e308) places nothing a model can hold: refused like a bad one.
        if (![...rotation, ...position].every(Number.isFinite) || position.some(v => Math.abs(v) > MAX_COORDINATE)) {
            refusals.push({code: 'lxf-bad-transform', design, message: `LDD design ${design}: its transformation places it out of range`});
            return;
        }
        if (derived) {
            refusals.push({severity: 'warning', code: 'lxf-derived-frame', design,
                message: `LDD design ${design}: placed as ${row.part} with its LDD frame worked out from the part's studs (not from a recorded row)`});
        }
        parts.push({id: `p${parts.length + 1}`, part: row.part, color, position, rotation});
    };
    for (const t of list) {
        if (t.name === 'Bricks') {
            inBricks = t.open && !t.close;
            continue;
        }
        if (!inBricks) continue;
        if (t.name === 'Part' && t.open) {
            part = {designID: t.attrs.designID, materials: t.attrs.materials, bone: null};
            if (t.close) { finish(); part = null; }
        } else if (t.name === 'Bone' && t.open && part && part.bone === null) {
            part.bone = t.attrs.transformation || '';
        } else if (t.name === 'Part' && !t.open && part) {
            finish();
            part = null;
        }
    }
    return {model: {version: 1, parts}, refusals};
};

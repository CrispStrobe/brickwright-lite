// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LeoCAD's native project file (.lcd) → LDraw text, for the Robot Lab's "Open…" (model/model-file.js).
// Pure bytes in, text and refusals out; node --test runs it.
//
// THE FORMAT (the binary .lcd of LeoCAD 0.x, which wrote it until LeoCAD 0.80 switched to LDraw/MPD
// as its own format). This reader is our own, written from the files themselves and from how LeoCAD
// lays the format out; no LeoCAD code (GPL) is copied. All numbers are little-endian; a "string" is a
// length byte then that many bytes (Latin-1).
//
//   0   char[32]  "LeoCAD 0.7 Project" and padding (the program's version in the text)
//   32  float     the FILE format version fv (1.3 in the files of 2000–2003); present when the text's
//                 version is above 0.4 (older files are refused: lcd-version)
//       u32       background colour (RGB)
//       f64[6]    only when fv < 0.6: the view's eye and target
//       i32, u32, float, u32, i32, i32, i32, i32
//                 angle snap, snap flags, line width, detail, current group, colour, action, step
//       u32       only when fv > 0.8: scene flags
//       i32       the number of pieces, then each piece:
//         u8        piece version pv (6–9 here; others are refused: lcd-version)
//         keys      pv ≤ 8: u32 n, then n × {f32[4] param, u16 time, u8 type}   (instruction keys)
//                           u32 n, then n × the same                         (animation keys)
//                   pv ≥ 9: u8 key version, then the two lists with each key {u16 time, f32[4], u8 type}
//                   type 0 is a position (param 0–2), type 1 a rotation (param 0–2 the axis, param 3
//                   the angle in degrees, counter-clockwise about the axis); time is the step
//         char[9]   the part number, NUL-padded ("3702", "2977C01": an LDraw part file name)
//         u8        colour: an index into LeoCAD's 28-colour table (LEOCAD_COLOURS)
//         u8, u8    step shown, step hidden (255: never)
//         u16, u16  frame shown, frame hidden (the animation's)
//         pv ≥ 8: u8 state (bit 0: hidden), string the piece's name; pv < 8: i32 hidden, char[81] name
//         pv ≥ 7: i32 group index (−1: none)
//       then the project's author, description and comments (strings), groups, cameras … (not read
//       beyond the author and the description).
//
// Coordinates: LeoCAD's unit is 25 LDU (a stud pitch is 0.8) and its z axis is up; LDraw's −y is up.
// So an LDraw point is T·p·25 and an LDraw rotation T·R·Tᵀ with T = [[1,0,0],[0,0,−1],[0,1,0]]
// (x stays, LDraw y = −z, LDraw z = y). A piece's pose is its instruction keys' (the building
// instructions LeoCAD shows, not its animation's): the last key of each type. Pieces are written in
// the order of the step they appear in, with `0 STEP` between steps.

/** A .lcd that cannot be read at all. */
export class LcdError extends Error {
    constructor (code, message) {
        super(message);
        this.name = 'LcdError';
        this.code = code;
    }
}

/**
 * LeoCAD 0.x's colour table (its order: red, orange, green, light green, blue, light blue, yellow,
 * white, dark grey, black, brown, pink, purple, gold, then the clear colours, light grey, tan, light
 * brown, light pink, turquoise, silver) as the LDraw colour of the same name (LDConfig.ldr).
 */
export const LEOCAD_COLOURS = Object.freeze([
    4, 25, 2, 10, 1, 9, 14, 15, // Red, Orange, Green, Bright_Green, Blue, Light_Blue, Yellow, White
    8, 0, 6, 13, 22, 334, // Dark_Grey, Black, Brown, Pink, Purple, Chrome_Gold
    36, 57, 34, 35, 33, 43, 46, 47, // Trans_ Red, Orange, Green, Bright_Green, Dark_Blue, Light_Blue, Yellow, Clear
    7, 19, 28, 29, 3, 383 // Light_Grey, Tan, Dark_Tan (light brown), Bright_Pink (light pink), Dark_Turquoise, Chrome_Silver
]);
/** The colour a piece with an index outside the table gets: LDraw 71, light bluish grey. */
export const LCD_FALLBACK_COLOUR = 71;
/** More pieces than this is no model (a damaged count). */
const MAX_PIECES = 100000;
const HIDDEN = 0x01;

class Reader {
    constructor (bytes) {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.at = 0;
    }

    need (n) {
        if (this.at + n > this.bytes.length) throw new LcdError('lcd-unreadable', 'the LeoCAD file ends early');
    }

    u8 () { this.need(1); return this.bytes[this.at++]; }
    u16 () { this.need(2); const v = this.view.getUint16(this.at, true); this.at += 2; return v; }
    i32 () { this.need(4); const v = this.view.getInt32(this.at, true); this.at += 4; return v; }
    u32 () { this.need(4); const v = this.view.getUint32(this.at, true); this.at += 4; return v; }
    f32 () { this.need(4); const v = this.view.getFloat32(this.at, true); this.at += 4; return v; }
    skip (n) { this.need(n); this.at += n; }
    text (n) {
        this.need(n);
        const raw = this.bytes.subarray(this.at, this.at + n);
        this.at += n;
        const end = raw.indexOf(0);
        return String.fromCharCode(...(end < 0 ? raw : raw.subarray(0, end)));
    }

    string () { return this.text(this.u8()); }
}

/** Rotation by `deg` degrees about `axis`, row-major (counter-clockwise looking down the axis). */
const axisAngle = (axis, deg) => {
    const n = Math.hypot(axis[0], axis[1], axis[2]);
    if (!(n > 0) || deg === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y, z] = axis.map(v => v / n);
    const a = deg * Math.PI / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};

/** LeoCAD frame → LDraw frame: x, y, z ↦ x, −z, y. */
const toLdrawVec = ([x, y, z]) => [x, -z, y];
/** T·R·Tᵀ for a row-major R (T as above). */
const toLdrawRot = r => {
    const T = [1, 0, 0, 0, 0, -1, 0, 1, 0];
    const Tt = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const mul = (a, b) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
    return mul(mul(T, r), Tt);
};

// LeoCAD floats (0.79999995) are snapped to the round value they stand for.
const tidy = (v, step) => {
    const r = Math.round(v / step) * step;
    const out = Math.abs(v - r) < step * 2e-3 ? r : v;
    return Object.is(out, -0) ? 0 : Number(out.toFixed(4));
};
const fmt = v => String(v);

/** One piece's keys (two lists) → its last instruction position and rotation. */
const readKeys = (r, pv) => {
    const lists = [];
    if (pv >= 9) r.u8(); // the key format's own version
    for (let list = 0; list < 2; list++) {
        const n = r.u32();
        if (n > 65535) throw new LcdError('lcd-unreadable', 'the LeoCAD file is damaged (key count)');
        const keys = [];
        for (let i = 0; i < n; i++) {
            let time;
            if (pv >= 9) time = r.u16();
            const param = [r.f32(), r.f32(), r.f32(), r.f32()];
            if (pv < 9) time = r.u16();
            keys.push({time, param, type: r.u8()});
        }
        lists.push(keys);
    }
    const last = type => lists[0].filter(k => k.type === type).sort((a, b) => a.time - b.time).pop() || null;
    return {position: last(0), rotation: last(1)};
};

/**
 * Read a LeoCAD project.
 * @param {Uint8Array} bytes
 * @returns {{pieces: {part: string, colour: number, position: number[], rotation: number[], step: number,
 *            hidden: boolean, colourIndex: number}[], author: string, description: string, version: number}}
 * @throws {LcdError} lcd-unreadable, lcd-version
 */
export const parseLeoCad = bytes => {
    const r = new Reader(bytes);
    const id = r.text(32);
    const m = /^LeoCAD\s+(\d+(?:[.,]\d+)?)/.exec(id);
    if (!m) throw new LcdError('lcd-unreadable', 'not a LeoCAD project');
    if (!(Number(m[1].replace(',', '.')) > 0.4)) throw new LcdError('lcd-version', `LeoCAD ${m[1]} projects are not supported`);
    const fv = r.f32();
    if (!(fv > 0.4 && fv < 10)) throw new LcdError('lcd-unreadable', 'the LeoCAD file is damaged (version)');
    r.u32(); // background
    if (fv < 0.6) r.skip(48); // the old view's eye and target (f64[6])
    r.skip(32); // snap, line width, detail, group, colour, action, step
    if (fv > 0.8) r.u32(); // scene
    const count = r.i32();
    if (count < 0 || count > MAX_PIECES) throw new LcdError('lcd-unreadable', 'the LeoCAD file is damaged (piece count)');
    const pieces = [];
    for (let i = 0; i < count; i++) {
        const pv = r.u8();
        if (pv < 6 || pv > 9) throw new LcdError('lcd-version', `LeoCAD piece format ${pv} is not supported (6 to 9)`);
        const {position, rotation} = readKeys(r, pv);
        const name = r.text(9).trim();
        const colourIndex = r.u8();
        const step = r.u8();
        const stepHide = r.u8();
        r.u16();
        r.u16(); // frames shown and hidden
        let hidden;
        if (pv >= 8) {
            hidden = Boolean(r.u8() & HIDDEN);
            r.string();
        } else {
            hidden = r.i32() !== 0;
            r.skip(81);
        }
        if (pv >= 7) r.i32(); // group
        const p = position ? position.param : [0, 0, 0];
        const rot = rotation ? axisAngle(rotation.param.slice(0, 3), rotation.param[3]) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
        pieces.push({
            part: name,
            colourIndex,
            colour: LEOCAD_COLOURS[colourIndex] ?? LCD_FALLBACK_COLOUR,
            position: toLdrawVec(p.slice(0, 3)).map(v => tidy(v * 25, 0.5)),
            rotation: toLdrawRot(rot).map(v => tidy(v, 1)),
            step,
            stepHide,
            hidden
        });
    }
    // The project's author and description follow the pieces (best effort: an old file may end here).
    let author = '';
    let description = '';
    try {
        author = r.string();
        description = r.string();
    } catch (_) { /* nothing more */ }
    const lastStep = pieces.reduce((s, p) => Math.max(s, p.step), 0);
    for (const p of pieces) if (p.stepHide !== 255 && p.stepHide <= lastStep) p.hidden = true;
    return {pieces, author, description, version: fv};
};

const clean = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();

/**
 * A LeoCAD project as LDraw text (a model from elsewhere: its author is the project's, never
 * Brickwright's, so the Robot Lab plugs its motors and sensors in for it as for any other).
 * @param {Uint8Array} bytes
 * @param {{name?: string}} [options] name: the file's name (the model's `0 Name:`)
 * @returns {{text: string, refusals: object[]}} refusals: warnings for hidden pieces left out and
 *          colours outside LeoCAD's table
 * @throws {LcdError}
 */
export const leoCadToLdraw = (bytes, {name = 'model.lcd'} = {}) => {
    const {pieces, author, description} = parseLeoCad(bytes);
    const refusals = [];
    const base = String(name).replace(/\.[a-z0-9]+$/i, '') || 'model';
    const lines = [
        `0 ${clean(description) || base}`,
        `0 Name: ${base}.ldr`,
        `0 Author: ${clean(author) && !/^brickwright$/i.test(clean(author)) ? clean(author) : 'unknown (LeoCAD project)'}`,
        `0 // converted from the LeoCAD project ${clean(name)} by the Robot Lab (model/lcd-model.js)`
    ];
    const shown = pieces.map((p, i) => ({...p, i})).filter(p => {
        if (p.hidden) refusals.push({severity: 'warning', code: 'lcd-hidden-piece', design: p.part,
            message: `LeoCAD piece ${p.part} is hidden in the project; it is left out`});
        return !p.hidden && p.part;
    });
    shown.sort((a, b) => a.step - b.step || a.i - b.i);
    let step = null;
    for (const p of shown) {
        if (step !== null && p.step !== step) lines.push('0 STEP');
        step = p.step;
        if (LEOCAD_COLOURS[p.colourIndex] === undefined) {
            refusals.push({severity: 'warning', code: 'lcd-unknown-colour', design: p.part,
                message: `LeoCAD piece ${p.part}: colour ${p.colourIndex} is not in LeoCAD's table; it is light bluish grey`});
        }
        lines.push(`1 ${p.colour} ${[...p.position, ...p.rotation].map(fmt).join(' ')} ${p.part.toLowerCase()}.dat`);
    }
    if (shown.length) lines.push('0 STEP');
    return {text: `${lines.join('\r\n')}\r\n`, refusals};
};

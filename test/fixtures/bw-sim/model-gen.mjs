// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Seeded model generators and a model comparison for the reader/writer tests
// (test/bw-sim-model-roundtrip.test.mjs, test/bw-sim-model-fuzz.test.mjs).
// Everything here is written independently of model/ldraw-model.js: its own
// matrix arithmetic, its own number formatting, its own idea of what an MPD
// flattens to.

/** mulberry32: a small seeded PRNG, the same numbers on every machine. */
export const rng = seed => {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = n => Math.floor(next() * n);
    next.pick = list => list[Math.floor(next() * list.length)];
    next.chance = p => next() < p;
    return next;
};

export const det3 = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
export const mul3 = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
export const mulVec3 = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);

/** The 24 rotations that map axes onto axes: signed permutation matrices with determinant +1. */
export const AXIS_ROTATIONS = (() => {
    const out = [];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) {
        for (let signs = 0; signs < 8; signs++) {
            const m = new Array(9).fill(0);
            for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = (signs >> r) & 1 ? -1 : 1;
            if (det3(m) === 1) out.push(m);
        }
    }
    return out;
})();

/** A uniformly random rotation (from a random unit quaternion), row-major. */
export const randomRotation = next => {
    const u1 = next();
    const u2 = next() * 2 * Math.PI;
    const u3 = next() * 2 * Math.PI;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    const [w, x, y, z] = [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
    return [
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)
    ];
};

/** Every colour code LDConfig defines (`0 !COLOUR name CODE n`). */
export const ldconfigColours = ldconfig => [...ldconfig.matchAll(/^\s*0\s+!COLOUR\s+\S+\s+CODE\s+(\d+)/gm)].map(m => Number(m[1]));

/** An LDraw direct colour 0x2RRGGBB as a number. */
export const directColour = next => 0x2000000 + next.int(0x1000000);

const HUB_PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.#äöü';

const randomWord = (next, length) => Array.from({length}, () => next.pick(ID_CHARS)).join('');

/** A coordinate as a user or a program might leave it: integer, half, or with up to 6 decimals. */
const randomCoordinate = next => {
    const kind = next.int(4);
    const span = next.pick([10, 200, 2000, 50000]);
    const v = (next() * 2 - 1) * span;
    if (kind === 0) return Math.round(v);
    if (kind === 1) return Math.round(v * 2) / 2;
    if (kind === 2) return Number(v.toFixed(3));
    return v; // full double: the writer must keep it to 1e-6
};

/**
 * A random PlacedModel: parts from `parts`, every kind of rotation, every colour, ports, ids,
 * groups and steps — in the shape the reader produces (groups list their members in part
 * order; steps partition the parts in order), so a round trip must give it back unchanged.
 * @param {function} next rng
 * @param {{parts: string[], colours: number[], maxParts?: number}} options
 */
export const randomModel = (next, {parts, colours, maxParts = 40}) => {
    const count = 1 + next.int(maxParts);
    const ids = new Set();
    const out = [];
    for (let n = 0; n < count; n++) {
        let id;
        do id = next.chance(0.3) ? `p${n + 1}` : randomWord(next, 1 + next.int(12)); while (ids.has(id));
        ids.add(id);
        const rk = next.int(3);
        const rotation = rk === 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : rk === 1 ? next.pick(AXIS_ROTATIONS) : randomRotation(next);
        const color = next.chance(0.1) ? directColour(next) : next.pick(colours);
        const part = {id, part: next.pick(parts), color, position: [0, 1, 2].map(() => randomCoordinate(next)), rotation};
        if (next.chance(0.2)) part.port = next.pick(HUB_PORTS);
        out.push(part);
    }
    const model = {version: 1, parts: out};
    if (count >= 2 && next.chance(0.5)) {
        const groups = [];
        const free = out.map(p => p.id);
        const gcount = 1 + next.int(3);
        for (let g = 0; g < gcount && free.length >= 2; g++) {
            const members = new Set();
            const want = 2 + next.int(Math.min(4, free.length - 1));
            while (members.size < want) members.add(free.splice(next.int(free.length), 1)[0]);
            const name = `${randomWord(next, 1 + next.int(6))}${next.chance(0.5) ? ` ${randomWord(next, 1 + next.int(6))}` : ''}`;
            groups.push({id: `g${g + 1}${randomWord(next, next.int(4))}`, name, parts: out.map(p => p.id).filter(i => members.has(i))});
        }
        model.groups = groups;
    }
    if (next.chance(0.4)) {
        const steps = [];
        let current = [];
        for (const p of out) {
            current.push(p.id);
            if (next.chance(0.3)) { steps.push(current); current = []; }
        }
        if (current.length) steps.push(current);
        model.steps = steps;
    }
    return model;
};

/** A number as an LDraw editor might write it (independent of the writer under test). */
export const ldrawNumber = v => {
    const s = Number(v.toFixed(6)).toString();
    return s === '-0' ? '0' : s;
};

/** Colour as LDraw writes it: direct colours in hex. */
export const ldrawColour = c => (c >= 0x2000000 ? `0x${c.toString(16).toUpperCase()}` : String(c));

/**
 * A random MPD with `subs` sub-models, each placing parts and sub-models after it (so no
 * cycles), some several times and nested; colour 16 inside a sub-model takes the colour the
 * sub-model is placed in. Returns the text and the parts a hand placement of every leaf gives.
 */
export const randomMpd = (next, {parts, colours, subs = 1 + next.int(4)}) => {
    const names = Array.from({length: subs}, (_, i) => `sub${i}-${randomWord(next, 3).replace(/[#.]/g, 'x')}.ldr`);
    const sections = names.map(() => []); // [{kind: 'part'|'sub', ...}]
    const pose = () => {
        const rotation = next.chance(0.6) ? next.pick(AXIS_ROTATIONS) : randomRotation(next).map(v => Number(v.toFixed(6)));
        return {rotation, position: [0, 1, 2].map(() => Math.round((next() * 2 - 1) * 400 * 2) / 2)};
    };
    const colourOf = () => (next.chance(0.4) ? 16 : next.chance(0.1) ? directColour(next) : next.pick(colours));
    for (let s = subs - 1; s >= 0; s--) {
        const n = 1 + next.int(4);
        for (let k = 0; k < n; k++) {
            if (s + 1 < subs && next.chance(0.35)) sections[s].push({kind: 'sub', name: names[s + 1 + next.int(subs - s - 1)], color: colourOf(), ...pose()});
            else sections[s].push({kind: 'part', part: next.pick(parts), color: colourOf(), port: next.chance(0.15) ? next.pick(HUB_PORTS) : null, ...pose()});
        }
    }
    const main = [];
    const n = 1 + next.int(5);
    for (let k = 0; k < n; k++) {
        if (next.chance(0.6)) main.push({kind: 'sub', name: next.pick(names), color: colourOf(), ...pose()});
        else main.push({kind: 'part', part: next.pick(parts), color: colourOf(), port: next.chance(0.15) ? next.pick(HUB_PORTS) : null, ...pose()});
    }
    const line = e => `1 ${ldrawColour(e.color)} ${e.position.map(ldrawNumber).join(' ')} ${e.rotation.map(ldrawNumber).join(' ')} ${e.kind === 'sub' ? e.name : e.part}`;
    const sectionText = list => list.flatMap(e => [...(e.port ? [`0 !BW PORT ${e.port}`] : []), line(e)]);
    const text = [
        '0 FILE main.ldr', '0 Main', '0 Name: main.ldr', '0 Author: generated', ...sectionText(main), '0 NOFILE',
        ...names.flatMap((name, s) => [`0 FILE ${name}`, `0 ${name}`, `0 Name: ${name}`, ...sectionText(sections[s]), '0 NOFILE'])
    ].join('\r\n') + '\r\n';
    // Hand placement: compose with the numbers as written in the text.
    const written = e => ({rotation: e.rotation.map(v => Number(ldrawNumber(v))), position: e.position.map(v => Number(ldrawNumber(v)))});
    const expected = [];
    const place = (list, R, t, colour) => {
        for (const e of list) {
            const w = written(e);
            const r = mul3(R, w.rotation);
            const p = mulVec3(R, w.position).map((v, i) => v + t[i]);
            const c = e.color === 16 ? colour : e.color;
            if (e.kind === 'sub') place(sections[names.indexOf(e.name)], r, p, c);
            else expected.push({part: e.part, color: c, position: p, rotation: r, ...(e.port ? {port: e.port} : {})});
        }
    };
    place(main, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 16);
    return {text, expected};
};

/**
 * Differences between two PlacedModels, as sentences (empty: the same model). Poses are
 * compared to `tolerance` LDU (rotation entries to the same number).
 */
export const modelDifferences = (a, b, {tolerance = 1e-6, ids = true} = {}) => {
    const out = [];
    if (a.parts.length !== b.parts.length) return [`${a.parts.length} parts vs ${b.parts.length}`];
    a.parts.forEach((p, i) => {
        const q = b.parts[i];
        const w = `part ${i} (${p.id})`;
        if (ids && p.id !== q.id) out.push(`${w}: id ${p.id} vs ${q.id}`);
        if (p.part !== q.part) out.push(`${w}: part ${p.part} vs ${q.part}`);
        if ((p.color ?? 16) !== (q.color ?? 16)) out.push(`${w}: colour ${p.color} vs ${q.color}`);
        if ((p.port ?? null) !== (q.port ?? null)) out.push(`${w}: port ${p.port} vs ${q.port}`);
        p.position.forEach((v, k) => { if (!(Math.abs(v - q.position[k]) <= tolerance)) out.push(`${w}: position[${k}] ${v} vs ${q.position[k]}`); });
        p.rotation.forEach((v, k) => { if (!(Math.abs(v - q.rotation[k]) <= tolerance)) out.push(`${w}: rotation[${k}] ${v} vs ${q.rotation[k]}`); });
    });
    const groups = m => JSON.stringify((m.groups || []).map(g => [g.id, g.name, g.parts]));
    if (groups(a) !== groups(b)) out.push(`groups ${groups(a)} vs ${groups(b)}`);
    const steps = m => JSON.stringify(m.steps || null);
    if (ids && steps(a) !== steps(b)) out.push(`steps ${steps(a)} vs ${steps(b)}`);
    return out;
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Chain round the gears" (docs/ROBOT-LAB-UX.md §11): where Technic chain links (3711) go to
// make a closed chain round two or more spur gears, for the build editor. Pure, no DOM, no three.
//
// The gears must be spur gears on parallel axles in one plane. The chain runs round the
// outside of their pitch circles (the convex hull of the circles: a gear inside it is not
// wrapped), and its links' pivots sit on that path, a link's pitch apart: a chain link spans two teeth
// (2π · 1.25 LDU each), so on a sprocket every pivot is on the pitch circle, and the compiler's
// chain detector (kinds/chain.js) finds the same gears round. The path's length is rarely a whole
// number of links: the pivots are spaced a little apart or together (`slackLdu`, per link, at most
// CHAIN_JOIN_LDU), as a real chain takes up a fraction of a link's play.

import {CHAIN_JOIN_LDU} from '../kinds/chain.js';
import {gearPitchRadius} from '../contracts.js';

export const CHAIN_LINK_PART = '3711.dat';
export const CHAIN_PITCH = 16;
/** The link each kind of gear takes: a chain round spur gears, the 5-wide tread round its sprockets. */
export const LINK_FOR = Object.freeze({spur: CHAIN_LINK_PART, sprocket: '57518.dat'});
/** Black: the colour LEGO chain links come in. */
export const CHAIN_COLOUR = 0;
const SAMPLES = 720;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const tidy = v => Math.round(v * 1e6) / 1e6 || 0;

/** Andrew's monotone chain: the convex hull of 2D points, counter-clockwise, no repeat of the first. */
export const hull = points => {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const q of p) {
        while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
        lower.push(q);
    }
    const upper = [];
    for (const q of p.reverse()) {
        while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
        upper.push(q);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

/**
 * The links of a chain round the gears `ids` of `model`:
 * {links: [{part, position, rotation, color}], gears: [ids round], slackLdu, lengthLdu} or
 * {error: 'needTwoGears'|'notSpur'|'mixed'|'notParallel'|'notOnePlane'|'tooClose'|'gearInside'|'tooShort', parts?}.
 * @param {{parts: object[]}} model
 * @param {Map<string, object>} catalogMap
 * @param {string[]} ids
 */
export const chainRound = (model, catalogMap, ids) => {
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const gears = [];
    for (const id of ids) {
        const pl = byId.get(id);
        const meta = pl && catalogMap.get(pl.part);
        if (!meta || !meta.gear) continue;
        if (!LINK_FOR[meta.gear.type]) return {error: 'notSpur', parts: [id]};
        if (gears.length && gears[0].type !== meta.gear.type) return {error: 'mixed', parts: [gears[0].id, id]};
        gears.push({id, type: meta.gear.type, r: gearPitchRadius(meta.gear), c: add(mulVec(pl.rotation, meta.gear.center), pl.position),
            a: norm(mulVec(pl.rotation, meta.gear.axis))});
    }
    if (gears.length < 2) return {error: 'needTwoGears'};
    const linkPart = LINK_FOR[gears[0].type];
    const conn = ((catalogMap.get(linkPart) || {}).connectors || []).find(k => k.type === 'chain-link');
    if (!conn) return {error: 'needTwoGears'};
    const pitch = conn.data.pitchLdu;
    const a = gears[0].a;
    for (const g of gears) {
        if (Math.abs(Math.abs(dot(g.a, a)) - 1) > 1 - Math.cos(Math.PI / 180)) return {error: 'notParallel', parts: [gears[0].id, g.id]};
        if (Math.abs(dot(add(g.c, gears[0].c.map(x => -x)), a)) > 1) return {error: 'notOnePlane', parts: [gears[0].id, g.id]};
    }
    // The plane's 2D frame: u, v across the axles, o on the first gear's mid-plane.
    const u = norm(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const v = cross(a, u);
    const o = gears[0].c;
    const to2 = p => { const d = add(p, o.map(x => -x)); return [dot(d, u), dot(d, v)]; };
    const to3 = q => o.map((x, i) => x + u[i] * q[0] + v[i] * q[1]);
    const flat = gears.map(g => ({...g, q: to2(g.c)}));
    for (let i = 0; i < flat.length; i++) {
        for (let k = i + 1; k < flat.length; k++) {
            const d = Math.hypot(flat[i].q[0] - flat[k].q[0], flat[i].q[1] - flat[k].q[1]);
            // Teeth (one module, 2.5 LDU, past the pitch circle) and the chain between them need room.
            if (d < flat[i].r + flat[k].r + 10) return {error: 'tooClose', parts: [flat[i].id, flat[k].id]};
        }
    }
    const samples = [];
    flat.forEach((g, gi) => {
        for (let s = 0; s < SAMPLES; s++) {
            const t = 2 * Math.PI * s / SAMPLES;
            samples.push([g.q[0] + g.r * Math.cos(t), g.q[1] + g.r * Math.sin(t), gi]);
        }
    });
    const path = hull(samples);
    const inside = flat.filter((g, gi) => !path.some(p => p[2] === gi));
    if (inside.length) return {error: 'gearInside', parts: inside.map(g => g.id)};
    // Arc length round the closed path.
    const seg = path.map((p, i) => Math.hypot(path[(i + 1) % path.length][0] - p[0], path[(i + 1) % path.length][1] - p[1]));
    const length = seg.reduce((s, x) => s + x, 0);
    const n = Math.round(length / pitch);
    if (n < 4) return {error: 'tooShort'};
    // Pivots a chord `c` apart along the path (a link is straight): from one, the next is where the
    // path first leaves the circle of radius c round it. The chain closes when the last pivot is c
    // from the first too; that c is found by bisection (the closing gap shrinks as c grows).
    const march = c => {
        const out = [path[0]];
        let i = 0;
        let from = path[0];
        for (let k = 1; k < n; k++) {
            // the first point on segment i.. at distance c from `last`
            const last = out.at(-1);
            for (;;) {
                const q = path[(i + 1) % path.length];
                const dx = q[0] - from[0];
                const dy = q[1] - from[1];
                const fx = from[0] - last[0];
                const fy = from[1] - last[1];
                const A = dx * dx + dy * dy;
                const B = 2 * (fx * dx + fy * dy);
                const C = fx * fx + fy * fy - c * c;
                const disc = B * B - 4 * A * C;
                const t = A > 0 && disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : -1;
                if (t >= 0 && t <= 1) { from = [from[0] + dx * t, from[1] + dy * t]; break; }
                i++;
                if (i >= path.length) return null;
                from = path[i];
            }
            out.push(from);
        }
        return {pivots: out, closing: Math.hypot(out.at(-1)[0] - out[0][0], out.at(-1)[1] - out[0][1])};
    };
    let lo = pitch - CHAIN_JOIN_LDU;
    let hi = pitch + CHAIN_JOIN_LDU;
    let best = null;
    for (let it = 0; it < 60; it++) {
        const c = (lo + hi) / 2;
        const m = march(c);
        if (!m || m.closing < c) hi = c; else lo = c;
        if (m) best = {...m, c};
    }
    if (!best || Math.abs(best.closing - best.c) > 0.05) return {error: 'tooShort'};
    const pivots = best.pivots;
    // Each link: its pivots on pivots k and k+1, its pins along the axles, its outward side (a tread's
    // tread face) away from the sprockets. In the part's frame those are the connector's axis, `along`
    // and `outward` (default along × axis); R maps that triple onto the world's.
    const P = [conn.axis, conn.data.along, conn.data.outward || cross(conn.data.along, conn.axis)];
    const links = pivots.map((p, k) => {
        const from = to3(p);
        const along = norm(add(to3(pivots[(k + 1) % n]), from.map(x => -x)));
        const W = [a, along, cross(along, a)];
        const rotation = [0, 1, 2].flatMap(r => [0, 1, 2].map(c => W.reduce((acc, w, i) => acc + w[r] * P[i][c], 0))).map(tidy);
        // the connector's middle halfway between the pivots
        const mid = from.map((x, i) => x + along[i] * pitch / 2);
        const position = mid.map((x, i) => x - mulVec(rotation, conn.position)[i]).map(tidy);
        return {part: linkPart, position, rotation, color: CHAIN_COLOUR};
    });
    // A link's pivots are `pitch` apart, the chain's `c`: the ends meet within the detector's reach.
    const slackLdu = best.c - pitch;
    return {links, gears: flat.map(g => g.id), slackLdu, lengthLdu: length};
};

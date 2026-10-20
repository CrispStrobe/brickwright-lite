// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rubber bands (docs/ROBOT-LAB-UX.md §12): where a band goes round two or more parts, and which
// band it is. Pure, no DOM, no three. The build view draws the path, kinds/belt.js simulates it.
//
// A band goes round a part's CIRCLE: its `pulley` (part meta: {center, axis, radiusLdu}), else a
// round collider on the axis of one of its holes (a bush, a wheel, a gear: the band sits 2 LDU
// into it), else a pin or an axle (radius 4). The circles must be on parallel axes and side by
// side; the band runs round the outside of them (their convex hull) in their mid-plane.
//
// LDraw has the bands only as fixed rings (85543 … Rubber Belt Round 15 / 1.6: a 15 mm
// centreline diameter), so the band is the model's `belts` record and this path is drawn. Its
// size: of the bands taut round the path and stretched at most BAND_MAX_STRETCH, the one nearest
// BAND_GOOD_STRETCH.

import {hull} from './chain-path.js';

/** The round rubber bands (LDraw parts), by centreline diameter (mm): rest length π·d. */
export const BANDS = Object.freeze([
    {part: '85543.dat', mm: 15, colour: 0},
    {part: '85545.dat', mm: 26, colour: 4},
    {part: '85546.dat', mm: 33, colour: 15}
].map(b => Object.freeze({...b, restLdu: Math.PI * b.mm / 0.4})));
/** A band stretches to at most this many times its rest length. */
export const BAND_MAX_STRETCH = 2.5;
/** The band's cross-section radius (1.6 mm across). */
export const BAND_RADIUS_LDU = 2;

const SAMPLES = 96;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
/** A quaternion [x, y, z, w] applied to v. */
const rotate = (q, v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
const HOLES = ['axlehole', 'pinhole'];
const SHAFTS = ['axle', 'pin'];

/**
 * The circle a band goes round on a part, in the part's own frame: {center, axis, r} (LDU) or null.
 * @param {object} meta part metadata
 */
export const partCircle = meta => {
    if (!meta) return null;
    if (meta.pulley) return {center: meta.pulley.center, axis: norm(meta.pulley.axis), r: meta.pulley.radiusLdu};
    for (const col of meta.colliders || []) {
        if (col.shape !== 'cylinder') continue;
        const axis = norm(col.rotation ? rotate(col.rotation, [0, 1, 0]) : [0, 1, 0]);
        const center = col.position || [0, 0, 0];
        const hole = (meta.connectors || []).find(c => HOLES.includes(c.type) && Math.abs(Math.abs(dot(norm(c.axis), axis)) - 1) < 1e-3 &&
            Math.hypot(...sub(sub(c.position, center), axis.map(x => x * dot(sub(c.position, center), axis)))) < 1);
        if (hole) return {center, axis, r: Math.max(4, col.radius - 2)};
    }
    const shaft = (meta.connectors || []).find(c => SHAFTS.includes(c.type));
    return shaft ? {center: shaft.position, axis: norm(shaft.axis), r: 4} : null;
};

/** A placed part's band circle in the model frame. */
export const placedCircle = (pl, meta) => {
    const c = partCircle(meta);
    return c && {id: pl.id, center: add(mulVec(pl.rotation, c.center), pl.position), axis: norm(mulVec(pl.rotation, c.axis)), r: c.r};
};

/**
 * The band round circles [{center, axis, r}] (model frame, LDU): {points (closed, model frame),
 * lengthLdu, plane: {o, a}} or {error: 'notParallel'|'notOnePlane'|'tooClose'|'inside', index?}.
 */
export const bandPath = circles => {
    const a = circles[0].axis;
    for (let i = 1; i < circles.length; i++) {
        if (Math.abs(Math.abs(dot(circles[i].axis, a)) - 1) > 1 - Math.cos(10 * Math.PI / 180)) return {error: 'notParallel', index: i};
        if (Math.abs(dot(sub(circles[i].center, circles[0].center), a)) > 24) return {error: 'notOnePlane', index: i};
    }
    // The mid-plane: through the circles' mean axial position.
    const meanAxial = circles.reduce((s, c) => s + dot(sub(c.center, circles[0].center), a), 0) / circles.length;
    const o = add(circles[0].center, a.map(x => x * meanAxial));
    const u = norm(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const v = cross(a, u);
    const flat = circles.map(c => { const d = sub(c.center, o); return {q: [dot(d, u), dot(d, v)], r: c.r}; });
    for (let i = 0; i < flat.length; i++) {
        for (let k = i + 1; k < flat.length; k++) {
            if (Math.hypot(flat[i].q[0] - flat[k].q[0], flat[i].q[1] - flat[k].q[1]) < Math.max(flat[i].r, flat[k].r)) return {error: 'tooClose', index: k};
        }
    }
    const samples = [];
    flat.forEach((c, ci) => {
        for (let s = 0; s < SAMPLES; s++) {
            const t = 2 * Math.PI * s / SAMPLES;
            samples.push([c.q[0] + (c.r + BAND_RADIUS_LDU) * Math.cos(t), c.q[1] + (c.r + BAND_RADIUS_LDU) * Math.sin(t), ci]);
        }
    });
    const ring = hull(samples);
    const inside = flat.findIndex((c, ci) => !ring.some(p => p[2] === ci));
    if (inside >= 0) return {error: 'inside', index: inside};
    const points = ring.map(p => o.map((x, i) => x + u[i] * p[0] + v[i] * p[1]));
    const lengthLdu = points.reduce((s, p, i) => s + Math.hypot(...sub(points[(i + 1) % points.length], p)), 0);
    return {points, lengthLdu, plane: {o, a}};
};

/** The stretch a band is chosen for: firmly taut, far from snapping. */
export const BAND_GOOD_STRETCH = 1.4;
/** The band for a path of `lengthLdu`: of those taut round it and not over-stretched, the one stretched nearest BAND_GOOD_STRETCH; or null. */
export const bandFor = lengthLdu => BANDS.filter(b => b.restLdu <= lengthLdu && lengthLdu <= b.restLdu * BAND_MAX_STRETCH)
    .sort((p, q) => Math.abs(lengthLdu / p.restLdu - BAND_GOOD_STRETCH) - Math.abs(lengthLdu / q.restLdu - BAND_GOOD_STRETCH))[0] || null;

/**
 * A rubber band round the parts `ids`: {band, around, points, lengthLdu} or {error, parts?}:
 * 'needTwo', 'notRound', 'notParallel', 'notOnePlane', 'tooClose', 'inside', 'tooShort' (even the
 * smallest band would hang loose), 'tooLong' (the largest would snap).
 * @param {{parts: object[]}} model
 * @param {Map<string, object>} catalogMap
 * @param {string[]} ids
 */
export const beltRound = (model, catalogMap, ids) => {
    if (ids.length < 2) return {error: 'needTwo'};
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const circles = [];
    for (const id of ids) {
        const pl = byId.get(id);
        const c = pl && placedCircle(pl, catalogMap.get(pl.part));
        if (!c) return {error: 'notRound', parts: [id]};
        circles.push(c);
    }
    const path = bandPath(circles);
    if (path.error) return {error: path.error, parts: path.index === undefined ? undefined : [ids[path.index]]};
    const band = bandFor(path.lengthLdu);
    if (!band) return {error: path.lengthLdu < BANDS[0].restLdu ? 'tooShort' : 'tooLong'};
    return {band: band.part, around: ids.slice(), points: path.points, lengthLdu: path.lengthLdu};
};

/** The path of a model's band record (for drawing), or null when its parts no longer make one. */
export const beltPoints = (model, catalogMap, belt) => {
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const circles = belt.around.map(id => byId.get(id)).map(pl => pl && placedCircle(pl, catalogMap.get(pl.part)));
    if (circles.some(c => !c)) return null;
    const path = bandPath(circles);
    return path.error ? null : path.points;
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// What the connector-tooth couplings (kinds/rack.js, kinds/worm.js) read from
// the compiler's graph: the spur gears of the model and the tooth connectors
// of a kind, each in the LDraw model frame (LDU), with the island it is in.
// Pure helpers; no compiler import (the compiler imports the kinds).

import {mat3MulVec3, vecAdd, vecNormalize} from '../mech/vec.js';
import {gearPitchRadius} from '../contracts.js';

/** Spur gears (or the gear `types` given), one per placed part: {partId, islandId, type, centerLdu, axisLdu, r, teeth}. */
export const spurGears = (nodes, islands, types = ['spur']) => {
    const out = [];
    const seen = new Set();
    for (const [nodeId, node] of nodes.entries()) {
        if (seen.has(node.partId)) continue;
        seen.add(node.partId);
        const gear = node.meta && node.meta.gear;
        if (!gear || !types.includes(gear.type)) continue;
        const islandId = islands.nodeToBody.get(nodeId);
        if (!islandId) continue;
        const rot = node.placed.rotation;
        out.push({
            partId: node.partId, islandId, type: gear.type, meshesAs: gear.meshesAs || [], teeth: gear.teeth, r: gearPitchRadius(gear),
            centerLdu: vecAdd(mat3MulVec3(rot, gear.center), node.placed.position),
            axisLdu: vecNormalize(mat3MulVec3(rot, gear.axis))
        });
    }
    return out;
};

/**
 * The connectors of `type` in the model: {partId, islandId, c (the transformed connector:
 * position, axis, length), data (its `data`, with every direction in it rotated into the model
 * frame: keys listed in `directions`)}.
 */
export const toothConnectors = (nodes, islands, type, directions = []) => {
    const out = [];
    for (const [nodeId, node] of nodes.entries()) {
        for (const c of node.connectors) {
            if (c.type !== type) continue;
            const islandId = islands.nodeToBody.get(nodeId);
            if (!islandId) continue;
            const data = {...((c._orig && c._orig.data) || {})};
            for (const k of directions) if (Array.isArray(data[k])) data[k] = vecNormalize(mat3MulVec3(node.placed.rotation, data[k]));
            out.push({partId: node.partId, islandId, c, data});
        }
    }
    return out;
};

/** The same two kinds of thing for a placed part outside the compiler (the editor's overlap rule). */
export const placedSpur = (pl, meta, types = ['spur']) => (meta && meta.gear && types.includes(meta.gear.type) ? {
    partId: pl.id, r: gearPitchRadius(meta.gear), teeth: meta.gear.teeth,
    centerLdu: vecAdd(mat3MulVec3(pl.rotation, meta.gear.center), pl.position),
    axisLdu: vecNormalize(mat3MulVec3(pl.rotation, meta.gear.axis))
} : null);

export const placedTooth = (pl, meta, type, directions = []) => {
    if (!meta || !Array.isArray(meta.connectors)) return [];
    return meta.connectors.filter(c => c.type === type).map(c => {
        const data = {...(c.data || {})};
        for (const k of directions) if (Array.isArray(data[k])) data[k] = vecNormalize(mat3MulVec3(pl.rotation, data[k]));
        return {partId: pl.id, data, c: {position: vecAdd(mat3MulVec3(pl.rotation, c.position), pl.position),
            axis: vecNormalize(mat3MulVec3(pl.rotation, c.axis)), length: c.length}};
    });
};

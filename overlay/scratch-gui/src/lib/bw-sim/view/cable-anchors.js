// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Visual attachments only: official LDraw socket/captive-cable markers, in the
// PART frame. No physics connector, port assignment or bounding-box fallback.
import {Vector3} from 'three';
import {apply, compose, IDENTITY, parseLDraw, refKey, SEARCH_DIRS} from '../ldraw/ldraw-geometry.js';
import {dirToWorld, lduToWorld} from '../contracts.js';

const MARKERS = {
    '23807.dat': {kind: 'socket', point: [0, 0, 0], direction: [0, 0, -1]},
    's/54732bs01.dat': {kind: 'socket', point: [0, -14.5, 0], direction: [0, 0, -1]},
    '54732.dat': {kind: 'socket', point: [0, 10.5, -18], direction: [0, 0, -1]},
    // These subparts explicitly mark integral cable attachment in their headers.
    's/23816s01.dat': {kind: 'cable', point: [0, 0, 0], direction: [0, -1, 0]},
    's/58124s03.dat': {kind: 'cable', point: [0, 0, 0], direction: [0, -1, 0]},
    '993.dat': {kind: 'cable', point: [0, 1, 0], direction: [0, 1, 0]},
    'stugel-2x2.dat': {kind: 'contact', point: [0, -4, 0], direction: [0, -1, 0]},
    'studel.dat': {kind: 'contact', point: [0, -4, 0], direction: [0, -1, 0]}
};
// This older housing draws the six recessed lead sockets as shared faces,
// rather than separate socket subparts (s/32058s01.dat, top-centre faces).
// Its printed A/1 labels are on +x; C/3 are on -x.
const RCX_SOCKETS = {A: [40, 8, 40], B: [0, 8, 40], C: [-40, 8, 40],
    1: [40, 8, -60], 2: [0, 8, -60], 3: [-40, 8, -60]};

// Identify the selected socket by its marker origin, never by traversal order.
// 45601: LEGO's hub photo/LEFT=A,C,E, RIGHT=B,D,F; speaker end is +z.
// City hub A is +x (its sockets face -z); Small Hub/WeDo A is -x (+z).
// BOOST's molded C/D glyphs in 27191.dat are at -x/+x.
// EV3 user guide p9 and NXT user guide p8 distinguish output/input banks.
const HUB_SOCKETS = {
    '45601.dat': {A: [-69, -68, 40], B: [69, -68, 40], C: [-69, -68, 0],
        D: [69, -68, 0], E: [-69, -68, -40], F: [69, -68, -40]},
    '67351.dat': {A: [-40, -68, 49], B: [40, -68, 49]},
    '67351c01.dat': {A: [-40, -68, 49], B: [40, -68, 49]},
    '26910.dat': {C: [-40, 11, 20], D: [40, 11, 20]},
    '28738.dat': {A: [20, 10, -80], B: [-20, 10, -80]},
    '22127.dat': {A: [-50, -40, -60], B: [-50, -40, -20], C: [50, -40, -60], D: [50, -40, -20]},
    '19071.dat': {A: [-20, 11, 80], B: [20, 11, 80]},
    '95646.dat': {A: [-57, 35, 139], B: [-29, 35, 139], C: [-1, 35, 139], D: [27, 35, 139],
        1: [-57, 35, -139], 2: [-19, 35, -139], 3: [19, 35, -139], 4: [57, 35, -139]},
    '53788.dat': {A: [-57, -60, 121], B: [-19, -60, 121], C: [19, -60, 121],
        1: [-57, -60, -121], 2: [-19, -60, -121], 3: [19, -60, -121], 4: [57, -60, -121]},
    '76454c02.dat': RCX_SOCKETS
};

/** Read actual feature placements, including aliases and nested assemblies. */
export const electricalFeatures = (part, read) => {
    const features = [];
    const walk = (name, x, stack) => {
        const key = refKey(name), marker = MARKERS[key];
        if (key === 's/32058s01.dat') {
            for (const point of Object.values(RCX_SOCKETS)) {
                const position = apply(x, point), tip = apply(x, [point[0], point[1] - 1, point[2]]);
                features.push({kind: 'socket', marker: key, origin: position.slice(), position,
                    direction: tip.map((v, i) => v - position[i])});
            }
            return;
        }
        if (marker) {
            const position = apply(x, marker.point), tip = apply(x, marker.point.map((v, i) => v + marker.direction[i]));
            const direction = tip.map((v, i) => v - position[i]);
            const length = Math.hypot(...direction);
            if (length > 1e-9) features.push({kind: marker.kind, marker: key, origin: x.t.slice(),
                position, direction: direction.map(v => v / length)});
            return;
        }
        if (stack.has(key) || stack.size >= 32) return;
        let text, path;
        for (const prefix of SEARCH_DIRS) {
            path = prefix + key; text = read(path);
            if (text !== undefined) break;
        }
        if (text === undefined || path.startsWith('p/')) return;
        const next = new Set(stack); next.add(key);
        for (const ref of parseLDraw(text).refs) walk(ref.file, compose(x, ref.x), next);
    };
    walk(part, IDENTITY, new Set());
    return features;
};

const distance2 = (a, b) => a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
export const hubCableSocket = (part, port, features) => {
    const at = HUB_SOCKETS[refKey(part)]?.[port];
    if (!at) return null;
    return features.find(f => f.kind === 'socket' && distance2(f.origin, at) < 1e-8) || null;
};

export const deviceCableExit = features => {
    const cable = features.find(f => f.kind === 'cable');
    if (cable) return cable;
    const sockets = features.filter(f => f.kind === 'socket');
    if (sockets.length === 1) return sockets[0];
    const contacts = features.filter(f => f.kind === 'contact');
    if (!contacts.length) return null;
    // A detachable 9V lead attaches over the electrical stud group, not at the
    // motor centre. Some older parts draw its four individual contact studs.
    return {kind: 'contact', position: [0, 1, 2].map(i => contacts.reduce((s, f) => s + f.position[i], 0) / contacts.length),
        direction: contacts[0].direction.slice()};
};

/** Separate badge anchors from cables; read each housing's current matrix. */
export const createCableAnchors = ({read, partOf, meshOf}) => {
    const cache = new Map();
    const featuresOf = part => {
        if (!cache.has(part)) cache.set(part, electricalFeatures(part, read));
        return cache.get(part);
    };
    const onPart = (id, endpoint) => {
        const point = new Vector3(...lduToWorld(endpoint.position));
        const direction = new Vector3(...dirToWorld(endpoint.direction));
        return {
            point: () => { const mesh = meshOf(id); return mesh ? mesh.localToWorld(point.clone()) : null; },
            direction: () => { const mesh = meshOf(id); return mesh ? direction.clone().transformDirection(mesh.matrixWorld) : null; }
        };
    };
    return item => {
        const device = partOf(item.id), hub = item.hub && partOf(item.hub);
        if (!item.port || !device || !hub || item.id === item.hub) return {};
        const from = deviceCableExit(featuresOf(device.part));
        const to = hubCableSocket(hub.part, item.port, featuresOf(hub.part));
        if (!from || !to) return {};
        const a = onPart(item.id, from), b = onPart(item.hub, to);
        return {cableAnchor: a.point, cableDirection: a.direction, hubAnchor: b.point, hubDirection: b.direction};
    };
};
